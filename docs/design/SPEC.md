# Technical Specification (`SPEC.md`): HarnessOps

## 1. Architecture & Runtime Overview

HarnessOps separates **Agent Orchestration Plumbing** (Python/FastAPI) from the **Agent Harness** (a version-controlled Git directory of Markdown files mounted at `./harness`).

### 1.1. Core Dependencies (`backend/requirements.txt`)
~~~text
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
sqlmodel>=0.0.22
pydantic>=2.9.0
deepagents>=0.7.13
langchain>=0.3.0
langgraph>=0.2.40
langsmith>=0.1.130
gitpython>=3.1.43
python-dotenv>=1.0.1
~~~

---

## 2. Harness Filesystem & Markdown Contracts (`./harness`)

The `./harness` folder is initialized as a local Git repository (`git init`) on backend startup if `.git` does not exist. All paths inside `deepagents` use POSIX conventions relative to `./harness` via `FilesystemBackend(root_dir=..., virtual_mode=True)`.

### 2.1. `./harness/INSTRUCTIONS.md` (v0 Baseline)
~~~markdown
# Archon Support Agent — Core Instructions

You are the official technical support agent for **Archon**, an AI workflow automation CLI and runner.

## Operating Rules
1. **Always Check Context First:** Before answering technical questions, check your loaded memory (`AGENTS.md`), search `/memory/cases/` using `grep` or `glob` for similar resolved issues, and read relevant skills in `/skills/`.
2. **Personalize Per User:** Maintain user-specific context in `/memory/users/{current_user_id}/AGENTS.md`.
3. **Strict Uncertainty Escalation:** If a user reports a bug, CLI behavior, or edge case that is NOT explicitly documented in your `/skills/`, `/memory/AGENTS.md`, or `/memory/cases/`, **DO NOT guess or fabricate workarounds**.
   - State clearly in your response: `"I don't have enough verified context yet to say for sure."`
   - Provide your best cautious hypothesis.
   - Immediately call the `escalate_to_human` tool so the engineering team can verify and teach you the fix.
~~~

### 2.2. Skill File Format (`./harness/skills/<skill-name>/SKILL.md`)
Skills follow the Agent Skills specification with required YAML frontmatter (`name` and `description`) for progressive disclosure by `SkillsMiddleware`:
~~~markdown
---
name: archon-workflow-runner
description: How Archon executes workflows, manages local configuration files, and opens pull requests.
---

# Archon Workflow Runner Guide

## Overview
Archon executes automated coding workflows defined in `.archon/commands/` and opens GitHub Pull Requests when checks pass.

