#!/usr/bin/env bash
# Start the HarnessOps backend and Studio together.
# Usage: ./scripts/dev.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8010}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:$BACKEND_PORT}"

if [[ ! -x "$ROOT/backend/.venv/bin/uvicorn" ]]; then
  echo "backend/.venv is missing. Run:" >&2
  echo "  python3.11 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements.txt" >&2
  exit 1
fi

cleanup() {
  echo
  echo "Stopping…"
  [[ -n "${BACK_PID:-}" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if lsof -nP -iTCP:"$BACKEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "API already listening on :$BACKEND_PORT — leaving it running."
  BACK_PID=""
else
  (
    cd "$ROOT/backend"
    .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT"
  ) &
  BACK_PID=$!
fi

(
  cd "$ROOT/frontend"
  NEXT_PUBLIC_API_BASE="$API_BASE" npm run dev -- --port "$FRONTEND_PORT"
) &
FRONT_PID=$!

echo
echo "Studio:  http://localhost:$FRONTEND_PORT"
echo "API:     $API_BASE/docs"
echo

wait
