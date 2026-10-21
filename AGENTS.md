# OpenCode Project Rules — HarnessOps

You are building **HarnessOps**, a full-stack self-improving production support agent demonstrating Harness Engineering.

## Core Architecture References
- Always read `@PRD.md`, `@SPEC.md`, and `@SEED_DATA.md` before creating or modifying files.
- Never hardcode agent workflows in Python when they belong in `./harness/INSTRUCTIONS.md` or `./harness/skills/*/SKILL.md`.
- Keep `./harness` as its own local Git repository (`git init` inside `./harness`) so the backend can commit and roll back Markdown changes independently.

## Coding Rules for DeepSeek Flash 4.1
1. **Write Complete Files:** Never leave `# TODO` or placeholder comments. Write complete, runnable code.
2. **Modular Fallback for `deepagents`:** In `backend/app/agent.py`, use `deepagents` (`create_deep_agent`, `FilesystemBackend`, `FilesystemPermission`) as specified in `SPEC.md`. Also include a clean LangGraph/LangChain fallback wrapper if `deepagents` API signatures differ across installed versions, so the app is 100% guaranteed to run out of the box.
3. **Strict Path Isolation:** Enforce per-user memory isolation so `user_id="nina"` can only read/write `/memory/users/nina/AGENTS.md` and cannot access `/memory/users/omar/AGENTS.md`.
4. **Verify Each Phase:** After writing files in a phase, run terminal checks (`python -m py_compile` or `npm run build`) to confirm there are no syntax or import errors before finishing your turn.
