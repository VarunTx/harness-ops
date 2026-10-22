# Design Docs

These are the original design documents for HarnessOps, kept for context.

- [`PRD.md`](PRD.md) — product requirements, the two learning loops, and the demo scenario.
- [`SPEC.md`](SPEC.md) — technical specification: harness contract, database schema, API.
- [`SEED_DATA.md`](SEED_DATA.md) — the initial Markdown harness and the 14-question benchmark.
- [`archive/`](archive/) — the build brief and implementation dump used to scaffold the first version.

The **runtime** harness is not stored here. It is generated on first boot from
`backend/app/git_hub.py` and lives in `harness/`, its own Git repository. The
final evolved harness is preserved in [`../../benchmark/final-harness/`](../../benchmark/final-harness/).

Start with the top-level [`README.md`](../../README.md) if you are new to the project.
