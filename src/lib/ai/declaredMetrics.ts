// src/lib/ai/declaredMetrics.ts
// =====================================================
// DECLARED-METRICS registry (generalization of the margin loop, 16/07).
// One entry per metric a user can truthfully declare as a single number in chat:
//   declare («ma marge moyenne est de 62 %») → store (corrections log, assert/supersede/clear,
//   declarant from the Destinataires roster) → answer (deterministic estimate over measured CA,
//   attributed «déclarée par X le JJ/MM/AAAA», labelled estimation — no LLM, no validator surface).
//
// Adding a metric = ONE entry here + its French in contextCopy + the memory-panel label
// (ie-prompt MEMORY_LABELS) + the endpoint clear whitelist (api/insight/corrections VALID_TYPES).
// The dbt side is automatic: int_location_declared_metrics_current passes any `declared_%` through.
//
// PARSER DISCIPLINE (the hard part): declarations only, high precision.
//   - interrogatives never parse («combien de clients ai-je ?» is a question, not a declaration);
//   - each parser requires its QUALIFIER shape so incidental numbers never become data
//     («j'ai 3 clients mécontents», «30 clients par jour» must NOT declare a client base);
//   - bounds reject nonsense; the elicit copy TEACHES the exact accepted phrasing.
// Inputs are the normalized question (norm(): lowercase, accents stripped, whitespace collapsed).
// =====================================================

import type { CorrectionType } from "./corrections";
import type { ParameterKey } from "../kpi/declaredParameters";

export interface DeclaredMetricSpec {
  /** correction_type in the corrections log (must start with "declared_" — dbt contract) ; null quand
   *  la déclaration vit AILLEURS que dans le journal des corrections (store ci-dessous). */
  correction_type: CorrectionType | null;
  /** detectMissingDimension key whose answer this metric unlocks ; null = déclaration seule. */
  missing_dim: "marge" | "par_client" | null;
  /** 11/09 — un paramètre à DATE D'EFFET (docs/catalogue-de-couts-et-marge.md M5, espace-et-pole.md E4) s'écrit
   *  dans analytics.declared_parameters (lib/kpi/declaredParameters.ts), jamais dans le journal des
   *  corrections : dbt le lit par jour de vente (vw_insight_event_declared_parameters). */
  store?: "declared_parameters";
  param_key?: ParameterKey;
  /** Parse a DECLARATION from the normalized question; null = not a declaration of this metric. */
  parseDeclaration(qn: string): number | null;
  /** Bare stored value ("62") → display form ("62 %"). */
  formatValue(raw: string): string;
  /** French label for the capture confirmation («Marge notée : 62 %»). */
  label_fr: string;
}

const INTERROGATIVE = /\b(quelle?|quelles?|quels?|combien|comment|pourquoi|est[- ]ce)\b/;

