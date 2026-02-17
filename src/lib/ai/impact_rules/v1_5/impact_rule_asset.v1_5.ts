export type ImpactRuleDimension =
  | "weather"
  | "competitive_proximity"
  | "seasonality_and_calendar";

export type ImpactRuleAssetV1_5 = {
  id: string;            // stable rule id (e.g., "W7", "C12", "G1")
  dimension: ImpactRuleDimension;
  regime: string;        // verbatim regime label
  if: string;            // verbatim IF line(s)
  then: string;          // verbatim THEN line(s)
};
