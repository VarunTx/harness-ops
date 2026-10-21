# Interview Notes

Answers you should be able to give without notes. Each is intentionally short; the follow-ups are where the signal is.

### 1. "What is this?"

An eval-driven support agent where the prompt, skills, and memory are a Git-versioned Markdown harness. It escalates when it can't verify something, converts human fixes into reusable memory, proposes its own prompt diffs, and measures the result on a 14-question benchmark. Result: 21.4% → 42.9% → 92.9% → 100%, each run pinned to a commit SHA.

### 2. "Isn't this just prompt engineering?"

Yes — and at an AI product company, prompt and context engineering *is* the product surface. The difference is that changes are versioned, reviewed as diffs, evaluated, and reversible. I treat the harness like code, not like a chat window.

### 3. "Why Git for memory instead of a vector database?"

At this scale there are eight harness files and a handful of cases. Injecting them and progressively disclosing skills is cheaper and more predictable than retrieval. Git gives me blame, diffs, and one-command rollback — properties a vector store doesn't. At thousands of cases I'd add hybrid retrieval over symptoms and keep Git as the source of truth.

### 4. "How do you know it improved?"

Four runs of the same 14-question set at temperature 0, graded by an LLM judge against ground truth, with the harness commit recorded for each. 3/14 → 6/14 → 13/14 → 14/14. Escalations went from 10 to 0.

### 5. "Only 14 questions? Isn't that overfit?"

Yes, that's the biggest weakness. The Loop 2 prompt also names the failure categories, so 100% is an upper bound, not a generalization estimate. The next step is a 40-question set with a 20% held-out split and a report of holdout accuracy separately. I'd rather say that than pretend 14 is enough.

### 6. "What failed, and how did you fix it?"

It did fail on Q5 at v2. The agent composed the answer, called `update_user_memory`, and ended with "I've noted this in your profile…" — the answer was in the previous assistant message and never reached the user. Same bug made Q1 fail at v0. I added one rule to `INSTRUCTIONS.md`: after a tool call, the final message must restate the complete answer. Re-ran: 14/14, zero escalations. The eval found a product bug, not just a model weakness.

### 7. "How do you stop Nina reading Omar's memory?"

Deny-by-default permission rules, normalized paths, and tests. While writing the tests I found a traversal bypass: `/memory/users/nina/../omar/AGENTS.md` matched Nina's allow rule before resolution. I normalize with `posixpath.normpath` first, block `..` in glob patterns, and made unmatched reads deny instead of allow. The test suite covers all three.

### 8. "Why a custom tool loop instead of deepagents/LangGraph?"

`deepagents` is in the requirements and informed the design, but the filesystem/permission API moved between versions. An explicit LangChain loop made the guardrail and tool trace inspectable, and it's easy to test. If I needed checkpointing and multi-agent handoffs, I'd move to LangGraph.

### 9. "What happens at 10k tickets a day?"

Postgres for tickets/evals, the harness on object storage or a Git host with a single writer, a queue for synthesis and eval jobs, per-tenant memory isolation, rate limits, cost caps per conversation, and async evals with polling. SQLite and a local repo are deliberate small-scale choices, not an accident.

### 10. "Why DeepSeek?"

Cost per benchmark run is pennies, the API is OpenAI-compatible, and it forces provider portability. `llm.py` falls back to OpenAI if the DeepSeek key is absent. A multi-provider eval table is next.

### 11. "What was the hardest part?"

Making the measurement trustworthy. The first baseline graded Q1 as a failure that looked like judge error; it was a real product bug. The judge is strict, the harness mutates during eval runs, and memory writes can leak between questions. Separating product bugs from measurement noise took longer than building either loop.

### 12. "What would you do with two more weeks?"

Add the held-out set and multiple seeds; stream responses; add auth and rate limits; deploy with a persistent volume; measure cost and p95 latency; run the same harness on three providers.

### 13. "What did you learn?"

Evals are product work, not QA. The interesting failures were not "the model can't answer" — they were permission bypasses, a dropped final message, and memory writes changing the next question. The harness and the benchmark are the product.
