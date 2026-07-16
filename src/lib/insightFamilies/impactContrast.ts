// src/lib/insightFamilies/impactContrast.ts
// SHARED math for the measured-impact engine (v1: events 16/07, competitor 16/07): a high-vs-low
// day contrast on `fct_client_day_residual.residual_pct` (actual vs dow+trend normale — weekday and
// trend already controlled). One place for the gates and the tier ladder so every family states
// impact with the SAME discipline:
//   - ≥ MIN_SIDE days on each side AND real variation (hi > lo) or nothing is stated;
//   - |t| ≥ T_QUANT quantifies (observed_difference + tier); below it, the NULL result ships WITH
//     its numbers — a measured « aucun écart mesurable » is a verdict, not a shrug;
//   - tier capped at « emergent » (|t| ≥ T_EMERGENT and n ≥ N_EMERGENT per side): one window of
//     history never earns « etabli ».
// Association, never cause: residual_pct controls dow+trend, not season/tourism confounds — fact
// phrasing stays associative; the tier alone licenses a causal upgrade (grounded rule 3bis).

export const IMPACT_MIN_SIDE = 10;
export const IMPACT_T_QUANT = 2;
export const IMPACT_T_EMERGENT = 3;
export const IMPACT_N_EMERGENT = 30;

export type ImpactTier = "preliminaire" | "emergent";

export interface ContrastAggregates {
  hi: number; lo: number;
  n_high: number; n_low: number;
  mean_high: number; mean_low: number;
  sd_high: number; sd_low: number;
}

export interface ImpactContrast {
  n_high: number; n_low: number;
  delta_pp: number; se: number; t: number;
  hi: number; lo: number;
  tier: ImpactTier | null;   // null → below the |t| gate: state as "no measurable effect"
}

// Aggregates (one BQ row) → a gated contrast, or null when the gates refuse a statement.
export function finalizeContrast(a: ContrastAggregates): ImpactContrast | null {
  const { hi, lo, n_high, n_low, sd_high, sd_low } = a;
  if (!(hi > lo) || n_high < IMPACT_MIN_SIDE || n_low < IMPACT_MIN_SIDE) return null;
  if (!Number.isFinite(sd_high) || !Number.isFinite(sd_low)) return null;
  const delta = a.mean_high - a.mean_low;
  const se = Math.sqrt((sd_high * sd_high) / n_high + (sd_low * sd_low) / n_low);
  if (!Number.isFinite(delta) || !Number.isFinite(se) || se <= 0) return null;
  const t = delta / se;
  const tier: ImpactTier | null = Math.abs(t) >= IMPACT_T_QUANT
    ? (Math.abs(t) >= IMPACT_T_EMERGENT && Math.min(n_high, n_low) >= IMPACT_N_EMERGENT ? "emergent" : "preliminaire")
    : null;
  return { n_high, n_low, delta_pp: delta, se, t, hi, lo, tier };
}

// French pp formatting (comma decimal, explicit sign) — display only; raw numbers stay in data.
export const frPp = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")} pp`;

// The card block both renderers consume (renderEvents / renderCompetitor « Impact mesuré sur votre CA »).
export const IMPACT_NOTE_FR =
  "Écarts vs votre normale (jour de semaine et tendance contrôlés). Association mesurée sur vos propres journées — pas une preuve de cause.";
