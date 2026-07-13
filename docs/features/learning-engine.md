# Learning engine — dbt model spec (commitment source)

Status: **as-built — dbt models built + behavior-verified in BigQuery (2026-07-08); app wiring
(step 3) in progress.** Lineage is **source → staging → intermediate → mart** (marts never read the
source directly). Build order was gating and honored: dbt first (done), then app consumers proven
against seeded data (in progress). This doc describes what EXISTS, not a proposal.

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
`action_done_status`, origin, confound) in `analytics.action_commitments`; the models below carry
it into a **separate** commitment lineage (the comm-only `fct_location_action_learning` is left
untouched).

## Lineage (as-built — source → staging → intermediate → mart)
Marts NEVER read the source directly. The chain:
- **source** `analytics.action_commitments` — app-owned append-only log (declared as a dbt source).
- **staging** `stg_client_commitments` (view) — typed pass-through, raw event grain, **no dedup**.
- **intermediate** `int_client_commitment_latest` (view) — latest snapshot per `commitment_id`
  (dedup); the reusable "current state", consumed by any commitment mart.
- **mart** `fct_client_commitment_outcomes` (table) — resolved+done outcome events (Model 1).
- **mart** `fct_location_commitment_learning` (table) — per-location track record (Model 2).

**Verified in BigQuery** on a seeded validation set: outcomes exclude `pas_encore` + `open`, flag
`confounded`; the aggregate counts beat/done/missed, excludes confounded from both the counts AND
`avg_effect_residual_pct`, and the min-N≥5 gate holds. Marts are **empty in production** until real
resolved commitments accrue (the ramp).

## Design principle (locked guardrails)
Commitments and communications are **separate sources with separate effect measures**, aggregated
**per source into SEPARATE tables** (`fct_location_commitment_learning` vs the comm-only
`fct_location_action_learning`) — the separation structurally enforces "never blend the two
`positive_rate`s". Commitment numbers are an **operator
track record** ("N fois sur M"), never a "proven" effectiveness rate.

**Why a sibling model, not a union into `fct_action_outcomes`:** that table's grain is `publish_id`
(one post, one outcome day, post metrics, naive 30-day-avg baseline). A commitment has no post,
spans 7–14 days, and its effect is the **VIF-corrected dow+trend residual**. Forcing it into the
post grain would mangle the grain or silently pool two incompatible deltas (guardrail 1). So:
new `fct_client_commitment_outcomes` → separate `fct_location_commitment_learning` (comm table untouched).

---

## Model 1 — `fct_client_commitment_outcomes` (table)
**Grain:** one row per **resolved, done** commitment (confounded kept but flagged, not dropped).
**Reads:** `int_client_commitment_latest` (the deduped latest state) — **not** the source directly.

**Inclusion filter (locked rules):**
- `status = 'resolved'` (drop open/pending/expired/cancelled — no measured outcome)
- `action_done_status = 'fait'` — exclude `pas_encore`/NULL ("atteint + non menée" = luck)
- `verdict IN ('met','missed','confounded')` — keep confounded but **FLAG** it (`is_confounded`)
  so the aggregate has one source: `met/missed` are the MEASURABLE outcomes; `confounded` is
  excluded from effect/beat and counted separately (guardrail 3), never dropped silently.
- net: **resolved ∧ done ∧ verdict∈{met,missed,confounded}**, confounded flagged.

**Columns:**

| column | source | note |
|---|---|---|
| `commitment_id` | grain key | unique |
| `location_id`, `user_id` | commitment | `user_id` = authorship |
| `source` = `'commitment'` | constant | |
| `authorship` = `'user_authored'` | constant | out of the unbiased pool |
| `action_type` | `origin_action_type` | learning key |
| `driver` | `origin_driver` | raw; fold `transactions→footfall` at read |
| `window_days` | `window_days_expected` | |
| `resolved_date` | `DATE(resolved_at)` | |
| `verdict` | `met`/`missed`/`confounded` | |
| `is_confounded` | `verdict='confounded'` | flag; excluded from measurable counts |
| `beat` | `met`→true, `missed`→false, `confounded`→**NULL** | measurable-win flag |
| **`effect_residual_pct`** | `window_residual_pct` | **the Type A effect — distinct column, NEVER `revenue_delta_vs_baseline_pct`** |
| `effect_residual_z` | `window_residual_z` | kitchen; not surfaced |
| `window_actual_revenue`, `window_expected_revenue`, `material_holiday_share` | commitment | context |

Explicitly **omit** post metrics and the naive `revenue_delta_vs_baseline_pct` — comm-only.

---

