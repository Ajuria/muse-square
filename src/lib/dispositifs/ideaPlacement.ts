// src/lib/dispositifs/ideaPlacement.ts
// L'IDÉE SOUMISE (owner go 28/08, roadmap v1) — l'utilisateur propose une idée d'opération ;
// la réponse la PLACE (fenêtres calmes, jours de la condition visée), l'entoure d'ANALOGUES
// mesurés (ses dispositifs prouvés du même levier, les références crawlées du secteur), et la
// cadre en MISE EN TEST (l'engagement reprend SES mots, le verdict tranchera). Rien n'est
// inventé : chaque section compose des foyers existants, une source vide se dit vide.
// Le résolveur comprend l'idée (levier + condition visée) ; ce module calcule.

import { listCalmWeeks, type CalmWeek } from "../insightFamilies/events";
import { listDayFactors, dayFactorKeys, factorFr } from "../explorer/journalPlan";
import { corrIndexFr, signalAConfirmer } from "../kpi/dayClassRegistry";
import { listIndustryPlays, type BestInClassPlay, type Lever } from "../bestInClass/bestInClassStore";
import type { ResolvedIdea } from "../ai/resolver";
import type { CompareSection, EntityCompareBlocks } from "../explorer/entityReading";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const frD = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const frEur = (v: number): string => Math.round(v).toLocaleString("fr-FR");

export interface IdeaMotif {
  mot_fr: string;
  med_gap_eur: number | null;
  corr_index_fr: string | null;
  a_confirmer: boolean;
}

export interface IdeaInputs {
  idea: ResolvedIdea;
  calm_weeks: CalmWeek[];                       // semaines à venir (scores ~6 semaines)
  condition_days: string[];                     // jours à VENIR portant la condition visée (≤ 21 j)
  motif: IdeaMotif | null;                      // la mesure de la condition visée (store)
  proven: Array<{ text: string; lever: Lever | null }>;  // dispositifs PROUVÉS du site (levier connu si mappable)
  web_plays: BestInClassPlay[];                 // références crawlées du MÊME levier
}

export interface IdeaBlocks extends EntityCompareBlocks {
  /** Fenêtre proposée pour la mise en test (jour de condition à venir, sinon lundi calme). */
  test_date: string | null;
}

export function buildIdeaBlocks(inp: IdeaInputs): IdeaBlocks {
  const sections: CompareSection[] = [];
  const corrFoot: string[] = [];

  // ── 1. Où la placer — les fenêtres RÉELLES : jours de la condition visée, semaine calme. ──
  const placeFacts: string[] = [];
  if (inp.idea.condition !== "aucune" && inp.idea.condition !== "calme") {
    const mot = inp.motif?.mot_fr ?? null;
    if (inp.condition_days.length && mot) {
      placeFacts.push(`Vos prochains jours de ${mot} : ${inp.condition_days.slice(0, 4).map(frD).join(", ")}${inp.condition_days.length > 4 ? "…" : ""}.`);
    } else if (mot) {
      placeFacts.push(`Aucun jour de ${mot} annoncé sur les 3 prochaines semaines — l'idée attendra sa condition.`);
    }
    if (inp.motif && inp.motif.med_gap_eur != null && mot) {
      const m = inp.motif;
      placeFacts.push(`Vos jours de ${mot} : ${(m.med_gap_eur as number) >= 0 ? "+" : "−"}${frEur(Math.abs(m.med_gap_eur as number))} €/jour vs votre résultat habituel (médiane).${m.corr_index_fr ? ` ${m.corr_index_fr}.` : ""}${m.a_confirmer ? " Signal à confirmer." : ""}`);
      if (m.corr_index_fr) corrFoot.push(`${mot} ↔ CA : ${m.corr_index_fr.charAt(0).toLowerCase() + m.corr_index_fr.slice(1)}${m.a_confirmer ? " — signal à confirmer" : ""}.`);
    }
  }
  for (const w of inp.calm_weeks.filter((x) => x.state === "quiet").slice(0, 1)) {
    placeFacts.push(`Semaine du ${w.label} : aucun événement concurrent relevé ne vise votre public.`);
  }
  if (!placeFacts.length) placeFacts.push("Aucune fenêtre particulière ne se détache sur les semaines couvertes — l'idée se teste sur une semaine ordinaire.");
  sections.push({ title: "Où la placer", facts: placeFacts });

  // ── 2. Ce qui est prouvé chez vous — les dispositifs du MÊME levier, sinon l'absence dite. ──
  const sameLever = inp.proven.filter((p) => p.lever === inp.idea.levier).slice(0, 3);
  sections.push({
    title: "Ce qui est prouvé chez vous",
    facts: sameLever.length
      ? sameLever.map((p) => `« ${p.text} » — prouvé chez vous, même levier que votre idée.`)
      : [`Aucun dispositif prouvé chez vous sur ce levier — votre idée serait le premier test mesuré.`],
  });

  // ── 3. Des lieux comparables ont fait — registre WEB, jamais mêlé au vérifié. ──
  if (inp.web_plays.length) {
    sections.push({
      title: "Des lieux comparables ont fait",
      register: "web",
      facts: inp.web_plays.slice(0, 2).map((pl) => `**${pl.title}** — ${pl.move} Résultat : ${pl.outcome} (${pl.source_name}${pl.published_at ? `, ${pl.published_at}` : ""}).`),
    });
  }

  // ── 4. Mettre en test — la date proposée + le geste (le CTA porte les MOTS de l'utilisateur). ──
  const test_date = inp.condition_days[0]
    ?? (inp.calm_weeks.find((w) => w.state === "quiet")?.wk ?? null);
  sections.push({
    title: "Mettre en test",
    facts: [
      `Votre idée se teste en une occurrence mesurée${test_date ? ` — le ${frD(test_date)} se propose` : ""} : engagez-la avec son KPI, le verdict tranchera. L'engagement reprend vos mots, la cible se règle dans le formulaire.`,
    ],
  });

  if (corrFoot.length) sections.push({ title: "Indices de corrélation", facts: corrFoot });

  return {
    headline: "Votre idée, placée sur vos données",
    sections,
    sources: [
      "Veille concurrence (scores ~6 semaines devant)",
      "Calendrier et météo par jour (mêmes règles que les verdicts)",
      "Motifs mesurés sur votre historique (classes de jours)",
      "Vos dispositifs prouvés (journal)",
      ...(inp.web_plays.length ? ["Références web de votre secteur (crawl, sources citées)"] : []),
    ],
    test_date,
  };
}

