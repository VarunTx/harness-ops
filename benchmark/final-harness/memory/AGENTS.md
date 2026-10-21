# Archon Global Learned Rules

## Core System Knowledge
- Archon configurations live in `.archon/` at the repository root.

## Learned Production Rules
<!-- Loop 1 Memory Synthesizer appends verified production lessons below -->
- **[Archon workflow runs use origin/main, not local unpushed commits](/memory/cases/case-005-archon-worktree-origin-main.md):** Archon executes workflows in worktrees created from origin/main, so any local commit (including changes to .archon/commands/*.md) must be pushed to the remote before running `archon workflow run`; unpushed local commits will not be picked up.
