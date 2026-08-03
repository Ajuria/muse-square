// Provider « Reproduire le dispositif gagnant » — la matière d'ENQUÊTE d'un motif structurel
// (atelier des mécanismes, docs/atelier-mecanismes-spec.md). Même pattern que les autres
// familles : UN provider, réutilisé par la page profonde aujourd'hui et par le prompt Q&A du
// mode enquête ensuite — la matière ne peut pas diverger entre l'écran et le chat.
//
// FAMILLE PILOTE : affluence (class_key = 'traffic_high', jours du tercile haut des visiteurs
// mesurés). Autres classes → { found:false, reason } : absence honnête, jamais un calcul
// improvisé sur une classe dont l'appartenance-jour n'est pas encodée ici.
//
// Ce que le provider calcule (tout mesuré, fenêtre 730 j du moteur, bornée par l'historique) :
//  - narrative : n jours de classe, part expliquée par l'environnement (chaleur/vacances/
//    week-end — CO-OCCURRENCES, jamais « causes »), les parts pour l'infobulle ;
//  - top_days : les plus gros jours (visiteurs, CA, contexte) ;
//  - unexplained_days : les jours SANS facteur environnemental connu — le détecteur de
//    signaux hors base — chacun avec ses vérifications internes DÉJÀ faites (amplitude
//    horaire réelle + mix produits du jour vs habituel) pour que l'enquête écarte
//    « journée écourtée » et « effet produit » AVANT de questionner l'exploitant ;
//  - impact : la pilule du motif par LE chemin de politique réel (getDayClassImpacts —
//    jamais une réimplémentation des portes).
import { getDayClassImpacts, type DayClassImpact } from "../dayClassRegistry";
import { listClassDispositifs, type ClassDispositif } from "../bestPractices";
import type { FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const PILOT_CLASSES = new Set(["traffic_high"]);

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export interface DispositifDay {
  date: string;
  dow_fr: string;
  visitors: number | null;
  ca: number | null;
  gap_eur: number | null;
  heat: boolean;
  vacances: boolean;
  weekend: boolean;
}

export interface UnexplainedDay extends DispositifDay {
  // Vérifications internes déjà faites — l'enquête les cite, sources à l'appui.
  hour_min: number | null;
  hour_max: number | null;
  tickets: number | null;
  top_categories: Array<{ category: string; pct: number }>;
  usual_top_categories: Array<{ category: string; pct: number }>;
}

export interface DispositifFamilyResult {
  // La liste blanche chiffrée du mode enquête (pièce 2b) : chaque nombre que l'assistant a le
  // droit d'écrire vit ici, verbatim — la porte validateEnqueteOutput rejette tout le reste.
  // Mêmes valeurs que `data` (une seule source), sérialisées en français d'exploitant.
  facts: FamilyFact[];
  data: {
    found: boolean;
    reason?: string;
    class_key?: string;
    narrative?: {
      n_days: number;
      n_env: number;          // jours portant AU MOINS un facteur environnemental
      pct_heat: number; pct_vacances: number; pct_weekend: number;
    };
    impact?: DayClassImpact | null;
    top_days?: DispositifDay[];
    unexplained_days?: UnexplainedDay[];
    // Continuité (03/08) : les dispositifs déjà documentés sur CE motif — la page les affiche
    // en ouverture, l'enquête repart d'eux au lieu de re-documenter.
    existing_dispositifs?: Array<{
      practice_text: string;
      confirmation_test: string | null;
      tier: "prouvee" | "declaree";
      in_test: boolean;
      created_date: string;
    }>;
    sources?: string[];
  };
}

export async function dispositifFamily(bq: any, location_id: string, class_key: string): Promise<DispositifFamilyResult> {
  if (!PILOT_CLASSES.has(class_key)) {
    return { facts: [], data: { found: false, reason: "Famille pilote : affluence (traffic_high). Les autres motifs arrivent." } };
  }

  // Q1 — les jours de la classe (tercile haut des visiteurs, la sémantique exacte de in_traffic
  // du moteur) + flags environnementaux + gap résiduel. Une requête.
  const [dayRows] = await bq.query({
    query: `
      WITH j AS (
        SELECT c.date, perf.daily_visitors AS v, perf.daily_revenue AS ca,
               r.daily_revenue - r.expected_revenue AS gap,
               c.is_school_holiday_flag AS sch, c.is_weekend_flag AS we,
               (COALESCE(c.lvl_heat, 0) >= 1) AS heat
        FROM \`${PROJECT}.mart.fct_location_context_daily\` c
        JOIN \`${PROJECT}.mart.fct_client_day_residual\` r
          ON r.location_id = c.location_id AND r.date = c.date
        LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
          ON perf.location_id = c.location_id AND perf.transaction_date = c.date
        WHERE c.location_id = @location_id
          AND c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()
      ),
      th AS (SELECT APPROX_QUANTILES(v, 3)[OFFSET(2)] AS t2, MIN(v) AS vmin, MAX(v) AS vmax FROM j)
      SELECT FORMAT_DATE('%Y-%m-%d', j.date) AS date, j.v, ROUND(j.ca, 0) AS ca, ROUND(j.gap, 0) AS gap,
             j.sch, j.we, j.heat
      FROM j, th
      WHERE j.v IS NOT NULL AND th.vmax > th.vmin AND j.v >= th.t2
      ORDER BY j.v DESC
    `,
    params: { location_id },
    location: "EU",
  });

  const days: DispositifDay[] = (dayRows as any[]).map((r) => ({
    date: String(flat(r.date)),
    dow_fr: DOW_FR[new Date(String(flat(r.date)) + "T00:00:00Z").getUTCDay()] || "",
    visitors: flat(r.v) != null ? Number(flat(r.v)) : null,
    ca: flat(r.ca) != null ? Number(flat(r.ca)) : null,
    gap_eur: flat(r.gap) != null ? Number(flat(r.gap)) : null,
    heat: flat(r.heat) === true,
    vacances: flat(r.sch) === true,
    weekend: flat(r.we) === true,
  }));
  if (!days.length) return { facts: [], data: { found: false, reason: "Pas assez d'historique de fréquentation mesurée sur ce lieu." } };

  const unexplained = days.filter((d) => !d.heat && !d.vacances && !d.weekend);
  const n = days.length;
  const narrative = {
    n_days: n,
    n_env: n - unexplained.length,
    pct_heat: Math.round((100 * days.filter((d) => d.heat).length) / n),
    pct_vacances: Math.round((100 * days.filter((d) => d.vacances).length) / n),
    pct_weekend: Math.round((100 * days.filter((d) => d.weekend).length) / n),
  };

  // Q2 — vérifications internes des jours inexpliqués (max 5) : amplitude horaire + tickets +
  // mix produits du jour, ET le mix habituel du lieu (comparateur) — une requête chacune.
  const exDates = unexplained.slice(0, 5).map((d) => d.date);
  let hoursRows: any[] = [];
  let mixRows: any[] = [];
  let usualRows: any[] = [];
  if (exDates.length) {
    [[hoursRows], [mixRows], [usualRows]] = await Promise.all([
      bq.query({
        query: `SELECT FORMAT_DATE('%Y-%m-%d', transaction_date) AS date,
                       MIN(transaction_hour) AS hmin, MAX(transaction_hour) AS hmax, COUNT(*) AS n
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id = @location_id
                  AND transaction_date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', d) FROM UNNEST(@dates) AS d))
                GROUP BY 1`,
        params: { location_id, dates: exDates }, types: { dates: ["STRING"] }, location: "EU",
      }),
      bq.query({
        query: `SELECT date, item_category,
                       ROUND(100 * cat_rev / SUM(cat_rev) OVER (PARTITION BY date), 0) AS pct
                FROM (
                  SELECT FORMAT_DATE('%Y-%m-%d', transaction_date) AS date, item_category, SUM(revenue) AS cat_rev
                  FROM \`${PROJECT}.raw.client_transactions\`
                  WHERE location_id = @location_id AND item_category IS NOT NULL
                    AND transaction_date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', d) FROM UNNEST(@dates) AS d))
                  GROUP BY 1, 2
                )
                QUALIFY ROW_NUMBER() OVER (PARTITION BY date ORDER BY cat_rev DESC) <= 3`,
        params: { location_id, dates: exDates }, types: { dates: ["STRING"] }, location: "EU",
      }),
      bq.query({
        query: `SELECT item_category, ROUND(100 * SUM(revenue) / SUM(SUM(revenue)) OVER (), 0) AS pct
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id = @location_id AND item_category IS NOT NULL
                GROUP BY 1 ORDER BY pct DESC LIMIT 3`,
        params: { location_id }, location: "EU",
      }),
    ]);
  }
  const hoursByDate = new Map((hoursRows as any[]).map((h) => [String(flat(h.date)), h]));
  const usualTop = (usualRows as any[]).map((u) => ({ category: String(flat(u.item_category)), pct: Number(flat(u.pct)) }));
  const unexplainedDays: UnexplainedDay[] = unexplained.slice(0, 5).map((d) => {
    const h = hoursByDate.get(d.date);
    return {
      ...d,
      hour_min: h ? Number(flat(h.hmin)) : null,
      hour_max: h ? Number(flat(h.hmax)) : null,
      tickets: h ? Number(flat(h.n)) : null,
      top_categories: (mixRows as any[])
        .filter((m) => String(flat(m.date)) === d.date)
        .map((m) => ({ category: String(flat(m.item_category)), pct: Number(flat(m.pct)) })),
      usual_top_categories: usualTop,
    };
  });

  // La pilule du motif (LE chemin de politique réel — jamais une réimplémentation) + les
  // dispositifs déjà documentés du motif, en PARALLÈLE (deux lectures indépendantes).
  const [impacts, existing] = await Promise.all([
    getDayClassImpacts(bq, location_id, []),
    listClassDispositifs(bq, location_id, class_key),
  ]);
  const impact = (impacts as any).impacts?.get?.(class_key) ?? null;
  const existingDispositifs = (existing as ClassDispositif[]).map((p) => ({
    practice_text: p.practice_text,
    confirmation_test: p.confirmation_test,
    tier: p.tier,
    in_test: p.commitment_status === "open",
    created_date: p.created_date,
  }));

  // ── FAITS de l'enquête (pièce 2b) — la liste blanche chiffrée du chat. Chaque nombre que
  // l'assistant peut légitimement écrire doit figurer ici verbatim ; formatage fr-FR (les
  // espaces de milliers sont normalisées par extractNumbers des deux côtés de la porte).
  const fi = (v: number | null | undefined) => (v == null || !isFinite(Number(v)) ? "?" : Math.abs(Math.round(Number(v))).toLocaleString("fr-FR"));
  const fd = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const facts: FamilyFact[] = [];
  facts.push({
    fact_fr: `Motif affluence : ${n} jours de pointe mesurés sur votre historique, dont ${narrative.n_env} arrivés avec la chaleur, les vacances ou le week-end (chaleur ${narrative.pct_heat} %, vacances ${narrative.pct_vacances} %, week-end ${narrative.pct_weekend} % — co-occurrences mesurées, pas des causes).`,
    claim_type: "measured",
  });
  if (impact && (impact as any).eur_year != null) {
    const imp: any = impact;
    facts.push({
      fact_fr: `Poids du motif : ${Number(imp.eur_year) >= 0 ? "+" : "-"}${fi(imp.eur_year)} €/an (annualisé, mesuré sur ${fi(imp.n_days)} jours / ${fi(imp.span_months)} mois). Une journée de ce type vaut ${Number(imp.avg_gap_eur) >= 0 ? "+" : "-"}${fi(imp.avg_gap_eur)} € vs votre normale (médiane mesurée).`,
      claim_type: "measured",
      tier: imp.tier,
    });
  }
  for (const d of days.slice(0, 3)) {
    facts.push({
      fact_fr: `Jour de pointe ${d.dow_fr} ${fd(d.date)} : ${fi(d.visitors)} visiteurs, ${fi(d.ca)} € de CA${d.gap_eur != null ? `, écart au CA attendu du jour ${Number(d.gap_eur) >= 0 ? "+" : "-"}${fi(d.gap_eur)} €` : ""} (${[d.heat ? "chaleur" : "", d.vacances ? "vacances" : "", d.weekend ? "week-end" : ""].filter(Boolean).join(" + ") || "aucun facteur connu"}).`,
      claim_type: "measured",
    });
  }
  for (const p of existingDispositifs) {
    facts.push({
      fact_fr: `Dispositif déjà documenté chez vous le ${fd(p.created_date)} : « ${p.practice_text} » — ${p.tier === "prouvee" ? "prouvé au rejeu" : "déclaré"}${p.confirmation_test ? ` ; test : « ${p.confirmation_test} »` : ""}${p.in_test ? " ; engagement de test EN COURS (suivi sur Pulse)" : ""}.`,
      claim_type: "observed",
    });
  }
  for (const d of unexplainedDays) {
    const checks: string[] = [];
    if (d.hour_min != null && d.hour_max != null) checks.push(`ventes de ${d.hour_min} h à ${d.hour_max} h (${fi(d.tickets)} tickets — pas de fermeture anticipée)`);
    if (d.top_categories.length) checks.push(`mix produits du jour ${d.top_categories.map((c) => `${c.category} ${c.pct} %`).join(", ")} vs habituel ${d.usual_top_categories.map((c) => `${c.category} ${c.pct} %`).join(", ")}`);
    facts.push({
      fact_fr: `Journée de pointe sans facteur connu : ${d.dow_fr} ${fd(d.date)} — ${fi(d.visitors)} visiteurs, ${fi(d.ca)} € de CA, écart au CA attendu du jour ${Number(d.gap_eur ?? 0) >= 0 ? "+" : "-"}${fi(d.gap_eur)} € (poids faible si proche de 0 : possiblement la variation ordinaire). Vérifications internes déjà faites : ${checks.join(" ; ") || "aucune donnée transactionnelle ce jour-là"}.`,
      claim_type: "measured",
    });
  }

  return {
    facts,
    data: {
      found: true,
      class_key,
      narrative,
      impact,
      top_days: days.slice(0, 6),
      unexplained_days: unexplainedDays,
      existing_dispositifs: existingDispositifs,
      sources: [
        "mart.fct_location_context_daily × mart.fct_client_day_residual × mart.fct_client_daily_performance (tercile haut des visiteurs, 730 j)",
        "raw.client_transactions (amplitude horaire + mix produits des jours inexpliqués)",
        "analytics.day_class_impacts (pilule du motif, politique rowToImpact)",
        "analytics.best_practices × analytics.action_commitments (dispositifs déjà documentés du motif, tier à la lecture)",
      ],
    },
  };
}
