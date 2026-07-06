---
name: bq-verify
description: Verify a BigQuery table before writing any query against it. Use whenever about to write or modify a BQ query, reference a column/table, or diagnose a data issue in Muse Square (project muse-square-open-data, EU). Pulls the real schema, a sample row, counts and freshness so queries are grounded in truth, never guessed.
---

# bq-verify

Before writing or modifying ANY BigQuery query — or referencing a column/table — verify the target against the live schema. Zero tolerance for guessing (per CLAUDE.md).

## Steps
1. **Locate + schema:** find the dataset via `` `muse-square-open-data`.`region-eu`.INFORMATION_SCHEMA.TABLES `` if unknown, then
   `SELECT column_name, data_type, is_nullable FROM `muse-square-open-data.<dataset>`.INFORMATION_SCHEMA.COLUMNS WHERE table_name = '<t>' ORDER BY ordinal_position`.
2. **Shape + freshness:** `SELECT * ... LIMIT 3`, a `COUNT(*)`, distinct key counts, `MIN/MAX(<date_col>)`, `MAX(ingested_at)` and `DATE_DIFF(CURRENT_DATE(), MAX(<date_col>), DAY)`.
3. **Granularity probe (before any SUM):** confirm whether "daily" fields (visitor_count, transaction_count, avg_basket) are per-row or a daily aggregate repeated on every line — `COUNT(DISTINCT <field>)` per (key, day). Never blindly SUM a possibly-repeated aggregate.

## Rules
- Data lives in `muse-square-open-data` (EU). NEVER query `ms-database-472505` for data (billing only). Run with `--location=EU`.
- Always use explicit `DATE()` casts — the BQ Node client silently returns 0 rows on DATE/STRING mismatch.
- Quote the verified column name + type back before writing the query.
