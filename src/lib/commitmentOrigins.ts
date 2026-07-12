// Single source of truth for which action-card types may SEED a commitment.
//
// DELIBERATELY NOT V1_ALERT_ACTION_TYPES (the internal-alert rail's 5 cards).
// A commitment can be seeded from any real action card (design constraint §4:
// v1 origin = action cards, broadly). This set must be the action-card SPECS
// universe, not the alert subset.
//
// AUTHORITATIVE LIST = the SPECS/ACTION_CARDS keys in public/action-cards.js.
// Complete this set from those keys before the endpoint accepts non-sales cards.
// Seeded below ONLY with action_types verified present in the repo; the
// opportunity / threat / weather / tourism / footfall families still need adding
// (copy the exact strings from the SPECS registry — never hand-type from memory).
export const COMMITMENT_ORIGIN_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  // Sales / performance — verified in src/lib/internalAlertCards.ts
  "sales_surge",
  "sales_revenue_down_wow",
  "sales_traffic_not_converting",
  "sales_discount_no_lift",
  "footfall_vs_basket_decomposition",

  // Weather — verified present in public/action-cards.js SPECS (the four types that route to
  // the weather deep page / drill-down in insight.astro `_isWeather`).
  "weather_hazard_onset",
  "weather_worsened",
  "weather_improved",
  "extended_bad_weather_3d",

  // Events / calendar — verified present in public/action-cards.js SPECS (the types that route to
  // the events deep page / "Paysage événementiel" in insight.astro `_isEvent`).
  "commercial_event_match",
  "mega_event_activation",
  "mega_event_end",

  // Competitor / tarifs — verified present in public/action-cards.js SPECS (types that route to the
  // competitor deep page / "Concurrence" in insight.astro `_isCompetitor`).
  "competition_proximity",
  "high_competition_density",
  "competitor_threat_direct",
  "competition_pressure_spike",
  "same_bucket_saturation",
  "competitor_price_drop",
  "competitor_price_increase",
  "competitor_new_offering",
  "competitor_offering_removed",

  // Tourism — verified present in public/action-cards.js SPECS (types routing to "Tourisme" in `_isTourism`).
  "tourist_high_season",
  "tourist_surge_vacation",
  "tourism_peak_window",
  "tourism_weather_vacation",
  "tourism_comp_squeeze",
  "low_tourism_local_opp",
  "foreign_tourism_signal",

  // footfall family (→ renderFootfall, the venue's own hourly/weekly CA clock).
  // footfall_vs_basket_decomposition is a PERFORMANCE/sales card (→ renderSales), listed above.
  "best_day_of_week",
  "ft_peak_bad_weather",
  "ft_quiet_good_weather",
  "ft_peak_saturated",
  "ft_peak_low_comp",
  "ft_peak_tourism_vacation",
  "ft_peak_mobility",

  // TODO(complete from public/action-cards.js SPECS keys): opportunity/threat families
  // (verify each string against the registry).
]);

export function isCommitmentOrigin(actionType: unknown): boolean {
  return COMMITMENT_ORIGIN_ACTION_TYPES.has(String(actionType ?? "").trim());
}
