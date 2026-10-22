# Security

HarnessOps is a single-tenant demo. It has no authentication and should not be exposed to the public internet with a real API key and real user data without additional controls.

## Reporting a vulnerability

Please open a private security advisory on GitHub:

<https://github.com/Varun-TT/harness-ops/security/advisories/new>

Do not open a public issue for a guardrail bypass, path traversal, or prompt-injection finding.

## Threat model

The interesting security surface is the agent's filesystem tools:

- `read_file`, `glob_files`, and `update_user_memory` operate on the `harness/` directory.
- `_check_permission` is deny-by-default and scopes access to `/memory/users/{user}/**`.
- Paths are normalized with `posixpath.normpath` before matching; `..` segments in glob patterns are rejected.
- Tests in `backend/tests/test_core.py` cover cross-user denial and traversal.

Known limitations:

- No authentication or rate limiting in the demo.
- The LLM can be manipulated by untrusted text in user messages or memory notes. Do not put secrets in the harness.
- The API key is server-side only; never expose it to the frontend.

If you deploy this, add auth, per-IP rate limits, a spend cap, and a private network boundary around the API.
