// src/lib/kpi/margin.ts — la marge brute MESURÉE côté app (docs/catalogue-de-couts-et-marge.md M7, M8).
// Une marge se montre avec sa couverture (part du CA brut dont le prix d'achat et le CA net HT sont connus) ;
// à ≥ 90 % la mesure remplace l'estimation déclarée ; entre 50 et 90 % les deux se montrent, nommées ;
// sous 50 % l'estimation mène. Seuil = var dbt `margin_coverage_min` (0,9) — un seul chiffre, deux foyers
// tenus ensemble (owner 11/09).
export const MARGIN_COVERAGE_MIN = 0.9;
export const MARGIN_COVERAGE_MIXED_MIN = 0.5;

export type MarginDisplayMode = "mesure" | "mixte" | "estime" | "aucune";

/** Mode d'affichage d'une marge selon sa couverture (ratio 0-1 ; null/0 = aucun prix d'achat). */
export function marginDisplayMode(coverage: number | null | undefined): MarginDisplayMode {
  if (coverage == null || !Number.isFinite(coverage) || coverage <= 0) return "aucune";
  if (coverage >= MARGIN_COVERAGE_MIN) return "mesure";
  if (coverage >= MARGIN_COVERAGE_MIXED_MIN) return "mixte";
  return "estime";
}

/** Part en % entier, jamais au-dessus de 100 ; null sans dénominateur. */
export function pctInt(num: number | null | undefined, den: number | null | undefined): number | null {
  if (num == null || den == null || !(den > 0)) return null;
  return Math.min(100, Math.round((num / den) * 100));
}

// ── LA marge brute MESURÉE d'un site sur 30 jours (11/09, docs/catalogue-de-couts-et-marge.md M7-M9) — le
// foyer de lecture partagé par Explorer (provider marge, réponse déterministe du chat) et le rapport :
// semantic.vw_insight_event_daily_margin (le site) et vw_insight_event_family_margin_daily (par famille),
// fenêtre = les 30 jours calendaires jusqu'à asOf ; jamais un chiffre recalculé ici. La couverture est
// TOUJOURS rendue avec la marge ; le mode (mesure | mixte | estime | aucune) se décide ici, une fois.
import { makeBQClient } from "../bq";

export interface MeasuredMarginFamily {
  family: string; revenue: number; revenue_net_ht: number | null; revenue_costed: number | null;
  gross_margin_ht: number | null; margin_rate_pct: number | null; coverage_pct: number | null;
  below_cost_lines: number; below_cost_revenue_ht: number | null;
}
export interface MeasuredMargin30d {
  window: { start: string; end: string; days: number };
  revenue: number; revenue_costed: number; revenue_net_ht_costed: number | null;
  gross_margin_ht: number | null; margin_rate_pct: number | null;
  coverage: number | null; coverage_pct: number | null; mode: MarginDisplayMode;
  below_cost_lines: number;
  families: MeasuredMarginFamily[];
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));

