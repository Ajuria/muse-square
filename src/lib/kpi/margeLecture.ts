// src/lib/kpi/margeLecture.ts — LA LECTURE DE MARGE de l'agent (docs/explorer-outil-spec.md § 4 `lire_marge`, § 7 couche 1,
// 13/09) : ce que les sorties anticipées `_measured_margin_v1` et `_declared_margin_v1` de insight/prompt.ts faisaient,
// rentré dans l'outil — la MESURE d'abord (marge brute sur les prix d'achat, lib/kpi/margin.ts, mode mesure ≥ 90 %,
// mixte ≥ 50 %), sinon l'ESTIMATION par les marges DÉCLARÉES par famille (CA de la famille × % déclaré, couverture dite),
// sinon la marge globale déclarée (CA × %), sinon l'absence. Les mots sont ceux déjà approuvés (contextCopy.ts :
// measuredMarginAnswerFr, declaredFamilyMarginAnswerFr, declaredMarginAnswerFr) — jamais réécrits ici.
// Les jours : « week-end » (samedi + dimanche vendus), un jour de semaine — le filtre de la lecture mesurée
// (readMeasuredMargin30d dowSql), le libellé le dit. Le CA des estimations est celui de la MÊME lecture (vue
// semantic daily_margin / family_margin_daily, même fenêtre, mêmes jours) : une seule source pour la mesure et
// l'estimation (prompt.ts lisait mart.fct_client_sales_signals_daily et vw_…_client_offering_daily — une lecture mart
// de moins). PUR : composeMargeLecture ; la lecture : readMargeLecture.
import type { AnswerBlock } from "../explorer/blocks";
import { ABSENCE_FR } from "../explorer/blocks";
import type { FamilyResult } from "../insightFamilies/types";
import { composeMargeFamily } from "../insightFamilies/marge";
import { readMeasuredMargin30d, type MeasuredMargin30d } from "./margin";
import { declaredFamilyMarginAnswerFr, declaredMarginAnswerFr } from "../context/contextCopy";
import { familySlug, getDeclaredFamilyMargins, getDeclaredMarginPct } from "../ai/corrections";

