#!/usr/bin/env bash
# Stop hook — after a turn, if code changed, run tsc + node --check and report failures.
# Personal (lives in settings.local.json, which is gitignored). Manage/disable via /hooks.
set -uo pipefail

DIR="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$DIR" ]; then DIR="$(cd "$(dirname "$0")/../.." && pwd)"; fi
cd "$DIR" 2>/dev/null || exit 0

# Skip turns with no uncommitted .ts/.astro/.js changes (e.g. pure conversation) — keeps it fast.
if ! { git diff --name-only; git diff --cached --name-only; } 2>/dev/null | grep -qE '\.(ts|astro|js)$'; then
  exit 0
fi

msg=""
if ! tsc_out=$(npx tsc --noEmit 2>&1); then
  msg="tsc --noEmit failed:
$(printf '%s' "$tsc_out" | tail -n 15)"
fi
if ! ac_out=$(node --check public/action-cards.js 2>&1); then
  msg="${msg:+$msg
}action-cards.js syntax error: $ac_out"
fi

if [ -n "$msg" ]; then
  jq -n --arg m "$msg" '{systemMessage: ("Build check failed before turn end:\n" + $m)}'
fi
exit 0
