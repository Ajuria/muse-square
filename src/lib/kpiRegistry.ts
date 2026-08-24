// src/lib/kpiRegistry.ts
//
// KPI REGISTRY — the ONE dictionary of measurable KPIs for the engagement loop (étape 3 validée
// 24/07, spec: docs/kpi-enjeu-mapping.md §1). Same unit BOTH sides: the card's claim (Enjeu pill,
// étape 4) and the commitment's before/after measurement (this lib) — never a pill in conversion
// tracked in CA.
//
// PRINCIPES VERROUILLÉS :
//  - kpi = f(type de carte, origin_driver) — JAMAIS de la stratégie choisie (le levier reste une
//    métadonnée d'apprentissage). `measured_metric` sur le commitment EST la clé (colonne existante,
//    codée 'revenue_residual' en dur avant l'étape 3 — pas de colonne kpi_key doublon, règle SST).
//  - 'revenue_residual' (K1) garde SA machinerie (residual z, VIF, verdict — commitmentResolve.ts) ;
//    ce registre ne mesure QUE les KPIs non-K1, en colonnes additives kpi_* (baseline / window /
//    delta / noise_se). Verdict par KPI LIVRÉ (15/08) : bande de bruit = sd journalier 30 j
//    pré-fenêtre (measureKpiDailySd) → SE = sd/√n × √VIF (LE MÊME VIF que K1) ; kpiVerdict (pur,
//    testé) rend met/missed/confounded avec les portes asymétriques de K1 (bruit + vacances).
//  - 'reputation' (K7) : AUCUNE série temporelle de VOTRE note Google dans l'entrepôt (vérifié
//    24/07 — seuls les concurrents suivis en ont une) → clé posée, mesure NULL, jamais un chiffre
//    inventé. S'active quand une source own-rating existera (GBP connect).
//
// Source unique des mesures non-K1 : mart.fct_client_daily_performance (colonnes vérifiées
// INFORMATION_SCHEMA 24/07). Baseline = moyenne journalière des 30 j AVANT la fenêtre ; window =
// moyenne journalière de la fenêtre ; delta_pct = (window − baseline) / |baseline|.
// NB anti-duplication : le mart porte des baselines précalculées pour CERTAINS kpis
// (visitors_baseline, discount_rate_baseline dans fct_client_sales_signals_daily) — non réutilisées
// À DESSEIN : ancrées à J (pas à la fenêtre du commitment) et définies par-KPI ; ici UNE définition
// uniforme (30 j pré-fenêtre) pour tous les KPIs, comparable entre eux. Distinct de
// lib/declaredMetrics.ts (métriques DÉCLARÉES par l'utilisateur, pas mesurées).

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const PERF = `${PROJECT}.mart.fct_client_daily_performance`;

// K9 : les marges déclarées viennent du propriétaire du log (jamais re-dérivées ici).
import { getDeclaredFamilyMargins, getDeclaredMarginPct, familySlug } from "./ai/corrections";

// CLÉS = le vocabulaire EXISTANT de l'app (DRIVER_SET de /api/commitments + metrics du moteur
// Type B : footfall/conversion/basket) — jamais un 3e vocabulaire (audit anti-duplication 26/07).
export type KpiKey =
  | "revenue_residual"   // K1 — owned by commitmentResolve (residual machinery), not measured here
  | "footfall"           // K2 — daily_visitors
  | "conversion"         // K3 — daily_conversion_rate
  | "basket"             // K4 — daily_avg_basket
  | "transactions"       // K5 — daily_transactions
  | "discount"           // K6 — daily_discount_total
  | "reputation"         // K7 — no own-venue source yet: key exists, measurement stays NULL
  | "family_revenue"     // K8 — CA journalier d'UNE famille produit (événements, 03/08) : PARAMÉTRÉ
                         //      (nom de famille via saved_items.kpi_family, rejoint par saved_item_id)
                         //      → mesuré par measureFamilyRevenueMean, PAS par KPI_EXPR.
  | "profit_estimated";  // K9 — profit journalier ESTIMÉ (24/08, marges par famille) : Σ CA_famille
                         //      × marge déclarée sur les familles déclarées (marge globale = repli
                         //      100 % du CA) → mesuré par profitEstimatedDaily/measureProfit*, PAS
                         //      par KPI_EXPR. Sans marge déclarée : mesure NULL, jamais inventée.

