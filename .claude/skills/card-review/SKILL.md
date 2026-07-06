---
name: card-review
description: Review a Muse Square action card against the quality bar before shipping. Use when writing, editing, or evaluating card copy, sowhat functions, action lines, draft seeds, or the mart/SQL that produces a card. Guards truth, causal honesty, and action relevance so cards never read as 101 advice below the operator's level.
---

# card-review

The bar: a card earns its slot only if it tells the operator something TRUE they couldn't see themselves AND points at something they can MOVE. No 101 advice. Check every item; flag failures explicitly.

## Data truth
- **Baseline:** robust (trailing median + noise band, control for events/holidays), not a fragile single-point same-weekday compare that can read as reversion-from-a-peak. Fire only when deviation > the location's own daily variance (~1.5σ). Show the level shift, not the cherry-picked day pair.
- **Decomposition:** compute drivers from data actually present — revenue = transactions × basket; add footfall × conversion ONLY if a footfall feed exists. Ban vague `"mixed"`; state the split or say "conversion inconnue — pas de flux".
- **Dating:** distinguish event/action-date vs data-as-of vs valid-until. Never present an ingestion date as an action date.
- **Provenance:** every number traceable (source / coverage% / freshness). Suppress or flag when a dimension is stale/missing.

## Causal honesty
- No fabricated per-factor % attribution. Prefer expected-vs-actual residual ("attendu €X, réel €Y, écart €Z").
- Confidence tier visible: **confirmed** (diff-in-diff / counterfactual) / **likely** (residual + matched baseline) / **possible** (co-occurrence). Use "coïncide avec" not "à cause de" for `possible`.
- Inside the noise band → emit nothing.

## Action relevance
- Split **in-app-executable** (attach the real control: publish / send / internal alert — never write "communiquez sur…") from **outside-app** (recommend only).
- Outside-app recs must pass all four: **specificity** (strip what the owner already knows; use their peak hours / top items / competitor+distance+date), **€-stakes** (money at risk), **non-obviousness + controllability** (only drivers they can move), **falsifiability** (what would confirm/refute next period).
- **Vocabulary** matches the location's vertical + top items (F&B: carte / ticket moyen / ventes additionnelles — not "assortiment").

See memory: card-quality-and-edge-roadmap, opportunity-cards-bespoke-vision.
