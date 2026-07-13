# Engagements (commitments) — as-built

A user commits to an action seeded from a surfaced action card ("M'engager"). The app
measures whether the metric moved (residual-based) and resolves met / missed / confounded /
pending / expired. Surfaces: create (pulse feed card) → ledger ("Mes engagements", pulse) →
resolve (cron) → **Consulter l'évolution** page + capture.

> **Source-of-truth rule.** For anything drift-prone (columns, enums, thresholds) this doc
> points at the code that owns it. If this doc and the code disagree, the code wins — fix
> this doc. Keep it current; a stale as-built misleads worse than none.

---

## 1. Data contract — `analytics.action_commitments`

BigQuery EU, project `muse-square-open-data`, dataset `analytics`. **Append-only event log**:
every transition writes a COMPLETE new row (full snapshot), latest via
`ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC)`.

**Authoritative column list = `COLUMN_SPEC` in [`src/lib/actionCommitments.ts`](../../src/lib/actionCommitments.ts)**
(48 cols, in DDL order; drives the interface, the INSERT column list, the VALUES params, and
the typed nulls). The referenced `action_commitments.ddl.sql` is **not checked in** — the live
BigQuery table + `COLUMN_SPEC` are the source of truth (verified in lockstep 2026-07-08).

Column groups (see COLUMN_SPEC for exact names/types):
- **identity/lifecycle** — `commitment_id`, `user_id`, `location_id`, `status`
  (`open|pending|resolved|expired|cancelled`), `authorship`, `created_at`, `updated_at`,
  `transition_type` (`created|disposition|resolved|retro|…`), `verdict`
  (`met|missed|confounded|null`).
- **origin** — `origin_kind` (`action_card`), `origin_action_type` (the card type; gated by the
  allowlist, §4), `origin_suppression_key`, `origin_card_instance_id`, `origin_affected_date`.
- **terms** — `measured_metric` (`revenue_residual`), `window_kind` (`day_of|7d|14d`),
  `window_start`, `window_end`, `window_days_expected`, `threshold_level` (`modeste|net`),
  `threshold_basis` (`residual_z`), `threshold_value`.
- **commitment body** — `committed_action_text`, `owner_person_name`, `owner_person_id`.
- **creation context** — `creation_residual_pct`, `creation_residual_z`, `creation_confidence_tier`.
- **capture** — `action_done_status` (`fait|pas_encore`), `action_done_at`, `dispositif_note`,
  `retro_note`.
- **resolution** — `resolved_at`, `window_actual_revenue`, `window_expected_revenue`,
  `window_residual_pct`, `window_residual_z`, `window_residual_z_raw`, `applied_rho`,
  `applied_vif`, `window_days_resolved`.
- **resolution context** — `ctx_any_school_holiday`, `ctx_school_holiday_days`,
  `material_holiday_share`, `ctx_worst_weather_impact_pct`, `ctx_max_event_count`,
  `ctx_max_tourism_index`, `ctx_material_confound`.

---

## 2. Endpoints

All Clerk-gated (`locals.clerk_user_id`) + `requireLocationOwnership(locals, location_id)`.
`FORBIDDEN…` → 403. JSON, `cache-control: no-store`.

| Route | Method | Request | Response / effect |
|---|---|---|---|
| [`/api/commitments`](../../src/pages/api/commitments/index.ts) | POST | `{ location_id, origin_action_type, window_kind, threshold_level, committed_action_text, owner_person_name, origin_suppression_key?, origin_card_instance_id?, origin_affected_date?, creation_residual_pct?, creation_residual_z?, creation_confidence_tier? }` | Validates required fields, `isCommitmentOrigin` allowlist (400), `window_kind ∈ WINDOW_DAYS` (400), `threshold_level ∈ THRESHOLD_Z` (400). Creates `status=open`, `window_start=today`, `window_end=today+days-1`. `{ ok, commitment_id }`. |
| [`/api/commitments?location_id=`](../../src/pages/api/commitments/index.ts) | GET | query `location_id` (**required**) | `{ ok, items:[latest snapshot per commitment, excl. cancelled] }` — the engagement cards **for that site**. Uses the **same `requireLocationOwnership` as create** (no read/write asymmetry). Rendered as a full `card_type=engagement` **action card in "Actions du jour"** (first cards, `#pls-engagement-cards`) via a separate fetch — fetched per **in-view** site (all aggregate sites merged, or the single viewed site) like a system card, re-fetched after a create. |
| [`/api/commitments/disposition`](../../src/pages/api/commitments/disposition.ts) | POST | `{ commitment_id, location_id, action_done_status:'fait'\|'pas_encore', dispositif_note? }` | writes `action_done_status` + `action_done_at` (+ note if provided). |
| [`/api/commitments/retro`](../../src/pages/api/commitments/retro.ts) | POST | `{ commitment_id, location_id, retro_note }` | writes `retro_note`. 409 unless status `resolved|expired`. |
| [`/api/commitments/evolution?commitment_id=`](../../src/pages/api/commitments/evolution.ts) | GET | query `commitment_id` | `{ ok, commitment (z-free), series[], holiday_norm, context, provenance, advice }` — feeds the évolution page. **z fields never leave this boundary.** |
| [`/api/cron/commitment-resolve`](../../src/pages/api/cron/commitment-resolve.ts) | GET | `Authorization: Bearer CRON_SECRET` | Resolves `status ∈ (open,pending)` with a closed window. Deterministic, idempotent, no AI. |

