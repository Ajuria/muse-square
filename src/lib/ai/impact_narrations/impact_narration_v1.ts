// src/lib/ai/impact_narrations/impact_narration_v1.ts

export type ImpactNarrationDimension =
  | "weather"
  | "competitive_proximity"
  | "seasonality_and_calendar";

export type ImpactLevel = "structuring" | "secondary";
export type RiskLevel = "low" | "medium" | "high";
export type ConfidenceLevel = "low" | "medium" | "high";

export type ImpactNarrationV1 = {
  dimension: ImpactNarrationDimension;

  impact_level: ImpactLevel;
  risk_level: RiskLevel;
  confidence: ConfidenceLevel;

  impact_statement: string;

  operational_consequences: string[]; // 1–3
  decision_guardrails: string[]; // 1–3

  scope_note?: string;
};

export type TraceSource =
  | { kind: "assertion"; id: string }
  | { kind: "rule"; id: string };

export type ImpactNarrationMasterV1 = {
  v: 1;

  used_dates: string[]; // YYYY-MM-DD
  horizon: "month" | "day" | "selected_days";
  intent: string;

  narrations: ImpactNarrationV1[];

  trace?: {
    dimension: ImpactNarrationDimension;
    sources: TraceSource[];
  }[];
};
