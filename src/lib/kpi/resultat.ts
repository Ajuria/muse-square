// src/lib/kpi/resultat.ts — LE RÉSULTAT NET et LE SEUIL DE RENTABILITÉ côté app (12/09, docs/explorer-outil-spec.md
// § 4 `lire_resultat` ; mots : lexique l. 112-115, owner 11/09 et 12/09).
//
// Deux lectures, les MÊMES que le bloc CA de Piloter (insight/dashboard.ts, vagues (b) et (c)) :
//   · semantic.vw_insight_event_monthly_result — le résultat net par mois (marge brute − charges fixes − masse
//     salariale, NULL tant qu'une entrée manque ou que la couverture du mois est sous 90 % ; is_complete_month) ;
//   · semantic.vw_insight_event_daily_margin — le dernier jour de vente : seuil de rentabilité du jour (charges
//     par jour de vente ÷ taux de marge brute des 30 derniers jours) et l'heure où il est atteint.
// Rien n'est recalculé ici : la vue porte la méthode (en-tête de fct_client_monthly_result / fct_client_daily_margin).
// Un résultat net ne se lit que sur un mois COMPLET (décision owner 4) : le mois en cours se dit comme tel.
import type { AnswerBlock } from "../explorer/blocks";

const PROJECT = "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const num = (v: any): number | null => (flat(v) == null ? null : Number(flat(v)));

export interface MoisResultat {
  month: string;                 // AAAA-MM-01
  is_complete_month: boolean;
  sales_days: number | null;
  revenue_net_ht: number | null;
  gross_margin_ht: number | null;
  coverage_pct: number | null;   // ratio 0-1 (la vue)
  fixed_costs_month_eur: number | null;
  payroll_month_eur: number | null;
  net_result_eur: number | null;
  payroll_to_revenue_pct: number | null; // ratio 0-1 (la vue)
}
export interface JourSeuil {
  date: string;
  gross_margin_ht: number | null;
  charges_day_eur: number | null;
  break_even_revenue_ht: number | null;
  break_even_hour: number | null;
  is_break_even_reached: boolean | null;
  margin_rate_30d: number | null; // ratio 0-1
  opening_days_ref: number | null;
}
export interface Resultat { mois: MoisResultat[]; jour: JourSeuil | null }

/** Les 6 derniers mois (complets ou non, le plus récent d'abord) et le dernier jour de vente. */
export async function readResultat(bq: any, location_id: string): Promise<Resultat> {
  const q = (query: string) => bq.query({ query, params: { loc: location_id }, location: "EU" }).then(([rows]: [any[]]) => rows as any[]);
  const [mRows, dRows] = await Promise.all([
    q(`SELECT CAST(month AS STRING) AS month, is_complete_month, sales_days, revenue_net_ht, gross_margin_ht, coverage_pct,
              fixed_costs_month_eur, payroll_month_eur, net_result_eur, payroll_to_revenue_pct
       FROM \`${PROJECT}.semantic.vw_insight_event_monthly_result\`
       WHERE location_id = @loc ORDER BY month DESC LIMIT 6`),
    q(`SELECT CAST(date AS STRING) AS d, gross_margin_ht, charges_day_eur, break_even_revenue_ht, break_even_hour,
              is_break_even_reached, margin_rate_30d, opening_days_ref
       FROM \`${PROJECT}.semantic.vw_insight_event_daily_margin\`
       WHERE location_id = @loc AND date <= CURRENT_DATE() ORDER BY date DESC LIMIT 1`),
  ]);
  const mois: MoisResultat[] = mRows.map((r: any) => ({
    month: String(flat(r.month)).slice(0, 10), is_complete_month: flat(r.is_complete_month) === true,
    sales_days: num(r.sales_days), revenue_net_ht: num(r.revenue_net_ht), gross_margin_ht: num(r.gross_margin_ht), coverage_pct: num(r.coverage_pct),
    fixed_costs_month_eur: num(r.fixed_costs_month_eur), payroll_month_eur: num(r.payroll_month_eur), net_result_eur: num(r.net_result_eur),
    payroll_to_revenue_pct: num(r.payroll_to_revenue_pct),
  }));
  const d = dRows[0];
  const jour: JourSeuil | null = d ? {
    date: String(flat(d.d)).slice(0, 10), gross_margin_ht: num(d.gross_margin_ht), charges_day_eur: num(d.charges_day_eur),
    break_even_revenue_ht: num(d.break_even_revenue_ht), break_even_hour: num(d.break_even_hour),
    is_break_even_reached: flat(d.is_break_even_reached) === true ? true : flat(d.is_break_even_reached) === false ? false : null,
    margin_rate_30d: num(d.margin_rate_30d), opening_days_ref: num(d.opening_days_ref),
  } : null;
  return { mois, jour };
}

// ── Composition PURE : le résultat → faits et blocs ────────────────────────────────────────────────
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const frInt = (n: number): string => Math.round(Math.abs(Number(n) || 0)).toLocaleString("fr-FR");
/** Un montant signé : « −917 € », « 13 003 € » (le signe moins typographique, comme Piloter). */
const eurS = (n: number): string => `${Number(n) < 0 ? "−" : ""}${frInt(n)} €`;
const eur = (n: number): string => `${frInt(n)} €`;
const pct1 = (ratio: number): string => `${String(Math.round(ratio * 1000) / 10).replace(".", ",")} %`;
const pct0 = (ratio: number): string => `${Math.round(ratio * 100)} %`;
export const moisFr = (isoMonth: string): string => { const m = /^(\d{4})-(\d{2})/.exec(isoMonth); return m ? `${MOIS_FR[Number(m[2]) - 1]} ${m[1]}` : isoMonth; };
const frDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export type ResultatAbsence = "charges" | "couverture" | "aucun_mois";
/** Les blocs NOMMÉS (12/09, composer_rapport les range par section) : le tableau des mois, le fait du seuil. */
export interface ResultatParts { mois?: AnswerBlock; seuil?: AnswerBlock; seuil_fact?: string }
export interface ResultatLecture { found: boolean; absence?: ResultatAbsence; facts: string[]; blocks: AnswerBlock[]; mois_lu: string | null; parts: ResultatParts }

