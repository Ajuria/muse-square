// src/lib/insightFamilies/espace.ts
// ESPACE family provider — « combien rapporte mon linéaire ? », « quel pôle est le plus rentable au
// mètre ? » (11/09, docs/espace-et-pole.md E4-E6, audit profit-grains § 6 A8). Lit LES foyers de
// lib/dispositifs/poleReading.ts : listPoles (les pôles déclarés) et listPoleSpace
// (semantic.vw_insight_event_pole_space pour les mètres et la Part de linéaire — en vigueur, sans vente
// nécessaire — et vw_insight_event_space_30d pour le CA et la marge par mètre et par m² quand le site vend).
// Rien n'est recalculé ici. Sans pôle mesuré : found=false, absence dite.
//
// Mots owner : linéaire, Part de linéaire, surface de vente, marge brute, « part de marge contre Part de
// linéaire » (docs/espace-et-pole.md § 4). Un pôle sans vente n'a pas d'€ par mètre : la ligne le dit,
// elle ne le remplit pas.
import type { FamilyResult, FamilyFact } from "./types";
import { listPoles, listPoleSpace, type PoleSpaceRow } from "../dispositifs/poleReading";

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const m1 = (n: number): string => String(Math.round(n * 10) / 10).replace(".", ",");
const pct1 = (share: number): string => String(Math.round(share * 1000) / 10).replace(".", ",") + " %";

export interface EspacePoleRow {
  pole_id: string; name: string; linear_m: number | null; linear_share: number | null; surface_m2: number | null; n_components: number | null;
  revenue: number | null; revenue_net_ht: number | null; revenue_share: number | null; margin_share: number | null;
  revenue_per_m: number | null; revenue_net_ht_per_m: number | null; margin_per_m: number | null;
  revenue_per_m2: number | null; revenue_net_ht_per_m2: number | null; margin_per_m2: number | null;
}

/** Composition PURE : pôles + espace → data + faits (testée sans BigQuery). */
export function composeEspaceFamily(
  poles: Array<{ dispositif_id: string; name: string }>,
  space: PoleSpaceRow[],
  date: string,
): FamilyResult {
  const site = space.find((r) => r.grain === "site") || null;
  const rows: EspacePoleRow[] = poles.map((p) => {
    const s = space.find((r) => r.grain === "pole" && r.pole_id === p.dispositif_id) || null;
    return {
      pole_id: p.dispositif_id, name: p.name,
      linear_m: s?.linear_m ?? null, linear_share: s?.linear_share ?? null, surface_m2: s?.surface_m2 ?? null, n_components: s?.n_components ?? null,
      revenue: s?.revenue ?? null, revenue_net_ht: s?.revenue_net_ht ?? null, revenue_share: s?.revenue_share ?? null, margin_share: s?.margin_share ?? null,
      revenue_per_m: s?.revenue_per_m ?? null, revenue_net_ht_per_m: s?.revenue_net_ht_per_m ?? null, margin_per_m: s?.margin_per_m ?? null,
      revenue_per_m2: s?.revenue_per_m2 ?? null, revenue_net_ht_per_m2: s?.revenue_net_ht_per_m2 ?? null, margin_per_m2: s?.margin_per_m2 ?? null,
    };
  }).filter((r) => r.linear_m != null).sort((a, b) => (b.linear_m as number) - (a.linear_m as number));
  if (!rows.length || !site || site.linear_m == null) {
    return { found: false, data: { found: false, date, n_poles: poles.length }, facts: [], sources: [] };
  }
  const withSales = rows.filter((r) => r.revenue_per_m != null);
  const bestPerM = [...withSales].sort((a, b) => (b.revenue_per_m as number) - (a.revenue_per_m as number))[0] || null;
  const lead = `${m1(site.linear_m)} m de linéaire mesurés sur ${rows.length} pôle${rows.length > 1 ? "s" : ""}` +
    (site.surface_m2 != null ? ` · ${m1(site.surface_m2)} m² de surface de vente` : "") +
    (bestPerM ? ` · ${bestPerM.name} génère le plus de CA par mètre (${frInt(bestPerM.revenue_per_m as number)} €)` : "");
  const facts: FamilyFact[] = [
    { fact_fr: `Votre linéaire mesuré fait ${m1(site.linear_m)} m sur ${rows.length} pôle${rows.length > 1 ? "s" : ""}` + (site.surface_m2 != null ? `, pour ${m1(site.surface_m2)} m² de surface de vente` : "") + ".", claim_type: "observed" },
  ];
  for (const r of rows.slice(0, 7)) {
    let f = `${r.name} : ${m1(r.linear_m as number)} m de linéaire` + (r.linear_share != null ? ` (Part de linéaire ${pct1(r.linear_share)})` : "");
    if (r.revenue_per_m != null) {
      f += ` · ${frInt(r.revenue_per_m)} € de CA par mètre sur 30 jours` + (r.revenue_net_ht_per_m != null ? ` (${frInt(r.revenue_net_ht_per_m)} € net HT)` : "")
        + (r.margin_per_m != null ? ` · ${frInt(r.margin_per_m)} € de marge brute par mètre` : "") + (r.revenue_share != null ? ` · ${pct1(r.revenue_share)} du CA` : "");
      if (r.margin_share != null && r.linear_share != null) f += ` · part de marge ${pct1(r.margin_share)} contre Part de linéaire ${pct1(r.linear_share)}`;
    } else {
      f += " · aucune vente rapportée à ce pôle sur 30 jours";
    }
    facts.push({ fact_fr: f + ".", claim_type: r.revenue_per_m != null ? "observed_difference" : "observed" });
  }
  // La lecture « lourd en linéaire, léger en CA » : Part de linéaire ≥ 15 %, part du CA sous la Part de linéaire de 5 points.
  const heavy = withSales.find((r) => r.linear_share != null && r.revenue_share != null && r.linear_share >= 0.15 && r.revenue_share <= r.linear_share - 0.05);
  if (heavy) {
    facts.push({ fact_fr: `${heavy.name} occupe ${pct1(heavy.linear_share as number)} de votre linéaire pour ${pct1(heavy.revenue_share as number)} de votre CA.`, claim_type: "observed_difference" });
  }
  return {
    found: true,
    data: {
      found: true, date, lead,
      site: { linear_m: site.linear_m, surface_m2: site.surface_m2, revenue_per_m: site.revenue_per_m, revenue_net_ht_per_m: site.revenue_net_ht_per_m, margin_per_m: site.margin_per_m, revenue_per_m2: site.revenue_per_m2, revenue_net_ht_per_m2: site.revenue_net_ht_per_m2 },
      window: site.window_start && site.window_end ? { start: site.window_start, end: site.window_end } : null,
      poles: rows, heavy: heavy ? heavy.name : null, best_per_m: bestPerM ? bestPerM.name : null,
    },
    facts,
    sources: ["Vos pôles et vos mesures d'espace (mètres linéaires de façade, surface de vente) — CA et marge brute par mètre sur 30 jours"],
  };
}

export async function espaceFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [poles, space] = await Promise.all([listPoles(bq, location_id, 50), listPoleSpace(bq, location_id)]);
  return composeEspaceFamily(poles, space, date);
}
