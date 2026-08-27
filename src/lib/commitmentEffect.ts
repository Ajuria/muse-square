// src/lib/commitmentEffect.ts
// L'EFFET d'un engagement, mesuré SUR SON KPI — le foyer unique (correctif owner 27/08).
//
// Le défaut mesuré : la carte journal et le planificateur lisaient window_residual_pct/z (le
// résidu de CA, K1) pour TOUT engagement, alors que le test porte sur measured_metric. Sur le
// compte owner : corner testé sur family_revenue — la carte disait −23,2 % / −11,9 % (CA) là où
// la vraie mesure sur le KPI choisi est −50,2 % / −78,3 %. Sous-estimation d'un facteur 2 à 6,
// et le seuil de preuve calculé sur la mauvaise série.
//
// LA RÈGLE, une seule : K1 (revenue_residual, ou metric absent — l'historique pré-colonne) se lit
// sur window_residual_pct/z ; tout autre KPI se lit sur kpi_delta_pct, avec
// z = (kpi_window_value − kpi_baseline) / kpi_noise_se — kpi_noise_se est la SE journalière
// VIF-corrigée écrite par commitmentResolve, et la porte officielle de kpiVerdict est 1×SE :
// le seuil de preuve |z| >= 1 (lexique l.17) est donc LE MÊME dans les deux régimes.
import { kpiLe, type KpiKey } from "./kpiRegistry";

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => {
  const f = flat(v);
  return f == null ? null : Number(f);
};

export interface CommitmentEffect {
  pct: number | null;            // l'effet en %, dans le référentiel de SON kpi
  z: number | null;              // l'écart en bandes de bruit, même seuil de preuve partout
  kpi: KpiKey;                   // la clé du KPI jugé
  /** Mention FR du KPI quand ce n'est pas le CA (« sur le CA famille ») — vide pour K1 :
   *  « vs votre résultat habituel » suffit quand le chiffre EST le CA. */
  kpi_mention_fr: string;
}

export function commitmentEffect(row: any): CommitmentEffect {
  const kpi = (String(flat(row.measured_metric) ?? "") || "revenue_residual") as KpiKey;
  if (kpi === "revenue_residual") {
    return { pct: num(row.window_residual_pct), z: num(row.window_residual_z), kpi, kpi_mention_fr: "" };
  }
  const base = num(row.kpi_baseline);
  const val = num(row.kpi_window_value);
  const se = num(row.kpi_noise_se);
  const z = base != null && val != null && se != null && se > 0 ? (val - base) / se : null;
  // Précision owner 27/08 : « sur le CA famille » est trop abstrait — quand la ligne porte la
  // famille (kpi_family, jointe depuis saved_items par le lecteur), la mention la NOMME.
  const fam = row.kpi_family != null ? String(flat(row.kpi_family) ?? "").trim() : "";
  const mention = kpi === "family_revenue" && fam ? `sur le CA de la famille ${fam}` : `sur ${kpiLe(kpi)}`;
  return { pct: num(row.kpi_delta_pct), z, kpi, kpi_mention_fr: mention };
}
