// Provider « dossier d'événement » (spec docs/evenement-dossier-spec.md § 2, protos v2.1/v3).
// UN provider pour les trois états du dossier — Décider (candidats côte à côte), Avant (les
// 5 questions du jour), Après (KPI + série) — la même matière aux trois moments, densité
// différente. Réutilisé par la page /evenement, le rapport et le chat (facts).
//
// Discipline de vérité :
//  - les 5 questions sont bâties sur des colonnes VÉRIFIÉES du day_surface (03/08) :
//    audience_availability_label (clients), delta_att_mobility_pct (clients) vs
//    delta_ops_mobility_car_pct (route → FOURNISSEURS), events_within_* (+ same_bucket),
//    lvl_* × event_nature, competition_pressure_ratio — seuils mobilité REPRIS du legacy
//    (days.astro renderComparisonTable : >=0 fluide, >=-4 perturbé, sinon fortement perturbé) ;
//  - une date sans ligne de surface = HORS HORIZON (J+n), jamais prédite ;
//  - l'objectif porte sur l'APPORT PROPRE (doctrine du coin) : attendu par jour de semaine =
//    AVG(expected_revenue) 90 j (le même référentiel que M'engager) ;
//  - l'Après lit le mesuré (residual + signals + famille) et le verdict de l'ENGAGEMENT ancré
//    (saved_item_id) — jamais un verdict recalculé ici.
import { eventTypeLabelFr } from "../eventTypes";
// K9 (24/08) : profit estimé journalier — marges déclarées lues au moment de la mesure.
import { profitEstimatedDaily, measureProfitEstimatedStats } from "../kpiRegistry";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const ymdToday = () => new Date().toISOString().slice(0, 10);
const dowOf = (ymd: string) => new Date(ymd + "T00:00:00Z").getUTCDay();

export interface EvenementQuestion { key: string; fact_fr: string; tone: "ok" | "warn" | "bad" | "info"; action_fr?: string; href?: string; link_fr?: string }
export interface EvenementDay {
  date: string; dow_fr: string; present: boolean; horizon_days: number | null;
  score: number | null; weather_label_fr: string | null;
  questions: EvenementQuestion[];
  objectif: { expected_eur: number | null; apport_eur: number | null; total_eur: number | null } | null;
}

export interface EvenementFamilyResult {
  facts: Array<{ fact_fr: string; claim_type: "observed" | "measured" }>;
  data: Record<string, unknown>;
}

