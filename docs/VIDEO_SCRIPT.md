# 90-Second Demo Video Script

Record at 1440×900 or larger. Close notifications, other browser tabs, and anything showing an API key. Reset first:

```bash
./scripts/demo-reset.sh
./scripts/dev.sh
```

## Shot list

| Time | On screen | Say |
|---|---|---|
| 0:00–0:10 | README result table | "This is HarnessOps: an eval-driven support agent whose instructions, skills, and memory live in a Git-versioned Markdown harness. It went from 21.4% to 100% on a 14-question benchmark." |
| 0:10–0:30 | Studio → Support Chat → Nina → quick-fill → Send | "Nina says her local `plan.md` change wasn't used. The agent reads the workflow skill and past cases, finds no answer, and escalates instead of guessing. Ticket #5." |
| 0:30–0:50 | Team Inbox → paste fix → Confirm Fix & Teach Agent | "A human writes the real fix. One click turns it into a case file, a global rule, and a private note — one Git commit." |
| 0:50–1:05 | Support Chat → Omar → quick-fill → Send | "Omar asks a different question. The agent reads the global rule and answers without escalating. One correction generalized." |
| 1:05–1:20 | Evolution & Evals → Analyze → diff → Apply | "Loop 2 reads recent traces and proposes a Markdown diff. I review it and apply it. That's a prompt change with a diff, a commit, and rollback." |
| 1:20–1:30 | Scoreboard → 21.4 → 42.9 → 92.9 → 100 | "Four runs, each pinned to a harness commit. The last jump came from a bug the eval caught — the agent dropped its answer after a memory write. Honest caveat: 14 development questions, so this is an upper bound; the holdout is separate." |

## Recording tips

- Speak slightly slower than feels natural.
- Do not show the terminal with `.env` or the DeepSeek key.
- One take is fine; a clean 90 seconds beats a polished 5 minutes.
- Upload to YouTube (unlisted) or Loom, then add the link to the README and resume.
- If a live call is slow, keep narrating; the tool trace is the interesting part.
