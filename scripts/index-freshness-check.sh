#!/usr/bin/env bash
# Shared index-freshness rule — the SINGLE source of truth for both the
# .githooks/pre-commit gate and the GitHub Actions CI, so the two never drift.
#
# Usage:  git diff --name-status <range> | index-freshness-check.sh <INDEX_FILE> <REGEX>
#   $1  INDEX_FILE  path that must change when indexed files do (e.g. docs/module-index.md)
#   $2  REGEX       ERE matching the code files that INDEX_FILE tracks
#
# Exit 1 (hard fail) when an indexed file was ADDED or DELETED without INDEX_FILE
# also changing — that guarantees drift. MODIFIED-only indexed files produce a
# non-blocking reminder (exit 0), since not every edit changes an index row.
set -uo pipefail

INDEX="${1:?index file arg required}"
RE="${2:?indexed-files regex arg required}"

status="$(cat)"
[ -z "$status" ] && exit 0

index_changed=no
printf '%s\n' "$status" | awk '{print $2}' | grep -qx "$INDEX" && index_changed=yes

newdel=$(printf '%s\n' "$status" | awk '$1 ~ /^[AD]/ {print $2}' | grep -E "$RE" || true)
modified=$(printf '%s\n' "$status" | awk '$1 ~ /^[MR]/ {print $2}' | grep -E "$RE" || true)

rc=0
if [ -n "$newdel" ] && [ "$index_changed" = no ]; then
  {
    echo "✗ Index drift: files were added/removed without updating $INDEX:"
    printf '    %s\n' $newdel
    echo "  → add/remove the matching row in $INDEX and include it in this change."
    echo "    (local commit bypass for a genuine false positive: git commit --no-verify)"
  } >&2
  rc=1
fi
if [ -n "$modified" ] && [ "$index_changed" = no ]; then
  {
    echo "• Reminder: indexed files changed without touching $INDEX —"
    echo "  update the row if a handler or data source changed:"
    printf '    %s\n' $modified
  } >&2
fi
exit $rc
