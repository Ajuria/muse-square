// Provider « Reproduire le dispositif gagnant » — la matière d'ENQUÊTE d'un motif structurel
// (atelier des mécanismes, docs/atelier-mecanismes-spec.md). Même pattern que les autres
// familles : UN provider, réutilisé par la page profonde aujourd'hui et par le prompt Q&A du
// mode enquête ensuite — la matière ne peut pas diverger entre l'écran et le chat.
//
// CLASSES COUVERTES (03/08) : les trois motifs d'IDENTIFICATION — traffic_high, followed_activity_high,
// competition_low (voir CLASS_CONFIG : appartenance-jour copiée du moteur + libellés + question de
// fond). Autres classes → { found:false, reason } : absence honnête, jamais un calcul improvisé
// sur une classe dont l'appartenance-jour n'est pas encodée ici.
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
import { getDayClassImpacts, dayClassMembersSql, WEATHER_DAY_CLASSES, TERCILE_DAY_CLASSES, OTHER_DAY_CLASSES, type DayClassImpact } from "../kpi/dayClassRegistry";
import { listClassDispositifs, dispositifStateFr, type ClassDispositif } from "../dispositifs/bestPractices";
import type { FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";

// ── Classes couvertes (03/08 : les 3 motifs d'IDENTIFICATION — le registre identification de
// structuralCardCopyFr). L'appartenance-jour de CHAQUE classe est la copie mono-lieu EXACTE de
// dayClassAggregateSql (dayClassRegistry) — jamais un seuil réinventé (leçon low_competition_window) :
//  - traffic_high : tercile haut de VOS visiteurs mesurés (vis_t2, vmax>vmin) ;
//  - followed_activity_high : tercile haut des jours d'activité NON NULLE de vos suivis
//    (sv_t2 sur IF(m>0,m,NULL), sv_distinct>1 — expo permanente/uniforme → pas de classe) ;
//  - competition_low : tercile BAS de competition_index_local (comp_t1, max>min).
// Chaque classe porte ses libellés et sa question de fond — la page et le mode enquête les lisent
// dans class_meta, aucune copie « affluence » codée en dur ailleurs.
interface ClassMeta {
  chip_fr: string;
  noun_fr: string;           // « jours de pointe » — s'insère après « vos »
  corner_label_fr: string;   // sous la pilule €/an
  job_question_fr: string;   // la question de fond (page + system enquête)
  // Classe définie par l'activité des suivis : les jours « sans facteur connu » NOMMENT les
  // événements suivis actifs ce jour-là (vérifié 03/08 : les 5 jours inexpliqués de Muse Square
  // étaient une semaine de chevauchement d'expositions — « variation ordinaire » aurait menti).
  followed_events?: boolean;
}

const DAY_SELECT = `SELECT FORMAT_DATE('%Y-%m-%d', j.date) AS date, j.v, ROUND(j.ca, 0) AS ca, ROUND(j.gap, 0) AS gap, j.sch, j.we, j.heat`;
const DAY_BASE = `
      SELECT c.date, perf.daily_visitors AS v, perf.daily_revenue AS ca,
             r.daily_revenue - r.expected_revenue AS gap,
             c.is_school_holiday_flag AS sch, c.is_weekend_flag AS we,
             (COALESCE(c.lvl_heat, 0) >= 1) AS heat`;
const DAY_TAIL = `
      WHERE c.location_id = @location_id
        AND c.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND c.date <= CURRENT_DATE()`;

const CLASS_CONFIG: Record<string, ClassMeta & { days_sql: string }> = {
  traffic_high: {
    chip_fr: "Affluence",
    noun_fr: "jours de pointe",
    corner_label_fr: "jours de pointe",
    job_question_fr: "qu'est-ce qui fait réussir une journée de pointe chez vous — et est-ce écrit, pour que l'équipe le rejoue à chaque pic annoncé ?",
    days_sql: `
      WITH j AS (${DAY_BASE}, perf.daily_visitors AS m
        FROM \`${PROJECT}.semantic.vw_insight_event_location_context\` c
        JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
          ON r.location_id = c.location_id AND r.date = c.date
        LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
          ON perf.location_id = c.location_id AND perf.transaction_date = c.date
        ${DAY_TAIL}
      ),
      th AS (SELECT APPROX_QUANTILES(m, 3)[OFFSET(2)] AS t2, MIN(m) AS mmin, MAX(m) AS mmax FROM j)
      ${DAY_SELECT}
      FROM j, th
      WHERE j.m IS NOT NULL AND th.mmax > th.mmin AND j.m >= th.t2
      ORDER BY j.m DESC
    `,
  },
  followed_activity_high: {
    chip_fr: "Suivis",
    noun_fr: "jours d'activité forte chez vos suivis",
    corner_label_fr: "activité des suivis",
    job_question_fr: "qu'est-ce que vous faites ces jours-là pour capter ce public — et est-ce écrit, pour le rejouer à chaque événement annoncé chez vos suivis ?",
    followed_events: true,
    days_sql: `
      WITH sv AS (
        SELECT d AS date, COUNT(*) AS active_ct
        FROM \`${PROJECT}.semantic.vw_insight_event_competitor_signals\` s,
          UNNEST(GENERATE_DATE_ARRAY(
            s.event_date,
            LEAST(COALESCE(s.event_date_end, s.event_date), DATE_ADD(s.event_date, INTERVAL 366 DAY))
          )) AS d
        WHERE s.entity_is_followed = TRUE AND s.event_date IS NOT NULL AND s.location_id = @location_id
        GROUP BY d
      ),
      j AS (${DAY_BASE}, COALESCE(sv.active_ct, 0) AS m
        FROM \`${PROJECT}.semantic.vw_insight_event_location_context\` c
        JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
          ON r.location_id = c.location_id AND r.date = c.date
        LEFT JOIN sv ON sv.date = c.date
        LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
          ON perf.location_id = c.location_id AND perf.transaction_date = c.date
        ${DAY_TAIL}
      ),
      th AS (SELECT APPROX_QUANTILES(IF(m > 0, m, NULL), 3)[OFFSET(2)] AS t2, COUNT(DISTINCT IF(m > 0, m, NULL)) AS dn FROM j)
      ${DAY_SELECT}
      FROM j, th
      WHERE j.m > 0 AND th.dn > 1 AND j.m >= th.t2
      ORDER BY j.m DESC, j.date DESC
    `,
  },
  competition_low: {
    chip_fr: "Activité du périmètre",
    noun_fr: "jours de faible activité dans votre périmètre",
    corner_label_fr: "périmètre peu actif",
    job_question_fr: "qu'est-ce que vous faites ces jours-là pour en profiter — et est-ce écrit, pour le rejouer à chaque fenêtre calme ?",
    days_sql: `
      WITH j AS (${DAY_BASE}, f.competition_index_local AS m
        FROM \`${PROJECT}.semantic.vw_insight_event_location_context\` c
        JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
          ON r.location_id = c.location_id AND r.date = c.date
        LEFT JOIN \`${PROJECT}.mart.fct_location_context_features_daily\` f
          ON f.location_id = c.location_id AND f.date = c.date
          AND f.date >= DATE_SUB(CURRENT_DATE(), INTERVAL 730 DAY) AND f.date <= CURRENT_DATE()
        LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
          ON perf.location_id = c.location_id AND perf.transaction_date = c.date
        ${DAY_TAIL}
      ),
      th AS (SELECT APPROX_QUANTILES(m, 3)[OFFSET(1)] AS t1, MIN(m) AS mmin, MAX(m) AS mmax FROM j)
      ${DAY_SELECT}
      FROM j, th
      WHERE j.m IS NOT NULL AND th.mmax > th.mmin AND j.m <= th.t1
      ORDER BY j.m ASC, j.date DESC
    `,
  },
};

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
  // Classe suivis uniquement : les événements suivis actifs ce jour-là, tri par durée
  // CROISSANTE (un accrochage court est discriminant, une expo permanente ne l'est pas), 3 max.
  followed_events: Array<{ entity: string; label: string; from: string; to: string }>;
  followed_events_total: number;
  // Cercle 1 (03/08) — les MOVERS produits du jour : écart € par famille vs SA moyenne
  // journalière sur l'historique du lieu (référentiel dit dans la phrase — tous jours
  // confondus, v1), les deux sens, familles à zéro incluses, top 3 par |écart|. Le « QUOI est
  // chez nous » du cas documentaire-avocat : une famille qui porte l'écart du jour donne à
  // l'enquête une question précise au lieu d'une question ouverte.
  movers: Array<{ category: string; rev: number; usual: number; gap_eur: number }>;
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
    // Libellés + question de fond du motif — la page et le system enquête les lisent ICI,
    // aucune copie « affluence » codée en dur ailleurs.
    class_meta?: ClassMeta;
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
      tier: "prouvee" | "declaree" | "ecarte";   // ecarte = effet négatif prouvé (27/08)
      state_fr: string;                          // l'état en toutes lettres (dispositifStateFr — LA grammaire)
      in_test: boolean;
      created_date: string;
    }>;
    sources?: string[];
  };
}

