# Case Study: HarnessOps

## The problem

Production support agents fail in ways ordinary tests do not catch. They invent an answer for an undocumented edge case, forget the correction the next day, and regress silently when someone edits a prompt. Most teams respond by making the prompt longer, which makes the behavior harder to review and the context more expensive.

## The bet

Treat the agent's behavior as **versioned runtime state**, and treat quality as an **experiment**.

- Instructions, skills, and memory live in Markdown under Git.
- Uncertainty is a first-class outcome: escalate instead of guessing.
- Human corrections become memory, with a commit.
- Failure traces become reviewable prompt diffs, with an approval gate.
- Every benchmark run names the harness commit it measured.

## How it works

The model is a commodity (`deepseek-chat`). The engineering is the harness around it:

1. **Per turn:** load instructions, global memory, private user memory, and skill summaries. Let the model read skills/cases on demand. Escalate if the answer is not documented.
2. **Loop 1:** a human resolves the ticket; a structured-output call writes a case, a global rule, and a private note in one commit.
3. **Loop 2:** the evolution engine reads recent traces and proposes a Markdown diff; a human approves and applies it.
4. **Measurement:** 14 development questions plus 10 held-out questions, graded against ground truth, stored with the harness SHA.

## Results

| Run | Harness commit | Dev | Escalations |
|---|---|---|---|
| v0 baseline | `65bb791` | 3/14 (21.4%) | 10 |
| after Loop 1 | `44cfd2f` | 6/14 (42.9%) | 6 |
| after Loop 2 | `6135360` | 13/14 (92.9%) | 0 |
| after final-answer fix | `f1a1925` | 14/14 (100%) | 0 |

A separate **10-question held-out set** went from **2/10 at baseline to 10/10 at the final harness**. It was written after the harness was frozen and never shown to Loop 2. Ten same-domain paraphrases are a smoke test, not a generalization guarantee; the full methodology and caveats are in [`benchmark/results.md`](../benchmark/results.md).

## What went wrong (and why that matters)

- **The eval caught a product bug.** At 13/14, Q5 returned only *"I've noted this in your profile."* The agent had composed the answer, called `update_user_memory`, and then ended the turn with an acknowledgement; the user never saw the answer. One instruction rule fixed it, and the re-run went to 14/14. This is the strongest argument for measuring behavior rather than vibes.
- **The tests caught a guardrail bypass.** `/memory/users/nina/../omar/AGENTS.md` matched Nina's allow rule before path resolution. The guardrail now normalizes paths, blocks `..` in globs, and denies unmatched reads by default.
- **100% is suspicious.** The development set is small and Loop 2 is told the failure areas. That is why the holdout exists and why the README states the caveat before anyone asks.

## Tradeoffs

- **Markdown + Git instead of a vector store.** At this scale, injecting eight files is cheaper and more predictable than retrieval, and Git gives diffs and rollback. At thousands of cases, the next step is hybrid retrieval, not a rewrite.
- **Custom tool loop instead of `deepagents`.** Explicit control made the permission model and trace inspectable and testable. The SDK was evaluated; it is not a runtime dependency.
- **SQLite + local Git instead of Postgres + object storage.** Deliberate for a single-node demo. Production needs a queue, Postgres, per-tenant isolation, rate limits, and a spend cap.
- **Human approval for prompt changes.** Autonomy is not the goal; reviewable improvement is.

## What I would do next

1. Expand the holdout to 40 questions and report confidence intervals.
2. Run each state multiple times to quantify variance.
3. Stream responses and add auth/rate limits.
4. Compare the same harness on three providers (accuracy vs cost).
5. Use the harness pattern on a real product's documentation, not a fictional CLI.
