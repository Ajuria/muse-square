// L'OBJECTIF EN VENTES d'une carte ventes (owner 08/09 : « Sell + w, x and y (total of z) » —
// « total number of sales of family or product », label « Objectif », pas « Enjeu » : ce n'est pas
// en €). UNE source pour la rangée Agir et la page Consulter : ce champ, posé par monitor sur la
// carte ; les deux surfaces le rendent tel quel.
//
// ESTIMATION (owner : « labelled as an estimate until the dbt increment gives expected units per
// family and weekday ») : ventes = écart € ÷ prix unitaire réalisé ce jour (CA ÷ unités de la
// famille). `baseline_units_per_day` de la décomposition N'EST PAS utilisé : son référent (moyenne
// de tous les jours) n'est pas celui de `expected_revenue` (jour de semaine + tendance) — Coffee au
// 06/09 : 228 unités pour 214 « de base » mais +327 € sur l'attendu.
//
// Ce que la carte porte décide :
// - décomposition (cartes jour : sales_surge, …) → une ligne par famille dans le SENS de l'écart
//   du jour (une hausse liste ce qui a porté, une baisse ce qui a manqué), les trois plus grandes,
//   total = ces trois lignes (« total of z » = le total de w, x et y) ;
// - produit (item_share_move : item_revenue, expected_item_revenue, unit_price) → une ligne ;
// - sinon null (offering_mix_shift, item_absent_regular : le payload n'a ni unités ni prix — après
//   l'incrément dbt).
export interface ObjectifVentesLigne { label: string; ventes: number }
export interface ObjectifVentes { estime: true; sens: "hausse" | "baisse"; total: number; lignes: ObjectifVentesLigne[] }

const num = (v: unknown): number | null => {
  const x = v && typeof v === "object" && "value" in (v as any) ? (v as any).value : v;
  const n = typeof x === "number" ? x : x == null || x === "" ? NaN : Number(x);
  return Number.isFinite(n) ? n : null;
};

export function objectifVentes(candidate: any): ObjectifVentes | null {
  if (!candidate) return null;
  const dec = candidate.decomposition;
  const fams: any[] = dec && Array.isArray(dec.top_families) ? dec.top_families : [];
  if (fams.length) {
    const gapDay = num(dec.gap_eur);
    const sens: "hausse" | "baisse" = gapDay != null ? (gapDay >= 0 ? "hausse" : "baisse") : "hausse";
    const lignes: ObjectifVentesLigne[] = [];
    for (const f of fams) {
      const rev = num(f.revenue), units = num(f.units), delta = num(f.delta_eur);
      const label = String(f.family || "").trim();
      if (!label || rev == null || units == null || delta == null || units <= 0 || rev <= 0) continue;
      if (sens === "hausse" ? delta <= 0 : delta >= 0) continue;
      const prix = rev / units;
      const ventes = Math.round(Math.abs(delta) / prix);
      if (ventes >= 1) lignes.push({ label, ventes });
    }
    if (!lignes.length) return null;
    lignes.sort((a, b) => b.ventes - a.ventes);
    // « total of z » (owner) = le total de w, x et y — les lignes montrées, jamais plus que ce qu'on lit.
    const shown = lignes.slice(0, 3);
    return { estime: true, sens, total: shown.reduce((s, l) => s + l.ventes, 0), lignes: shown };
  }
  const dp = candidate.data_payload || {};
  const itemRev = num(dp.item_revenue), itemExp = num(dp.expected_item_revenue), prix = num(dp.unit_price);
  const label = String(dp.item_description || "").trim();
  if (label && itemRev != null && itemExp != null && prix != null && prix > 0) {
    const delta = itemRev - itemExp;
    const ventes = Math.round(Math.abs(delta) / prix);
    if (ventes < 1) return null;
    return { estime: true, sens: delta >= 0 ? "hausse" : "baisse", total: ventes, lignes: [{ label, ventes }] };
  }
  return null;
}
