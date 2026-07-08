# Learning types — the A vs B contract

Status: **contract, for review.** Type A (action-outcome) is **built + verified** (see
[learning-engine.md](learning-engine.md)). **Type B (environmental-response) is NOT built** — this
doc is the full contract it will be built against (architecture + engine discipline + output store
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
- **Data budget is the ceiling → pooling later.** One venue supports a handful of robust main
  effects, not a web of interactions. Richer / interaction-level patterns need **cross-location
  pooling** (the deferred hierarchical model). Roadmap: **per-venue main effects now → pooled depth
  later.**
- **Seed — not greenfield.** The rigorous form already exists dormant: the **multi-factor
  challenger residual** (regress the residual on context features with controls, read the
  coefficients as sensitivities; see [[sales-signal-architecture-map]]). **Verify what it actually
  regresses on before building** — read the model, don't take the regressor list on faith. Promoted,
  it is both the Type B engine AND the improved baseline (section A).

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
