# Complete Backend & DeepSeek Implementation (`BACKEND_COMPLETE.md`)

Copy these exact files to disk without modifying the core logic. They are pre-configured for the DeepSeek API (`https://api.deepseek.com`) and include automatic `./harness` initialization and Git commit handling.

---

## 1. `backend/requirements.txt`
~~~text
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlmodel>=0.0.22
pydantic>=2.9.0
langchain>=0.3.0
langchain-core>=0.3.0
langchain-openai>=0.2.0
langgraph>=0.2.40
deepagents>=0.7.13
langsmith>=0.1.130
gitpython>=3.1.43
python-dotenv>=1.0.1
~~~

---

## 2. `backend/.env.example` (Copy to `backend/.env`)
~~~env
# DeepSeek Configuration (Primary — Low Cost)
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# Optional Fallback Keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional LangSmith Tracing
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=harness-ops
~~~

---

## 3. `backend/app/__init__.py`
~~~python
# HarnessOps Backend Package
~~~

---

## 4. `backend/app/llm.py` (DeepSeek-Optimized LLM Wrapper)
~~~python
import json
import os
import re
from typing import Type, TypeVar
from dotenv import load_dotenv
from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

load_dotenv()

T = TypeVar("T", bound=BaseModel)


def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    """Returns a ChatOpenAI instance pointed at DeepSeek (or OpenAI fallback)."""
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    if deepseek_key:
        return ChatOpenAI(
            model=os.getenv("LLM_MODEL", "deepseek-chat"),
            api_key=deepseek_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            temperature=temperature,
        )
    if openai_key:
        return ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
            api_key=openai_key,
            temperature=temperature,
        )
    raise RuntimeError(
        "Missing API key! Set DEEPSEEK_API_KEY in backend/.env before running."
    )


def invoke_structured(system_prompt: str, user_prompt: str, schema: Type[T]) -> T:
    """
    Bulletproof JSON-mode structured output for DeepSeek.
    Avoids OpenAI-proprietary strict schema errors while guaranteeing Pydantic validation.
    """
    llm = get_llm(temperature=0.0).bind(response_format={"type": "json_object"})
    schema_json = json.dumps(schema.model_json_schema(), indent=2)

    full_system = (
        f"{system_prompt}\n\n"
        f"You MUST respond with valid JSON only, matching this exact JSON schema:\n"
        f"{schema_json}"
    )

    response = llm.invoke(
        [SystemMessage(content=full_system), HumanMessage(content=user_prompt)]
    )
    raw = response.content if isinstance(response.content, str) else str(response.content)
    # Strip markdown fences if present
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE)
    return schema.model_validate_json(cleaned)
~~~

---

## 5. `backend/app/models.py`
~~~python
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ChatMessageRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    thread_id: str = Field(index=True)
    user_id: str = Field(index=True)
    role: str
    content: str
    tool_steps_json: str = Field(default="[]")
    escalated: bool = Field(default=False)
    langsmith_run_id: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class EscalationTicket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str
    question: str
    tentative_answer: str
    uncertainty_reason: str
    status: str = Field(default="PENDING")  # PENDING or RESOLVED
    human_fix: Optional[str] = Field(default=None)
    created_case_path: Optional[str] = Field(default=None)
    git_commit_sha: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)
    resolved_at: Optional[datetime] = Field(default=None)


class EvolutionProposal(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    trace_summary: str
    failure_diagnosis: str
    target_file: str
    original_content: str
    proposed_content: str
    unified_diff: str
    status: str = Field(default="PROPOSED")  # PROPOSED, APPLIED, REJECTED
    git_commit_sha: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now)


class EvalRun(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    git_commit_sha: str
    total_questions: int = Field(default=14)
    passed_count: int
    accuracy_pct: float
    details_json: str = Field(default="[]")
    created_at: datetime = Field(default_factory=utc_now)
~~~

---

## 6. `backend/app/database.py`
~~~python
from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine, select
from app.models import EscalationTicket

DB_PATH = Path(__file__).resolve().parents[1] / "harness_ops.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False}
)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        existing = session.exec(select(EscalationTicket)).first()
        if not existing:
            # Pre-seed 4 baseline tickets so the next live escalation becomes Ticket #5
            seed_tickets = [
                EscalationTicket(
                    user_id="alex",
                    question="Can Archon deploy directly to AWS Lambda without GitHub Actions?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="AWS Lambda direct deployment is not documented in skills.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="omar",
                    question="Does Archon support GitLab self-hosted runners on Free tier?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="GitLab self-hosted tier limits are undocumented.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="nina",
                    question="Why does `archon worktree prune` fail after a Ctrl+C interrupt?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="Worktree lock recovery flags are missing from skills.",
                    status="PENDING",
                ),
                EscalationTicket(
                    user_id="alex",
                    question="Why is my exported STRIPE_TEST_KEY missing inside the workflow step?",
                    tentative_answer="I don't have enough verified context yet to say for sure.",
                    uncertainty_reason="Environment variable sandbox isolation is undocumented.",
                    status="PENDING",
                ),
            ]
            for t in seed_tickets:
                session.add(t)
            session.commit()


