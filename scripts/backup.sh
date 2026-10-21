#!/usr/bin/env bash
# Snapshot the durable state: harness Git repo + working tree + SQLite DB.
# Usage: ./scripts/backup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="$ROOT/backups"
HARNESS="$ROOT/harness"
DB="$ROOT/backend/harness_ops.db"

mkdir -p "$DEST"

if [[ -d "$HARNESS/.git" ]]; then
  git -C "$HARNESS" bundle create "$DEST/harness-$TS.bundle" --all >/dev/null
  tar -czf "$DEST/harness-worktree-$TS.tgz" -C "$ROOT" harness
  echo "harness  -> backups/harness-$TS.bundle"
  echo "worktree -> backups/harness-worktree-$TS.tgz"
else
  echo "warn: $HARNESS is not a git repo; skipping harness backup" >&2
fi

if [[ -f "$DB" ]]; then
  sqlite3 "$DB" ".backup '$DEST/harness_ops-$TS.db'"
  echo "sqlite   -> backups/harness_ops-$TS.db"
fi

if [[ -d "$ROOT/benchmark/results" ]]; then
  tar -czf "$DEST/benchmark-$TS.tgz" -C "$ROOT" benchmark/results
  echo "results  -> backups/benchmark-$TS.tgz"
fi

# Keep the ten most recent of each artifact.
for pattern in "harness-*.bundle" "harness-worktree-*.tgz" "harness_ops-*.db" "benchmark-*.tgz"; do
  # shellcheck disable=SC2012
  ls -1t "$DEST"/$pattern 2>/dev/null | tail -n +11 | while read -r old; do
    rm -f "$old"
  done
done

echo
echo "Snapshot $TS complete: $(du -sh "$DEST" | cut -f1) in backups/"
echo "Copy this folder somewhere off-machine (or push it to a private repo)."
