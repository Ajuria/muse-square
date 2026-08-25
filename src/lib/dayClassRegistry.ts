// src/lib/dayClassRegistry.ts
//
// DAY-CLASS REGISTRY — the ONE home of « Enjeu €/an » (annualized pattern weight) for action cards,
// and the substrate of the future structural pattern-finder cards. Full spec + decisions + backlog:
// docs/enjeu-day-class-registry.md (read it before extending).
//
// WHAT IT COMPUTES (per location, per day-class) — RÉGIME LOG + MÉDIANE depuis le 01/08/2026 :
//   Significativité testée sur le RÉSIDU LOG (ln(daily_revenue) − ln(expected_revenue)) — celui que
//   le modèle minimise, centré sur 0 par construction. Le gap € linéaire porte un biais de
//   retransformation log-normale (mesuré chez Les Olivades : +1 942 €/j sur TOUS les jours,
//   exp(σ²/2)=1,975 vs 1,823 observé) qui fabriquait des faux positifs au-dessus de |t| ≥ 2 :
//   les jours de semaine — DANS la baseline, effet nul par construction — sortaient à t=+2,0..+2,8
//   en linéaire, à −0,03..+0,31 en log. Preuves : docs/residu-bruit-diagnostic.md.
//   Enjeu €/an = MÉDIANE(gap € des jours de classe) × (jours de classe par an, fréquence réelle du
//   lieu). La médiane est insensible au biais (gap médian Olivades : −81 € vs moyenne +1 942 €) ET
//   aux factures extrêmes (une facture portait 76 % des € de competition_high). Garde de COHÉRENCE
//   DE SIGNE : pas de pilule si sign(t_log) ≠ sign(médiane) (cas wind Olivades : t_log +1,68,
//   médiane −114 €/j — le test et la monétisation se contredisent, absence honnête).
//   expected_revenue = mart.fct_client_day_residual ; ce qui reste est une ASSOCIATION
//   CONDITIONNELLE, jamais une causalité. discount_no_lift (classe COÛT, somme de remises) reste
//   au régime linéaire par construction. Avant/après mesuré sur les 5 lieux : 19 pilules → 16,
//   les 3 mortes sont les 3 fantômes des Olivades, rien ne meurt sur les 4 lieux propres.
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
  family?: string;        // famille de la classe ; 'card' = population de carte (jamais structurel)
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
  immaterial?: Set<string>;               // classes écartées par la SEULE porte de matérialité
  clientCatchment?: string | null;        // périmètre DÉCLARÉ du lieu ('commune'|'beyond'|null)
  // Temps 2 du périmètre : jours mesurables que chaque réponse débloquerait (lu depuis
  // CATCHMENT_HYP_STORE, null tant que le cron n'a pas tourné ou sans historique de ventes).
  catchmentHypotheses?: { commune: number; beyond: number } | null;
  // 24/08 — barreau 2 du coin (owner) : les lignes BRUTES du store, TOUTES métriques (les KPI
  // non-K1 sortent en base 'marginal', unités du KPI — visiteurs, taux, tickets — cf. le moteur
  // § MÉTRIQUE = DIMENSION). funnelCornerForCandidate y lit le % de l'étape funnel de la carte.
  funnelRows?: any[];
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
// 25-27 °C -> +70 €/j (68 jours, t = 3,33) ; >= 28 °C -> -72 €/j (95 jours, t = 3,62). Groupées,
// elles donnaient +39 €/j à t = 0,84 — sous le plancher, donc muettes. La pluie RESTE groupée :
// son signe est constant à toutes les doses (-38 / -133 / -131 / -102), la mise en commun y est
// légitime. On ne scinde que là où les signes divergent.
// BARÈME — CORRIGÉ le 29/07 au soir. Les bandes affichées étaient FAUSSES DE 7 °C : j'avais pris
// l'échelle de `stg_weather_alerts_daily_all.sql` (32/35/38/40), qui n'alimente PAS cette chaîne.
// Le moteur lit `lvl_heat` depuis fct_location_context_daily <- fct_location_weather_alerts_daily
// <- int_client_weather_alerts_daily, dont l'échelle est 25/28/32/35 (lignes 120-127). Vérifié sur
// la donnée : 32,7 °C y donne lvl_heat = 3, pas 1. La MESURE de la scission reste valide (elle
// porte sur lvl 1 vs lvl >= 2, et les +70/-72 €/j sont réels) — seuls les degrés étaient faux.
export const WEATHER_DAY_CLASSES: Array<{ key: string; level_col: string; min_lvl: number; max_lvl?: number; label_fr: string }> = [
  { key: "heat_25_27",   level_col: "lvl_heat", min_lvl: 1, max_lvl: 1, label_fr: "jours à 25–27 °C" },
  { key: "heat_28_plus", level_col: "lvl_heat", min_lvl: 2,             label_fr: "jours à 28 °C et plus" },
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
  { key: "competition_high", family: "competition", index_col: "competition_index_local", label_fr: "jours à forte activité dans votre périmètre" },
  { key: "tourism_high", family: "tourism", index_col: "tourism_index_region", label_fr: "jours à fort flux touristique" },
  // index_col RETIRÉ : il n'était lu nulle part (seul label_fr sert, via CLASS_LABELS) et faisait
  // croire à une autorité qu'il n'avait pas. Le rayon dépend désormais du périmètre déclaré par le
  // lieu (1 km / 20 km / 500 m par défaut) : le libellé ne peut plus l'annoncer en dur.
  { key: "events_high", family: "events", index_col: "", label_fr: "jours à forte densité d'événements" },
  // Classes BASSES (mapping B2/D2, ajoutées 26/07) : tercile bas — les fenêtres favorables
  // (basse pression, basse saison) ; écart positif attendu → pill verte « À capter ».
  { key: "competition_low", family: "competition", index_col: "competition_index_local", label_fr: "jours à faible activité dans votre périmètre" },
  { key: "tourism_low", family: "tourism", index_col: "tourism_index_region", label_fr: "jours de basse saison touristique" },
];