def create_escalation_ticket(
    user_id: str, question: str, tentative_answer: str, uncertainty_reason: str
) -> int:
    with Session(engine) as session:
        ticket = EscalationTicket(
            user_id=user_id,
            question=question,
            tentative_answer=tentative_answer,
            uncertainty_reason=uncertainty_reason,
            status="PENDING",
        )
        session.add(ticket)
        session.commit()
        session.refresh(ticket)
        return ticket.id or 0
~~~

---

## 7. `backend/app/git_hub.py` (Auto-Seeds `./harness` & Manages Git Commits)
~~~python
import difflib
from pathlib import Path
from typing import List, Dict, Any
from git import Repo, Actor

HARNESS_ROOT = Path(__file__).resolve().parents[2] / "harness"
GIT_ACTOR = Actor("HarnessOps Engine", "engine@harnessops.local")

INITIAL_FILES: Dict[str, str] = {
    "INSTRUCTIONS.md": """# Archon Support Agent — Core Instructions

You are the official technical support agent for **Archon**, an AI workflow automation CLI and runner.

## Operating Rules
1. **Always Check Context First:** Before answering technical questions, check your loaded memory (`AGENTS.md`), search `/memory/cases/` using `grep_files` or `glob_files` for similar resolved issues, and read relevant skills in `/skills/` using `read_file`.
2. **Personalize Per User:** Maintain user-specific context in `/memory/users/{current_user_id}/AGENTS.md`.
3. **Strict Uncertainty Escalation:** If a user reports a bug, CLI behavior, or edge case that is NOT explicitly documented in your `/skills/`, `/memory/AGENTS.md`, or `/memory/cases/`, **DO NOT guess or fabricate workarounds**.
   - State clearly in your response: `"I don't have enough yet to say for sure."`
   - Provide a brief cautious hypothesis.
   - Immediately call the `escalate_to_human` tool so the engineering team can verify and teach you the fix.
""",
    "skills/archon-workflow-runner/SKILL.md": """---
name: archon-workflow-runner
description: How Archon initializes repositories, executes workflows, and opens pull requests.
---

# Archon Workflow Runner Guide

## Overview
Archon executes automated coding workflows defined in `.archon/commands/` and opens GitHub Pull Requests when checks pass.

## Core Commands
- `archon init`: Initializes the `.archon/` configuration directory in the repository root.
- `archon workflow run <name>`: Executes a custom workflow markdown file stored in `.archon/commands/`.
- **PR Creation:** When a workflow run passes all checks, Archon automatically opens a GitHub Pull Request with the changes.
""",
    "skills/workflow-debugging/SKILL.md": """---
name: workflow-debugging
description: Basic troubleshooting steps for Archon CLI logs and status checks.
---

# Archon Workflow Debugging

## Checking Logs
- Run `archon logs --tail` to inspect the latest workflow output.
""",
    "skills/billing-and-tiers/SKILL.md": """---
name: billing-and-tiers
description: Archon subscription tiers and concurrency quotas.
---

# Archon Billing & Tiers
- **Starter Tier:** Up to 2 concurrent workflow runs.
- **Pro Tier:** Up to 10 concurrent workflow runs.
""",
    "memory/AGENTS.md": """# Archon Global Learned Rules

## Core System Knowledge
- Archon configurations live in `.archon/` at the repository root.

## Learned Production Rules
<!-- Loop 1 Memory Synthesizer appends verified production lessons below -->
""",
    "memory/users/nina/AGENTS.md": """# User Profile & Memory: Nina (`nina`)
- Role: Senior Backend Engineer
- Workflow setup: Uses custom `.archon/commands/plan.md` workflows locally.
""",
    "memory/users/omar/AGENTS.md": """# User Profile & Memory: Omar (`omar`)
- Role: Full-Stack Developer
- Workflow setup: Runs automated PR pipelines via `archon workflow run`.
""",
    "memory/users/alex/AGENTS.md": """# User Profile & Memory: Alex (`alex`)
- Role: DevOps Engineer
- Workflow setup: Manages monorepo CI pipelines.
""",
}


