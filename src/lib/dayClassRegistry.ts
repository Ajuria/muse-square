// src/lib/dayClassRegistry.ts
//
// DAY-CLASS REGISTRY — the ONE home of « Enjeu €/an » (annualized pattern weight) for action cards,
// and the substrate of the future structural pattern-finder cards. Full spec + decisions + backlog:
// docs/enjeu-day-class-registry.md (read it before extending).
//
// WHAT IT COMPUTES (per location, per day-class):
//   Enjeu €/an = AVG(daily_revenue − expected_revenue on class days) × (class days per year, real
//   frequency from this venue's own history). expected_revenue = the dow+trend normale
//   (mart.fct_client_day_residual) — weekday mix and trend are already controlled; what remains is
//   a CONDITIONAL ASSOCIATION, never a causal claim (see the causation ladder in the doc).
//   NEVER an extrapolation of one day's gap (owner decision, proto 24/07: « who acts over 110 € ? »).
//
// HONESTY GATES (tier = epistemic level, shown on the pill):
//   - n_days >= 5 AND span >= 60 j   → 'estimé'
//   - n_days >= 10 AND |t| >= 2 AND span >= 300 j → 'mesuré'
//     (span >= 300: a frequency extrapolated from one season is biased — 8 rainy days in a 90-day
//      summer window is not an annual rain rate. Short spans NEVER earn 'mesuré'.)
//   - below the floor, or positive gap on a threat card → NO enjeu (honest absence, no pill).
//   - weather classes are mutually exclusive by construction (CASE first-match), so weather-vs-
//     weather double counting is impossible. Cross-family classes (competition, events…) must add
//     an overlap policy before joining the registry — see backlog.
//
// CONSUMERS: api/insight/monitor.ts (Pulse feed candidates — attach via enjeuForWeatherCandidate).
//   days.ts / insight surface: queued. The pill renders in pulse.astro buildMetricsStrip.
//
// BACKLOG (documented, NOT implemented — keep the doc in sync):
//   offline nightly store (analytics) instead of request-time compute; competition/suivis/events/
//   mobility/tourism classes via impactContrast; green opportunity pill (positive gaps); matching
//   (clean contrasts), VIF refusal, placebo + stability self-tests; discount_no_lift after bq-verify.

export type DayClassImpact = {
  class_key: string;      // registry key, e.g. 'heat'
  label_fr: string;       // French label for future card copy, e.g. 'jours de forte chaleur'
  eur_year: number;       // annualized € weight (negative = loss vs normale)
  tier: "estimé" | "mesuré";
  n_days: number;
  span_months: number;
  avg_gap_eur: number;
  t_stat: number;
};

export type DayClassResult = {
  impacts: Map<string, DayClassImpact>;   // class_key -> impact (all classes passing the floor)
  conditionByDate: Map<string, string>;   // 'YYYY-MM-DD' -> class_key (for cards not naming theirs)
};

// The registry. v1 = the five weather conditions of fct_location_context_daily (lvl_* >= 2).
// Order matters: it is the CASE priority — each history day belongs to AT MOST ONE class.
export const WEATHER_DAY_CLASSES: Array<{ key: string; level_col: string; label_fr: string }> = [
  { key: "heat", level_col: "lvl_heat", label_fr: "jours de forte chaleur" },
  { key: "rain", level_col: "lvl_rain", label_fr: "jours de pluie marquée" },
  { key: "wind", level_col: "lvl_wind", label_fr: "jours de vent fort" },
  { key: "snow", level_col: "lvl_snow", label_fr: "jours de neige" },
  { key: "cold", level_col: "lvl_cold", label_fr: "jours de grand froid" },
];

const PROJECT = "muse-square-open-data";

function conditionCaseSql(): string {
  return "CASE " + WEATHER_DAY_CLASSES
    .map((c) => `WHEN c.${c.level_col} >= 2 THEN '${c.key}'`)
    .join(" ") + " END";
}

/**
 * One location → all day-class impacts + the dominant condition of the given dates.
 * Two parallel queries; both fail soft to empty (no enjeu is always a legal outcome).
 * `dates` = the ISO dates of the surfaced candidates (selected_dates window) — used to resolve the
 * condition of cards that do not carry it in their payload (weather_worsened, extended_bad_weather*).
 */
