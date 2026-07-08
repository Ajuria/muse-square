# Learning types — the A vs B contract

Status: Type A (action-outcome) is **built + verified** (see
[learning-engine.md](learning-engine.md)). **Type B (environmental-response) has a v1 engine
built + validated on seeded ground-truth (2026-07-08), NOT yet live on real data** — see §C.1.
This doc is the full contract it is built against (architecture + engine discipline + output store
+ LLM rule below). The two kinds of learning must never blur, in the data **or** the UI: separate
subject, data, honesty model, table, grain, consumer, and copy.

## The two kinds

| | **Type A — Action-outcome** | **Type B — Environmental-response** |
|---|---|---|
| Register | "ce qui a marché **pour vous**" | "comment **votre lieu** réagit" |
| Subject | a user action / commitment | an environmental condition (temp, day type, events, tourism) — **no action** |
| Question | "when I did X, did the outcome move?" | "all else equal, how does CA respond to condition Y?" |
| Example | "Vous avez fait X 4 fois sur 5 — le CA a battu l'attendu" | "sur 40 jours sur 42 avec temp >30 °C, CA ~12 % sous l'attendu" |
| Data universe | **only action days** (resolved commitments) — rare, tiny N, long ramp | **every day of history** — abundant, large N, available now |
| Nature | **prescriptive** (reconduire / ne pas reconduire) | **predictive** (anticipate / prepare) |
| Honesty problem | self-selection + causation → **personal track record, never "proven"** | confounding (hot = summer = holidays) → **"toutes choses égales" must be real** |
| Lives in | `fct_client_commitment_outcomes` → `fct_location_commitment_learning` | the **sensitivity store** (mart) + one typed accessor — a shared service (§Type B contract); also emits the context-adjusted baseline |

## Two rules that must hold

**1. Opposite data profiles — B is not far-off.** A is starved and slow (needs repeated
resolved-and-done commitments per action type; months of ramp). B is data-rich **today** (every
historical day). B can deliver value *faster* despite sounding more advanced. Sequence A first
(the proof loop is ready), but do not treat B as distant.

**2. One-way dependency, never a merge.** B learns the context coefficients (weather/holiday/
tourism effect) — which is exactly the context-adjusted baseline our `expected_revenue` lacks
(it's dow+trend only; see [[sales-signal-architecture-map]]). So **B improves the baseline A
consumes** → cleaner residual → fewer confounded verdicts → better Type A track records. That is a
**dependency (B → better baseline → A), never a blend of the two ledgers.** Separate source,
table, grain, consumer. They never share a row or a number.

## The honesty bar for Type B

**Type B may use the frequency framing ("sur N jours sur M") ONLY if "toutes choses égales" is
genuinely enforced — control for day-of-week, season, holiday, and events (matched comparison or
regression with explicit controls), then report the RESIDUAL effect with its N and its
consistency. Correlation-with-controls, a stated sample, "typiquement / observé sur N jours" —
NEVER a causal verb. An uncontrolled correlation surfaced as a "learning" is the single thing that
burns causal-honesty trust; it is prohibited.**

Concretely: no "la chaleur fait baisser votre CA." Instead "sur vos journées >30 °C, à jour de
semaine et saison comparables, le CA est typiquement ~X % sous l'attendu (N jours, cohérent M/N
fois)." Effect = residual after controls, with N and consistency; the register is observed
frequency, not cause.

---

# Type B — build contract (do NOT build yet; author-for-review)

Type B is **infrastructure, not a display feature.** It will feed many surfaces — the prompt page,
the daily score, card so-whats, évolution ②, the sales report, alerts, **and the context-adjusted
baseline itself.** So it is built once, as a **shared domain service**, or it becomes the next
presentation-layer duplication mess (the exact weakness already diagnosed across the app). Lead
with the architecture; the prompt page is *one* consumer, not the design.