def ensure_harness_initialized() -> Repo:
    HARNESS_ROOT.mkdir(parents=True, exist_ok=True)
    (HARNESS_ROOT / "memory" / "cases").mkdir(parents=True, exist_ok=True)

    for rel_path, content in INITIAL_FILES.items():
        full_path = HARNESS_ROOT / rel_path
        if not full_path.exists():
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding="utf-8")

    git_dir = HARNESS_ROOT / ".git"
    if not git_dir.exists():
        repo = Repo.init(HARNESS_ROOT)
        repo.git.add(A=True)
        repo.index.commit(
            "v0: Initial baseline harness", author=GIT_ACTOR, committer=GIT_ACTOR
        )
    else:
        repo = Repo(HARNESS_ROOT)
        if not repo.head.is_valid():
            repo.git.add(A=True)
            repo.index.commit(
                "v0: Initial baseline harness", author=GIT_ACTOR, committer=GIT_ACTOR
            )
    return repo


def commit_changes(message: str) -> str:
    repo = ensure_harness_initialized()
    repo.git.add(A=True)
    if repo.is_dirty(untracked_files=True):
        commit = repo.index.commit(message, author=GIT_ACTOR, committer=GIT_ACTOR)
        return commit.hexsha[:7]
    return repo.head.commit.hexsha[:7]


def get_current_sha() -> str:
    repo = ensure_harness_initialized()
    return repo.head.commit.hexsha[:7]


def list_harness_files() -> List[Dict[str, Any]]:
    ensure_harness_initialized()
    results = []
    for p in sorted(HARNESS_ROOT.rglob("*.md")):
        if ".git" in p.parts:
            continue
        rel = "/" + p.relative_to(HARNESS_ROOT).as_posix()
        stat = p.stat()
        results.append(
            {
                "path": rel,
                "size": stat.st_size,
                "last_modified": stat.st_mtime,
                "content": p.read_text(encoding="utf-8"),
            }
        )
    return results


def list_commits(limit: int = 20) -> List[Dict[str, Any]]:
    repo = ensure_harness_initialized()
    commits = []
    for c in repo.iter_commits(max_count=limit):
        diff_text = ""
        if c.parents:
            diff_text = repo.git.diff(c.parents[0].hexsha, c.hexsha)
        commits.append(
            {
                "sha": c.hexsha[:7],
                "full_sha": c.hexsha,
                "message": c.message.strip(),
                "author": c.author.name,
                "timestamp": c.committed_datetime.isoformat(),
                "diff": diff_text,
            }
        )
    return commits


def rollback_to_commit(commit_sha: str) -> str:
    repo = ensure_harness_initialized()
    repo.git.reset("--hard", commit_sha)
    return repo.head.commit.hexsha[:7]


def compute_unified_diff(target_file: str, old_text: str, new_text: str) -> str:
    diff_lines = difflib.unified_diff(
        old_text.splitlines(),
        new_text.splitlines(),
        fromfile=f"a/{target_file}",
        tofile=f"b/{target_file}",
        lineterm="",
    )
    return "\n".join(diff_lines)
~~~

---

## 8. `backend/app/agent.py` (Markdown Harness + Per-User Privacy Guardrails)
~~~python
import fnmatch
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
    norm = "/" + virtual_path.lstrip("/")
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
        (["write"], "/**", False),
    ]
    for ops, pattern, allow in rules:
        if operation in ops and (
            fnmatch.fnmatch(norm, pattern) or norm == pattern.rstrip("/*")
        ):
            return allow
    return operation == "read"


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
~~~

---

## 9. `backend/app/memory_synthesizer.py` (Loop 1: Inbox Fix -> Case & `AGENTS.md`)
~~~python
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from sqlmodel import Session
from app.database import engine
from app.models import EscalationTicket
from app.llm import invoke_structured
from app.git_hub import HARNESS_ROOT, commit_changes


