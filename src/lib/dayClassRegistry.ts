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
  conditionByDate: Map<string, string>;   // 'YYYY-MM-DD' -> weather class_key (for date-resolved cards)
  calendarByDate: Map<string, { school: boolean; holiday: boolean }>; // date-resolved calendar flags
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

// Cross-family classes (étape 2 validée 24/07) : chaque classe est mesurée en CONTRASTE PROPRE —
// seuls les jours PURS comptent (appartenant à cette classe et à AUCUNE autre), donc « un jour
// pluie+grève ne se facture qu'une fois » et jamais deux pills ne facturent le même jour. Le prix :
// n fond sur les petits historiques — c'est le comportement honnête (les pills reviennent quand
// l'historique grandit). Les classes calendrier sont EN PLUS contrôlées mois × type-de-jour
// (leçon calendarFamily : le naïf mesure la saison, pas les vacances).
export const TERCILE_DAY_CLASSES: Array<{ key: string; family: string; index_col: string; label_fr: string }> = [
  { key: "competition_high", family: "competition", index_col: "competition_index_local", label_fr: "jours à forte pression concurrentielle" },
  { key: "tourism_high", family: "tourism", index_col: "tourism_index_region", label_fr: "jours à fort flux touristique" },
  { key: "events_high", family: "events", index_col: "events_within_500m_count", label_fr: "jours à forte densité d'événements (500 m)" },
];

export const OTHER_DAY_CLASSES: Array<{ key: string; family: string; label_fr: string }> = [
  { key: "mobility_disruption", family: "mobility", label_fr: "jours à perturbation de mobilité" },
  { key: "followed_activity_high", family: "suivis", label_fr: "jours de forte activité de vos concurrents suivis" },
  { key: "school_holiday", family: "calendar", label_fr: "jours de vacances scolaires (contrôlé mois et type de jour)" },
  { key: "public_holiday", family: "calendar", label_fr: "jours fériés (contrôlé mois et type de jour)" },
];

const CLASS_LABELS: Record<string, string> = Object.fromEntries([
  ...WEATHER_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...TERCILE_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...OTHER_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
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
 *
 * Étape 2 (validée 24/07) :
 *  - CONTRASTES PROPRES : une classe n'agrège que ses jours PURS (membres d'AUCUNE autre classe,
 *    `n_memberships = 1`) — un jour pluie+grève n'est jamais facturé deux fois.
 *  - Classes calendrier CONTRÔLÉES : gap ajusté = gap − moyenne des jours SANS AUCUNE classe du
 *    même (mois × semaine/week-end) du site, contrôle >= 3 jours requis (leçon calendarFamily :
 *    sans ce contrôle on mesure la saison, pas les vacances).
 *  - Terciles : top tiers de l'historique du site ; distributions dégénérées (index constant,
 *    activité suivie uniforme façon exposition permanente) → pas de classe.
 */
