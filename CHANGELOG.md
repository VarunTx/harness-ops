# Changelog

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
