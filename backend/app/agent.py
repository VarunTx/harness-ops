import fnmatch
import posixpath
from typing import Dict, Any, List
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage
from app.llm import get_llm
from app.database import create_escalation_ticket
from app.git_hub import HARNESS_ROOT, ensure_harness_initialized


def _check_permission(user_id: str, virtual_path: str, operation: str) -> bool:
    """
    Enforces strict FilesystemPermission rules:
    1. Allow read/write to /memory/users/{user_id}/**
    2. Deny read/write to /memory/users/** (blocks cross-user memory leakage)
    3. Allow read to /skills/**, /memory/AGENTS.md, /memory/cases/**
    4. Deny all other writes
    """
    # Normalize first so `..` segments cannot satisfy another user's allow rule
    # (e.g. /memory/users/nina/../omar/AGENTS.md).
    norm = "/" + posixpath.normpath("/" + virtual_path.lstrip("/")).lstrip("/")
    if norm == "/.." or norm.startswith("/../"):
        return False
    rules = [
        (["read", "write"], f"/memory/users/{user_id}/*", True),
        (["read", "write"], f"/memory/users/{user_id}/**", True),
        (["read", "write"], "/memory/users/*", False),
        (["read", "write"], "/memory/users/**", False),
        (["read"], "/skills/*", True),
        (["read"], "/skills/**", True),
        (["read"], "/memory/AGENTS.md", True),
        (["read"], "/memory/cases/*", True),
        (["read"], "/memory/cases/**", True),
        (["read"], "/INSTRUCTIONS.md", True),
        (["write"], "/**", False),
    ]
    for ops, pattern, allow in rules:
        if operation in ops and (
            fnmatch.fnmatch(norm, pattern) or norm == pattern.rstrip("/*")
        ):
            return allow
    # Deny by default: only the explicit rules above grant access.
    return False


def _load_skill_summaries() -> str:
    """Progressive skill disclosure: loads only YAML frontmatter at startup."""
    skills_dir = HARNESS_ROOT / "skills"
    summaries = []
    if skills_dir.exists():
        for skill_md in sorted(skills_dir.rglob("SKILL.md")):
            rel = "/" + skill_md.relative_to(HARNESS_ROOT).as_posix()
            text = skill_md.read_text(encoding="utf-8")
            name, desc = skill_md.parent.name, ""
            if text.startswith("---"):
                parts = text.split("---", 2)
                if len(parts) >= 3:
                    for line in parts[1].splitlines():
                        if line.startswith("name:"):
                            name = line.split(":", 1)[1].strip()
                        elif line.startswith("description:"):
                            desc = line.split(":", 1)[1].strip()
            summaries.append(f"- `{rel}` ({name}): {desc}")
    return "\n".join(summaries)