export function dayClassAggregateSql(singleLocation: boolean): string {
  return `
    WITH suivis_daily AS (
      SELECT s.location_id, d AS date, COUNT(*) AS active_ct
      FROM \`${PROJECT}.semantic.vw_insight_event_competitor_signals\` s,
        UNNEST(GENERATE_DATE_ARRAY(
          s.event_date,
          LEAST(COALESCE(s.event_date_end, s.event_date), DATE_ADD(s.event_date, INTERVAL 366 DAY))
        )) AS d
      WHERE s.entity_is_followed = TRUE AND s.event_date IS NOT NULL
      GROUP BY s.location_id, d
    ),
    joined AS (
      SELECT
        c.location_id,
        c.date,
        r.daily_revenue - r.expected_revenue AS gap_eur,
        ${conditionCaseSql()} AS weather_class,
        c.is_school_holiday_flag AS school_flag,
        c.is_public_holiday_flag AS holiday_flag,
        c.is_weekend_flag AS weekend_flag,
        EXTRACT(MONTH FROM c.date) AS month_num,
        f.competition_index_local,
        f.tourism_index_region,
        COALESCE(f.mobility_disruption_flag_event_window, FALSE) AS mobility_flag,
        e.events_within_500m_count AS events_500m,
        COALESCE(sv.active_ct, 0) AS suivis_ct
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
        ON r.location_id = c.location_id AND r.date = c.date
      LEFT JOIN \`${PROJECT}.mart.fct_location_context_features_daily\` f
        ON f.location_id = c.location_id AND f.date = c.date
        -- partition elimination (features is date-partitioned) + history cap: 2 years is more
        -- than any venue's sales depth today and keeps annualization on recent behaviour.
        AND f.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND f.date <= CURRENT_DATE()
      LEFT JOIN \`${PROJECT}.mart.fct_location_events_radius_daily\` e
        ON e.location_id = c.location_id AND e.date = c.date
        AND e.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND e.date <= CURRENT_DATE()
      LEFT JOIN suivis_daily sv
        ON sv.location_id = c.location_id AND sv.date = c.date
      WHERE c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()
      ${singleLocation ? "AND c.location_id = @location_id" : ""}
    ),
    th AS (
      SELECT
        location_id,
        APPROX_QUANTILES(competition_index_local, 3)[OFFSET(2)] AS comp_t2,
        MIN(competition_index_local) AS comp_min, MAX(competition_index_local) AS comp_max,
        APPROX_QUANTILES(tourism_index_region, 3)[OFFSET(2)] AS tour_t2,
        MIN(tourism_index_region) AS tour_min, MAX(tourism_index_region) AS tour_max,
        APPROX_QUANTILES(events_500m, 3)[OFFSET(2)] AS ev_t2,
        MIN(events_500m) AS ev_min, MAX(events_500m) AS ev_max,
        APPROX_QUANTILES(IF(suivis_ct > 0, suivis_ct, NULL), 3)[OFFSET(2)] AS sv_t2,
        COUNT(DISTINCT IF(suivis_ct > 0, suivis_ct, NULL)) AS sv_distinct
      FROM joined
      GROUP BY location_id
    ),
    flags AS (
      SELECT
        j.*,
        (j.weather_class IS NOT NULL) AS in_weather,
        (j.competition_index_local IS NOT NULL AND t.comp_max > t.comp_min AND j.competition_index_local >= t.comp_t2) AS in_comp,
        (j.tourism_index_region IS NOT NULL AND t.tour_max > t.tour_min AND j.tourism_index_region >= t.tour_t2) AS in_tour,
        (j.events_500m IS NOT NULL AND t.ev_max > t.ev_min AND j.events_500m >= t.ev_t2) AS in_events,
        (j.mobility_flag IS TRUE) AS in_mobility,
        (j.suivis_ct > 0 AND t.sv_distinct > 1 AND j.suivis_ct >= t.sv_t2) AS in_suivis,
        (j.school_flag IS TRUE) AS in_school,
        (j.holiday_flag IS TRUE) AS in_holiday
      FROM joined j
      JOIN th t ON t.location_id = j.location_id
    ),
    counted AS (
      SELECT *,
        CAST(in_weather AS INT64) + CAST(in_comp AS INT64) + CAST(in_tour AS INT64) + CAST(in_events AS INT64)
        + CAST(in_mobility AS INT64) + CAST(in_suivis AS INT64) + CAST(in_school AS INT64) + CAST(in_holiday AS INT64) AS n_memberships
      FROM flags
    ),
    -- Baseline de contrôle calendrier : jours n'appartenant à AUCUNE classe, par mois × type de jour.
    ctrl AS (
      SELECT location_id, month_num, weekend_flag, AVG(gap_eur) AS ctrl_gap, COUNT(*) AS ctrl_n
      FROM counted WHERE n_memberships = 0
      GROUP BY location_id, month_num, weekend_flag
    ),
    classed AS (
      SELECT location_id, date, gap_eur, 'weather' AS family, weather_class AS class_key
      FROM counted WHERE in_weather AND n_memberships = 1
      UNION ALL
      SELECT location_id, date, gap_eur, 'competition', 'competition_high'
      FROM counted WHERE in_comp AND n_memberships = 1
      UNION ALL
      SELECT location_id, date, gap_eur, 'tourism', 'tourism_high'
      FROM counted WHERE in_tour AND n_memberships = 1
      UNION ALL
      SELECT location_id, date, gap_eur, 'events', 'events_high'
      FROM counted WHERE in_events AND n_memberships = 1
      UNION ALL
      SELECT location_id, date, gap_eur, 'mobility', 'mobility_disruption'
      FROM counted WHERE in_mobility AND n_memberships = 1
      UNION ALL
      SELECT location_id, date, gap_eur, 'suivis', 'followed_activity_high'
      FROM counted WHERE in_suivis AND n_memberships = 1
      UNION ALL
      SELECT c.location_id, c.date, c.gap_eur - k.ctrl_gap, 'calendar', 'school_holiday'
      FROM counted c
      JOIN ctrl k ON k.location_id = c.location_id AND k.month_num = c.month_num AND k.weekend_flag = c.weekend_flag
      WHERE c.in_school AND c.n_memberships = 1 AND k.ctrl_n >= 3
      UNION ALL
      SELECT c.location_id, c.date, c.gap_eur - k.ctrl_gap, 'calendar', 'public_holiday'
      FROM counted c
      JOIN ctrl k ON k.location_id = c.location_id AND k.month_num = c.month_num AND k.weekend_flag = c.weekend_flag
      WHERE c.in_holiday AND c.n_memberships = 1 AND k.ctrl_n >= 3
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

async function dateResolutionQuery(bq: any, location_id: string, dates: string[]): Promise<{ conditionByDate: Map<string, string>; calendarByDate: Map<string, { school: boolean; holiday: boolean }> }> {
  const empty = { conditionByDate: new Map<string, string>(), calendarByDate: new Map<string, { school: boolean; holiday: boolean }>() };
  if (!dates.length) return empty;
  const rows = await bq.query({
    query: `
      SELECT FORMAT_DATE('%Y-%m-%d', c.date) AS date, ${conditionCaseSql()} AS condition,
             c.is_school_holiday_flag AS school_flag, c.is_public_holiday_flag AS holiday_flag
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      WHERE c.location_id = @location_id
        AND c.date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', d) FROM UNNEST(@dates) AS d))
    `,
    params: { location_id, dates },
    types: { dates: ["STRING"] },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const out = empty;
  for (const row of rows as any[]) {
    if (!row?.date) continue;
    if (row?.condition) out.conditionByDate.set(String(row.date), String(row.condition));
    out.calendarByDate.set(String(row.date), { school: row?.school_flag === true, holiday: row?.holiday_flag === true });
  }
  return out;
}

/**
 * Live (request-time) computation for ONE location — the FALLBACK when the store has no rows
 * for this location yet (fresh account before the nightly batch). Same SQL, same policy.
 */
export async function computeDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [aggRows, dateRes] = await Promise.all([
    bq.query({
      query: dayClassAggregateSql(true),
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    dateResolutionQuery(bq, location_id, dates),
  ]);
  return { impacts: rowsToImpacts(aggRows as any[]), ...dateRes };
}

/**
 * Store-first read (incrément 1) : impacts from DAY_CLASS_STORE (nightly batch), date resolution
 * live (light, window-dependent). Store empty for this location → live-compute fallback, so a
 * fresh account is never blind between two batch runs. This is what monitor.ts calls.
 */
export async function getDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [storeRows, dateRes] = await Promise.all([
    bq.query({
      query: `SELECT class_key, family, n_days, avg_gap_eur, sd_gap_eur, span_days FROM \`${PROJECT}.${DAY_CLASS_STORE}\` WHERE location_id = @location_id`,
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    dateResolutionQuery(bq, location_id, dates),
  ]);
  if ((storeRows as any[]).length > 0) {
    return { impacts: rowsToImpacts(storeRows as any[]), ...dateRes };
  }
  const live = await computeDayClassImpacts(bq, location_id, []);
  return { impacts: live.impacts, ...dateRes };
}

