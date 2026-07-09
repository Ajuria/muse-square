#!/usr/bin/env bash
# Regenerate docs/bq-catalog.json (+ .allowlist.json) from LIVE BigQuery
# INFORMATION_SCHEMA — this is "Truth B" and the allowlist the bq-guard hook
# checks against. Run it after dbt changes land (or on a schedule / in CI) so a
# newly created table stops being flagged as unknown.
#   Requires: bq (authenticated, EU), python3, git.
#   Optional env: MS_DBT_DIR (dbt repo checkout, for the SHA stamp).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="muse-square-open-data"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Pulling INFORMATION_SCHEMA from $PROJECT (EU)…"
bq query --location=EU --use_legacy_sql=false --format=json --max_rows=100000 \
  "SELECT table_schema, table_name, table_type FROM \`$PROJECT.region-eu\`.INFORMATION_SCHEMA.TABLES ORDER BY table_schema, table_name" > "$TMP/tables.json"
bq query --location=EU --use_legacy_sql=false --format=json --max_rows=500000 \
  "SELECT table_schema, table_name, column_name, data_type, ordinal_position FROM \`$PROJECT.region-eu\`.INFORMATION_SCHEMA.COLUMNS ORDER BY table_schema, table_name, ordinal_position" > "$TMP/columns.json"

DBT_SHA="$(git -C "${MS_DBT_DIR:-$HOME/Documents/ms_database}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
GEN_DATE="$(date +%F)"

python3 - "$TMP" "$ROOT" "$DBT_SHA" "$GEN_DATE" "$PROJECT" <<'PY'
import json, sys
tmp, root, sha, gen, project = sys.argv[1:6]
tables = json.load(open(f"{tmp}/tables.json"))
cols = json.load(open(f"{tmp}/columns.json"))
cat = {}
for t in tables:
    cat[f"{t['table_schema']}.{t['table_name']}"] = {"type": t["table_type"], "columns": []}
for c in cols:
    k = f"{c['table_schema']}.{c['table_name']}"
    if k in cat:
        cat[k]["columns"].append({"name": c["column_name"], "type": c["data_type"]})
meta = {
    "purpose": "SNAPSHOT of live BigQuery schema. Allowlist source for the bq-guard hook. Re-verify columns live via bq-verify before trusting.",
    "generated_date": gen, "project": project, "region": "EU",
    "dbt_repo_sha_at_generation": sha,
    "table_count": len(cat),
    "column_count": sum(len(v["columns"]) for v in cat.values()),
}
json.dump({"_meta": meta, "tables": cat}, open(f"{root}/docs/bq-catalog.json", "w"), ensure_ascii=False, indent=0)
allow = {k: [c["name"] for c in v["columns"]] for k, v in cat.items()}
json.dump({"generated_date": gen, "tables": allow}, open(f"{root}/docs/bq-catalog.allowlist.json", "w"), ensure_ascii=False)
print(f"catalog refreshed: {meta['table_count']} tables, {meta['column_count']} columns @ {gen} (dbt {sha})")
PY