---

## 3. File ownership (single source of — don't re-code elsewhere)

| File | Owns |
|---|---|
| [`src/lib/actionCommitments.ts`](../../src/lib/actionCommitments.ts) | `COLUMN_SPEC` (the schema), `CommitmentRow`, `readMergeWrite` (full-snapshot read-merge-write via INSERT DML), `readLatestSnapshot`. |
| [`src/lib/commitmentConstants.ts`](../../src/lib/commitmentConstants.ts) | `WINDOW_DAYS`, `THRESHOLD_Z`, `MATERIAL_SHARE=0.5`, `GRACE_DAYS=30`, `RHO_FLOOR=0.40`. |
| [`src/lib/commitmentOrigins.ts`](../../src/lib/commitmentOrigins.ts) | `COMMITMENT_ORIGIN_ACTION_TYPES` — which card types may seed a commitment (§4). |
| [`src/lib/commitmentResolve.ts`](../../src/lib/commitmentResolve.ts) | Residual resolution: VIF from measured ρ, asymmetric confound gate, verdict. |
| [`src/lib/commitmentContext.ts`](../../src/lib/commitmentContext.ts) | Évolution extras: §2d holiday-norm, ② context, provenance, ③ advice (keys only, z-free, French-free). |
| [`src/lib/commitmentCopy.ts`](../../src/lib/commitmentCopy.ts) | **Owner-editable** — every French string on the évolution page (tokened templates; injected via `define:vars`). |
| [`public/reco-library.js`](../../public/reco-library.js) | **Owner-editable** — the 3 recommended actions per sales card/driver (§5). |
| [`public/commit-form.js`](../../public/commit-form.js) | Shared `window.MSCommitForm` create-form builder/wirer (used by the évolution advice CTAs). |
| [`src/pages/app/insightevent/engagement.astro`](../../src/pages/app/insightevent/engagement.astro) | The évolution page (rapport look; ① goal + chart, ② context, ③ advice, ④ capture, sources). |

---

## 4. Origin allowlist (v1)

`COMMITMENT_ORIGIN_ACTION_TYPES` (commitmentOrigins.ts): `sales_surge`,
`sales_revenue_down_wow`, `sales_traffic_not_converting`, `sales_discount_no_lift`,
`footfall_vs_basket_decomposition`. The create endpoint rejects anything else (400). The set
has a TODO to grow to opportunity/threat/weather/tourism families — copy exact strings from the
`SPECS` registry in `action-cards.js`, never hand-type.

**INVARIANT — reco coverage must match this allowlist (§5).**

---

## 5. Create-form action proposal (first-class component)

The "Mon action" field proposes **up to 3 driver-matched recommended actions**; the user picks
one → it fills the field, still editable. This is the create-form's core value — **not** the
sowhat surveillance line.

Plumbing (the piece that silently regressed once — see §7):
1. **Content** lives in [`public/reco-library.js`](../../public/reco-library.js) →
   `window.MS_SALES_RECO_LIB` = `{ card_type: { driver: [a1,a2,a3], _default:[…] } }`.
   Owner-editable; each line clears the Card Quality Bar (specific / controllable / €-relevant /
   vertical-correct / non-obvious).
2. **Wiring**: `action-cards.js` reads the lib and attaches `spec.recos(item)` (the 3, for the
   form) and `spec.reco(item)` (top one, for the sales report). Degrades to `[]` / `''` if the
   lib isn't loaded — never throws, never wrong text.
3. **Load order**: surfaces that show recos must load `/reco-library.js` **before**
   `/action-cards.js` — currently **pulse** (the form) and **rapport** (the report). Monitor
   loads action-cards.js but never calls recos.
