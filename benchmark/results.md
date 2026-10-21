# Benchmark Results

The same 14 questions, the same harness model (`deepseek-chat`, temperature 0), the same LLM judge, run against three harness commits. Raw `EvalRun` JSON is in `results/`; screenshots are in `../docs/screenshots/`.

## Scoreboard

| Run | Harness commit | Passed | Accuracy | Escalations |
|---|---|---|---|---|
| v0 baseline | `65bb791` | 3/14 | 21.4% | 10 |
| after Loop 1 | `44cfd2f` | 6/14 | 42.9% | 6 |
| after Loop 2 | `6135360` | **13/14** | **92.9%** | **0** |

## Per-category (passed / total)

| Category | v0 | v1 | v2 |
|---|---|---|---|
| v0-baseline | 3/4 | 4/4 | 4/4 |
| worktree-origin-main | 0/4 | 2/4 | 3/4 |
| env-isolation | 0/2 | 0/2 | 2/2 |
| monorepo-cwd | 0/2 | 0/2 | 2/2 |
| pr-draft-lock | 0/2 | 0/2 | 2/2 |

![Accuracy by harness version](../docs/screenshots/05-eval-scoreboard.png)

## What changed between runs

**v0 → v1 (Loop 1).** Ticket #5 was resolved with:
> Archon creates its execution worktrees from origin/main, not local unpushed commits. Run `git push` so the commit is on the remote, then re-run `archon workflow run`.

The synthesizer wrote:
- `/memory/cases/case-005-archon-worktree-origin-main.md`
- a global rule in `/memory/AGENTS.md`
- a private note in `/memory/users/nina/AGENTS.md`
- commit `44cfd2f`

Q6 (Omar's missing commits) and Q7 (Alex's stale `.archon/config.yaml`) then passed without an escalation. Q5 and Q8 still failed.

**v1 → v2 (Loop 2).** The evolution engine read the latest eight traces and proposed a 23-line diff to `skills/archon-workflow-runner/SKILL.md` covering:
- worktrees based on `origin/main`
- `.archon/.env` isolation (shell exports are not inherited)
- `--workspace-root` in monorepos
- `archon worktree prune --force` for stale locks

Approved as proposal #1 and committed as `6135360`. All six remaining questions passed.

## The one residual failure

Q5 is still graded as failed at v2. The answer was:

> "I've noted this in your profile so I can remind you to push up front next time."

The agent composed the substantive answer, called `update_user_memory`, and ended the turn with an acknowledgement. `run_support_agent` returns only the final assistant message, so the answer was dropped. The same failure caused Q1 at v0 ("Noted in your profile. Anything else…").

The fix belongs in `INSTRUCTIONS.md`: after any tool call, the final message must restate the complete answer; never end on an acknowledgement. That is the next iteration.

## Methodology

- 14 questions in `backend/eval_dataset.json`, five categories.
- Each run calls the live agent, then a strict LLM judge compares the answer to ground truth.
- A response that escalates without the specific mechanism is graded fail.
- Each `EvalRun` row stores the harness commit SHA and per-question rationale.
- Runs take ~80–100 seconds (28 LLM calls).

## Caveats

- **No holdout.** This is the project's development set, and the Loop 2 prompt names the failure areas. 92.9% is an upper bound.
- **LLM judge.** Strict, but not infallible. Rationales are stored for audit.
- **One run per state.** Temperature is 0 but provider variance exists; multiple seeds would tighten confidence.
- **Memory writes during eval.** The agent can update user memory mid-run; those writes were reverted before each state to keep comparisons clean.

## Files

| File | Description |
|---|---|
| `results/v0-*.json` | baseline run, harness `65bb791` |
| `results/v1-*.json` | after Loop 1, harness `44cfd2f` |
| `results/v2-*.json` | after Loop 2, harness `6135360` |
| `results/loop1-resolve.json` | Loop 1 synthesis response |
| `results/loop2-proposal.json` | full Loop 2 proposal |
| `results/loop2-apply.json` | apply response |
| `final-harness/` | the evolved Markdown harness at `6135360` |
| `results.md` | this file |
