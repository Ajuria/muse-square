// src/lib/ai/impact_narrations/evaluate_impact_blocks_v1.ts
//
// Deterministic evaluation: signals -> FiredBlocks (no narration text).

import type { DecisionSignalsV1 } from "../decision/decision_signals.v1";
import type { FiredBlock, TriggerContext } from "./impact_mapping_contract_v1";
import { WEATHER_MAPPING_V1, CALENDAR_MAPPING_V1, COMPETITION_MAPPING_V1 } from "./impact_mappings_v1";

export function evaluateImpactBlocksV1(ctx: TriggerContext<DecisionSignalsV1>): FiredBlock[] {
  return [
    ...WEATHER_MAPPING_V1.evaluate(ctx),
    ...CALENDAR_MAPPING_V1.evaluate(ctx),
    ...COMPETITION_MAPPING_V1.evaluate(ctx),
  ];
}
