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
  tier_label_fr: string;  // what the pill prints: tier, + ", facteurs mêlés" when entangled
  entangled: boolean;     // true = marginal season-adjusted basis (classes non séparables sur cet historique)
  n_days: number;
  span_months: number;
  avg_gap_eur: number;
  t_stat: number;
  inherited?: boolean;    // « Motif de fond » (validé 26/07) : pill héritée de la classe du JOUR de la
                          // carte (météo/calendrier de la date) — jamais l'anomalie annualisée. Le
                          // client rend « Motif de fond ~X €/an · <classe> » au lieu d'« Enjeu ».
};

export type DayClassResult = {
  impacts: Map<string, DayClassImpact>;   // class_key -> impact (all classes passing the floor)
  conditionByDate: Map<string, string>;   // 'YYYY-MM-DD' -> weather class_key (for date-resolved cards)
  calendarByDate: Map<string, { school: boolean; holiday: boolean }>; // date-resolved calendar flags
};

// The registry. Weather = the five conditions of fct_location_context_daily (lvl_* >= 1 depuis le
// 29/07 — cf. conditionCaseSql). Order matters: DÉPARTAGE À SÉVÉRITÉ ÉGALE — chaque jour
// d'historique appartient à AU PLUS UNE classe météo.
// LIBELLÉS : les classes chaleur portent leur BANDE DE TEMPÉRATURE, pas un mot de météo.
// `lvl_heat` est une température maximale d'UNE journée : ni nuit, ni durée, ni seuil
// départemental. Il ne permet donc pas de dire qu'un jour était en canicule — la canicule est
// définie par le gouvernement sur l'IBM (min+max moyennés sur 3 jours) comparé à un seuil
// départemental, pendant 3 jours ET 3 nuits. Elle existe indépendamment de ce qu'on mesure ;
// c'est notre variable qui ne l'identifie pas. Le jour où l'on ingérera la vigilance canicule
// publiée par Météo-France (par département, quotidienne), on aura une vraie classe `canicule`
// avec le mot juste — d'ici là, on nomme la mesure.
//
// SCISSION heat (29/07/2026, arbitrage owner). Une seule classe `heat` additionnait deux régimes
// de SIGNES OPPOSÉS et sortait zéro. Vérifié sur les 4 sites ayant un historique de ventes :
// 32-34 °C -> +70 €/j (68 jours, t = 3,33) ; >= 35 °C -> -72 €/j (95 jours, t = 3,62). Groupées,
// elles donnaient +39 €/j à t = 0,84 — sous le plancher, donc muettes. La pluie RESTE groupée :
// son signe est constant à toutes les doses (-38 / -133 / -131 / -102), la mise en commun y est
// légitime. On ne scinde que là où les signes divergent.
export const WEATHER_DAY_CLASSES: Array<{ key: string; level_col: string; min_lvl: number; max_lvl?: number; label_fr: string }> = [
  { key: "heat_32_34",   level_col: "lvl_heat", min_lvl: 1, max_lvl: 1, label_fr: "journées à 32–34 °C" },
  { key: "heat_35_plus", level_col: "lvl_heat", min_lvl: 2,             label_fr: "journées à 35 °C et plus" },
  { key: "rain", level_col: "lvl_rain", min_lvl: 1, label_fr: "jours de pluie marquée" },
  { key: "wind", level_col: "lvl_wind", min_lvl: 1, label_fr: "jours de vent fort" },
  { key: "snow", level_col: "lvl_snow", min_lvl: 1, label_fr: "jours de neige" },
  { key: "cold", level_col: "lvl_cold", min_lvl: 1, label_fr: "jours de grand froid" },
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
  // Classes BASSES (mapping B2/D2, ajoutées 26/07) : tercile bas — les fenêtres favorables
  // (basse pression, basse saison) ; écart positif attendu → pill verte « À capter ».
  { key: "competition_low", family: "competition", index_col: "competition_index_local", label_fr: "jours à faible pression concurrentielle" },
  { key: "tourism_low", family: "tourism", index_col: "tourism_index_region", label_fr: "jours de basse saison touristique" },
];

