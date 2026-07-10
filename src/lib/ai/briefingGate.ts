// The Point du jour material-signal gate — pure + dep-free so it's unit-testable in isolation.
// No email on a genuinely quiet day. v1 tunable definition of "material":
//   acute weather (alert_level >= 2 or a weather_alert), a commercial moment, a competitor change,
//   a >= 0.3 score move, or a saved-event milestone (J-7 / J-3 / J-0).
// NOT "a card exists" — action cards fire almost everywhere, so they don't gate.

export interface BriefingGateInput {
  dc: {
    day_surface?: { opportunity?: { alert_level_max?: number | null } | null } | null;
    weather_alert?: unknown;                 // present (truthy) only when the brain flagged an acute alert
    commercial_events?: unknown[];
  };
  competitorChanges: unknown[];              // fired change-feed signals about competitors
  scoreDelta: number | null;                 // today vs yesterday opportunity score
  savedEvents: { days_until: number }[];
}

export function isMaterialBriefing(a: BriefingGateInput): boolean {
  const alertLevel = Number(a.dc.day_surface?.opportunity?.alert_level_max ?? 0);
  const hasWeatherAlert = alertLevel >= 2 || !!a.dc.weather_alert;
  const hasCommercialEvent = (a.dc.commercial_events?.length ?? 0) > 0;
  const hasCompetitorChange = a.competitorChanges.length > 0;
  const hasScoreChange = a.scoreDelta != null && Math.abs(a.scoreDelta) >= 0.3;
  const hasEventMilestone = a.savedEvents.some((e) => [0, 3, 7].includes(e.days_until));
  return hasWeatherAlert || hasCommercialEvent || hasCompetitorChange || hasScoreChange || hasEventMilestone;
}
