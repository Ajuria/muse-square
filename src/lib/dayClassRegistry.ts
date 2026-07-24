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

// The registry. Weather = the five conditions of fct_location_context_daily (lvl_* >= 2).
// Order matters: it is the CASE priority — each history day belongs to AT MOST ONE weather class.
export const WEATHER_DAY_CLASSES: Array<{ key: string; level_col: string; label_fr: string }> = [
  { key: "heat", level_col: "lvl_heat", label_fr: "jours de forte chaleur" },
  { key: "rain", level_col: "lvl_rain", label_fr: "jours de pluie marquée" },
  { key: "wind", level_col: "lvl_wind", label_fr: "jours de vent fort" },
  { key: "snow", level_col: "lvl_snow", label_fr: "jours de neige" },
  { key: "cold", level_col: "lvl_cold", label_fr: "jours de grand froid" },
];

// Cross-family classes (incrément 1 validé 24/07) : top-tercile days of the venue's own history.
// v1 = MARGINAL associations (no cross-class exclusion yet) — the overlap policy / clean contrasts
// land at step 2 (docs/kpi-enjeu-mapping.md §3 amendé). A day CAN belong to weather + competition +
// tourism classes at once; the pill attach rule (one pill per card, its own family only) is what
// prevents double-billing on a single card meanwhile.
export const TERCILE_DAY_CLASSES: Array<{ key: string; family: string; index_col: string; label_fr: string }> = [
  { key: "competition_high", family: "competition", index_col: "competition_index_local", label_fr: "jours à forte pression concurrentielle" },
  { key: "tourism_high", family: "tourism", index_col: "tourism_index_region", label_fr: "jours à fort flux touristique" },
];

const CLASS_LABELS: Record<string, string> = Object.fromEntries([
  ...WEATHER_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...TERCILE_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
]);

const PROJECT = "muse-square-open-data";
// Offline store (incrément 1) : raw aggregates ONLY — n/avg/sd/span per location × class. The
// POLICY (gates, tier, €/an, negative-only) lives HERE in rowsToImpacts and is applied at READ
// time, so a gate change never requires a re-batch. Rebuilt nightly by api/cron/day-class-impacts.
export const DAY_CLASS_STORE = "analytics.day_class_impacts";

function conditionCaseSql(): string {
  return "CASE " + WEATHER_DAY_CLASSES
    .map((c) => `WHEN c.${c.level_col} >= 2 THEN '${c.key}'`)
    .join(" ") + " END";
}

/**
 * The ONE aggregate computation — all locations (batch) or one (@location_id filter).
 * Emits RAW aggregates per location × class (no policy): the cron materializes this into
 * DAY_CLASS_STORE nightly; the live fallback runs it filtered on one location.
 * Tercile classes: top third of the venue's own index history; degenerate distributions
 * (min == max, e.g. a constant index) produce no class rows.
 */