def run_support_agent(user_id: str, question: str) -> Dict[str, Any]:
    """
    Runs the Markdown-driven Deep Agent with progressive skill disclosure,
    injected AGENTS.md memories, per-user path guardrails, and escalation tool.
    """
    ensure_harness_initialized()
    instructions = (HARNESS_ROOT / "INSTRUCTIONS.md").read_text(encoding="utf-8")
    global_memory = (HARNESS_ROOT / "memory" / "AGENTS.md").read_text(encoding="utf-8")

    user_mem_path = HARNESS_ROOT / "memory" / "users" / user_id / "AGENTS.md"
    user_mem_path.parent.mkdir(parents=True, exist_ok=True)
    if not user_mem_path.exists():
        user_mem_path.write_text(f"# User Profile: {user_id}\n", encoding="utf-8")
    user_memory = user_mem_path.read_text(encoding="utf-8")

    tool_steps: List[Dict[str, str]] = [
        {"tool": "memory_load", "input": "/memory/AGENTS.md"},
        {"tool": "memory_load", "input": f"/memory/users/{user_id}/AGENTS.md"},
    ]
    escalation_state = {"escalated": False, "ticket_id": None}

    @tool
    def glob_files(pattern: str = "/memory/cases/*.md") -> str:
        """List files in the harness matching a glob pattern (e.g., '/memory/cases/*.md' or '/skills/*/SKILL.md')."""
        tool_steps.append({"tool": "glob", "input": pattern})
        rel_pattern = pattern.lstrip("/")
        if ".." in rel_pattern.split("/"):
            return "PERMISSION_DENIED: '..' segments are not allowed in glob patterns."
        matches = []
        for p in sorted(HARNESS_ROOT.glob(rel_pattern)):
            vpath = "/" + p.relative_to(HARNESS_ROOT).as_posix()
            if _check_permission(user_id, vpath, "read"):
                matches.append(vpath)
        return "\n".join(matches) if matches else "No matching files found."

    @tool
    def read_file(path: str) -> str:
        """Read a Markdown skill, resolved case, or allowed user memory file from the harness (e.g., '/skills/archon-workflow-runner/SKILL.md')."""
        tool_steps.append({"tool": "read_file", "input": path})
        if not _check_permission(user_id, path, "read"):
            return f"PERMISSION_DENIED: Access to '{path}' is blocked by per-user privacy guardrails."
        full_path = (HARNESS_ROOT / path.lstrip("/")).resolve()
        if not str(full_path).startswith(str(HARNESS_ROOT.resolve())) or not full_path.is_file():
            return f"File not found: {path}"
        return full_path.read_text(encoding="utf-8")

    @tool
    def update_user_memory(note: str) -> str:
        """Append a concise note to the active user's private memory file (/memory/users/{user_id}/AGENTS.md)."""
        vpath = f"/memory/users/{user_id}/AGENTS.md"
        tool_steps.append({"tool": "write_file", "input": vpath})
        if not _check_permission(user_id, vpath, "write"):
            return "PERMISSION_DENIED"
        current = user_mem_path.read_text(encoding="utf-8")
        if note not in current:
            user_mem_path.write_text(current.rstrip() + f"\n- {note}\n", encoding="utf-8")
        return f"Updated {vpath}"

    @tool
    def escalate_to_human(tentative_answer: str, uncertainty_reason: str) -> str:
        """Call this tool whenever the answer is not explicitly verified in your skills, global memory, or resolved cases."""
        ticket_id = create_escalation_ticket(
            user_id=user_id,
            question=question,
            tentative_answer=tentative_answer,
            uncertainty_reason=uncertainty_reason,
        )
        escalation_state["escalated"] = True
        escalation_state["ticket_id"] = ticket_id
        tool_steps.append(
            {"tool": "escalate_to_human", "input": f"Ticket #{ticket_id}: {uncertainty_reason}"}
        )
        return f"Escalated to Team Inbox as Ticket #{ticket_id}."

    tools = [glob_files, read_file, update_user_memory, escalate_to_human]
    tools_by_name = {t.name: t for t in tools}

    system_text = (
        f"{instructions}\n\n"
        f"## Active User ID\n`{user_id}`\n\n"
        f"## Available Skills (Read on demand with `read_file`)\n{_load_skill_summaries()}\n\n"
        f"## Loaded Global Memory (`/memory/AGENTS.md`)\n{global_memory}\n\n"
        f"## Loaded Private User Memory (`/memory/users/{user_id}/AGENTS.md`)\n{user_memory}\n"
    )

    llm_with_tools = get_llm(temperature=0.0).bind_tools(tools)
    messages = [SystemMessage(content=system_text), HumanMessage(content=question)]

    # Execute up to 6 tool-calling reasoning steps
    for _ in range(6):
        ai_msg = llm_with_tools.invoke(messages)
        messages.append(ai_msg)
        if not getattr(ai_msg, "tool_calls", None):
            break
        for tc in ai_msg.tool_calls:
            t_name = tc["name"]
            t_args = tc.get("args", {})
            if t_name in tools_by_name:
                obs = tools_by_name[t_name].invoke(t_args)
            else:
                obs = f"Unknown tool: {t_name}"
            messages.append(ToolMessage(content=str(obs), tool_call_id=tc["id"]))

    final_reply = messages[-1].content if isinstance(messages[-1].content, str) else str(messages[-1].content)
    return {
        "reply": final_reply,
        "escalated": escalation_state["escalated"],
        "ticket_id": escalation_state["ticket_id"],
        "tool_steps": tool_steps,
    }