## A. Architecture — a shared sensitivity service (this is the headline)
- **One canonical store + one typed accessor.** Vetted sensitivities live in a mart; a **single
  typed module** exposes them (same discipline as `commitmentCopy` / the named-context assembly).
  **Every surface imports that accessor — none queries the mart directly, none recomputes an
  effect.** Design for the Nth consumer: a stable, documented contract so a new surface plugs in
  without re-plumbing.
- **Honesty enforced once, at the store.** The effect + consistency + N + mechanism gate runs at
  **ingestion** — only vetted sensitivities ever exist. No consumer *can* surface a spurious one.
  Get it right once, inherit everywhere.
- **Consumers present, never compute.** Every surface cites / renders / weights the same numbers;
  none reinterprets or re-derives an effect.
- **Breadth raises the stakes.** The same learning reads identically everywhere — and a spurious
  sensitivity in ten places does **10× damage.** Wide consumption makes the vetting bar MORE
  critical, not less.
- **Records serve both jobs** — the raw numbers (for the score / baseline) **and** the honest
  phrasing (for citing). One record, two payloads.
- **Deepest consumer = the baseline itself.** The same model produces the **context-adjusted
  `expected_revenue`** that feeds Type A, commitment resolution, and the anticipation score — the
  double payoff of rule 2 (B → better baseline → cleaner Type A residual → fewer confounded verdicts).

## B. Output contract — the sensitivity store (schema)
A persistent, queryable mart; **machine-readable, never baked into a card / string.** One row per
vetted sensitivity:

| field | meaning |
|---|---|
| `location_id` | the venue |
| `feature` | the driver condition (`heat_gt_30`, `school_holiday`, `major_event_5km`, …) |
| `metric` | outcome affected (`revenue`, `footfall`, `conversion`, `basket`) |
| `direction` | `up` / `down` |
| `effect_size` | controlled residual effect (e.g. `-0.12` = −12 % vs expected) |
| `n_days` | qualifying sample (days matching the feature, post-controls) |
| `consistency_pct` | share of qualifying days the effect held (e.g. 40/42 → 95 %) |
| `controlled_for` | what was removed (dow, season, holiday, events…) |
| `mechanism_tag` | the plausible mechanism (theory-constrained, not blind) |
| `confidence_tier` | tier after the effect / consistency / N / correction gate |

## C. Engine discipline (a sensitivity engine, NOT a correlation scanner)
- **Maximize input breadth, ruthlessly minimize output.** Consider *every* captured variable
  (weather, holidays, events, tourism, competitor density, day-type, mobility); surface only the
  handful that clear a hard bar. "Consider all variables" ✓; "surface all correlations" ✗ — not the
  same move.
- **Controlled, not raw.** Every sensitivity measured after removing dow / season / holiday (on the
  residual, or a matched comparison) — "toutes choses égales" must be real, or it just rediscovers
  hot = summer = holiday.
- **Effect size + consistency + N, not p-values.** ~365–730 daily rows make everything
  "significant." Use the frequency register + a min qualifying-N + a real effect size.
- **Guard multiple comparisons.** All-variables × all-metrics = hundreds of tests → ~5 % false
  positives by chance. Require a **plausible mechanism** (theory-constrained feature set, not a
  blind sweep), a consistency threshold, and correction for how many tests were run. **5 robust
  sensitivities beat 50 noisy ones.**
- **Main effects + CA first.** Per-metric sensitivities (footfall / conversion / basket) need a
  dow+trend-adjusted expected value *per metric* — the **decomposition build we don't have yet,**
  hooked by the driver we now capture (`origin_driver`). Interactions ("heat × weekend") explode the
  space and exceed one venue's data → **defer.**
- **Data budget is the ceiling → per-factor pooling pulled forward.** One venue supports a handful
  of robust main effects, not a web of interactions. **Correction (2026-07-08): per-factor pooling
  is not "later" — it is the small-N eligibility gate now.** A factor must clear the **pooled
  (full-data) fit** before ANY per-location row is trusted; the pooled fit *licenses the factor*,
  per-location data then *scopes and sizes* it (or the pooled effect is used as the scoped
  fallback). This is what kills a lone-venue noise blip the global data doesn't support (see §C.1).
  Interaction-level pooling (the hierarchical model) is still deferred. Roadmap: **pooled-licensed
  per-venue main effects now → hierarchical interaction depth later.**