// Weather action types that resolve their condition from the AFFECTED DATE (payload has none).
const DATE_RESOLVED_WEATHER_TYPES = new Set([
  "weather_worsened",
  "extended_bad_weather",
  "extended_bad_weather_3d",
]);

// Card type → cross-family class. ONE class per card, sa PROPRE famille (docs/kpi-enjeu-mapping.md).
// NB : competition_proximity / high_competition_density / same_bucket_saturation portent des COMPTES
// D'ÉVÉNEMENTS dans leur payload — leur variable réelle est la densité événementielle, pas l'indice
// de pression ambiante ; elles mappent donc events_high (vérité de la variable, pas du nom).
const CARD_TYPE_CLASS: Record<string, string> = {
  competition_pressure_spike: "competition_high",
  competition_proximity: "events_high",
  high_competition_density: "events_high",
  same_bucket_saturation: "events_high",
  foreign_tourism_signal: "tourism_high",
  tourist_high_season: "tourism_high",
  tourist_surge_vacation: "tourism_high",
  tourism_peak_window: "tourism_high",
  mobility_disruption: "mobility_disruption",
  mobility_disruption_planned: "mobility_disruption",
  ft_peak_mobility: "mobility_disruption",
  competitor_event_launch: "followed_activity_high",
  competitor_event_ending: "followed_activity_high",
  competitor_audience_conflict: "followed_activity_high",
  competitor_sold_out: "followed_activity_high",
  competitor_content_spike: "followed_activity_high",
  competitor_content_silent: "followed_activity_high",
  competitor_threat_direct: "followed_activity_high",
};

