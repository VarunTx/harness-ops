# Product Requirements Document (PRD): HarnessOps — Self-Improving Production Support Agent

## 1. Executive Summary & Objective
Build **HarnessOps**, a full-stack reference implementation of **Harness Engineering** for production AI agents. 
Instead of hardcoding agent logic, workflows, and edge-case fixes in Python boilerplate, the agent's entire behavior is governed by a version-controlled Markdown harness (`INSTRUCTIONS.md`, `skills/`, and `memory/`).

The application demonstrates how an unreliable v0 support agent (scoring ~25-30% on tricky edge-case questions) systematically evolves into a 90%+ accuracy production agent through **Two Human-in-the-Loop Learning Loops**:
1. **Loop 1 (Real-Time Escalation & Memory Loop):** The agent detects its own uncertainty, escalates to a "Team Inbox," and converts human corrections into reusable case memories (`/memory/cases/*.md`), global rules (`/memory/AGENTS.md`), and isolated per-user memories (`/memory/users/{user_id}/AGENTS.md`).
2. **Loop 2 (Retroactive Trace & Harness Evolution Loop):** An Evaluator/Evolution Engine inspects failed or low-score conversation traces, diagnoses what is missing in `INSTRUCTIONS.md` or `skills/*/SKILL.md`, and proposes a concise unified Markdown diff (PR-style) that an admin can approve, commit, or roll back in one click.

---