// ── Liste des événements de l'utilisateur (incrément 6 — le chat) : titre, type, prochaine
// occurrence, dernière occurrence MESURÉE (écart € residual — jamais recalculé), n occurrences.
// Sert la branche déterministe « mes événements » de prompt.ts et buildEventFacts (liste blanche
// des réponses jour). Résiliente : échec → [].
export interface UserEvenementRow {
  saved_item_id: string; title: string; type_label_fr: string; recurring: boolean;
  n_occurrences: number; next_date: string | null;
  dates: string[];   // les occurrences datées (plan de période, 27/08 — additive)
  last_measured: { date: string; revenue: number; expected: number; gap_eur: number } | null;
}
// clerk_user_id NULL = lecture SITE entière (loi owner 27/08 : un suivi appartient à un site,
// jamais à un user seul — le résolveur d'entités lit le site ; les vues « mes événements »
// gardent leur filtre user en passant l'id).
export async function listUserEvenements(bq: any, location_id: string, clerk_user_id: string | null, limit = 6): Promise<UserEvenementRow[]> {
  try {
    const today = ymdToday();
    const [rows] = await bq.query({
      query: `SELECT si.saved_item_id, si.title, si.event_type, si.recurrence,
                     ARRAY_AGG(CAST(d.date AS STRING) ORDER BY d.date) AS dates
              FROM \`${PROJECT}.raw.saved_items\` si
              JOIN \`${PROJECT}.raw.saved_item_dates\` d
                ON d.saved_item_id = si.saved_item_id AND d.location_id = si.location_id
              WHERE si.location_id = @location_id
                AND (@clerk_user_id IS NULL OR si.clerk_user_id = @clerk_user_id)
              GROUP BY 1, 2, 3, 4
              LIMIT ${Math.max(1, Math.min(limit, 12))}`,
      params: { location_id, clerk_user_id: clerk_user_id || null },
      types: { location_id: "STRING", clerk_user_id: "STRING" }, location: "EU",
    });
    if (!rows?.length) return [];
    const evs = (rows as any[]).map((r) => ({
      saved_item_id: String(flat(r.saved_item_id)),
      title: String(flat(r.title) ?? ""),
      type_label_fr: eventTypeLabelFr(flat(r.event_type) as any),
      recurring: String(flat(r.recurrence) ?? "none") !== "none",
      dates: ((r.dates ?? []) as any[]).map((d) => String(flat(d))),
    }));
    // Dernière occurrence PASSÉE de chaque événement → une lecture residual, jointure en JS
    // (le motif éprouvé du provider — jamais de sous-requête corrélée fragile).
    const pastDates = [...new Set(evs.flatMap((e) => e.dates.filter((d) => d < today)))];
    let resBy = new Map<string, any>();
    if (pastDates.length) {
      const [resRows] = await bq.query({
        query: `SELECT CAST(date AS STRING) AS d, ROUND(daily_revenue, 0) AS rev, ROUND(expected_revenue, 0) AS exp
                FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
                WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
        params: { location_id, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
      });
      resBy = new Map((resRows as any[]).map((r) => [String(flat(r.d)), r]));
    }
    return evs.map((e) => {
      const lastMeasuredDate = [...e.dates].reverse().find((d) => d < today && resBy.has(d)) ?? null;
      const re: any = lastMeasuredDate ? resBy.get(lastMeasuredDate) : null;
      return {
        saved_item_id: e.saved_item_id,
        title: e.title,
        type_label_fr: e.type_label_fr,
        recurring: e.recurring,
        n_occurrences: e.dates.length,
        dates: e.dates,
        next_date: e.dates.find((d) => d >= today) ?? null,
        last_measured: re ? { date: lastMeasuredDate as string, revenue: Number(flat(re.rev)), expected: Number(flat(re.exp)), gap_eur: Number(flat(re.rev)) - Number(flat(re.exp)) } : null,
      };
    });
  } catch (e) {
    console.warn("[evenement] listUserEvenements skipped:", e);
    return [];
  }
}

export async function evenementFamily(bq: any, location_id: string, saved_item_id: string): Promise<EvenementFamilyResult> {
  // ── 1. L'événement + ses dates (2 lectures, une passe) ──
  const [[itemRows], [dateRows]] = await Promise.all([
    bq.query({
      query: `SELECT saved_item_id, title, description, event_type, event_nature, hour_start, hour_end, duration_days,
                     author_person_name, kpi, kpi_family, kpi_target_pct, kpi_target_eur,
                     recurrence, recurrence_dow, CAST(decision_date AS STRING) AS decision_date,
                     CAST(selected_date AS STRING) AS selected_date, CAST(event_end_date AS STRING) AS event_end_date,
                     consigne_arrival, consigne_store_info, consigne_interactions, consigne_deroule, consigne_send_offset, consigne_enabled
              FROM \`${PROJECT}.raw.saved_items\`
              WHERE saved_item_id = @saved_item_id AND location_id = @location_id LIMIT 1`,
      params: { saved_item_id, location_id }, location: "EU",
    }),
    bq.query({
      query: `SELECT CAST(date AS STRING) AS d FROM \`${PROJECT}.raw.saved_item_dates\`
              WHERE saved_item_id = @saved_item_id AND location_id = @location_id ORDER BY date`,
      params: { saved_item_id, location_id }, location: "EU",
    }),
  ]);
  if (!itemRows?.length) return { facts: [], data: { found: false, reason: "Événement introuvable sur ce lieu." } };
  const r0: any = itemRows[0];
  const item = {
    saved_item_id, title: String(flat(r0.title) ?? ""), dispositif: flat(r0.description) != null ? String(flat(r0.description)) : null,
    event_type: flat(r0.event_type) != null ? String(flat(r0.event_type)) : null,
    event_type_label_fr: eventTypeLabelFr(flat(r0.event_type) as any),
    event_nature: flat(r0.event_nature) != null ? String(flat(r0.event_nature)) : null,
    hour_start: flat(r0.hour_start) != null ? Number(flat(r0.hour_start)) : null,
    duration_days: flat(r0.duration_days) != null ? Number(flat(r0.duration_days)) : null,
    hour_end: flat(r0.hour_end) != null ? Number(flat(r0.hour_end)) : null,
    author_person_name: flat(r0.author_person_name) != null ? String(flat(r0.author_person_name)) : null,
    kpi: flat(r0.kpi) != null ? String(flat(r0.kpi)) : "revenue_residual",
    kpi_family: flat(r0.kpi_family) != null ? String(flat(r0.kpi_family)) : null,
    kpi_target_pct: flat(r0.kpi_target_pct) != null ? Number(flat(r0.kpi_target_pct)) : null,
    kpi_target_eur: flat(r0.kpi_target_eur) != null ? Number(flat(r0.kpi_target_eur)) : null,
    recurrence: flat(r0.recurrence) != null ? String(flat(r0.recurrence)) : "none",
    recurrence_dow: flat(r0.recurrence_dow) != null ? Number(flat(r0.recurrence_dow)) : null,
    decision_date: flat(r0.decision_date) != null ? String(flat(r0.decision_date)) : null,
    selected_date: flat(r0.selected_date) != null ? String(flat(r0.selected_date)) : null,
    event_end_date: flat(r0.event_end_date) != null ? String(flat(r0.event_end_date)) : null,
    dates: (dateRows as any[]).map((d) => String(flat(d.d))),
    // Consigne d'opération (automatisation inc. 3) — l'état réel, jamais un défaut affiché comme choisi.
    consigne_arrival: flat(r0.consigne_arrival) != null ? String(flat(r0.consigne_arrival)) : null,
    consigne_store_info: flat(r0.consigne_store_info) != null ? String(flat(r0.consigne_store_info)) : null,
    consigne_interactions: flat(r0.consigne_interactions) != null ? String(flat(r0.consigne_interactions)) : null,
    consigne_deroule: flat(r0.consigne_deroule) != null ? String(flat(r0.consigne_deroule)) : null,
    consigne_send_offset: flat(r0.consigne_send_offset) != null ? Number(flat(r0.consigne_send_offset)) : null,
    consigne_enabled: flat(r0.consigne_enabled) === true,
  };

  // ── 2. Étape du dossier + dates à analyser ──
  const today = ymdToday();
  const isRecurring = item.recurrence !== "none";
  // Un non-récurrent SANS selected_date : tant qu'il reste des dates candidates à venir on
  // décide ; toutes passées = plus rien à décider — les dates passées FONT l'événement.
  // (Bug réel 10/08 : « Lancement SaaS », seule date 19/06 passée + selected_date null →
  // coincé en « decider » à vie, le mesuré de l'état Après jamais rendu.)
  const pastDates = isRecurring ? item.dates.filter((d) => d < today)
    : item.selected_date ? (item.selected_date < today ? [item.selected_date] : [])
    : item.dates.filter((d) => d < today);
  const nextDate = isRecurring ? (item.dates.find((d) => d >= today) ?? null)
    : item.selected_date ? (item.selected_date >= today ? item.selected_date : null)
    : (item.dates.find((d) => d >= today) ?? null);
  const stage: "decider" | "avant" | "apres" =
    !isRecurring && !item.selected_date && item.dates.some((d) => d >= today) ? "decider"
    : pastDates.length ? "apres" : "avant";
  const futureDates = stage === "decider" ? item.dates.slice(0, 7) : (nextDate ? [nextDate] : []);

  // ── 3. Lot parallèle unique : surface des jours futurs + mesuré des jours passés +
  //       engagements ancrés + attendu par jour de semaine + moyenne famille ──
  const empty = Promise.resolve([[] as any[]]);
  const [[surfRows], [resRows], [sigRows], [famRows], [comRows], [dowRows], [famAvgRows], [sendRows], [mobRows], [forRows], [docRows], [dowSalesRows], [declaredRows], profitDailyRes, profitStatsRes] = await Promise.all([
    futureDates.length ? bq.query({
      query: `SELECT CAST(date AS STRING) AS d, opportunity_score_final_local AS opportunity_score, lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold,
                     weather_label_fr, holiday_name, vacation_name, audience_availability_label,
                     delta_att_mobility_pct, delta_ops_mobility_car_pct,
                     delta_att_calendar_pct, delta_att_weather_total_pct,
                     events_within_500m_count, events_within_5km_count, events_within_5km_same_bucket_count,
                     competition_pressure_ratio
              FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
              WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
      params: { location_id, dates: futureDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    pastDates.length ? bq.query({
      query: `SELECT CAST(date AS STRING) AS d, ROUND(daily_revenue, 0) AS rev, ROUND(expected_revenue, 0) AS exp, ROUND(residual_pct, 1) AS rpct
              FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
              WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
      params: { location_id, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    pastDates.length ? bq.query({
      query: `SELECT CAST(transaction_date AS STRING) AS d, daily_transactions, ROUND(transactions_baseline, 0) AS transactions_baseline, ROUND(transactions_delta_pct, 0) AS tdp,
                     ROUND(avg_basket, 2) AS basket, ROUND(basket_baseline, 2) AS basket_base, ROUND(basket_delta_pct, 0) AS bdp,
                     daily_visitors
              FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\`
              WHERE location_id = @location_id AND transaction_date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
      params: { location_id, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    (pastDates.length && item.kpi === "family_revenue" && item.kpi_family) ? bq.query({
      query: `SELECT CAST(transaction_date AS STRING) AS d, ROUND(SUM(revenue), 0) AS fam_rev
              FROM \`${PROJECT}.raw.client_transactions\`
              WHERE location_id = @location_id AND item_category = @fam
                AND transaction_date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))
              GROUP BY 1`,
      params: { location_id, fam: item.kpi_family, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    bq.query({
      query: `SELECT commitment_id, CAST(window_start AS STRING) AS ws, verdict, status, threshold_value, threshold_basis
              FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC, CASE WHEN status IN ('resolved', 'cancelled') THEN 1 ELSE 0 END DESC, (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                    FROM \`${PROJECT}.analytics.action_commitments\` WHERE saved_item_id = @saved_item_id)
              WHERE rn = 1`,
      params: { saved_item_id }, location: "EU",
    }),
    bq.query({
      query: `SELECT EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS expected_eur
              FROM \`${PROJECT}.semantic.vw_insight_event_day_residual\`
              WHERE location_id = @location_id AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) GROUP BY dw`,
      params: { location_id }, location: "EU",
    }),
    (item.kpi === "family_revenue" && item.kpi_family) ? bq.query({
      query: `WITH td AS (SELECT COUNT(DISTINCT transaction_date) AS n FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @location_id)
              SELECT ROUND(SUM(revenue) / (SELECT n FROM td), 0) AS avg_day
              FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @location_id AND item_category = @fam`,
      params: { location_id, fam: item.kpi_family }, location: "EU",
    }) : empty,
    // Trace d'envoi de la consigne (zéro dummy : « Envoyée le … à N » = fait en base).
    bq.query({
      query: `SELECT CAST(occurrence_date AS STRING) AS d, CAST(DATE(sent_at) AS STRING) AS sent_on, n_recipients
              FROM \`${PROJECT}.analytics.consigne_sends\`
              WHERE saved_item_id = @saved_item_id ORDER BY sent_at DESC LIMIT 5`,
      params: { saved_item_id }, location: "EU",
    }),
    // Accès NOMMÉ (inc. 8) : les perturbations réelles des jours analysés — ligne, arrêt,
    // retard (vue lue : grain disruption_event_id × location × date, fenêtre [J-1, J+30],
    // colonne date = disruption_date).
    futureDates.length ? bq.query({
      query: `SELECT CAST(disruption_date AS STRING) AS d, mode, route_long_name, short_name,
                     stop_name, title_merged, CAST(delay_minutes AS FLOAT64) AS delay_min,
                     severity, is_planned_flag
              FROM \`${PROJECT}.semantic.vw_insight_event_mobility_disruptions\`
              WHERE location_id = @location_id
                AND DATE(disruption_date) IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))
              ORDER BY severity DESC LIMIT 40`,
      params: { location_id, dates: futureDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    // Le public du jour — touristes étrangers (inc. 8) : projection SAISONNIÈRE (modèle lu :
    // jamais un signal quotidien), région en NUTS2 (jointure city_id_commune → city_to_region),
    // UN accommodation_type (hétérogène par région — leçon Île-de-France), dernière année
    // connue (le mart s'arrête à la dernière ingestion Flash INSEE : citer daté).
    futureDates.length ? bq.query({
      query: `WITH reg AS (
                SELECT r.region_code_nuts2 AS rc
                FROM \`${PROJECT}.dims\`.dim_client_location l
                JOIN \`${PROJECT}.dims\`.dim_city_to_region r ON r.city_id = l.city_id_commune
                WHERE l.location_id = @location_id LIMIT 1
              ),
              base AS (
                SELECT f.* FROM \`${PROJECT}.mart\`.fct_region_foreign_country_profile f, reg
                WHERE f.region_code = reg.rc AND f.season = @season
              ),
              latest AS (SELECT MAX(reference_year) AS y FROM base),
              one_acc AS (
                SELECT accommodation_type FROM base, latest WHERE reference_year = latest.y
                GROUP BY 1 ORDER BY (accommodation_type = 'hotels_campings') DESC, accommodation_type LIMIT 1
              )
              SELECT DISTINCT f.region_name, f.reference_year, f.accommodation_type,
                     f.country_name_fr, f.pct_nonresident, f.country_share_of_nonresident
              FROM base f, latest, one_acc
              WHERE f.reference_year = latest.y AND f.accommodation_type = one_acc.accommodation_type
              ORDER BY f.country_share_of_nonresident DESC LIMIT 3`,
      params: { location_id, season: [4, 5, 6, 7, 8, 9].includes(Number(futureDates[0].slice(5, 7))) ? "ete" : "hiver" },
      location: "EU",
    }) : empty,
    // Déjà documenté ? (chaîne bilan→dispositif, 10/08) — clé déterministe : le suffixe que
    // NOTRE écrivain pose (« (événement « <titre> ») »). Idempotence de l'offre côté client.
    pastDates.length ? bq.query({
      query: `SELECT practice_id FROM \`${PROJECT}.analytics.best_practices\`
              WHERE location_id = @location_id AND status = 'active' AND practice_text LIKE @pat LIMIT 1`,
      params: { location_id, pat: `%(événement « ${item.title} »)` }, location: "EU",
    }).catch(() => [[]]) : empty,
    // Habituel MÊME JOUR DE SEMAINE (90 j, jour exclu) pour tickets/panier — le référentiel du
    // « CA attendu » ; le 28 j toutes-journées du mart reste servi en repli (n_dow < 4).
    pastDates.length ? bq.query({
      query: `SELECT CAST(d AS STRING) AS d, ROUND(AVG(s.daily_transactions), 0) AS tick_dow,
                     ROUND(AVG(s.avg_basket), 2) AS basket_dow, COUNT(*) AS n_dow
              FROM UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x)) AS d
              JOIN \`${PROJECT}.mart.fct_client_sales_signals_daily\` s
                ON s.location_id = @location_id
               AND EXTRACT(DAYOFWEEK FROM s.transaction_date) = EXTRACT(DAYOFWEEK FROM d)
               AND s.transaction_date BETWEEN DATE_SUB(d, INTERVAL 90 DAY) AND DATE_SUB(d, INTERVAL 1 DAY)
              GROUP BY d`,
      params: { location_id, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    // Le DÉCLARÉ du bilan relu EN ENTIER (visiteurs, action menée, vécu, commentaire) —
    // consommateur d'event_outcomes : transformation dans l'Après + « Pour mémoire »
    // (owner 10/08 : « je ne me souviens plus de quoi parlait l'événement »).
    pastDates.length ? bq.query({
      query: `SELECT CAST(selected_date AS STRING) AS d, attendance_approx, action_carried,
                     weather_accuracy, mobility_felt, attendance_vs_expect, free_comment
              FROM \`${PROJECT}.raw.event_outcomes\`
              WHERE saved_item_id = @sid
              QUALIFY ROW_NUMBER() OVER (PARTITION BY selected_date ORDER BY submitted_at DESC) = 1`,
      params: { sid: saved_item_id }, location: "EU",
    }).catch(() => [[]]) : empty,
    // K9 : profit estimé des occurrences passées (série journalière sur [min, max] des dates,
    // filtrée aux occurrences ensuite) + sa moyenne 90 j BORNÉE à aujourd'hui (le référentiel —
    // la graine porte des dates futures). null si aucune marge déclarée : jamais inventé.
    (pastDates.length && String(item.kpi || "") === "profit_estimated")
      ? profitEstimatedDaily(bq, location_id, [...pastDates].sort()[0], [...pastDates].sort()[pastDates.length - 1]).catch(() => null)
      : Promise.resolve(null),
    (String(item.kpi || "") === "profit_estimated")
      ? (() => {
          const d0 = new Date(today + "T00:00:00Z"); d0.setUTCDate(d0.getUTCDate() - 90);
          return measureProfitEstimatedStats(bq, location_id, d0.toISOString().slice(0, 10), today).catch(() => null);
        })()
      : Promise.resolve(null),
  ]);

  const dowExpected = new Map<number, number>();
  for (const r of dowRows as any[]) dowExpected.set(Number(flat(r.dw)) - 1, Number(flat(r.expected_eur) ?? 0));
  const famAvg = famAvgRows?.length ? Number(flat((famAvgRows as any[])[0].avg_day) ?? 0) : null;
  // K9 : moyenne journalière du profit estimé (90 j bornés) + valeurs par occurrence.
  const profitAvg = profitStatsRes && (profitStatsRes as any).n_days >= 5 ? Number((profitStatsRes as any).mean) : null;
  const profitBy = new Map<string, number>(((profitDailyRes as Array<{ date: string; v: number }> | null) || []).map((x) => [x.date, x.v]));

  // Objectif (apport PROPRE) pour une date : pct → attendu×pct ; € famille → cible − moyenne famille.
  const objectifFor = (date: string) => {
    const exp = dowExpected.get(dowOf(date)) ?? null;
    let apport: number | null = null;
    if (item.kpi_target_pct != null && exp != null) apport = Math.round(exp * item.kpi_target_pct / 100);
    else if (item.kpi_target_eur != null && famAvg != null) apport = Math.round(item.kpi_target_eur - famAvg);
    else if (item.kpi_target_eur != null) apport = Math.round(item.kpi_target_eur);
    return { expected_eur: exp, apport_eur: apport, total_eur: exp != null && apport != null ? exp + apport : null };
  };

  // ── 4. Les 5 questions d'une date (colonnes vérifiées ; seuils mobilité = legacy) ──
  const surfByDate = new Map((surfRows as any[]).map((s) => [String(flat(s.d)), s]));
  const mobLabel = (v: number | null) => (v == null ? null : v >= 0 ? "fluide" : v >= -4 ? "perturbé" : "fortement perturbé");
  const outdoor = item.event_nature === "outdoor" || item.event_nature === "both";

  // ── Inc. 8 : faits NOMMÉS. Perturbations par date (ligne/arrêt/retard) + touristes
  //    étrangers (profil SAISONNIER, cité DATÉ — jamais présenté comme un signal du jour). ──
  const mobByDate = new Map<string, any[]>();
  for (const m of (mobRows as any[]) || []) {
    const d = String(flat(m.d));
    if (!mobByDate.has(d)) mobByDate.set(d, []);
    mobByDate.get(d)!.push(m);
  }
  const ACC_FR: Record<string, string> = { hotels: "hôtels", campings: "campings", hotels_campings: "hôtels et campings" };
  let touristesFr: string | null = null;
  if ((forRows as any[])?.length) {
    const f0: any = (forRows as any[])[0];
    const seasonFr = [4, 5, 6, 7, 8, 9].includes(Number((futureDates[0] || today).slice(5, 7))) ? "été" : "hiver";
    const pctNr = Math.round(Number(flat(f0.pct_nonresident) ?? 0) * 100);
    const topCountries = (forRows as any[]).slice(0, 2)
      .map((f: any) => `${String(flat(f.country_name_fr))} (${Math.round(Number(flat(f.country_share_of_nonresident) ?? 0) * 100)} %)`)
      .join(", ");
    // Référentiel porté mais DISCRET (retour owner : la parenthèse lourde « lisait horrible »).
    touristesFr = `Touristes étrangers : ${pctNr} % des nuitées en ${String(flat(f0.region_name))} — surtout ${topCountries} (profil ${seasonFr}, réf. ${Number(flat(f0.reference_year))}).`;
    void ACC_FR;
  }
  const mobName = (m: any): string => {
    const t = flat(m.title_merged) != null ? String(flat(m.title_merged)).trim() : "";
    if (t) return t.slice(0, 90);
    return [flat(m.mode), flat(m.route_long_name) ?? flat(m.short_name), flat(m.stop_name)]
      .filter((x) => x != null && String(x).trim()).map((x) => String(x).trim()).join(" · ").slice(0, 90) || "perturbation";
  };
  const buildDay = (date: string): EvenementDay => {
    const s: any = surfByDate.get(date);
    const dow_fr = DOW_FR[dowOf(date)] || "";
    if (!s) {
      const dh = Math.max(0, Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000));
      return { date, dow_fr, present: false, horizon_days: dh, score: null, weather_label_fr: null, questions: [
        { key: "horizon", fact_fr: `Hors horizon de prévision (J+${dh}) — revérifié automatiquement à l'approche (suivi quotidien dès J-10, carte J-1).`, tone: "info" },
      ], objectif: objectifFor(date) };
    }
    const qs: EvenementQuestion[] = [];
    const vac = flat(s.vacation_name) != null ? String(flat(s.vacation_name)) : null;
    const hol = flat(s.holiday_name) != null ? String(flat(s.holiday_name)) : null;
    // Le public du jour (retour owner : plus jamais le libellé 101 « certains partent… ») :
    // le CALENDRIER NOMMÉ + les effets ESTIMÉS quantifiés du jour (delta_att_*) + les
    // touristes nommés. Chaque nombre garde son statut (estimé).
    const attCal = flat(s.delta_att_calendar_pct) != null ? Number(flat(s.delta_att_calendar_pct)) : null;
    const attWx = flat(s.delta_att_weather_total_pct) != null ? Number(flat(s.delta_att_weather_total_pct)) : null;
    const sPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))} %`;
    const effets: string[] = [];
    if (attCal != null && Math.abs(attCal) >= 1) effets.push(`calendrier ${sPct(attCal)}`);
    if (attWx != null && Math.abs(attWx) >= 1) effets.push(`météo ${sPct(attWx)}`);
    const calLbl = [vac, hol].filter(Boolean).join(" · ") || "jour ordinaire (hors vacances et fériés)";
    qs.push({
      key: "clients", tone: "info",
      fact_fr: `Le public du jour : ${calLbl}${effets.length ? ` — effet estimé sur votre affluence : ${effets.join(" · ")}` : ""}.${touristesFr ? ` ${touristesFr}` : ""}`,
    });
    const attMob = flat(s.delta_att_mobility_pct) != null ? Number(flat(s.delta_att_mobility_pct)) : null;
    const opsCar = flat(s.delta_ops_mobility_car_pct) != null ? Number(flat(s.delta_ops_mobility_car_pct)) : null;
    const cliLbl = mobLabel(attMob); const fourLbl = mobLabel(opsCar);
    // Accès NOMMÉ (inc. 8) : la pire perturbation réelle du jour (ligne/arrêt/retard) quand
    // il y en a — sinon le résumé fluide reste (et il est vrai : zéro ligne en base).
    const dayMob = mobByDate.get(date) || [];
    if (dayMob.length) {
      const w = dayMob[0];
      const delay = flat(w.delay_min) != null && Number(flat(w.delay_min)) > 0 ? ` — ~${Math.round(Number(flat(w.delay_min)))} min` : "";
      const planned = flat(w.is_planned_flag) === true ? " (travaux planifiés)" : "";
      qs.push({
        key: "acces", tone: "warn",
        fact_fr: `Accès : ${dayMob.length} perturbation${dayMob.length > 1 ? "s" : ""} ce jour-là — ${mobName(w)}${delay}${planned}${dayMob.length > 1 ? ` · +${dayMob.length - 1} autre${dayMob.length > 2 ? "s" : ""}` : ""}. Clients : ${cliLbl ?? "—"} · fournisseurs (route) : ${fourLbl ?? "—"}.`,
        action_fr: fourLbl && fourLbl !== "fluide" ? "Prévenez vos fournisseurs — accès et livraison à anticiper." : undefined,
        href: `/app/insightevent/map?location_id=${encodeURIComponent(location_id)}&date=${date}`, link_fr: "Voir sur la carte →",
      });
    } else {
      // L'ABSENCE ne s'affirme que là où la vue VOIT (fenêtre [J-1, J+30]) ET quand elle ne
      // contredit pas les indicateurs du jour — bug owner : « fortement perturbé · aucune
      // perturbation connue » sur une date passée hors fenêtre.
      const inMobWindow = date >= today && date <= new Date(Date.parse(today + "T12:00:00Z") + 30 * 86_400_000).toISOString().slice(0, 10);
      const allFluide = cliLbl === "fluide" && fourLbl === "fluide";
      qs.push({
        key: "acces", tone: (fourLbl && fourLbl !== "fluide") || (cliLbl && cliLbl !== "fluide") ? (fourLbl === "fortement perturbé" || cliLbl === "fortement perturbé" ? "bad" : "warn") : "ok",
        fact_fr: `Accès — clients : ${cliLbl ?? "—"} · fournisseurs (route) : ${fourLbl ?? "—"}${inMobWindow && allFluide ? " — aucune perturbation signalée autour de votre adresse ce jour-là" : ""}.`,
        action_fr: fourLbl && fourLbl !== "fluide" ? "Prévenez vos fournisseurs — accès et livraison à anticiper." : undefined,
      });
    }
    const e500 = Number(flat(s.events_within_500m_count) ?? 0);
    const e5k = Number(flat(s.events_within_5km_count) ?? 0);
    const eSame = Number(flat(s.events_within_5km_same_bucket_count) ?? 0);
    // Activité autour de vous (label owner) — cliquable vers la carte du jour.
    qs.push({
      key: "voisins", tone: "info",
      fact_fr: `Activité autour de vous : ${e500} événement${e500 > 1 ? "s" : ""} à 500 m · ${e5k} à 5 km${eSame ? `, dont ${eSame} de votre secteur — synergie ou partage de flux possibles` : ""}.`,
      href: `/app/insightevent/map?location_id=${encodeURIComponent(location_id)}&date=${date}`, link_fr: "Voir sur la carte →",
    });
    const wLbl = flat(s.weather_label_fr) != null ? String(flat(s.weather_label_fr)) : "—";
    const lvlMax = Math.max(Number(flat(s.lvl_rain) ?? 0), Number(flat(s.lvl_wind) ?? 0), Number(flat(s.lvl_snow) ?? 0));
    const heat = Number(flat(s.lvl_heat) ?? 0);
    const dayHref = `/app/insightevent/days?selected_dates=${date}`;
    if (outdoor && lvlMax >= 3) qs.push({ key: "meteo", tone: "bad", fact_fr: `Météo : ${wLbl} (niveau ${lvlMax}) — votre dispositif est EXTÉRIEUR, directement exposé.`, action_fr: "Repli intérieur ou dispositif abrité — décision la veille.", href: dayHref, link_fr: "Détail du jour →" });
    else if (outdoor && (lvlMax >= 1 || heat >= 2)) qs.push({ key: "meteo", tone: "warn", fact_fr: `Météo : ${wLbl}${heat >= 2 ? " — chaleur marquée" : ""} — dispositif extérieur, vigilance.`, href: dayHref, link_fr: "Détail du jour →" });
    else qs.push({ key: "meteo", tone: "ok", fact_fr: `Météo : ${wLbl}${item.event_nature === "indoor" ? " — dispositif intérieur, exposition limitée" : ""}.`, href: dayHref, link_fr: "Détail du jour →" });
    const pr = flat(s.competition_pressure_ratio) != null ? Number(flat(s.competition_pressure_ratio)) : null;
    qs.push({ key: "concurrence", tone: "info", fact_fr: pr != null ? `Concurrence : pression ×${pr.toFixed(1)} vs votre résultat habituel.` : "Concurrence : pas de mesure ce jour-là." });
    return {
      date, dow_fr, present: true, horizon_days: null,
      score: flat(s.opportunity_score) != null ? Number(flat(s.opportunity_score)) : null,
      weather_label_fr: wLbl, questions: qs, objectif: objectifFor(date),
    };
  };
  const days = futureDates.map(buildDay);

  // ── 5. L'Après : mesuré par occurrence + verdict de l'engagement ancré ──
  const resBy = new Map((resRows as any[]).map((r) => [String(flat(r.d)), r]));
  const sigBy = new Map((sigRows as any[]).map((r) => [String(flat(r.d)), r]));
  const dowSalesBy = new Map((dowSalesRows as any[]).map((r) => [String(flat(r.d)), r]));
  const declaredBy = new Map((declaredRows as any[]).map((r) => [String(flat(r.d)), r]));
  const famBy = new Map((famRows as any[]).map((r) => [String(flat(r.d)), r]));
  const comBy = new Map((comRows as any[]).map((c) => [String(flat(c.ws)), c]));
  const apresRows = pastDates.map((d) => {
    const re: any = resBy.get(d); const sg: any = sigBy.get(d); const fa: any = famBy.get(d); const co: any = comBy.get(d);
    const rev = re ? Number(flat(re.rev)) : null; const exp = re ? Number(flat(re.exp)) : null;
    return {
      date: d, dow_fr: DOW_FR[dowOf(d)] || "",
      revenue: rev, expected: exp, gap_eur: rev != null && exp != null ? rev - exp : null,
      residual_pct: re && flat(re.rpct) != null ? Number(flat(re.rpct)) : null,
      tickets: sg && flat(sg.daily_transactions) != null ? Number(flat(sg.daily_transactions)) : null,
      tickets_base: sg && flat(sg.transactions_baseline) != null ? Number(flat(sg.transactions_baseline)) : null,
      tickets_delta_pct: sg && flat(sg.tdp) != null ? Number(flat(sg.tdp)) : null,
      basket: sg && flat(sg.basket) != null ? Number(flat(sg.basket)) : null,
      basket_base: sg && flat(sg.basket_base) != null ? Number(flat(sg.basket_base)) : null,
      basket_delta_pct: sg && flat(sg.bdp) != null ? Number(flat(sg.bdp)) : null,
      // Référentiel jour-de-semaine (celui du CA attendu) + registres visiteurs.
      tickets_base_dow: dowSalesBy.get(d) && flat((dowSalesBy.get(d) as any).tick_dow) != null ? Number(flat((dowSalesBy.get(d) as any).tick_dow)) : null,
      basket_base_dow: dowSalesBy.get(d) && flat((dowSalesBy.get(d) as any).basket_dow) != null ? Number(flat((dowSalesBy.get(d) as any).basket_dow)) : null,
      n_dow: dowSalesBy.get(d) ? Number(flat((dowSalesBy.get(d) as any).n_dow) ?? 0) : 0,
      visitors_measured: sg && flat(sg.daily_visitors) != null ? Number(flat(sg.daily_visitors)) : null,
      visitors_declared: declaredBy.get(d) && flat((declaredBy.get(d) as any).attendance_approx) != null ? Number(flat((declaredBy.get(d) as any).attendance_approx)) : null,
      bilan: declaredBy.get(d) ? (() => {
        const b: any = declaredBy.get(d);
        const sv = (k: string) => (flat(b[k]) != null ? String(flat(b[k])) : null);
        return { action_carried: sv("action_carried"), weather: sv("weather_accuracy"), mobility: sv("mobility_felt"), attendance: sv("attendance_vs_expect"), comment: sv("free_comment") };
      })() : null,
      family_rev: fa ? Number(flat(fa.fam_rev)) : null,
      family_avg: famAvg,
      // K9 : profit estimé du jour + son écart % à sa moyenne 90 j (le référentiel de la cible).
      profit_day: profitBy.has(d) ? (profitBy.get(d) as number) : null,
      profit_avg: profitAvg,
      profit_delta_pct: profitBy.has(d) && profitAvg != null && Math.abs(profitAvg) > 1e-9
        ? Math.round((((profitBy.get(d) as number) - profitAvg) / Math.abs(profitAvg)) * 1000) / 10 : null,
      verdict: co && flat(co.verdict) != null ? String(flat(co.verdict)) : null,
      commitment_status: co && flat(co.status) != null ? String(flat(co.status)) : null,
      commitment_id: co && flat(co.commitment_id) != null ? String(flat(co.commitment_id)) : null,
    };
  }).map((r) => ({
    ...r,
    // Cible ATTEINTE/MANQUÉE — un FAIT déterministe sur le KPI dominant déclaré (incrément 4).
    // Distinct du verdict statistique de l'engagement (K1, bande de bruit + gardes — décision
    // étape 3 : le verdict par KPI attend ses variances). Les deux s'affichent, jamais confondus.
    target_met: (() => {
      if (item.kpi === "family_revenue") return r.family_rev != null && item.kpi_target_eur != null ? r.family_rev >= item.kpi_target_eur : null;
      if (item.kpi === "revenue_residual") return r.residual_pct != null && item.kpi_target_pct != null ? r.residual_pct >= item.kpi_target_pct : null;
      if (item.kpi === "tickets") return r.tickets_delta_pct != null && item.kpi_target_pct != null ? r.tickets_delta_pct >= item.kpi_target_pct : null;
      if (item.kpi === "basket") return r.basket_delta_pct != null && item.kpi_target_pct != null ? r.basket_delta_pct >= item.kpi_target_pct : null;
      if (item.kpi === "profit_estimated") return r.profit_delta_pct != null && item.kpi_target_pct != null ? r.profit_delta_pct >= item.kpi_target_pct : null;
      return null;
    })(),
  }));
  const measured = apresRows.filter((r) => r.gap_eur != null);
  const gaps = measured.map((r) => r.gap_eur as number).sort((a, b) => a - b);
  // La série suit le KPI DÉCLARÉ (le formulaire en offre 4 : CA vs attendu, famille, tickets,
  // panier — l'utilisateur choisit et pose sa cible). Avant : agrégée sur gap_eur (CA) quel que
  // soit le KPI → « 1/1 au-dessus de l'attendu » s'affichait SOUS « Cible manquée » sur le même
  // jour (cas réel Corner : famille 28 € vs cible 150 €, CA +90 €). Chaque valeur porte son unité.
  const KPI_UNIT: Record<string, "eur" | "pct"> = { family_revenue: "eur", revenue_residual: "pct", tickets: "pct", basket: "pct", profit_estimated: "pct" };
  const kpiKeyItem = String(item.kpi || "revenue_residual");
  const kpiValueOf = (r: any): number | null => {
    if (kpiKeyItem === "family_revenue") return r.family_rev != null ? Number(r.family_rev) : null;
    if (kpiKeyItem === "revenue_residual") return r.residual_pct != null ? Number(r.residual_pct) : null;
    if (kpiKeyItem === "tickets") return r.tickets_delta_pct != null ? Number(r.tickets_delta_pct) : null;
    if (kpiKeyItem === "basket") return r.basket_delta_pct != null ? Number(r.basket_delta_pct) : null;
    if (kpiKeyItem === "profit_estimated") return r.profit_delta_pct != null ? Number(r.profit_delta_pct) : null;
    return null;
  };
  const kpiTarget = kpiKeyItem === "family_revenue" ? item.kpi_target_eur : item.kpi_target_pct;
  const kpiMeasured = apresRows.filter((r) => kpiValueOf(r) != null);
  const kpiVals = kpiMeasured.map((r) => kpiValueOf(r) as number).sort((a, b) => a - b);
  const serie = isRecurring ? {
    n_occurrences: item.dates.length,
    n_measured: measured.length,
    n_above: measured.filter((r) => (r.gap_eur as number) > 0).length,
    median_gap_eur: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    sum_gap_eur: gaps.length ? gaps.reduce((a, b) => a + b, 0) : null,
    next_date: nextDate,
    // ── Série DU KPI déclaré (unité portée, cible portée) ──
    kpi_key: kpiKeyItem,
    kpi_unit: KPI_UNIT[kpiKeyItem] || "pct",
    kpi_target: kpiTarget ?? null,
    kpi_n_measured: kpiMeasured.length,
    kpi_n_met: kpiTarget != null ? kpiMeasured.filter((r) => (kpiValueOf(r) as number) >= Number(kpiTarget)).length : null,
    kpi_median: kpiVals.length ? kpiVals[Math.floor(kpiVals.length / 2)] : null,
    kpi_values: kpiMeasured.map((r) => ({ date: r.date, value: kpiValueOf(r) })),
    // Assez d'occurrences pour lire une TENDANCE ? (2 points ne font pas une courbe.)
    trend_readable: kpiMeasured.length >= 3,
  } : null;

  // Lecture : réconcilier le KPI et le CA du jour quand ils divergent — le fait le plus utile
  // du dossier n'était calculé nulle part (Corner : la famille sous SA moyenne, journée au-dessus
  // de l'attendu ⇒ la hausse ne vient pas de l'opération).
  const lastMeasured = measured.length ? measured[measured.length - 1] : null;
  let reconciliation: string | null = null;
  if (lastMeasured && kpiKeyItem === "family_revenue" && lastMeasured.family_rev != null && famAvg != null) {
    const famUp = lastMeasured.family_rev >= famAvg;
    const dayUp = (lastMeasured.gap_eur as number) > 0;
    if (!famUp && dayUp) reconciliation = `La famille ${item.kpi_family} a fait ${lastMeasured.family_rev} € contre ${famAvg} € son ordinaire, alors que la journée dépassait votre résultat habituel de +${lastMeasured.gap_eur} € — la hausse du jour ne vient pas de cette opération.`;
    else if (famUp && !dayUp) reconciliation = `La famille ${item.kpi_family} a fait ${lastMeasured.family_rev} € contre ${famAvg} € son ordinaire, mais la journée est restée sous votre résultat habituel (${lastMeasured.gap_eur} €) — l'opération a porté sa famille sans porter le jour.`;
    else if (famUp && dayUp) reconciliation = `Famille ${item.kpi_family} au-dessus de son ordinaire (${lastMeasured.family_rev} € vs ${famAvg} €) ET journée au-dessus de votre résultat habituel (+${lastMeasured.gap_eur} €).`;
  }
  // Cible hors d'échelle : un objectif à N× l'ordinaire de la famille n'est pas une performance
  // manquée, c'est un calibrage (fait dit, jamais un reproche).
  let targetScale: { ratio: number; ref: number } | null = null;
  if (kpiKeyItem === "family_revenue" && item.kpi_target_eur != null && famAvg != null && famAvg > 0) {
    const ratio = item.kpi_target_eur / famAvg;
    if (ratio >= 2) targetScale = { ratio: Math.round(ratio * 10) / 10, ref: famAvg };
  }

  // ── 6. FACTS (liste blanche du chat — chaque nombre verbatim) ──
  const fd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const facts: EvenementFamilyResult["facts"] = [];
  facts.push({
    fact_fr: `Événement « ${item.title} »${item.author_person_name ? ` (créé par ${item.author_person_name})` : ""} : ${item.event_type_label_fr || "type non renseigné"}, ${isRecurring ? `récurrent (${item.dates.length} occurrences)` : `dates ${item.dates.map(fd).join(", ")}`}${item.dispositif ? ` ; dispositif : « ${item.dispositif} »` : ""}.`,
    claim_type: "observed",
  });
  for (const r of measured) {
    facts.push({
      fact_fr: `Occurrence du ${r.dow_fr} ${fd(r.date)} : CA ${r.revenue} € contre ${r.expected} € votre ${r.dow_fr} habituel (écart ${(r.gap_eur as number) >= 0 ? "+" : "-"}${Math.abs(r.gap_eur as number)} €)${r.family_rev != null && item.kpi_family ? ` ; famille ${item.kpi_family} ${r.family_rev} €${famAvg != null ? ` contre ${famAvg} € sa moyenne journalière` : ""}` : ""}${r.profit_day != null ? ` ; profit estimé ${Math.round(r.profit_day)} €${r.profit_avg != null ? ` contre ${Math.round(r.profit_avg)} € sa moyenne (90 j, vos marges déclarées)` : " (vos marges déclarées)"}` : ""}${r.verdict ? ` ; verdict de l'engagement : ${r.verdict}` : ""}.`,
      claim_type: "measured",
    });
  }
  if (serie && serie.n_measured > 0) {
    facts.push({
      fact_fr: `Série « ${item.title} » : ${serie.n_above} occurrence(s) sur ${serie.n_measured} mesurée(s) au-dessus de votre résultat habituel ; somme des écarts mesurés ${serie.sum_gap_eur} € (jamais extrapolée).`,
      claim_type: "measured",
    });
  }

  return {
    facts,
    data: {
      found: true, item, stage, fam_avg_day_eur: famAvg,
      days, avant_date: stage === "decider" ? null : nextDate,
      apres: {
        rows: apresRows, serie,
        documented: (docRows as any[])?.length ? String(flat((docRows as any[])[0].practice_id)) : null,
        reconciliation, target_scale: targetScale,
        // « En cours » : l'engagement ancré sur la PROCHAINE occurrence (armé ou non) — l'état
        // vivant n'était visible nulle part sur le dossier.
        next_commitment: nextDate && comBy.get(nextDate)
          ? {
              date: nextDate, status: String(flat((comBy.get(nextDate) as any).status) || ""),
              verdict: flat((comBy.get(nextDate) as any).verdict) != null ? String(flat((comBy.get(nextDate) as any).verdict)) : null,
              commitment_id: flat((comBy.get(nextDate) as any).commitment_id) != null ? String(flat((comBy.get(nextDate) as any).commitment_id)) : null,
            }
          : (nextDate ? { date: nextDate, status: null, verdict: null, commitment_id: null } : null),
      },
      consigne_sends: (sendRows as any[]).map((s) => ({
        occurrence_date: String(flat(s.d) ?? ""), sent_on: String(flat(s.sent_on) ?? ""),
        n_recipients: Number(flat(s.n_recipients) ?? 0),
      })),
      sources: [
        "raw.saved_items × raw.saved_item_dates (l'événement, ses occurrences)",
        "semantic.vw_insight_event_day_surface (les 5 questions des jours à venir — audience, mobilité clients/fournisseurs, voisins, météo, concurrence)",
        "semantic.vw_insight_event_day_residual (CA vs attendu, + attendu par jour de semaine 90 j)",
        "mart.fct_client_sales_signals_daily (tickets, panier vs base 30 j)",
        ...(item.kpi_family ? ["raw.client_transactions (CA de la famille vs sa moyenne journalière)"] : []),
        "analytics.action_commitments (verdicts des engagements ancrés saved_item_id)",
        "analytics.consigne_sends (traces d'envoi de la consigne d'opération)",
      ],
    },
  };
}
