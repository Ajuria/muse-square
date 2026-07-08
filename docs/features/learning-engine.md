# Learning engine — dbt model spec (commitment source)

Status: **spec, not built.** Steps 1–2 are dbt Cloud IDE work (marts); step 3 is app wiring.
Build order is gating: dbt models first → app consumers against real/seeded data → verify by
behavior. Do NOT wire the app first (it would render empty against non-existent columns).

## Goal
Close the loop: turn **resolved engagements** into measured, per-location knowledge of which
actions actually move revenue — powering ③ "Comment m'améliorer", the provenance line, reco
ranking, and (later) the per-driver KPI. See [[measured-impact-engine-queued]],
[[sales-signal-architecture-map]], [[card-quality-and-edge-roadmap]].

## Where it stands (checked against BigQuery, not assumed)
The learning tables already EXIST but are wired to the **communication** source:
- `mart.fct_action_outcomes` — grain = `publish_id` (one published post, single `outcome_date`,
  `post_views/clicks/reactions`); its `revenue_delta_vs_baseline_pct` is vs the **naive**
  `revenue_30d_avg`.
- `mart.fct_location_action_learning` — per `(location_id, action_type, window_days)`:
  `publish_count, measurable_count, positive_count, positive_rate,
  avg/median_revenue_delta_vs_baseline_pct, avg_post_*, has_sufficient_sample, is_proven_lift`.