// ── KPI → COLONNE : LE foyer unique (22/08) ────────────────────────────────────────────────
// Cette correspondance était écrite QUATRE fois : ici, deux `CASE measured_metric WHEN …` dans
// dashboard.ts (réalisé de la fenêtre + mini-courbe par jour), et le dépivot `vals` du moteur de
// classes. Quatre copies d'une même phrase dérivent : il suffit qu'un mart renomme une colonne
// pour que trois surfaces sur quatre disent vrai. Un KPI de plus s'ajoute ICI et nulle part
// ailleurs — les trois consommateurs lisent cette table.
export const KPI_DAILY_COL: Partial<Record<KpiKey, string>> = {
  footfall: "daily_visitors",
  conversion: "daily_conversion_rate",
  basket: "daily_avg_basket",
  transactions: "daily_transactions",
  discount: "daily_discount_total",
};

/** Les KPI mesurables sur fct_client_daily_performance — l'ordre est stable (clé du map). */
export const KPI_PERF_KEYS = Object.keys(KPI_DAILY_COL) as KpiKey[];

/** `'footfall','conversion',…` — pour un `IN (…)` SQL. Jamais une liste retapée à la main. */
export function kpiKeyListSql(): string {
  return KPI_PERF_KEYS.map((k) => `'${k}'`).join(",");
}

/**
 * `CASE <metricExpr> WHEN 'footfall' THEN p.daily_visitors … END` — la valeur journalière du KPI
 * porté par la ligne. `metricExpr` est l'expression qui donne la clé (p. ex. `c.measured_metric`),
 * `alias` le préfixe de table des colonnes.
 */
export function kpiCaseSql(metricExpr: string, alias: string = "p"): string {
  const whens = KPI_PERF_KEYS.map((k) => `WHEN '${k}' THEN ${alias}.${KPI_DAILY_COL[k]}`).join(" ");
  return `CASE ${metricExpr} ${whens} END`;
}

// SQL expression per measurable KPI (daily mean over the period). NULL-safe: AVG ignores NULLs.
// DÉRIVÉE de KPI_DAILY_COL — plus jamais une seconde liste à tenir à jour.
const KPI_EXPR: Partial<Record<KpiKey, string>> = Object.fromEntries(
  KPI_PERF_KEYS.map((k) => [k, `AVG(${KPI_DAILY_COL[k]})`]),
) as Partial<Record<KpiKey, string>>;

// LE mot de chaque KPI — arbitré par l'owner le 23/08 (un concept = un mot, lexique) :
// chiffre d'affaires · ventes · panier moyen · nombre de visiteurs · taux de conversion.
// Les copies inline (tableau/insight/rapport/action-cards) MIROIRENT ces mots ; evolution.ts lit ici.
export const KPI_LABEL_FR: Record<KpiKey, string> = {
  revenue_residual: "chiffre d'affaires vs votre résultat habituel",
  footfall: "nombre de visiteurs/jour",
  conversion: "taux de conversion",
  basket: "panier moyen",
  transactions: "ventes/jour",
  discount: "€ remisés/jour",
  reputation: "note Google",
  family_revenue: "CA famille/jour",
  profit_estimated: "profit estimé/jour",
};

// ── Étape funnel par TYPE DE CARTE (owner 24/08, table validée telle quelle) ──────────────
// « Each card should be linked to a step in sales funnel » : l'étape que le GESTE de la carte
// fait bouger — pas celle où on la mesure le mieux. Consommateur : le coin barreau 2
// (dayClassRegistry.funnelCornerForCandidate — % mesuré de la classe de la carte sur cette
// étape, absolu en infobulle). K1 y figure pour la complétude : le coin des cartes K1 reste
// l'affaire de l'enjeu €/« € ce jour » (barreaux existants) — le barreau 2 les ignore, et
// sales_surge/down_wow restent driver-dynamiques via kpiKeyForOrigin, inchangé.
// weekly_briefing : hors funnel, volontairement absent (récapitulatif, pas de coin).
export const CARD_FUNNEL_STEP: Record<string, KpiKey> = {
  // K2 — nombre de visiteurs (le geste fait venir du monde)
  commercial_event_match: "footfall",
  foreign_tourism_signal: "footfall",
  low_competition_window: "footfall",
  competition_proximity: "footfall",
  same_bucket_saturation: "footfall",
  competition_pressure_spike: "footfall",
  audience_shift_opportunity: "footfall",
  calendar_audience_shift: "footfall",
  top_day_approaching: "footfall",
  weekend_opportunity: "footfall",
  weekend_vacation_low_comp: "footfall",
  mega_event_end: "footfall",
  competitor_event_launch: "footfall",
  competitor_event_ending: "footfall",
  mobility_disruption: "footfall",
  ft_peak_mobility: "footfall",
  weather_hazard_onset: "footfall",
  weather_improved: "footfall",
  weather_window_after_bad: "footfall",
  competitor_threat_direct: "footfall",
  competitor_positioning_brief: "footfall",
  competitor_positioning_gap: "footfall",
  competitor_reputation_strength: "footfall",
  review_solicitation: "footfall",
  // K3 — taux de conversion
  sales_traffic_not_converting: "conversion",
  // K4 — panier moyen (le geste joue sur la valeur du ticket)
  competitor_price_drop: "basket",
  competitor_price_increase: "basket",
  competitor_repricing_event: "basket",
  competitor_new_offering: "basket",
  // K5 — ventes (le geste fait des transactions)
  hour_share_move: "transactions",
  item_share_move: "transactions",
  offering_mix_shift: "transactions",
  client_dormant: "transactions",
  // K1 — chiffre d'affaires (la carte mesure le résultat final)
  sales_surge: "revenue_residual",
  sales_revenue_down_wow: "revenue_residual",
  sales_competition_cannibalization: "revenue_residual",
  sales_discount_no_lift: "revenue_residual",
};

