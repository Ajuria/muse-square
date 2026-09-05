// src/lib/ai/resolver.ts
// LA PORTE D'ENTRÉE conversationnelle (owner go 28/08) — « le LLM comprend, le code calcule ».
// Un appel léger à sortie structurée remplit le tuple {intention, entités, période(s), KPI}
// depuis la question + le cadre + l'historique (le LLM fait la partie linguistique : suites,
// contestations, héritage de slots). Trois garde-fous déterministes :
//   1. chaque entité est VALIDÉE contre les listes réelles du site (invalide → écartée) ;
//   2. les dates sont bornées et ordonnées (sinon le slot tombe) ;
//   3. le cadre ne porte JAMAIS un fait ni un chiffre — que du métadonnées de routage.
// Échec/timeout/basse confiance → null : la chaîne legacy (regex) reste le repli complet.

import { callClaudeMessagesAPI } from "./runtime/claude";
import { modelFor } from "./models";
import { resolverSchema, resolverSystemPrompt } from "../explorer/semanticRegistry";
import type { SiteEntities, SiteEntity } from "../explorer/entityResolver";
import { KPI_NOM_FR, type KpiKey } from "../kpi/kpiRegistry";
import { resolveFrPeriod } from "../dates/frPeriod";

export interface ResolvedPeriod { start: string; end: string; expression: string }

export interface ResolvedIdea { levier: "frequentation" | "conversion" | "panier" | "yield" | "fidelisation"; condition: "rain" | "heat" | "school_holiday" | "public_holiday" | "tourism_peak" | "calme" | "aucune" }

export interface ResolvedFrame {
  intent: "plan" | "entity_period" | "journal" | "pourquoi" | "idee" | "hors_perimetre"
    | "jour" | "bilan_periode" | "dimension" | "fenetre" | "entite_exterieure" | "evenement_lookup" | "mes_evenements" | "rapport"
    | "fiches" | "autre";
  entity_names: Array<{ nom: string; type: string }>;
  periode: ResolvedPeriod | null;
  periode_comparaison: ResolvedPeriod | null;
  kpi: KpiKey | null;
  idee?: ResolvedIdea | null;
}