class LearnedLessonOutput(BaseModel):
    case_slug: str = Field(
        description="Lowercase hyphenated slug, max 35 chars, e.g. archon-worktree-origin-main"
    )
    case_title: str = Field(description="Short descriptive title of the case")
    root_cause: str = Field(description="Clear explanation of the technical root cause")
    global_rule_bullet: str = Field(
        description="Concise 1-2 sentence reusable rule to append to /memory/AGENTS.md so the agent solves similar questions for any user"
    )
    user_memory_note: str = Field(
        description="Short note about this user's issue/setup for their private AGENTS.md"
    )


def resolve_ticket_and_learn(ticket_id: int, human_fix: str) -> dict:
    with Session(engine) as session:
        ticket = session.get(EscalationTicket, ticket_id)
        if not ticket:
            raise ValueError(f"Ticket #{ticket_id} not found")

        lesson = invoke_structured(
            system_prompt=(
                "You are a Harness Engineering Memory Synthesizer. "
                "Convert a human engineer's confirmed support fix into a reusable case study, "
                "a global rule for /memory/AGENTS.md, and a private user note."
            ),
            user_prompt=(
                f"User ID: {ticket.user_id}\n"
                f"User Question: {ticket.question}\n"
                f"Agent Tentative Answer: {ticket.tentative_answer}\n"
                f"Human Confirmed Fix: {human_fix}\n"
            ),
            schema=LearnedLessonOutput,
        )

        iso_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        case_filename = f"case-{ticket_id:03d}-{lesson.case_slug}.md"
        case_rel_path = f"/memory/cases/{case_filename}"
        case_full_path = HARNESS_ROOT / "memory" / "cases" / case_filename

        case_md = (
            f"# Case #{ticket_id}: {lesson.case_title}\n"
            f"- **Date:** {iso_date}\n"
            f"- **Reported By:** `{ticket.user_id}`\n"
            f"- **Symptom:** {ticket.question}\n"
            f"- **Root Cause:** {lesson.root_cause}\n"
            f"- **Verified Resolution:** {human_fix}\n"
        )
        case_full_path.parent.mkdir(parents=True, exist_ok=True)
        case_full_path.write_text(case_md, encoding="utf-8")

        # Update Global /memory/AGENTS.md
        global_agents_path = HARNESS_ROOT / "memory" / "AGENTS.md"
        global_text = global_agents_path.read_text(encoding="utf-8")
        new_bullet = f"- **[{lesson.case_title}]({case_rel_path}):** {lesson.global_rule_bullet}"
        if new_bullet not in global_text:
            global_agents_path.write_text(
                global_text.rstrip() + f"\n{new_bullet}\n", encoding="utf-8"
            )

        # Update Private /memory/users/{user_id}/AGENTS.md
        user_agents_path = HARNESS_ROOT / "memory" / "users" / ticket.user_id / "AGENTS.md"
        user_agents_path.parent.mkdir(parents=True, exist_ok=True)
        user_text = user_agents_path.read_text(encoding="utf-8") if user_agents_path.exists() else f"# User Profile: {ticket.user_id}\n"
        user_agents_path.write_text(
            user_text.rstrip() + f"\n- {lesson.user_memory_note}\n", encoding="utf-8"
        )

        sha = commit_changes(f"Loop 1: Learned case #{ticket_id} ({lesson.case_slug})")

        ticket.status = "RESOLVED"
        ticket.human_fix = human_fix
        ticket.created_case_path = case_rel_path
        ticket.git_commit_sha = sha
        ticket.resolved_at = datetime.now(timezone.utc)
        session.add(ticket)
        session.commit()

        return {
            "status": "RESOLVED",
            "ticket_id": ticket_id,
            "created_case_path": case_rel_path,
            "global_rule_added": lesson.global_rule_bullet,
            "updated_files": [
                case_rel_path,
                "/memory/AGENTS.md",
                f"/memory/users/{ticket.user_id}/AGENTS.md",
            ],
            "git_commit_sha": sha,
        }
~~~

---

## 10. `backend/app/evolution_engine.py` (Loop 2: Trace Analysis -> Markdown Diff PRs)
~~~python
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from app.database import engine
from app.models import EscalationTicket, EvolutionProposal
from app.llm import invoke_structured
from app.git_hub import HARNESS_ROOT, compute_unified_diff, commit_changes


class HarnessPatchOutput(BaseModel):
    target_file: str = Field(
        description="Relative file path inside ./harness to update, e.g. 'skills/archon-workflow-runner/SKILL.md' or 'INSTRUCTIONS.md'"
    )
    failure_diagnosis: str = Field(
        description="Detailed explanation of what was missing in the harness that caused the agent to struggle or escalate"
    )
    proposed_full_content: str = Field(
        description="The complete updated Markdown content for target_file with concise, high-signal additions"
    )


