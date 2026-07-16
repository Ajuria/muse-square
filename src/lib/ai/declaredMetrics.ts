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

export interface DeclaredMetricSpec {
  /** correction_type in the corrections log (must start with "declared_" — dbt contract). */
  correction_type: CorrectionType;
  /** detectMissingDimension key whose answer this metric unlocks. */
  missing_dim: "marge" | "par_client";
  /** Parse a DECLARATION from the normalized question; null = not a declaration of this metric. */
  parseDeclaration(qn: string): number | null;
  /** Bare stored value ("62") → display form ("62 %"). */
  formatValue(raw: string): string;
  /** French label for the capture confirmation («Marge notée : 62 %»). */
  label_fr: string;
}

const INTERROGATIVE = /\b(quelle?|quelles?|quels?|combien|comment|pourquoi)\b/;

export const DECLARED_METRICS: DeclaredMetricSpec[] = [
  {
    // «ma marge moyenne est de 62 %» / «je marge à 60 %» — behavior identical to the item-4 build.
    correction_type: "declared_margin_pct",
    missing_dim: "marge",
    label_fr: "Marge",
    formatValue: (raw) => `${String(raw).replace(".", ",")} %`,
    parseDeclaration(qn: string): number | null {
      if (INTERROGATIVE.test(qn)) return null;
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
      if (INTERROGATIVE.test(qn)) return null;
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
];

/** First metric whose parser matches the normalized question, with the parsed value. */
export function parseAnyDeclaration(qn: string): { spec: DeclaredMetricSpec; value: number } | null {
  for (const spec of DECLARED_METRICS) {
    const value = spec.parseDeclaration(qn);
    if (value != null) return { spec, value };
  }
  return null;
}

/** Spec that answers a given missing dimension, if any. */
export function metricForMissingDim(dim: string): DeclaredMetricSpec | null {
  return DECLARED_METRICS.find((s) => s.missing_dim === dim) ?? null;
}
