// src/lib/dispositifs/poleClassement.ts — VOS PÔLES · DU PLUS AU MOINS PERFORMANT (12/09, docs/explorer-outil-spec.md § 4
// `lire_poles_classement` ; section du Rapport au lexique l. 126 : « Vos pôles · du plus au moins performant »).
//
// Une lecture : semantic.vw_insight_event_pole_daily (le pôle au jour — CA, ventes = unités vendues (lexique l. 87,
// « une pesée = une vente »), marge brute et couverture, écart au résultat habituel = Σ des écarts de ses familles,
// part du CA du site ; les familles qu'aucun pôle ne porte forment « Non rattaché », Σ pôles = site), sommée sur la
// période demandée. Pour les indicateurs par mètre et par m², LE foyer listPoleSpace (vw_insight_event_space_30d,
// fenêtre fixe de 30 jours) — la période demandée ne s'y applique pas et la lecture le dit. Rien n'est recalculé
// hors des sommes et des parts. Le mot « Non rattaché » est celui de Piloter (tableau.astro, owner 09/09).
import type { AnswerBlock } from "../explorer/blocks";
import { listPoleSpace, type PoleSpaceRow } from "./poleReading";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));

export interface PolePeriodRow {
  pole_id: string; pole_label: string; is_unassigned: boolean;
  n_days: number; revenue: number; units: number; gross_margin_ht: number | null; revenue_costed: number | null;
  delta_eur: number | null; expected_revenue: number | null;
}
export interface PoleClassementData { rows: PolePeriodRow[]; space: PoleSpaceRow[]; start: string; end: string }

export async function readPoleClassement(bq: any, location_id: string, start: string, end: string): Promise<PoleClassementData> {
  const [rowsRaw, space] = await Promise.all([
    bq.query({
      query: `SELECT pole_id, ANY_VALUE(pole_label) AS pole_label, ANY_VALUE(is_unassigned) AS is_unassigned, COUNT(*) AS n_days,
                     SUM(revenue) AS revenue, SUM(units) AS units, SUM(gross_margin_ht) AS gross_margin_ht, SUM(revenue_costed) AS revenue_costed,
                     SUM(delta_eur) AS delta_eur, SUM(expected_revenue) AS expected_revenue
              FROM \`${PROJECT}.semantic.vw_insight_event_pole_daily\`
              WHERE location_id = @loc AND date BETWEEN @s AND @e
              GROUP BY 1 ORDER BY revenue DESC`,
      params: { loc: location_id, s: start, e: end }, location: "EU",
    }).then(([r]: [any[]]) => r as any[]),
    listPoleSpace(bq, location_id),
  ]);
  const rows: PolePeriodRow[] = rowsRaw.map((r: any) => ({
    pole_id: String(flat(r.pole_id)), pole_label: String(flat(r.pole_label) ?? ""), is_unassigned: flat(r.is_unassigned) === true,
    n_days: Number(num(r.n_days) ?? 0), revenue: Number(num(r.revenue) ?? 0), units: Number(num(r.units) ?? 0),
    gross_margin_ht: num(r.gross_margin_ht), revenue_costed: num(r.revenue_costed), delta_eur: num(r.delta_eur), expected_revenue: num(r.expected_revenue),
  }));
  return { rows, space, start, end };
}

// ── Composition PURE ────────────────────────────────────────────────────────────────────────────────
export type Indicateur = "ca" | "ventes" | "marge_brute" | "ca_par_metre" | "ca_par_m2" | "marge_par_metre";
export const INDICATEUR_FR: Record<Indicateur, string> = {
  ca: "CA", ventes: "ventes", marge_brute: "marge brute", ca_par_metre: "CA par mètre", ca_par_m2: "CA par m²", marge_par_metre: "marge brute par mètre",
};
const PAR_ESPACE: Indicateur[] = ["ca_par_metre", "ca_par_m2", "marge_par_metre"];

const frInt = (n: number): string => Math.round(Math.abs(Number(n) || 0)).toLocaleString("fr-FR");
const eur = (n: number): string => `${frInt(n)} €`;
const sgnEur = (n: number): string => `${Number(n) >= 0 ? "+" : "−"}${frInt(n)} €`;
const pct1 = (ratio: number): string => `${String(Math.round(ratio * 1000) / 10).replace(".", ",")} %`;
const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };

