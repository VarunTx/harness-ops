# Changelog

## Unreleased

### Changed

- **Loop 2 no longer sees benchmark answers.** The v1.0.0 Loop 2 prompt named six ground-truth facts. The new prompt is domain-agnostic and uses only human-verified ticket fixes, Loop 1 case files, and failed dev-set symptoms (no ground truth, no holdout). Loop 2 chooses its target file from a whitelist (`INSTRUCTIONS.md`, `memory/AGENTS.md`, `skills/<name>/SKILL.md`); invalid targets are rejected with HTTP 422 instead of silently falling back to one skill file.
- The eval judge can be a separate model (`JUDGE_MODEL`, `JUDGE_API_KEY`, `JUDGE_BASE_URL`). `EvalRun` records `agent_model` and `judge_model`, and eval details now include `ground_truth`.

### Fixed

- When the agent spent all tool steps without a final message, the last tool output (e.g. raw file contents) was returned as the reply. It now returns an explicit no-verified-answer message and sets `step_limit_reached`.

### Added

- `scripts/judge_agreement.py`: export graded answers for human labeling; report agreement, Cohen's κ, and disagreements.
- 32 new tests: agent loop with a scripted fake LLM, Loop 2 leak and write-scope tests, judge config, κ math (39 total).

## v1.0.0 — 2026-10-22

First public release.

### Added

- FastAPI backend with a LangChain tool loop, progressive skill disclosure, per-user memory, and an escalation tool.
- Loop 1: human resolution of a ticket synthesized into a case file, a global rule, and a private user note, committed atomically to the harness Git repo.
- Loop 2: trace analysis that proposes a reviewable Markdown diff, with apply and rollback.
- 14-question development benchmark with an LLM judge, stored against the harness commit SHA.
- 10-question held-out set, stored separately and never used for tuning.
- Four-tab Next.js Studio: chat with tool traces, Team Inbox, Context Hub with Git timeline and diffs, Evolution & Evals.
- Deny-by-default memory guardrails, including path normalization and `..` rejection; 7 tests.
- Demo reset, backup/restore, and local state snapshots.

### Results

| Run | Harness commit | Dev | Holdout |
|---|---|---|---|
| v0 baseline | `65bb791` | 3/14 (21.4%) | 2/10 (20%) |
| after Loop 1 | `44cfd2f` | 6/14 (42.9%) | — |
| after Loop 2 | `6135360` | 13/14 (92.9%) | — |
| after final-answer fix | `f1a1925` | 14/14 (100%) | 10/10 (100%) |

### Known limitations

- No authentication, rate limiting, or multi-tenancy.
- SQLite and a local Git repo: single writer, single node.
- The development set is small and the Loop 2 prompt names the failure areas; 100% is an upper bound.
- No streaming; chat turns take 15–30 seconds.