export const OTHER_DAY_CLASSES: Array<{ key: string; family: string; label_fr: string }> = [
  { key: "mobility_disruption", family: "mobility", label_fr: "jours à perturbation de mobilité" },
  { key: "followed_activity_high", family: "suivis", label_fr: "jours de forte activité des concurrents que vous suivez" },
  // Libellé arbitré owner 21/08, en DEUX temps. « vos concurrents suivis » d'abord rejeté
  // (« n'est pas français ») ; « vos concurrents » ensuite écarté parce que la restriction est
  // MESURÉE et non négociable : dayClassAggregateSql filtre `entity_is_followed = TRUE`, soit
  // 17 lieux sur 22 détectés chez f10c3e58 — le libellé large aurait annoncé les 22. Forme
  // retenue : la relative, seule tournure à la fois exacte et grammaticale.
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

// Populations de cartes (doctrine valeur d'action, 01/08) — famille 'card' : le coin PROPRE des
// cartes d'anomalie/conjonction (« ce problème pèse ~X €/an au rythme constaté »). Elles ne sont
// JAMAIS des motifs structurels (filtre family !== 'card' côté monitor) et sont DISPENSÉES de la
// porte de matérialité (amendement 5 : le vrai nombre s'affiche, même petit — la petitesse est
// l'information). Les autres portes (n >= 5, span, t_log, cohérence de signe) s'appliquent.
export const CARD_POP_CLASSES: Array<{ key: string; family: string; label_fr: string }> = [
  { key: "pop_revenue_down", family: "card", label_fr: "journées anormalement basses" },
  { key: "pop_revenue_surge", family: "card", label_fr: "journées anormalement hautes" },
  // Apostrophe TYPOGRAPHIQUE exigée : le strip du préfixe côté client (« ^jours (de |d’|à )? »)
  // ne connaît qu'elle — l'ASCII donnait « perdus · d'affluence sans conversion » (vu owner 01/08).
  { key: "pop_traffic_not_conv", family: "card", label_fr: "jours d’affluence sans conversion" },
  // 23/08 — populations des cartes de FAITS en euros (owner : « €/an au rythme constaté »).
  // Valeur/jour = le delta_eur de la carte (réel − attendu de l'heure/produit/famille), PAS le
  // résidu du jour. Deux populations par grain — une par sens — sinon la médiane d'un mélange
  // manque/porte tomberait à ~0 et la porte de cohérence de signe éteindrait tout.
  { key: "pop_hour_miss",    family: "card", label_fr: "créneaux qui ont sous-performé" },
  { key: "pop_hour_carry",   family: "card", label_fr: "créneaux qui ont surperformé" },
  { key: "pop_item_miss",    family: "card", label_fr: "produits qui ont sous-performé" },
  { key: "pop_item_carry",   family: "card", label_fr: "produits qui ont surperformé" },
  { key: "pop_family_miss",  family: "card", label_fr: "familles qui ont sous-performé" },
  { key: "pop_family_carry", family: "card", label_fr: "familles qui ont surperformé" },
];

const CLASS_LABELS: Record<string, string> = Object.fromEntries([
  ...WEATHER_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...TERCILE_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...OTHER_DAY_CLASSES.map((c) => [c.key, c.label_fr]),
  ...CARD_POP_CLASSES.map((c) => [c.key, c.label_fr]),
]);

import { KPI_PERF_KEYS, KPI_DAILY_COL, CARD_FUNNEL_STEP } from "./kpiRegistry";

const PROJECT = "muse-square-open-data";
// Offline store (incrément 1) : raw aggregates ONLY — n/avg/sd/span per location × class. The
// POLICY (gates, tier, €/an, negative-only) lives HERE in rowsToImpacts and is applied at READ
// time, so a gate change never requires a re-batch. Rebuilt nightly by api/cron/day-class-impacts.
export const DAY_CLASS_STORE = "analytics.day_class_impacts";

// Temps 2 du périmètre (01/08, variante honnête validée owner) : le nombre de jours mesurables que
// CHAQUE réponse débloquerait, calculé et stocké par le cron — JAMAIS codé en dur (la faute des
// 7 cartes concurrent). TABLE SÉPARÉE du store des pilules, à dessein : des lignes d'hypothèse
// dans day_class_impacts seraient bucketées 'pure' par toute lecture antérieure à ce commit
// (rowsToImpactsWithImmaterial traite tout non-'marginal' comme pure) — une pilule fabriquée
// depuis une hypothèse. L'isolation rend l'accident impossible.
export const CATCHMENT_HYP_STORE = "analytics.catchment_hypothesis_days";

// Jours mesurables par HYPOTHÈSE de périmètre ('commune' -> 1 km, 'beyond' -> 20 km) : jours avec
// ventes (JOIN résiduel, comme l'agrégat) dont la densité au rayon hypothétique tombe dans SON
// tercile haut — la sémantique exacte de in_events (non-NULL, distribution non dégénérée, >= t2).
export function catchmentHypothesisSql(singleLocation: boolean): string {
  return `
    WITH joined AS (
      SELECT
        c.location_id,
        e.events_within_1km_count  AS ev1,
        e.events_within_20km_count AS ev20
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
        ON r.location_id = c.location_id AND r.date = c.date
      LEFT JOIN \`${PROJECT}.mart.fct_location_events_radius_daily\` e
        ON e.location_id = c.location_id AND e.date = c.date
        AND e.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND e.date <= CURRENT_DATE()
      WHERE c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()
      ${singleLocation ? "AND c.location_id = @location_id" : ""}
    ),
    th AS (
      SELECT location_id,
        APPROX_QUANTILES(ev1, 3)[OFFSET(2)]  AS ev1_t2,  MIN(ev1)  AS ev1_min,  MAX(ev1)  AS ev1_max,
        APPROX_QUANTILES(ev20, 3)[OFFSET(2)] AS ev20_t2, MIN(ev20) AS ev20_min, MAX(ev20) AS ev20_max
      FROM joined GROUP BY location_id
    )
    SELECT
      j.location_id,
      hypothesis,
      COUNTIF(CASE WHEN hypothesis = 'commune'
                   THEN j.ev1  IS NOT NULL AND t.ev1_max  > t.ev1_min  AND j.ev1  >= t.ev1_t2
                   ELSE j.ev20 IS NOT NULL AND t.ev20_max > t.ev20_min AND j.ev20 >= t.ev20_t2 END) AS n_days_measurable,
      COUNT(*) AS n_days_sales,
      CURRENT_TIMESTAMP() AS computed_at
    FROM joined j
    JOIN th t USING (location_id)
    CROSS JOIN UNNEST(['commune', 'beyond']) AS hypothesis
    GROUP BY j.location_id, hypothesis
  `;
}

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
// (échelle RÉELLE de cette chaîne : chaleur 25/28/32/35 °C — cf. correction du barème plus haut).
//
// SÉVÉRITÉ D'ABORD. L'ancienne chaîne prenait la première classe de la liste qui matchait, donc
// une chaleur de niveau 1 pouvait éclipser une pluie de niveau 2 — 4 jours sur 364 sur le parc
// réel, et la carte aurait alors été rattachée à la mauvaise classe. On balaie par niveau
// décroissant : l'aléa LE PLUS SÉVÈRE du jour nomme la classe, l'ordre de WEATHER_DAY_CLASSES ne
// départageant plus qu'à sévérité égale.
//
// NB : abaisser le seuil rend plus de jours multi-appartenance, donc non « purs » ; ils basculent
// sur la base 'marginal' (entangled -> tier plafonné « estimé, facteurs mêlés »). C'est le
// comportement voulu, pas une perte. Le seuil de TIR des cartes (alert_level_max >= 2, côté dbt)
// est indépendant et n'est PAS touché : ce changement ne concerne que la couche de mesure.
// Balayage par niveau DÉCROISSANT, égalité stricte sur le niveau : à chaque palier on n'émet que
// les classes dont la bande [min_lvl, max_lvl] contient ce palier. L'égalité (et non `>=`) est ce
// qui rend les bandes BORNÉES possibles — `heat_25_27` ne doit pas capturer un jour à 32 °C. Le
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
    -- 23/08 — l'écart du jour de chaque carte de fait (l'heure / le produit / la famille au plus
    -- grand |delta_eur| parmi les tirs, exactement celui que la carte montre). Branché dans l'union
    -- des populations, jamais joint à joined (coût du plan, voir plus bas).
    fact_hour AS (
      SELECT location_id, transaction_date AS date,
             ARRAY_AGG(delta_eur ORDER BY ABS(delta_eur) DESC LIMIT 1)[OFFSET(0)] AS v
      FROM \`${PROJECT}.mart.fct_client_hourly_signals_daily\`
      WHERE is_hour_move AND transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND transaction_date < CURRENT_DATE()
      ${singleLocation ? "AND location_id = @location_id" : ""}
      GROUP BY 1, 2
    ),
    fact_item AS (
      SELECT location_id, transaction_date AS date,
             ARRAY_AGG(delta_eur ORDER BY ABS(delta_eur) DESC LIMIT 1)[OFFSET(0)] AS v
      FROM \`${PROJECT}.mart.fct_client_item_signals_daily\`
      WHERE is_eur_move AND transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND transaction_date < CURRENT_DATE()
      ${singleLocation ? "AND location_id = @location_id" : ""}
      GROUP BY 1, 2
    ),
    fact_family AS (
      SELECT location_id, transaction_date AS date,
             ARRAY_AGG(delta_eur ORDER BY ABS(delta_eur) DESC LIMIT 1)[OFFSET(0)] AS v
      FROM \`${PROJECT}.mart.fct_client_offering_signals_daily\`
      WHERE is_eur_move AND transaction_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND transaction_date < CURRENT_DATE()
      ${singleLocation ? "AND location_id = @location_id" : ""}
      GROUP BY 1, 2
    ),
    joined AS (
      SELECT
        c.location_id,
        c.date,
        r.daily_revenue - r.expected_revenue AS gap_eur,
        -- Résidu LOG (01/08) : le test de significativité se fait ici — centré par construction,
        -- insensible au biais de retransformation qui rend le gap € moyen non nul (cf. en-tête).
        CASE WHEN r.daily_revenue > 0 AND r.expected_revenue > 0
             THEN LN(r.daily_revenue) - LN(r.expected_revenue) END AS gap_log,
        ${conditionCaseSql()} AS weather_class,
        c.is_school_holiday_flag AS school_flag,
        c.is_public_holiday_flag AS holiday_flag,
        c.is_weekend_flag AS weekend_flag,
        EXTRACT(MONTH FROM c.date) AS month_num,
        f.competition_index_local,
        f.tourism_index_region,
        COALESCE(f.mobility_disruption_flag_event_window, FALSE) AS mobility_flag,
        -- Périmètre de clientèle DÉCLARÉ (docs/perimetre-client-spec.md) : commune -> 1 km,
        -- beyond -> 20 km. c.client_catchment vient de fct_location_context_daily, qui la porte
        -- déjà (vérifié sur INFORMATION_SCHEMA le 30/07) — aucun join supplémentaire.
        -- ELSE = 500 m, le comportement actuel. La spec écrivait « tant que la réponse est
        -- absente, la classe n'existe pas » : c'est FAUX, events_high est mesurée pour 3 lieux
        -- dans analytics.day_class_impacts. Un ELSE NULL aurait supprimé ces trois mesures.
        -- L'alias est renommé : events_500m mentait sur son contenu dès que le rayon varie.
        -- Lu sur la DIMENSION (dcl), pas sur c : fct_location_context_daily ne porte pas la
        -- colonne. Même correction que dateResolutionQuery — ici l'échec était total : la requête
        -- entière tombait (« Name client_catchment not found inside c »), donc le repli live
        -- computeDayClassImpacts ne rendait plus rien pour un compte sans lignes au store.
        CASE dcl.client_catchment
          WHEN 'commune' THEN e.events_within_1km_count
          WHEN 'beyond'  THEN e.events_within_20km_count
          ELSE                e.events_within_500m_count
        END AS events_radius,
        COALESCE(sv.active_ct, 0) AS suivis_ct,
        perf.daily_visitors AS visitors,
        COALESCE(sg.is_discount_without_lift, FALSE) AS discount_no_lift_flag,
        sg.daily_discount_total AS discount_total,
        -- Populations de cartes (doctrine 01/08, famille 'card') : les jours où CHAQUE carte
        -- d'anomalie/conjonction tire — son coin = SA récurrence, jamais le poids d'une classe
        -- environnementale. Flags des marts ventes, mêmes référentiels que les cartes.
        COALESCE(r.is_revenue_down_residual, FALSE) AS pop_down_flag,
        COALESCE(r.is_revenue_surge_residual, FALSE) AS pop_surge_flag,
        COALESCE(sg.is_traffic_not_converting, FALSE) AS pop_traffic_nc_flag
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
      -- Périmètre déclaré, grain location_id (32 lignes / 32 lieux vérifié) : aucune
      -- démultiplication des jours, donc aucun effet sur les agrégats existants.
      LEFT JOIN \`${PROJECT}.dims.dim_client_location\` dcl
        ON dcl.location_id = c.location_id
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
        APPROX_QUANTILES(events_radius, 3)[OFFSET(2)] AS ev_t2,
        MIN(events_radius) AS ev_min, MAX(events_radius) AS ev_max,
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
        (j.events_radius IS NOT NULL AND t.ev_max > t.ev_min AND j.events_radius >= t.ev_t2) AS in_events,
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
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'weather' AS family, weather_class AS class_key
      FROM counted WHERE in_weather
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'competition' AS family, 'competition_high' AS class_key
      FROM counted WHERE in_comp
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'tourism' AS family, 'tourism_high' AS class_key
      FROM counted WHERE in_tour
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'events' AS family, 'events_high' AS class_key
      FROM counted WHERE in_events
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'mobility' AS family, 'mobility_disruption' AS class_key
      FROM counted WHERE in_mobility
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'suivis' AS family, 'followed_activity_high' AS class_key
      FROM counted WHERE in_suivis
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'traffic' AS family, 'traffic_high' AS class_key
      FROM counted WHERE in_traffic
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'competition' AS family, 'competition_low' AS class_key
      FROM counted WHERE in_comp_low
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'tourism' AS family, 'tourism_low' AS class_key
      FROM counted WHERE in_tour_low
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'calendar' AS family, 'school_holiday' AS class_key
      FROM counted WHERE in_school
      UNION ALL
      SELECT location_id, date, gap_eur, gap_log, month_num, weekend_flag, n_memberships, 'calendar' AS family, 'public_holiday' AS class_key
      FROM counted WHERE in_holiday
    ),
    -- Contrôle marginal PAR CLASSE : les jours HORS classe X du même (mois × type de jour) du site.
    -- C'est le contraste marginal classique — le contrôle peut contenir d'autres classes, ce que
    -- l'étiquette « facteurs mêlés » assume ; >= 3 jours de contrôle requis par cellule.
    -- ── MÉTRIQUE = DIMENSION (22/08, forme B, arbitrage owner) ───────────────────────────
    -- Le moteur ne mesurait QUE le résidu de CA, alors que le registre des engagements
    -- (kpiRegistry) en propose huit. Deux vocabulaires pour la même question — « qu'est-ce que
    -- cette classe de jours déplace ? ». vals dépivote : une ligne par (lieu, date, métrique),
    -- et tout l'aval groupe par metric en plus. Un KPI de plus = une branche ici, rien d'autre.
    --
    -- BASE : les cinq nouveaux KPI n'ont PAS d'attendu par jour — il n'existe pas de « tickets
    -- attendus ». Leur seul point de comparaison est le contrôle de cellule (jours HORS classe,
    -- même mois × type de jour) que le moteur calcule déjà. Ils ne sortent donc qu'en base
    -- 'marginal' : émettre « 289 tickets » en base pure serait un nombre plausible et vide.
    -- revenue_residual garde ses deux bases, inchangé.
    --
    -- LOG : pour un KPI brut, le log est LN(valeur) — le contraste LN(v) − moyenne(LN(contrôle))
    -- est un log-ratio, centré comme l'est déjà gap_log. Le test de significativité, la
    -- cohérence de signe et la matérialité s'appliquent sans changement.
    --
    -- ABSENTS du pivot, et pas par prudence : reputation n'a aucune série côté client
    -- (besttime_rating 100 % NULL, audit 31/07 — il faut un connecteur GBP) et family_revenue
    -- est au grain PRODUIT, donc une autre jointure. Deux lignes le jour où leur donnée existe.
    -- Colonnes LUES au registre (KPI_DAILY_COL) : la liste des KPI mesurables a UN seul foyer,
    -- et un KPI de plus s'ajoute là-bas sans toucher à ce fichier.
    perf AS (
      SELECT location_id, transaction_date AS date, ${KPI_PERF_KEYS.map((k) => KPI_DAILY_COL[k]).join(", ")}
      FROM \`${PROJECT}.mart.fct_client_daily_performance\`
    ),
    vals AS (
      SELECT location_id, date, month_num, weekend_flag, 'revenue_residual' AS metric, gap_eur AS v, gap_log AS v_log
      FROM counted
      ${KPI_PERF_KEYS.map((k) => `UNION ALL SELECT c.location_id, c.date, c.month_num, c.weekend_flag, '${k}', p.${KPI_DAILY_COL[k]},
             IF(p.${KPI_DAILY_COL[k]} > 0, LN(p.${KPI_DAILY_COL[k]}), NULL)
      FROM counted c JOIN perf p USING (location_id, date) WHERE p.${KPI_DAILY_COL[k]} IS NOT NULL`).join("\n      ")}
    ),
    -- class_days reste le mapping date -> classe (intouché) ; on lui accole la métrique.
    class_metric AS (
      SELECT cd.location_id, cd.date, cd.month_num, cd.weekend_flag, cd.n_memberships,
             cd.family, cd.class_key, v.metric, v.v AS gap_eur, v.v_log AS gap_log
      FROM class_days cd
      JOIN vals v ON v.location_id = cd.location_id AND v.date = cd.date
    ),
    cell_stats AS (
      SELECT location_id, month_num, weekend_flag, metric, SUM(v) AS cell_sum, COUNT(*) AS cell_cnt, SUM(v_log) AS cell_sum_log, COUNTIF(v_log IS NOT NULL) AS cell_cnt_log
      FROM vals GROUP BY location_id, month_num, weekend_flag, metric
    ),
    cell_class AS (
      SELECT location_id, month_num, weekend_flag, class_key, metric, SUM(gap_eur) AS x_sum, COUNT(*) AS x_cnt, SUM(gap_log) AS x_sum_log, COUNTIF(gap_log IS NOT NULL) AS x_cnt_log
      FROM class_metric GROUP BY location_id, month_num, weekend_flag, class_key, metric
    ),
    adjusted AS (
      SELECT
        cd.*,
        SAFE_DIVIDE(cs.cell_sum - cc.x_sum, cs.cell_cnt - cc.x_cnt) AS ctrl_gap,
        SAFE_DIVIDE(cs.cell_sum_log - cc.x_sum_log, cs.cell_cnt_log - cc.x_cnt_log) AS ctrl_gap_log,
        cs.cell_cnt - cc.x_cnt AS ctrl_n
      FROM class_metric cd
      JOIN cell_stats cs ON cs.location_id = cd.location_id AND cs.month_num = cd.month_num AND cs.weekend_flag = cd.weekend_flag AND cs.metric = cd.metric
      JOIN cell_class cc ON cc.location_id = cd.location_id AND cc.month_num = cd.month_num AND cc.weekend_flag = cd.weekend_flag AND cc.class_key = cd.class_key AND cc.metric = cd.metric
    ),
    -- Deux BASES par classe. 'pure' = jours purs (n_memberships = 1), gap brut vs normale — sauf
    -- calendrier, contrôlé hors-classe même cellule (leçon calendarFamily). 'marginal' = TOUS les
    -- jours de la classe, gap − contrôle hors-classe (mois × type de jour) — « facteurs mêlés ».
    classed AS (
      -- 22/08 : la metrique traverse. La base 'pure' reste RÉSERVÉE au résidu de CA — elle compare à
      -- l'attendu du jour, qui n'existe que pour lui. Pour les cinq autres KPI, seule la base
      -- 'marginal' a un sens (valeur − contrôle hors-classe de la cellule).
      SELECT location_id, date, metric, gap_eur, gap_log, family, class_key, 'pure' AS basis
      FROM adjusted WHERE metric = 'revenue_residual' AND n_memberships = 1 AND family != 'calendar'
      UNION ALL
      SELECT location_id, date, metric, gap_eur - ctrl_gap, gap_log - ctrl_gap_log, family, class_key, 'pure'
      FROM adjusted WHERE metric = 'revenue_residual' AND n_memberships = 1 AND family = 'calendar' AND ctrl_n >= 3 AND ctrl_gap IS NOT NULL
      UNION ALL
      SELECT location_id, date, metric, gap_eur - ctrl_gap, gap_log - ctrl_gap_log, family, class_key, 'marginal'
      FROM adjusted WHERE ctrl_n >= 3 AND ctrl_gap IS NOT NULL
      UNION ALL
      -- discount_no_lift : classe COÛT (€ remisés, stockés négatifs) — fait du jour, hors pureté,
      -- hors ajustement saison, base 'pure' par nature.
      SELECT location_id, date, 'revenue_residual', -discount_total, CAST(NULL AS FLOAT64), 'sales', 'discount_no_lift', 'pure'
      FROM counted WHERE discount_no_lift_flag IS TRUE AND discount_total IS NOT NULL AND discount_total > 0
      UNION ALL
      -- Populations de cartes (doctrine 01/08) : base 'pure' par nature (le tir EST
      -- l'appartenance — pas de pureté ni d'ajustement saison : le gap brut vs normale est le
      -- référentiel que la carte affiche). Lecteurs antérieurs : class_key inconnu de
      -- CLASS_LABELS -> ligne ignorée (sûr au déploiement).
      SELECT location_id, date, 'revenue_residual', gap_eur, gap_log, 'card', 'pop_revenue_down', 'pure'
      FROM counted WHERE pop_down_flag
      UNION ALL
      SELECT location_id, date, 'revenue_residual', gap_eur, gap_log, 'card', 'pop_revenue_surge', 'pure'
      FROM counted WHERE pop_surge_flag
      UNION ALL
      SELECT location_id, date, 'revenue_residual', gap_eur, gap_log, 'card', 'pop_traffic_not_conv', 'pure'
      FROM counted WHERE pop_traffic_nc_flag
      UNION ALL
      -- 23/08 — cartes de faits : valeur/jour = le delta_eur de la carte, gap_log NULL (régime
      -- linéaire de rowToImpact, comme discount_no_lift). Une population par sens.
      -- Lues DIRECTEMENT depuis fact_* (pas via joined/counted : counted est référencé ~15 fois
      -- dans ces unions et BigQuery recalculait joined avec les jointures — mesuré 34 s → 65-170 s).
      SELECT location_id, date, 'revenue_residual', v, CAST(NULL AS FLOAT64), 'card', IF(v < 0, 'pop_hour_miss', 'pop_hour_carry'), 'pure' FROM fact_hour
      UNION ALL
      SELECT location_id, date, 'revenue_residual', v, CAST(NULL AS FLOAT64), 'card', IF(v < 0, 'pop_item_miss', 'pop_item_carry'), 'pure' FROM fact_item
      UNION ALL
      SELECT location_id, date, 'revenue_residual', v, CAST(NULL AS FLOAT64), 'card', IF(v < 0, 'pop_family_miss', 'pop_family_carry'), 'pure' FROM fact_family
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
      cl.metric,
      COUNT(*) AS n_days,
      AVG(cl.gap_eur) AS avg_gap_eur,
      STDDEV_SAMP(cl.gap_eur) AS sd_gap_eur,
      -- Régime log+médiane (01/08) : le t se calcule sur les stats _log, l'€ sur la médiane.
      APPROX_QUANTILES(cl.gap_eur, 2)[OFFSET(1)] AS med_gap_eur,
      COUNTIF(cl.gap_log IS NOT NULL) AS n_log,
      AVG(cl.gap_log) AS avg_log,
      STDDEV_SAMP(cl.gap_log) AS sd_log,
      s.span_days,
      CURRENT_TIMESTAMP() AS computed_at
    FROM classed cl
    JOIN span s ON s.location_id = cl.location_id
    GROUP BY cl.location_id, cl.class_key, cl.family, cl.basis, cl.metric, s.span_days
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
// QUE ce que l'owner a signalé. À 0,5 % on perdait heat_25_27 (−2 451 €), à 1 % les vacances
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
  // RÉGIME LOG + MÉDIANE (01/08, GO owner — preuves docs/residu-bruit-diagnostic.md) :
  // le t se calcule sur le résidu LOG (centré par construction ; le t linéaire fabriquait des
  // faux positifs à +2,0..+2,8 sur des classes d'effet nul), l'€/j est la MÉDIANE des gaps
  // (insensible au biais de retransformation et aux factures — une seule portait 76 % des €
  // de competition_high chez Les Olivades). discount_no_lift (classe COÛT : somme de remises,
  // pas un résidu) reste au régime linéaire. Repli legacy : une ligne sans stats _log (store
  // d'avant le rebuild, ou historique) garde l'ancien calcul plutôt que de disparaître.
  const nLog = Number(row?.n_log ?? 0);
  const avgLog = Number(row?.avg_log ?? NaN);
  const sdLog = Number(row?.sd_log ?? NaN);
  const med = Number(row?.med_gap_eur ?? NaN);
  const isCostClass = key === "discount_no_lift";
  const hasLog = !isCostClass && nLog >= 5 && Number.isFinite(avgLog) && Number.isFinite(sdLog) && Number.isFinite(med);
  let t: number;
  let dailyEur: number;
  if (hasLog) {
    t = sdLog > 0 ? Math.abs(avgLog) / (sdLog / Math.sqrt(nLog)) : 0;
    // |t| >= 1 floor for ANY pill (incrément 1) : tercile classes pass n>=5 BY CONSTRUCTION, so
    // without a signal floor pure noise gets annualized (proven live: t=0,08 → « ~352 €/an »).
    if (t < 1) return null;
    // COHÉRENCE DE SIGNE : test log et médiane € doivent pointer dans le même sens, sinon la
    // distribution est trop biscornue pour affirmer quoi que ce soit (cas mesuré : wind Olivades,
    // t_log +1,68 mais médiane −114 €/j). Absence honnête, pas de pilule.
    if (med === 0 || Math.sign(med) !== Math.sign(avgLog)) return null;
    dailyEur = med;
  } else {
    t = Number.isFinite(sd) && sd > 0 ? Math.abs(avg) / (sd / Math.sqrt(n)) : 0;
    if (t < 1) return null;
    dailyEur = avg;
  }
  const eurYear = Math.round(dailyEur * (n / (spanDays / 365.25)));
  // Amendement 5 (01/08) : la matérialité GOUVERNE les motifs structurels ; les populations de
  // cartes (famille 'card') affichent leur vrai nombre, même petit — jamais éteintes ici.
  const rowFamily = String(row?.family ?? "");
  if (
    rowFamily !== "card" &&
    annualRevenue != null && Number.isFinite(annualRevenue) && annualRevenue > 0 &&
    Math.abs(eurYear) < annualRevenue * MATERIALITY_PCT_OF_REVENUE
  ) return null;
  const tier: DayClassImpact["tier"] =
    !entangled && n >= 10 && t >= 2 && spanDays >= 300 ? "mesuré" : "estimé";
  return {
    class_key: key,
    label_fr: CLASS_LABELS[key],
    // family exposé pour que monitor exclue la famille 'card' des motifs structurels.
    family: rowFamily || undefined,
    eur_year: eurYear,
    tier,
    // 22/08 — « cause multifactorielle » sortait du registre de la recherche, pas de celui
    // d'un exploitant, et s'affichait EN CLAIR sur la ligne de chantier (pulse:3850). Le
    // standard du produit veut le jargon dans l'infobulle seulement. Mot retenu : « facteurs
    // mêlés » — celui que l'auteur de ce fichier emploie deux fois pour expliquer la base
    // marginale (lignes 431 et 452), donc ni inventé ni traduit. Le concept « niveau de
    // preuve d'une mesure » n'a PAS d'entrée au lexique : mot à confirmer par l'owner.
    tier_label_fr: entangled ? "estimé, facteurs mêlés" : tier,
    entangled,
    n_days: n,
    span_months: Math.round(spanDays / 30.44),
    // En régime log+médiane, le « €/j » exposé EST la médiane — cohérent avec eur_year.
    avg_gap_eur: Math.round(dailyEur * 10) / 10,
    t_stat: Math.round(t * 100) / 100,
  };
}

// Renvoie les impacts ET les classes écartées POUR MATÉRIALITÉ seulement (29/07). Sans cette
// distinction, une classe mesurée-mais-négligeable était indiscernable d'une classe non mesurable :
// le lecteur affichait « non séparable ou insuffisant sur votre historique », ce qui est faux — on
// SAIT, et la réponse est « c'est négligeable ». La carte doit alors disparaître, pas s'excuser.
// Exporté 10/08 : le tableau de bord (dashboard.ts) passe ses lignes store par CE pipeline —
// même registre (log+médiane, |t| ≥ 1, cohérence de signe, matérialité) que les pills/chantiers,
// jamais un agrégat brut parallèle.
// 22/08 — le store porte désormais SIX métriques (voir `vals` dans dayClassAggregateSql). Cette
// fonction est le SEUL point d'entrée de lecture : elle en choisit UNE, et par défaut le résidu
// de CA. Tout appelant existant garde donc son comportement au caractère près, et un appelant qui
// veut les tickets ou le panier le DEMANDE. Le regroupement se fait par class_key seul : sans ce
// filtre, six lignes se disputeraient la même clé et la dernière lue gagnerait.
// Les lignes d'avant ce commit (store écrasé chaque nuit, historique conservé) n'ont pas de
// colonne metric : NULL vaut 'revenue_residual', ce qu'elles étaient.
/**
 * 23/08 — Les JOURS d'une classe, par LE moteur (jamais une recopie de seuils) : la SQL de
 * dayClassAggregateSql(true) coupée juste après `class_days`, filtrée sur @location_id et
 * @class_key. Consommateur : le provider dispositif (atelier des mécanismes), pour ouvrir
 * l'enquête à toute classe mesurée — la porte à trois motifs du 03/08 recopiait l'appartenance
 * de chacune à la main, ce qui limitait l'entrée à ces trois-là (arbitrage owner 23/08).
 */
export function dayClassMembersSql(): string {
  const full = dayClassAggregateSql(true);
  const cut = full.indexOf("    vals AS (");
  if (cut < 0) throw new Error("dayClassMembersSql: CTE vals introuvable — la forme du moteur a changé");
  // On garde tout jusqu'au CTE précédant `vals` (perf inclus, inoffensif) et on termine proprement.
  const head = full.slice(0, cut).replace(/,\s*$/, "");
  return `${head}
    SELECT date FROM class_days WHERE location_id = @location_id AND class_key = @class_key`;
}

export function rowsToImpactsWithImmaterial(rows: any[], annualRevenue?: number | null, metric: string = "revenue_residual"): { impacts: Map<string, DayClassImpact>; immaterial: Set<string> } {
  const byClass = new Map<string, { pure?: any; marginal?: any }>();
  for (const row of rows) {
    if (String(row?.metric ?? "revenue_residual") !== metric) continue;
    const key = String(row?.class_key ?? row?.condition ?? "");
    if (!key) continue;
    const bucket = byClass.get(key) ?? {};
    // Legacy rows without basis (pre-2.5 store) are treated as pure.
    if (String(row?.basis ?? "pure") === "marginal") bucket.marginal = row;
    else bucket.pure = row;
    byClass.set(key, bucket);
  }
  const impacts = new Map<string, DayClassImpact>();
  const immaterial = new Set<string>();
  for (const [key, bucket] of byClass) {
    const impact =
      (bucket.pure ? rowToImpact(bucket.pure, false, annualRevenue) : null)
      ?? (bucket.marginal ? rowToImpact(bucket.marginal, true, annualRevenue) : null);
    if (impact) { impacts.set(key, impact); continue; }
    // Écartée : est-ce la MATÉRIALITÉ ou une autre porte ? On rejoue la MÊME fonction sans le
    // dénominateur — si elle passe alors, c'est bien la matérialité qui l'a écartée. Pas de
    // politique dupliquée : une seule implémentation, interrogée deux fois.
    const sansPorte =
      (bucket.pure ? rowToImpact(bucket.pure, false, null) : null)
      ?? (bucket.marginal ? rowToImpact(bucket.marginal, true, null) : null);
    if (sansPorte) immaterial.add(key);
  }
  return { impacts, immaterial };
}

function rowsToImpacts(rows: any[], annualRevenue?: number | null): Map<string, DayClassImpact> {
  return rowsToImpactsWithImmaterial(rows, annualRevenue).impacts;
}

async function dateResolutionQuery(bq: any, location_id: string, dates: string[]): Promise<{ conditionByDate: Map<string, string>; calendarByDate: Map<string, { school: boolean; holiday: boolean }>; clientCatchment: string | null }> {
  const empty = { conditionByDate: new Map<string, string>(), calendarByDate: new Map<string, { school: boolean; holiday: boolean }>(), clientCatchment: null as string | null };
  if (!dates.length) return empty;
  const rows = await bq.query({
    query: `
      SELECT FORMAT_DATE('%Y-%m-%d', c.date) AS date, ${conditionCaseSql()} AS condition,
             c.is_school_holiday_flag AS school_flag, c.is_public_holiday_flag AS holiday_flag,
             dcl.client_catchment AS client_catchment
      FROM \`${PROJECT}.mart.fct_location_context_daily\` c
      -- Périmètre déclaré : lu sur la DIMENSION, pas sur le mart de contexte.
      -- 31/07/2026 — la version précédente lisait c.client_catchment, colonne qui N'EXISTE PAS
      -- dans fct_location_context_daily (49 colonnes, vérifié live). La requête échouait, son
      -- catch avalait l'erreur, et TOUT ce qu'elle rend tombait à vide : clientCatchment bien sûr
      -- (donc répondre à la question ne pouvait jamais l'éteindre), mais AUSSI conditionByDate et
      -- calendarByDate — soit la résolution météo/calendrier par date de TOUTES les cartes.
      -- Mesuré sur f10c3e58 : 0 / 0 / null. Introduit par 4f86360, jamais parti en prod.
      -- La dimension est le bon référentiel : set-catchment.ts l'écrit dans la seconde, donc la
      -- question disparaît au rechargement suivant sans attendre un run dbt. Grain vérifié :
      -- 32 lignes pour 32 lieux, une par location_id — aucune démultiplication possible.
      LEFT JOIN \`${PROJECT}.dims.dim_client_location\` dcl
        ON dcl.location_id = c.location_id
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
    // Grain LIEU : identique sur toutes les lignes, on garde la première valeur non nulle.
    if (out.clientCatchment == null && row?.client_catchment != null) out.clientCatchment = String(row.client_catchment);
  }
  return out;
}

/**
 * Live (request-time) computation for ONE location — the FALLBACK when the store has no rows
 * for this location yet (fresh account before the nightly batch). Same SQL, same policy.
 */
// L'agrégat LIVE d'un site — la même SQL que le batch, filtrée @location_id. Une seule
// implémentation, consommée par computeDayClassImpacts et par le repli de getDayClassImpacts.
async function liveAggregateRows(bq: any, location_id: string): Promise<any[]> {
  return await bq.query({
    query: dayClassAggregateSql(true),
    params: { location_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
}

export async function computeDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [aggRows, dateRes, annualRevenue] = await Promise.all([
    liveAggregateRows(bq, location_id),
    dateResolutionQuery(bq, location_id, dates),
    annualRevenueQuery(bq, location_id),
  ]);
  const { impacts, immaterial } = rowsToImpactsWithImmaterial(aggRows as any[], annualRevenue);
  return { impacts, immaterial, ...dateRes };
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
/**
 * CA annualisé par site — LA formule (somme des jours / amplitude réelle × 365,25), groupée.
 * Consommée par le registre (dénominateur de matérialité) ET par dashboard.ts — une seule
 * implémentation (23/08 : dashboard en portait une copie « même formule, groupée »).
 */
export async function annualRevenueByLocation(bq: any, location_ids: string[]): Promise<Map<string, number>> {
  if (!location_ids.length) return new Map();
  const rows = await bq.query({
    query: `
      SELECT location_id,
             SAFE_DIVIDE(SUM(daily_revenue),
                         NULLIF(DATE_DIFF(MAX(transaction_date), MIN(transaction_date), DAY) + 1, 0)) * 365.25 AS annual_revenue
      FROM \`${PROJECT}.mart.fct_client_daily_performance\`
      WHERE location_id IN UNNEST(@locs)
      GROUP BY location_id
    `,
    params: { locs: location_ids },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const m = new Map<string, number>();
  for (const r of rows as any[]) { const v = Number(r?.annual_revenue); if (Number.isFinite(v) && v > 0) m.set(String(r.location_id), v); }
  return m;
}