export const OTHER_DAY_CLASSES: Array<{ key: string; family: string; label_fr: string }> = [
  { key: "mobility_disruption", family: "mobility", label_fr: "jours à perturbation de mobilité" },
  { key: "followed_activity_high", family: "suivis", label_fr: "jours de forte activité de vos concurrents suivis" },
  { key: "school_holiday", family: "calendar", label_fr: "jours de vacances scolaires" },
  { key: "public_holiday", family: "calendar", label_fr: "jours fériés" },
  // Étape 4 (26/07) :
  // - traffic_high : tercile haut de VOS visiteurs mesurés (fct_client_daily_performance) — la
  //   classe honnête derrière « Trafic sans conversion » (le manque à convertir CONTREFACTUEL du
  //   mapping était un risque de fabrication : on mesure le résiduel des jours à forte affluence,
  //   on n'invente pas un « récupérable »).
  // - discount_no_lift : classe COÛT, pas contraste — € remisés les jours à remise sans lift
  //   (is_discount_without_lift, mart signals), stockés NÉGATIFS (coût → pill ambre). Un fait du
  //   jour, pas une attribution : HORS masque de pureté et HORS ajustement saison.
  { key: "traffic_high", family: "traffic", label_fr: "jours à forte affluence" },
  { key: "discount_no_lift", family: "sales", label_fr: "jours de remise sans effet mesuré" },
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

// Seuil et départage des classes météo — FOYER UNIQUE (alimente le store ligne ~146 ET la
// résolution carte→classe ligne ~372, donc les deux ne peuvent pas diverger).
//
// SEUIL >= 1 (29/07/2026, arbitrage owner). Était >= 2, ce qui pour la chaleur veut dire 35 °C.
// Or le seuil de canicule de Météo-France en Île-de-France est de 31 °C : la classe était plus
// stricte que la définition officielle ET que le vécu de l'exploitant. Constat déclencheur — la
// canicule que l'owner subissait depuis deux semaines donnait n_days = 2 chez lui : 22 jours à
// >= 32 °C sur 90, dont 3 seulement à >= 35 °C. La mesure ne voyait pas l'événement.
// Effet vérifié sur les 4 sites ayant un historique de ventes : chaleur mesurable sur 1 site
// -> 4 sur 4 (55 -> 123 jours), pluie 3 -> 4 sites (23 -> 61 jours). Vent et froid inchangés
// (0 site, l'aléa ne se produit pas). Barème amont : stg_weather_alerts_daily_all.sql
// (chaleur 32/35/38/40 °C, pluie 20/40/80/120 mm, froid -5/-8/-12/-16 °C).
//
// SÉVÉRITÉ D'ABORD. L'ancienne chaîne prenait la première classe de la liste qui matchait, donc
// une chaleur de niveau 1 pouvait éclipser une pluie de niveau 2 — 4 jours sur 364 sur le parc
// réel, et la carte aurait alors été rattachée à la mauvaise classe. On balaie par niveau
// décroissant : l'aléa LE PLUS SÉVÈRE du jour nomme la classe, l'ordre de WEATHER_DAY_CLASSES ne
// départageant plus qu'à sévérité égale.
//
// NB : abaisser le seuil rend plus de jours multi-appartenance, donc non « purs » ; ils basculent
// sur la base 'marginal' (entangled -> tier plafonné « estimé, cause multifactorielle »). C'est le
// comportement voulu, pas une perte. Le seuil de TIR des cartes (alert_level_max >= 2, côté dbt)
// est indépendant et n'est PAS touché : ce changement ne concerne que la couche de mesure.
// Balayage par niveau DÉCROISSANT, égalité stricte sur le niveau : à chaque palier on n'émet que
// les classes dont la bande [min_lvl, max_lvl] contient ce palier. L'égalité (et non `>=`) est ce
// qui rend les bandes BORNÉES possibles — `heat_32_34` ne doit pas capturer un jour à 38 °C. Le
// balayage décroissant conserve la priorité de sévérité ; l'ordre de WEATHER_DAY_CLASSES ne
// départage qu'à sévérité égale.
function conditionCaseSql(): string {
  const branches = [4, 3, 2, 1].flatMap((lvl) =>
    WEATHER_DAY_CLASSES
      .filter((c) => c.min_lvl <= lvl && (c.max_lvl == null || lvl <= c.max_lvl))
      .map((c) => `WHEN c.${c.level_col} = ${lvl} THEN '${c.key}'`)
  );
  return "CASE " + branches.join(" ") + " END";
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
        COALESCE(sv.active_ct, 0) AS suivis_ct,
        perf.daily_visitors AS visitors,
        COALESCE(sg.is_discount_without_lift, FALSE) AS discount_no_lift_flag,
        sg.daily_discount_total AS discount_total
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
      LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
        ON perf.location_id = c.location_id AND perf.transaction_date = c.date
      LEFT JOIN \`${PROJECT}.mart.fct_client_sales_signals_daily\` sg
        ON sg.location_id = c.location_id AND sg.transaction_date = c.date
      WHERE c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()
      ${singleLocation ? "AND c.location_id = @location_id" : ""}
    ),
    th AS (
      SELECT
        location_id,
        APPROX_QUANTILES(competition_index_local, 3)[OFFSET(1)] AS comp_t1,
        APPROX_QUANTILES(competition_index_local, 3)[OFFSET(2)] AS comp_t2,
        MIN(competition_index_local) AS comp_min, MAX(competition_index_local) AS comp_max,
        APPROX_QUANTILES(tourism_index_region, 3)[OFFSET(1)] AS tour_t1,
        APPROX_QUANTILES(tourism_index_region, 3)[OFFSET(2)] AS tour_t2,
        MIN(tourism_index_region) AS tour_min, MAX(tourism_index_region) AS tour_max,
        APPROX_QUANTILES(events_500m, 3)[OFFSET(2)] AS ev_t2,
        MIN(events_500m) AS ev_min, MAX(events_500m) AS ev_max,
        APPROX_QUANTILES(IF(suivis_ct > 0, suivis_ct, NULL), 3)[OFFSET(2)] AS sv_t2,
        COUNT(DISTINCT IF(suivis_ct > 0, suivis_ct, NULL)) AS sv_distinct,
        APPROX_QUANTILES(visitors, 3)[OFFSET(2)] AS vis_t2,
        MIN(visitors) AS vis_min, MAX(visitors) AS vis_max
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
        (j.holiday_flag IS TRUE) AS in_holiday,
        (j.visitors IS NOT NULL AND t.vis_max > t.vis_min AND j.visitors >= t.vis_t2) AS in_traffic,
        (j.competition_index_local IS NOT NULL AND t.comp_max > t.comp_min AND j.competition_index_local <= t.comp_t1) AS in_comp_low,
        (j.tourism_index_region IS NOT NULL AND t.tour_max > t.tour_min AND j.tourism_index_region <= t.tour_t1) AS in_tour_low
      FROM joined j
      JOIN th t ON t.location_id = j.location_id
    ),
    counted AS (
      SELECT *,
        CAST(in_weather AS INT64) + CAST(in_comp AS INT64) + CAST(in_tour AS INT64) + CAST(in_events AS INT64)
        + CAST(in_mobility AS INT64) + CAST(in_suivis AS INT64) + CAST(in_school AS INT64) + CAST(in_holiday AS INT64)
        + CAST(in_traffic AS INT64) + CAST(in_comp_low AS INT64) + CAST(in_tour_low AS INT64) AS n_memberships
      FROM flags
    ),
    -- Étape 2.5 : jours de classe (TOUTES appartenances, pureté en colonne) — une passe par classe.
    class_days AS (
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'weather' AS family, weather_class AS class_key
      FROM counted WHERE in_weather
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'competition' AS family, 'competition_high' AS class_key
      FROM counted WHERE in_comp
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'tourism' AS family, 'tourism_high' AS class_key
      FROM counted WHERE in_tour
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'events' AS family, 'events_high' AS class_key
      FROM counted WHERE in_events
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'mobility' AS family, 'mobility_disruption' AS class_key
      FROM counted WHERE in_mobility
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'suivis' AS family, 'followed_activity_high' AS class_key
      FROM counted WHERE in_suivis
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'traffic' AS family, 'traffic_high' AS class_key
      FROM counted WHERE in_traffic
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'competition' AS family, 'competition_low' AS class_key
      FROM counted WHERE in_comp_low
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'tourism' AS family, 'tourism_low' AS class_key
      FROM counted WHERE in_tour_low
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'calendar' AS family, 'school_holiday' AS class_key
      FROM counted WHERE in_school
      UNION ALL
      SELECT location_id, date, gap_eur, month_num, weekend_flag, n_memberships, 'calendar' AS family, 'public_holiday' AS class_key
      FROM counted WHERE in_holiday
    ),
    -- Contrôle marginal PAR CLASSE : les jours HORS classe X du même (mois × type de jour) du site.
    -- C'est le contraste marginal classique — le contrôle peut contenir d'autres classes, ce que
    -- l'étiquette « facteurs mêlés » assume ; >= 3 jours de contrôle requis par cellule.
    cell_stats AS (
      SELECT location_id, month_num, weekend_flag, SUM(gap_eur) AS cell_sum, COUNT(*) AS cell_cnt
      FROM counted GROUP BY location_id, month_num, weekend_flag
    ),
    cell_class AS (
      SELECT location_id, month_num, weekend_flag, class_key, SUM(gap_eur) AS x_sum, COUNT(*) AS x_cnt
      FROM class_days GROUP BY location_id, month_num, weekend_flag, class_key
    ),
    adjusted AS (
      SELECT
        cd.*,
        SAFE_DIVIDE(cs.cell_sum - cc.x_sum, cs.cell_cnt - cc.x_cnt) AS ctrl_gap,
        cs.cell_cnt - cc.x_cnt AS ctrl_n
      FROM class_days cd
      JOIN cell_stats cs ON cs.location_id = cd.location_id AND cs.month_num = cd.month_num AND cs.weekend_flag = cd.weekend_flag
      JOIN cell_class cc ON cc.location_id = cd.location_id AND cc.month_num = cd.month_num AND cc.weekend_flag = cd.weekend_flag AND cc.class_key = cd.class_key
    ),
    -- Deux BASES par classe. 'pure' = jours purs (n_memberships = 1), gap brut vs normale — sauf
    -- calendrier, contrôlé hors-classe même cellule (leçon calendarFamily). 'marginal' = TOUS les
    -- jours de la classe, gap − contrôle hors-classe (mois × type de jour) — « facteurs mêlés ».
    classed AS (
      SELECT location_id, date, gap_eur, family, class_key, 'pure' AS basis
      FROM adjusted WHERE n_memberships = 1 AND family != 'calendar'
      UNION ALL
      SELECT location_id, date, gap_eur - ctrl_gap, family, class_key, 'pure'
      FROM adjusted WHERE n_memberships = 1 AND family = 'calendar' AND ctrl_n >= 3 AND ctrl_gap IS NOT NULL
      UNION ALL
      SELECT location_id, date, gap_eur - ctrl_gap, family, class_key, 'marginal'
      FROM adjusted WHERE ctrl_n >= 3 AND ctrl_gap IS NOT NULL
      UNION ALL
      -- discount_no_lift : classe COÛT (€ remisés, stockés négatifs) — fait du jour, hors pureté,
      -- hors ajustement saison, base 'pure' par nature.
      SELECT location_id, date, -discount_total, 'sales', 'discount_no_lift', 'pure'
      FROM counted WHERE discount_no_lift_flag IS TRUE AND discount_total IS NOT NULL AND discount_total > 0
    ),
    span AS (
      SELECT location_id, DATE_DIFF(MAX(date), MIN(date), DAY) + 1 AS span_days
      FROM joined GROUP BY location_id
    )
    SELECT
      cl.location_id,
      cl.class_key,
      cl.family,
      cl.basis,
      COUNT(*) AS n_days,
      AVG(cl.gap_eur) AS avg_gap_eur,
      STDDEV_SAMP(cl.gap_eur) AS sd_gap_eur,
      s.span_days,
      CURRENT_TIMESTAMP() AS computed_at
    FROM classed cl
    JOIN span s ON s.location_id = cl.location_id
    GROUP BY cl.location_id, cl.class_key, cl.family, cl.basis, s.span_days
  `;
}

// THE policy — gates, tier, €/an, basis preference — applied at READ time on raw rows. Single
// home; a gate change here is instantly effective on store rows without re-batching.
// Étape 2.5 : la lecture PRÉFÈRE la base 'pure' (classes séparées) ; si elle ne passe pas les
// gates, elle retombe sur la base 'marginal' (ajustée saison) ÉTIQUETÉE « facteurs mêlés » et
// plafonnée 'estimé' — l'intrication est dite à l'utilisateur, jamais cachée ni maquillée.
// PORTE DE MATÉRIALITÉ (29/07/2026, arbitrage owner). Les portes existantes testent la
// SIGNIFICATIVITÉ (n, span, |t|) et jamais la MATÉRIALITÉ — un enjeu peut être statistiquement
// béton et économiquement nul. Cas déclencheur : chez Les Olivades, `discount_no_lift` portait le
// t LE PLUS ÉLEVÉ du lieu (3,41) pour −274 €/an sur 959 730 € de CA, soit 0,03 % — pendant que
// leurs journées à ≥ 35 °C, qui valaient potentiellement 66 000 €/an, étaient tues pour t = 0,77.
// Mécanique : des remises minuscules ET régulières ont une variance minuscule, donc un t énorme.
//
// Seuil 0,3 % du CA annualisé du LIEU (relatif, donc valable pour un café comme pour une
// manufacture). Mesuré sur les 25 pills du parc au 29/07 : les 4 pills `discount_no_lift` de tout
// le parc tiennent sous 0,26 %, la suivante est à 0,52 % — 0,3 % tombe dans ce vide et ne retire
// QUE ce que l'owner a signalé. À 0,5 % on perdait heat_32_34 (−2 451 €), à 1 % les vacances
// scolaires (−4 558 €) : trop large.
//
// Sans CA connu, la porte NE S'APPLIQUE PAS (on ne juge pas une matérialité sans dénominateur).
const MATERIALITY_PCT_OF_REVENUE = 0.003;

function rowToImpact(row: any, entangled: boolean, annualRevenue?: number | null): DayClassImpact | null {
  const key = String(row?.class_key ?? row?.condition ?? "");
  const n = Number(row?.n_days ?? 0);
  const avg = Number(row?.avg_gap_eur ?? NaN);
  const sd = Number(row?.sd_gap_eur ?? NaN);
  const spanDays = Number(row?.span_days ?? 0);
  if (!key || !CLASS_LABELS[key] || !Number.isFinite(avg) || n < 5 || spanDays < 60) return null;
  const t = Number.isFinite(sd) && sd > 0 ? Math.abs(avg) / (sd / Math.sqrt(n)) : 0;
  // |t| >= 1 floor for ANY pill (incrément 1) : tercile classes pass n>=5 BY CONSTRUCTION, so
  // without a signal floor pure noise gets annualized (proven live: t=0,08 → « ~352 €/an »).
  if (t < 1) return null;
  const eurYear = Math.round(avg * (n / (spanDays / 365.25)));
  if (
    annualRevenue != null && Number.isFinite(annualRevenue) && annualRevenue > 0 &&
    Math.abs(eurYear) < annualRevenue * MATERIALITY_PCT_OF_REVENUE
  ) return null;
  const tier: DayClassImpact["tier"] =
    !entangled && n >= 10 && t >= 2 && spanDays >= 300 ? "mesuré" : "estimé";
  return {
    class_key: key,
    label_fr: CLASS_LABELS[key],
    eur_year: eurYear,
    tier,
    tier_label_fr: entangled ? "estimé, cause multifactorielle" : tier,
    entangled,
    n_days: n,
    span_months: Math.round(spanDays / 30.44),
    avg_gap_eur: Math.round(avg * 10) / 10,
    t_stat: Math.round(t * 100) / 100,
  };
}

function rowsToImpacts(rows: any[], annualRevenue?: number | null): Map<string, DayClassImpact> {
  const byClass = new Map<string, { pure?: any; marginal?: any }>();
  for (const row of rows) {
    const key = String(row?.class_key ?? row?.condition ?? "");
    if (!key) continue;
    const bucket = byClass.get(key) ?? {};
    // Legacy rows without basis (pre-2.5 store) are treated as pure.
    if (String(row?.basis ?? "pure") === "marginal") bucket.marginal = row;
    else bucket.pure = row;
    byClass.set(key, bucket);
  }
  const impacts = new Map<string, DayClassImpact>();
  for (const [key, bucket] of byClass) {
    const impact =
      (bucket.pure ? rowToImpact(bucket.pure, false, annualRevenue) : null)
      ?? (bucket.marginal ? rowToImpact(bucket.marginal, true, annualRevenue) : null);
    if (impact) impacts.set(key, impact);
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
  const [aggRows, dateRes, annualRevenue] = await Promise.all([
    bq.query({
      query: dayClassAggregateSql(true),
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    dateResolutionQuery(bq, location_id, dates),
    annualRevenueQuery(bq, location_id),
  ]);
  return { impacts: rowsToImpacts(aggRows as any[], annualRevenue), ...dateRes };
}

/**
 * Store-first read (incrément 1) : impacts from DAY_CLASS_STORE (nightly batch), date resolution
 * live (light, window-dependent). Store empty for this location → live-compute fallback, so a
 * fresh account is never blind between two batch runs. This is what monitor.ts calls.
 */
// CA annualisé du LIEU — dénominateur de la porte de matérialité. Annualisé sur l'étendue réelle
// de l'historique (et non sur 365 j supposés) pour qu'un compte de 3 mois ne soit pas jugé sur un
// CA sous-estimé d'un facteur 4. Renvoie null si le lieu n'a pas de ventes : la porte ne
// s'applique alors pas — on ne juge pas une matérialité sans dénominateur.
async function annualRevenueQuery(bq: any, location_id: string): Promise<number | null> {
  const rows = await bq.query({
    query: `
      SELECT SAFE_DIVIDE(SUM(daily_revenue),
                         NULLIF(DATE_DIFF(MAX(transaction_date), MIN(transaction_date), DAY) + 1, 0)) * 365.25 AS annual_revenue
      FROM \`${PROJECT}.mart.fct_client_daily_performance\`
      WHERE location_id = @location_id
    `,
    params: { location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const v = Number((rows as any[])[0]?.annual_revenue);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export async function getDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [storeRows, dateRes, annualRevenue] = await Promise.all([
    bq.query({
      query: `SELECT class_key, family, basis, n_days, avg_gap_eur, sd_gap_eur, span_days FROM \`${PROJECT}.${DAY_CLASS_STORE}\` WHERE location_id = @location_id`,
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    dateResolutionQuery(bq, location_id, dates),
    annualRevenueQuery(bq, location_id),
  ]);
  if ((storeRows as any[]).length > 0) {
    return { impacts: rowsToImpacts(storeRows as any[], annualRevenue), ...dateRes };
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
  sales_traffic_not_converting: "traffic_high",
  sales_discount_no_lift: "discount_no_lift",
  sales_competition_cannibalization: "competition_high",
  competition_pressure_spike: "competition_high",
  low_competition_window: "competition_low",
  weekend_vacation_low_comp: "competition_low",
  low_tourism_local_opp: "tourism_low",
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
  } else if (SALES_INHERIT_TYPES.has(actionType)) {
    // « Motif de fond » (validé 26/07) : une carte d'ANOMALIE ventes n'annualise jamais son écart
    // (circularité) mais HÉRITE de la classe de son jour — la plus lourde en |€/an| parmi la
    // condition météo et le calendrier de la date affectée. Ex. réel : « CA supérieur à vos
    // jeudis » un jour de vacances → « Motif de fond ~12 016 €/an · vacances scolaires » — le bon
    // jour est l'exception du motif, et c'est l'insight.
    let best: DayClassImpact | null = null;
    for (const token of ["weather@date", "calendar@date"]) {
      const key = resolveClassToken(token, result, iso);
      const imp = key ? (result.impacts.get(key) ?? null) : null;
      if (imp && (!best || Math.abs(imp.eur_year) > Math.abs(best.eur_year))) best = imp;
    }
    return best ? { ...best, inherited: true } : null;
  }
  if (!cond) return null;
  return result.impacts.get(cond) ?? null;
}

// Raisons d'absence (triage validé 26/07 — l'absence de pill est EXPLIQUÉE, jamais muette,
// sauf absence PAR DESIGN : composites/score, démues… → silence voulu, pas de raison affichée).
export const ABSENCE_REASON_FR = {
  anomaly: "Anomalie ponctuelle — pas d'enjeu annualisable ; suivi sur vos prochains jours comparables.",
  no_history: "Pas encore d'historique de ventes mesuré pour ce site.",
  not_separable: "Motif du jour non séparable ou insuffisant sur votre historique — mûrit avec les saisons.",
} as const;

/** enjeu + raison d'absence : LA façade que les endpoints consomment (monitor, futurs). */
export function enjeuWithReasonForCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): { enjeu: DayClassImpact | null; reason_fr: string | null } {
  const enjeu = enjeuForCandidate(result, candidate);
  if (enjeu) return { enjeu, reason_fr: null };
  const actionType = String(candidate?.action_type || "");
  if (SALES_INHERIT_TYPES.has(actionType)) return { enjeu: null, reason_fr: ABSENCE_REASON_FR.anomaly };
  const mapped = actionType === "weather_hazard_onset" || DATE_RESOLVED_WEATHER_TYPES.has(actionType)
    || CALENDAR_TYPES.has(actionType) || Boolean(COMBO_TYPE_CLASSES[actionType]) || Boolean(CARD_TYPE_CLASS[actionType]);
  if (!mapped) return { enjeu: null, reason_fr: null };
  if (result.impacts.size === 0) return { enjeu: null, reason_fr: ABSENCE_REASON_FR.no_history };
  return { enjeu: null, reason_fr: ABSENCE_REASON_FR.not_separable };
}

// Cartes d'anomalie ventes (mapping H1 — jamais de pill PROPRE, héritage du jour uniquement).
const SALES_INHERIT_TYPES = new Set([
  "sales_surge",
  "sales_revenue_down_wow",
  "sales_underperformance",
  "sales_missed_opportunity",
]);
