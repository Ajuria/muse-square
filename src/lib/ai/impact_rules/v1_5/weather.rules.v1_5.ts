// src/lib/ai/impact_rules/v1_5/weather.rules.v1_5.ts
//
// TRUTH SOURCE (verbatim rules as provided).
// NOTE: This file is the RULE layer (deterministic guardrails).
// It is NOT the “asset” layer for narration. No rules are removed here.

import type { ImpactRuleAssetV1_5 } from "./impact_rule_asset.v1_5";

export const WEATHER_RULES_V1_5: ImpactRuleAssetV1_5[] = [
  // Regime 1 — Normal weather (behavioral effects)
  {
    id: "W1",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF the event is within the final decision window",
    then: "THEN freeze no irreversible operational commitments before day-of confirmation.",
  },
  {
    id: "W2",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF adverse weather is forecast before the event",
    then:
      "THEN assume attendance decisions will already be impacted and adjust expectations before on-site observation.",
  },
  {
    id: "W3",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF the audience includes a significant non-local share",
    then: "THEN do not assume weather-driven cancellations will mirror local behavior.",
  },
  {
    id: "W4",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF the event is indoor and weather is degraded but not extreme",
    then:
      "THEN do not assume increased attendance and do not pre-scale resources without on-site confirmation.",
  },
  {
    id: "W5",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF the event is outdoor and weather is degraded but not extreme",
    then:
      "THEN treat attendance as uncertain and keep staffing, access, and supplier commitments adjustable.",
  },
  {
    id: "W6",
    dimension: "weather",
    regime: "Regime 1 — Normal weather (behavioral effects)",
    if: "IF weather conditions evolve during the day",
    then: "THEN update operational decisions based on observed arrivals, not on initial forecasts.",
  },

  // Regime 2 — Extreme weather (safety constraints)
  {
    id: "W7",
    dimension: "weather",
    regime: "Regime 2 — Extreme weather (safety constraints)",
    if: "IF weather conditions trigger safety protocols",
    then: "THEN attendance, revenue, and demand considerations are overridden.",
  },
  {
    id: "W8",
    dimension: "weather",
    regime: "Regime 2 — Extreme weather (safety constraints)",
    if: "IF the event involves high crowd density and limited mobility under extreme heat",
    then: "THEN activate safety mode regardless of ticket sales or artist schedules.",
  },
  {
    id: "W9",
    dimension: "weather",
    regime: "Regime 2 — Extreme weather (safety constraints)",
    if: "IF severe weather risk is identified",
    then:
      "THEN the organizer is responsible for pause, delay, or cancellation decisions independent of visitor intent.",
  },
  {
    id: "W10",
    dimension: "weather",
    regime: "Regime 2 — Extreme weather (safety constraints)",
    if: "IF forecasts indicate extreme weather risk",
    then: "THEN prepare for interruption or cancellation before gates open.",
  },
  {
    id: "W11",
    dimension: "weather",
    regime: "Regime 2 — Extreme weather (safety constraints)",
    if: "IF artists or on-stage teams identify crowd safety issues linked to weather",
    then:
      "THEN their intervention is treated as a valid safety signal and escalated immediately.",
  },

  // Regime 3 — Crowd physics (cross-cutting)
  {
    id: "W12",
    dimension: "weather",
    regime: "Regime 3 — Crowd physics (cross-cutting)",
    if: "IF crowd density increases while mobility decreases",
    then: "THEN weather risk escalates regardless of venue type.",
  },
  {
    id: "W13",
    dimension: "weather",
    regime: "Regime 3 — Crowd physics (cross-cutting)",
    if: "IF safety mode is active",
    then: "THEN no “indoor vs outdoor” or “demand reallocation” logic applies.",
  },
];

export const WEATHER_RULES_BY_ID_V1_5: Record<string, ImpactRuleAssetV1_5> =
  Object.fromEntries(WEATHER_RULES_V1_5.map((r) => [r.id, r]));
