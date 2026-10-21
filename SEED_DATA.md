# Seed Data Specification (`SEED_DATA.md`)

Use this exact data when generating `./backend/eval_dataset.json` and `./harness/` seed files in Phase 1.

## 1. Initial Harness Files (`./harness/`)

### `./harness/memory/AGENTS.md`
~~~markdown
# Archon Global Learned Rules

## Core System Knowledge
- Archon configurations live in `.archon/` at the repository root.

## Learned Production Rules
<!-- Loop 1 Memory Synthesizer appends verified production lessons below -->
~~~

### `./harness/memory/users/nina/AGENTS.md`
~~~markdown
# User Profile & Memory: Nina (`nina`)
- Role: Senior Backend Engineer
- Workflow setup: Uses custom `.archon/commands/plan.md` workflows locally.
~~~

### `./harness/memory/users/omar/AGENTS.md`
~~~markdown
# User Profile & Memory: Omar (`omar`)
- Role: Full-Stack Developer
- Workflow setup: Runs automated PR pipelines via `archon workflow run`.
~~~

## 2. The 14-Question Benchmark Dataset (`./backend/eval_dataset.json`)

Create `./backend/eval_dataset.json` with these 14 items. 
- Questions 1–4 are covered by the initial v0 skills (so v0 scores ~4/14 = 28.6%).
- Questions 5–14 require Loop 1 (case lessons on `origin/main` worktrees, `.archon/env` caching, monorepo paths) and Loop 2 (`INSTRUCTIONS.md` and `SKILL.md` updates) to pass:

~~~json
[
  {
    "id": 1,
    "category": "v0-baseline",
    "user_id": "alex",
    "question": "How do I initialize Archon in a brand new repository?",
    "ground_truth": "Run `archon init` in the root of your repository to create the `.archon/` configuration directory."
  },
  {
    "id": 2,
    "category": "v0-baseline",
    "user_id": "alex",
    "question": "What command triggers a specific workflow in Archon?",
    "ground_truth": "Use `archon workflow run <name>` to execute a workflow defined in `.archon/commands/`."
  },
  {
    "id": 3,
    "category": "v0-baseline",
    "user_id": "alex",
    "question": "Where should I place my custom workflow markdown files?",
    "ground_truth": "Place custom workflow markdown files inside the `.archon/commands/` directory."
  },
  {
    "id": 4,
    "category": "v0-baseline",
    "user_id": "alex",
    "question": "What happens after an Archon workflow run passes all checks?",
    "ground_truth": "When checks pass, Archon automatically opens a GitHub Pull Request with the changes."
  },
  {
    "id": 5,
    "category": "worktree-origin-main",
    "user_id": "nina",
    "question": "Hi, I'm Nina. I committed a fix to my plan.md command locally and I ran the Archon workflow, but the run used my old command text.",
    "ground_truth": "Archon creates its isolated execution worktrees from `origin/main`, not your local unpushed branch. You need to run `git push` so your `plan.md` commit is on `origin/main`, then re-run `archon workflow run`."
  },
  {
    "id": 6,
    "category": "worktree-origin-main",
    "user_id": "omar",
    "question": "I'm Omar. My Archon run finished green and opened a PR, but the diff is missing three commits I made this morning. Is this a bug or what?",
    "ground_truth": "Likely not a bug. Archon builds its execution worktree from `origin/main`. Your three commits from this morning are probably committed locally but not pushed. Run `git push` and re-run the workflow."
  },
  {
    "id": 7,
    "category": "worktree-origin-main",
    "user_id": "alex",
    "question": "I edited `.archon/config.yaml` on my laptop and committed it, but `archon workflow run` is still reading yesterday's config values.",
    "ground_truth": "Archon clones the execution worktree from `origin/main`. Unpushed local commits are ignored during workflow execution. Run `git push` to update the remote branch before running the workflow."
  },
  {
    "id": 8,
    "category": "worktree-origin-main",
    "user_id": "nina",
    "question": "Why does Archon ignore hotfix commits I just made on my local `main` branch when spawning a background agent?",
    "ground_truth": "Background agent runs spawn Git worktrees fetched from `origin/main` rather than your local working state. Push your local commits with `git push` first."
  },
  {
    "id": 9,
    "category": "env-isolation",
    "user_id": "omar",
    "question": "My workflow fails saying `STRIPE_TEST_KEY` is undefined even though I exported it in my terminal right before running `archon workflow run`.",
    "ground_truth": "Archon's isolated worktree runner strips host shell environment variables for security. You must add `STRIPE_TEST_KEY` to `.archon/.env` or whitelist it under `env_passthrough` in `.archon/config.yaml`."
  },
  {
    "id": 10,
    "category": "env-isolation",
    "user_id": "alex",
    "question": "Why aren't my local `export DATABASE_URL=...` shell variables visible inside the Archon test step?",
    "ground_truth": "Archon runs workflows in a clean sandboxed environment that does not inherit terminal exports. Define the variable in `.archon/.env` or add it to `env_passthrough` in `.archon/config.yaml`."
  },
  {
    "id": 11,
    "category": "monorepo-cwd",
    "user_id": "nina",
    "question": "I'm running `archon workflow run` from inside `packages/web/`, and it says `.archon/commands/` not found even though `.archon` is at our monorepo root.",
    "ground_truth": "Archon resolves `.archon/` relative to the Git repository root only when `--workspace-root` is passed, or when invoked from the repo root. Run `archon workflow run --workspace-root` when inside subdirectories."
  },
  {
    "id": 12,
    "category": "monorepo-cwd",
    "user_id": "omar",
    "question": "How do I run an Archon command from a nested `apps/api` folder in a Turborepo without cd-ing back to the root?",
    "ground_truth": "Pass the `--workspace-root` flag (`archon workflow run <name> --workspace-root`) so the CLI locates `.archon/` at the monorepo root."
  },
  {
    "id": 13,
    "category": "pr-draft-lock",
    "user_id": "alex",
    "question": "Archon finished the code changes but failed at the GitHub PR step with error `PR_BRANCH_LOCKED_BY_PREVIOUS_RUN`.",
    "ground_truth": "A stale worktree lock exists from a cancelled run. Run `archon worktree prune --force` to clear locked worktree branches and retry."
  },
  {
    "id": 14,
    "category": "pr-draft-lock",
    "user_id": "nina",
    "question": "I cancelled an Archon run mid-flight with Ctrl+C and now new runs refuse to start with a worktree lock error. How do I reset it?",
    "ground_truth": "Run `archon worktree prune --force` to clean up orphaned worktree locks left behind by interrupted runs."
  }
]
~~~
