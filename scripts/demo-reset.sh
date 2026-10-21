#!/usr/bin/env bash
# Return to the clean demo state: baseline harness, 4 seeded tickets, empty chat.
# Eval history and applied proposals are kept so the scoreboard still tells the story.
# Usage: ./scripts/demo-reset.sh [--full] [--yes]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="$ROOT/backend/harness_ops.db"
FULL=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$ROOT/harness/.git" ]]; then
  echo "harness/ is missing. Start the backend once to seed it." >&2
  exit 1
fi

echo "Reset plan:"
echo "  - harness -> v0-baseline"
echo "  - tickets > 4 deleted, chat history cleared"
if [[ "$FULL" == "1" ]]; then
  echo "  - eval runs and proposals deleted (full reset)"
else
  echo "  - eval history and proposals kept"
fi

if [[ "$ASSUME_YES" != "1" ]]; then
  read -r -p "Continue? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }
fi

git -C "$ROOT/harness" reset --hard v0-baseline >/dev/null
rm -f "$ROOT/harness/.DS_Store"

if [[ -f "$DB" ]]; then
  sqlite3 "$DB" "delete from escalationticket where id > 4; delete from chatmessagerecord;"
  if [[ "$FULL" == "1" ]]; then
    sqlite3 "$DB" "delete from evalrun; delete from evolutionproposal;"
  fi
fi

echo
echo "Demo state ready:"
echo "  tickets: $(sqlite3 "$DB" 'select count(*) from escalationticket;' 2>/dev/null || echo '?') pending"
echo "  harness: $(git -C "$ROOT/harness" log --oneline -1)"
echo "  next ticket id: $(sqlite3 "$DB" 'select max(id)+1 from escalationticket;' 2>/dev/null || echo '?')"
echo
echo "If the backend is running it will pick up the new harness on the next request."
