// src/lib/ai/contracts/facts_v1.ts
// =====================================================
// V1 Contracts — Facts / Coverage / IR Line Items / Render Lines
// =====================================================
// Purpose:
// - Deterministic engines emit ONLY structured IR (facts + coverage + line_items).
// - One shared renderer converts line_items -> render_lines (French text).
// - Enforcements can guarantee: no sentence without fact_id, no unknown fact_id, etc.
//
// NOTE: Keep these contracts small and stable (V0-safe). Expand only when needed.

export type DimensionV1 =
  | "meta"
  | "governance"
  | "competition"
  | "weather"
  | "calendar"
  | "envelope_7d";

export type CoverageStatusV1 = "full" | "partial" | "none";

export type CoverageItemV1 = {
  dimension: DimensionV1;

  // full = required fields present AND evidence completeness is true (where applicable)
  // partial = missing fields OR evidence incomplete
  // none = dimension unavailable (all required fields null/absent)
  status: CoverageStatusV1;

  present_fields: string[];
  missing_fields: string[];

  // Optional UI hint (e.g. "Fenêtre 7 jours indisponible")
  note_fr?: string;
};

export type CoverageBlockV1 = {
  v: 1;
  by_dimension: CoverageItemV1[];
};

export type FactV1 = {
  fact_id: string; // stable ID: e.g., "F.competition.count_10km.2026-06-01"
  date: string; // YYYY-MM-DD (best effort; derived from row.date)
  dimension: DimensionV1;

  // A truth-based factual statement. Renderer MAY use this as fallback,
  // but should prefer strict templating from metric/value params when available.
  label_fr: string;

  // Exact keys in the semantic surface row used to build this fact
  source_fields: string[];
};

export type ImpactBucketV1 = "watchout" | "neutral" | "unknown";

export type LineKindV1 = "headline" | "fact" | "implication" | "caveat";

// Template IDs are the renderer contract.
// Engines select template_id + fact_ids (+ params).
// Renderer owns French phrasing and guardrails.


export type TemplateIdV1 =
  | "HEADLINE_COMPARE"
  | "HEADLINE_DAY_WHY"
  | "TIE_EQUIVALENT_DATES"
  | "WINNER_VERDICT"
  | "WINNER_PRIMARY_DRIVER"
  | "WINNER_WEATHER_ALERT"
  | "WINNER_COMPETITION_LOCAL_REGIONAL"
  | "WORST_VERDICT"
  | "WORST_PRIMARY_DRIVER"
  | "WORST_WEATHER_ALERT"
  | "WORST_COMPETITION_LOCAL_REGIONAL"
  | "EVIDENCE_INCOMPLETE"
  | "ALTERNATIVE_SUMMARY"
  | "NEEDS_MORE_DATES"
  | "ENVELOPE_7D_UNAVAILABLE"
  | "LOOKUP_EVENT_FOUND"
  | "LOOKUP_EVENT_NOT_FOUND";

export type LineItemV1 = {
  kind: LineKindV1;
  template_id: TemplateIdV1;

  // MUST be non-empty (enforced).
  // All ids must exist in the provided facts set (enforced).
  fact_ids: string[];

  // Small typed params (keep minimal and stable).
  // Example: { date, local_radius_km: 10, regional_radius_km: 50 }
  params?: Record<string, any>;
};

export type RenderLineV1 = {
  kind: LineKindV1;

  // Final French text (owned by renderer, deterministic templates or Claude later).
  text_fr: string;

  // Fact anchors (copied from LineItemV1); MUST be non-empty.
  fact_ids: string[];
};
