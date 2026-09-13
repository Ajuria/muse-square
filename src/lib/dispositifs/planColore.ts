// src/lib/dispositifs/planColore.ts — LE PLAN COLORÉ (docs/explorer-outil-spec.md § 4 `lire_plan`, § 5 bloc `plan`, § 9
// incrément 8, 13/09) : les contours des pôles (spaceZones.ts, en vigueur) teintés par une mesure de l'espace — le CA
// par m², la marge brute par m², le CA ou la Part du CA sur 30 jours (LE foyer listPoleSpace, grain pôle, les mêmes
// chiffres que Piloter et que lire_espace). PUR : composePlan. Aucun chiffre calculé ici hors l'ordre des teintes ;
// les libellés de valeur arrivent formatés. Sans contour : l'absence, dite.
import type { AnswerBlock } from "../explorer/blocks";
import type { PoleSpaceRow } from "./poleReading";
import type { Point, SpaceZone } from "./spaceZones";

export type PlanMesure = "ca_par_m2" | "marge_par_m2" | "ca" | "part_ca";
export const PLAN_MESURES: PlanMesure[] = ["ca_par_m2", "marge_par_m2", "ca", "part_ca"];
export const PLAN_MESURE_FR: Record<PlanMesure, string> = {
  ca_par_m2: "CA par m² sur 30 jours",
  marge_par_m2: "marge brute par m² sur 30 jours",
  ca: "CA sur 30 jours",
  part_ca: "Part du CA sur 30 jours",
};

export interface PlanZone {
  pole_id: string;
  label: string;
  polygons: Point[][];
  area_m2: number;
  value: number | null;
  value_fr: string | null;
  /** Rang de teinte 1 (la plus forte) … n ; null sans valeur. */
  rang: number | null;
}
export interface PlanBlock {
  type: "plan";
  mesure: PlanMesure;
  mesure_fr: string;
  /** [x, y, largeur, hauteur] dans les unités du plan — le SVG s'y cale. */
  viewBox: [number, number, number, number];
  scale_pt_per_m: number;
  zones: PlanZone[];
  fenetre_fr: string | null;
  surface_totale_m2: number;
}

const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const frDec = (n: number, d = 2): string => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const frDate = (iso: string | null): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ""); };
const ABSENCE = "Aucun contour de pôle pour l’instant — les zones se relèvent sur le plan du magasin.";

function valeurDe(mesure: PlanMesure, r: PoleSpaceRow | undefined): { value: number | null; value_fr: string | null } {
  if (!r) return { value: null, value_fr: null };
  const v = mesure === "ca_par_m2" ? r.revenue_per_m2 : mesure === "marge_par_m2" ? r.margin_per_m2 : mesure === "ca" ? r.revenue : r.revenue_share;
  if (v == null || !Number.isFinite(v)) return { value: null, value_fr: null };
  if (mesure === "part_ca") return { value: v, value_fr: `${frDec(v * 100, 1)} %` };
  return { value: v, value_fr: `${frInt(v)} €` };
}

export interface PlanCompose { found: boolean; block: AnswerBlock; facts: string[]; sources: string[] }

/** PUR — zones en vigueur + espace des pôles (grain pôle) → le bloc `plan`, un fait par pôle, les sources. */
export function composePlan(zones: SpaceZone[], espace: PoleSpaceRow[], mesure: PlanMesure): PlanCompose {
  if (!zones.length) return { found: false, block: { type: "absence", manque: ABSENCE, geste: null }, facts: [], sources: [] };
  const parPole = new Map<string, SpaceZone[]>();
  for (const z of zones) parPole.set(z.dispositif_id, [...(parPole.get(z.dispositif_id) ?? []), z]);
  const espaceParPole = new Map(espace.filter((r) => r.grain === "pole" && r.pole_id).map((r) => [String(r.pole_id), r]));
  const fenetre = espace.find((r) => r.grain === "pole" && r.window_start && r.window_end);
  const fenetre_fr = fenetre ? `du ${frDate(fenetre.window_start)} au ${frDate(fenetre.window_end)}` : null;
  const zonesPlan: PlanZone[] = [...parPole.entries()].map(([pole_id, zs]) => {
    const { value, value_fr } = valeurDe(mesure, espaceParPole.get(pole_id));
    return { pole_id, label: zs[0].pole_label, polygons: zs.sort((a, b) => a.polygon_index - b.polygon_index).map((z) => z.points), area_m2: Math.round(zs.reduce((a, z) => a + z.area_m2, 0) * 100) / 100, value, value_fr, rang: null };
  });
  const classees = zonesPlan.filter((z) => z.value != null).sort((a, b) => (b.value as number) - (a.value as number));
  classees.forEach((z, i) => { z.rang = i + 1; });
  const pts = zones.flatMap((z) => z.points);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minx = Math.min(...xs), miny = Math.min(...ys), maxx = Math.max(...xs), maxy = Math.max(...ys);
  const marge = Math.max(8, (maxx - minx) * 0.03);
  const surface_totale_m2 = Math.round(zonesPlan.reduce((a, z) => a + z.area_m2, 0) * 100) / 100;
  const block: PlanBlock = {
    type: "plan", mesure, mesure_fr: PLAN_MESURE_FR[mesure],
    viewBox: [Math.floor(minx - marge), Math.floor(miny - marge), Math.ceil(maxx - minx + 2 * marge), Math.ceil(maxy - miny + 2 * marge)],
    scale_pt_per_m: zones[0].scale_pt_per_m, zones: zonesPlan.sort((a, b) => a.label.localeCompare(b.label, "fr")), fenetre_fr, surface_totale_m2,
  };
  const facts: string[] = [`Sol de vente relevé sur le plan : ${frDec(surface_totale_m2)} m² pour ${zonesPlan.length} pôle${zonesPlan.length > 1 ? "s" : ""} (relevé du ${frDate(zones[0].measured_at)}).`];
  for (const z of [...classees, ...zonesPlan.filter((z) => z.value == null)]) {
    facts.push(z.value_fr
      ? `${z.label} : ${frDec(z.area_m2)} m² de surface de vente · ${z.value_fr} de ${PLAN_MESURE_FR[mesure]}${fenetre_fr ? ` (${fenetre_fr})` : ""}${z.rang === 1 ? " — le plus fort" : ""}.`
      : `${z.label} : ${frDec(z.area_m2)} m² de surface de vente · aucune vente rapportée à ce pôle sur 30 jours.`);
  }
  const sources = ["Les contours des pôles relevés sur votre plan (sol de vente, allées partagées au plus proche à pied)", "Votre espace sur 30 jours (CA et marge brute par m², LE foyer de Piloter)"];
  return { found: true, block: block as unknown as AnswerBlock, facts, sources };
}

export function planToText(p: PlanCompose): string {
  return p.found ? p.facts.map((f) => `• ${f}`).join("\n") : ABSENCE;
}