The engagement feature captures the richer signal (verdict, window residual delta,
`action_done_status`, origin, confound) in `analytics.action_commitments`, but **nothing carries
it into the learning marts** — so `commitmentContext`'s provenance reads `has_sufficient_sample =
false`. This spec **extends the loop** to ingest commitments as a source.

## Design principle (locked guardrails)
Commitments and communications are **separate sources with separate effect measures**, aggregated
**per source**, unified only at the location-learning table with a `source` tag and **distinct
effect columns** — never blended into one `positive_rate`. Commitment numbers are an **operator
track record** ("N fois sur M"), never a "proven" effectiveness rate.

**Why a sibling model, not a union into `fct_action_outcomes`:** that table's grain is `publish_id`
(one post, one outcome day, post metrics, naive 30-day-avg baseline). A commitment has no post,
spans 7–14 days, and its effect is the **VIF-corrected dow+trend residual**. Forcing it into the
post grain would mangle the grain or silently pool two incompatible deltas (guardrail 1). So:
new `fct_commitment_outcomes` → union at `fct_location_action_learning`.

---

## Model 1 — `fct_commitment_outcomes` (NEW)
**Grain:** one row per **resolved, done, non-confounded** commitment.
**Source:** latest snapshot per `commitment_id` from `analytics.action_commitments`
(`ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) = 1`).

**Inclusion filter (locked rules):**
- `status = 'resolved'` (drop open/pending/expired/cancelled — no measured outcome)
- `verdict IN ('met','missed')` — **exclude `confounded` and NULL entirely**
- `action_done_status = 'fait'` — exclude `pas_encore`/NULL ("atteint + non menée" = luck)
- net: **resolved ∧ done ∧ verdict∈{met,missed} ∧ ¬confounded**
- Confounded-and-done rows are NOT dropped silently — counted into `confounded_count` at the
  aggregate (a total, neither for nor against).

**Columns:**

| column | source | note |
|---|---|---|
| `commitment_id` | grain key | |
| `location_id`, `user_id` | commitment | `user_id` = authorship |
| `source` = `'commitment'` | constant | for the union |
| `authorship` = `'user_authored'` | constant | keeps it out of the unbiased pool |
| `action_type` | `origin_action_type` | learning key (see driver note) |
| `window_days` | `window_days_expected` | |
| `resolved_date` | `DATE(resolved_at)` | |
| `verdict` | `met`/`missed` | |
| `beat` | `verdict = 'met'` (bool) | |
| **`effect_residual_pct`** | `window_residual_pct` | **the commitment effect — distinct column, NEVER `revenue_delta_vs_baseline_pct`** |
| `effect_residual_z` | `window_residual_z` | kitchen; kept, not surfaced |
| `material_holiday_share` | commitment | context |

Explicitly **omit** post metrics and the naive `revenue_delta_vs_baseline_pct` — comm-only.

---

## Model 2 — `fct_location_action_learning` (EXTEND with a `source` dimension)
Keep the existing communication aggregate **unchanged** (`source='communication'`, its naive
`revenue_delta_vs_baseline_pct`, post metrics, `positive_rate`, `is_proven_lift`). **Add** a
commitment aggregate as new rows.

**Commitment aggregate — grain `(location_id, action_type, window_days)`, `source='commitment'`:**

| column | definition |
|---|---|
| `done_count` | `COUNT(*)` over `fct_commitment_outcomes` |
| `beat_count` | `COUNTIF(verdict='met')` |
| `missed_count` | `COUNTIF(verdict='missed')` |
| `confounded_count` | separate scan: resolved∧done∧confounded (logged only) |
| `avg_effect_residual_pct` | `AVG(effect_residual_pct)` — **distinct from `avg_revenue_delta_vs_baseline_pct`** |
| `median_effect_residual_pct` | median of the same |
| `has_sufficient_sample` | `done_count >= 5` (v1, **per-location, no shrinkage**) |
| `authorship` | `'user_authored'` |
| `is_proven_lift` | **NULL for commitment rows** — no "proven" language |

New nullable columns (populated only for `source='commitment'`): `source`, `done_count`,
`beat_count`, `missed_count`, `confounded_count`, `avg_effect_residual_pct`,
`median_effect_residual_pct`. Existing comm columns stay NULL on commitment rows and vice-versa.
**No cross-source `positive_rate` is ever computed.**

---

## Consumer wiring (app — step 3, only after the marts populate)
- **Provenance** (`src/lib/commitmentContext.ts`): read
  `WHERE location_id=@loc AND source='commitment' AND has_sufficient_sample`. Surface as
  *"Quand vous avez fait cette action, le CA a battu l'attendu {beat_count} fois sur {done_count}."*
  — never "marche à X %".
- **③ advice:** strong `beat_count`/`done_count` + sufficient → "reconduire" with the track record;
  missed-heavy → "à ne pas reconduire tel quel".
- **Honest empty:** column exists but no `source='commitment'` rows or below min-N →
  *"pas encore assez de recul"*. That empty state is **not** "done" until proven with data.
  See [[prove-entry-point-by-behavior]].

## Guardrails (do not drop)
1. **Effect-measure conflation** — commitment effect = residual (dow+trend, VIF-corrected); comm
   delta = vs naive 30d avg. Different metrics → separate columns, never one pooled number.
2. **No "proven" language** — commitment counts are self-selection-biased operator track record,
   not effectiveness. "N fois sur M", not "X %"; no `is_proven_lift`/"prouvé" for commitments.
3. **Confounded excluded from the effect** — never inflates beat/missed; counted separately only.
4. **Cross-location shrinkage deferred to v2** — v1 is per-location, min-N ≥ 5. Borrowing strength
   across venues is a modeled v2 step, not a cold-start patch.
5. **Degrade honestly on empty** — consumers render "pas encore assez de recul" cleanly.

## Validation (before organic N)
Seed resolved-commitment fixtures across ~2 `action_types`: `met+fait`, `missed+fait`,
`confounded+fait` (must be excluded from beat/missed), `met+pas_encore` (excluded), with enough
`fait` on one type to cross **min-N ≥ 5**. Run the models → assert `fct_commitment_outcomes` rows
+ the aggregate (beat/done correct, confounded excluded, min-N gate) → drive the app consumer
against it → prove provenance/advice render AND the empty state. Behavior-verified end-to-end
before it ships.

## Prerequisite spec — persist the driver at creation
`analytics.action_commitments` stores `origin_action_type` but **not the driver**. The reco is
driver-keyed and the card carries the attributed driver, but the commitment drops it, so learning
can only key on `action_type` and the per-driver KPI stays blocked. Capture it — small, additive,
non-breaking. **Not blocking the learning-loop v1** (which keys on `action_type`); do it before
per-driver work so it isn't retrofitted blind.

**Frozen-provenance semantics** (like `creation_residual_pct`): store the driver as the card
attributed it at creation — never recomputed.

**Ordering:** schema (DDL) first, then code — `COLUMN_SPEC` drives the INSERT column list, so the
column must exist in BigQuery before the code that references it deploys.

### 1. Schema — `analytics.action_commitments`
- Add column **`origin_driver STRING`** (NULLABLE). One-time DDL (dbt/BQ console). NULL for
  existing rows and non-sales origins.
- Add to `COLUMN_SPEC` in `src/lib/actionCommitments.ts` right after `origin_action_type`
  (line 41): `["origin_driver", "STRING"]`. This single edit auto-wires the INSERT column list +
  typed-null param (the spec is the source of truth). Also add `origin_driver` to the
  `CommitmentRow` interface (`string | null`).

### 2. Create endpoint — `POST /api/commitments` (`src/pages/api/commitments/index.ts`)
- Read `body.origin_driver`; add to the patch:
  `origin_driver: body.origin_driver ? String(body.origin_driver).trim().toLowerCase() : null`.
- **No hard validation / no 400** — driver is advisory metadata, not a gate. Optional soft
  allowlist `{conversion, basket, footfall, transactions}`; on `both` or unknown → store `null`
  (ambiguous driver is not a driver), never reject the create.

### 3. Client — pass the card's driver
- pulse commit form (`buildCommitFormHtml` submit, `pulse.astro`): add to the POST body
  `origin_driver: card.primary_revenue_driver || card.dominant_factor || null`.
- `public/commit-form.js` (`MSCommitForm`, used by évolution advice CTAs + Répliquer): thread
  `origin.origin_driver` through so re-engagements carry it; for **Répliquer**, reuse the source
  commitment's `origin_driver`.

### 4. Canonicalization — at the consumer, NOT at capture
Store the RAW driver (`conversion|basket|footfall|transactions`) — don't lose info. Fold to a
canonical bucket only when reading, matching the reco's `_recoDriverKey` (`transactions →
footfall`). So `fct_commitment_outcomes.driver` = raw; learning/KPI group on the folded bucket.

### 5. Enables (downstream, separate builds)
- **Per-driver learning:** the commitment aggregate in `fct_location_action_learning` can add
  `driver` to the grain `(location, action_type, driver, window_days)`.
- **Per-driver KPI:** ties `measured_metric` to the driver — but still needs the driver-decomposed
  residual (conversion/basket residual marts), the separate decomposition build. Capturing the
  driver is **necessary, not sufficient**.

### Verify by behavior
Drive `POST /api/commitments` with `origin_driver:'conversion'` → assert the row lands with
`origin_driver='conversion'` (typed-null INSERT path intact). Existing creates (no driver) still
200 with `origin_driver=NULL`. One create with `both`/unknown → stored `null`, no 400.

## Sequence
1. dbt — `fct_commitment_outcomes` (inclusion rules, authorship tag, residual-delta column).
2. dbt — extend `fct_location_action_learning` (source-tagged commitment aggregate).
3. app — wire consumers (provenance → reco ranking → ③ advice), verified on seeded data.
4. (later, separate) per-driver decomposition for the KPI.
