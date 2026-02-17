// src/lib/ai/impact_narrations/impact_mappings_v1.ts
//
// Deterministic mappings from DecisionSignalsV1 -> FiredBlock references.
// IMPORTANT: No natural-language claims here.
// IMPORTANT: No heuristics for tags — tags come from impact_assertion_asset.v1.ts.

import type { DecisionSignalsV1 } from "../decision/decision_signals.v1";
import type {
  FiredBlock,
  ImpactDimensionMappingV1,
  TriggerContext,
  ImpactLevelTag,
  RiskLevelTag,
  ConfidenceTag,
} from "./impact_mapping_contract_v1";

import {
  IMPACT_ASSERTION_ASSETS_V1,
  type ImpactAssertionAssetV1,
  type ImpactLevel as ImpactLevelFr,
  type RiskLevel as RiskLevelFr,
  type Confidence as ConfidenceFr,
} from "./impact_assertion_asset.v1";

// ----------------------------
// Assertion index (truth)
// ----------------------------

const ASSERTION_BY_ID: Record<string, ImpactAssertionAssetV1> = Object.fromEntries(
  IMPACT_ASSERTION_ASSETS_V1.map((a) => [a.id, a])
);

function mustGetAssertion(id: string): ImpactAssertionAssetV1 {
  const a = ASSERTION_BY_ID[id];
  if (!a) {
    // Hard fail: mapping must never reference non-existent truth assets.
    throw new Error(`[impact_mappings_v1] Unknown impact assertion id: ${id}`);
  }
  return a;
}

// ----------------------------
// Tag conversion (FR assets -> EN narration tags)
// ----------------------------

const IMPACT_LEVEL_TO_EN: Record<ImpactLevelFr, ImpactLevelTag> = {
  structurant: "structuring",
  secondaire: "secondary",
};

const RISK_TO_EN: Record<RiskLevelFr, RiskLevelTag> = {
  faible: "low",
  moyen: "medium",
  élevé: "high",
};

const CONF_TO_EN: Record<ConfidenceFr, ConfidenceTag> = {
  faible: "low",
  moyenne: "medium",
  élevée: "high",
};

function tagsFromAssertionId(assertionId: string): {
  impact_level: ImpactLevelTag;
  risk_level: RiskLevelTag;
  confidence: ConfidenceTag;
} {
  const a = mustGetAssertion(assertionId);
  return {
    impact_level: IMPACT_LEVEL_TO_EN[a.impact_level],
    risk_level: RISK_TO_EN[a.risk_level],
    confidence: CONF_TO_EN[a.confidence],
  };
}

// ----------------------------
// Helpers
// ----------------------------

function ruleIdsFromSignal(sig: { rule_ids?: string[] } | undefined): string[] {
  return Array.isArray(sig?.rule_ids) ? sig!.rule_ids! : [];
}

function hasRule(rule_ids: string[], id: string): boolean {
  return rule_ids.includes(id);
}

// ----------------------------
// WEATHER
// ----------------------------

export const WEATHER_MAPPING_V1: ImpactDimensionMappingV1<DecisionSignalsV1> = {
  dimension: "weather",
  evaluate: (ctx: TriggerContext<DecisionSignalsV1>): FiredBlock[] => {
    const fired: FiredBlock[] = [];
    const rule_ids = ruleIdsFromSignal(ctx.signals.weather);

    // Assetified weather assertions (truth ids): W2, W3, W5
    if (hasRule(rule_ids, "W2")) {
      const impact_assertion_id = "W2";
      fired.push({
        dimension: "weather",
        ...tagsFromAssertionId(impact_assertion_id),
        impact_assertion_id,
        consequence_assertion_ids: [],
        guardrail_assertion_ids: [],
        rule_ids: ["W2"],
        trigger_id: "WEATHER.W2",
      });
    }

    if (hasRule(rule_ids, "W3")) {
      const impact_assertion_id = "W3";
      fired.push({
        dimension: "weather",
        ...tagsFromAssertionId(impact_assertion_id),
        impact_assertion_id,
        consequence_assertion_ids: [],
        guardrail_assertion_ids: [],
        rule_ids: ["W3"],
        trigger_id: "WEATHER.W3",
      });
    }

    if (hasRule(rule_ids, "W5")) {
      const impact_assertion_id = "W5";
      fired.push({
        dimension: "weather",
        ...tagsFromAssertionId(impact_assertion_id),
        impact_assertion_id,
        consequence_assertion_ids: [],
        guardrail_assertion_ids: [],
        rule_ids: ["W5"],
        trigger_id: "WEATHER.W5",
      });
    }

    return fired;
  },
};

// ----------------------------
// CALENDAR / SEASONALITY
// ----------------------------

const CAL_ASSET_RULES = [
  "G3",
  "F1",
  "F2_NOEL",
  "F2_HORS_NOEL",
  "T1",
  "T2",
  "L1",
  "L2",
  "S1",
  "C1",
  "C2",
  "C3",
  "C4",
  "X2",
] as const;

type CalRuleId = (typeof CAL_ASSET_RULES)[number];

function calAssertionId(ruleId: CalRuleId): string {
  return `CAL_${ruleId}`;
}

export const CALENDAR_MAPPING_V1: ImpactDimensionMappingV1<DecisionSignalsV1> = {
  dimension: "seasonality_and_calendar",
  evaluate: (ctx: TriggerContext<DecisionSignalsV1>): FiredBlock[] => {
    const fired: FiredBlock[] = [];
    const rule_ids = ruleIdsFromSignal(ctx.signals.calendar);

    for (const rid of CAL_ASSET_RULES) {
      if (!hasRule(rule_ids, rid)) continue;

      const impact_assertion_id = calAssertionId(rid);

      fired.push({
        dimension: "seasonality_and_calendar",
        ...tagsFromAssertionId(impact_assertion_id),
        impact_assertion_id,
        consequence_assertion_ids: [],
        guardrail_assertion_ids: [],
        rule_ids: [rid],
        trigger_id: `CALENDAR.${rid}`,
      });
    }

    return fired;
  },
};

// ----------------------------
// COMPETITION / PROXIMITY
// ----------------------------

const CP_ASSET_RULES = ["C1", "C3", "C4", "C8", "C10", "C11", "C13", "C14"] as const;
type CpRuleId = (typeof CP_ASSET_RULES)[number];

function cpAssertionId(ruleId: CpRuleId): string {
  return `CP_${ruleId}`;
}

export const COMPETITION_MAPPING_V1: ImpactDimensionMappingV1<DecisionSignalsV1> = {
  dimension: "competitive_proximity",
  evaluate: (ctx: TriggerContext<DecisionSignalsV1>): FiredBlock[] => {
    const fired: FiredBlock[] = [];
    const rule_ids = ruleIdsFromSignal(ctx.signals.competition);

    for (const rid of CP_ASSET_RULES) {
      if (!hasRule(rule_ids, rid)) continue;

      const impact_assertion_id = cpAssertionId(rid);

      fired.push({
        dimension: "competitive_proximity",
        ...tagsFromAssertionId(impact_assertion_id),
        impact_assertion_id,
        consequence_assertion_ids: [],
        guardrail_assertion_ids: [],
        rule_ids: [rid],
        trigger_id: `COMPETITION.${rid}`,
      });
    }

    return fired;
  },
};

export const IMPACT_MAPPINGS_V1 = [
  WEATHER_MAPPING_V1,
  CALENDAR_MAPPING_V1,
  COMPETITION_MAPPING_V1,
] as const;
