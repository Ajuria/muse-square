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

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const ymdToday = () => new Date().toISOString().slice(0, 10);
const dowOf = (ymd: string) => new Date(ymd + "T00:00:00Z").getUTCDay();

export interface EvenementQuestion { key: string; fact_fr: string; tone: "ok" | "warn" | "bad" | "info"; action_fr?: string }
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

export async function evenementFamily(bq: any, location_id: string, saved_item_id: string): Promise<EvenementFamilyResult> {
  // ── 1. L'événement + ses dates (2 lectures, une passe) ──
  const [[itemRows], [dateRows]] = await Promise.all([
    bq.query({
      query: `SELECT saved_item_id, title, description, event_type, event_nature, hour_start, hour_end,
                     author_person_name, kpi, kpi_family, kpi_target_pct, kpi_target_eur,
                     recurrence, recurrence_dow, CAST(decision_date AS STRING) AS decision_date,
                     CAST(selected_date AS STRING) AS selected_date, CAST(event_end_date AS STRING) AS event_end_date
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
  };

  // ── 2. Étape du dossier + dates à analyser ──
  const today = ymdToday();
  const isRecurring = item.recurrence !== "none";
  const pastDates = isRecurring ? item.dates.filter((d) => d < today) : (item.selected_date && item.selected_date < today ? [item.selected_date] : []);
  const nextDate = isRecurring ? (item.dates.find((d) => d >= today) ?? null) : (item.selected_date && item.selected_date >= today ? item.selected_date : null);
  const stage: "decider" | "avant" | "apres" =
    !isRecurring && !item.selected_date && item.dates.length ? "decider"
    : pastDates.length ? "apres" : "avant";
  const futureDates = stage === "decider" ? item.dates.slice(0, 7) : (nextDate ? [nextDate] : []);

  // ── 3. Lot parallèle unique : surface des jours futurs + mesuré des jours passés +
  //       engagements ancrés + attendu par jour de semaine + moyenne famille ──
  const empty = Promise.resolve([[] as any[]]);
  const [[surfRows], [resRows], [sigRows], [famRows], [comRows], [dowRows], [famAvgRows]] = await Promise.all([
    futureDates.length ? bq.query({
      query: `SELECT CAST(date AS STRING) AS d, opportunity_score_final_local AS opportunity_score, lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold,
                     weather_label_fr, holiday_name, vacation_name, audience_availability_label,
                     delta_att_mobility_pct, delta_ops_mobility_car_pct,
                     events_within_500m_count, events_within_5km_count, events_within_5km_same_bucket_count,
                     competition_pressure_ratio
              FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
              WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
      params: { location_id, dates: futureDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    pastDates.length ? bq.query({
      query: `SELECT CAST(date AS STRING) AS d, ROUND(daily_revenue, 0) AS rev, ROUND(expected_revenue, 0) AS exp, ROUND(residual_pct, 1) AS rpct
              FROM \`${PROJECT}.mart.fct_client_day_residual\`
              WHERE location_id = @location_id AND date IN UNNEST(ARRAY(SELECT PARSE_DATE('%F', x) FROM UNNEST(@dates) AS x))`,
      params: { location_id, dates: pastDates }, types: { dates: ["STRING"] }, location: "EU",
    }) : empty,
    pastDates.length ? bq.query({
      query: `SELECT CAST(transaction_date AS STRING) AS d, daily_transactions, ROUND(transactions_baseline, 0) AS transactions_baseline, ROUND(transactions_delta_pct, 0) AS tdp,
                     ROUND(avg_basket, 2) AS basket, ROUND(basket_baseline, 2) AS basket_base, ROUND(basket_delta_pct, 0) AS bdp
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
              FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
                    FROM \`${PROJECT}.analytics.action_commitments\` WHERE saved_item_id = @saved_item_id)
              WHERE rn = 1`,
      params: { saved_item_id }, location: "EU",
    }),
    bq.query({
      query: `SELECT EXTRACT(DAYOFWEEK FROM date) AS dw, ROUND(AVG(expected_revenue), 0) AS expected_eur
              FROM \`${PROJECT}.mart.fct_client_day_residual\`
              WHERE location_id = @location_id AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) GROUP BY dw`,
      params: { location_id }, location: "EU",
    }),
    (item.kpi === "family_revenue" && item.kpi_family) ? bq.query({
      query: `WITH td AS (SELECT COUNT(DISTINCT transaction_date) AS n FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @location_id)
              SELECT ROUND(SUM(revenue) / (SELECT n FROM td), 0) AS avg_day
              FROM \`${PROJECT}.raw.client_transactions\` WHERE location_id = @location_id AND item_category = @fam`,
      params: { location_id, fam: item.kpi_family }, location: "EU",
    }) : empty,
  ]);

  const dowExpected = new Map<number, number>();
  for (const r of dowRows as any[]) dowExpected.set(Number(flat(r.dw)) - 1, Number(flat(r.expected_eur) ?? 0));
  const famAvg = famAvgRows?.length ? Number(flat((famAvgRows as any[])[0].avg_day) ?? 0) : null;

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
    const aud = flat(s.audience_availability_label) != null ? String(flat(s.audience_availability_label)) : null;
    const vac = flat(s.vacation_name) != null ? String(flat(s.vacation_name)) : null;
    const hol = flat(s.holiday_name) != null ? String(flat(s.holiday_name)) : null;
    qs.push({ key: "clients", tone: "info", fact_fr: `Vos clients cibles : ${aud || "profil du jour non qualifié"}${vac ? ` — ${vac}` : ""}${hol ? ` — ${hol}` : ""}.` });
    const attMob = flat(s.delta_att_mobility_pct) != null ? Number(flat(s.delta_att_mobility_pct)) : null;
    const opsCar = flat(s.delta_ops_mobility_car_pct) != null ? Number(flat(s.delta_ops_mobility_car_pct)) : null;
    const cliLbl = mobLabel(attMob); const fourLbl = mobLabel(opsCar);
    qs.push({
      key: "acces", tone: (fourLbl && fourLbl !== "fluide") || (cliLbl && cliLbl !== "fluide") ? (fourLbl === "fortement perturbé" || cliLbl === "fortement perturbé" ? "bad" : "warn") : "ok",
      fact_fr: `Accès — clients : ${cliLbl ?? "—"} · fournisseurs (route) : ${fourLbl ?? "—"}.`,
      action_fr: fourLbl && fourLbl !== "fluide" ? "Prévenez vos fournisseurs — accès et livraison à anticiper." : undefined,
    });
    const e500 = Number(flat(s.events_within_500m_count) ?? 0);
    const e5k = Number(flat(s.events_within_5km_count) ?? 0);
    const eSame = Number(flat(s.events_within_5km_same_bucket_count) ?? 0);
    qs.push({ key: "voisins", tone: "info", fact_fr: `Événements voisins : ${e500} à 500 m · ${e5k} à 5 km${eSame ? `, dont ${eSame} de votre secteur — synergie ou partage de flux possibles` : ""}.` });
    const wLbl = flat(s.weather_label_fr) != null ? String(flat(s.weather_label_fr)) : "—";
    const lvlMax = Math.max(Number(flat(s.lvl_rain) ?? 0), Number(flat(s.lvl_wind) ?? 0), Number(flat(s.lvl_snow) ?? 0));
    const heat = Number(flat(s.lvl_heat) ?? 0);
    if (outdoor && lvlMax >= 3) qs.push({ key: "meteo", tone: "bad", fact_fr: `Météo : ${wLbl} (niveau ${lvlMax}) — votre dispositif est EXTÉRIEUR, directement exposé.`, action_fr: "Repli intérieur ou dispositif abrité — décision la veille." });
    else if (outdoor && (lvlMax >= 1 || heat >= 2)) qs.push({ key: "meteo", tone: "warn", fact_fr: `Météo : ${wLbl}${heat >= 2 ? " — chaleur marquée" : ""} — dispositif extérieur, vigilance.` });
    else qs.push({ key: "meteo", tone: "ok", fact_fr: `Météo : ${wLbl}${item.event_nature === "indoor" ? " — dispositif intérieur, exposition limitée" : ""}.` });
    const pr = flat(s.competition_pressure_ratio) != null ? Number(flat(s.competition_pressure_ratio)) : null;
    qs.push({ key: "concurrence", tone: "info", fact_fr: pr != null ? `Concurrence : pression ×${pr.toFixed(1)} vs votre habituel.` : "Concurrence : pas de mesure ce jour-là." });
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
      family_rev: fa ? Number(flat(fa.fam_rev)) : null,
      family_avg: famAvg,
      verdict: co && flat(co.verdict) != null ? String(flat(co.verdict)) : null,
      commitment_status: co && flat(co.status) != null ? String(flat(co.status)) : null,
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
      return null;
    })(),
  }));
  const measured = apresRows.filter((r) => r.gap_eur != null);
  const gaps = measured.map((r) => r.gap_eur as number).sort((a, b) => a - b);
  const serie = isRecurring ? {
    n_occurrences: item.dates.length,
    n_measured: measured.length,
    n_above: measured.filter((r) => (r.gap_eur as number) > 0).length,
    median_gap_eur: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
    sum_gap_eur: gaps.length ? gaps.reduce((a, b) => a + b, 0) : null,
    next_date: nextDate,
  } : null;

  // ── 6. FACTS (liste blanche du chat — chaque nombre verbatim) ──
  const fd = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const facts: EvenementFamilyResult["facts"] = [];
  facts.push({
    fact_fr: `Événement « ${item.title} »${item.author_person_name ? ` (créé par ${item.author_person_name})` : ""} : ${item.event_type_label_fr || "type non renseigné"}, ${isRecurring ? `récurrent (${item.dates.length} occurrences)` : `dates ${item.dates.map(fd).join(", ")}`}${item.dispositif ? ` ; dispositif : « ${item.dispositif} »` : ""}.`,
    claim_type: "observed",
  });
  for (const r of measured) {
    facts.push({
      fact_fr: `Occurrence du ${r.dow_fr} ${fd(r.date)} : CA ${r.revenue} € contre ${r.expected} € attendu du jour (écart ${(r.gap_eur as number) >= 0 ? "+" : "-"}${Math.abs(r.gap_eur as number)} €)${r.family_rev != null && item.kpi_family ? ` ; famille ${item.kpi_family} ${r.family_rev} €${famAvg != null ? ` contre ${famAvg} € sa moyenne journalière` : ""}` : ""}${r.verdict ? ` ; verdict de l'engagement : ${r.verdict}` : ""}.`,
      claim_type: "measured",
    });
  }
  if (serie && serie.n_measured > 0) {
    facts.push({
      fact_fr: `Série « ${item.title} » : ${serie.n_above} occurrence(s) sur ${serie.n_measured} mesurée(s) au-dessus de l'attendu ; somme des écarts mesurés ${serie.sum_gap_eur} € (jamais extrapolée).`,
      claim_type: "measured",
    });
  }

  return {
    facts,
    data: {
      found: true, item, stage, fam_avg_day_eur: famAvg,
      days, avant_date: stage === "decider" ? null : nextDate,
      apres: { rows: apresRows, serie },
      sources: [
        "raw.saved_items × raw.saved_item_dates (l'événement, ses occurrences)",
        "semantic.vw_insight_event_day_surface (les 5 questions des jours à venir — audience, mobilité clients/fournisseurs, voisins, météo, concurrence)",
        "mart.fct_client_day_residual (CA vs attendu, + attendu par jour de semaine 90 j)",
        "mart.fct_client_sales_signals_daily (tickets, panier vs base 30 j)",
        ...(item.kpi_family ? ["raw.client_transactions (CA de la famille vs sa moyenne journalière)"] : []),
        "analytics.action_commitments (verdicts des engagements ancrés saved_item_id)",
      ],
    },
  };
}