4. **Render**: pulse computes `entry.item.__suggested_actions = spec.recos(item)` at card
   render; `cmSuggestionsHtml` renders the rows; clicking fills `data-cm-action` (editable).

**INVARIANT — every `COMMITMENT_ORIGIN_ACTION_TYPES` entry MUST have a reco-library entry.**
When the allowlist grows, add recos in lockstep, or "Mon action" is empty for that origin.

---

## 6. Load-bearing invariants (do not re-litigate / revert)

- **Full-snapshot read-merge-write** via **INSERT DML, not streaming** — DML is immediately
  visible to the next SELECT (create → quick-disposition won't hit the streaming buffer).
  Typed NULL params driven by `COLUMN_SPEC`.
- **z hidden everywhere user-facing** — the evolution endpoint curates a z-free `commitment` and
  per-day `residual_pct` only; the page renders `%`, never z. (Report/pulse ledger likewise.)
- **`expected_revenue` = dow + trend only; it does NOT model holidays.** So the **holiday-norm**
  (§2d: `AVG(residual_pct)` on the location's holiday days, history-based) is a SEPARATE number,
  surfaced in ① so a holiday-window "+X%" is legible as below the holiday baseline. Never fold
  the two.
- **Asymmetric confound gate** — a material holiday share (`≥ MATERIAL_SHARE`) flips a
  provisional **met → confounded**; **misses are never gated** (a miss under a favorable calendar
  is still a miss).
- **Advice is honest/methodological only** — keys from `commitmentContext.ts`, no fabricated
  causal %; ③ omitted entirely when no rule fires (never "rien à tenter").
- **② is quantified-only (interim)** — only measured associations past a confidence gate; no bare
  signal lists.
- **Engagement = a real ACTION CARD in "Actions du jour", not a feed row.** An engagement
  renders through the **full system `.ab-card` anatomy** (`_cgActionCardHtml`), `card_type=engagement`,
  as the **first cards in Actions du jour** (mount `#pls-engagement-cards`, above the system
  cards) — NOT a stripped row, NOT in "Fil d'actualité", NOT a daily candidate. Full anatomy
  (locked spec): pills `[Engagement][state][site]`, `ab-what`/`ab-sowhat`, verdict pill + owner,
  **Agir menu per state** (open/pending → Modifier · Consulter l'évolution; resolved/expired →
  Consulter l'évolution · Répliquer), **"Action menée ?" disposition** (open/pending: Fait / Pas
  encore → `POST /api/commitments/disposition`; resolved: read-only state), 5-state verdict pills
  + amber dot. Wiring is a dedicated `data-eng-*` namespace attached after inject
  (`wireEngagementCards`). ⚠️ A read-only "Voir l'évolution →" feed row is a REGRESSION — the
  card must have Agir + disposition.
- **Engagement data = separate fetch merged per in-view site.** Comes from a SEPARATE fetch (not
  the daily candidates, so the regen never wipes it; an open engagement re-appears every day until
  resolved). **Scope = the exact sites the feed covers**:
  `_engagementLocs = isMultisite ? data._locations.map(l=>l.location_id) : [currentLocationId]`,
  fetched per-site (`GET /api/commitments?location_id=`) and merged — an engagement shows wherever
  its site's system cards show. NOT all-owned (site A's engagement must not show when A isn't in
  view). NOT the fixed `currentLocationId` alone (always the primary, never follows the view — it
  hid non-primary aggregate sites' engagements: the Occitanie bug).
- **Read scope == write scope.** The list GET and the create POST use the SAME
  `requireLocationOwnership(location_id)` — a commitment is readable exactly where it was
  writable. Never scope the list off raw `all_location_ids` (that bypasses the check and creates
  a read/write asymmetry — the empty-ledger bug).

---

## 7. Deferred / known limits

- **Measured-impact engine** (queued) — the real ②/③: per-driver impact decomposed onto
  attendance vs basket over history, competitor-by-radius density, and finishing the learning
  loop (`mart.fct_location_action_learning`, currently `has_sufficient_sample=false`). See memory
  `measured-impact-engine-queued`. Until then ② is quantified-only and ③ is rule-based.
- **Suppression-on-commit** — `origin_suppression_key` is captured but committing does not yet
  suppress the originating card. Not wired.
- **Paris-grain production-trust** — `day_of` resolves against `DATE(created_at, 'Europe/Paris')`;
  grain is correct but end-to-end production trust (DST edges, ingestion timing vs Paris business
  day) is not yet hardened.
- **Reco coverage** — recos exist for the 5 allowlisted sales types + `sales_competition_cannibalization`
  (report-only). Non-sales origins are not yet allowlisted, so have no recos by design.
