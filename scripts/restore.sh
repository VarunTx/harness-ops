#!/usr/bin/env bash
# Restore harness + SQLite from a snapshot created by scripts/backup.sh.
# Usage: ./scripts/restore.sh 20261021-112100
#        ./scripts/restore.sh --list
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/backups"
HARNESS="$ROOT/harness"
DB="$ROOT/backend/harness_ops.db"

if [[ "${1:-}" == "--list" ]]; then
  echo "Available snapshots:"
  ls -1 "$DEST" 2>/dev/null \
    | sed -nE 's/^harness-worktree-(.*)\.tgz$/\1/p; s/^harness-(.*)\.bundle$/\1/p; s/^harness_ops-(.*)\.db$/\1/p' \
    | sort -u -r || true
  exit 0
fi

TS="${1:-}"
if [[ -z "$TS" ]]; then
  echo "usage: $0 <snapshot-timestamp> | --list" >&2
  exit 1
fi

WORKTREE="$DEST/harness-worktree-$TS.tgz"
BUNDLE="$DEST/harness-$TS.bundle"
DBFILE="$DEST/harness_ops-$TS.db"

if [[ ! -f "$WORKTREE" && ! -f "$BUNDLE" && ! -f "$DBFILE" ]]; then
  echo "No snapshot found for $TS in $DEST" >&2
  exit 1
fi

echo "This will replace ./harness and backend/harness_ops.db with snapshot $TS."
read -r -p "Continue? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }

STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -f "$WORKTREE" ]]; then
  [[ -d "$HARNESS" ]] && mv "$HARNESS" "$ROOT/harness.pre-restore-$STAMP"
  tar -xzf "$WORKTREE" -C "$ROOT"
  echo "restored harness/ from worktree archive"
elif [[ -f "$BUNDLE" ]]; then
  [[ -d "$HARNESS" ]] && mv "$HARNESS" "$ROOT/harness.pre-restore-$STAMP"
  git clone -q "$BUNDLE" "$HARNESS"
  echo "restored harness/ from Git bundle"
fi

if [[ -f "$DBFILE" ]]; then
  [[ -f "$DB" ]] && cp "$DB" "$DB.pre-restore-$STAMP"
  cp "$DBFILE" "$DB"
  rm -f "$DB-wal" "$DB-shm"
  echo "restored backend/harness_ops.db"
fi

echo "Done. Restart the backend so it reconnects to the restored database."