- **Seed — a STARTING POINT, not a ready seed (read 2026-07-08).** The "dormant challenger" is
  **hand-authored expert priors**, not a controlled regression: `open_data.{weather,event,mobility,
  tourism}_impacts_coeffs` hold fixed `impact_pct` per level/band/status (+ prose `notes`/
  `description`), combined by a heuristic `combine_rule` (`top2_decay_0p5_clamp`); the daily
  `delta_att_<factor>_pct` are these priors applied. **It fails all three gates:** no dow/season/
  holiday hold-out (not controlled), **no collinearity handling** (heuristic combine, no VIF/
  regularization — total ≠ sum: heat −10 → total −14.52), and the fitted layer
  `weather_impacts_coeffs_learned.beta_att_per_pct_impact` is **0-of-3 fit** (all NULL). Grain is
  global/regional, not per-location; no context-adjusted `expected_revenue` exists (residual mart
  has one dow+trend expected). **Reusable asset:** the per-factor feature taxonomy (→ `feature`/
  `mechanism_tag` + the §C "plausible mechanism" gate), the empty `_learned` hook (where fitted
  betas land), and the daily context marts (the design matrix). **Build = replace the priors with a
  controlled, collinearity-handled fit** of that layer against the residual (dow/season/holiday held
  out, per-location where N allows, validated) — which simultaneously emits the context-adjusted
  baseline (§A). The challenger is the scaffold + design matrix, **not** the engine. See
  [[sales-signal-architecture-map]].

## C.1 As-built engine (v1 — validated on seeded ground-truth 2026-07-08, not yet live)
The engine is a **vetted offline BATCH → STORE → RETRIEVE** service, **never a live fitter.** The
rigorous fit runs offline on a defined feature×metric grid; only survivors land in the store.
KPIs / questions / the prompt page **retrieve** pre-vetted sensitivities — nothing triggers a fresh
fit. A question running its own on-the-fly correlation is p-hacking to an answer; prohibited.

**Step-1 factor cut (real data, per-location N over the 81-day residual span).** Only `tourism_peak`
is per-location fittable at all venues. `heat` is fittable only where there is contrast (Occitanie;
Paris has ~0 hot days → scoped out, never extrapolated). `school_holiday` / `rain` are thin →
pooled. `cold / wind / snow / mobility / events / public_holiday` have ~0 contrast in the current
window → **deferred** (tier-not-gate: they surface when data accrues, not on a calendar).

**Model = OLS + standard errors + VIF pre-check (not ridge).** BQML gives regularization **XOR**
standard errors (`calculate_p_values` requires `l2_reg=0`), so "ridge → SE → tier" is impossible in
one BQML model. OLS is the honest choice anyway: it recovers effects unbiased (ridge shrinkage
biases effects toward zero), and an **honest wide SE tells the truth about uncertainty** — which is
what tier-not-gate needs. Collinearity is handled by a **VIF pre-check** (drop/merge severely
collinear features; VIF = diagonal of the inverse correlation matrix); bootstrap-ridge SE is the
documented upgrade if a real feature pair ever proves severely collinear. On seeded data OLS
recovered the known coefficients within ~0.5 (tourism +8→+7.6, heat −12→−11.5, rain −6→−5.6,
holiday +5→+4.6) despite injected heat↔tourism collinearity.

**Scoping falls out of the SE — identifiability, not a calendar.** A factor surfaces for a venue
only where that venue has real contrast: at ~5 heat days Paris's heat SE explodes (t≈1.3, estimate
garbage) so it never clears the bar, while Nîmes (t≈10.8) and the pooled fit (t≈12.8) sail through.
"Scope, don't extrapolate" is enforced by the math.

