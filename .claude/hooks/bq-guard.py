#!/usr/bin/env python3
"""PreToolUse guard (Bash|Write|Edit) — block a BigQuery reference to a
`muse-square-open-data.<dataset>.<table>` that is NOT in docs/bq-catalog.allowlist.json.

Enforces CLAUDE.md's zero-guessing rule for table/column names. Fails OPEN
(allows) on any parse/IO ambiguity — a guard that false-positives gets disabled.
Only literal, fully-qualified refs are checked; template refs (`${projectId}.…`)
and INFORMATION_SCHEMA are skipped because they can't be resolved statically.
"""
import sys, os, re, json


def allow(_reason=None):
    # No output + exit 0 => tool proceeds normally.
    sys.exit(0)


def deny(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        allow()

    ti = data.get("tool_input") or {}
    chunks = [ti.get(k) for k in ("command", "content", "new_string", "file_text")]
    text = "\n".join(c for c in chunks if isinstance(c, str))
    if "muse-square-open-data" not in text:
        allow()

    proj = os.environ.get("CLAUDE_PROJECT_DIR") or "."
    allow_path = os.path.join(proj, "docs", "bq-catalog.allowlist.json")
    try:
        with open(allow_path) as f:
            known = set(json.load(f)["tables"].keys())
    except Exception:
        allow()  # no catalog -> don't block work

    # Strip backticks so `proj`.`ds`.`tbl` and `proj.ds.tbl` both normalise.
    flat = text.replace("`", "")
    pat = re.compile(r"muse-square-open-data\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)")

    unknown, seen = [], set()
    for ds, tbl in pat.findall(flat):
        if tbl.upper() == "INFORMATION_SCHEMA" or ds.upper() == "INFORMATION_SCHEMA":
            continue
        key = f"{ds}.{tbl}"
        if key in seen:
            continue
        seen.add(key)
        if key not in known:
            unknown.append(key)

    if unknown:
        deny(
            "BigQuery reference(s) not in docs/bq-catalog.allowlist.json "
            "(live INFORMATION_SCHEMA snapshot): " + ", ".join(sorted(unknown)) + ". "
            "If the table was just created, regenerate docs/bq-catalog.json from "
            "INFORMATION_SCHEMA; otherwise verify the exact name via the bq-verify "
            "skill before querying. Zero-guessing rule (CLAUDE.md)."
        )
    allow()


if __name__ == "__main__":
    main()