## 2. Tech Stack
- **Agent Runtime & Harness:** Python 3.11+, `deepagents` (LangChain's open-source Deep Agents harness built on LangGraph), `langchain`, `langgraph`, `langsmith` (for trace observability).
- **LLM Provider:** Configurable via `.env` (`ANTHROPIC_API_KEY` for `anthropic:claude-sonnet-4-6`, `OPENAI_API_KEY` for `openai:gpt-4o`, or OpenAI-compatible `DEEPSEEK_API_KEY`).
- **Backend API:** FastAPI, Pydantic v2, SQLite (via SQLAlchemy/SQLModel) for storing chat threads, escalation inbox tickets, harness commit history, and eval benchmark runs.
- **Version Control for Context Hub:** Local Git repository initialized inside the `./harness` directory (using `gitpython` or subprocess `git`) so every approved harness change creates a real Git commit with diff and rollback support.
- **Frontend UI:** Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui components, Lucide React icons.

---

## 3. Repository & Harness Directory Structure
Scaffold the project as a clean monorepo:

~~~text
harness-ops/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point & CORS
│   │   ├── database.py             # SQLite setup for tickets, threads, evals
│   │   ├── models.py               # SQLModel/Pydantic schemas
│   │   ├── agent.py                # ~35-line Deep Agent definition & guardrails
│   │   ├── memory_synthesizer.py   # Loop 1: Converts human fixes into case & AGENTS.md memories
│   │   ├── evolution_engine.py     # Loop 2: Analyzes traces & generates Markdown diffs for INSTRUCTIONS/skills
│   │   ├── git_hub.py              # Git wrapper for ./harness commit history, diffs, & rollbacks
│   │   └── eval_runner.py          # Runs the 14-question benchmark dataset & logs pass/fail scores
│   ├── eval_dataset.json           # 14 realistic, tricky developer support questions & ground-truth answers
│   ├── requirements.txt
│   └── .env.example
├── harness/                        # The version-controlled Context Hub (initialized as a Git repo)
│   ├── INSTRUCTIONS.md             # Global system prompt & operating rules
│   ├── skills/                     # Progressive disclosure skills (Agent Skills spec)
│   │   ├── archon-cli-setup/
│   │   │   └── SKILL.md            # YAML frontmatter (name, description) + SOP body
│   │   ├── workflow-debugging/
│   │   │   └── SKILL.md
│   │   └── billing-and-tiers/
│   │       └── SKILL.md
│   └── memory/
│       ├── AGENTS.md               # Global learned rules from past escalations
│       ├── cases/                  # Specific resolved incident cases (e.g., case-001-worktree-commits.md)
│       └── users/                  # Isolated per-user memory folders
│           ├── nina/
│           │   └── AGENTS.md
│           └── omar/
│               └── AGENTS.md
└── frontend/                       # Next.js Admin & Help Desk Studio
    ├── src/app/
    │   ├── page.tsx                # 4-Tab Studio Interface
    │   └── components/
    │       ├── SupportChatTab.tsx  # Mock user switcher (Nina, Omar, Alex) + live agent reasoning trace
    │       ├── TeamInboxTab.tsx    # Escalated tickets queue + "Confirm Fix & Learn Lesson" action
    │       ├── ContextHubTab.tsx   # File tree viewer/editor for INSTRUCTIONS.md, skills/, memory/, & Git commits
    │       └── EvolutionEvalTab.tsx# Trace-driven Prompt Diff reviewer ("Approve & Apply") + 14-question Eval Runner
    └── package.json
~~~

---

## 4. Core Functional Specifications

### 4.1. Domain Scenario (Mock Product: "Archon Workflow Engine")
To reproduce a realistic developer support environment, the agent acts as the **Archon Developer Help Desk**.
- Seed `./harness/skills/` with intentionally incomplete v0 documentation about "Archon" (an AI coding workflow CLI that creates Git worktrees, runs automated PR pipelines, and manages local `.archon/commands.md` files).
- Seed `eval_dataset.json` with **14 tricky edge-case questions** (e.g., *"I committed a fix to my plan.md command locally and ran the Archon workflow, but the run used my old command text"*, *"My Archon run finished green and opened a PR, but the diff is missing 3 commits I made this morning"*).
- Ensure that with the initial v0 harness, the agent only knows enough to answer ~4/14 questions confidently and must escalate the rest.

### 4.2. The Markdown-Driven Agent (`backend/app/agent.py`)
Keep `agent.py` concise (~30–45 lines of core wiring) using `deepagents`:
1. Load `INSTRUCTIONS.md` as the `system_prompt`.
2. Configure `FilesystemBackend` rooted at `./harness`.
3. Pass `skills=["/skills/"]` so `SkillsMiddleware` automatically loads YAML frontmatter (`name`, `description`) at startup and reads full `SKILL.md` files on demand.
4. Pass `memory=["/memory/AGENTS.md", f"/memory/users/{user_id}/AGENTS.md"]` so global learned lessons and the current user's memory are injected automatically.
5. **Per-User Privacy Guardrail (`permissions`):** Use `FilesystemPermission` rules so that when the agent runs for `user_id="nina"`, it is allowed to read/write `/memory/users/nina/**` and read `/memory/cases/**`, but **strictly denied** access to `/memory/users/*` for any other user.
6. **Custom Escalation Tool (`escalate_to_human`):**
   - Signature: `escalate_to_human(user_id: str, question: str, tentative_answer: str, uncertainty_reason: str) -> str`
   - Instruct the agent in `INSTRUCTIONS.md`: *"Whenever a user asks about a behavior, bug, or workflow not explicitly covered in your skills, cases, or memory, DO NOT guess or hallucinate. Provide a transparent, cautious response stating that you are not 100% certain, and call `escalate_to_human`."*

### 4.3. Loop 1: Real-Time Escalation & Memory Synthesis (`memory_synthesizer.py`)
When `escalate_to_human` is invoked during a chat:
1. Create a `PENDING` ticket in the SQLite `escalation_tickets` table (incrementing the "Team Inbox" badge count in the UI).
2. In the **Team Inbox Tab**, a human engineer reviews:
   - The user's original question
   - The agent's uncertain response
   - A text box to provide the **Confirmed Fix / Ground Truth** (e.g., *"Archon creates worktrees from `origin/main`, not local unpushed commits. The user must run `git push` and re-run the workflow."*)
3. Clicking **"Confirm Fix & Teach Agent"** triggers `memory_synthesizer.py`, which uses an LLM structured-output call to:
   - **Write a new case file** in `./harness/memory/cases/case-{id}-{slug}.md` containing the symptom, root cause, and resolution.
   - **Update `./harness/memory/AGENTS.md`** with a concise 1–2 bullet general rule pointing to the case so the agent can extrapolate to similar problems (e.g., Omar asking why his PR diff is missing 3 local commits).
   - **Update `./harness/memory/users/{user_id}/AGENTS.md`** with relevant context about that user's setup.
   - Commit the changes to the `./harness` Git repository with commit message `"Loop 1: Learned lesson from ticket #{id}"`.

### 4.4. Loop 2: Retroactive Trace Analysis & Harness Evolution (`evolution_engine.py`)
1. Log every conversation execution trace (messages, tool calls, skill reads, latency, and any user thumbs-down or escalation flags) both locally in SQLite and to **LangSmith** (when `LANGCHAIN_TRACING_V2=true` is set).
2. Provide an **"Analyze Failure Traces"** button in the UI (or automatic trigger on failed traces).
3. `evolution_engine.py` inspects the failed conversation trace alongside the current contents of `./harness/INSTRUCTIONS.md` and `./harness/skills/*/SKILL.md`.
4. It generates a structured **Harness Evolution Proposal**:
   - `target_file`: e.g., `INSTRUCTIONS.md` or `skills/workflow-debugging/SKILL.md`
   - `failure_diagnosis`: Detailed explanation of why the agent failed based on the trace evidence.
   - `proposed_content` & `unified_diff`: A concise modification to the target Markdown file (avoiding prompt bloat).
5. In the UI, the human engineer reviews the side-by-side or unified diff and clicks **"Approve & Apply to Production"**, which writes the file and creates a Git commit in `./harness`.
6. Include a **"Rollback to Commit"** button in the Context Hub commit history view so any bad update can be reverted in one click.

### 4.5. Evaluation Benchmark Runner (`eval_runner.py`)
To prove the value of Harness Engineering quantitatively:
1. Build an LLM-as-a-Judge evaluator that runs all 14 questions from `eval_dataset.json` against the current harness state.
2. Score each response on:
   - **Accuracy (0 or 1)** compared to ground truth.
   - **Confidence Calibration** (did it appropriately escalate when missing knowledge vs. hallucinating?).
3. Display a visual progress chart in the UI showing benchmark runs over time (e.g., `Run #1 (v0 Harness): 4/14 (28.6%)` -> `Run #2 (Post-Loop 1 & 2): 13/14 (92.8%)`).

---

## 5. API Endpoints (`backend/app/main.py`)
- `POST /api/chat` — Send a message as a selected mock user (`nina`, `omar`, `alex`). Returns assistant reply, tool call trace steps (e.g., `Searched memory/users/nina`, `Loaded skill workflow-debugging`, `Escalated to inbox`), and confidence status.
- `GET /api/inbox` — List all pending and resolved escalation tickets.
- `POST /api/inbox/{ticket_id}/resolve` — Submit human correction, trigger Loop 1 memory synthesis, and return the newly created memory diffs.
- `GET /api/harness/files` — Return the complete file tree and Markdown content of `./harness`.
- `GET /api/harness/commits` — Return Git commit history of `./harness` with diffs.
- `POST /api/harness/rollback/{commit_sha}` — Roll back `./harness` to a specific commit.
- `POST /api/evolution/analyze` — Run Loop 2 trace analysis on recent failures/escalations and return proposed Markdown PR diffs.
- `POST /api/evolution/apply/{proposal_id}` — Approve and apply a proposed Markdown change to `./harness` and commit to Git.
- `POST /api/evals/run` — Execute the 14-question benchmark suite and store results.

---

## 6. Implementation Milestones (Execute in Order)
Build this project iteratively following these phases:
1. **Phase 1 (Harness & Seed Data):** Create the `./harness` directory, initialize it as a Git repo, populate `INSTRUCTIONS.md`, 3 `SKILL.md` files, initial `memory/AGENTS.md`, user folders for `nina` and `omar`, and `backend/eval_dataset.json` (including the Nina `plan.md` local commit case and Omar missing commits PR diff case).
2. **Phase 2 (Backend & Deep Agent Core):** Implement `database.py`, `models.py`, `git_hub.py`, and `agent.py` (using `deepagents` or a modular LangGraph fallback if `deepagents` requires custom local wrapping, ensuring progressive skill loading, `AGENTS.md` injection, and per-user path guardrails).
3. **Phase 3 (Loop 1 & Loop 2 Engines):** Implement `memory_synthesizer.py`, `evolution_engine.py`, `eval_runner.py`, and expose all FastAPI routes in `main.py`.
4. **Phase 4 (Next.js Studio Dashboard):** Build a clean, dark-mode developer dashboard with the 4 core views:
   - **Live Help Desk Chat** (with user switcher & real-time step inspector showing memory/skill reads)
   - **Team Escalation Inbox** (with counter badge & 1-click lesson synthesis)
   - **Context Hub Explorer** (Markdown viewer, `cases/` browser, per-user memory inspector, and Git commit rollback history)
   - **Evolution Engine & Eval Suite** (Trace failure viewer, proposed Markdown diff viewer with "Approve & Apply", and the 14-question benchmark scoreboard)
5. **Phase 5 (README & Demo Script):** Write a comprehensive `README.md` with architecture diagrams and a 3-minute demo script walking through Nina's escalation -> Inbox fix -> Omar's follow-up success -> Loop 2 `INSTRUCTIONS.md` evolution.