/**
 * `mois` (AAAA-MM) : le mois demandé ; défaut = le dernier mois complet. Les mots sont ceux que Piloter rend
 * (tableau.astro : « résultat net · août 2026 », « Résultat net du dernier mois complet : marge brute moins charges
 * fixes (N €) moins masse salariale (N €), calculée sur X % de votre CA », « seuil de rentabilité du jour · atteint
 * à N h ») ; le sujet d'un montant est le résultat, la marge, la masse salariale ou la journée — jamais « il fait ».
 */
export function composeResultatFacts(r: Resultat, mois?: string | null): ResultatLecture {
  const complets = r.mois.filter((m) => m.is_complete_month);
  const wanted = mois ? r.mois.find((m) => m.month.slice(0, 7) === mois) ?? null : complets[0] ?? null;
  const facts: string[] = [];
  const blocks: AnswerBlock[] = [];
  const parts: ResultatParts = {};

  if (!wanted && !complets.length) {
    return { found: false, absence: "aucun_mois", facts: [], blocks: [], mois_lu: null, parts };
  }
  const principal = wanted ?? complets[0];
  const enCours = !principal.is_complete_month;
  if (enCours) {
    facts.push(`${cap(moisFr(principal.month))} est en cours : le résultat net se lit sur un mois complet.` + (complets[0] ? ` Le dernier mois complet est ${moisFr(complets[0].month)}.` : ""));
  }
  const lus = (enCours ? complets : [principal, ...complets.filter((m) => m.month !== principal.month)]).slice(0, 3);
  const lisible = lus.filter((m) => m.net_result_eur != null);
  if (!lisible.length) {
    const ref = lus[0] ?? principal;
    const absence: ResultatAbsence = ref.fixed_costs_month_eur == null || ref.payroll_month_eur == null ? "charges" : "couverture";
    return { found: false, absence, facts: [], blocks: [], mois_lu: ref.month, parts };
  }
  for (const m of lisible) {
    facts.push(
      `En ${moisFr(m.month)}, votre résultat net est de ${eurS(m.net_result_eur as number)} : ${eur(m.gross_margin_ht as number)} de marge brute` + (m.revenue_net_ht != null ? ` sur ${eur(m.revenue_net_ht)} de CA net HT` : "") + `, moins ${eur(m.fixed_costs_month_eur as number)} de charges fixes et ${eur(m.payroll_month_eur as number)} de masse salariale, calculé sur ${pct0(m.coverage_pct as number)} de votre CA.`,
    );
  }
  const p = lisible[0];
  if (p.payroll_to_revenue_pct != null && p.revenue_net_ht != null) {
    facts.push(`En ${moisFr(p.month)}, votre masse salariale représente ${pct1(p.payroll_to_revenue_pct)} de votre CA net HT (${eur(p.revenue_net_ht)}).`);
  }
  parts.mois = {
    type: "table",
    cols: [{ label: "Mois" }, { label: "CA net HT" }, { label: "Marge brute" }, { label: "Charges fixes" }, { label: "Masse salariale" }, { label: "Résultat net" }],
    rows: lisible.map((m) => ({ cells: [
      { v: cap(moisFr(m.month)), bold: true }, { v: eur(m.revenue_net_ht ?? 0) }, { v: eur(m.gross_margin_ht as number) },
      { v: eur(m.fixed_costs_month_eur as number) }, { v: eur(m.payroll_month_eur as number) },
      { v: eurS(m.net_result_eur as number), bold: true, ...((m.net_result_eur as number) < 0 ? { color: "#B45309" } : {}) },
    ] })),
  };
  blocks.push(parts.mois);

  const j = r.jour;
  if (j && j.break_even_revenue_ht != null) {
    let s = `Le ${frDate(j.date)}, votre seuil de rentabilité du jour est de ${eur(j.break_even_revenue_ht)} de CA net HT`;
    if (j.charges_day_eur != null && j.opening_days_ref != null && j.margin_rate_30d != null) {
      s += ` (${eur(j.charges_day_eur)} de charges fixes et de masse salariale par jour de vente, sur ${j.opening_days_ref} jours de vente du dernier mois complet, au taux de marge brute de ${pct0(j.margin_rate_30d)} des 30 derniers jours)`;
    }
    if (j.is_break_even_reached === true) s += j.break_even_hour != null ? ` ; il est atteint à ${j.break_even_hour} h.` : " ; il est atteint.";
    else if (j.is_break_even_reached === false) s += j.gross_margin_ht != null ? ` ; il n'est pas atteint (${eur(j.gross_margin_ht)} de marge brute sur la journée).` : " ; il n'est pas atteint.";
    else s += ".";
    facts.push(s);
    parts.seuil = { type: "facts", items: [s] }; parts.seuil_fact = s;
    blocks.push(parts.seuil);
  }
  blocks.push({ type: "sources", items: ["Votre marge brute mesurée (caisse et prix d'achat) et vos charges fixes et masse salariale déclarées — mois complets ; seuil de rentabilité du dernier jour de vente"] });
  return { found: true, facts, blocks, mois_lu: p.month, parts };
}

export function resultatToText(l: ResultatLecture, absenceFr: string): string {
  return l.found && l.facts.length ? l.facts.map((f) => `• ${f}`).join("\n") : absenceFr;
}