/** Composition PURE des lignes lues → la marge mesurée du site et de ses familles (testée sans BigQuery). */
export function composeMeasuredMargin(
  siteRows: Array<{ date: string; revenue: number | null; revenue_costed: number | null; revenue_net_ht_costed: number | null; gross_margin_ht: number | null; below_cost_lines: number | null }>,
  famRows: Array<{ family: string; revenue: number | null; revenue_net_ht: number | null; revenue_costed: number | null; revenue_net_ht_costed: number | null; gross_margin_ht: number | null; below_cost_lines: number | null; below_cost_revenue_ht: number | null }>,
  window: { start: string; end: string },
): MeasuredMargin30d {
  const sum = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, x) => a + (x == null ? 0 : x), 0);
  const revenue = sum(siteRows.map((r) => r.revenue));
  const revenue_costed = sum(siteRows.map((r) => r.revenue_costed));
  const netCosted = sum(siteRows.map((r) => r.revenue_net_ht_costed));
  const gm = siteRows.some((r) => r.gross_margin_ht != null) ? sum(siteRows.map((r) => r.gross_margin_ht)) : null;
  const coverage = revenue > 0 ? Math.min(1, revenue_costed / revenue) : null;
  const mode = marginDisplayMode(coverage);
  const families: MeasuredMarginFamily[] = famRows
    .map((r) => {
      const fr = r.revenue ?? 0, fc = r.revenue_costed ?? 0;
      const cov = fr > 0 ? Math.min(1, fc / fr) : null;
      return {
        family: r.family, revenue: fr, revenue_net_ht: r.revenue_net_ht, revenue_costed: r.revenue_costed,
        gross_margin_ht: r.gross_margin_ht, margin_rate_pct: pctInt(r.gross_margin_ht, r.revenue_net_ht_costed),
        coverage_pct: cov == null ? null : Math.round(cov * 1000) / 10,
        below_cost_lines: r.below_cost_lines ?? 0, below_cost_revenue_ht: r.below_cost_revenue_ht,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  return {
    window: { ...window, days: siteRows.length },
    revenue, revenue_costed, revenue_net_ht_costed: netCosted || null,
    gross_margin_ht: mode === "aucune" ? null : gm, margin_rate_pct: mode === "aucune" ? null : pctInt(gm, netCosted),
    coverage, coverage_pct: coverage == null ? null : Math.round(coverage * 1000) / 10, mode,
    below_cost_lines: sum(siteRows.map((r) => r.below_cost_lines)),
    families,
  };
}

/** Lecture : les deux vues en parallèle, fenêtre [asOf − 29 j, asOf] ; `dowSql` = filtre de jours optionnel (« AND EXTRACT(DAYOFWEEK FROM date) IN (1, 7) »). */
export async function readMeasuredMargin30d(bq: any, location_id: string, asOfIso: string, dowSql = ""): Promise<MeasuredMargin30d> {
  const PROJECT = "muse-square-open-data";
  const client = bq ?? makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const rows = (q: string) => client.query({ query: q, params: { location_id, as_of: asOfIso }, types: { location_id: "STRING", as_of: "STRING" }, location: "EU" })
    .then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const [site, fam] = await Promise.all([
    rows(`SELECT CAST(date AS STRING) AS date, revenue, revenue_costed, revenue_net_ht_costed, gross_margin_ht, below_cost_lines
          FROM \`${PROJECT}.semantic.vw_insight_event_daily_margin\`
          WHERE location_id = @location_id AND date BETWEEN DATE_SUB(DATE(@as_of), INTERVAL 29 DAY) AND DATE(@as_of)${dowSql}
          ORDER BY date`),
    rows(`SELECT item_category AS family, SUM(revenue) AS revenue, SUM(revenue_net_ht) AS revenue_net_ht, SUM(revenue_costed) AS revenue_costed,
                 SUM(revenue_net_ht_costed) AS revenue_net_ht_costed, SUM(gross_margin_ht) AS gross_margin_ht,
                 SUM(below_cost_lines) AS below_cost_lines, SUM(below_cost_revenue_ht) AS below_cost_revenue_ht
          FROM \`${PROJECT}.semantic.vw_insight_event_family_margin_daily\`
          WHERE location_id = @location_id AND transaction_date BETWEEN DATE_SUB(DATE(@as_of), INTERVAL 29 DAY) AND DATE(@as_of)${dowSql.replace(/\bdate\b/g, "transaction_date")}
          GROUP BY 1`),
  ]);
  const start = new Date(asOfIso + "T12:00:00Z"); start.setUTCDate(start.getUTCDate() - 29);
  return composeMeasuredMargin(
    (site as any[]).map((r) => ({ date: String(flat(r.date)), revenue: num(r.revenue), revenue_costed: num(r.revenue_costed), revenue_net_ht_costed: num(r.revenue_net_ht_costed), gross_margin_ht: num(r.gross_margin_ht), below_cost_lines: num(r.below_cost_lines) })),
    (fam as any[]).map((r) => ({ family: String(flat(r.family) ?? ""), revenue: num(r.revenue), revenue_net_ht: num(r.revenue_net_ht), revenue_costed: num(r.revenue_costed), revenue_net_ht_costed: num(r.revenue_net_ht_costed), gross_margin_ht: num(r.gross_margin_ht), below_cost_lines: num(r.below_cost_lines), below_cost_revenue_ht: num(r.below_cost_revenue_ht) })).filter((r) => r.family),
    { start: start.toISOString().slice(0, 10), end: asOfIso },
  );
}
