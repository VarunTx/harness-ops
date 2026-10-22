# Resume Bullets

**Repo:** <https://github.com/Varun-TT/harness-ops>

Use the version that fits the role. Numbers are measured, not projected.

## Primary (agent / applied AI)

- Built **HarnessOps**, an eval-driven support agent (FastAPI, LangChain, SQLite, Next.js) whose instructions, skills, and memory live in a Git-versioned Markdown harness; raised benchmark accuracy from **21.4% → 100%** (3/14 → 14/14) across four harness versions, each eval pinned to a commit SHA; final harness also scored **10/10 on a separate held-out set** (baseline 2/10).
- Implemented two human-in-the-loop loops: real-time escalations synthesized into case files, global rules, and private user memory with atomic Git commits; trace analysis proposes reviewable Markdown diffs (23-line skill patch) with one-click apply and rollback.
- Enforced per-user memory isolation with deny-by-default filesystem policies; found and fixed a `..` path-traversal bypass and covered the guardrail with pytest.
- Built a four-tab Next.js Studio (chat with live tool traces, escalation inbox, file/diff/commit explorer, eval scoreboard) using plain React state and `fetch`.

## Short version (2 bullets)

- Built an eval-driven support agent with a Git-versioned Markdown harness, human-in-the-loop memory synthesis, and automated prompt-diff proposals; improved accuracy **21.4% → 100%** on a 14-question benchmark and **20% → 100%** on a 10-question holdout.
- Designed deny-by-default per-user memory isolation, found and fixed a path-traversal bypass, and instrumented every benchmark run with its harness commit SHA.

## LinkedIn / portfolio blurb

> Most agent demos stop at the happy path. HarnessOps treats the harness — instructions, skills, memory — as versioned runtime state: the agent escalates when it can't verify an answer, a human correction becomes a committed case and rule, and a second loop proposes its own prompt diffs for review. I measured four harness versions on the same benchmark: 21.4% → 42.9% → 92.9% → 100%, with zero escalations in the last two, plus a separate held-out set at 20% → 100%. The last jump came from a bug the eval caught: the agent ended a turn with "noted in your profile" and dropped the answer. One instruction rule fixed it. That's the loop.

## What not to say

- Don't say "self-improving AI." It's human-in-the-loop harness updates with evals.
- Don't lead with "100% accuracy" without the caveat: 14-question development set, no holdout.
- Don't say "production-ready." It's a single-node demo; say what you'd change at scale.
- Don't lead with the stack. Lead with the problem and the measured result.
