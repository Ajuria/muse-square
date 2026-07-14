// src/lib/ai/facts/buildIdentityFacts.ts
// =====================================================
// Phase 1 — Measured customer-identity facts.
// Turns what the warehouse MEASURES about a venue — what it sells (mix) and at what basket/scale —
// into claim_type:"measured" citable facts, each with a deterministic trust tier folded into the
// French string (the model surfaces fact_fr verbatim, so the trust travels with the number).
//
// TWO sources, NEVER crossed:
//   - offering (vw_insight_event_client_offering) -> MIX only. revenue_share is self-normalizing
//     (sums to 1.0) and trustworthy; its absolute revenue_30d does NOT reconcile with performance,
//     so we never surface offering money — only shares and volumes.
//   - performance (vw_insight_event_client_performance) -> SCALE only (basket, daily CA).
//
// Windows anchor on the DATA's own dates (aggregates over what exists), never CURRENT_DATE — the
// account seeds are future-dated, so a wall-clock window would silently miss the sales.
// Below the reliability floor the builder returns { status: "insufficient" } so the caller can
// ELICIT more data from the user rather than assert a weak identity (brand-trust guard).
// =====================================================

import { makeBQClient } from "../../bq";

const PROJECT = "muse-square-open-data";
const OFFERING = `\`${PROJECT}.semantic.vw_insight_event_client_offering\``;
const PERF = `\`${PROJECT}.semantic.vw_insight_event_client_performance\``;

// The performance view sits on a date-partitioned mart and ERRORS without a date filter. A literal
// range satisfies partition elimination; it is intentionally wide (covers any real or seeded
// history) — the actual window is the data's own min/max, derived by aggregation inside the query.
const DATE_FLOOR = "2020-01-01";
const DATE_CEIL = "2035-01-01";

// Deterministic trust thresholds. Below MIX/SCALE minimums the fact is NOT asserted.
const MIX_MIN_UNITS = 300;        // enough units for category shares to be stable
const MIX_MIN_CATEGORIES = 2;
const MIX_SOLID_UNITS = 1500;     // >= this -> "fiabilité élevée"
const SCALE_MIN_DAYS = 30;        // minimum history to state a basket/scale
const SCALE_MIN_TXNS = 200;
const SCALE_SOLID_DAYS = 90;      // >= 3 months of history -> "fiabilité élevée"
const SCALE_SOLID_TXNS = 2000;

// Categories are listed down to this share so the mix is granular; the rest folds into "+N autres".
const MIX_MIN_SHARE = 0.03;       // 3%
const TOP_ITEMS = 3;

export type IdentityTier = "solide" | "indicatif";

export type IdentityFact = {
  kind: "mix" | "top_items" | "scale";
  fact_fr: string;                // whitelist-ready; trust folded in (surfaced verbatim)
  claim_type: "measured";
  trust_tier: IdentityTier;
  trust_basis: string;            // structured basis for future UI, e.g. "181 j · 47 782 transactions"
};

export type IdentityFactsResult =
  | { status: "ok"; facts: IdentityFact[] }
  // Not enough measured data to characterize the business -> caller elicits (Phase 1 increment 4).
  | { status: "insufficient"; reason: string };

// ---- French formatting (mirrors the app's fr-FR frInt/frDec convention; those live client-side only) ----
function frInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("fr-FR") : "ND";
}
function frEur(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "ND";
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: dp, maximumFractionDigits: dp })} €`;
}
function frPct(share: number): string {
  if (!Number.isFinite(share)) return "ND";
  return `${(share * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}
// BQ numerics arrive as strings or { value } — coerce safely.
const num = (v: any): number =>
  v == null ? NaN : Number(v && typeof v === "object" && "value" in v ? (v as any).value : v);
const str = (v: any): string => (v == null ? "" : String(v && typeof v === "object" && "value" in v ? (v as any).value : v)).trim();

type CatRow = { item_category: string; cat_share: number; cat_units: number };
type ItemRow = { item_description: string; units_30d: number; avg_unit_price: number };
type PerfRow = { days: number; avg_basket: number; mean_daily_rev: number; total_txns: number };

export type IdentityAggregates = { categories: CatRow[]; items: ItemRow[]; perf: PerfRow | null };

// Fetch the three measured aggregates for a location. Pure I/O; no formatting. Exported so the
// offering family (concentration/temporal) reuses the SAME reads instead of re-querying the views.
export async function fetchIdentityAggregates(location_id: string): Promise<IdentityAggregates> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const loc = { location_id };
  const locTypes = { location_id: "STRING" as const };

  const [catRes, itemRes, perfRes] = await Promise.all([
    bq.query({
      query: `
        SELECT item_category,
               SUM(revenue_share) AS cat_share,
               SUM(units_30d)     AS cat_units
        FROM ${OFFERING}
        WHERE location_id = @location_id AND item_category IS NOT NULL
        GROUP BY item_category
        ORDER BY SUM(revenue_30d) DESC`,
      params: loc, types: locTypes, location: "EU",
    }),
    bq.query({
      query: `
        SELECT item_description, units_30d, avg_unit_price
        FROM ${OFFERING}
        WHERE location_id = @location_id AND item_description IS NOT NULL
        ORDER BY revenue_rank
        LIMIT ${TOP_ITEMS}`,
      params: loc, types: locTypes, location: "EU",
    }),
    bq.query({
      // DATE bounds are inlined as literals (module constants, not user input): the BQ Node client
      // silently returns 0 rows on DATE param type mismatches, and a literal range is exactly what
      // partition elimination needs on this date-partitioned view.
      query: `
        SELECT COUNT(DISTINCT date)                              AS days,
               AVG(daily_avg_basket)                             AS avg_basket,
               SAFE_DIVIDE(SUM(daily_revenue), COUNT(DISTINCT date)) AS mean_daily_rev,
               SUM(daily_transactions)                          AS total_txns
        FROM ${PERF}
        WHERE location_id = @location_id
          AND date BETWEEN DATE '${DATE_FLOOR}' AND DATE '${DATE_CEIL}'`,
      params: loc, types: locTypes, location: "EU",
    }),
  ]);

  const categories: CatRow[] = (catRes[0] ?? []).map((r: any) => ({
    item_category: str(r.item_category),
    cat_share: num(r.cat_share),
    cat_units: num(r.cat_units),
  }));
  const items: ItemRow[] = (itemRes[0] ?? []).map((r: any) => ({
    item_description: str(r.item_description),
    units_30d: num(r.units_30d),
    avg_unit_price: num(r.avg_unit_price),
  }));
  const p = (perfRes[0] ?? [])[0];
  const perf: PerfRow | null = p
    ? { days: num(p.days), avg_basket: num(p.avg_basket), mean_daily_rev: num(p.mean_daily_rev), total_txns: num(p.total_txns) }
    : null;

  return { categories, items, perf };
}