def analyze_traces_and_propose() -> EvolutionProposal:
    with Session(engine) as session:
        tickets = session.exec(select(EscalationTicket)).all()
        trace_lines = [
            f"- Ticket #{t.id} ({t.status}): Q='{t.question}' | Reason='{t.uncertainty_reason}' | Fix='{t.human_fix or 'Unresolved'}'"
            for t in tickets[-8:]
        ]
        trace_summary = "\n".join(trace_lines)

        instructions_text = (HARNESS_ROOT / "INSTRUCTIONS.md").read_text(encoding="utf-8")
        runner_skill_path = "skills/archon-workflow-runner/SKILL.md"
        runner_skill_text = (HARNESS_ROOT / runner_skill_path).read_text(encoding="utf-8")

        patch = invoke_structured(
            system_prompt=(
                "You are the Loop 2 Harness Evolution Engine (like LangSmith Insights Engine). "
                "Survey recent production escalations/traces and propose a clean, concise update to "
                "either 'skills/archon-workflow-runner/SKILL.md' or 'INSTRUCTIONS.md' so the agent "
                "natively handles worktree origin/main behavior, .archon/.env sandbox isolation, "
                "--workspace-root in monorepos, and `archon worktree prune --force` without needing to escalate."
            ),
            user_prompt=(
                f"## Recent Production Escalation Traces\n{trace_summary}\n\n"
                f"## Current INSTRUCTIONS.md\n{instructions_text}\n\n"
                f"## Current {runner_skill_path}\n{runner_skill_text}\n"
            ),
            schema=HarnessPatchOutput,
        )

        target_clean = patch.target_file.lstrip("/")
        target_full = HARNESS_ROOT / target_clean
        if not target_full.exists():
            target_clean = runner_skill_path
            target_full = HARNESS_ROOT / target_clean

        original_text = target_full.read_text(encoding="utf-8")
        diff_text = compute_unified_diff(
            target_clean, original_text, patch.proposed_full_content
        )

        proposal = EvolutionProposal(
            trace_summary=trace_summary,
            failure_diagnosis=patch.failure_diagnosis,
            target_file=target_clean,
            original_content=original_text,
            proposed_content=patch.proposed_full_content,
            unified_diff=diff_text,
            status="PROPOSED",
        )
        session.add(proposal)
        session.commit()
        session.refresh(proposal)
        return proposal


def apply_evolution_proposal(proposal_id: int) -> dict:
    with Session(engine) as session:
        proposal = session.get(EvolutionProposal, proposal_id)
        if not proposal:
            raise ValueError(f"Proposal #{proposal_id} not found")

        target_full = HARNESS_ROOT / proposal.target_file.lstrip("/")
        target_full.parent.mkdir(parents=True, exist_ok=True)
        target_full.write_text(proposal.proposed_content, encoding="utf-8")

        sha = commit_changes(
            f"Loop 2 Evolution: Updated {proposal.target_file} (Proposal #{proposal.id})"
        )
        proposal.status = "APPLIED"
        proposal.git_commit_sha = sha
        session.add(proposal)
        session.commit()

        return {
            "status": "APPLIED",
            "proposal_id": proposal.id,
            "target_file": proposal.target_file,
            "git_commit_sha": sha,
        }
~~~

---

## 11. `backend/app/eval_runner.py` (14-Question Benchmark Suite)
~~~python
import json
from pathlib import Path
from pydantic import BaseModel, Field
from sqlmodel import Session
from app.database import engine
from app.models import EvalRun
from app.agent import run_support_agent
from app.llm import invoke_structured
from app.git_hub import get_current_sha

DATASET_PATH = Path(__file__).resolve().parents[1] / "eval_dataset.json"


class GradeResult(BaseModel):
    passed: bool = Field(
        description="True ONLY if the agent's answer provides the specific technical solution in ground_truth without saying it lacks context."
    )
    rationale: str = Field(description="1-sentence explanation of why it passed or failed")


