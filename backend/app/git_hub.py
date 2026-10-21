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