**Gate stack (ALL must pass before anything surfaces — even préliminaire):**
1. **Mechanism** — feature must be in the theory-constrained taxonomy for that metric (not a blind
   sweep). Enforced a priori: un-tagged features are never fit.
2. **Min qualifying-N** and **per-venue contrast** (both feature-on and feature-off days present).
3. **Partial-residual consistency ≥ 60%** — share of qualifying days the effect held **net of the
   other fitted factors** (`y − Σ_{g≠f} β_g·g`). Raw-residual consistency is confounded (a rainy day
   that is also a tourism day nets positive) and understates real effects; it must be the
   all-else-equal version — this is also the **cited** "cohérent M/N jours" number.
4. **Benjamini-Hochberg multiple-comparison correction** across the *entire* batch (every
   feature×scope×metric test), `p_adj < 0.10`. This is the teeth: raw |t|≥1.5 ≈ p<0.13 → noise
   clears it, so BH is what stops "noise labeled préliminaire."
5. **Pooled-eligibility** — a factor must clear the pooled (full-data) fit before any per-location
   row is trusted (see the pooling correction in §C). This is what caught the validation's decoy: a
   pure-noise feature (given a *plausible-sounding* mechanism tag on purpose) hit `p_adj=0.026` at
   one venue by chance and would have surfaced — the pooled gate (pooled decoy `p_adj≈0.45`) killed
   it everywhere. Conservative in the honest direction; a genuinely venue-specific effect that
   cancels in the pool is deferred to the hierarchical upgrade.

**Only after all five** → **tier by |t|** (`≥4 établi · ≥2.5 émergent · ≥1.5 préliminaire · else
not surfaced`). Tier is confidence that scales with data, not a go/no-go. **The register moves with
the tier** (see [[french-copy-voice]] / `sensitivityCopy.ts`): préliminaire reads "signal
préliminaire … à confirmer", never "votre lieu réagit ainsi".

**Baseline = do-no-harm, swapped on an out-of-sample beat (not tierable).** The fitted
`expected_revenue` silently feeds Type A + commitment resolution, so it is used or it isn't — it
can't carry a tier. Rule: `fitted_expected = dow+trend × (1 + Σ vetted effects)` (only stored
survivors enter — nothing unvetted touches the baseline); swap in per venue **only if it beats
dow+trend on held-out days** (RMSE). On seed it beat dow+trend by 4.6–23.5% OOS at all venues →
swap. If it doesn't beat yet, dow+trend stays live and the fitted one runs in **shadow** until it
earns the swap. Never ship a worse baseline downstream.

**Target-agnostic — generalize by rerun, not rewrite.** The machinery is parameterized by metric
(`revenue` now; `footfall / conversion / basket` when their per-metric residuals exist) and the
factor set comes from the taxonomy gated by N/SE — nothing is hardcoded to "revenue + these 4."
KPI-generality = rerunning the same vetted pipeline per metric, storing `(metric, feature)` rows.

**Store + one typed accessor.** Batch output → `analytics.b_sensitivity_store` (dev; → mart
`mart.fct_location_sensitivity` when the dbt/BQML batch model lands). The **one** typed accessor is
`src/lib/sensitivityStore.ts` (`getSensitivities(loc, {metric, minTier})`); French citation +
tier register in `src/lib/sensitivityCopy.ts`. Every surface imports the accessor — none queries
the store or recomputes. Validated end-to-end on seed: accessor serves, consumer cites at tier, all
three registers render, honesty asserts pass (préliminaire never asserts, decoy absent, Paris-heat
scoped out).