// Pure: aggregates -> measured identity facts (or insufficient). Deterministic, no I/O.
export function assembleIdentityFacts(agg: {
  categories: CatRow[];
  items: ItemRow[];
  perf: PerfRow | null;
}): IdentityFactsResult {
  const facts: IdentityFact[] = [];
  const cats = agg.categories.filter((c) => c.item_category && Number.isFinite(c.cat_share));
  const unitsTotal = cats.reduce((s, c) => s + (Number.isFinite(c.cat_units) ? c.cat_units : 0), 0);
  const nCats = cats.length;

  // --- MIX: what they sell (shares) ---
  const mixQualifies = unitsTotal >= MIX_MIN_UNITS && nCats >= MIX_MIN_CATEGORIES;
  if (mixQualifies) {
    // Groundable phrasing for the number-validated grounded_day surface: exactly ONE percentage
    // (the lead category), the rest ranked by NAME. Multiple share %s invite the model to sum
    // arbitrary subsets ("top 3 = 79 %") — a DERIVED number the grounding validator rejects, and the
    // model does it despite the prompt's explicit no-arithmetic rule. Naming (not chiffring) the tail
    // is exactly what that rule prescribes. Full per-category shares live in `categories` for the
    // discovery/report paths (no number validator) and future UI.
    const lead = cats[0];
    const restNames = cats.slice(1).map((c) => c.item_category);
    const restClause = restNames.length ? `, devant ${restNames.join(", ")}` : "";
    const tier: IdentityTier = unitsTotal >= MIX_SOLID_UNITS ? "solide" : "indicatif";
    const conf = tier === "solide" ? "fiabilité élevée" : "fiabilité indicative — volume limité";
    facts.push({
      kind: "mix",
      fact_fr: `Votre 1re catégorie de vente est ${lead.item_category} (${frPct(lead.cat_share)} du CA)${restClause} — ${nCats} catégories vendues, ${frInt(unitsTotal)} unités mesurées (${conf}).`,
      claim_type: "measured",
      trust_tier: tier,
      trust_basis: `${frInt(unitsTotal)} unités · ${nCats} catégories`,
    });

    // --- TOP ITEMS: item-level granularity (decision #1: as granular as the data allows) ---
    const items = agg.items.filter((i) => i.item_description && Number.isFinite(i.units_30d));
    if (items.length) {
      const listedItems = items.map((i) => `${i.item_description} (${frInt(i.units_30d)} u)`).join(", ");
      const prices = items.map((i) => i.avg_unit_price).filter((p) => Number.isFinite(p));
      const priceClause = prices.length
        ? ` à ${frEur(Math.min(...prices))}–${frEur(Math.max(...prices))} l'unité`
        : "";
      facts.push({
        kind: "top_items",
        fact_fr: `Vos meilleures ventes : ${listedItems}${priceClause}.`,
        claim_type: "measured",
        trust_tier: tier,
        trust_basis: `item-level · ${frInt(unitsTotal)} unités`,
      });
    }
  }

  // --- SCALE: basket + daily CA (performance; longest reliable window = the data's full history) ---
  const perf = agg.perf;
  const scaleQualifies = !!perf && perf.days >= SCALE_MIN_DAYS && perf.total_txns >= SCALE_MIN_TXNS
    && Number.isFinite(perf.avg_basket) && Number.isFinite(perf.mean_daily_rev);
  if (scaleQualifies && perf) {
    const tier: IdentityTier = perf.days >= SCALE_SOLID_DAYS && perf.total_txns >= SCALE_SOLID_TXNS ? "solide" : "indicatif";
    const conf = tier === "solide" ? "fiabilité élevée" : "fiabilité indicative — historique court";
    facts.push({
      kind: "scale",
      fact_fr: `Panier moyen ${frEur(perf.avg_basket)} ; CA journalier moyen ~${frEur(perf.mean_daily_rev, 0)} sur ${perf.days} j d'historique (${conf}).`,
      claim_type: "measured",
      trust_tier: tier,
      trust_basis: `${perf.days} j · ${frInt(perf.total_txns)} transactions`,
    });
  }

  if (!facts.length) {
    return {
      status: "insufficient",
      reason: "Pas assez de ventes mesurées pour caractériser l'activité de façon fiable.",
    };
  }
  return { status: "ok", facts };
}

// Convenience: fetch + assemble. The one entry point callers use.
export async function buildIdentityFacts(location_id: string): Promise<IdentityFactsResult> {
  const agg = await fetchIdentityAggregates(location_id);
  return assembleIdentityFacts(agg);
}