export type JoursMot = "week_end" | "lundi" | "mardi" | "mercredi" | "jeudi" | "vendredi" | "samedi" | "dimanche";
export const JOURS: JoursMot[] = ["week_end", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
// BigQuery DAYOFWEEK : 1 = dimanche … 7 = samedi (la règle de prompt.ts, 04/09).
const DOW: Record<Exclude<JoursMot, "week_end">, number> = { dimanche: 1, lundi: 2, mardi: 3, mercredi: 4, jeudi: 5, vendredi: 6, samedi: 7 };

/** Le filtre de jours : le SQL de la lecture (sur `date`, que margin.ts adapte) et le libellé de la fenêtre. */
export function joursFilter(j?: JoursMot | null): { sql: string; fr: string } {
  if (!j) return { sql: "", fr: "vos 30 derniers jours" };
  if (j === "week_end") return { sql: " AND EXTRACT(DAYOFWEEK FROM date) IN (1, 7)", fr: "vos jours de week-end des 30 derniers jours" };
  return { sql: ` AND EXTRACT(DAYOFWEEK FROM date) = ${DOW[j]}`, fr: `vos ${j}s des 30 derniers jours` };
}

/** Le mot de jours d'une question (« le week-end », « le samedi ») ; null sans qualificatif. */
export function joursDeLaQuestion(q: string): JoursMot | null {
  const n = String(q ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\bweek ?-?end\b/.test(n)) return "week_end";
  for (const j of Object.keys(DOW) as Array<Exclude<JoursMot, "week_end">>) if (new RegExp(`\\b${j}s?\\b`).test(n)) return j;
  return null;
}

export interface MargesDeclarees {
  familles: Array<{ slug: string; pct: number; famille: string | null }>;
  globale: { pct: number; declarant_name: string | null; corrected_at: string | null } | null;
}
export type MargeMode = "mesure" | "mixte" | "declaree_familles" | "declaree_globale" | "aucune";
export interface MargeLecture { mode: MargeMode; result: FamilyResult; blocks: AnswerBlock[]; window_fr: string }

/**
 * PUR — la lecture mesurée + les déclarations → mode, résultat (faits) et blocs. Mesure ou mixte : la carte renderMarge et
 * ses faits (composeMargeFamily, la fenêtre nommée). Sinon, l'estimation déclarée : un titre et des faits (les lignes
 * du texte approuvé), pas de carte — une estimation n'est pas une mesure et ne s'affiche pas comme telle.
 */
export function composeMargeLecture(m: MeasuredMargin30d, declared: MargesDeclarees, date: string, jours?: JoursMot | null): MargeLecture {
  const window_fr = joursFilter(jours).fr;
  if ((m.mode === "mesure" || m.mode === "mixte") && m.gross_margin_ht != null && m.coverage_pct != null) {
    const result = composeMargeFamily(m, date, window_fr);
    return { mode: m.mode, result, window_fr, blocks: result.found ? [{ type: "card", render: "renderMarge", data: result.data }, ...(result.sources.length ? [{ type: "sources", items: result.sources } as AnswerBlock] : [])] : absence() };
  }
  const estime = (headline: string, answer: string, mode: MargeMode, source: string): MargeLecture => {
    const items = [headline, ...answer.split("\n").map((l) => l.replace(/^- /, "").trim()).filter(Boolean)];
    const result: FamilyResult = { found: true, data: { found: true, date, mode, estimation: true, headline, answer }, facts: items.map((fact_fr) => ({ fact_fr, claim_type: "observed" })), sources: [source] };
    return { mode, result, window_fr, blocks: [{ type: "prose", md: `**${headline}**` }, { type: "facts", items: items.slice(1) }, { type: "sources", items: [source] }] };
  };
  if (declared.familles.length && m.revenue > 0) {
    const pctBySlug: Record<string, number> = {};
    for (const f of declared.familles) pctBySlug[f.slug] = f.pct;
    const lines = m.families
      .filter((f) => f.revenue > 0 && pctBySlug[familySlug(f.family)] != null)
      .sort((a, b) => b.revenue - a.revenue)
      .map((f) => ({ famille: f.family, ca_eur: f.revenue, pct: pctBySlug[familySlug(f.family)] }));
    if (lines.length) {
      const a = declaredFamilyMarginAnswerFr({ lines, ca_total_eur: m.revenue, window_fr });
      return estime(a.headline, a.answer, "declaree_familles", "Votre caisse (CA par famille) × vos marges déclarées par famille — une estimation, pas une mesure");
    }
  }
  if (declared.globale && m.revenue > 0) {
    const a = declaredMarginAnswerFr({ pct: declared.globale.pct, ca_eur: m.revenue, window_fr, declarant_name: declared.globale.declarant_name, declared_on: declared.globale.corrected_at });
    return estime(a.headline, a.answer, "declaree_globale", "Votre caisse (CA) × votre marge moyenne déclarée — une estimation, pas une mesure");
  }
  return { mode: "aucune", window_fr, result: { found: false, data: { found: false, date, mode: m.mode, coverage_pct: m.coverage_pct }, facts: [], sources: [] }, blocks: absence() };
}
const absence = (): AnswerBlock[] => [{ type: "absence", manque: ABSENCE_FR.marge.manque, geste: ABSENCE_FR.marge.geste ?? null }];

/**
 * La lecture : la mesure (fenêtre de 30 jours finissant `date`, jours filtrés) et les déclarations du site en parallèle.
 * `declaredGlobaleOverride` : une marge globale déclarée DANS LE MÊME TOUR (prompt.ts, déclare-et-demande) prime sur le
 * journal — la fraîcheur, comme avant la migration.
 */
export async function readMargeLecture(bq: any, location_id: string, date: string, jours?: JoursMot | null, declaredGlobaleOverride?: MargesDeclarees["globale"]): Promise<MargeLecture> {
  const [m, familles, globale] = await Promise.all([
    readMeasuredMargin30d(bq, location_id, date, joursFilter(jours).sql),
    getDeclaredFamilyMargins(location_id).catch(() => []),
    declaredGlobaleOverride ? Promise.resolve(declaredGlobaleOverride) : getDeclaredMarginPct(location_id).catch(() => null),
  ]);
  return composeMargeLecture(m, { familles: familles.map((f) => ({ slug: f.slug, pct: f.pct, famille: f.famille })), globale }, date, jours);
}

/** Le texte rendu AU MODÈLE : un fait par ligne, ou l'absence. */
export function margeToText(l: MargeLecture): string {
  return l.result.found && l.result.facts.length ? l.result.facts.map((f) => `• ${f.fact_fr}`).join("\n") : ABSENCE_FR.marge.manque;
}
