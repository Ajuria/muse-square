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

const PROJECT = "muse-square-open-data";
const OFFERING_DAILY = `\`${PROJECT}.mart.fct_client_offering_daily\``;
// Partition-safe literal bounds (the daily table is date-partitioned; a literal range both satisfies
// partition elimination and anchors on the data's own dates, never CURRENT_DATE — seeds are future-dated).
const DATE_FLOOR = "2020-01-01";
const DATE_CEIL = "2035-01-01";

// A category is "core" at/above this revenue share; below it is long tail.
const CORE_MIN_SHARE = 0.03;   // 3%
// Don't assert concentration below this many total units (shares unstable) — honest-absent instead.
const MIN_UNITS = 300;

// ── Temporal noise band (step 2). A weekday/weekend or seasonal shift is asserted ONLY when it clears
// BOTH a material floor AND a statistical bar over the whole history — never a single day-pair. On flat
// data (the uniform Kaggle seed) every category fails the band → honest-absent, by design.
const WW_MIN_PP = 3;            // material: mean weekend-minus-weekday share gap ≥ 3 percentage points
const WW_MIN_SE_MULT = 2;       // statistical: gap ≥ 2× pooled standard error of the two means
const WW_MIN_DAYS = 8;          // need ≥ this many days in EACH bucket
const SEASON_MIN_RANGE_PP = 5;  // material: max-min monthly share range ≥ 5 pp
const SEASON_MIN_MONTHS = 3;    // need ≥ this many months