async function annualRevenueQuery(bq: any, location_id: string): Promise<number | null> {
  return (await annualRevenueByLocation(bq, [location_id])).get(location_id) ?? null;
}

/**
 * Lecture du store nocturne — LA lecture (23/08) : une requête, filtrée sur la métrique du
 * résidu de CA. Consommée par getDayClassImpacts ET dashboard.ts (qui en portait une copie
 * « tolérante aux deux schémas » — le schéma transitoire sans `metric` n'existe plus depuis
 * le merge sur main ; le store est réécrit chaque nuit par ce code).
 */
// 24/08 — metric: null = TOUTES les métriques (barreau 2 du coin : getDayClassImpacts lit tout
// en UNE requête ; rowsToImpactsWithImmaterial refiltre revenue_residual, comportement inchangé).
// Les appelants existants (dashboard) gardent le défaut au caractère près.
export async function readDayClassStore(bq: any, location_ids: string[], metric: string | null = "revenue_residual"): Promise<any[]> {
  if (!location_ids.length) return [];
  const cols = "location_id, class_key, family, basis, metric, n_days, avg_gap_eur, sd_gap_eur, med_gap_eur, n_log, avg_log, sd_log, span_days";
  return await bq.query({
    query: `SELECT ${cols} FROM \`${PROJECT}.${DAY_CLASS_STORE}\` WHERE location_id IN UNNEST(@locs)${metric != null ? " AND metric = @metric" : ""}`,
    params: metric != null ? { locs: location_ids, metric } : { locs: location_ids }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
}

export async function getDayClassImpacts(bq: any, location_id: string, dates: string[]): Promise<DayClassResult> {
  const [storeRows, dateRes, annualRevenue, hypRows] = await Promise.all([
    // 24/08 — toutes métriques en une requête (même table, ~6 lignes par classe au lieu d'1) :
    // revenue_residual pour les impacts (refiltré en aval), le reste pour le barreau 2 du coin.
    readDayClassStore(bq, [location_id], null),
    dateResolutionQuery(bq, location_id, dates),
    annualRevenueQuery(bq, location_id),
    // Temps 2 périmètre — requête PARALLÈLE (dans le Promise.all : ne coûte que si la plus
    // lente), .catch [] tant que la table n'existe pas. Pas de repli live : un compte pas
    // encore batché montre la question SANS nombres, c'est le comportement voulu.
    bq.query({
      query: `SELECT hypothesis, n_days_measurable FROM \`${PROJECT}.${CATCHMENT_HYP_STORE}\` WHERE location_id = @location_id`,
      params: { location_id },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
  ]);
  const hyp = (() => {
    const m = new Map((hypRows as any[]).map((h: any) => [String(h?.hypothesis), Number(h?.n_days_measurable)]));
    const commune = m.get("commune"); const beyond = m.get("beyond");
    return Number.isFinite(commune) && Number.isFinite(beyond) ? { commune: commune as number, beyond: beyond as number } : null;
  })();
  if ((storeRows as any[]).length > 0) {
    const { impacts, immaterial } = rowsToImpactsWithImmaterial(storeRows as any[], annualRevenue);
    return { impacts, immaterial, ...dateRes, catchmentHypotheses: hyp, funnelRows: storeRows as any[] };
  }
  // Store vide. Deux cas, mesurés le 23/08 :
  //  - SANS ventes (26 sites actifs sur 32) : le moteur n'a rien à mesurer (joined est un INNER
  //    JOIN sur fct_client_day_residual) — le repli live tournait pourtant ENTIER, 32–52 s par
  //    ouverture de page, pour zéro pilule, dans le Promise.all de monitor.ts. Plus jamais :
  //    absence immédiate, résolutions date et hypothèses conservées (les cartes météo@date et
  //    calendrier@date en vivent, ventes ou pas).
  //  - AVEC ventes (site neuf, avant le batch de 04:00) : repli live, une fois, borné au
  //    prochain batch — sans refaire dateRes ni annualRevenue, déjà en main.
  if (annualRevenue == null) {
    return { impacts: new Map(), immaterial: new Set(), ...dateRes, catchmentHypotheses: hyp };
  }
  const aggRows = await liveAggregateRows(bq, location_id);
  const { impacts, immaterial } = rowsToImpactsWithImmaterial(aggRows as any[], annualRevenue);
  return { impacts, immaterial, ...dateRes, catchmentHypotheses: hyp, funnelRows: aggRows as any[] };
}

// Weather action types that resolve their condition from the AFFECTED DATE (payload has none).
const DATE_RESOLVED_WEATHER_TYPES = new Set([
  "weather_worsened",
  "extended_bad_weather",
  "extended_bad_weather_3d",
  // 22/08 — la seule des quatre cartes météo qui manquait. Elle annonce une amélioration ; la
  // classe météo MESURÉE de la date dit ce que cette journée vaut réellement sur le lieu — sans
  // elle, « le temps s'améliore » était une affirmation que rien ne confrontait.
  "weather_improved",
]);

// Card type → cross-family class. ONE class per card, sa PROPRE famille (docs/kpi-enjeu-mapping.md).
// NB : competition_proximity / high_competition_density / same_bucket_saturation portent des COMPTES
// D'ÉVÉNEMENTS dans leur payload — leur variable réelle est la densité événementielle, pas l'indice
// de pression ambiante ; elles mappent donc events_high (vérité de la variable, pas du nom).
const CARD_TYPE_CLASS: Record<string, string> = {
  // 25/08 — 19 cartes n'avaient AUCUN coin : elles déclarent une étape funnel
  // (CARD_FUNNEL_STEP) mais funnelCornerForCandidate sort au 2e test, faute de classe.
  // Rattachées ici SELON LA RÈGLE DE CE FICHIER — « vérité de la VARIABLE, pas du nom » :
  //   · competitor_event_launch / competitor_event_ending / mega_event_end tirent sur un
  //     ÉVÉNEMENT proche (change feed + rayon d'événements) : leur variable réelle est la
  //     densité événementielle, comme competition_proximity → events_high ;
  //   · foreign_tourism_signal tire sur le poids des visiteurs étrangers → tourism_high.
  // Rien n'est inventé : le coin reste soumis aux portes du moteur (n >= 5, span >= 60 j,
  // |t| >= 1, cohérence de signe, plancher 5 %). Une carte sans mesure garde un coin VIDE.
  competitor_event_launch: "events_high",
  competitor_event_ending: "events_high",
  mega_event_end: "events_high",
  foreign_tourism_signal: "tourism_high",
  // DÉLIBÉRÉMENT SANS CLASSE, et ce n'est pas un oubli :
  //   · commercial_event_match — sa variable est une annotation commerciale (rentrée, soldes) ;
  //     aucune classe ne la mesure. Le mapper sur school_holiday ferait porter à la RENTRÉE le
  //     chiffre des VACANCES : exactement le doublon de coin corrigé trois fois le 22/08.
  //   · calendar_audience_shift — tire sur is_public_holiday_flag OU is_school_holiday_flag ;
  //     une classe STATIQUE en désignerait une au hasard une fois sur deux. Il faudrait résoudre
  //     la classe par carte depuis le payload — changement de mécanisme, à arbitrer.
  //   · competitor_reputation_strength — parle d'une NOTE de concurrent, pas d'une classe de
  //     jour : elle n'a pas de coin € par nature.

  // Doctrine 01/08 : sales_traffic_not_converting et sales_competition_cannibalization RETIRÉES
  // d'ici — un poids de classe environnementale au coin d'une carte d'anomalie était le défaut
  // déclencheur (+33 402 « à gagner » sur une carte d'échec ; +73 674 porté par une facture).
  // Leur coin vient de CARD_POPULATION (ou mode « € ce jour ») ; la classe citée passe en
  // CONTEXTE (CARD_CONTEXT_CLASS -> motifContextForCandidate).
  sales_discount_no_lift: "discount_no_lift",
  competition_pressure_spike: "competition_high",
  low_tourism_local_opp: "tourism_low",
  competition_proximity: "events_high",
  high_competition_density: "events_high",
  same_bucket_saturation: "events_high",
  // 22/08 — LES QUATRE ATTACHES À `tourism_high` SONT RETIRÉES.
  // La classe est inmesurable PAR CONSTRUCTION, pas faute d'historique : `tourism_index_region`
  // est un indice MENSUEL (12 valeurs distinctes sur 484 jours), donc le tercile haut sélectionne
  // des mois entiers — juin et juillet, 61 jours sur 141 sur f10c3e58. Or le contrôle de cellule
  // est calculé par (lieu × mois × week-end) : tous les jours du mois étant dans la classe,
  // ctrl_n = 0 sur les quatre cellules, et la base 'marginal' ne produit RIEN. Reste la base
  // 'pure' (aucune autre classe sur le jour), qui donne n = 1 ici et n = 2 sur 29383776 — sous
  // le plancher n >= 5. Audit du 22/08 : passe sur 0 site sur 6.
  // Effet du retrait : `mapped` devient faux, donc silence au lieu de la raison
  // « Motif du jour non séparable — mûrit avec les saisons ». Cette classe ne mûrira jamais ;
  // la promesse était fausse, et le silence est le comportement prévu pour une absence PAR DESIGN.
  // Les trois autres cartes ont été retirées de dbt le 22/08 (PR #45) — attaches mortes.
  // NON TOUCHÉ à dessein : `COMBO_TYPE_CLASSES` garde ses tokens `tourism_high`. Un token sans
  // impact y est simplement ignoré (`if (imp && …)`), et les autres tokens du combiné portent le
  // coin — la dégradation est propre, il n'y a rien à corriger.
  mobility_disruption: "mobility_disruption",
  mobility_disruption_planned: "mobility_disruption",
  ft_peak_mobility: "mobility_disruption",
  // ── RETIRÉ le 31/07/2026 — les 7 cartes CONCURRENT ────────────────────────────────────────
  // Elles étaient mappées sur followed_activity_high. Le fait annoncé est un ÉVÉNEMENT SINGULIER
  // (« le Musée de l'Orangerie lance 1er dimanche gratuit ») ; la classe mesure une POPULATION DE
  // JOURS (« les journées où l'activité des concurrents suivis est dans le tercile haut »). Deux
  // référentiels différents : aucun geste sur le premier ne déplace le second. Le montant fabriquait
  // donc une urgence, sans prise.
  //
  // Deux d'entre elles avaient le signe INVERSÉ : competitor_event_ending (une activité qui
  // s'ARRÊTE) et competitor_content_silent (un concurrent qui se TAIT) affichaient le prix des
  // jours de FORTE activité — elles chiffraient le contraire de ce qu'elles annonçaient.
  //
  // Le retrait ne repose sur AUCUNE statistique : le défaut est logique. La mesure tentée le 31/07
  // était d'ailleurs invalide (3 lieux sur 4 sont des comptes de démonstration alimentés par un jeu
  // Kaggle, et elle confondait cannibalisation et entraînement — cf docs/competition-split-spec.md).
  //
  // Ces cartes restent affichées, SANS pastille € : elles sont décidables par l'urgence, pas par
  // l'argent. Rouvrir le sujet suppose (1) plusieurs comptes réels avec ventes + concurrents suivis,
  // (2) une normalisation d'event_type (146 valeurs libres pour 496 lignes aujourd'hui),
  // (3) la scission secteur/audience de competition-split-spec.md. Voir docs/card-truth-audit.md.
};

// Cartes dont le CONTENU dépend du périmètre de clientèle déclaré (client_catchment) — donc les
// seules qui peuvent porter la question de l'étage 4. Recensement mécanique du 31/07 sur
// fct_location_daily_action_candidates : ce sont les deux seuls action_type dont le texte et le
// payload utilisent un rayon LOCAL (500 m / 1 km). Tout le reste du parc est à 5 / 10 / 50 km,
// rayons que le périmètre ne remplace pas.
const CATCHMENT_DEPENDENT_TYPES = new Set(["competition_proximity", "high_competition_density"]);

// Cartes calendrier : classe résolue par la DATE affectée (vacances d'abord, férié sinon).
// 22/08 — VIDE, et c'est délibéré. Cette branche donne le COIN à une carte depuis la classe
// calendrier de sa date. Or les classes calendrier (school_holiday, public_holiday) portent
// DÉJÀ leur propre carte structurelle : tout type placé ici affiche donc, au coin, le montant
// d'une autre carte. Constaté trois fois le 22/08 — sur low_competition_window et
// weekend_vacation_low_comp (corrigées), puis recréé par mon câblage de commercial_event_match.
// Ses deux occupants historiques sont passés en CONTEXTE. Ne rien remettre ici sans avoir
// vérifié qu'aucune carte structurelle ne porte la même classe.
const CALENDAR_TYPES = new Set<string>([]);

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
  } else if (CARD_VALUE_TYPES.has(actionType)) {
    // Doctrine 01/08 (remplace l'héritage « Motif de fond » du 26/07 COMME ENJEU) : le coin
    // d'une carte d'anomalie/conjonction = SA population de tirs, jamais une classe
    // environnementale. L'héritage du motif du jour vit désormais dans
    // motifContextForCandidate (ligne de contexte). Pas de population passant les portes ->
    // null, et le client rend le mode « € ce jour » (amendement 6).
    // 23/08 — cartes de faits : la population dépend du SENS du tir (direction du payload).
    const byDir = CARD_POPULATION_BY_DIRECTION[actionType];
    if (byDir) {
      // monitor.ts passe la ligne du mart : data_payload y est encore une chaîne JSON.
      let dp: any = candidate?.data_payload;
      if (typeof dp === "string") { try { dp = JSON.parse(dp); } catch { dp = null; } }
      const dir = String(dp?.direction || (Number(dp?.delta_eur ?? 0) < 0 ? "collapse" : "surge"));
      const popKey = dir === "collapse" ? byDir.miss : byDir.carry;
      return result.impacts.get(popKey) ?? null;
    }
    const pop = CARD_POPULATION[actionType];
    return pop ? (result.impacts.get(pop) ?? null) : null;
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

/**
 * La carte affirme-t-elle une CLASSE que ce site n'a jamais pu mesurer ? (23/08, arbitrage owner)
 *
 * Distinct de `immaterial`, déjà filtré depuis le 29/07 : là on SAIT et ça ne pèse rien ; ici on
 * ne sait pas. L'audit de vérité du 22/08 a montré que la majorité des tirs adossés à une classe
 * reposaient sur des classes qui ne passent les portes sur AUCUN site.
 *
 * DEUX EXEMPTIONS, toutes deux voulues :
 *  1. `no_history` — le site n'a aucune vente, donc aucune classe mesurable. Consigne owner :
 *     laisser ces sites en l'état. Le prédicat ne les vise pas (reason_fr y vaut no_history).
 *  2. Les cartes dont la classe se résout PAR DATE (`weather@date`) : une alerte météo vaut par
 *     sa PRÉVISION, pas par son prix. Mesuré le 23/08 : sans cette exemption le filtre retirait
 *     21 tirs sur 52, dont weather_hazard_onset (13) et extended_bad_weather_3d — supprimer une
 *     alerte orage parce que la classe « vent » n'est pas chiffrable sur ce site serait une perte
 *     sèche pour l'exploitant.
 */
export function classNeverMeasured(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): boolean {
  const at = String(candidate?.action_type || "").trim();
  if (at === "weather_hazard_onset" || DATE_RESOLVED_WEATHER_TYPES.has(at)) return false;
  // 3. 23/08 soir — competition_proximity porte un FAIT (7 événements à 500 m, le plus proche
  //    NOMMÉ à 159 m, livré le 23/08), pas une affirmation sur sa classe events_high. Le filtre
  //    la retirait de Muse Square (events_high non mesurable) : l'événement nommé devenait
  //    invisible sur le compte de référence. Même logique que la météo. same_bucket_saturation
  //    (un % du même comptage, sans fait nommé — bruit selon l'audit de vérité) reste filtrée.
  if (at === "competition_proximity") return false;
  // 4. 25/08 — MÊME LOGIQUE, quatre cartes de plus. En leur donnant une classe (pour débloquer
  //    le coin funnel), ce filtre s'est mis à les SUPPRIMER quand la classe n'est pas mesurable
  //    sur le site : mesuré sur le compte owner, 10 cartes présentes avant le rattachement,
  //    ZÉRO après. Or elles portent toutes un FAIT NOMMÉ — « Guimet lance « Silla » à 2,4 km »,
  //    « Royaume-Uni 14 %, Allemagne 10 % … (INSEE 2025) » — et non une affirmation sur leur
  //    classe. Le fait reste vrai que la classe soit mesurable ou non ; seul le COIN dépend de
  //    la mesure, et il reste vide si les portes ne passent pas.
  if (at === "competitor_event_launch" || at === "competitor_event_ending"
      || at === "mega_event_end" || at === "foreign_tourism_signal") return false;
  const combo = COMBO_TYPE_CLASSES[at];
  if (combo && combo.includes("weather@date")) return false;
  return enjeuWithReasonForCandidate(result, candidate).reason_fr === ABSENCE_REASON_FR.not_separable;
}

/** enjeu + raison d'absence : LA façade que les endpoints consomment (monitor, futurs). */
export function enjeuWithReasonForCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): { enjeu: DayClassImpact | null; reason_fr: string | null; immaterial?: boolean; needs_catchment?: boolean; context_motif?: DayClassImpact | null; corner_day_mode?: boolean; funnel_corner?: FunnelCorner | null } {
  const enjeu = enjeuForCandidate(result, candidate);
  // Doctrine 01/08 : le motif du jour est du CONTEXTE (ligne de texte), servi À CÔTÉ de
  // l'enjeu propre — jamais à sa place.
  const atV = String(candidate?.action_type || "");
  const contextMotif = CARD_VALUE_TYPES.has(atV) ? motifContextForCandidate(result, candidate) : null;
  if (enjeu) return { enjeu, reason_fr: null, context_motif: contextMotif };
  // 24/08 — barreau 2 : sans enjeu €, le coin peut porter le chiffre funnel mesuré de la carte.
  // Le client garde l'échelle : € du jour d'abord (corner_day_mode avec payload €), funnel ensuite.
  const funnelCorner = funnelCornerForCandidate(result, candidate);
  // MATÉRIALITÉ (29/07) : la classe de cette carte a bien été MESURÉE, et elle est négligeable.
  // Ce n'est pas « on ne sait pas » — c'est « on sait, et ça ne pèse rien ». La carte ne doit donc
  // pas s'afficher du tout (décision owner : « ni carte ni chantier »), et surtout pas avec le
  // motif « non séparable ou insuffisant », qui accuse l'historique à tort.
  const imm = (result as any)?.immaterial as Set<string> | undefined;
  if (imm && imm.size) {
    const at = String(candidate?.action_type || "");
    const mappedKey = CARD_TYPE_CLASS[at];
    if (mappedKey && imm.has(mappedKey)) return { enjeu: null, reason_fr: null, immaterial: true };
  }
  const actionType = String(candidate?.action_type || "");
  // ÉTAGE 4 — la question du périmètre de clientèle (docs/perimetre-client-spec.md).
  //
  // CORRIGÉ le 31/07. La première version dérivait « carte concernée » de
  // CARD_TYPE_CLASS[type] === 'events_high'. C'ÉTAIT FAUX : ce mapping décrit la classe d'ENJEU,
  // pas le CONTENU de la carte. Il attrapait same_bucket_saturation, dont le texte et le payload
  // sont entièrement à 5 km (« Plus de 25% des evenements a 5km sont dans votre secteur »,
  // { pct_same_sector, events_5km, pressure_ratio }) — un rayon que le périmètre déclaré ne change
  // PAS, et qui est hors périmètre par décision owner (scission même-secteur,
  // docs/competition-split-spec.md). On aurait posé la question sur une carte qu'elle ne débloque
  // pas : la faute même corrigée le matin du 31/07 sur les 7 cartes concurrent.
  //
  // La liste est donc EXPLICITE, et issue d'un recensement mécanique du mart : sur les 54 blocs
  // to_json_string de fct_location_daily_action_candidates, DEUX seulement utilisent un rayon local
  // (500 m / 1 km) — les seuls que le périmètre remplace. Vérifié en base après reconstruction :
  // competition_proximity 36/36 et high_competition_density 4/4 portent events_catchment,
  // same_bucket_saturation 0/28.
  //
  // Une liste nommée est moins élégante qu'une dérivation, mais elle ne ment pas. Ajouter un type
  // ici suppose de vérifier d'abord que SON CONTENU lit les colonnes events_within_catchment_*.
  //
  // Le drapeau n'accompagne QUE les retours sans enjeu : si le montant est déjà chiffré, la question
  // n'a plus d'objet. Il ne sort pas non plus sur une carte écartée pour matérialité (carte masquée).
  const needsCatchment = result?.clientCatchment == null && CATCHMENT_DEPENDENT_TYPES.has(actionType);
  // Amendement 6 (01/08) : plus de raison « anomalie ponctuelle » — le coin passe en mode
  // « € ce jour » (écart du payload, unité en toutes lettres), bascule €/an à n >= 5 tirs.
  if (CARD_VALUE_TYPES.has(actionType)) return { enjeu: null, reason_fr: null, context_motif: contextMotif, corner_day_mode: true, funnel_corner: funnelCorner };
  const mapped = actionType === "weather_hazard_onset" || DATE_RESOLVED_WEATHER_TYPES.has(actionType)
    || CALENDAR_TYPES.has(actionType) || Boolean(COMBO_TYPE_CLASSES[actionType]) || Boolean(CARD_TYPE_CLASS[actionType]);
  if (!mapped) return { enjeu: null, reason_fr: null, funnel_corner: funnelCorner };
  if (result.impacts.size === 0) return { enjeu: null, reason_fr: ABSENCE_REASON_FR.no_history, needs_catchment: needsCatchment };
  return { enjeu: null, reason_fr: ABSENCE_REASON_FR.not_separable, needs_catchment: needsCatchment, funnel_corner: funnelCorner };
}

// Cartes d'anomalie ventes (mapping H1 — jamais de pill PROPRE, héritage du jour uniquement).
const MOTIF_INHERIT_TYPES = new Set([
  "sales_surge",
  "sales_revenue_down_wow",
  "sales_missed_opportunity",
  // 22/08 — top_day_approaching et perfect_storm rejoignent weekend_opportunity : toutes trois
  // DÉSIGNENT UNE JOURNÉE sans rien mesurer elles-mêmes. top_day_approaching pointe un jour à
  // venir, perfect_storm une conjonction de facteurs — le motif mesuré de CETTE date est leur
  // contexte. Aucun coin nouveau : CARD_POPULATION n'a pas d'entrée pour elles, donc l'enjeu
  // reste null et seul `context_motif` est servi (doctrine 01/08 : le motif du jour est une
  // ligne de texte, jamais le coin).
  "top_day_approaching",
  "perfect_storm",
  // 22/08 — commercial_event_match est passée par CALENDAR_TYPES avant d'atterrir ici :
  // ce jeu-là donne le COIN, et la carte a aussitôt affiché −19 126 €/an — exactement le
  // montant de la carte structurelle « vacances scolaires » (vérifié au rendu sur 3 comptes).
  // C'est le doublon de coin corrigé deux fois aujourd'hui, recréé par mon propre câblage.
  // Sa place est ici : le calendrier de la date est son CONTEXTE, pas son enjeu.
  "commercial_event_match",
  // 22/08 — les deux derniers occupants de CALENDAR_TYPES, déplacés pour le même motif :
  // le coin qu'elles affichaient était celui de la carte structurelle « vacances scolaires »
  // ou « jours fériés ». Défaut préexistant, relevé en câblant leurs voisines.
  "audience_shift_opportunity",
  "calendar_audience_shift",
  // 21/08 — weekend_opportunity entre ici, et l'ensemble perd son préfixe SALES_ qui l'aurait
  // interdite. Motif : la carte affirmait « Conditions favorables » en chaîne CONSTANTE, puis
  // accolait météo et densité d'événements sans jamais les évaluer — « conditions favorables
  // — averses » était rendu tel quel. Rattachée ici, elle hérite du motif MESURÉ de la date
  // (weather@date / calendar@date) en ligne de CONTEXTE, jamais au coin (doctrine 01/08) :
  // chez f10c3e58 la pluie vaut −166 €/j sur 20 jours, t = −3,4, et l'effet varie de 1 à 8
  // selon le site (−165 à −1 318 €/j) — un seuil binaire « alerte ≥ 2 » aurait été plus
  // grossier que la mesure disponible.
  "weekend_opportunity",
]);

// Doctrine valeur d'action (01/08, GO owner) : le coin d'une carte d'anomalie/conjonction = SA
// population de tirs (famille 'card' du store), JAMAIS une classe environnementale. Le motif
// hérité (weather@date/calendar@date) devient du CONTEXTE (context_motif, ligne de texte).
// sales_missed_opportunity n'a pas encore sa population (sa condition inclut le score — TODO
// documenté) : coin en mode « € ce jour » en attendant.
const CARD_POPULATION: Record<string, string> = {
  sales_revenue_down_wow: "pop_revenue_down",
  sales_surge: "pop_revenue_surge",
  // sales_underperformance : RETIRÉE le 23/08 (arbitrage tranché par la mesure). Sa règle à seuil
  // fixe (CA < 70 % de la moyenne 30 j) tirait 128 j / 217 chez Les Olivades — invisibles, la
  // porte de régime hebdo les supprimait — et, sur les sites quotidiens, posait la même question
  // que sales_revenue_down_wow avec une autre règle (1 commun sur 6 chez Occitanie). Une
  // question, une carte : down_wow (résidu jour de semaine + tendance, levier, motif, population B).
  sales_traffic_not_converting: "pop_traffic_not_conv",
};

// 23/08 — cartes de faits : population par SENS (heure/produit/famille qui manque ou porte).
const CARD_POPULATION_BY_DIRECTION: Record<string, { miss: string; carry: string }> = {
  hour_share_move:    { miss: "pop_hour_miss",   carry: "pop_hour_carry" },
  item_share_move:    { miss: "pop_item_miss",   carry: "pop_item_carry" },
  offering_mix_shift: { miss: "pop_family_miss", carry: "pop_family_carry" },
};

// Contexte environnemental cité par la carte (ligne de texte, jamais le coin).
const CARD_CONTEXT_CLASS: Record<string, string> = {
  sales_traffic_not_converting: "traffic_high",
  sales_competition_cannibalization: "competition_high",
  // 22/08 — low_competition_window RETIRÉE de CARD_TYPE_CLASS, même remède que les deux
  // ci-dessus. Constaté à l'écran par l'owner : la carte du jour « Moins d'activité que
  // d'habitude dans votre périmètre » et le chantier structurel « Les jours à faible pression
  // concurrentielle » affichaient LE MÊME montant — −4 757 €/an chez MS Test, +6 381 €/an chez
  // Muse Square Occitanie. Les deux lisaient la classe `competition_low`. La doctrine du 01/08
  // l'interdit : le coin est l'impact PROPRE à la carte. Le chantier garde le coin, la carte du
  // jour cite la classe en ligne de contexte.
  low_competition_window: "competition_low",
  // 22/08 — weekend_vacation_low_comp retirée de CARD_TYPE_CLASS pour le MÊME motif que
  // sa voisine : elle affichait −5 185 €/an chez MS Test, exactement le montant du chantier
  // structurel « Les jours à faible pression concurrentielle » juste en dessous. Même
  // classe lue deux fois, doctrine du coin violée.
  weekend_vacation_low_comp: "competition_low",
};

// Types dont le coin est régi par la doctrine population/jour (B + C).
const CARD_VALUE_TYPES = new Set([
  ...MOTIF_INHERIT_TYPES,
  "sales_traffic_not_converting",
  "sales_competition_cannibalization",
  // 23/08 — cartes de FAITS chiffrées en euros (owner : bascule part -> euros). Sans population
  // passante (pas encore en CARD_POPULATION) : coin « ce jour » via corner_day_mode, lu sur
  // delta_eur du payload ; la population B (€/an au rythme constaté) est l'étape suivante.
  "hour_share_move",
  "item_share_move",
  "offering_mix_shift",
  // 22/08 — low_competition_window entre ici APRÈS sa sortie de CARD_TYPE_CLASS. Cet ensemble
  // commande DEUX choses : le coin passe par CARD_POPULATION (aucune entrée pour ce type ⇒
  // null, coin absent, doublon avec le chantier structurel réglé) ET le calcul de
  // `context_motif` (enjeuWithReasonForCandidate le conditionne à cet ensemble). Sans cette
  // ligne la carte perdait sa DIRECTION : elle disait « on ne sait pas encore si elles vous
  // rapportent plus ou moins » alors que `competition_low` est mesurée sur le lieu.
  "low_competition_window",
  "weekend_vacation_low_comp",
]);

/** Motif de CONTEXTE d'une carte (doctrine 01/08) — l'ex-« Motif de fond » hérité, désormais
 *  une ligne de texte : la classe la plus lourde parmi météo/calendrier de la date affectée,
 *  ou la classe environnementale citée par la carte (CARD_CONTEXT_CLASS). Jamais le coin. */
export function motifContextForCandidate(result: DayClassResult, candidate: { action_type?: any; date?: any; data_payload?: any }): DayClassImpact | null {
  const actionType = String(candidate?.action_type || "");
  const ctxKey = CARD_CONTEXT_CLASS[actionType];
  if (ctxKey) return result.impacts.get(ctxKey) ?? null;
  if (!MOTIF_INHERIT_TYPES.has(actionType)) return null;
  const iso = String(candidate?.date?.value ?? candidate?.date ?? "").slice(0, 10);
  let best: DayClassImpact | null = null;
  for (const token of ["weather@date", "calendar@date"]) {
    const key = resolveClassToken(token, result, iso);
    const imp = key ? (result.impacts.get(key) ?? null) : null;
    if (imp && (!best || Math.abs(imp.eur_year) > Math.abs(best.eur_year))) best = imp;
  }
  return best ? { ...best, inherited: true } : null;
}

// ── Barreau 2 du coin (owner 24/08 : « si un chiffre en € ne fonctionne pas, utiliser un autre
// chiffre, lié à l'étape du funnel ») ────────────────────────────────────────────────────────
// Quand une carte n'a ni enjeu €/an ni € du jour, son coin porte le chiffre MESURÉ de son étape
// funnel (CARD_FUNNEL_STEP, kpiRegistry — table validée owner) sur SA classe : % relatif au coin
// (exp(avg_log)−1, le log-ratio du moteur), absolu en infobulle (avg_gap_eur, unités du KPI —
// visiteurs, tickets, points de taux : base 'marginal' = contraste vs jours comparables).
// GARDE-FOUS : la classe est celle de la CARTE (CARD_TYPE_CLASS/CARD_CONTEXT_CLASS statiques),
// jamais un motif hérité de la date — sinon la rentrée porterait le chiffre des vacances
// (le doublon de coin corrigé trois fois le 22/08). Portes du moteur : n>=5, span>=60, |t|>=1
// sur le log, cohérence de signe médiane/log. Plancher d'affichage |%| >= 5 : un « −1 % » au
// coin serait du bruit présenté comme un fait (calibrage à confirmer par l'owner).
export type FunnelCorner = {
  kpi: string;            // clé KPI (kpiRegistry) — jamais 'revenue_residual' (barreaux € existants)
  pct: number;            // ratio signé (−0,30 = −30 %) — exp(avg_log)−1
  abs_per_day: number;    // contraste absolu par jour, unités du KPI (visiteurs, tickets, €, taux 0-1)
  n_days: number;
  class_key: string;
  class_label_fr: string;
};
// Cartes dont la classe se résout à la DATE plutôt qu'en table statique (owner 25/08).
// Une seule pour l'instant : calendar_audience_shift, qui tire indifféremment sur un jour férié
// ou un jour de vacances scolaires.
const CARD_DATE_CALENDAR_TYPES = new Set<string>(["calendar_audience_shift"]);

export function funnelCornerForCandidate(result: DayClassResult, candidate: { action_type?: any }): FunnelCorner | null {
  const at = String(candidate?.action_type || "");
  const step = CARD_FUNNEL_STEP[at];
  if (!step || step === "revenue_residual") return null;
  // CLASSE RÉSOLUE PAR CARTE quand une classe statique se tromperait (owner 25/08).
  // calendar_audience_shift tire sur `is_public_holiday_flag OU is_school_holiday_flag` : une
  // entrée statique désignerait la mauvaise classe une fois sur deux — c'est pourquoi elle
  // était restée SANS classe, donc sans coin. Le registre porte déjà le résolveur qu'il faut,
  // `resolveClassToken('calendar@date')`, qui lit le CALENDRIER MESURÉ de la date de la carte
  // (calendarByDate) : vacances scolaires -> school_holiday, sinon férié -> public_holiday,
  // sinon rien. On lit donc la date de CETTE carte, jamais un motif hérité d'ailleurs — le
  // garde-fou du 22/08 (« sinon la rentrée porterait le chiffre des vacances ») tient : ici la
  // classe VIENT de la date qui a fait tirer la carte.
  // Portée volontairement limitée au COIN : l'enjeu de ces cartes n'est pas touché, donc
  // classNeverMeasured ne peut pas se mettre à les supprimer (régression mesurée le 25/08 sur
  // les quatre cartes d'événement — 10 cartes présentes avant, zéro après).
  const iso = String((candidate as any)?.date?.value ?? (candidate as any)?.date ?? "").slice(0, 10);
  const cls = CARD_DATE_CALENDAR_TYPES.has(at)
    ? resolveClassToken("calendar@date", result, iso)
    : (CARD_TYPE_CLASS[at] ?? CARD_CONTEXT_CLASS[at]);
  if (!cls || !CLASS_LABELS[cls]) return null;
  const rows = result?.funnelRows;
  if (!Array.isArray(rows) || !rows.length) return null;
  const evalMetric = (metric: string): FunnelCorner | null => {
    const row = rows.find((r: any) => String(r?.class_key ?? "") === cls && String(r?.metric ?? "") === metric && String(r?.basis ?? "") === "marginal");
    if (!row) return null;
    const n = Number(row?.n_days ?? 0);
    const spanDays = Number(row?.span_days ?? 0);
    const avg = Number(row?.avg_gap_eur ?? NaN);
    const med = Number(row?.med_gap_eur ?? NaN);
    const nLog = Number(row?.n_log ?? 0);
    const avgLog = Number(row?.avg_log ?? NaN);
    const sdLog = Number(row?.sd_log ?? NaN);
    if (n < 5 || spanDays < 60 || nLog < 5 || !Number.isFinite(avgLog) || !Number.isFinite(sdLog) || !Number.isFinite(avg)) return null;
    const t = sdLog > 0 ? Math.abs(avgLog) / (sdLog / Math.sqrt(nLog)) : 0;
    if (t < 1) return null;
    if (!Number.isFinite(med) || med === 0 || Math.sign(med) !== Math.sign(avgLog)) return null;
    const pct = Math.exp(avgLog) - 1;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) return null;
    return { kpi: metric, pct, abs_per_day: avg, n_days: n, class_key: cls, class_label_fr: CLASS_LABELS[cls] };
  };
  // Repli d'une étape (owner 24/08, GO) : étape déclarée d'abord ; une carte VISITEURS dont le
  // site n'a pas de mesure visiteurs sur sa classe replie sur VENTES (l'autre étape de volume,
  // mesurée presque partout) — jamais déguisé : `kpi` porte l'étape réellement mesurée et le
  // libellé du coin dit son mot. Les cartes panier/conversion gardent leur étape stricte.
  return evalMetric(step) ?? (step === "footfall" ? evalMetric("transactions") : null);
}

// ── Paragraphe de faits des cartes STRUCTURELLES (owner 25/08, point 5) ─────────────────────
// « Ce qu'on montre, ce sont les signaux eux-mêmes et leur impact business concret et mesuré. »
// La décomposition funnel du motif : les métriques marginales de SA classe, mêmes portes que le
// coin (n>=5, span>=60, |t|>=1 sur le log, cohérence de signe médiane/log, |%| >= 5), PLUS une
// porte de COHÉRENCE DE RÉFÉRENTIEL : revenue_residual marginal contraste des RÉSIDUS
// (vs attendu dow+trend) quand les autres KPI contrastent des valeurs BRUTES vs jours
// comparables — les deux ne se composent pas. Mesuré sur le compte owner (25/08) :
// school_holiday y est à la fois −193 €/j de résidu ET +6 % de ventes brutes. Afficher les
// deux côte à côte lirait comme une contradiction ; la ligne ne sort donc que si CHAQUE
// métrique retenue pointe dans le sens de l'impact € — sinon absence honnête (le paragraphe
// de faits garde l'écart €/j, posé par structuralCardCopyFr).
// Vocabulaire : celui du funnel du créneau, déjà rendu en prod (« Le gain vient des ventes
// (95 contre 36 attendues) », action-cards.js) — « Le manque/Le gain vient de… ».
const STRUCT_FUNNEL_DE: Record<string, string> = {
  footfall: "des visiteurs", transactions: "des ventes", basket: "du panier", conversion: "du taux de conversion",
};
export function structuralFunnelLineFr(rows: any[], class_key: string, eur_year: number): string | null {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(eur_year) || eur_year === 0) return null;
  const impactSign = Math.sign(eur_year);
  const parts: { de: string; pct: number }[] = [];
  for (const metric of Object.keys(STRUCT_FUNNEL_DE)) {
    const row = rows.find((r: any) => String(r?.class_key ?? "") === class_key && String(r?.metric ?? "") === metric && String(r?.basis ?? "") === "marginal");
    if (!row) continue;
    const n = Number(row?.n_days ?? 0);
    const spanDays = Number(row?.span_days ?? 0);
    const med = Number(row?.med_gap_eur ?? NaN);
    const nLog = Number(row?.n_log ?? 0);
    const avgLog = Number(row?.avg_log ?? NaN);
    const sdLog = Number(row?.sd_log ?? NaN);
    if (n < 5 || spanDays < 60 || nLog < 5 || !Number.isFinite(avgLog) || !Number.isFinite(sdLog)) continue;
    const t = sdLog > 0 ? Math.abs(avgLog) / (sdLog / Math.sqrt(nLog)) : 0;
    if (t < 1) continue;
    if (!Number.isFinite(med) || med === 0 || Math.sign(med) !== Math.sign(avgLog)) continue;
    const pct = Math.exp(avgLog) - 1;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.05) continue;
    // Porte de cohérence : une métrique à contre-sens de l'impact € tue TOUTE la ligne (mélange
    // de référentiels — voir l'en-tête), pas seulement elle-même.
    if (Math.sign(pct) !== impactSign) return null;
    parts.push({ de: STRUCT_FUNNEL_DE[metric], pct });
  }
  if (!parts.length) return null;
  parts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const kept = parts.slice(0, 2);
  const fmt = (p: number) => `${p > 0 ? "+" : "−"}${Math.abs(Math.round(p * 100))} %`;
  return `${impactSign < 0 ? "Le manque vient" : "Le gain vient"} ${kept.map((x) => `${x.de} (${fmt(x.pct)})`).join(" et ")} vs vos jours comparables.`;
}
