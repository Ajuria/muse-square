# Muse Square — Project Instructions

## Stack
- Astro SSR + TypeScript, Vercel deployment
- BigQuery EU (project: `muse-square-open-data`) — all data lives here
- `ms-database-472505` is billing-only — never query it for app data
- dbt Cloud IDE (never run dbt CLI commands — all dbt work happens in dbt Cloud IDE)
- Clerk v3 for auth
- Repo: git@github.com:Ajuria/muse-square.git, branch: `dev`

## Code Discipline
- SINGLE SOURCE OF TRUTH (code): `docs/module-index.md` maps every endpoint, lib, script and surface. Before creating ANY new API route, lib module, or client script, grep it for the capability (`sales`, `competitor`, `commitment`, `sensitivity`, …) and extend the existing file instead of duplicating. When you change a file's handlers or data sources, update its row in the same commit.
- SINGLE SOURCE OF TRUTH (data): `docs/data-model-index.md` maps every dbt model (grain, lineage, columns) + the live BQ catalog (`docs/bq-catalog.json`). Before creating a new dbt model or writing a query, grep it so you don't fork an existing mart/view. The BQ catalog is a SNAPSHOT — still re-verify exact columns live via `bq-verify` before querying (incremental models drop new columns without `--full-refresh`).
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

## Localization (France — non-negotiable)
- The product is French, based in France. ALL user-facing dates render `JJ/MM/AAAA` (day/month/year) — NEVER US `YYYY-MM-DD` or `MM/DD/YYYY`. Keep ISO `Y-m-d` only as the internal/API value (store it in `data-iso` or a hidden field); display the French form.
- Numbers/currency: French formatting (comma decimal, € after the number) via the existing `frDec`/`frInt` helpers — never raw JS `toString()`.
- No US-centric defaults anywhere in user-facing copy or inputs.
- Do NOT depend on a CDN for formatting/UX libs (flatpickr, Leaflet, etc.) — CDNs fail under VPN/CSP and silently fall back to broken output. Self-host the lib (Leaflet is already self-hosted) OR make the feature work without it. A date/format fix that only works when a CDN loads is not a fix.

## Communication Style
- Be direct. No options or rationale unless explicitly asked.
- Exact guidance, exact file locations, exact code.
- No ballpark, no approximation.
- If you don't know, say so — don't guess.

## Data Path (trace before fixing)
- "Why isn't X rendering/updating?" — trace the WHOLE path before any fix: BigQuery/view → API query+assembly (e.g. `src/pages/api/insight/days.ts`, watch `date IN @selected_dates` window filters that drop past-dated rows; `filterDisabledThemes`) → client fetch (`window._lastActionCandidates`) → render (`renderActionCandidates` in `public/action-cards.js`) → brief top-N / MAX_PER_CAT. Fixing the client without checking the server query is the #1 wasted-effort trap. (See skill: trace-data-path.)
- `public/action-cards.js` is STATIC (served fresh, no build/HMR) but browser-cached by `?v=` — bump the cache-buster on the consuming surface (pulse.astro ~326, monitor ~285, insight ~137) + hard-refresh. Astro dev does NOT reliably hot-reload API-route `.ts` (e.g. `days.ts`) — restart the dev server after server-side edits.
- Action-candidate / performance cards may carry an INGESTION date (past; `date = expires_at`), not an action date — they're surfaced on TODAY (days.ts widens the fetch; `renderActionCandidates` renders latest-per-type on today). Don't assume `date` = when actionable.
- App is Clerk-gated; `MS_AUTH_BYPASS=1` only bypasses `/api/insight/prompt` — you can't curl pulse/days authed. E2E = user clicks, you query BigQuery.

## Verify Before Done
- `.astro` inline scripts and `public/action-cards.js` are plain JS — `node --check` them (extract the inline `<script>` for `.astro`) after edits; `.ts` → `npx tsc --noEmit`. Do this before claiming a change complete.
- The Edit tool normalizes hand-typed `\uXXXX` back to the character. To write unicode escapes into an inline script, use a python pass building the escape from `chr(92)`, matching on the raw char.

## App-repo Git flow (deploy)
- Verify repo first (`git remote -v` → `Ajuria/muse-square`, the APP repo — not the dbt repo `ms_database`). Stage explicit files, never `git add .`.
- dev→prod: commit on dev → `git push origin dev` → `git checkout main` → `git merge --ff-only origin/main` (guard, abort if diverged) → `git merge --no-ff dev` (merge commit, never squash) → `git push origin main` → `git checkout dev`.

## Card Quality Bar
- Every action card must tell the operator something TRUE they couldn't see themselves AND point at something they can MOVE — no 101 advice below their level. Robust baselines (noise band, not single day-pair), honest decomposition (no "mixed"), causal-safe attribution (confidence tier, no fabricated %), specific + €-quantified + non-obvious + controllable actions, vertical-correct vocabulary. (See skill: card-review; memory: card-quality-and-edge-roadmap, opportunity-cards-bespoke-vision.)