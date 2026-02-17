// src/lib/ai/impact_narrations/impact_mapping_contract_v1.ts
//
// Mapping contract between deterministic decision signals and narration blocks.
// IMPORTANT: This file must contain NO natural-language claims.
// It only routes to assertion ids + trace references.

import type { ImpactNarrationDimension } from "./impact_narration_v1";
import type { DecisionSignalsV1 } from "../decision/decision_signals.v1";

export type Horizon = "month" | "day" | "selected_days";

/**
 * Generic TriggerContext so mappings can keep strong typing without coupling.
 * If you want a default concrete type, use DecisionSignalsV1 at the call site.
 */
export type TriggerContext<TSignals = DecisionSignalsV1> = {
  horizon: Horizon;
  intent: string;
  used_dates: string[];
  signals: TSignals;
};

/**
 * These enums are routing tags for narration selection.
 * They must match ImpactNarrationV1 (EN).
 */
export type ImpactLevelTag = "structuring" | "secondary";
export type RiskLevelTag = "low" | "medium" | "high";
export type ConfidenceTag = "low" | "medium" | "high";

export type FiredBlock = {
  dimension: ImpactNarrationDimension;

  impact_level: ImpactLevelTag;
  risk_level: RiskLevelTag;
  confidence: ConfidenceTag;

  // strict references (no text here)
  impact_assertion_id: string; // e.g. "W2", "CAL_G3", "CP_C1"
  consequence_assertion_ids: string[]; // 0–3
  guardrail_assertion_ids: string[]; // 0–3
  scope_note_assertion_id?: string;

  // rule ids to attach to trace (v1.5 rules)
  rule_ids: string[];

  // deterministic trigger label for debugging (stable)
  trigger_id: string;
};

export type ImpactDimensionMappingV1<TSignals = DecisionSignalsV1> = {
  dimension: ImpactNarrationDimension;
  evaluate: (ctx: TriggerContext<TSignals>) => FiredBlock[];
};
