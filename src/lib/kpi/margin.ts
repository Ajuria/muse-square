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
