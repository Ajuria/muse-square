# Context-as-decision service — the four-tier contract (Engines 1 & 2 close-out)

Status: **as-built contract.** For `today × venue`, one decision surface shows every relevant factor —
environment, competition, and the operator's own proven actions — each labelled by **how we know it**.
This closes the 48h build. We are **surfacing existing data, not learning new coefficients** (that is
A3, deferred). See [learning-types.md](learning-types.md) (the A/B contract) and
[learning-engine.md](learning-engine.md) (Engine 1).

Endpoint: `src/pages/api/insight/reactions-today.ts` (extended — no new route).
Registry: `src/lib/sensitivityFeatures.json` (single source, extended with `tier` + per-tier `source`).
Copy: `src/lib/sensitivityCopy.ts` is **owner-final** — this service produces STRUCTURED data keyed by
`label_key`; the French words live in the copy file. This doc never authors words.

## The one rule: four tiers, never merged

Each factor is shown under exactly one provenance tier, with its `source`. Mixing measured / estimated /
observed launders one tier's authority into another — the locked honesty failure this contract exists to
prevent. Numbers are **pulled from marts, never blended or recomputed** in the endpoint. The LLM (fast-follow)
**cites the structured context only** — it never invents a factor, number, or impact.

| Tier | Label (register) | Provenance | Source (verified populated 2026-07-09) | Number shown |
|---|---|---|---|---|
| 1 | **Mesuré sur vos ventes** | `mesure` (measured fact) | `analytics.b_sensitivity_store` via `sensitivityStore` accessor | learned effect + N + consistency + period |
| 2 | **Contexte du jour — estimation** | `estimation` (expert prior) | `mart.fct_location_opportunity_components_daily` (`delta_att_*_pct`) + active factors from `mart.fct_location_context_daily` | prior-attributed impact %, **labelled estimation, never "vu N fois"** |
| 3 | **Concurrence** | `observe` (observed fact) | `mart.fct_competitor_threat_profile` (followed) + density in `mart.fct_location_context_features_daily` + named events `mart.fct_location_events_topn_daily` | **no impact number** — the fact only (name, distance, threat, rating, event label) |
| 4 | **Ce qui a marché pour vous** | `mesure_action` (measured track record) | `mart.fct_location_commitment_learning` (factor-keyed via `origin_factor`) | N fois sur M, gated — **never "prouvé"** |

## Tier 1 — Mesuré (learned, Engine 2 Type B)
Active-today sensitivities from the store, filtered to factors present today via the registry predicate
(against `fct_location_context_daily`). Data-capped at 81 days → **heat only** today (Nîmes venue
`ff2aeb35`, −12.2 %, 28 j, 68 %, préliminaire). Honest — not forced beyond heat. Register = the measured
fact line (`sensitivityCopy`), tier-aware.

## Tier 2 — Estimation (prior-attributed impact)
Read `fct_location_opportunity_components_daily` for today; emit one estimation line per **non-zero**
`delta_att_*` component active today (weather per type, events, mobility, calendar). These are
**hand-authored expert priors**, not a controlled fit → register is **"estimation, contexte du jour"**,
never a frequency ("vu N fois sur M"). Never the word *mesuré*.

**Suppress-in-2 (per venue × factor).** When Tier 1 has a **measured** number for a factor at this venue,
the Tier-2 **estimated** line for that same factor is suppressed — measured supersedes the generic prior.
Rationale: once a factor is learned from *this venue's* sales, the prior is obsolete for it; two numbers
invites "which do I believe." A venue with **no** measured heat still shows the estimated heat. Concrete
divergence today: Nîmes heat is −12.2 % measured vs −5 % prior — the prior was **2.4× too low** for this
venue, a real correction, which is exactly why measured wins.

## Tier 3 — Concurrence (observed / crawled facts)
Observed facts the operator reads and the LLM cites — **no fabricated impact number**. Competitor text
**never enters the regression** (Tier-1 fit uses only `fittable` environment factors; competitor density is
numeric and *could* be an engine regressor later — that is not this build).

- **Followed competitors** (`fct_competitor_threat_profile WHERE is_followed`): name, distance, threat, audience.
  **Top-3, proximity-aware.** `threat_score` is **not** distance-weighted (verified: 46 km museums score
  0.75 "high"), so rank by `relevance = threat_score / (1 + distance_km / 5)` (5 km = the local-competition
  radius the density buckets already use), take top-3, **always show distance** (a 46 km entry reads as far).
- **Local density**: `competition_index_local`, `comp_nearby_weighted` (today, from context features).
- **Named nearby events** (`fct_location_events_topn_daily.top_events_5km`, presence-ranked, top few) — reuses
  the `sales-report.ts` named-context pattern (OpenAgenda/INSEE), not rebuilt. Upcoming competitor-event
  conflicts (`fct_competitor_events_conflicts`) included when present (empty for these venues today → omitted,
  not faked). Full agent-augmented crawl is a **parked** build — include what is consolidated, flag the rest.

## Tier 4 — Ce qui a marché pour vous (measured action, Engine 1 Type A)
Source `fct_location_commitment_learning`, factor-keyed via an `origin_factor` bridge (captured at creation
like `origin_driver`). **Not wireable this pass**: `origin_factor` column is absent and the learning mart is
empty (0 rows) — wiring needs the bridge + a cross-repo dbt grain change + real resolved commitments. Ships
as the **labelled-absent slot** (`{ present:false, reason:"bridge_absent" }` → "pas encore assez de recul").
**Immediate next task after this service** = the `origin_factor` bridge + a few seeded resolved commitments
to light up Engine 1 (the differentiator, higher-value half) — **not A3**.

## Registry model — one list, tier-tagged, engine fits only `fittable`
`sensitivityFeatures.json` stays the single source. Each environment factor carries `tier` + per-tier
`source`; the engine's `taxonomy()` and the design-matrix build filter to **`fittable: true` (Tier-1
environment factors) only** — so estimation / concurrence / action entries live in the *same list* but are
**structurally excluded from the regression**. This preserves "one list, never two" and guarantees competitor
text / priors never reach the fit. Adding a factor happens here, once.

## Endpoint output shape
```
{ ok, location_id, date,
  tiers: {
    mesure:      [ { tier:1, feature, label_key, direction, effect_pct, n_days, consistency_pct,
                     period_start, period_end, provenance:"mesure", source } ],
    estimation:  [ { tier:2, feature, label_key, impact_pct, provenance:"estimation", source } ],   // suppress-in-2 applied
    concurrence: [ { tier:3, kind:"competitor"|"density"|"event", label_key, name?, distance_km?,
                     threat_level?, audience_overlap_pct?, rating?, competition_index_local?,
                     comp_nearby_weighted?, event_label?, provenance:"observe", source } ],
    action:      { present:false, reason:"bridge_absent", source } | [ { tier:4, feature, label_key,
                     beat, done, provenance:"mesure_action", source } ]
  } }
```
Every line carries `provenance` + `source`. `label_key` (never French) keys the owner copy. `?src=seed`
(dev-only) drives the demo Tier-1/Tier-4 fixtures for eyeballing the populated path.

## Scope
- **In:** Tiers 1–3 assembled + verified authed on one decision surface; Tier-4 absent slot (honest).
- **Out:** rebuilding the opportunity score (it already consumes these marts); forcing learned signals
  beyond heat; competitor text in the regression; the full competitor crawl (parked); A3 graded factors.
- Verify by **behavior, authed** (owner clicks) — not `node --check`. Focused commits, indexes updated in
  the same commit.
