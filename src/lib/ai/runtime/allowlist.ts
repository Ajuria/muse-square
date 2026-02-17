export const ALLOWED_INPUT_FIELDS: string[] = [
  // User hint (NOT a semantic fact, NOT authoritative)
  "user_question",
  
  // Contract / Scope
  "semantic_contract_version",
  "display_horizon",

  // Verdict & framing
  "display_label",
  "opportunity_medal",
  "opportunity_score_final_local",
  "opportunity_regime",

  // Drivers & confidence
  "primary_score_driver_label_fr",
  "primary_driver_confidence_fr",

  // Signals & constraints
  "daily_signal_summary_fr",
  "evidence_completeness_flag",
  "competition_presence_flag",

  // Competition (facts only)
  "events_within_500m_count",
  "events_within_5km_count",
  "events_within_10km_count",
  "events_within_50km_count",
  "top_competitors",

  // Weather (facts only)
  "alert_level_max",
  "weather_label_fr",
  "temperature_2m_min",
  "temperature_2m_max",
  "precipitation_probability_max_pct",
  "wind_speed_10m_max",
  "snowfall_sum",

  // Context
  "date",
  "weekday_weekend_label",
  "holiday_name",
  "vacation_name",
  "commercial_events",

  // 30D Window
  "key_takeaway",
  "location_id",
  "window_start_date",
  "window_end_date",
  "top_days",
  "days_count",
  "days_a",
  "days_b",
  "days_c",
  "days_risk",
  "days_top_bucket",
  "score_min",
  "score_max",
  "days_missing_weather",

  // AI location context
  "company_activity_type",
  "location_type",
  "event_time_profile",
  "primary_audience_1",
  "primary_audience_2",
  "capacity_sensitivity",
  "geographic_catchment",
  "company_industry",
  "business_short_description",
  "city_name",
  "region_name",
  "nearest_transit_stop_name",
  "nearest_transit_stop_distance_m",

  // ---- V3 month payload keys (what you currently pass in llmPayload) ----
  "meta",
  "intent",
  "horizon",
  "used_dates",
  "decision_payload",
  "window_aggregates_v3",
  "top_dates",
  "decision_policy_rules",

  // ---- Field aliases used by vw_insight_event_30d_day_surface today ----
  "weather_alert_level",
  "precip_probability_max_pct",

  // ---- Calendar flags used today ----
  "is_weekend",
  "is_public_holiday_fr_flag",
  "is_school_holiday_flag",
  "is_commercial_event_flag",
  "commercial_events",

  // ---- Competition counts used today ----
  "events_within_5km_count",
  "events_within_10km_count",
  "events_within_50km_count",

  // Scope lock
  "ai_analysis_scope_guard",
];

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function jsonable(v: any): any {
  // Date -> ISO
  if (v instanceof Date) return v.toISOString();

  // Arrays
  if (Array.isArray(v)) return v.map(jsonable);

  // Objects
  if (isObject(v)) {
    const out: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) out[String(k)] = jsonable(val);
    return out;
  }

  // Primitive (or null/undefined)
  if (v === undefined) return null;
  return v;
}

export function pickAllowedPayload(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of ALLOWED_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(row, k)) {
      out[k] = jsonable(row[k]);
    }
  }
  return out;
}