// ── Le lecteur : 4 lectures parallèles, composition pure ensuite. ──────────────────────────
const CONDITION_TO_CLASSES: Record<string, string[]> = {
  rain: ["rain"], heat: ["heat_28_plus", "heat_25_27"],
  school_holiday: ["school_holiday"], public_holiday: ["public_holiday"], tourism_peak: ["tourism_peak"],
};

export async function readIdeaPlacement(
  bq: any,
  location_id: string,
  idea: ResolvedIdea,
  todayIso: string,
): Promise<IdeaBlocks> {
  const horizonEnd = new Date(Date.parse(todayIso) + 21 * 86400000).toISOString().slice(0, 10);
  const [calmAll, dayRows, impactRows, provenRows, profR] = await Promise.all([
    listCalmWeeks(bq, location_id, todayIso).catch(() => []),
    idea.condition !== "aucune" && idea.condition !== "calme"
      ? listDayFactors(bq, location_id, { start: todayIso, end: horizonEnd }).catch(() => [])
      : Promise.resolve([]),
    bq.query({
      query: `SELECT class_key, basis, med_gap_eur, n_days, corr_r, avg_log, sd_log, n_log
              FROM \`${PROJECT}.analytics.day_class_impacts\`
              WHERE location_id = @loc AND metric = 'revenue_residual' AND basis IN ('pure', 'marginal')`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    // Dispositifs ACTIFS du site — la table porte outcome_lever EN COLONNE (dérivé à la
    // documentation par leverForActionType, bestPractices.ts) : on le lit, jamais re-deviné.
    // Dédup par practice_id sur created_at (la table n'a PAS d'updated_at — vérifié
    // INFORMATION_SCHEMA 28/08).
    bq.query({
      query: `SELECT practice_text, outcome_lever FROM (
                SELECT practice_text, outcome_lever, status,
                       ROW_NUMBER() OVER (PARTITION BY practice_id ORDER BY created_at DESC) AS rn
                FROM \`${PROJECT}.analytics.best_practices\`
                WHERE location_id = @loc
              ) WHERE rn = 1 AND status = 'active' LIMIT 20`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
    bq.query({
      query: `SELECT company_activity_type FROM \`${PROJECT}.raw.insight_event_user_location_profile\` WHERE location_id = @loc LIMIT 1`,
      params: { loc: location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
  ]);

  // Jours à venir portant la condition (clé simple : heat couvre heat via facteur 'heat').
  const condKey = idea.condition;
  const condition_days: string[] = [];
  for (const d of dayRows as any[]) {
    const date = String(flat(d.date) ?? "").slice(0, 10);
    if (date && dayFactorKeys(d).includes(condKey)) condition_days.push(date);
  }

  // La mesure de la condition (pure d'abord, marginale sinon — même règle que le plan).
  let motif: IdeaMotif | null = null;
  const classes = CONDITION_TO_CLASSES[condKey] ?? [];
  if (classes.length) {
    const byClass = new Map<string, any>();
    for (const row of impactRows as any[]) {
      const k = String(flat(row.class_key));
      if (Number(flat(row.n_days)) < 5) continue;
      const cur = byClass.get(k);
      if (!cur || (String(flat(cur.basis)) === "marginal" && String(flat(row.basis)) === "pure")) byClass.set(k, row);
    }
    const row = classes.map((c) => byClass.get(c)).find((x) => x != null);
    const mot = factorFr(condKey);
    if (row && mot) {
      const med = Number(flat(row.med_gap_eur));
      const rv = Number.isFinite(Number(flat(row.corr_r))) ? Number(flat(row.corr_r)) : null;
      const al = Number(flat(row.avg_log)), sl = Number(flat(row.sd_log)), nl = Number(flat(row.n_log));
      const t = Number.isFinite(al) && Number.isFinite(sl) && sl > 0 && nl >= 2 ? Math.abs(al) / (sl / Math.sqrt(nl)) : 0;
      motif = {
        mot_fr: mot,
        med_gap_eur: Number.isFinite(med) ? Math.round(med) : null,
        corr_index_fr: corrIndexFr(rv, Number(flat(row.n_days)) || null),
        a_confirmer: signalAConfirmer(med, rv, t),
      };
    }
  }

  const proven = (provenRows as any[]).map((r) => ({
    text: String(flat(r.practice_text) ?? "").split(" — ")[0].slice(0, 80),
    lever: (flat(r.outcome_lever) ?? null) as Lever | null,
  })).filter((p) => p.text);

  const industry = String(flat((profR as any[])?.[0]?.company_activity_type) ?? "").trim();
  const playsAll = industry ? await listIndustryPlays(bq, industry, 6).catch(() => []) : [];
  const web_plays = playsAll.filter((p) => p.lever === idea.levier).slice(0, 2);

  return buildIdeaBlocks({ idea, calm_weeks: calmAll as CalmWeek[], condition_days, motif, proven, web_plays });
}
