// src/lib/insightFamilies/signauxFamille.ts
// SIGNAUX × FAMILLE family provider — « quelles familles souffrent de la pluie ? », « qu'est-ce qui se vend
// pendant les vacances ? » (11/09, docs/reponse-aux-signaux-par-famille.md, audit profit-grains § 6 A8).
// Lit semantic.vw_insight_event_family_day_class_response (dbt : famille × classe de jour × base × métrique,
// agrégats BRUTS, aucune porte dans le mart) et applique LA MÊME politique de lecture que le site —
// rowsToImpactsWithImmaterial (lib/kpi/dayClassRegistry.ts) : n ≥ 5, portée ≥ 60 j, |t| ≥ 1 sur le log,
// cohérence de signe médiane/log, matérialité 0,3 % du CA — ici du CA ANNUEL DE LA FAMILLE (le dénominateur
// du site éteindrait toute famille), paliers estimé/mesuré. Base « pure » d'abord, « marginal » (à saison
// égale, cellules mois × type de jour) en repli — comme le site.
//
// Mots owner (lexique l.83, l.109, l.365) : CA/jour <famille>, Panier moyen avec <famille>, Part de <famille>
// dans le CA, vs vos jours comparables ; les classes portent leur libellé du registre (« jours de pluie
// marquée »). « selon la saison » se lit « à saison égale » (docs/reponse-aux-signaux-par-famille.md § 2).
import type { FamilyResult, FamilyFact } from "./types";
import { rowsToImpactsWithImmaterial, type DayClassImpact } from "../kpi/dayClassRegistry";

const PROJECT = "muse-square-open-data";
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const sgnInt = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + frInt(Math.abs(n));
const sgnDec = (n: number, digits: number): string => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits).replace(".", ",");
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));

export interface FamilyClassRow {
  family: string; class_key: string; class_family: string | null; basis: string; metric: string;
  n_days: number | null; avg_gap: number | null; sd_gap: number | null; med_gap: number | null;
  n_log: number | null; avg_log: number | null; sd_log: number | null; span_days: number | null; corr_r: number | null;
}
export interface SignalFamilyLine {
  family: string; class_key: string; label_fr: string; eur_year: number; tier: string; n_days: number; avg_gap_eur: number;
  basket_delta_eur: number | null; share_delta_pt: number | null; corr_r: number | null; entangled: boolean;
}

/** |t| linéaire d'une ligne (régime des métriques panier / part : pas de log dans le mart). */
function tLinear(avg: number | null, sd: number | null, n: number | null): number {
  if (avg == null || sd == null || n == null || !(sd > 0) || !(n > 0)) return 0;
  return Math.abs(avg) / (sd / Math.sqrt(n));
}