## Known Commands
- `archon workflow run <name>`: Triggers a workflow run.
- `archon init`: Initializes `.archon/` in the repository root.
~~~
*(Note: Intentionally omit how Archon creates Git worktrees from `origin/main` in v0 so Nina's question triggers Loop 1 escalation.)*

### 2.3. Case File Format (`./harness/memory/cases/case-{id}-{slug}.md`)
Created automatically when a human resolves an escalation ticket in Loop 1:
~~~markdown
# Case #{id}: {title}
- **Date:** {iso_date}
- **Reported By:** {user_id}
- **Symptom:** {user_question}
- **Root Cause:** {extracted_root_cause}
- **Verified Resolution:** {human_confirmed_fix}
~~~

---

## 3. Agent Definition & Guardrails (`backend/app/agent.py`)

Use LangChain's `deepagents` SDK (`create_deep_agent`, `FilesystemBackend`, `FilesystemPermission`). Rules in `permissions` are evaluated in declaration order (first match wins).

~~~python
from pathlib import Path
from langchain_core.tools import tool
from deepagents import create_deep_agent, FilesystemPermission
from deepagents.backends import FilesystemBackend
from app.database import create_escalation_ticket

HARNESS_ROOT = Path(__file__).resolve().parents[2] / "harness"

def build_support_agent(user_id: str, model_name: str = "anthropic:claude-sonnet-4-6"):
    instructions = (HARNESS_ROOT / "INSTRUCTIONS.md").read_text(encoding="utf-8")
    backend = FilesystemBackend(root_dir=str(HARNESS_ROOT), virtual_mode=True)

    @tool
    def escalate_to_human(question: str, tentative_answer: str, uncertainty_reason: str) -> str:
        """Escalate an uncertain answer or undocumented issue to the human engineering inbox."""
        ticket_id = create_escalation_ticket(
            user_id=user_id,
            question=question,
            tentative_answer=tentative_answer,
            uncertainty_reason=uncertainty_reason,
        )
        return f"Escalated to Team Inbox as Ticket #{ticket_id}."

    return create_deep_agent(
        model=model_name,
        system_prompt=f"{instructions}\n\nActive User ID: `{user_id}`",
        backend=backend,
        skills=["/skills/"],
        memory=[
            "/memory/AGENTS.md",
            f"/memory/users/{user_id}/AGENTS.md",
        ],
        tools=[escalate_to_human],
        permissions=[
            # 1. Allow agent to read/write ONLY the active user's private memory folder
            FilesystemPermission(
                operations=["read", "write"],
                paths=[f"/memory/users/{user_id}/**"],
                mode="allow",
            ),
            # 2. Strictly block reading or writing any other user's memory folder
            FilesystemPermission(
                operations=["read", "write"],
                paths=["/memory/users/**"],
                mode="deny",
            ),
            # 3. Allow read-only access to shared skills, global AGENTS.md, and resolved cases
            FilesystemPermission(
                operations=["read"],
                paths=["/skills/**", "/memory/AGENTS.md", "/memory/cases/**"],
                mode="allow",
            ),
            # 4. Deny all other writes (agent cannot mutate INSTRUCTIONS.md or shared skills directly)
            FilesystemPermission(
                operations=["write"],
                paths=["/**"],
                mode="deny",
            ),
        ],
    )
~~~

---

## 4. Database Schema (`backend/app/models.py`)

Use `SQLModel` with SQLite (`sqlite:///./harness_ops.db`).

### 4.1. `ChatMessageRecord`
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `int` (PK) | Auto-increment ID |
| `thread_id` | `str` (Index) | Conversation thread identifier |
| `user_id` | `str` (Index) | Mock user (`nina`, `omar`, `alex`) |
| `role` | `str` | `"user"` or `"assistant"` |
| `content` | `str` | Message Markdown text |
| `tool_steps_json` | `str` | JSON array of tool calls made during turn (`ls`, `read_file`, `grep`, `escalate_to_human`) |
| `escalated` | `bool` | `True` if `escalate_to_human` was called during this turn |
| `langsmith_run_id` | `Optional[str]` | LangSmith trace/run ID for inspection |
| `created_at` | `datetime` | UTC timestamp |

### 4.2. `EscalationTicket` (Loop 1 Queue)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `int` (PK) | Ticket number shown in Team Inbox badge |
| `user_id` | `str` | User who asked the question (`nina`, `omar`, etc.) |
| `question` | `str` | Original user prompt |
| `tentative_answer` | `str` | Agent's initial low-confidence response |
| `uncertainty_reason` | `str` | Why the agent flagged uncertainty |
| `status` | `str` | `"PENDING"` or `"RESOLVED"` |
| `human_fix` | `Optional[str]` | Confirmed solution submitted by human engineer |
| `created_case_path` | `Optional[str]` | e.g., `/memory/cases/case-005-worktree-origin-main.md` |
| `git_commit_sha` | `Optional[str]` | Git commit hash created in `./harness` |
| `created_at` | `datetime` | UTC timestamp |
| `resolved_at` | `Optional[datetime]` | UTC timestamp when resolved |

### 4.3. `EvolutionProposal` (Loop 2 Queue)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `int` (PK) | Proposal ID |
| `trace_summary` | `str` | Summary of the failure trace(s) analyzed |
| `failure_diagnosis` | `str` | Root-cause analysis of why the harness failed |
| `target_file` | `str` | Relative path in `./harness` (e.g., `INSTRUCTIONS.md` or `skills/archon-workflow-runner/SKILL.md`) |
| `original_content` | `str` | File content at time of analysis |
| `proposed_content` | `str` | Updated file content |
| `unified_diff` | `str` | Standard `difflib.unified_diff` output for UI rendering |
| `status` | `str` | `"PROPOSED"`, `"APPLIED"`, or `"REJECTED"` |
| `git_commit_sha` | `Optional[str]` | Commit SHA when applied |
| `created_at` | `datetime` | UTC timestamp |

### 4.4. `EvalRun` (Benchmark Scoreboard)
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `int` (PK) | Benchmark run number |
| `git_commit_sha` | `str` | Harness commit SHA tested |
| `total_questions` | `int` | `14` |
| `passed_count` | `int` | Number of questions graded correct |
| `accuracy_pct` | `float` | `0.0` to `100.0` |
| `details_json` | `str` | Per-question breakdown (`question_id`, `passed`, `agent_answer`, `grader_rationale`) |
| `created_at` | `datetime` | UTC timestamp |

---

## 5. LLM Synthesizer Contracts (Loops 1 & 2)

### 5.1. Loop 1: `MemorySynthesizer` (`backend/app/memory_synthesizer.py`)
When `POST /api/inbox/{ticket_id}/resolve` is called with `{"human_fix": "..."}`:
1. Use `model.with_structured_output(LearnedLessonOutput)` with schema:
   ~~~python
   class LearnedLessonOutput(BaseModel):
       case_slug: str = Field(description="Lowercase hyphenated slug, max 40 chars")
       case_title: str
       root_cause: str
       case_markdown: str = Field(description="Full markdown content for /memory/cases/case-{id}-{slug}.md")
       global_rule_bullet: str = Field(description="Concise 1-2 sentence reusable rule to append to /memory/AGENTS.md")
       user_memory_note: str = Field(description="Concise note to append to /memory/users/{user_id}/AGENTS.md")
   ~~~
2. Write the new file `/memory/cases/case-{ticket.id}-{output.case_slug}.md`.
3. Append `output.global_rule_bullet` under `## Learned Production Rules` in `/memory/AGENTS.md`.
4. Append `output.user_memory_note` in `/memory/users/{ticket.user_id}/AGENTS.md`.
5. Stage and commit all 3 files in `./harness` via `git_hub.commit_changes(f"Loop 1: Learned case #{ticket.id} ({output.case_slug})")`.

### 5.2. Loop 2: `EvolutionEngine` (`backend/app/evolution_engine.py`)
When `POST /api/evolution/analyze` is called:
1. Fetch recent failed eval items or escalated chat traces alongside the current contents of `INSTRUCTIONS.md` and all `skills/*/SKILL.md` files.
2. Call `model.with_structured_output(HarnessPatchOutput)`:
   ~~~python
   class HarnessPatchOutput(BaseModel):
       target_file: str = Field(description="Relative path inside ./harness, e.g. INSTRUCTIONS.md or skills/archon-workflow-runner/SKILL.md")
       failure_diagnosis: str = Field(description="Concrete explanation of why the agent failed in the trace")
       proposed_full_content: str = Field(description="Complete updated Markdown file with concise rule/workflow additions")
   ~~~
3. Compute `unified_diff` using Python's built-in `difflib.unified_diff(original.splitlines(), proposed.splitlines(), fromfile=target_file, tofile=target_file, lineterm="")`.
4. Save as an `EvolutionProposal` record with `status="PROPOSED"`.
5. When `POST /api/evolution/apply/{proposal_id}` is called:
   - Write `proposed_content` to `HARNESS_ROOT / proposal.target_file`.
   - Create a Git commit in `./harness`: `f"Loop 2 Evolution: Updated {proposal.target_file} (Proposal #{proposal.id})"`.

---

## 6. REST API Specification (`backend/app/main.py`)

### `POST /api/chat`
- **Request:**
  ~~~json
  {
    "user_id": "nina",
    "thread_id": "thread-nina-1",
    "message": "Hi, I'm Nina. I committed a fix to my plan.md command locally and ran the Archon workflow, but the run used my old command text."
  }
  ~~~
- **Response:**
  ~~~json
  {
    "reply": "I don't have enough verified context yet to say for sure...",
    "escalated": true,
    "ticket_id": 5,
    "tool_steps": [
      {"tool": "read_file", "input": "/memory/users/nina/AGENTS.md"},
      {"tool": "glob", "input": "/memory/cases/*.md"},
      {"tool": "read_file", "input": "/skills/archon-workflow-runner/SKILL.md"},
      {"tool": "escalate_to_human", "input": "Local commit to plan.md ignored during workflow run"}
    ]
  }
  ~~~

### `POST /api/inbox/{ticket_id}/resolve`
- **Request:**
  ~~~json
  {
    "human_fix": "Archon creates worktrees from origin/main. The solution is to run git push and re-run the workflow."
  }
  ~~~
- **Response:**
  ~~~json
  {
    "status": "RESOLVED",
    "created_case_path": "/memory/cases/case-005-archon-worktree-origin-main.md",
    "updated_files": [
      "/memory/cases/case-005-archon-worktree-origin-main.md",
      "/memory/AGENTS.md",
      "/memory/users/nina/AGENTS.md"
    ],
    "git_commit_sha": "a1b2c3d"
  }
  ~~~

### `GET /api/harness/files`
- **Response:** Tree list of all files in `./harness` (`path`, `size`, `last_modified`, `content`).

### `GET /api/harness/commits` & `POST /api/harness/rollback/{commit_sha}`
- Lists Git commits (`sha`, `message`, `author`, `timestamp`, `diff`) from `./harness` and allows hard reset/checkout to any prior commit SHA.

---

## 7. Required Demo Seed Scenarios (`backend/eval_dataset.json`)

Ensure the first two entries in `eval_dataset.json` and the UI quick-fill buttons match the core cross-case extrapolation test:
1. **Scenario A (Nina — Teaches the Lesson):**
   - **Prompt:** `"Hi, I'm Nina. I committed a fix to my plan.md command locally and I ran the Archon workflow, but the run used my old command text."`
   - **Expected v0 Behavior:** Agent checks `/skills/` and `/memory/cases/`, finds no mention of Git worktrees or `origin/main`, surfaces uncertainty, and escalates to Team Inbox.
   - **Human Fix Applied:** `"Archon creates its execution worktrees from origin/main, not local unpushed commits. Run git push and re-run."`
2. **Scenario B (Omar — Extrapolates from Nina's Lesson):**
   - **Prompt:** `"I'm Omar. My Archon run finished green and opened a PR, but the diff is missing three commits I made this morning. Is this a bug or what?"`
   - **Expected Post-Loop-1 Behavior:** Agent reads `/memory/AGENTS.md` and `/memory/cases/case-005-archon-worktree-origin-main.md`, recognizes the same underlying `origin/main` worktree mechanism, and confidently answers that Omar's 3 morning commits are likely local and unpushed (`git push` required) without escalating.
