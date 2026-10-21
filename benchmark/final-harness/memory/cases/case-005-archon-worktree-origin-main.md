# Case #5: Archon workflow runs use origin/main, not local unpushed commits
- **Date:** 2026-10-21
- **Reported By:** `nina`
- **Symptom:** Hi, I'm Nina. I committed a fix to my plan.md command locally and I ran the Archon workflow, but the run used my old command text.
- **Root Cause:** Archon creates its execution worktrees from origin/main rather than the local working tree. A fix committed only locally (e.g., to .archon/commands/plan.md) is not present in the remote branch, so the workflow run checks out origin/main and executes the old command text. The commit must be pushed to the remote before re-running the workflow.
- **Verified Resolution:** Archon creates its execution worktrees from origin/main, not local unpushed commits. Run `git push` so the commit is on the remote, then re-run `archon workflow run`.
