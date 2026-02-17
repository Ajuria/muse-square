import type {
  ImpactNarrationV1,
  ImpactNarrationMasterV1,
} from "./impact_narration_v1";

// Derive routing-tag unions from the source-of-truth shape (no named exports needed).
type ImpactLevel = ImpactNarrationV1["impact_level"];
type RiskLevel = ImpactNarrationV1["risk_level"];
type ConfidenceLevel = ImpactNarrationV1["confidence"];


export type ImpactLevelFr = "structurant" | "secondaire";
export type RiskLevelFr = "faible" | "moyen" | "élevé";
export type ConfidenceLevelFr = "faible" | "moyenne" | "élevée";

export type ImpactNarrationV1Fr = Omit<
  ImpactNarrationV1,
  "impact_level" | "risk_level" | "confidence"
> & {
  impact_level: ImpactLevelFr;
  risk_level: RiskLevelFr;
  confidence: ConfidenceLevelFr;
};

export type ImpactNarrationMasterV1Fr = Omit<
  ImpactNarrationMasterV1,
  "narrations"
> & {
  narrations: ImpactNarrationV1Fr[];
};

const IMPACT_LEVEL_FR: Record<ImpactLevel, ImpactLevelFr> = {
  structuring: "structurant",
  secondary: "secondaire",
};

const RISK_LEVEL_FR: Record<RiskLevel, RiskLevelFr> = {
  low: "faible",
  medium: "moyen",
  high: "élevé",
};

const CONFIDENCE_FR: Record<ConfidenceLevel, ConfidenceLevelFr> = {
  low: "faible",
  medium: "moyenne",
  high: "élevée",
};

export function toImpactNarrationV1Fr(n: ImpactNarrationV1): ImpactNarrationV1Fr {
  return {
    ...n,
    impact_level: IMPACT_LEVEL_FR[n.impact_level],
    risk_level: RISK_LEVEL_FR[n.risk_level],
    confidence: CONFIDENCE_FR[n.confidence],
  };
}

export function toImpactNarrationMasterV1Fr(m: ImpactNarrationMasterV1): ImpactNarrationMasterV1Fr {
  return {
    ...m,
    narrations: m.narrations.map(toImpactNarrationV1Fr),
  };
}
