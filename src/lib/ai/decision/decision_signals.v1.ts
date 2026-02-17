// src/lib/ai/decision/decision_signals.v1.ts

export type DecisionSignalBase = {
  available: boolean;
  label: string;          // "Météo", "Concurrence", "Calendrier"
  rule_ids?: string[];    // e.g. ["W2","C1"]
};

export type WeatherSignalV1 = DecisionSignalBase & {
  kind: "weather";
  data: unknown; // whatever buildWeatherSignal already returns
};

export type CompetitionSignalV1 = DecisionSignalBase & {
  kind: "competition";
  data: unknown;
};

export type CalendarSignalV1 = DecisionSignalBase & {
  kind: "calendar";
  data: unknown;
};

export type DecisionSignalsV1 = Partial<{
  weather: WeatherSignalV1;
  competition: CompetitionSignalV1;
  calendar: CalendarSignalV1;
}>;