export function dayClassAggregateSql(singleLocation: boolean): string {
  return `
    WITH joined AS (
      SELECT
        c.location_id,
        c.date,
        r.daily_revenue - r.expected_revenue AS gap_eur,
        ${conditionCaseSql()} AS weather_class,
        f.competition_index_local,
        f.tourism_index_region
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
        ON r.location_id = c.location_id AND r.date = c.date
      LEFT JOIN \`${PROJECT}.mart.fct_location_context_features_daily\` f
        ON f.location_id = c.location_id AND f.date = c.date
        -- partition elimination (features is date-partitioned) + history cap: 2 years is more
        -- than any venue's sales depth today and keeps annualization on recent behaviour.
        AND f.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND f.date <= CURRENT_DATE()
      WHERE c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()
      ${singleLocation ? "AND c.location_id = @location_id" : ""}
    ),
    th AS (
      SELECT
        location_id,
        APPROX_QUANTILES(competition_index_local, 3)[OFFSET(2)] AS comp_t2,
        MIN(competition_index_local) AS comp_min, MAX(competition_index_local) AS comp_max,
        APPROX_QUANTILES(tourism_index_region, 3)[OFFSET(2)] AS tour_t2,
        MIN(tourism_index_region) AS tour_min, MAX(tourism_index_region) AS tour_max
      FROM joined
      GROUP BY location_id
    ),
    classed AS (
      SELECT location_id, date, gap_eur, 'weather' AS family, weather_class AS class_key
      FROM joined WHERE weather_class IS NOT NULL
      UNION ALL
      SELECT j.location_id, j.date, j.gap_eur, 'competition', 'competition_high'
      FROM joined j JOIN th ON th.location_id = j.location_id
      WHERE j.competition_index_local IS NOT NULL AND th.comp_max > th.comp_min
        AND j.competition_index_local >= th.comp_t2
      UNION ALL
      SELECT j.location_id, j.date, j.gap_eur, 'tourism', 'tourism_high'
      FROM joined j JOIN th ON th.location_id = j.location_id
      WHERE j.tourism_index_region IS NOT NULL AND th.tour_max > th.tour_min
        AND j.tourism_index_region >= th.tour_t2
    ),
    span AS (
      SELECT location_id, DATE_DIFF(MAX(date), MIN(date), DAY) + 1 AS span_days
      FROM joined GROUP BY location_id
    )
    SELECT
      cl.location_id,
      cl.class_key,
      cl.family,
      COUNT(*) AS n_days,
      AVG(cl.gap_eur) AS avg_gap_eur,
      STDDEV_SAMP(cl.gap_eur) AS sd_gap_eur,
      s.span_days,
      CURRENT_TIMESTAMP() AS computed_at
    FROM classed cl
    JOIN span s ON s.location_id = cl.location_id
    GROUP BY cl.location_id, cl.class_key, cl.family, s.span_days
  `;
}

// THE policy — gates, tier, €/an — applied at READ time on raw rows. Single home; a gate
// change here is instantly effective on store rows without re-batching.
function rowsToImpacts(rows: any[]): Map<string, DayClassImpact> {
  const impacts = new Map<string, DayClassImpact>();
  for (const row of rows) {
    const key = String(row?.class_key ?? row?.condition ?? "");
    const n = Number(row?.n_days ?? 0);
    const avg = Number(row?.avg_gap_eur ?? NaN);
    const sd = Number(row?.sd_gap_eur ?? NaN);
    const spanDays = Number(row?.span_days ?? 0);
    if (!key || !CLASS_LABELS[key] || !Number.isFinite(avg) || n < 5 || spanDays < 60) continue;
    const t = Number.isFinite(sd) && sd > 0 ? Math.abs(avg) / (sd / Math.sqrt(n)) : 0;
    // |t| >= 1 floor for ANY pill (added incrément 1) : tercile classes pass n>=5 BY CONSTRUCTION
    // (~1/3 of history days), so without a signal floor pure noise gets annualized — proven live:
    // competition_high n=31, avg −2,8 €, t=0,08 would have shown « ~352 €/an ». Weak-but-real
    // effects (t in [1,2[) stay 'estimé'; 'mesuré' keeps |t|>=2 + n>=10 + span>=300j.
    if (t < 1) continue;
    const tier: DayClassImpact["tier"] =
      n >= 10 && t >= 2 && spanDays >= 300 ? "mesuré" : "estimé";
    impacts.set(key, {
      class_key: key,
      label_fr: CLASS_LABELS[key],
      eur_year: Math.round(avg * (n / (spanDays / 365.25))),
      tier,
      n_days: n,
      span_months: Math.round(spanDays / 30.44),
      avg_gap_eur: Math.round(avg * 10) / 10,
      t_stat: Math.round(t * 100) / 100,
    });
  }
  return impacts;
}

