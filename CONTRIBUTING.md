# Contributing

Thanks for taking a look. This is a reference implementation, not a product roadmap — the most useful contributions are bug fixes, test coverage, and clearer documentation.

## Setup

```bash
make setup
cp backend/.env.example backend/.env   # add DEEPSEEK_API_KEY
make dev
```

`make dev` picks free ports and prints both URLs. If you use a custom API port, copy `frontend/.env.local.example` to `frontend/.env.local` and update `NEXT_PUBLIC_API_BASE`.

## Before opening a pull request

```bash
make test    # backend syntax + pytest
make lint    # frontend ESLint
```

Both are also enforced by GitHub Actions.

## What to keep intact

- **Per-user memory isolation.** Any change touching `_check_permission`, `read_file`, or `glob_files` needs tests, including `..` traversal cases.
- **The holdout set.** `backend/holdout_dataset.json` is never used for tuning. Do not change it to make a score improve; add new questions in a separate file instead.
- **Runtime state.** `harness/`, `backend/harness_ops.db`, and `backups/` are generated and gitignored. The baseline is seeded from `backend/app/git_hub.py`; the final evolved harness lives in `benchmark/final-harness/`.

## Pull request expectations

- One focused change per PR.
- Include the failing case or new test that motivated it.
- If behavior changes, note the benchmark impact (or explain why the benchmark is unaffected).
- Do not commit API keys, `.env` files, databases, or generated harness state.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please do not open a public issue for a guardrail bypass.