// Cartes calendrier : classe résolue par la DATE affectée (vacances d'abord, férié sinon).
const CALENDAR_TYPES = new Set(["calendar_audience_shift", "audience_shift_opportunity"]);

// Cartes COMBINÉES (mapping familles A/B/D « facteur dominant, jamais la somme ») : le dominant est
// choisi PAR LA MESURE — la classe candidate au plus grand |€/an| mesuré, jamais une pondération
// inventée. 'weather@date' = la condition météo du jour de la carte.
const COMBO_TYPE_CLASSES: Record<string, string[]> = {
  saturated_bad_weather: ["weather@date", "events_high"],
  weather_mobility_double: ["weather@date", "mobility_disruption"],
  ft_peak_bad_weather: ["weather@date"],
  weather_comp_opportunity: ["weather@date", "competition_high"],
  mobility_comp_squeeze: ["mobility_disruption", "competition_high"],
  holiday_high_comp: ["calendar@date", "competition_high"],
  tourism_comp_squeeze: ["tourism_high", "competition_high"],
  tourism_weather_vacation: ["tourism_high", "weather@date", "calendar@date"],
  tourism_mobility_hit: ["tourism_high", "mobility_disruption"],
};

function resolveClassToken(token: string, result: DayClassResult, iso: string): string | null {
  if (token === "weather@date") return iso ? (result.conditionByDate.get(iso) ?? null) : null;
  if (token === "calendar@date") {
    const cal = iso ? result.calendarByDate.get(iso) : null;
    return cal?.school ? "school_holiday" : cal?.holiday ? "public_holiday" : null;
  }
  return token;
}

/**
 * The enjeu payload attached to one action candidate (or null — null ALWAYS means « no pill »).
 * Policy here, not in consumers. Étape 2 : le signe passe au client — négatif = ambre (à défendre),
 * POSITIF = pill VERTE « à capter » (chip-good), plus de filtre négatif-only.
 */
export function enjeuForCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): DayClassImpact | null {
  const actionType = String(candidate?.action_type || "");
  const iso = String(candidate?.date?.value ?? candidate?.date ?? "").slice(0, 10);
  let cond: string | null = null;
  if (actionType === "weather_hazard_onset") {
    let payload: any = candidate?.data_payload ?? null;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = null; } }
    cond = String(payload?.new_value || "").split(":")[0] || null;
  } else if (DATE_RESOLVED_WEATHER_TYPES.has(actionType)) {
    cond = iso ? (result.conditionByDate.get(iso) ?? null) : null;
  } else if (CALENDAR_TYPES.has(actionType)) {
    cond = resolveClassToken("calendar@date", result, iso);
  } else if (COMBO_TYPE_CLASSES[actionType]) {
    // Dominant = la classe mesurée au plus grand |€/an| parmi les familles du combiné.
    let best: DayClassImpact | null = null;
    for (const token of COMBO_TYPE_CLASSES[actionType]) {
      const key = resolveClassToken(token, result, iso);
      const imp = key ? (result.impacts.get(key) ?? null) : null;
      if (imp && (!best || Math.abs(imp.eur_year) > Math.abs(best.eur_year))) best = imp;
    }
    return best;
  } else if (CARD_TYPE_CLASS[actionType]) {
    cond = CARD_TYPE_CLASS[actionType];
  }
  if (!cond) return null;
  return result.impacts.get(cond) ?? null;
}