// ── Événements (03/08, spec evenement-dossier § 1.3) — le KPI déclaré sur l'événement
// (saved_items.kpi) → la clé de mesure du registre. Foyer UNIQUE du mapping : les clients
// envoient event_kpi brut, le POST commitments traduit ici.
const EVENT_KPI: Record<string, KpiKey> = {
  revenue_residual: "revenue_residual",
  family_revenue: "family_revenue",
  tickets: "transactions",
  basket: "basket",
  visitors: "footfall",
  profit_estimated: "profit_estimated",
};
export function kpiKeyForEventKpi(eventKpi: string | null | undefined): KpiKey | null {
  const k = String(eventKpi || "").trim();
  return (k && EVENT_KPI[k]) || null;
}

// K8 — CA journalier moyen d'une famille produit sur une période (même référentiel que les
// movers : lignes raw.client_transactions). NULL-safe ; < 1 jour de ventes → null.
export async function measureFamilyRevenueMean(bq: any, location_id: string, family: string, start: string, end: string): Promise<{ value: number; n_days: number } | null> {
  const rows = await bq.query({
    query: `
      SELECT SUM(revenue) / COUNT(DISTINCT transaction_date) AS v, COUNT(DISTINCT transaction_date) AS n
      FROM \`${PROJECT}.raw.client_transactions\`
      WHERE location_id = @location_id AND item_category = @family
        AND transaction_date BETWEEN @start AND @end
    `,
    params: { location_id, family, start: bq.date(start), end: bq.date(end) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const row = (rows as any[])[0];
  const v = Number(row?.v ?? NaN);
  const n = Number(row?.n ?? 0);
  if (!Number.isFinite(v) || n < 1) return null;
  return { value: Math.round(v * 1000) / 1000, n_days: n };
}

// ── K9 — profit estimé (24/08, marges par famille) ──────────────────────────────────────────
// Série JOURNALIÈRE du profit estimé sur [start, end] : marges FAMILLE d'abord (Σ CA_famille ×
// marge/100 sur les familles déclarées, jointure par familySlug(item_category)), marge GLOBALE en
// repli (CA du jour × marge/100). Aucune marge déclarée → null — jamais un profit inventé.
// Même référentiel de lignes que K8 (raw.client_transactions) ; les marges sont lues au moment de
// la mesure (baseline ET fenêtre au même barème — la comparaison reste cohérente).
export async function profitEstimatedDaily(
  bq: any, location_id: string, start: string, end: string,
): Promise<Array<{ date: string; v: number }> | null> {
  const fams = await getDeclaredFamilyMargins(location_id).catch(() => []);
  const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
  if (fams.length) {
    const pctBySlug: Record<string, number> = {};
    for (const f of fams) pctBySlug[f.slug] = f.pct;
    const rows = await bq.query({
      query: `SELECT CAST(transaction_date AS STRING) AS d, item_category, SUM(revenue) AS v
              FROM \`${PROJECT}.raw.client_transactions\`
              WHERE location_id = @location_id AND transaction_date BETWEEN @start AND @end
              GROUP BY 1, 2`,
      params: { location_id, start: bq.date(start), end: bq.date(end) },
      location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
    const byDay: Record<string, number> = {};
    for (const r of rows as any[]) {
      const d = String(flat(r.d));
      const pct = pctBySlug[familySlug(String(flat(r.item_category) ?? ""))];
      if (byDay[d] == null) byDay[d] = 0;                       // jour de vente = jour mesuré,
      if (pct != null) byDay[d] += Number(flat(r.v) ?? 0) * (pct / 100);   // couvert ou pas
    }
    return Object.keys(byDay).sort().map((d) => ({ date: d, v: Math.round(byDay[d] * 100) / 100 }));
  }
  const g = await getDeclaredMarginPct(location_id).catch(() => null);
  if (!g) return null;
  const rows = await bq.query({
    query: `SELECT CAST(transaction_date AS STRING) AS d, SUM(revenue) AS v
            FROM \`${PROJECT}.raw.client_transactions\`
            WHERE location_id = @location_id AND transaction_date BETWEEN @start AND @end
            GROUP BY 1`,
    params: { location_id, start: bq.date(start), end: bq.date(end) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    date: String(flat(r.d)),
    v: Math.round(Number(flat(r.v) ?? 0) * (g.pct / 100) * 100) / 100,
  })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Moyenne + écart-type journaliers du profit estimé sur [start, end]. null = marges absentes. */
export async function measureProfitEstimatedStats(
  bq: any, location_id: string, start: string, end: string,
): Promise<{ mean: number; sd: number | null; n_days: number } | null> {
  const daily = await profitEstimatedDaily(bq, location_id, start, end);
  if (!daily || !daily.length) return null;
  const n = daily.length;
  const mean = daily.reduce((a, x) => a + x.v, 0) / n;
  let sd: number | null = null;
  if (n >= 2) {
    const variance = daily.reduce((a, x) => a + (x.v - mean) ** 2, 0) / (n - 1);
    sd = Math.sqrt(variance);
  }
  return { mean: Math.round(mean * 1000) / 1000, sd: sd != null ? Math.round(sd * 1000) / 1000 : null, n_days: n };
}

/** Baseline K9 = 30 j glissants AVANT la fenêtre (même convention que measureKpiBaseline). */
export async function measureProfitBaseline(bq: any, location_id: string, window_start: string): Promise<number | null> {
  const end = new Date(window_start + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  const res = await measureProfitEstimatedStats(bq, location_id, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  return res && res.n_days >= 5 ? res.mean : null;
}

/** Baseline famille = 30 j glissants AVANT la fenêtre (même convention que measureKpiBaseline). */
export async function measureFamilyBaseline(bq: any, location_id: string, family: string, window_start: string): Promise<number | null> {
  const end = new Date(window_start + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const res = await measureFamilyRevenueMean(bq, location_id, family, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  return res && res.n_days >= 5 ? res.value : null;
}

// kpi = f(type de carte, driver). Drivers = DRIVER_SET de /api/commitments (conversion, basket,
// footfall, transactions). Cartes à KPI propre d'abord ; sinon le driver décide ; sinon K1.
const TYPE_KPI: Record<string, KpiKey> = {
  sales_traffic_not_converting: "conversion",
  sales_discount_no_lift: "discount",
  // Chantiers structurels : le motif nomme son KPI ; défaut K1 (poids CA du motif).
  structural_discount_no_lift: "discount",
  structural_traffic_high: "conversion",
  competitor_review_surge: "reputation",
  competitor_review_drop: "reputation",
  competitor_reputation_strength: "reputation",
  review_solicitation: "reputation",
};
// Le driver EST déjà la clé KPI (même vocabulaire) — validation d'appartenance seulement.
const DRIVER_KPI: Record<string, KpiKey> = {
  footfall: "footfall",
  conversion: "conversion",
  basket: "basket",
  transactions: "transactions",
};

export function kpiKeyForOrigin(origin_action_type: string | null | undefined, origin_driver: string | null | undefined): KpiKey {
  const t = String(origin_action_type || "").trim().toLowerCase();
  if (t && TYPE_KPI[t]) return TYPE_KPI[t];
  const d = String(origin_driver || "").trim().toLowerCase();
  if (d && DRIVER_KPI[d]) return DRIVER_KPI[d];
  return "revenue_residual";
}

export function isKpiMeasurable(key: KpiKey): boolean {
  return Boolean(KPI_EXPR[key]);
}

async function kpiMean(bq: any, location_id: string, key: KpiKey, start: string, end: string): Promise<{ value: number; n_days: number } | null> {
  const expr = KPI_EXPR[key];
  if (!expr) return null;
  const rows = await bq.query({
    query: `
      SELECT ${expr} AS v, COUNT(*) AS n
      FROM \`${PERF}\`
      WHERE location_id = @location_id
        AND transaction_date BETWEEN @start AND @end
    `,
    // bq.date() OBLIGATOIRE : un param string sur une colonne DATE = 0 lignes silencieuses
    // (le piège documenté CLAUDE.md ; même convention que commitmentResolve).
    params: { location_id, start: bq.date(start), end: bq.date(end) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const row = (rows as any[])[0];
  const v = Number(row?.v ?? NaN);
  const n = Number(row?.n ?? 0);
  if (!Number.isFinite(v) || n < 1) return null;
  return { value: Math.round(v * 1000) / 1000, n_days: n };
}

/** Baseline = 30 j glissants AVANT la fenêtre (exclus). >= 5 jours de données requis, sinon null. */
export async function measureKpiBaseline(bq: any, location_id: string, key: KpiKey, window_start: string): Promise<number | null> {
  if (!isKpiMeasurable(key)) return null;
  const end = new Date(window_start + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  const res = await kpiMean(bq, location_id, key, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  return res && res.n_days >= 5 ? res.value : null;
}

/** Valeur fenêtre = moyenne journalière sur [window_start, window_end]. */
export async function measureKpiWindow(bq: any, location_id: string, key: KpiKey, window_start: string, window_end: string): Promise<number | null> {
  if (!isKpiMeasurable(key)) return null;
  const res = await kpiMean(bq, location_id, key, window_start, window_end);
  return res ? res.value : null;
}

/** Écart-type JOURNALIER du KPI sur les 30 j pré-fenêtre (même convention que la baseline).
 *  >= 5 jours requis, sinon null — jamais une bande de bruit inventée sur 2 points. */
export async function measureKpiDailySd(bq: any, location_id: string, key: KpiKey, window_start: string): Promise<number | null> {
  const col = KPI_DAILY_COL[key];
  if (!col) return null;
  const end = new Date(window_start + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  const rows = await bq.query({
    query: `SELECT STDDEV_SAMP(${col}) AS sd, COUNT(${col}) AS n FROM \`${PERF}\`
            WHERE location_id = @location_id AND transaction_date BETWEEN @start AND @end`,
    params: { location_id, start: bq.date(start.toISOString().slice(0, 10)), end: bq.date(end.toISOString().slice(0, 10)) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const row = (rows as any[])[0];
  const sd = Number(row?.sd ?? NaN), n = Number(row?.n ?? 0);
  return Number.isFinite(sd) && n >= 5 ? sd : null;
}

/** Variante K8 : écart-type des CA JOURNALIERS d'une famille sur les 30 j pré-fenêtre. */
export async function measureFamilyDailySd(bq: any, location_id: string, family: string, window_start: string): Promise<number | null> {
  const end = new Date(window_start + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  const rows = await bq.query({
    query: `SELECT STDDEV_SAMP(v) AS sd, COUNT(*) AS n FROM (
              SELECT SUM(revenue) AS v FROM \`${PROJECT}.raw.client_transactions\`
              WHERE location_id = @location_id AND item_category = @family
                AND transaction_date BETWEEN @start AND @end
              GROUP BY transaction_date)`,
    params: { location_id, family, start: bq.date(start.toISOString().slice(0, 10)), end: bq.date(end.toISOString().slice(0, 10)) },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const row = (rows as any[])[0];
  const sd = Number(row?.sd ?? NaN), n = Number(row?.n ?? 0);
  return Number.isFinite(sd) && n >= 5 ? sd : null;
}

/** Verdict par KPI (chantier 15/08) — PURE, miroir exact de la structure K1 :
 *  provisoire = fenêtre >= objectif ; portes ASYMÉTRIQUES sur les « met » seulement
 *  (un raté n'est jamais requalifié) : (a) hausse vs habituel indistinguable du bruit
 *  (< 1 × SE corrigée autocorrélation) -> confounded, comme le z<1.0 du chemin pct-K1 ;
 *  (b) part vacances matérielle -> confounded, même porte que K1. */
export function kpiVerdict(args: {
  realized: number; baseline: number; goal: number;
  se: number | null;             // sd_journalier/racine(n) x racine(VIF) — null = bande inconnue
  materialConfound: boolean;     // material_holiday_share >= MATERIAL_SHARE (calcul K1 réutilisé)
}): "met" | "missed" | "confounded" {
  const provisional = args.realized >= args.goal ? "met" : "missed";
  if (provisional === "missed") return "missed";
  if (args.se != null && args.realized - args.baseline < 1.0 * args.se) return "confounded";
  if (args.materialConfound) return "confounded";
  return "met";
}

export function kpiDeltaPct(baseline: number | null, windowValue: number | null): number | null {
  if (baseline == null || windowValue == null || !Number.isFinite(baseline) || Math.abs(baseline) < 1e-9) return null;
  return Math.round(((windowValue - baseline) / Math.abs(baseline)) * 1000) / 10;
}
