# Adapting HarnessOps to Your Product

HarnessOps is a pattern, not an Archon-specific tool. Here is how to point it at a real product.

## 1. Replace the seed harness

The baseline is defined in `backend/app/git_hub.py` under `INITIAL_FILES`.

- `INSTRUCTIONS.md` — behavior rules for your product.
- `skills/<name>/SKILL.md` — procedures, with YAML frontmatter (`name`, `description`).
- `memory/AGENTS.md` — global learned rules (start empty).
- `memory/users/<user>/AGENTS.md` — private notes per user.

After editing, reseed:

```bash
rm -rf harness
# restart the backend; it recreates the harness and the v0 commit
```

Or start from a copy of `benchmark/final-harness/` and reset the pieces you want.

## 2. Replace the benchmark

`backend/eval_dataset.json` has 14 items:

```json
{
  "id": 1,
  "category": "billing",
  "user_id": "nina",
  "question": "...",
  "ground_truth": "..."
}
```

Write questions from **real support tickets**, not from your docs. If you write them from the docs, you are testing whether the agent can read, not whether it can help.

Then create a held-out set (`backend/holdout_dataset.json`) with paraphrases and new scenarios. Never use it for tuning.

## 3. Replace the users

- `frontend/src/components/SupportChatTab.tsx` — `USERS` and quick prompts.
- `frontend/src/lib/format.ts` — display names and colors.
- `memory/users/<user>/AGENTS.md` — initial profiles.

## 4. Change the model

`backend/app/llm.py` reads:

```env
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

Any OpenAI-compatible endpoint works. `OPENAI_API_KEY` is the fallback. Run the benchmark again after switching; model changes are harness changes too.

## 5. Add retrieval (only if the benchmark says you need it)

Start without it. If failures cluster on "the agent didn't know a documented fact," add retrieval:

- embed case files and skill sections,
- retrieve the top-k before the model call,
- keep the Markdown files as the source of truth,
- compare `v0` vs `v0 + retrieval` on the same benchmark and holdout.

Do not add a vector database because it sounds production-ready. Add it because the eval shows a recall problem.

## 6. Deploy safely

The demo is single-tenant and unauthenticated. Before exposing it:

- put `harness/` and the SQLite DB on a persistent volume,
- add auth and per-IP rate limits,
- set `ALLOWED_ORIGINS` to your frontend origin,
- set a daily spend cap,
- back up the harness as a Git bundle and the DB with `sqlite3 .backup` (`scripts/backup.sh`).

## 7. Keep the loop honest

- Do not edit the holdout after seeing results.
- Do not let Loop 2 see the holdout.
- Report dev and holdout separately.
- If a change improves dev but hurts holdout, that is a regression, not a win.

The pattern is deliberately small: Markdown + Git + tools + evals + a human gate. Everything else is domain-specific.
