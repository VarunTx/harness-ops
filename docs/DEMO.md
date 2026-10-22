# 3-Minute Demo Script

## Pre-flight (2 minutes before)

```bash
./scripts/demo-reset.sh          # baseline harness, 4 tickets, empty chat
./scripts/dev.sh                 # starts API + Studio; use the URLs it prints
```

Open http://localhost:3001. Confirm:

- Header says **API online**
- Team Inbox badge shows **4**
- Context Hub → Git timeline shows only `v0: Initial baseline harness`

Keep `docs/screenshots/` open in a second window as a fallback if the network is slow.

---

## 0:00 — Frame it (15s)

> "This is a support agent for a fictional CLI called Archon. Its behavior lives in a Git-versioned Markdown harness: instructions, skills, and per-user memory. It escalates when it can't verify an answer, and it learns from the engineer who fixes it. There are two loops: real-time corrections and retroactive harness evolution. I'll show both, then the benchmark."

---

## 0:15 — Nina escalates (45s)

1. Support Chat → click **Nina**.
2. Click the quick-fill **"Nina · plan.md ran stale"**.
3. Send.

While it runs (~15–25s), narrate:

> "It loads global memory and Nina's private memory, reads the workflow skill, and searches cases. None of them document how Archon creates worktrees, so it refuses to guess and escalates."

Point at:

- **Tool trace · 7 steps** badges
- **Escalated to Team Inbox · Ticket #5**
- The cautious hypothesis in the reply

---

## 1:00 — Human teaches it (40s)

1. Click **View ticket** (or Team Inbox).
2. Ticket #5 is selected. Point out the agent's tentative answer and **Why it escalated**.
3. Paste into **Confirmed fix / ground truth**:

   ```
   Archon creates its execution worktrees from origin/main, not local unpushed commits. Run `git push`, then re-run `archon workflow run`.
   ```

4. Click **Confirm Fix & Teach Agent** (~15–25s).

Point at the result:

> "One click wrote three things: a case file, a global rule, and a private note for Nina — and committed them atomically. Commit `44cfd2f`."

Optionally open **Context Hub** and show the new file and the Loop 1 commit.

---

## 1:40 — Omar extrapolates (30s)

1. Support Chat → **Omar**.
2. Quick-fill **"Omar · PR missing 3 commits"**.
3. Send.

> "Omar never filed a ticket. The agent reads the global rule, recognizes the same origin/main mechanism, and answers without escalating."

Point out that the trace is shorter and there is no escalation banner.

---

## 2:10 — Loop 2 evolves the harness (35s)

1. **Evolution & Evals** → **Analyze Failure Traces** (~5–20s).
2. Show:
   - Failure diagnosis (four undocumented behaviors)
   - Trace evidence (tickets)
   - The 23-line Markdown diff
3. Click **Approve & Apply**.

> "This is a reviewable prompt change, not a code deploy. It wrote the skill file and committed it as `6135360`. If it regresses anything, the Context Hub can roll back in one click."

---

## 2:45 — Prove it (15s)

Scroll to the **14-Question Eval Runner**.

> "Four runs, each pinned to a harness commit: 21.4% at baseline, 42.9% after the human correction, 92.9% after the harness diff, and 100% after one more instruction fix. Zero escalations."

Then the honest close:

> "The 13/14 wasn't good enough. The agent wrote a memory note and ended the turn with 'I've noted this in your profile' instead of restating the answer. The eval caught it, I added one rule to INSTRUCTIONS.md, re-ran, and got 14/14. The separate holdout — questions written after the harness was frozen — went from 2/10 to 10/10. Still a small set, but it's evidence beyond the exact questions I tuned on."

---

## If something breaks

| Symptom | Recovery |
|---|---|
| API offline | `./scripts/dev.sh`; check the API port it printed |
| Chat is slow | Keep talking; the call takes 15–30 s |
| Analyze fails | Show proposal #1 in the list — it is already applied |
| Inbox is not 4 | `./scripts/demo-reset.sh` |
| Everything is on fire | Switch to `docs/screenshots/` and walk the same story |

## After the demo

```bash
./scripts/demo-reset.sh
```

Keeps the eval history for the scoreboard; clears tickets and chat.