export interface ResolvedTurn extends ResolvedFrame {
  entities: SiteEntity[];       // les entités VALIDÉES (l'objet complet du site)
  periode_validee: boolean;     // I2 — frPeriod a parsé l'expression et ses bornes ont remplacé celles du LLM
  suite: boolean;
  changements: string[];        // le diff déclaré par le résolveur — tracé, testable
  confiance: "haute" | "basse"; // I1 — tracée ; la garde déterministe tranche
  questions_supplementaires: string[]; // I6 — les autres questions du message, mot pour mot (cap 3)
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const okPeriod = (p: any): ResolvedPeriod | null => {
  if (!p || typeof p !== "object") return null;
  const s = String(p.start ?? ""), e = String(p.end ?? "");
  if (!ISO.test(s) || !ISO.test(e) || s > e) return null;
  if (s < "2020-01-01" || e > "2031-12-31") return null;
  return { start: s, end: e, expression: String(p.expression ?? "") };
};

// Rapprochement nom → entité réelle : exact d'abord, puis insensible casse/accents.
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function matchName(nom: string, type: string, site: SiteEntities): SiteEntity | null {
  const exact = site.entities.find((e) => e.kind === type && e.name === nom);
  if (exact) return exact;
  const n = norm(nom);
  return site.entities.find((e) => e.kind === type && norm(e.name) === n) ?? null;
}

export async function resolveTurn(opts: {
  qRaw: string;
  site: SiteEntities;
  today: string;
  frame: ResolvedFrame | null;   // le tuple du tour précédent (écho client) — métadonnées seules
  history: Array<{ role: "user" | "assistant"; content: string }>;
  timeoutMs?: number;
}): Promise<ResolvedTurn | null> {
  try {
    const frameLine = opts.frame
      ? `\n\nCADRE (tour précédent — hérite ce que la question ne change pas) : ${JSON.stringify({
          intent: opts.frame.intent,
          entites: opts.frame.entity_names,
          periode: opts.frame.periode,
          kpi: opts.frame.kpi,
        })}`
      : "";
    const call = await callClaudeMessagesAPI({
      model: modelFor("classifier"),
      maxTokens: 500,
      temperature: 0,
      // p95 mesurée ~3 s (batterie 28/08) — 4 s coupait de vrais tours ; 8 s posé alors. 04/09 13:01-13:03
      // (télémétrie analytics.consulter_telemetry, event_type resolver) : 4 appels coupés à 8 s sur 20 min
      // (~9 s bout en bout) alors que la journée entière donnait 0 nul et 3,5 s au pire — une pointe de
      // latence API. Un tour coupé part sur les regex et perd sa comparaison (batterie D6) : plus cher
      // que 4 s d'attente. 12 s ; la prochaine lecture se fait sur la télémétrie, pas sur une supposition.
      timeoutMs: opts.timeoutMs ?? 12000,
      cacheSystem: true,
      conversationHistory: (opts.history ?? []).slice(-8),
      userText: `${opts.qRaw}${frameLine}`,
      system: resolverSystemPrompt(opts.site, opts.today),
      outputSchema: resolverSchema(),
    });
    if (!call.ok || !call.rawText) return null;
    let out: any;
    try { out = JSON.parse(call.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { return null; }
    // Tolérance de clé (mesuré 28/08 : Haiku sans mode structuré écrivait « intention ») —
    // le schéma reste passé pour les modèles qui le supportent.
    const intent = String(out?.intent ?? out?.intention ?? "");
    if (!["plan", "entity_period", "journal", "pourquoi", "idee", "hors_perimetre",
          "jour", "bilan_periode", "dimension", "fenetre", "entite_exterieure", "evenement_lookup", "mes_evenements", "rapport",
          "fiches", "autre"].includes(intent)) return null;
    const entity_names = Array.isArray(out?.entites)
      ? out.entites.filter((e: any) => e && typeof e.nom === "string" && typeof e.type === "string").slice(0, 4)
      : [];
    // Garde-fou 1 : validation contre les listes réelles — une entité inconnue est ÉCARTÉE
    // (jamais devinée) ; l'appelant décide alors d'éliciter avec les vraies listes.
    const entities = entity_names
      .map((e: any) => matchName(e.nom, e.type, opts.site))
      .filter((e: SiteEntity | null): e is SiteEntity => e != null);
    // Garde-fou 2bis (I2, 03/09) : LE CODE VALIDE LES DATES. Quand frPeriod parse l'expression
    // que le modèle a recopiée (« la semaine dernière », « hier », « cet été »), ses bornes
    // remplacent celles du modèle — mesuré 03/09 : Haiku lisait « la semaine dernière » comme
    // les 7 derniers jours, frPeriod (le SST) dit la semaine civile précédente. Une expression
    // que frPeriod ne connaît pas garde les bornes du modèle (bornées/ordonnées par okPeriod).
    const bias = intent === "plan" ? "future" : "past";
    let periode_validee = false;
    const validee = (p: ResolvedPeriod | null): ResolvedPeriod | null => {
      if (!p || !p.expression) return p;
      const fp = resolveFrPeriod(p.expression, { today: opts.today, yearBias: bias });
      if (!fp) return p;
      if (fp.start !== p.start || fp.end !== p.end) periode_validee = true;
      return { start: fp.start, end: fp.end, expression: p.expression };
    };
    const periodeV = validee(okPeriod(out?.periode));
    const periodeCmpV = validee(okPeriod(out?.periode_comparaison));
    const kpiRawV = out?.kpi != null ? String(out.kpi) : null;
    const LEVIERS = ["frequentation", "conversion", "panier", "yield", "fidelisation"];
    const CONDS = ["rain", "heat", "school_holiday", "public_holiday", "tourism_peak", "calme", "aucune"];
    const idee = out?.idee && typeof out.idee === "object"
      && LEVIERS.includes(String(out.idee.levier)) && CONDS.includes(String(out.idee.condition))
      ? { levier: String(out.idee.levier), condition: String(out.idee.condition) } as ResolvedIdea
      : null;
    return {
      intent: intent as ResolvedTurn["intent"],
      entity_names,
      entities,
      periode: periodeV,
      periode_comparaison: periodeCmpV,
      periode_validee,
      kpi: kpiRawV && kpiRawV in KPI_NOM_FR ? (kpiRawV as KpiKey) : null,
      idee,
      suite: Boolean(out?.suite),
      changements: Array.isArray(out?.changements) ? out.changements.map(String).slice(0, 6) : [],
      // Absente (modèle sans le champ) → haute : le comportement d'avant I1, jamais un refus de plus.
      confiance: String(out?.confiance ?? "haute") === "basse" ? "basse" : "haute",
      questions_supplementaires: Array.isArray(out?.questions_supplementaires)
        ? out.questions_supplementaires.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 3) : [],
    };
  } catch {
    return null;
  }
}

/** Le cadre à écho-er au client — STRICTEMENT le tuple de routage, jamais un fait. */
export function frameOf(r: ResolvedTurn): ResolvedFrame {
  return {
    intent: r.intent,
    // Les noms VALIDÉS d'abord (le cadre doit être vrai) ; à défaut les noms proposés.
    entity_names: r.entities.length
      ? r.entities.map((e) => ({ nom: e.name, type: e.kind }))
      : r.entity_names,
    periode: r.periode,
    periode_comparaison: r.periode_comparaison,
    kpi: r.kpi,
    idee: r.idee ?? null,
  };
}
