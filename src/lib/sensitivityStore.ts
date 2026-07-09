// Type B — the ONE typed accessor for the sensitivity store (contract §A).
//
// EVERY surface that cites "comment votre lieu réagit" imports THIS. None queries the
// store table directly; none recomputes an effect. Honesty is enforced ONCE, offline, at
// ingestion (the b_engine batch: mechanism + N + consistency + BH correction + pooled
// eligibility + per-venue contrast scoping). Consumers PRESENT, never compute — a row that
// exists here is already vetted, tiered, and scoped to a venue that has real evidence for it.
//
// Store table is currently the dev batch output (`analytics.b_sensitivity_store`). It is
// repointed to the mart (`mart.fct_location_sensitivity`) when the dbt/BQML batch model
// lands — change STORE_TABLE only, no consumer touches the path.

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
// PROD/default = the real batch output of the offline engine (src/scripts/sensitivity-engine.cjs
// BMODE=real): analytics.b_sensitivity_store, populated from the real residual × context. A caller
// may override via opts.storeTable (dev fixtures only). -> mart.fct_location_sensitivity in prod.
const STORE_TABLE = "analytics.b_sensitivity_store";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export type Tier = "preliminaire" | "emergent" | "etabli";
export type Direction = "up" | "down";

export interface Sensitivity {
  location_id: string;
  feature: string;          // driver condition key (heat, rain, tourism_peak, school_holiday…)
  metric: string;           // outcome affected (revenue now; footfall/conversion/basket by rerun)
  direction: Direction;
  effect_size: number;      // controlled residual effect as a fraction (-0.107 = -10.7% vs expected)
  se: number;               // standard error (fraction)
  t_stat: number;
  n_days: number;           // qualifying sample (feature-on days, post-controls)
  consistency_pct: number;  // share of qualifying days the effect held, net of other factors
  confidence_tier: Tier;    // after mechanism + N + consistency + BH + eligibility gate
  mechanism_tag: string;    // the plausible mechanism (theory-constrained, not a blind sweep)
  estimate_scope: "per_location" | "pooled"; // whether the number is this venue's fit or the pooled fallback
  period_start: string | null; // ISO date — start of the window the sample was drawn from
  period_end: string | null;   // ISO date — end of that window (copy renders "pour la période …")
}

const TIER_RANK: Record<Tier, number> = { etabli: 3, emergent: 2, preliminaire: 1 };

// THE TIER GATES INFLUENCE, NOT JUST COPY (contract rule). Even with every gate passed a
// préliminaire can still be noise — that is what "à confirmer" concedes — so its blast radius
// is bounded to DISPLAY. Only émergent+ may drive anything consequential (the context-adjusted
// baseline, a strong recommendation, an alert). A consumer that influences state MUST filter
// with `canInfluence` first; a display-only consumer may show everything.
export const TIER_INFLUENCE: Record<Tier, { display: boolean; influence: boolean }> = {
  etabli: { display: true, influence: true },
  emergent: { display: true, influence: true },
  preliminaire: { display: true, influence: false }, // display-only — never drives baseline/recos
};
export const canInfluence = (tier: Tier): boolean => TIER_INFLUENCE[tier].influence;

// Read vetted sensitivities for a venue. `minTier` lets a surface show only established
// signals (e.g. the daily score) while the prompt page shows everything down to préliminaire.
export async function getSensitivities(
  bq: any,
  locationId: string,
  opts: { metric?: string; minTier?: Tier; influencingOnly?: boolean; storeTable?: string } = {}
): Promise<Sensitivity[]> {
  const conds = ["location_id=@loc"];
  const params: any = { loc: locationId };
  if (opts.metric) { conds.push("metric=@metric"); params.metric = opts.metric; }
  const table = opts.storeTable || STORE_TABLE; // dev-only override; default = real store
  const [rows] = await bq.query({
    query:
      `SELECT location_id, feature, metric, direction, effect_size, se, t_stat, n_days, ` +
      `consistency_pct, confidence_tier, mechanism_tag, estimate_scope, ` +
      `CAST(period_start AS STRING) AS period_start, CAST(period_end AS STRING) AS period_end ` +
      `FROM \`${PROJECT}.${table}\` WHERE ${conds.join(" AND ")} ` +
      `ORDER BY ABS(effect_size) DESC`,
    params, location: "EU",
  });
  const min = opts.minTier ? TIER_RANK[opts.minTier] : 0;
  return (rows || [])
    .map((r: any): Sensitivity => ({
      location_id: flat(r.location_id), feature: flat(r.feature), metric: flat(r.metric),
      direction: flat(r.direction), effect_size: Number(flat(r.effect_size)),
      se: Number(flat(r.se)), t_stat: Number(flat(r.t_stat)), n_days: Number(flat(r.n_days)),
      consistency_pct: Number(flat(r.consistency_pct)), confidence_tier: flat(r.confidence_tier),
      mechanism_tag: flat(r.mechanism_tag), estimate_scope: flat(r.estimate_scope),
      period_start: flat(r.period_start) ?? null, period_end: flat(r.period_end) ?? null,
    }))
    .filter((s: Sensitivity) => TIER_RANK[s.confidence_tier] >= min)
    .filter((s: Sensitivity) => !opts.influencingOnly || canInfluence(s.confidence_tier));
}