**Real run (81 days) + first consumer wired.** The engine ran on the real residual+context design
matrix (`analytics.b_real_designmatrix`, `BMODE=real`): the **real store is empty** — nothing
clears the full stack at 81 days (closest: Nîmes heat −11.8%, 27 days, 70% consistent, but raw
p≈0.08 → fails BH even over the eligible family; `tourism_peak` shows no stable effect, pooled ≈0).
That is the correct honest result; **no gate was loosened.** The baseline stays **dow+trend** at
all venues (0 émergent+ effects → nothing to swap; the powered paired-difference CI machinery is
ready for the first one). The **read-only consumer is wired now** (before beta, so the live path is
proven off-customer): endpoint `src/pages/api/insight/sensitivities.ts` → page
`src/pages/app/insightevent/reactions.astro` → shared render `public/reactions.js`. Both states are
proven on the real render component (empty real store = "rien de notable"; seed store = tiered
render with the correct register per tier). The page defaults to the **real (empty) store**; a
dev-only `?src=seed` proves the populated path.

**Four refinements applied (all corrections, none loosen a gate):**
1. **Tier gates INFLUENCE, not just copy** — `préliminaire` is display-only (`canInfluence`); the
   baseline sums émergent+ effects only. Even fully gated, a préliminaire can be noise; its blast
   radius is bounded to an informational line.
2. **Consistency is a tier INPUT** — `tier = min(|t|-ladder, consistency-ladder)`; a high-t effect
   that only holds 60% of days can't wear "établi."
3. **Baseline = do-no-harm on a POWERED beat** — reported as a paired-difference mean ± 95% CI + n
   (not a point beat); swap only if the CI is entirely > 0. At 81 days (~17 OOS) this is
   underpowered by construction → dow+trend stays live, fitted runs in shadow.
4. **BH family = ELIGIBLE tests only** (post N+contrast) + **cited N/consistency match the estimate
   used** (pooled evidence when the row uses the pooled fallback). Output-neutral at 81 days.

**Still pending (post-beta gates):** store → mart + scheduled batch; the baseline swap and any
high-stakes consumer wait for real **établi** signals and a **powered** OOS beat.

## D. Consumers — honesty inherited from the store
The honesty bar (above) is enforced at ingestion (§A), so every consumer inherits it. Representative:
- **Anticipation UI** — renders vetted sensitivities as "à anticiper" ("comment votre lieu réagit").
- **Daily score / card so-whats / évolution ② / report / alerts** — weight or cite the same records.
- **Prompt page / LLM** — the context assembly (like `sales-report.ts` named context) reads the
  **same accessor** and feeds the LLM the pre-computed, controlled, N-backed sensitivities **to cite
  verbatim** ("votre lieu perd ~12 % par forte chaleur, observé 40 jours sur 42"). **The LLM is a
  narrator constrained to the store — it MUST NOT invent its own correlations or extrapolate beyond
  what the store says.** The honesty win: no "c'était probablement la météo" guessing — only vetted
  facts, cited. This constraint is part of the contract, not a prompt nicety.

## UI separation
Two sections, two registers, never mixed:
- **A — "Ce qui a marché pour vous"** — your actions, prescriptive ("à reconduire"), track record.
- **B — "Comment votre lieu réagit"** — your environment, predictive ("à anticiper"), observed frequency.

They never share a card, a section, or a number. A "reconduire" (prescriptive, self-selected,
tiny-N) and a "votre lieu réagit ainsi" (predictive, controlled, large-N) are different claims with
different trust models — mixing them launders B's abundance into A's authority or A's caution into
B's confidence.

## Prohibited (the failure modes this contract exists to prevent)
- Pooling A and B counts into one number or one `positive_rate`.
- Surfacing an uncontrolled correlation as a Type B "learning."
- A "proven"/"prouvé" label on a Type A (self-selected) track record.
- One UI card that mixes "what you did" with "how your venue responds."
- **A consumer querying the sensitivity mart directly, or recomputing an effect** — everything goes
  through the one typed accessor (§A). Present, never compute.
- **The prompt-page LLM inventing a correlation or extrapolating beyond the store** — it cites
  vetted sensitivities verbatim, nothing else (§D).
- Building Type B as a per-surface feature instead of a shared service — the duplication trap (§A).