export interface PoleClassementLecture { found: boolean; facts: string[]; blocks: AnswerBlock[]; indicateur: Indicateur; absence?: "aucun_pole" | "aucune_mesure" | "aucune_marge" }

/**
 * Les mots sont ceux de Piloter (« N € sur 30 j », « X % du CA », « N jours vendus », « Non rattaché ») et du kit
 * (« Part du CA », « Part de la marge », « CA par mètre »). Le sujet d'un montant est le pôle qui le génère.
 */
export function composePoleClassement(d: PoleClassementData, indicateur: Indicateur, libellePeriode: string): PoleClassementLecture {
  const facts: string[] = [];
  const blocks: AnswerBlock[] = [];

  if (PAR_ESPACE.includes(indicateur)) {
    const key = indicateur === "ca_par_metre" ? "revenue_per_m" : indicateur === "ca_par_m2" ? "revenue_per_m2" : "margin_per_m";
    const poles = d.space.filter((r) => r.grain === "pole" && r[key] != null).sort((a, b) => (b[key] as number) - (a[key] as number));
    if (!poles.length) return { found: false, facts: [], blocks: [], indicateur, absence: "aucune_mesure" };
    const site = d.space.find((r) => r.grain === "site") || null;
    const fen = site?.window_start && site?.window_end ? `du ${frDate(site.window_start)} au ${frDate(site.window_end)}` : "sur 30 jours";
    facts.push(`Vos pôles du plus au moins performant en ${INDICATEUR_FR[indicateur]}, sur les 30 jours ${fen} (la fenêtre des mesures d'espace, quelle que soit la période demandée) :`);
    for (const p of poles) {
      const mesure = indicateur === "ca_par_m2" ? `${eur(p.revenue_per_m2 as number)} de CA par m²` + (p.surface_m2 != null ? ` sur ${String(Math.round(p.surface_m2 * 10) / 10).replace(".", ",")} m²` : "")
        : indicateur === "ca_par_metre" ? `${eur(p.revenue_per_m as number)} de CA par mètre` + (p.linear_m != null ? ` sur ${String(Math.round(p.linear_m * 10) / 10).replace(".", ",")} m de linéaire` : "")
        : `${eur(p.margin_per_m as number)} de marge brute par mètre` + (p.linear_m != null ? ` sur ${String(Math.round(p.linear_m * 10) / 10).replace(".", ",")} m de linéaire` : "");
      facts.push(`${p.pole_label} génère ${mesure}` + (p.revenue_share != null ? `, soit ${pct1(p.revenue_share)} de votre CA` : "") + (p.linear_share != null ? ` pour ${pct1(p.linear_share)} de votre linéaire` : "") + ".");
    }
    blocks.push({
      type: "table",
      cols: [{ label: "Pôle" }, { label: INDICATEUR_FR[indicateur].charAt(0).toUpperCase() + INDICATEUR_FR[indicateur].slice(1) }, { label: indicateur === "ca_par_m2" ? "Surface de vente" : "Linéaire" }, { label: "Part du CA" }, { label: "Part de linéaire" }],
      rows: poles.map((p) => ({ cells: [
        { v: p.pole_label ?? "", bold: true },
        { v: eur(p[key] as number), bold: true },
        { v: indicateur === "ca_par_m2" ? (p.surface_m2 != null ? `${String(Math.round(p.surface_m2 * 10) / 10).replace(".", ",")} m²` : "—") : (p.linear_m != null ? `${String(Math.round(p.linear_m * 10) / 10).replace(".", ",")} m` : "—") },
        { v: p.revenue_share != null ? pct1(p.revenue_share) : "—" },
        { v: p.linear_share != null ? pct1(p.linear_share) : "—" },
      ] })),
    });
    blocks.push({ type: "sources", items: ["Vos pôles et vos mesures d'espace (mètres linéaires de façade, surface de vente) — CA et marge brute par mètre sur 30 jours"] });
    return { found: true, facts, blocks, indicateur };
  }

  const rows = d.rows.filter((r) => r.revenue > 0 || r.units > 0);
  if (!rows.length) return { found: false, facts: [], blocks: [], indicateur, absence: "aucun_pole" };
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  const totalMarge = rows.reduce((a, r) => a + (r.gross_margin_ht ?? 0), 0);
  const val = (r: PolePeriodRow): number | null => indicateur === "ca" ? r.revenue : indicateur === "ventes" ? r.units : r.gross_margin_ht;
  const ranked = rows.filter((r) => val(r) != null).sort((a, b) => (val(b) as number) - (val(a) as number));
  if (indicateur === "marge_brute" && !ranked.some((r) => (r.gross_margin_ht ?? 0) > 0)) return { found: false, facts: [], blocks: [], indicateur, absence: "aucune_marge" };
  const label = (r: PolePeriodRow): string => (r.is_unassigned ? "Non rattaché" : r.pole_label);
  facts.push(`Vos pôles du plus au moins performant en ${INDICATEUR_FR[indicateur]}, ${libellePeriode} :`);
  for (const r of ranked) {
    const v = val(r) as number;
    let f = indicateur === "ventes" ? `${label(r)} réalise ${frInt(v)} ventes`
      : indicateur === "marge_brute" ? `${label(r)} génère ${eur(v)} de marge brute` + (r.revenue_costed != null && r.revenue > 0 ? ` (calculée sur ${pct1(Math.min(1, r.revenue_costed / r.revenue))} de son CA)` : "")
      : `${label(r)} génère ${eur(v)} de CA`;
    if (indicateur === "marge_brute" && totalMarge > 0) f += `, soit ${pct1((r.gross_margin_ht ?? 0) / totalMarge)} de votre marge brute`;
    else if (total > 0) f += `, soit ${pct1(r.revenue / total)} de votre CA`;
    if (r.delta_eur != null && r.expected_revenue != null && r.expected_revenue > 0) f += `, ${sgnEur(r.delta_eur)} par rapport à votre résultat habituel`;
    f += ` (${r.n_days} jour${r.n_days > 1 ? "s" : ""} vendu${r.n_days > 1 ? "s" : ""}).`;
    facts.push(f);
  }
  const indLabel = indicateur === "ventes" ? "Ventes" : indicateur === "marge_brute" ? "Marge brute" : "CA";
  blocks.push({
    type: "table",
    cols: [{ label: "Pôle" }, { label: indLabel }, { label: indicateur === "marge_brute" ? "Part de la marge" : "Part du CA" }, { label: "Écart au résultat habituel" }, { label: "Jours vendus" }],
    rows: ranked.map((r) => {
      const v = val(r) as number;
      const part = indicateur === "marge_brute" ? (totalMarge > 0 ? pct1((r.gross_margin_ht ?? 0) / totalMarge) : "—") : (total > 0 ? pct1(r.revenue / total) : "—");
      const ecart = r.delta_eur != null && r.expected_revenue != null && r.expected_revenue > 0 ? sgnEur(r.delta_eur) : "—";
      return { cells: [
        { v: label(r), bold: true },
        { v: indicateur === "ventes" ? frInt(v) : eur(v), bold: true },
        { v: part },
        { v: ecart, ...(r.delta_eur != null && r.delta_eur < 0 ? { color: "#B45309" } : {}) },
        { v: String(r.n_days) },
      ] };
    }),
  });
  blocks.push({ type: "sources", items: ["Vos ventes par jour et par famille (caisse), rattachées à vos pôles ; écart au résultat habituel = la somme des écarts des familles du pôle"] });
  return { found: true, facts, blocks, indicateur };
}

export const POLES_ABSENCE_FR: Record<NonNullable<PoleClassementLecture["absence"]>, string> = {
  aucun_pole: "Aucune vente rattachée à un pôle sur cette période.",
  aucune_mesure: "Aucune mesure d’espace pour l’instant — les mètres se saisissent sur le formulaire de pôle.",
  aucune_marge: "Aucune marge brute mesurée par pôle pour l’instant — vos prix d’achat couvrent trop peu de votre CA.",
};
export function poleClassementToText(l: PoleClassementLecture): string {
  return l.found && l.facts.length ? l.facts.map((f, i) => (i === 0 ? f : `• ${f}`)).join("\n") : POLES_ABSENCE_FR[l.absence ?? "aucun_pole"];
}
