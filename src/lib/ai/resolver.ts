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
import { resolverSchema, resolverSystemPrompt } from "../semanticRegistry";
import type { SiteEntities, SiteEntity } from "../entityResolver";
import { KPI_NOM_FR, type KpiKey } from "../kpiRegistry";

export interface ResolvedPeriod { start: string; end: string; expression: string }

export interface ResolvedFrame {
  intent: "plan" | "entity_period" | "journal" | "autre";
  entity_names: Array<{ nom: string; type: string }>;
  periode: ResolvedPeriod | null;
  periode_comparaison: ResolvedPeriod | null;
  kpi: KpiKey | null;
}

export interface ResolvedTurn extends ResolvedFrame {
  entities: SiteEntity[];       // les entités VALIDÉES (l'objet complet du site)
  suite: boolean;
  changements: string[];        // le diff déclaré par le résolveur — tracé, testable
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
      timeoutMs: opts.timeoutMs ?? 4000,
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
    if (!["plan", "entity_period", "journal", "autre"].includes(intent)) return null;
    const entity_names = Array.isArray(out?.entites)
      ? out.entites.filter((e: any) => e && typeof e.nom === "string" && typeof e.type === "string").slice(0, 4)
      : [];
    // Garde-fou 1 : validation contre les listes réelles — une entité inconnue est ÉCARTÉE
    // (jamais devinée) ; l'appelant décide alors d'éliciter avec les vraies listes.
    const entities = entity_names
      .map((e: any) => matchName(e.nom, e.type, opts.site))
      .filter((e: SiteEntity | null): e is SiteEntity => e != null);
    const kpiRawV = out?.kpi != null ? String(out.kpi) : null;
    return {
      intent: intent as ResolvedTurn["intent"],
      entity_names,
      entities,
      periode: okPeriod(out?.periode),
      periode_comparaison: okPeriod(out?.periode_comparaison),
      kpi: kpiRawV && kpiRawV in KPI_NOM_FR ? (kpiRawV as KpiKey) : null,
      suite: Boolean(out?.suite),
      changements: Array.isArray(out?.changements) ? out.changements.map(String).slice(0, 6) : [],
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
  };
}