def run_eval_benchmark() -> EvalRun:
    questions = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    details = []
    passed_count = 0

    for item in questions:
        agent_out = run_support_agent(
            user_id=item["user_id"], question=item["question"]
        )
        grade = invoke_structured(
            system_prompt=(
                "You are a strict technical evaluator grading an AI support agent against a ground-truth answer. "
                "If the agent says it doesn't have enough context or escalates without giving the exact fix, mark passed=false."
            ),
            user_prompt=(
                f"Question: {item['question']}\n"
                f"Ground Truth Fix: {item['ground_truth']}\n"
                f"Agent Answer: {agent_out['reply']}\n"
                f"Agent Escalated: {agent_out['escalated']}\n"
            ),
            schema=GradeResult,
        )
        if grade.passed:
            passed_count += 1
        details.append(
            {
                "id": item["id"],
                "category": item["category"],
                "user_id": item["user_id"],
                "question": item["question"],
                "agent_answer": agent_out["reply"],
                "escalated": agent_out["escalated"],
                "passed": grade.passed,
                "rationale": grade.rationale,
            }
        )

    total = len(questions)
    accuracy = round((passed_count / total) * 100, 1) if total else 0.0

    with Session(engine) as session:
        run_record = EvalRun(
            git_commit_sha=get_current_sha(),
            total_questions=total,
            passed_count=passed_count,
            accuracy_pct=accuracy,
            details_json=json.dumps(details),
        )
        session.add(run_record)
        session.commit()
        session.refresh(run_record)
        return run_record
~~~

---

## 12. `backend/app/main.py` (FastAPI Entry Point)
~~~python
import json
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import ChatMessageRecord, EscalationTicket, EvolutionProposal, EvalRun
from app.git_hub import (
    ensure_harness_initialized,
    list_harness_files,
    list_commits,
    rollback_to_commit,
)
from app.agent import run_support_agent
from app.memory_synthesizer import resolve_ticket_and_learn
from app.evolution_engine import analyze_traces_and_propose, apply_evolution_proposal
from app.eval_runner import run_eval_benchmark

app = FastAPI(title="HarnessOps API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    ensure_harness_initialized()
    init_db()


class ChatRequest(BaseModel):
    user_id: str = "nina"
    thread_id: Optional[str] = "default"
    message: str


class ResolveRequest(BaseModel):
    human_fix: str


@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    result = run_support_agent(user_id=req.user_id, question=req.message)
    with Session(engine) as session:
        session.add(
            ChatMessageRecord(
                thread_id=req.thread_id or f"thread-{req.user_id}",
                user_id=req.user_id,
                role="user",
                content=req.message,
            )
        )
        session.add(
            ChatMessageRecord(
                thread_id=req.thread_id or f"thread-{req.user_id}",
                user_id=req.user_id,
                role="assistant",
                content=result["reply"],
                tool_steps_json=json.dumps(result["tool_steps"]),
                escalated=result["escalated"],
            )
        )
        session.commit()
    return result


@app.get("/api/inbox")
def get_inbox():
    with Session(engine) as session:
        tickets = session.exec(
            select(EscalationTicket).order_by(EscalationTicket.id.desc())
        ).all()
        pending_count = sum(1 for t in tickets if t.status == "PENDING")
        return {"pending_count": pending_count, "tickets": tickets}


@app.post("/api/inbox/{ticket_id}/resolve")
def resolve_inbox_ticket(ticket_id: int, req: ResolveRequest):
    try:
        return resolve_ticket_and_learn(ticket_id=ticket_id, human_fix=req.human_fix)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/harness/files")
def get_harness_files():
    return {"files": list_harness_files()}


@app.get("/api/harness/commits")
def get_harness_commits():
    return {"commits": list_commits()}


@app.post("/api/harness/rollback/{commit_sha}")
def rollback_harness(commit_sha: str):
    new_sha = rollback_to_commit(commit_sha)
    return {"status": "ROLLED_BACK", "active_sha": new_sha}


@app.get("/api/evolution/proposals")
def get_proposals():
    with Session(engine) as session:
        proposals = session.exec(
            select(EvolutionProposal).order_by(EvolutionProposal.id.desc())
        ).all()
        return {"proposals": proposals}


@app.post("/api/evolution/analyze")
def trigger_evolution_analysis():
    proposal = analyze_traces_and_propose()
    return proposal


@app.post("/api/evolution/apply/{proposal_id}")
def apply_proposal(proposal_id: int):
    try:
        return apply_evolution_proposal(proposal_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/evals/runs")
def get_eval_runs():
    with Session(engine) as session:
        runs = session.exec(select(EvalRun).order_by(EvalRun.id.asc())).all()
        return {"runs": runs}


@app.post("/api/evals/run")
def trigger_eval_run():
    run_record = run_eval_benchmark()
    return run_record
~~~
