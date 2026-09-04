// src/lib/dispositifFamille.ts
// I8 (spec docs/explorer-dispositif-famille-spec.md, owner go 04/09) — la lecture « dispositif ×
// famille » : ce que font les VENTES (tickets contenant la famille), le PANIER MOYEN (ticket
// entier des tickets contenant la famille — décision owner 04/09), le CA de la famille et sa
// PART dans le CA du jour (mix produits & services) PENDANT une opération, vs les jours
// comparables — LA MÊME base que l'échelle de la vente (entityReading.readSerieFunnel :
// OCC_CTE partagée, mêmes jours de semaine, hors occurrences, 90 j avant la période).
// Observationnel, jamais causal : « ce qui bouge pendant l'opération ». Aucun LLM.
//
// Sources (vérifiées 04/09, INFORMATION_SCHEMA + modèle dbt lu) :
//   - raw.client_transactions : une ligne par ligne de facture ; ventes du site =
//     COUNT(DISTINCT invoice_number), repli SUM(transaction_count) (int_client_daily_performance
//     l.37-38) — la même règle ici, par famille. f10c3e58 août 2026 : 10 758 lignes = 10 758
//     factures (une ligne par ticket, graine) ; une caisse réelle porte plusieurs lignes par ticket.
//     Même source que le KPI déclaré family_revenue (kpiRegistry.measureFamilyRevenueMean) : le
//     chat et le verdict lisent la même table. Limite héritée : is_invoiced n'est pas appliqué.
//   - mart.fct_client_offering_daily : revenue_share INTRA-JOUR par famille (en-tête du modèle),
//     jamais recalculée ici.