// 23/08 (arbitrage owner, point 5 du plan cartes) : la porte s'ouvre à TOUTE classe mesurée par
// le moteur, pas seulement aux trois motifs d'identification. Pour une classe hors CLASS_CONFIG :
//  - appartenance-jour = class_days du moteur lui-même (dayClassMembersSql) — aucun seuil recopié ;
//  - nom = label_fr du registre (« jours de pluie marquée », s'insère après « vos ») ;
//  - question de fond = les fragments déjà approuvés de cette page, sans présumer du signe.
// Les cartes structurelles gardent leurs deux registres (identification / correctif,
// doctrine 01/08) : seule l'ENTRÉE dans l'atelier change.
const FAMILY_CHIP_FR: Record<string, string> = {
  weather: "Météo", calendar: "Calendrier", competition: "Concurrence", tourism: "Tourisme",
  events: "Événements", mobility: "Mobilité", suivis: "Suivis", traffic: "Affluence",
};
function genericClassConfig(class_key: string): (ClassMeta & { days_sql: string }) | null {
  const w = WEATHER_DAY_CLASSES.find((c) => c.key === class_key);
  const t = TERCILE_DAY_CLASSES.find((c) => c.key === class_key);
  const o = OTHER_DAY_CLASSES.find((c) => c.key === class_key);
  const label = w?.label_fr || t?.label_fr || o?.label_fr;
  if (!label) return null;
  const family = w ? "weather" : (t?.family || o?.family || "");
  return {
    chip_fr: FAMILY_CHIP_FR[family] || family,
    noun_fr: label,
    corner_label_fr: label.replace(/^jours (de |d'|d’|à )?/, ""),
    job_question_fr: "qu'est-ce que vous faites ces jours-là — et est-ce écrit, pour le rejouer ?",
    days_sql: `
      WITH j AS (${DAY_BASE}, 1 AS m
        FROM \`${PROJECT}.semantic.vw_insight_event_location_context\` c
        JOIN \`${PROJECT}.semantic.vw_insight_event_day_residual\` r
          ON r.location_id = c.location_id AND r.date = c.date
        JOIN (${dayClassMembersSql()}) cd ON cd.date = c.date
        LEFT JOIN \`${PROJECT}.mart.fct_client_daily_performance\` perf
          ON perf.location_id = c.location_id AND perf.transaction_date = c.date
        ${DAY_TAIL}
      )
      ${DAY_SELECT}
      FROM j
      ORDER BY j.gap DESC, j.date DESC
    `,
  };
}

// Le NOM approuvé d'une classe (noun_fr, « s'insère après vos ») — pour toute phrase qui
// nomme le signal d'un dispositif (contre-indication du chat, P-axe 27/08). Lit les MÊMES
// configs que l'atelier (CLASS_CONFIG + génériques) : zéro copie, un renommage de classe
// suit partout.
export function classNounFr(class_key: string | null | undefined): string | null {
  if (!class_key) return null;
  const cfg = CLASS_CONFIG[class_key] || genericClassConfig(class_key);
  return cfg ? cfg.noun_fr : null;
}

export async function dispositifFamily(bq: any, location_id: string, class_key: string): Promise<DispositifFamilyResult> {
  const cfg = CLASS_CONFIG[class_key] || genericClassConfig(class_key);
  if (!cfg) {
    return { facts: [], data: { found: false, reason: "Motif inconnu du moteur de classes — aucune appartenance-jour mesurée pour lui." } };
  }

  // Q1 — les jours de la classe (l'appartenance EXACTE du moteur, voir CLASS_CONFIG) + flags
  // environnementaux + gap résiduel. Une requête.
  const [dayRows] = await bq.query({
    query: cfg.days_sql,
    params: { location_id, class_key },
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
  if (!days.length) return { facts: [], data: { found: false, reason: "Pas assez d'historique mesuré sur ce lieu pour ce motif." } };

  // 23/08 : la dimension PROPRE de la classe n'explique pas ses propres jours (vacances
  // scolaires → « 100 % expliqués par les vacances » était une tautologie).
  const SELF_ENV: Record<string, "heat" | "vacances"> = { school_holiday: "vacances", heat_25_27: "heat", heat_28_plus: "heat" };
  const self = SELF_ENV[class_key];
  const unexplained = days.filter((d) => (self === "heat" || !d.heat) && (self === "vacances" || !d.vacances) && !d.weekend);
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
  let evRows: any[] = [];
  let moversRows: any[] = [];
  if (exDates.length) {
    // Classe suivis : nommer les événements suivis actifs sur les jours inexpliqués, tri par
    // durée CROISSANTE (le court est discriminant), dédoublonné par event_name (crawl le plus
    // récent). Colonnes vérifiées le 03/08 : competitor_name, event_name, event_date(_end).
    const evP = cfg.followed_events
      ? bq.query({
          query: `SELECT date, competitor_name, event_name, efrom, eto FROM (
                    SELECT FORMAT_DATE('%Y-%m-%d', d) AS date, s.competitor_name, s.event_name,
                           FORMAT_DATE('%Y-%m-%d', s.event_date) AS efrom,
                           FORMAT_DATE('%Y-%m-%d', COALESCE(s.event_date_end, s.event_date)) AS eto,
                           DATE_DIFF(COALESCE(s.event_date_end, s.event_date), s.event_date, DAY) AS span
                    FROM \`${PROJECT}.semantic.vw_insight_event_competitor_signals\` s,
                      UNNEST(GENERATE_DATE_ARRAY(
                        s.event_date,
                        LEAST(COALESCE(s.event_date_end, s.event_date), DATE_ADD(s.event_date, INTERVAL 366 DAY))
                      )) AS d
                    WHERE s.entity_is_followed = TRUE AND s.event_date IS NOT NULL AND s.location_id = @location_id
                      AND d IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', x) FROM UNNEST(@dates) AS x))
                    -- Identité par la CLÉ (lieu, plage de dates) — pas le libellé : la même expo
                    -- existe sous 3 titres proches ; le nom le plus court est gardé.
                    QUALIFY ROW_NUMBER() OVER (
                      PARTITION BY d, s.competitor_name, s.event_date, COALESCE(s.event_date_end, s.event_date)
                      ORDER BY LENGTH(s.event_name) ASC, s.crawled_at DESC
                    ) = 1
                  )
                  ORDER BY date, span ASC`,
          params: { location_id, dates: exDates }, types: { dates: ["STRING"] }, location: "EU",
        })
      : Promise.resolve([[] as any[]]);
    // Movers produits (cercle 1) : CA de chaque famille le jour dit vs SA moyenne journalière
    // (CA total de la famille / nombre de jours de vente du lieu — tous jours confondus, v1).
    // CROSS JOIN dates × familles pour que l'absence totale d'une famille compte comme mover.
    const moversP = bq.query({
      query: `WITH trading_days AS (
                SELECT COUNT(DISTINCT transaction_date) AS n
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id = @location_id
              ),
              base AS (
                SELECT item_category, SUM(revenue) / (SELECT n FROM trading_days) AS avg_day_rev
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id = @location_id AND item_category IS NOT NULL
                GROUP BY 1
              ),
              day_cat AS (
                SELECT FORMAT_DATE('%Y-%m-%d', transaction_date) AS date, item_category, SUM(revenue) AS rev
                FROM \`${PROJECT}.raw.client_transactions\`
                WHERE location_id = @location_id AND item_category IS NOT NULL
                  AND transaction_date IN UNNEST(ARRAY(SELECT PARSE_DATE('%Y-%m-%d', x) FROM UNNEST(@dates) AS x))
                GROUP BY 1, 2
              )
              SELECT d AS date, b.item_category,
                     ROUND(COALESCE(dc.rev, 0), 0) AS rev,
                     ROUND(b.avg_day_rev, 0) AS usual,
                     ROUND(COALESCE(dc.rev, 0) - b.avg_day_rev, 0) AS gap
              FROM UNNEST(@dates) AS d
              CROSS JOIN base b
              LEFT JOIN day_cat dc ON dc.date = d AND dc.item_category = b.item_category
              QUALIFY ROW_NUMBER() OVER (PARTITION BY d ORDER BY ABS(COALESCE(dc.rev, 0) - b.avg_day_rev) DESC) <= 3
              ORDER BY date, ABS(gap) DESC`,
      params: { location_id, dates: exDates }, types: { dates: ["STRING"] }, location: "EU",
    });
    [[hoursRows], [mixRows], [usualRows], [evRows], [moversRows]] = await Promise.all([
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
      evP,
      moversP,
    ]);
  }
  const hoursByDate = new Map((hoursRows as any[]).map((h) => [String(flat(h.date)), h]));
  const evByDate = new Map<string, any[]>();
  for (const r of evRows as any[]) {
    const k = String(flat(r.date));
    if (!evByDate.has(k)) evByDate.set(k, []);
    evByDate.get(k)!.push(r);
  }
  const usualTop = (usualRows as any[]).map((u) => ({ category: String(flat(u.item_category)), pct: Number(flat(u.pct)) }));
  const unexplainedDays: UnexplainedDay[] = unexplained.slice(0, 5).map((d) => {
    const h = hoursByDate.get(d.date);
    const evs = evByDate.get(d.date) || [];
    return {
      ...d,
      hour_min: h ? Number(flat(h.hmin)) : null,
      hour_max: h ? Number(flat(h.hmax)) : null,
      tickets: h ? Number(flat(h.n)) : null,
      top_categories: (mixRows as any[])
        .filter((m) => String(flat(m.date)) === d.date)
        .map((m) => ({ category: String(flat(m.item_category)), pct: Number(flat(m.pct)) })),
      usual_top_categories: usualTop,
      followed_events: evs.slice(0, 3).map((e) => ({
        entity: String(flat(e.competitor_name) ?? ""),
        label: String(flat(e.event_name) ?? ""),
        from: String(flat(e.efrom) ?? ""),
        to: String(flat(e.eto) ?? ""),
      })),
      followed_events_total: evs.length,
      movers: (moversRows as any[])
        .filter((m) => String(flat(m.date)) === d.date)
        .map((m) => ({
          category: String(flat(m.item_category) ?? ""),
          rev: Number(flat(m.rev) ?? 0),
          usual: Number(flat(m.usual) ?? 0),
          gap_eur: Number(flat(m.gap) ?? 0),
        })),
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
    // L'état en toutes lettres par LA grammaire unique (bestPractices.dispositifStateFr) —
    // le noun du motif est celui de CETTE enquête (cfg.noun_fr), le dispositif y appartient.
    state_fr: dispositifStateFr(p, cfg.noun_fr),
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
    fact_fr: `Motif « ${cfg.noun_fr} » : ${n} jours mesurés sur votre historique, dont ${narrative.n_env} arrivés avec la chaleur, les vacances ou le week-end (chaleur ${narrative.pct_heat} %, vacances ${narrative.pct_vacances} %, week-end ${narrative.pct_weekend} % — co-occurrences mesurées, pas des causes).`,
    claim_type: "measured",
  });
  if (impact && (impact as any).eur_year != null) {
    const imp: any = impact;
    facts.push({
      fact_fr: `Poids du motif : ${Number(imp.eur_year) >= 0 ? "+" : "-"}${fi(imp.eur_year)} €/an (annualisé, mesuré sur ${fi(imp.n_days)} jours / ${fi(imp.span_months)} mois). Une journée de ce type vaut ${Number(imp.avg_gap_eur) >= 0 ? "+" : "-"}${fi(imp.avg_gap_eur)} € vs votre normale (médiane mesurée).`,
      claim_type: "measured",
      tier: imp.tier,
    });
    // Porte de concordance (owner go 28/08, spec indice-correlation) : l'accès direct à
    // l'atelier reste ouvert (documenter un dispositif EXISTANT est légitime), mais le fait
    // entre dans la liste blanche — l'enquête le dit, jamais ne propose de créer sur ce motif.
    if (imp.a_confirmer) {
      facts.push({
        fact_fr: `Signal à confirmer : l'effet mesuré de ce motif et son lien brut avec le CA pointent en sens opposés — un test mesuré doit trancher avant d'y bâtir un dispositif nouveau.`,
        claim_type: "measured",
      });
    }
  }
  for (const d of days.slice(0, 3)) {
    facts.push({
      fact_fr: `Jour du motif ${d.dow_fr} ${fd(d.date)} : ${d.visitors != null ? `${fi(d.visitors)} visiteurs, ` : ""}${fi(d.ca)} € de CA${d.gap_eur != null ? `, écart au CA attendu du jour ${Number(d.gap_eur) >= 0 ? "+" : "-"}${fi(d.gap_eur)} €` : ""} (${[d.heat ? "chaleur" : "", d.vacances ? "vacances" : "", d.weekend ? "week-end" : ""].filter(Boolean).join(" + ") || "aucun facteur connu"}).`,
      claim_type: "measured",
    });
  }
  for (const p of existingDispositifs) {
    facts.push({
      fact_fr: `Dispositif déjà documenté chez vous le ${fd(p.created_date)} : « ${p.practice_text} » — ${p.state_fr}${p.confirmation_test ? ` ; test : « ${p.confirmation_test} »` : ""}${p.in_test ? " ; engagement de test EN COURS (suivi sur Pulse)" : ""}.`,
      claim_type: "observed",
    });
  }
  for (const d of unexplainedDays) {
    const checks: string[] = [];
    if (d.hour_min != null && d.hour_max != null) checks.push(`ventes de ${d.hour_min} h à ${d.hour_max} h (${fi(d.tickets)} tickets — pas de fermeture anticipée)`);
    if (d.top_categories.length) checks.push(`mix produits du jour ${d.top_categories.map((c) => `${c.category} ${c.pct} %`).join(", ")} vs habituel ${d.usual_top_categories.map((c) => `${c.category} ${c.pct} %`).join(", ")}`);
    if (d.followed_events.length) checks.push(`${d.followed_events_total} événements actifs chez vos suivis ce jour-là (co-occurrence, pas une cause établie), les plus courts : ${d.followed_events.map((e) => `« ${e.label} » (${e.entity}, du ${fd(e.from)} au ${fd(e.to)})`).join(", ")}`);
    if (d.movers.length) checks.push(`mouvements produits du jour, chaque famille vs SA moyenne journalière sur votre historique (tous jours confondus) : ${d.movers.map((m) => `${m.category} ${m.gap_eur >= 0 ? "+" : "-"}${fi(m.gap_eur)} € (${fi(m.rev)} € contre ${fi(m.usual)} € en moyenne)`).join(", ")}`);
    facts.push({
      fact_fr: `Journée du motif sans facteur connu : ${d.dow_fr} ${fd(d.date)} — ${d.visitors != null ? `${fi(d.visitors)} visiteurs, ` : ""}${fi(d.ca)} € de CA, écart au CA attendu du jour ${Number(d.gap_eur ?? 0) >= 0 ? "+" : "-"}${fi(d.gap_eur)} € (poids faible si proche de 0 : possiblement la variation ordinaire). Vérifications internes déjà faites : ${checks.join(" ; ") || "aucune donnée transactionnelle ce jour-là"}.`,
      claim_type: "measured",
    });
  }

  return {
    facts,
    data: {
      found: true,
      class_key,
      class_meta: { chip_fr: cfg.chip_fr, noun_fr: cfg.noun_fr, corner_label_fr: cfg.corner_label_fr, job_question_fr: cfg.job_question_fr },
      narrative,
      impact,
      top_days: days.slice(0, 6),
      unexplained_days: unexplainedDays,
      existing_dispositifs: existingDispositifs,
      sources: [
        "semantic.vw_insight_event_location_context × semantic.vw_insight_event_day_residual × mart.fct_client_daily_performance (tercile haut des visiteurs, 730 j)",
        "raw.client_transactions (amplitude horaire + mix produits des jours inexpliqués)",
        "analytics.day_class_impacts (pilule du motif, politique rowToImpact)",
        "analytics.best_practices × analytics.action_commitments (dispositifs déjà documentés du motif, tier à la lecture)",
        ...(cfg.followed_events ? ["semantic.vw_insight_event_competitor_signals (appartenance suivis + événements actifs des jours inexpliqués)"] : []),
      ],
    },
  };
}
