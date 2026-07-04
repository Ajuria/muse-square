# Card Truth Contract v1 — Revenue/Footfall Movement Cards

Status: Phase 1 spec (Step 1 "truth before pivot"). No-code. Phase 2 (dbt) implements
against this; Phase 4 (regression gate) seeds tests from the Definition of Done.

## Scope

The 5 day-level performance cards that assert a revenue or footfall movement:
`sales_revenue_down_wow`, `sales_surge`, `footfall_vs_basket_decomposition`,
`sales_traffic_not_converting`, `sales_discount_no_lift`.

Source of truth: `mart.fct_client_sales_signals_daily` (triggers + numbers)
→ `mart.fct_location_daily_action_candidates` (presentation CTEs).

## Principle

> A movement card may fire only when the day's metric is a statistically real deviation
> from the location's own **seasonal** baseline, decomposed honestly into named factors
> measured in **one** reference frame, with any causal language gated by a confidence tier.
> Inside the noise band → no card.

## Rules (each a checkable predicate)

### R1 — Robust, seasonality-aware baseline (the noise band)
Every trigger metric M (daily_revenue, footfall, conversion, discount_rate) is evaluated
against a **day-of-week-aware trailing distribution**, never a fixed % of an all-day mean
and never a single prior day.

For (location_id, dayofweek), over the trailing K=6 same-weekday occurrences excluding today:
- `center = avg(M)          over w_dow`   (mean v1; median+MAD is the hardening upgrade)
- `disp   = stddev_samp(M)  over w_dow`
- `n      = count(*)        over w_dow`
- `robust_z = safe_divide(M - center, disp)`

- **Fire:** `abs(robust_z) >= 1.5 AND n >= 4`  (sign of robust_z selects up vs down).
- **Suppress (mandatory):** `abs(robust_z) < 1.5 OR n < 4` → no card. In-band = silence.
- Retire all fixed-% / single-day triggers: `>130% of 30d avg` (surge),
  `<70% / < baseline` (underperformance/miss), `abs(vs 30d) >= 15%` (decomposition),
  `is_revenue_down_vs_last_week` (same-weekday single day).

k=1.5 is the default; tunable per metric/location. MAD replaces σ where a trailing peak
inflates the band (needs a self-join; σ is the analytic-native v1).

### R2 — One reference frame per card
Trigger metric, headline number, and every decomposition factor use the **same** baseline
(the R1 dow band). Banned: mixing "vs same-weekday-last-week" (trigger) with "vs 30d-avg"
(basket_delta) in one card. FAIL if a payload reports deltas computed against different
baselines.

### R3 — Honest decomposition; `"mixed"` banned
Revenue movement decomposes as `revenue ≈ transactions × basket` (× conversion × footfall
only where a footfall feed exists — R5), each factor's delta vs the same R1 baseline.
`primary_revenue_driver` = the factor with the largest |contribution|. Tiebreak: if the top
two are within **≤ 3 percentage points**, emit **both**, named with numbers
("−8% tickets, +7% panier"). The literal `"mixed"` may never appear in any payload or copy.
FAIL if any row has `primary_revenue_driver = 'mixed'`.
(`footfall_vs_basket_decomposition` is the compliant reference implementation.)

### R4 — Baseline validity & persistence guard
A delta that **persists ≥ D=3 consecutive days** at the same sign and similar magnitude is a
baseline-calibration artifact, NOT a daily event → suppress the card and raise a
`baseline_suspect` data-quality flag. Baselines feeding R1 require `n ≥ 4` real observations
and must pass a freshness check.
(Catches the ff2aeb35 conversion_delta = −53/−54/−55% multi-day constant.)

### R5 — Provenance & graceful degradation
A factor may be stated only if its feed exists for that location. footfall/conversion require
non-null `visitor_count`; absent → those factors are **omitted** (not implied, not zero-filled).
Preserve current correct behavior: f10c3e58 / 29383776 (no visitor feed) → footfall cards
suppress. Each figure carries provenance (source + coverage% + freshness); a required
dimension that is stale/missing → suppress or flag. FAIL if a card asserts conversion where
`visitor_count IS NULL`.

### R6 — Confidence tier & causal language
Every card carries a tier set by evidence strength:
- `possible` : |robust_z| in [1.5, 2.5), single day.
- `probable` : |robust_z| ≥ 2.5, OR a sustained level shift (≥3 days beyond band, not an R4 constant).
- `confirmé` : only with a controlled comparison (matched baseline / diff-in-diff). None of the
  current cards qualify → ceiling is `probable`.

Causal copy is gated by tier: below `confirmé`, use "coïncide avec"; never "à cause de" /
"grâce à" / "à reproduire". FAIL if such phrasing appears below `confirmé`.

## Per-card application

| Card | R1 trigger becomes | Rules that bite |
|---|---|---|
| sales_revenue_down_wow | dow-band robust_z ≤ −1.5 | R1 (kills 07-01), R2, R3 |
| sales_surge | dow-band robust_z ≥ +1.5 | R1 (kills 06-27 Sat), R6 (drop "à reproduire") |
| footfall_vs_basket_decomposition | dow-band \|robust_z\| ≥ 1.5 | R1 (trigger); decomposition already compliant = R3 template |
| sales_traffic_not_converting | footfall & conversion dow-band | R4 (kills −53% constant), R5 (data-gated to ff2aeb35) |
| sales_discount_no_lift | discount dow-band ≥ +1.5 AND revenue in-band | R1, R6 (counterfactual language) |

## Definition of Done (seeds Phase 4 regression gate)

1. f10c3e58 07-01 `sales_revenue_down_wow` → **not emitted** (robust_z 0.00).
2. f10c3e58 06-27 `sales_surge` → not emitted, or `possible` only (Saturday-normal).
3. No row anywhere with `primary_revenue_driver = 'mixed'`.
4. ff2aeb35 conversion −53% 4-day run → `sales_traffic_not_converting` suppressed + `baseline_suspect` flagged.
5. Any card with a footfall factor where `visitor_count IS NULL` → not emitted.