/** Composition PURE : lignes du mart + CA annuel par famille → data + faits (testée sans BigQuery). */
export function composeSignauxFamille(rows: FamilyClassRow[], annualByFamily: Record<string, number>, date: string): FamilyResult {
  const families = Array.from(new Set(rows.map((r) => r.family)));
  const lines: SignalFamilyLine[] = [];
  for (const family of families) {
    const gapRows = rows.filter((r) => r.family === family && r.metric === "family_revenue_gap").map((r) => ({
      class_key: r.class_key, family: r.class_family, basis: r.basis, metric: "revenue_residual",
      n_days: r.n_days, avg_gap_eur: r.avg_gap, sd_gap_eur: r.sd_gap, med_gap_eur: r.med_gap,
      n_log: r.n_log, avg_log: r.avg_log, sd_log: r.sd_log, span_days: r.span_days, corr_r: r.corr_r,
    }));
    const { impacts } = rowsToImpactsWithImmaterial(gapRows, annualByFamily[family] ?? null);
    for (const [class_key, imp] of impacts as Map<string, DayClassImpact>) {
      const side = (metric: string) => {
        const r = rows.find((x) => x.family === family && x.class_key === class_key && x.metric === metric && x.basis === "marginal")
          || rows.find((x) => x.family === family && x.class_key === class_key && x.metric === metric);
        return r && (r.n_days ?? 0) >= 5 && tLinear(r.avg_gap, r.sd_gap, r.n_days) >= 1 ? r.avg_gap : null;
      };
      lines.push({
        family, class_key, label_fr: imp.label_fr, eur_year: imp.eur_year, tier: imp.tier, n_days: imp.n_days, avg_gap_eur: imp.avg_gap_eur,
        basket_delta_eur: side("family_basket"), share_delta_pt: side("family_share"), corr_r: imp.corr_r ?? null, entangled: imp.entangled,
      });
    }
  }
  lines.sort((a, b) => Math.abs(b.eur_year) - Math.abs(a.eur_year));
  if (!lines.length) return { found: false, data: { found: false, date, n_families: families.length }, facts: [], sources: [] };
  const top = lines[0];
  const lead = `CA/jour ${top.family} sur vos ${top.label_fr} : ${sgnInt(top.avg_gap_eur)} € vs vos jours comparables (${top.n_days} jours, ≈ ${sgnInt(top.eur_year)} € par an, ${top.tier})`;
  const facts: FamilyFact[] = lines.slice(0, 6).map((l) => ({
    fact_fr: `CA/jour ${l.family} sur vos ${l.label_fr} : ${sgnInt(Math.round(l.avg_gap_eur))} € vs vos jours comparables, sur ${l.n_days} jours — ≈ ${sgnInt(l.eur_year)} € par an (${l.tier}${l.entangled ? ", à saison égale" : ""}).`,
    claim_type: "observed_difference", tier: l.tier as any,
  }));
  for (const l of lines.slice(0, 3)) {
    if (l.basket_delta_eur != null) facts.push({ fact_fr: `Panier moyen avec ${l.family} sur vos ${l.label_fr} : ${sgnDec(l.basket_delta_eur, 2)} € vs vos jours comparables.`, claim_type: "observed_difference" });
    if (l.share_delta_pt != null) facts.push({ fact_fr: `Part de ${l.family} dans le CA sur vos ${l.label_fr} : ${sgnDec(l.share_delta_pt, 1)} point${Math.abs(l.share_delta_pt) >= 2 ? "s" : ""} vs vos jours comparables.`, claim_type: "observed_difference" });
  }
  return {
    found: true,
    data: { found: true, date, lead, lines, n_families: families.length },
    facts,
    sources: ["Vos ventes par famille face aux classes de jours (météo, calendrier, activité autour de vous) — à saison égale"],
  };
}

export async function signauxFamilleFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const read = (q: string) => bq.query({ query: q, params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU" })
    .then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  const [rows, annual] = await Promise.all([
    read(`SELECT family, class_key, class_family, basis, metric, n_days, avg_gap, sd_gap, med_gap, n_log, avg_log, sd_log, span_days, corr_r
          FROM \`${PROJECT}.semantic.vw_insight_event_family_day_class_response\`
          WHERE location_id = @location_id AND metric IN ('family_revenue_gap', 'family_basket', 'family_share')`),
    read(`SELECT item_category AS family, SUM(revenue) AS revenue
          FROM \`${PROJECT}.semantic.vw_insight_event_client_offering_daily\`
          WHERE location_id = @location_id AND transaction_date BETWEEN DATE_SUB(DATE(@date), INTERVAL 365 DAY) AND DATE(@date)
          GROUP BY 1`),
  ]);
  const annualByFamily: Record<string, number> = {};
  for (const r of annual as any[]) { const f = String(flat(r.family) ?? ""); const v = num(r.revenue); if (f && v != null) annualByFamily[f] = v; }
  const mapped: FamilyClassRow[] = (rows as any[]).map((r) => ({
    family: String(flat(r.family) ?? ""), class_key: String(flat(r.class_key) ?? ""), class_family: flat(r.class_family) == null ? null : String(flat(r.class_family)),
    basis: String(flat(r.basis) ?? "pure"), metric: String(flat(r.metric) ?? ""),
    n_days: num(r.n_days), avg_gap: num(r.avg_gap), sd_gap: num(r.sd_gap), med_gap: num(r.med_gap), n_log: num(r.n_log), avg_log: num(r.avg_log), sd_log: num(r.sd_log),
    span_days: num(r.span_days), corr_r: num(r.corr_r),
  })).filter((r) => r.family && r.class_key);
  return composeSignauxFamille(mapped, annualByFamily, date);
}