function frPct(share: number): string {
  return Number.isFinite(share)
    ? `${(share * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
    : "ND";
}
function frInt(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("fr-FR") : "ND";
}

const num = (v: any): number => (v == null ? NaN : Number(v && typeof v === "object" && "value" in v ? (v as any).value : v));
const str = (v: any): string => (v == null ? "" : String(v && typeof v === "object" && "value" in v ? (v as any).value : v)).trim();

type WWStat = { category: string; wd_mean: number; wd_sd: number; wd_n: number; we_mean: number; we_sd: number; we_n: number };
type MonthShare = { category: string; ym: string; share_pct: number };

// Fetch the two temporal aggregates over the venue's full offering history. Uses the passed bq client.
async function fetchTemporal(bq: any, location_id: string): Promise<{ ww: WWStat[]; monthly: MonthShare[] }> {
  const params = { location_id };
  const types = { location_id: "STRING" as const };
  const dayCatCTE = `
    WITH day_cat AS (
      SELECT transaction_date, item_category, revenue,
             SUM(revenue) OVER (PARTITION BY transaction_date) AS day_total,
             IF(EXTRACT(DAYOFWEEK FROM transaction_date) IN (1,7), 'weekend', 'weekday') AS bucket
      FROM ${OFFERING_DAILY}
      WHERE location_id = @location_id AND item_category IS NOT NULL
        AND transaction_date BETWEEN DATE '${DATE_FLOOR}' AND DATE '${DATE_CEIL}'
    )`;
  const [wwRes, moRes] = await Promise.all([
    bq.query({
      query: `${dayCatCTE},
        shares AS (SELECT item_category, bucket, SAFE_DIVIDE(revenue, day_total) * 100 AS s FROM day_cat WHERE day_total > 0)
        SELECT item_category,
          AVG(IF(bucket='weekday', s, NULL))    AS wd_mean, STDDEV(IF(bucket='weekday', s, NULL)) AS wd_sd, COUNTIF(bucket='weekday') AS wd_n,
          AVG(IF(bucket='weekend', s, NULL))    AS we_mean, STDDEV(IF(bucket='weekend', s, NULL)) AS we_sd, COUNTIF(bucket='weekend') AS we_n
        FROM shares GROUP BY item_category`,
      params, types, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
    bq.query({
      query: `${dayCatCTE},
        mo AS (SELECT item_category, FORMAT_DATE('%Y-%m', transaction_date) AS ym, SUM(revenue) AS cat_rev FROM day_cat GROUP BY 1, 2)
        SELECT item_category, ym, SAFE_DIVIDE(cat_rev, SUM(cat_rev) OVER (PARTITION BY ym)) * 100 AS share_pct FROM mo`,
      params, types, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
  ]);

  const ww: WWStat[] = (Array.isArray(wwRes) ? wwRes : []).map((r: any) => ({
    category: str(r.item_category), wd_mean: num(r.wd_mean), wd_sd: num(r.wd_sd), wd_n: num(r.wd_n),
    we_mean: num(r.we_mean), we_sd: num(r.we_sd), we_n: num(r.we_n),
  }));
  const monthly: MonthShare[] = (Array.isArray(moRes) ? moRes : []).map((r: any) => ({
    category: str(r.item_category), ym: str(r.ym), share_pct: num(r.share_pct),
  }));
  return { ww, monthly };
}

// Pure: temporal stats -> facts (only past the noise band) + card data. Deterministic, no I/O.
// Exported for unit-testing the band (the seed is flat, so the live path is honest-absent; a synthetic
// fixture proves the band actually FIRES when a real shift exists — else "silent" is indistinguishable
// from "broken").
export function analyzeTemporal(ww: WWStat[], monthly: MonthShare[]): { facts: FamilyFact[]; data: Record<string, unknown> } {
  const facts: FamilyFact[] = [];
  const ww_signals: any[] = [];
  for (const c of ww) {
    if (!(c.wd_n >= WW_MIN_DAYS && c.we_n >= WW_MIN_DAYS) || !Number.isFinite(c.wd_mean) || !Number.isFinite(c.we_mean)) continue;
    const gap = c.we_mean - c.wd_mean;                       // signed: + = heavier on weekends
    const se = Math.sqrt((c.wd_sd * c.wd_sd) / c.wd_n + (c.we_sd * c.we_sd) / c.we_n);
    const clears = Math.abs(gap) >= WW_MIN_PP && Math.abs(gap) >= WW_MIN_SE_MULT * se;
    if (clears) {
      const when = gap > 0 ? "le week-end" : "en semaine";
      const pp = Math.round(Math.abs(gap) * 10) / 10;
      facts.push({
        fact_fr: `Votre mix bascule ${when} : ${c.category} y pèse ${pp.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp de plus (${Math.round(gap > 0 ? c.we_mean : c.wd_mean)} % vs ${Math.round(gap > 0 ? c.wd_mean : c.we_mean)} %).`,
        claim_type: "observed",
      });
      ww_signals.push({ category: c.category, gap_pp: Math.round(gap * 10) / 10, heavier: gap > 0 ? "weekend" : "weekday" });
    }
  }

  // Seasonal: per-category monthly share range, only when it clears the material floor over ≥ N months.
  const season_signals: any[] = [];
  const byCat: Record<string, number[]> = {};
  for (const m of monthly) if (m.category && Number.isFinite(m.share_pct)) (byCat[m.category] ||= []).push(m.share_pct);
  for (const [cat, arr] of Object.entries(byCat)) {
    if (arr.length < SEASON_MIN_MONTHS) continue;
    const range = Math.max(...arr) - Math.min(...arr);
    if (range >= SEASON_MIN_RANGE_PP) {
      facts.push({
        fact_fr: `La part de ${cat} varie de ${Math.round(range)} pp selon les mois (de ${Math.round(Math.min(...arr))} % à ${Math.round(Math.max(...arr))} %).`,
        claim_type: "observed",
      });
      season_signals.push({ category: cat, range_pp: Math.round(range * 10) / 10 });
    }
  }

  return { facts, data: { weekday_weekend: ww_signals, seasonal: season_signals, any_signal: facts.length > 0 } };
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

  // Temporal layer (step 2): weekday/weekend + seasonal mix shifts, noise-band gated. On flat data
  // (the uniform seed) this returns NO facts (honest-absent) — the answer stays the concrete mix.
  const temporal = await fetchTemporal(bq, location_id)
    .then((t) => analyzeTemporal(t.ww, t.monthly))
    .catch(() => ({ facts: [] as FamilyFact[], data: { any_signal: false } as Record<string, unknown> }));
  facts.push(...temporal.facts);

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
    temporal: temporal.data,
  };

  const sources = ["Votre caisse — ventes par catégorie et par article (30 j)"];

  return { found: true, data, facts, sources };
}
