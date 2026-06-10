// Canonical theme → action_type vocabulary for server-side recommendation
// filtering. MUST stay in parity with window.RECO_TAXONOMY in
// public/action-cards.js (buckets[].themes[].action_types).
// Client owns labels/buckets/hues for /profile toggle rendering; this module
// owns only the action_type membership used to suppress disabled themes.
//
// PARITY DEBT: the same vocabulary is declared client-side in action-cards.js.
// Keep both in sync until that global script can import this module.
//
// NOTE: action_types `competitor_event_ending` and `review_solicitation` exist
// at runtime but are absent from every theme — ungoverned (always pass) pending
// a decision on where they belong. To govern them, add to BOTH this map and
// the client RECO_TAXONOMY.

export const RECO_THEME_ACTION_TYPES: Record<string, string[]> = {
  meteo: [
    "regime_c_warning", "extended_bad_weather", "weather_hazard_onset",
    "weather_worsened", "saturated_bad_weather", "extended_bad_weather_3d",
    "weather_mobility_double", "ft_peak_bad_weather",
  ],
  mobilite: [
    "mobility_disruption", "mobility_disruption_planned",
    "mobility_disruption_resolved", "tourism_mobility_hit",
    "mobility_comp_squeeze", "ft_peak_mobility",
  ],
  fenetres: [
    "weather_window", "weather_improved", "weather_window_after_bad",
    "low_competition_window", "weekend_opportunity", "perfect_storm",
    "weather_comp_opportunity", "day_opportunity", "best_day_of_week",
    "top_day_approaching", "weekend_vacation_low_comp", "ft_quiet_good_weather",
    "ft_peak_low_comp",
  ],
  calendrier: [
    "audience_shift_opportunity", "calendar_audience_shift",
    "commercial_event_match", "holiday_high_comp", "mega_event_activation",
    "mega_event_end", "institution_campaign_detected", "media_mention_detected",
    "ft_peak_tourism_vacation",
  ],
  tourisme: [
    "tourist_high_season", "tourist_surge_vacation", "tourism_peak_window",
    "tourism_weather_vacation", "tourism_comp_squeeze", "low_tourism_local_opp",
  ],
  concurrence: [
    "high_competition_density", "competition_proximity",
    "competition_pressure_spike", "competitor_threat_direct",
    "competitor_event_launch", "competitor_audience_conflict",
    "competitor_hours_change", "competitor_sold_out", "competitor_content_spike",
    "competitor_content_silent", "same_bucket_saturation", "ft_peak_saturated",
  ],
  tarifs: [
    "competitor_new_offering", "competitor_price_increase",
    "competitor_price_drop", "competitor_offering_removed",
    "competitor_repricing_event", "competitor_positioning_brief",
    "competitor_reputation_strength", "competitor_review_surge",
    "competitor_review_drop",
  ],
  ventes: [
    "sales_underperformance", "sales_surge", "sales_missed_opportunity",
    "sales_competition_cannibalization", "sales_traffic_not_converting",
    "sales_discount_no_lift", "sales_revenue_down_wow", "offering_mix_shift",
  ],
  apprentissage: [
    "proven_action_replication", "weekly_briefing",
  ],
};

const ACTION_TYPE_TO_THEME: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [themeId, types] of Object.entries(RECO_THEME_ACTION_TYPES))
    for (const at of types) m[at] = themeId;
  return m;
})();

// Drop candidates whose action_type belongs to a disabled theme.
// Uncovered action_types (not in any theme) always pass.
export function filterDisabledThemes<T extends { action_type?: string | null }>(
  candidates: T[],
  disabledThemes: string[] | null | undefined
): T[] {
  if (!disabledThemes || !disabledThemes.length) return candidates;
  const disabled = new Set(disabledThemes);
  return candidates.filter((c) => {
    const at = c.action_type;
    if (!at) return true;
    const theme = ACTION_TYPE_TO_THEME[at];
    return !(theme && disabled.has(theme));
  });
}