// Remove interrogative CLAUSES from a mixed message so a declaration sharing it survives
// (« j'ai environ 300 clients réguliers : quel est mon CA par client ? » — owner bug 17/07: the
// message-level guard killed the whole turn, so the natural declare-and-ask form neither captured
// nor answered). A question clause = interrogative word … up to its « ? » (or a clause boundary).
function stripQuestionClauses(qn: string): string {
  return qn
    .replace(/\b(est[- ]ce(?: que?)?|quelle?s?|quels?|combien|comment|pourquoi)\b[^?!.;]*\??/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const DECLARED_METRICS: DeclaredMetricSpec[] = [
  {
    // «ma marge moyenne est de 62 %» / «je marge à 60 %» — behavior identical to the item-4 build.
    correction_type: "declared_margin_pct",
    missing_dim: "marge",
    label_fr: "Marge",
    formatValue: (raw) => `${String(raw).replace(".", ",")} %`,
    parseDeclaration(qn: string): number | null {
      // Interrogative guarding lives in parseAnyDeclaration (clause-aware) — parsers stay pure.
      const m =
        qn.match(/\b(?:ma|notre) marge(?: brute| nette| moyenne| globale)?(?: est| serait| tourne| se situe)?(?: de| d environ| d'environ| a| autour de| :)?\s*(?:de\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*%/) ||
        qn.match(/\bje marge (?:a |de |d environ |d'environ )?\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/) ||
        qn.match(/\bmarge moyenne\s*(?::|de|est de)\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
      if (!m) return null;
      const pct = Number(m[1].replace(",", "."));
      return Number.isFinite(pct) && pct >= 1 && pct <= 95 ? pct : null;
    },
  },
  {
    // «j'ai environ 300 clients» / «j'ai 300 clients réguliers» / «ma clientèle compte environ 300 clients».
    // A QUALIFIER is required (environ / à peu près / autour de / au total / en tout / réguliers / fidèles):
    // a bare count next to «clients» is too often incidental («j'ai 3 clients mécontents»). Frequency
    // forms («30 clients par jour») are a FLOW, not the base — excluded.
    correction_type: "declared_client_count",
    missing_dim: "par_client",
    label_fr: "Clientèle",
    formatValue: (raw) => `${Number(raw).toLocaleString("fr-FR")} clients`,
    parseDeclaration(qn: string): number | null {
      if (/\bclients?\s+par\s+(jour|semaine|mois|an)\b/.test(qn)) return null;
      // « j'ai » survives norm() with its apostrophe (ASCII or typographic) — accept both plus the bare form.
      const m =
        qn.match(/\bj[’' ]?ai (?:environ |a peu pres |autour de |au total |en tout )(\d{1,6})\s*clients?\b/) ||
        qn.match(/\bj[’' ]?ai (\d{1,6})\s*clients? (?:reguliers|fideles)\b/) ||
        qn.match(/\b(?:ma|notre) clientele (?:est de |compte |fait )(?:environ |a peu pres |autour de )?(\d{1,6})\s*clients?\b/);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) && n >= 1 && n <= 1_000_000 ? n : null;
    },
  },
  {
    // « ma surface de vente est de 120 m² » / « mon magasin fait 85 m2 » — 11/09 (docs/espace-et-pole.md E4) :
    // la surface de vente du site (le chiffre du bail), déclarée une fois, à date d'effet = aujourd'hui.
    // Écrite dans analytics.declared_parameters (sales_area_m2), le même magasin que le geste Piloter.
    // Un QUALIFICATIF d'espace est exigé (surface, magasin, boutique, local) avec l'unité m² : « 120 m² de
    // linéaire » ou « une réserve de 30 m² » ne déclarent rien.
    correction_type: null,
    missing_dim: null,
    store: "declared_parameters",
    param_key: "sales_area_m2",
    label_fr: "Surface de vente",
    formatValue: (raw) => `${String(raw).replace(".", ",")} m²`,
    parseDeclaration(qn: string): number | null {
      if (/\b(lineaire|reserve|terrasse|entrepot|stock)\b/.test(qn)) return null;
      const m =
        qn.match(/\b(?:ma |notre |la )?surface(?: de vente| du magasin| de la boutique| commerciale)?(?: est| fait| mesure)?(?: de| d environ| d'environ| :)?(?: environ| a peu pres| autour de)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m2|m²|metres? carres?)(?![a-z])/) ||
        qn.match(/\b(?:mon magasin|ma boutique|mon local|mon espace de vente|mon point de vente)(?: fait| mesure)(?: environ| a peu pres)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:m2|m²|metres? carres?)(?![a-z])/);
      if (!m) return null;
      const n = Number(m[1].replace(",", "."));
      return Number.isFinite(n) && n >= 1 && n <= 100_000 ? n : null;
    },
  },
];

/** First metric whose parser matches, with the parsed value. Clause-aware interrogative guarding:
 *  a pure declaration parses whole; a MIXED message (« j'ai 300 clients réguliers : quel est mon CA
 *  par client ? ») parses only its non-question remainder and flags `with_question` so the caller
 *  captures AND continues to answer; a declaration embedded IN the question itself (« est-ce que ma
 *  marge est de 62 % ? ») never captures — the remainder is empty once the question clause is gone. */
export function parseAnyDeclaration(
  qn: string,
): { spec: DeclaredMetricSpec; value: number; with_question: boolean } | null {
  const tryParse = (s: string) => {
    for (const spec of DECLARED_METRICS) {
      const value = spec.parseDeclaration(s);
      if (value != null) return { spec, value };
    }
    return null;
  };
  const hasQuestion = INTERROGATIVE.test(qn) || qn.includes("?");
  if (!hasQuestion) {
    const hit = tryParse(qn);
    return hit ? { ...hit, with_question: false } : null;
  }
  const remainder = stripQuestionClauses(qn);
  if (!remainder || INTERROGATIVE.test(remainder)) return null;
  const hit = tryParse(remainder);
  return hit ? { ...hit, with_question: true } : null;
}

/** Spec that answers a given missing dimension, if any. */
export function metricForMissingDim(dim: string): DeclaredMetricSpec | null {
  return DECLARED_METRICS.find((s) => s.missing_dim === dim) ?? null;
}