## Model 2 — `fct_location_commitment_learning` (NEW, separate)
A per-source aggregate kept **separate** from the comm-only `fct_location_action_learning` —
cleanest per guardrail (a), and it avoids editing the existing comm model blind. The app consumer
reads THIS table for Type A. `fct_location_action_learning` (communication) stays untouched.

**Grain `(location_id, action_type, window_days)`, `source='commitment'`:**

| column | definition |
|---|---|
| `done_count` | `COUNTIF(NOT is_confounded)` — measurable done outcomes |
| `beat_count` | `COUNTIF(NOT is_confounded AND verdict='met')` |
| `missed_count` | `COUNTIF(NOT is_confounded AND verdict='missed')` |
| `confounded_count` | `COUNTIF(is_confounded)` — logged, neither for nor against |
| `avg_effect_residual_pct` | `AVG(IF(NOT is_confounded, effect_residual_pct, NULL))` — **distinct from the comm naive delta** |
| `median_effect_residual_pct` | `APPROX_QUANTILES(..., 2)[OFFSET(1)]` over non-confounded (BigQuery has no `median()`) |
| `last_resolved_date` | `MAX(resolved_date)` |
| `has_sufficient_sample` | `done_count >= 5` (v1, **per-location, no shrinkage**) |
| `is_proven_lift` | **NULL** — never "proven" for Type A |
| `source` / `authorship` | `'commitment'` / `'user_authored'` |

**Optional unification:** if you want ONE physical consumer table, add a `source` column to the
existing `fct_location_action_learning` model and `UNION ALL` this aggregate (comm columns NULL on
commitment rows and vice-versa). **Never compute a cross-source `positive_rate`.**

---

## Consumer wiring (app — step 3, only after the marts populate)
- **Provenance** (`src/lib/commitmentContext.ts`): read
  `WHERE location_id=@loc AND source='commitment' AND has_sufficient_sample`. Surface as
  *"Quand vous avez fait cette action, le CA a battu l'attendu {beat_count} fois sur {done_count}."*
  — never "marche à X %".
- **③ advice — explicit beat-ratio threshold (don't endorse a coin flip):** with `n = done_count`,
  `ratio = beat_count / done_count`, and `has_sufficient_sample` (n ≥ 5):
  - **"reconduire"** ONLY on a clear majority AND enough N: `ratio ≥ 0.70 AND beat_count ≥ 4`
    (so 3/5 does NOT qualify) → *"Vous avez fait cette action {beat_count} fois sur {done_count} — le CA a battu l'attendu. À reconduire."*
  - **"à ne pas reconduire tel quel"** on a clear negative: `ratio ≤ 0.30` → the track record cuts the other way.
  - **"résultats mitigés"** for everything between (mixed record) → *"{beat_count} fois sur {done_count} — résultats mitigés"*, **never** "cette action marche". The mart's honesty must not leak at the copy layer.
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
`fait` on one type to cross **min-N ≥ 5**. Run the models → assert `fct_client_commitment_outcomes` rows
+ the aggregate (beat/done correct, confounded excluded, min-N gate) → drive the app consumer
against it → prove provenance/advice render AND the empty state. Behavior-verified end-to-end
before it ships.

## Ramp — set expectations plainly
Grain is `(location, action_type)` at **min-N = 5**: a venue must commit to the **same action
type 5+ times, resolved-and-done**, before anything surfaces there. That is a **long organic
ramp — months, not weeks** (matches [[measured-impact-engine-queued]]). What ships is *correctness*
(proven now via seeded fixtures); *surfaced organic learning* is downstream. No false expectation
of quick output — until then every consumer shows "pas encore assez de recul".
**v2 grain note:** if per-`action_type` proves unreachable in practice (too few repeats per type),
the first useful grain may be **per-driver** or **per-location** — v2 tuning. Start strict
(per-action_type, N≥5); loosen only with evidence, never as a cold-start shortcut.

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
footfall`). So `fct_client_commitment_outcomes.driver` = raw; learning/KPI group on the folded bucket.

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
1. ✅ dbt — `stg_client_commitments` → `int_client_commitment_latest` → `fct_client_commitment_outcomes`
   (inclusion rules, authorship tag, residual-delta effect). Built + verified in BQ.
2. ✅ dbt — `fct_location_commitment_learning` (separate commitment aggregate). Built + verified in BQ.
3. ⏳ app — wire `commitmentContext` to read `fct_location_commitment_learning` (`source='commitment'`)
   with the beat-ratio thresholds; verified on seeded data (empty + all four branches).
4. (later, separate) per-driver decomposition for the KPI.
