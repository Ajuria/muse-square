#!/usr/bin/env bash
# PreToolUse guard (Bash) — CLAUDE.md § Placement des fichiers (owner 04/09/2026).
# Avant tout `git commit`, chaque fichier INDEXÉ doit être à sa place (tools/build/placement-check.mjs --staged).
# Refuse le commit sinon : un fichier hors de sa place ne s'explique pas dans le message, il se range.
# Fails OPEN on any parse issue (pas de node, pas de jq) — comme block-git-add-all.sh.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0
printf '%s' "$cmd" | grep -qE '(^|[;&|])[[:space:]]*git[[:space:]]+commit' || exit 0

DIR="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$DIR" ]; then DIR="$(cd "$(dirname "$0")/../.." && pwd)"; fi
cd "$DIR" 2>/dev/null || exit 0
[ -f tools/build/placement-check.mjs ] || exit 0

out=$(node tools/build/placement-check.mjs --staged 2>&1) && exit 0
jq -n --arg m "$out" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:("Blocked: un fichier indexé est hors de sa place (CLAUDE.md § Placement). Le ranger, pas contourner.\n" + $m)}}'
exit 0