async function conditionByDateQuery(bq: any, location_id: string, dates: string[]): Promise<Map<string, string>> {
  if (!dates.length) return new Map();
  const rows = await bq.query({
    query: `
      SELECT FORMAT_DATE('%Y-%m-%d', c.date) AS date, ${conditionCaseSql()} AS condition
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      WHERE c.location_id = @location_id
        AND c.date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', d) FROM UNNEST(@dates) AS d))
    `,
    params: { location_id, dates },
    types: { dates: ["STRING"] },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const conditionByDate = new Map<string, string>();
  for (const row of rows as any[]) {
    if (row?.date && row?.condition) conditionByDate.set(String(row.date), String(row.condition));
  }
  return conditionByDate;
}

/**
 * Live (request-time) computation for ONE location — the FALLBACK when the store has no rows
 * for this location yet (fresh account before the nightly batch). Same SQL, same policy.
 */
export async function computeDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [aggRows, conditionByDate] = await Promise.all([
    bq.query({
      query: dayClassAggregateSql(true),
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    conditionByDateQuery(bq, location_id, dates),
  ]);
  return { impacts: rowsToImpacts(aggRows as any[]), conditionByDate };
}

/**
 * Store-first read (incrément 1) : impacts from DAY_CLASS_STORE (nightly batch), conditionByDate
 * live (light, window-dependent). Store empty for this location → live-compute fallback, so a
 * fresh account is never blind between two batch runs. This is what monitor.ts calls.
 */
export async function getDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [storeRows, conditionByDate] = await Promise.all([
    bq.query({
      query: `SELECT class_key, family, n_days, avg_gap_eur, sd_gap_eur, span_days FROM \`${PROJECT}.${DAY_CLASS_STORE}\` WHERE location_id = @location_id`,
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    conditionByDateQuery(bq, location_id, dates),
  ]);
  if ((storeRows as any[]).length > 0) {
    return { impacts: rowsToImpacts(storeRows as any[]), conditionByDate };
  }
  const live = await computeDayClassImpacts(bq, location_id, []);
  return { impacts: live.impacts, conditionByDate };
}

// Weather action types that resolve their condition from the AFFECTED DATE (payload has none).
const DATE_RESOLVED_WEATHER_TYPES = new Set([
  "weather_worsened",
  "extended_bad_weather",
  "extended_bad_weather_3d",
]);

// Card type → cross-family class. ONE class per card, its OWN family only — never a sum
// (docs/kpi-enjeu-mapping.md, familles B et D; combinés = facteur dominant, palier 2).
const CARD_TYPE_CLASS: Record<string, string> = {
  competition_proximity: "competition_high",
  competition_pressure_spike: "competition_high",
  high_competition_density: "competition_high",
  same_bucket_saturation: "competition_high",
  foreign_tourism_signal: "tourism_high",
  tourist_high_season: "tourism_high",
  tourist_surge_vacation: "tourism_high",
  tourism_peak_window: "tourism_high",
};

/**
 * The enjeu payload attached to one action candidate (or null — null ALWAYS means « no pill »).
 * Policy here, not in consumers: negative gaps only (enjeu à défendre — the amber pill); a positive
 * class shows nothing until the green « à capter » pill ships (étape 2 du plan validé 24/07).
 */
export function enjeuForCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): DayClassImpact | null {
  const actionType = String(candidate?.action_type || "");
  let cond: string | null = null;
  if (actionType === "weather_hazard_onset") {
    let payload: any = candidate?.data_payload ?? null;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = null; } }
    cond = String(payload?.new_value || "").split(":")[0] || null;
  } else if (DATE_RESOLVED_WEATHER_TYPES.has(actionType)) {
    const iso = String(candidate?.date?.value ?? candidate?.date ?? "").slice(0, 10);
    cond = iso ? (result.conditionByDate.get(iso) ?? null) : null;
  } else if (CARD_TYPE_CLASS[actionType]) {
    cond = CARD_TYPE_CLASS[actionType];
  }
  if (!cond) return null;
  const impact = result.impacts.get(cond) ?? null;
  return impact && impact.eur_year < 0 ? impact : null;
}
