---
name: trace-data-path
description: Diagnose "why isn't X rendering / updating / appearing / disappearing" in Muse Square by tracing the full pipeline end-to-end BEFORE proposing a fix. Use for any missing, stale, or wrong card, metric, or UI element. Prevents fixing one layer while the real block is upstream.
---

# trace-data-path

Never patch a layer without confirming the layer feeding it. Walk the whole path top-down, locate the exact drop point, prove it with evidence, then fix only that layer.

## The path (action cards / daily brief)
1. **Source:** does the mart/view actually hold the row? (`bq query` `mart.*` / `semantic.vw_*` — check `date`, `expires_at`, `action_category`, `action_priority`.)
2. **Server query + assembly:** does the API return it? `src/pages/api/insight/days.ts` — inspect the WHERE, especially `date IN @selected_dates` window filters that silently drop past-dated rows, and `filterDisabledThemes`. (Clerk-gated; `MS_AUTH_BYPASS` only covers `/api/insight/prompt`, so you can't curl it authed — read the code / query BQ.)
3. **Client fetch:** does it reach `window._lastActionCandidates`? (`pulse.astro` renderPulse.)
4. **Render:** `renderActionCandidates` in `public/action-cards.js` — exact-date match vs perf-on-today; `getAvailableChannels` guards (`notification` card_type / `RULE_ONLY` / seed presence); `isAction`.
5. **Ranking / dedup:** brief top-N + `MAX_PER_CAT` can drop a valid card.
6. **Cache:** is the browser loading the new `action-cards.js?v=`? Static file → bump `?v` on the consuming surface + hard-refresh. API-route `.ts` (days.ts) → restart the dev server (Astro dev doesn't reliably hot-reload it).

## Rule
State which layer drops it, with evidence, before writing any fix. Then fix only that layer — and re-trace once more to confirm nothing downstream also blocks it.