export async function computeDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [aggRows, dateRows] = await Promise.all([
    bq.query({
      query: `
        WITH cond AS (
          SELECT
            c.date,
            ${conditionCaseSql()} AS condition,
            r.daily_revenue - r.expected_revenue AS gap_eur
          FROM \`${PROJECT}.mart.fct_location_context_daily\` c
          JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
            ON r.location_id = c.location_id AND r.date = c.date
          WHERE c.location_id = @location_id
        )
        SELECT
          condition,
          COUNT(*) AS n_days,
          AVG(gap_eur) AS avg_gap_eur,
          STDDEV_SAMP(gap_eur) AS sd_gap_eur,
          (SELECT DATE_DIFF(MAX(date), MIN(date), DAY) + 1 FROM cond) AS span_days
        FROM cond
        WHERE condition IS NOT NULL
        GROUP BY condition
      `,
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    dates.length > 0 ? bq.query({
      query: `
        SELECT FORMAT_DATE('%Y-%m-%d', c.date) AS date, ${conditionCaseSql()} AS condition
        FROM \`${PROJECT}.mart.fct_location_context_daily\` c
        WHERE c.location_id = @location_id
          AND c.date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', d) FROM UNNEST(@dates) AS d))
      `,
      params: { location_id, dates },
      types: { dates: ["STRING"] },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []) : Promise.resolve([]),
  ]);

  const byKey = new Map(WEATHER_DAY_CLASSES.map((c) => [c.key, c]));
  const impacts = new Map<string, DayClassImpact>();
  for (const row of aggRows as any[]) {
    const cls = byKey.get(String(row?.condition || ""));
    const n = Number(row?.n_days ?? 0);
    const avg = Number(row?.avg_gap_eur ?? NaN);
    const sd = Number(row?.sd_gap_eur ?? NaN);
    const spanDays = Number(row?.span_days ?? 0);
    if (!cls || !Number.isFinite(avg) || n < 5 || spanDays < 60) continue;
    const t = Number.isFinite(sd) && sd > 0 ? Math.abs(avg) / (sd / Math.sqrt(n)) : 0;
    const tier: DayClassImpact["tier"] =
      n >= 10 && t >= 2 && spanDays >= 300 ? "mesuré" : "estimé";
    impacts.set(cls.key, {
      class_key: cls.key,
      label_fr: cls.label_fr,
      eur_year: Math.round(avg * (n / (spanDays / 365.25))),
      tier,
      n_days: n,
      span_months: Math.round(spanDays / 30.44),
      avg_gap_eur: Math.round(avg * 10) / 10,
      t_stat: Math.round(t * 100) / 100,
    });
  }

  const conditionByDate = new Map<string, string>();
  for (const row of dateRows as any[]) {
    if (row?.date && row?.condition) conditionByDate.set(String(row.date), String(row.condition));
  }
  return { impacts, conditionByDate };
}

// Weather action types that resolve their condition from the AFFECTED DATE (payload has none).
const DATE_RESOLVED_WEATHER_TYPES = new Set([
  "weather_worsened",
  "extended_bad_weather",
  "extended_bad_weather_3d",
]);

/**
 * The enjeu payload attached to one action candidate (or null — null ALWAYS means « no pill »).
 * Policy here, not in consumers: negative gaps only (enjeu à défendre — the amber pill); a positive
 * class on a threat card shows nothing (the green opportunity pill is designed, not wired).
 */
export function enjeuForWeatherCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): DayClassImpact | null {
  const actionType = String(candidate?.action_type || "");
  let cond: string | null = null;
  if (actionType === "weather_hazard_onset") {
    let payload: any = candidate?.data_payload ?? null;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = null; } }
    cond = String(payload?.new_value || "").split(":")[0] || null;
  } else if (DATE_RESOLVED_WEATHER_TYPES.has(actionType)) {
    const iso = String(candidate?.date?.value ?? candidate?.date ?? "").slice(0, 10);
    cond = iso ? (result.conditionByDate.get(iso) ?? null) : null;
  }
  if (!cond) return null;
  const impact = result.impacts.get(cond) ?? null;
  return impact && impact.eur_year < 0 ? impact : null;
}
