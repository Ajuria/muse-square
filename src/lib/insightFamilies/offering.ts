// src/lib/insightFamilies/offering.ts
// OFFERING / SALES-MIX family provider (Phase 1, increment 2.5 · step 1).
// Answers WHAT-I-SELL questions ("quels produits je vends le plus ?", "mes meilleures ventes").
//
// One provider, three consumers (footfall pattern): returns { found, data, facts, sources }.
// - facts: the INCREMENTAL grounded facts this family adds — concentration / long-tail. The named
//   products + basket + scale come from the generic measured-identity injection (buildIdentityFacts)
//   already folded into the grounded whitelist, so we do NOT duplicate them here.
// - data:  the card payload for MSCardKit.renderOffering (deep page — built in step 3; the client
//   guards a missing render, so this ships text-only until then).
// Reuses fetchIdentityAggregates (the SAME offering/performance reads) — no re-query.
// Step 2 will add the weekday/season temporal layer (noise-band gated, honest-absent on flat data).
import type { FamilyResult, FamilyFact } from "./types";
import { fetchIdentityAggregates } from "../ai/facts/buildIdentityFacts";

// A category is "core" at/above this revenue share; below it is long tail.
const CORE_MIN_SHARE = 0.03;   // 3%
// Don't assert concentration below this many total units (shares unstable) — honest-absent instead.
const MIN_UNITS = 300;

function frPct(share: number): string {
  return Number.isFinite(share)
    ? `${(share * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
    : "ND";
}
function frInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("fr-FR") : "ND";
}

export async function offeringFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const empty = (): FamilyResult => ({ found: false, data: { found: false, date }, facts: [], sources: [] });

  const agg = await fetchIdentityAggregates(location_id).catch(() => null);
  if (!agg) return empty();

  const cats = agg.categories.filter((c) => c.item_category && Number.isFinite(c.cat_share));
  const unitsTotal = cats.reduce((s, c) => s + (Number.isFinite(c.cat_units) ? c.cat_units : 0), 0);
  if (cats.length < 2 || unitsTotal < MIN_UNITS) return empty();

  // Concentration / long tail — a menu-rationalisation signal the operator rarely quantifies.
  const core = cats.filter((c) => c.cat_share >= CORE_MIN_SHARE);
  const tail = cats.filter((c) => c.cat_share < CORE_MIN_SHARE);
  const corePct = core.reduce((s, c) => s + c.cat_share, 0);
  const tailPct = tail.reduce((s, c) => s + c.cat_share, 0);

  const facts: FamilyFact[] = [];
  if (core.length && tail.length) {
    facts.push({
      // Both percentages are PRE-COMPUTED here (not left for the model to sum) so they ground verbatim.
      fact_fr: `Vos ${core.length} catégories principales concentrent ${frPct(corePct)} du CA ; ${tail.length} catégories marginales se partagent les ${frPct(tailPct)} restants.`,
      claim_type: "measured",
    });
  }

  // Card payload (renderOffering — step 3). Shares as measured; the card renders the full mix + items.
  const data = {
    found: true,
    date,
    categories: cats.map((c) => ({ category: c.item_category, share_pct: Math.round(c.cat_share * 1000) / 10, units: c.cat_units })),
    top_items: (agg.items ?? []).map((i) => ({ item: i.item_description, units: i.units_30d, avg_price: i.avg_unit_price })),
    basket: agg.perf?.avg_basket ?? null,
    mean_daily_rev: agg.perf?.mean_daily_rev ?? null,
    history_days: agg.perf?.days ?? null,
    concentration: { core_count: core.length, core_pct: Math.round(corePct * 1000) / 10, tail_count: tail.length, tail_pct: Math.round(tailPct * 1000) / 10 },
    total_units: unitsTotal,
    n_categories: cats.length,
  };

  const sources = ["Votre caisse — ventes par catégorie et par article (30 j)"];

  return { found: true, data, facts, sources };
}