import type { SiteEntity } from "./entityResolver";
import { OCC_CTE, COMPARABLE_LOOKBACK_DAYS, readEntityPeriod, buildEntityPeriodBlocks, periodLabelFr } from "./entityReading";
import type { KpiKey } from "./kpiRegistry";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => { const x = flat(v); if (x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const frPct1 = (v: number): string => `${v >= 0 ? "+" : "−"}${String(Math.abs(v)).replace(".", ",")} %`;
const frEur = (v: number): string => Math.round(v).toLocaleString("fr-FR");
const frEur2 = (v: number): string => `${(Math.round(v * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const frShare = (s: number): string => `${(Math.round(s * 1000) / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export interface FamilleStep {
  step: "ventes" | "panier" | "ca" | "part";
  occ_value: number | null;
  base_value: number | null;
  delta_pct: number | null;   // écart RELATIF en % (aussi pour la part — décision owner 04/09, jamais « pp »)
  occ_days: number;
  base_days: number;
}
export interface FamilleReading { famille: string; steps: FamilleStep[] }
export interface MixRow { famille: string; occ_share: number | null; base_share: number | null; delta_pct: number | null; occ_days: number; base_days: number }

export interface DispositifFamilleReading {
  operation: SiteEntity;
  familles: SiteEntity[];
  start: string;
  end: string;
  operation_blocks: ReturnType<typeof buildEntityPeriodBlocks>;   // verdicts + échelle site (inchangés)
  familles_reading: FamilleReading[];
  mix: MixRow[];
  kpi_demande: KpiKey | "mix" | null;
}

/** La vie d'une opération : sa première occurrence → aujourd'hui (période par défaut, spec § 4.2). */
export async function operationLife(bq: any, location_id: string, saved_item_id: string, todayIso: string): Promise<{ start: string; end: string } | null> {
  const rows = await bq.query({
    query: `SELECT CAST(MIN(DATE(date)) AS STRING) AS d FROM \`${PROJECT}.raw.saved_item_dates\` WHERE saved_item_id = @sid AND location_id = @loc`,
    params: { sid: saved_item_id, loc: location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const d = rows[0]?.d != null ? String(flat(rows[0].d)).slice(0, 10) : null;
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? { start: d, end: todayIso } : null;
}

const FLOOR_OCC = 2, FLOOR_BASE = 5;
const delta = (occ: number | null, base: number | null, occ_n: number, base_n: number): number | null =>
  occ_n >= FLOOR_OCC && base_n >= FLOOR_BASE && occ != null && base != null && base > 0
    ? Math.round(((occ - base) / base) * 1000) / 10 : null;

export async function readDispositifFamille(
  bq: any, location_id: string, operation: SiteEntity, familles: SiteEntity[],
  start: string, end: string, todayIso: string, kpi_demande: KpiKey | "mix" | null,
): Promise<DispositifFamilleReading> {
  const wEnd = end < todayIso ? end : todayIso;
  const fams = familles.slice(0, 3).map((f) => f.name);
  const params = { loc: location_id, sid: String(operation.id), pStart: bq.date(start), pEnd: bq.date(wEnd), fams };
  const [operation_blocks, famRows, mixRows] = await Promise.all([
    readEntityPeriod(bq, location_id, operation, start, end, todayIso).then(buildEntityPeriodBlocks),
    bq.query({
      query: `
      WITH ${OCC_CTE},
      lines AS (
        SELECT DATE(transaction_date) AS d, invoice_number, item_category, revenue, transaction_count
        FROM \`${PROJECT}.raw.client_transactions\`
        WHERE location_id = @loc
          AND transaction_date BETWEEN DATE_SUB(@pStart, INTERVAL ${COMPARABLE_LOOKBACK_DAYS} DAY) AND @pEnd
      ),
      days AS (
        SELECT d, EXTRACT(DAYOFWEEK FROM d) AS dow, d IN (SELECT d FROM occ) AS is_occ
        FROM (SELECT DISTINCT d FROM lines)
      ),
      dows AS (SELECT DISTINCT dow FROM days WHERE is_occ),
      -- Le ticket ENTIER (toutes lignes) — panier moyen des tickets contenant la famille (owner 04/09).
      tickets AS (SELECT d, invoice_number, SUM(revenue) AS ticket_rev FROM lines WHERE invoice_number IS NOT NULL GROUP BY d, invoice_number),
      fam_tickets AS (SELECT DISTINCT d, item_category, invoice_number FROM lines WHERE item_category IN UNNEST(@fams) AND invoice_number IS NOT NULL),
      panier_day AS (
        SELECT ft.d, ft.item_category, AVG(t.ticket_rev) AS panier
        FROM fam_tickets ft JOIN tickets t ON t.d = ft.d AND t.invoice_number = ft.invoice_number
        GROUP BY ft.d, ft.item_category
      ),
      -- Ventes = tickets contenant la famille ; repli transaction_count sans numéro de facture
      -- (même règle que le site, int_client_daily_performance).
      fam_day AS (
        SELECT d, item_category,
               COALESCE(NULLIF(COUNT(DISTINCT invoice_number), 0), SUM(transaction_count)) AS ventes,
               SUM(revenue) AS ca
        FROM lines WHERE item_category IN UNNEST(@fams) GROUP BY d, item_category
      ),
      -- Grille jours × familles : un jour sans vente de la famille compte 0 (jamais exclu).
      grid AS (SELECT dy.d, dy.dow, dy.is_occ, f AS item_category FROM days dy CROSS JOIN UNNEST(@fams) AS f),
      j AS (
        SELECT g.item_category, g.d, g.is_occ, g.dow,
               COALESCE(fd.ventes, 0) AS ventes, COALESCE(fd.ca, 0) AS ca, pd.panier
        FROM grid g
        LEFT JOIN fam_day fd ON fd.d = g.d AND fd.item_category = g.item_category
        LEFT JOIN panier_day pd ON pd.d = g.d AND pd.item_category = g.item_category
      )
      SELECT item_category,
        AVG(IF(is_occ, ventes, NULL)) AS v_occ, COUNTIF(is_occ) AS v_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), ventes, NULL)) AS v_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows)) AS v_base_n,
        AVG(IF(is_occ, panier, NULL)) AS p_occ, COUNTIF(is_occ AND panier IS NOT NULL) AS p_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), panier, NULL)) AS p_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows) AND panier IS NOT NULL) AS p_base_n,
        AVG(IF(is_occ, ca, NULL)) AS c_occ, COUNTIF(is_occ) AS c_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), ca, NULL)) AS c_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows)) AS c_base_n
      FROM j GROUP BY item_category`,
      params, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch((e: any) => { console.error("[dispositif-famille] familles:", e?.message); return []; }),
    bq.query({
      query: `
      WITH ${OCC_CTE},
      od AS (
        SELECT DATE(transaction_date) AS d, item_category, revenue_share
        FROM \`${PROJECT}.mart.fct_client_offering_daily\`
        WHERE location_id = @loc
          AND transaction_date BETWEEN DATE_SUB(@pStart, INTERVAL ${COMPARABLE_LOOKBACK_DAYS} DAY) AND @pEnd
      ),
      days AS (SELECT d, EXTRACT(DAYOFWEEK FROM d) AS dow, d IN (SELECT d FROM occ) AS is_occ FROM (SELECT DISTINCT d FROM od)),
      dows AS (SELECT DISTINCT dow FROM days WHERE is_occ),
      cats AS (SELECT DISTINCT item_category FROM od),
      grid AS (SELECT dy.d, dy.dow, dy.is_occ, c.item_category FROM days dy CROSS JOIN cats c),
      j AS (SELECT g.*, COALESCE(o.revenue_share, 0) AS share FROM grid g LEFT JOIN od o ON o.d = g.d AND o.item_category = g.item_category)
      SELECT item_category,
        AVG(IF(is_occ, share, NULL)) AS s_occ, COUNTIF(is_occ) AS s_occ_n,
        AVG(IF(NOT is_occ AND dow IN (SELECT dow FROM dows), share, NULL)) AS s_base,
        COUNTIF(NOT is_occ AND dow IN (SELECT dow FROM dows)) AS s_base_n
      FROM j GROUP BY item_category`,
      params: { loc: location_id, sid: String(operation.id), pStart: bq.date(start), pEnd: bq.date(wEnd) }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch((e: any) => { console.error("[dispositif-famille] mix:", e?.message); return []; }),
  ]);
  const mix: MixRow[] = (mixRows as any[]).map((r) => {
    const occ = num(r.s_occ), base = num(r.s_base), on = num(r.s_occ_n) ?? 0, bn = num(r.s_base_n) ?? 0;
    return { famille: String(flat(r.item_category)), occ_share: occ, base_share: base, delta_pct: delta(occ, base, on, bn), occ_days: on, base_days: bn };
  });
  const byFam = new Map<string, any>((famRows as any[]).map((r) => [String(flat(r.item_category)), r]));
  const familles_reading: FamilleReading[] = fams.map((name) => {
    const r = byFam.get(name) ?? {};
    const mk = (step: FamilleStep["step"], k: string): FamilleStep => {
      const occ = num(r[k + "_occ"]), base = num(r[k + "_base"]), on = num(r[k + "_occ_n"]) ?? 0, bn = num(r[k + "_base_n"]) ?? 0;
      return { step, occ_value: occ, base_value: base, delta_pct: delta(occ, base, on, bn), occ_days: on, base_days: bn };
    };
    const m = mix.find((x) => x.famille === name);
    const part: FamilleStep = { step: "part", occ_value: m?.occ_share ?? null, base_value: m?.base_share ?? null, delta_pct: m?.delta_pct ?? null, occ_days: m?.occ_days ?? 0, base_days: m?.base_days ?? 0 };
    return { famille: name, steps: [mk("ventes", "v"), mk("panier", "p"), mk("ca", "c"), part] };
  });
  return { operation, familles: familles.slice(0, 3), start, end, operation_blocks, familles_reading, mix, kpi_demande };
}

// ── Les blocs (rendu plan_sections, verbatim côté client) ─────────────────────────────────────
const STEP_FR = (fam: string): Record<FamilleStep["step"], { label: string; fmt: (v: number) => string }> => ({
  ventes: { label: `Ventes/jour avec ${fam}`, fmt: (v) => String(Math.round(v)) },
  panier: { label: `Panier moyen avec ${fam}`, fmt: frEur2 },
  ca: { label: `CA/jour ${fam}`, fmt: (v) => `${frEur(v)} €` },
  part: { label: `Part de ${fam} dans le CA`, fmt: frShare },
});
const GREEN = "#0F6E56", AMBER = "#B45309", GREY = "#6B7280", PALE = "#9CA3AF";
const KPI_STEP: Record<string, FamilleStep["step"]> = { transactions: "ventes", basket: "panier", family_revenue: "ca", mix: "part" };

export function buildDispositifFamilleBlocks(r: DispositifFamilleReading): { headline: string; sections: any[]; sources: string[] } {
  const famNames = r.familles.map((f) => f.name);
  const headline = `${r.operation.name} × ${famNames.length > 1 ? "familles" : "famille"} ${famNames.join(", ")} — ${periodLabelFr(r.start, r.end)}`;
  const sections: any[] = [];
  // (1) verdicts de l'opération + totaux — inchangés (buildEntityPeriodBlocks).
  const ob = r.operation_blocks;
  sections.push({ table: ob.table, facts: ob.prose ? [ob.prose.split("\n\n")[0]] : [] });
  // (2) une table par famille — le KPI demandé ouvre la phrase (« X au lieu de Y (écart) »).
  for (const fr of r.familles_reading) {
    const F = STEP_FR(fr.famille);
    const rows = fr.steps.map((st) => ({ cells: [
      { v: F[st.step].label, bold: true },
      { v: st.occ_value != null ? F[st.step].fmt(st.occ_value) : "—" },
      { v: st.base_value != null ? F[st.step].fmt(st.base_value) : "—", color: GREY },
      st.delta_pct != null
        ? { v: frPct1(st.delta_pct), color: st.delta_pct >= 0 ? GREEN : AMBER, bold: true }
        // Sous un plancher : le compte de jours en sub (patron de l'entité × période). Valeur absente
        // planchers tenus (panier sans numéro de facture) : « — » nu, comme l'échelle de la vente.
        : { v: "—", color: PALE, ...(st.occ_days < FLOOR_OCC ? { sub: `${st.occ_days} jour${st.occ_days > 1 ? "s" : ""} d'opération` } : st.base_days < FLOOR_BASE ? { sub: `${st.base_days} jour${st.base_days > 1 ? "s" : ""} comparable${st.base_days > 1 ? "s" : ""}` } : {}) },
    ] }));
    const facts: string[] = [];
    const lead = r.kpi_demande ? fr.steps.find((st) => st.step === KPI_STEP[String(r.kpi_demande)]) : null;
    if (lead && lead.delta_pct != null && lead.occ_value != null && lead.base_value != null) {
      facts.push(`${F[lead.step].label} pendant l'opération : ${F[lead.step].fmt(lead.occ_value)} au lieu de ${F[lead.step].fmt(lead.base_value)} (${frPct1(lead.delta_pct)}).`);
    }
    const measured = fr.steps.filter((st) => st.delta_pct != null);
    const up = measured.filter((st) => st.delta_pct! > 0), down = measured.filter((st) => st.delta_pct! < 0);
    const parts: string[] = [];
    if (up.length) parts.push(`Ce qui bouge pendant l'opération pour la famille ${fr.famille} : ${up.map((st) => `${F[st.step].label} ${frPct1(st.delta_pct!)}`).join(", ")}`);
    if (down.length) parts.push(`ce qui ne suit pas : ${down.map((st) => `${F[st.step].label} ${frPct1(st.delta_pct!)}`).join(", ")}`);
    if (parts.length) facts.push(parts.join(" · ") + ".");
    if (!measured.length) facts.push(`Famille ${fr.famille} : ${fr.steps[0].occ_days} jour${fr.steps[0].occ_days > 1 ? "s" : ""} d'opération, ${fr.steps[0].base_days} comparable${fr.steps[0].base_days > 1 ? "s" : ""} — sous les planchers (2 et 5), aucun écart ne se dit.`);
    sections.push({ title: `Famille ${fr.famille} pendant l'opération`, table: { cols: [{ label: "Étape de la vente", align: "left" }, { label: "Pendant l'opération" }, { label: "Votre résultat habituel" }, { label: "Écart" }], rows }, facts });
  }
  // (3) l'échelle du SITE — la table existante, sous son propre titre.
  if (ob.funnel_table) sections.push({ title: "Votre site pendant l'opération", table: ob.funnel_table });
  // (4) le mix complet — tournure owner 28/08 ; familles nommées en gras ; < 1 % de part habituelle regroupées.
  const named = new Set(famNames);
  const main = r.mix.filter((m) => (m.base_share ?? 0) >= 0.01 || named.has(m.famille));
  const small = r.mix.filter((m) => !main.includes(m));
  const sorted = [...main].sort((a, b) => (b.delta_pct ?? -Infinity) - (a.delta_pct ?? -Infinity));
  const mixRows = sorted.map((m) => ({ cells: [
    { v: m.famille, bold: named.has(m.famille) },
    { v: m.occ_share != null ? frShare(m.occ_share) : "—" },
    { v: m.base_share != null ? frShare(m.base_share) : "—", color: GREY },
    m.delta_pct != null ? { v: frPct1(m.delta_pct), color: m.delta_pct >= 0 ? GREEN : AMBER, bold: true } : { v: "—", color: PALE },
  ] }));
  if (small.length) {
    const so = small.reduce((a, m) => a + (m.occ_share ?? 0), 0), sb = small.reduce((a, m) => a + (m.base_share ?? 0), 0);
    mixRows.push({ cells: [{ v: `Autres familles (${small.length}, sous 1 % du CA)`, bold: false, color: GREY }, { v: frShare(so) }, { v: frShare(sb), color: GREY }, { v: "—", color: PALE }] });
  }
  if (mixRows.length) {
    sections.push({
      title: `Vos ${r.mix.length} familles, de la plus forte hausse à la plus forte baisse`,
      table: { cols: [{ label: "Famille", align: "left" }, { label: "Part pendant l'opération" }, { label: "Part habituelle" }, { label: "Écart" }], rows: mixRows },
    });
  }
  const f0 = r.familles_reading[0]?.steps[0];
  const sources = [
    ...ob.sources,
    ...(f0 ? [`Famille : ${f0.occ_days} jour${f0.occ_days > 1 ? "s" : ""} d'opération vs ${f0.base_days} jours comparables (mêmes jours de semaine, hors opérations) · ventes = tickets contenant la famille · panier moyen = le ticket entier de ces tickets.`] : []),
    "Mix : part de chaque famille dans le CA du jour, moyenne des jours d'opération vs jours comparables · écart en % de la part habituelle.",
  ];
  return { headline, sections, sources };
}
