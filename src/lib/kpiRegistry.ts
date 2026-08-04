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
//    delta). Le verdict à bande de bruit reste K1-only tant que les variances par KPI ne sont pas
//    établies (décision étape 3) — les kpi_* sont la matière de ce futur verdict par KPI.
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
  | "family_revenue";    // K8 — CA journalier d'UNE famille produit (événements, 03/08) : PARAMÉTRÉ
                         //      (nom de famille via saved_items.kpi_family, rejoint par saved_item_id)
                         //      → mesuré par measureFamilyRevenueMean, PAS par KPI_EXPR.

// SQL expression per measurable KPI (daily mean over the period). NULL-safe: AVG ignores NULLs.
const KPI_EXPR: Partial<Record<KpiKey, string>> = {
  footfall: "AVG(daily_visitors)",
  conversion: "AVG(daily_conversion_rate)",
  basket: "AVG(daily_avg_basket)",
  transactions: "AVG(daily_transactions)",
  discount: "AVG(daily_discount_total)",
};

export const KPI_LABEL_FR: Record<KpiKey, string> = {
  revenue_residual: "CA vs normale",
  footfall: "visiteurs/jour",
  conversion: "taux de conversion",
  basket: "panier moyen",
  transactions: "tickets/jour",
  discount: "€ remisés/jour",
  reputation: "note Google",
  family_revenue: "CA famille/jour",
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

export function kpiDeltaPct(baseline: number | null, windowValue: number | null): number | null {
  if (baseline == null || windowValue == null || !Number.isFinite(baseline) || Math.abs(baseline) < 1e-9) return null;
  return Math.round(((windowValue - baseline) / Math.abs(baseline)) * 1000) / 10;
}
