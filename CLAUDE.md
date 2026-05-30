# Muse Square — Project Instructions

## Stack
- Astro SSR + TypeScript, Vercel deployment
- BigQuery EU (project: `muse-square-open-data`) — all data lives here
- `ms-database-472505` is billing-only — never query it for app data
- dbt Cloud IDE (never run dbt CLI commands — all dbt work happens in dbt Cloud IDE)
- Clerk v3 for auth
- Repo: git@github.com:Ajuria/muse-square.git, branch: `dev`

## Code Discipline
- Before writing ANY column name, table name, or field reference, verify it exists in the codebase or schema. Zero tolerance for guessing.
- Read files before writing. State field mappings before coding.
- One function per message/commit — no sprawling multi-function changes.
- No emoji in inline scripts — use unicode escapes (`\u2705` not ✅).
- No nested template literals inside `.map()` calls.
- Never hardcode IDs, coordinates, or data. All solutions must be pipeline-driven and generic.
- Never delete old functions until replacements are tested.

## Diagnosis Before Fix
- Diagnose first, fix second. Confirm root cause from evidence before proposing code changes.
- Never propose a find-and-replace without first confirming the exact text exists in the target file.
- When something is broken, check `INFORMATION_SCHEMA` or the actual file content before guessing.

## BigQuery Gotchas
- BigQuery Node client silently returns 0 rows on DATE/STRING type mismatches — always use explicit `DATE()` casts.
- `source = 'client'` (not `'profile'`) in `event_industry_keywords_normalization`.
- Incremental dbt models do not pick up new columns without `--full-refresh`.
- Always verify schema via `INFORMATION_SCHEMA` before writing queries.

## Git
- `git status` before committing to confirm exact file paths.
- Push to `dev` branch only.
- Never merge to `main` without confirming the latest commit is pushed to GitHub from dbt Cloud IDE.
- dbt Cloud IDE changes are local until explicitly synced — always confirm sync status.

## Frontend
- Inline styles required for dynamically injected HTML (scoped `<style>` blocks don't reach dynamic content).
- Browser console testing between each step.
- Design tokens in `src/styles/design-tokens.css`. Brand blue: `--color-brand-blue: #0b37e5`. Data blue: `#1D3BB3`. Severity = alerts color.
- Dividers: `ms-divider my-[6px] sm:my-[8px] lg:my-[12px]`.

## Communication Style
- Be direct. No options or rationale unless explicitly asked.
- Exact guidance, exact file locations, exact code.
- No ballpark, no approximation.
- If you don't know, say so — don't guess.