#!/usr/bin/env bash
# PreToolUse guard (Bash) — block `git add .` / `git add -A` / `git add --all`.
# CLAUDE.md: stage explicit files, never `git add .`. Only whole-tree adds are
# blocked; `git add <path> ...` passes. Fails OPEN on any parse issue.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

# Grab each `git add ...` segment anchored at a command boundary (start or ; & |),
# so a "git add ." appearing inside a quoted -m message is not matched.
segs=$(printf '%s' "$cmd" | grep -oE '(^|[;&|])[[:space:]]*git[[:space:]]+add[^;&|]*') || exit 0
[ -z "$segs" ] && exit 0

# Block if any segment's args are a bare `.` / `./`, or use -A / --all.
if printf '%s' "$segs" | grep -qE '([[:space:]])(-A|--all|\.|\./)([[:space:]]|$)'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Blocked: `git add .` / `-A` / `--all` stages the whole tree. CLAUDE.md requires staging explicit files — re-run as `git add <path> <path> ...` naming each file."}}'
fi
exit 0
