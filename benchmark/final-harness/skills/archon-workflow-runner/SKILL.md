---
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

## Worktrees and origin/main
- Archon creates a fresh git worktree for each run, based on **origin/main** (not your local HEAD or current branch).
- If your changes depend on local commits not yet pushed to origin/main, push them first or the worktree will not see them.
- Stale worktrees from interrupted runs (Ctrl+C) or failed PR steps can leave locks. The error `PR_BRANCH_LOCKED_BY_PREVIOUS_RUN` means a previous run still holds the PR branch lock.
- **Recovery:** Run `archon worktree prune --force` to remove stale worktrees and clear locks. This is safe and does not corrupt git metadata. Then re-run the workflow.

## Environment Variables
- Archon does **not** inherit environment variables exported in your shell. Steps run in an isolated sandbox.
- Environment variables must be defined in `.archon/.env` (or `.archon/config.yaml`). Shell `export FOO=bar` will not be visible inside workflow steps.
- If a step reports `STRIPE_TEST_KEY is undefined` or `DATABASE_URL` missing, add the variable to `.archon/.env` and re-run.

## Monorepos and --workspace-root
- Archon resolves `.archon/` from the **repository root**, not the current working directory.
- When running from a subdirectory (e.g., `packages/web/` or `apps/api`), pass `--workspace-root <path-to-repo-root>` to `archon workflow run` so it finds `.archon/commands/`.
- Example: `archon workflow run build --workspace-root ../..` from `packages/web/`.
- Alternatively, `cd` to the repo root before running.
