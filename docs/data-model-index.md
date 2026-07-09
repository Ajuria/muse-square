# Data Model Index — Single Source of Truth (dbt + BigQuery)

> **Purpose.** Authoritative map of the data layer that feeds the app: every dbt model (what marts/views exist, their grain, lineage, output columns) plus a pointer to the live BigQuery column catalog. It exists to stop two failure modes in data work: (1) **building a mart/view that already exists**, and (2) **guessing a column/table name** instead of verifying it.
>
> **This layer has two truths — treat them differently:**
> - **Truth A — dbt models (static, versioned).** The tables below, generated from the dbt source files. Use to answer *"does a model for X exist, what grain, what feeds it."*
> - **Truth B — live BigQuery schema (dynamic).** Exact columns/types live in `INFORMATION_SCHEMA`, snapshotted to [`bq-catalog.json`](bq-catalog.json) (+ `bq-catalog.allowlist.json`). **This snapshot is a map, NOT current truth** — incremental models drop new columns without `--full-refresh`, and the BQ Node client silently returns 0 rows on DATE/STRING mismatch. **Before writing any query, re-verify the exact column live via the `bq-verify` skill / `INFORMATION_SCHEMA`.**
>
> **Rule before you build.** Grep this file (and `docs/module-index.md`) for the capability before creating a new dbt model or query. Extend the existing model; don't fork a parallel one.
>
> _Generated 2026-07-09. dbt repo: `~/Documents/ms_database/ms_dbt` @ git `5d36af2`. BQ catalog snapshot: 2026-07-09, project `muse-square-open-data` (EU), 430 tables / 7441 columns. dbt Cloud IDE edits are local until synced to GitHub — if this SHA is behind `origin`, regenerate. Regenerate by re-reading the model files + re-running the `INFORMATION_SCHEMA` pull; never guess._

## ⚠️ Live warehouse vs dbt project — they diverge

The BigQuery region holds **more tables than this dbt project defines**. Tables exist in the warehouse that aren't in `ms_dbt` (legacy, other projects like `cda_dbt`, or hand-built). Before assuming a table is dbt-managed, check it appears in the tables below — if it's only in `bq-catalog.json`, it's an **orphan** (not built by this project; touch with care).

| Dataset | Live tables | Live views | dbt models here |
|---|---|---|---|
| `semantic` | 26 | 22 | 16 |
| `mart` | 69 | 1 | 36 (2 are `test`/`test_fct`, 1 disabled) |
| `dims` | 19 | 5 | 18 |
| `intermediate` | 108 | 76 | 74 |
| `staging` | 82 | 79 | 55 |
| `raw` | 68 | 0 | (sources — ingested, not modelled here) |
| `analytics` | 22 | 0 | (app-write: logs, drafts, commitments, configs, sensitivity store) |
| `open_data` | 33 | 1 | (reference data) |

> `analytics.*` and `raw.*` are **not produced by dbt** — `raw` is ingested (Airbyte/app writes), `analytics` is written directly by the app (see `docs/module-index.md`). The dbt project reads them via `source()` and staging.

---

## Semantic layer (`semantic.vw_*`) — the app's read contract

This is what API routes query. 1 view = 1 surface contract. Full column truth in `bq-catalog.json`.

| Model | Mat. | Grain (1 row =) | Upstream refs | Key output columns |
|---|---|---|---|---|
| `vw_insight_event_30d_day_surface` | view | date × location_id | fct_location_opportunity_score_daily, fct_location_weather_forecast_daily(+_detail), fct_location_weather_alerts_daily, fct_location_events_radius_daily, fct_location_context_features_daily, fct_region_day_annotations_daily | date, location_id, opportunity_regime, opportunity_score, opportunity_medal, weather_code, weather_alert_level, precipitation_probability_max_pct, events_within_{500m,5km,10km,50km}_count |
| `vw_insight_event_30d_surface` | view | date × location_id | fct_location_context_features_daily, fct_location_weather_forecast_daily(+_detail), fct_location_weather_alerts_daily, fct_location_events_radius_daily, fct_region_day_annotations_daily | date, location_id, key_takeaway, opportunity_regime, opportunity_score_final_local, opportunity_medal, weather_code, weather_alert_level, is_public_holiday_fr_flag, is_weekend |
| `vw_insight_event_30d_window_surface` | **table** | location_id × window_start_date (end = start+29d) | vw_insight_event_30d_surface | location_id, window_start_date, window_end_date, top_days, days_count, days_{a,b,c,risk}, score_min, score_max, days_missing_weather |
| `vw_insight_event_7d_surface` | **table** | candidate_date × location_id (D-3..D+3 envelope) | fct_location_context_7d_projection, fct_region_day_annotations_daily | candidate_date, centered_date, location_id, event_opportunity_score_local_7d_avg_centered, contains_weather_risk_7d, avg_events_in_radius_10km_7d, has_tourism_signal_7d, window_stability_label |
| `vw_insight_event_ai_location_context` | view | location_id | dim_ai_context_location | location_id, company_activity_type, location_type, primary_audience_1/2, capacity_sensitivity, geographic_catchment, city_name, region_name, lat, lon, weather_sensitivity, seasonality, venue_capacity |
| `vw_insight_event_ai_region_context` | view | date × region_id | fct_region_context_daily | date, region_id, region_name, event_count_region, tourism_index_region, tourism_peak_flag_region, is_weekend_flag, is_public_holiday_flag, public_holiday_name_fr, is_school_holiday_flag, commercial_event_names_region |
| `vw_insight_event_change_feed` | view | feed_date × location_id × change_type × entity_id | fct_location_change_feed, dim_client_location | feed_date, affected_date, location_id, change_type, entity_id, old_value, new_value, score_delta, event_label, distance_m, alert_level, change_category, change_priority_sort, summary |
| `vw_insight_event_competitor_alerts` | view | competitor_alert_id | fct_competitor_alerts | competitor_alert_id, competitor_event_id, competitor_id, location_id, alert_level, change_category, affected_date, event_label, conflict_score, entity_threat_score, entity_threat_level, distance_m |
| `vw_insight_event_competitor_lookup` | view | competitor_id | fct_competitor_directory | competitor_id, competitor_name, address, city, industry_code, industry_bucket, lat, lon, google_place_id, google_rating, is_user_vetted, total_events_detected |
| `vw_insight_event_competitor_signals` | view | location_id × competitor_id × event_date × event_name | fct_competitor_events_conflicts, fct_competitor_directory, fct_competitor_threat_profile | competitor_event_id, competitor_id, location_id, competitor_name, signal_type, event_name, event_date(+_end), distance_from_location_m, conflict_score, entity_threat_score, entity_threat_level, is_active, is_upcoming |
| `vw_insight_event_day_surface` | view | date × location_id | fct_location_opportunity_score_daily, fct_location_context_features_daily, fct_region_day_annotations_daily, fct_location_events_topn_daily, fct_location_events_radius_daily, fct_location_weather_alerts_daily, fct_location_weather_forecast_daily_detail, fct_location_change_feed, fct_location_impact_daily_calendar | date, location_id, opportunity_regime, opportunity_score_final_local, opportunity_medal, events_score, mobility_score, calendar_score, weather_score, top_competitors, weather_code, weather_alert_level, change_feed |
| `vw_insight_event_map_signals` | view | date × location_id × signal_id (flattened arrays) | fct_location_events_topn_daily, fct_location_mobility_disruption_changes, fct_competitor_events_conflicts, fct_competitor_directory, dim_client_location | date, location_id, signal_id, signal_type, event_label, description, event_lat, event_lon, distance_m, mobility_signal_id, mobility_disruption_{begin,end}_ts, mobility_severity |
| `vw_insight_event_mobility_disruptions` | view | location_id × disruption_date × disruption_event_id | fct_location_mobility_disruptions__union | location_id, disruption_date, disruption_source, line_id, stop_name, disruption_{begin,end}_ts, severity, title_merged, is_active_flag, mode, disruption_category, delay_minutes |
| `vw_insight_event_selected_days_surface` | **incremental** | date × location_id | vw_insight_event_day_surface, vw_insight_event_7d_surface, fct_location_events_topn_daily | (all of day_surface) + window_centered_date_7d, opportunity_score_local_7d_avg_centered, top_events_{500m,5km,10km,50km} |
| `vw_insight_eventcalendar_event_lookup` | view | calendar span | fct_region_event_calendar_spans | calendar_item_uid, calendar_item_type, event_name, event_start_date, event_end_date, scope_type, city_id, city_name, region_id, industry_code, theme, source_system |
| `vw_ms_insight_ai_decision_policy_rules` | view | decision-policy rule | (hardcoded UNION ALL — no ref) | rule_key, rule_value, base_priority_dimensions, boost_priority_dimensions, blocker_focus, auto_constraints, rule_version |

---

## Mart layer (`mart.fct_*`) — facts

| Model | Mat. | Grain (1 row =) | Upstream refs | Key output columns |
|---|---|---|---|---|
| `agg_trends_keywords_weekly` | table | week_start × keyword_id × geo | fct_trends_keywords | week_start, keyword_id, geo, category, avg/max/min_interest_value, days_observed |
| `fct_competitor_alerts` | **incremental** (uk: competitor_alert_id) | competitor_alert_id | int_competitor_alerts | competitor_alert_id, competitor_event_id, competitor_id, location_id, alert_level, change_category, affected_date, event_label, score_delta, entity_threat_score/level |
| `fct_competitor_directory` | table | competitor_id (deduped) | int_competitor_directory, int_events_event_daily_enriched, src raw.competitor_events, src raw.watched_competitors | competitor_id, competitor_name, address, city, industry_code, industry_bucket, primary/secondary_audience, lat, lon, google_place_id, google_rating, is_followed, total_events_detected |
| `fct_competitor_events_conflicts` | table | location_id × competitor_id × event_date × event_name | int_competitor_events, fct_competitor_directory, dim_client_location, dim_ai_context_location, fct_competitor_threat_profile | competitor_event_id, competitor_id, location_id, event_name, event_date(+_end), distance_from_location_m, industry_overlap, audience_overlap(_score), conflict_score, threat_score, threat_level |
| `fct_competitor_threat_profile` | table | location_id × competitor_id | int_competitor_threat_profile | location_id, competitor_id, competitor_name, is_followed, audience_overlap_pct, industry_match_tier, seasonality_alignment, distance_km, threat_score, threat_level |
| `fct_location_attendance_effects_daily` | table | date × location_id × region_id | int_attendance_effects_daily | date, location_id, region_id, impact_weather_pct, att_delta_pct |
| `fct_location_change_feed` | table | date × location_id × change_type × entity_id | fct_location_context_features_daily, fct_location_opportunity_score_daily(+components), fct_location_events_topn_daily, fct_location_weather_alerts_daily, fct_location_context_daily, fct_location_impact_daily_calendar, fct_competitor_events_conflicts, fct_competitor_directory, fct_location_mobility_disruption_changes(+__union), dim_client_location, dim_client_transit_proximity | date, location_id, change_type, entity_id, old_value, new_value, score_delta, driver_type, driver_delta, lvl_{rain,wind,snow,heat,cold}, enriched_event_label, enriched_distance_m |
| `fct_location_context_7d_projection` | **incremental** (insert_overwrite) | candidate_date × location_id | fct_location_context_features_daily, int_holidays_fr_daily_named, int_school_vacations_region_daily_named | candidate_date, location_id, city_id, region_id, event_opportunity_score_local_7d_avg_centered, n_weather_risky_days_7d, avg/max_events_in_radius_10km_7d, public_holiday_name_7d, school_vacation_name_7d |
| `fct_location_context_daily` | table | date × location_id | fct_location_weather_alerts_daily, dim_client_location, fct_region_context_daily | date, location_id, city_id, region_{name,id,code_insee}, lvl_{wind,rain,snow,heat,cold}, impact_weather_pct, event_count_region, tourism_index_region, mobility_status_region, is_weekend/holiday/school_flag |
| `fct_location_context_features_daily` | table (**partitioned, require_partition_filter=true**) | date × location_id | fct_location_context_daily, dim_client_location, fct_location_events_radius_daily, dim_opportunity_thresholds | date, location_id, city_id, competition_index_local, comp_nearby_weighted, has_valid_baseline_flag, baseline_comp_avg, opportunity_score_final_local, opportunity_regime, opportunity_medal, best_day_rank, has_tourism_signal_region |
| `fct_location_disruptions__lines` | **incremental** (insert_overwrite) | location_id × line_id × disruption × service_date | dim_client_transit_proximity, fct_mobility_disruptions__lines, dim_idf_transportation_lines | location_id, line_id, service_date, disruption_{begin,end}_ts, severity(_rank), perturbation_lvl, title_merged, is_active_flag, nearest_transit_line_name, network_name |
| `fct_location_events_radius_daily` | table (**partitioned, RPF=true**) | date × location_id | dim_client_location, event_industry_keywords_normalization, int_events_event_daily_enriched | date, location_id, events_within_{500m,1km,5km,10km,50km}_count, events_within_{500m,5km,10km}_same_bucket_count, pct_same_bucket_5km |
| `fct_location_events_topn_daily` | **incremental** (insert_overwrite) | date × location_id | dim_client_location, int_events_event_daily_enriched, dim_client_transit_proximity, event_industry_keywords_normalization | date, location_id, client_lat/lon, nearest_transit_stop/line_name, top_events_{500m,1km,5km,10km,50km} (ARRAY<STRUCT>) |
| `fct_location_forecast_avg_weather_daily` | table (**partitioned, RPF=true**) | date × location_id | fct_location_weather_forecast_daily_detail, int_weather_history_daily | date, location_id, forecast_temperature_2m_{min,max}, forecast_precipitation_sum, forecast_wind_speed_10m_max, avg_temperature_2m_min, display_temperature_2m_{min,max}, value_type, is_avg |
| `fct_location_impact_daily_calendar` | table (**partitioned, RPF=true**) | date × location_id | dim_client_location, dim_client_company_profile, dim_calendar, dim_audience_availability, fct_region_day_annotations_daily, stg_mega_events | date, location_id, delta_att_calendar_pct, audience_availability_label, data_confidence |
| `fct_location_impact_daily_events` | table (**partitioned, RPF=true**) | date × location_id | fct_location_events_radius_daily, dim_client_location | date, location_id, delta_att_events_pct |
| `fct_location_impact_daily_mobility` | table (**partitioned, RPF=true**) | date × location_id | dim_client_location, dim_client_transit_proximity, dim_calendar, int_mobility_region_daily__aligned, fct_location_mobility_disruptions__union(+_changes), stg_mega_events, geo_commune_to_region | date, location_id, changes_from_yesterday, change_reason, delta_att_mobility_{car,subway}_pct, delta_ops_mobility_car_pct, delta_att_mobility_pct |
| `fct_location_impact_daily_weather` | table (**partitioned, RPF=true**) | date × location_id | int_client_weather_alerts_daily, dim_client_location, fct_location_weather_forecast_daily_detail, weather_impacts_coeffs | date, location_id, location_type, delta_att_weather_{rain,heat,cold,snow,wind}_pct, delta_att_weather_total_pct |
| `fct_location_mobility_disruption_changes` | table | disruption change × location × date | fct_location_mobility_disruptions__union | location_id, disruption_date, disruption_event_id, disruption_source, line_id, stop_name, severity, title_merged, is_active_flag, mode, delay_minutes, distance_meters, comparison_date, change_reason |
| `fct_location_mobility_disruptions__union` | **incremental** (insert_overwrite) | disruption event × location × date | int_traffic_incidents_geocoded, fct_location_disruptions__lines, dim_idf_stops_lines, dim_client_location | location_id, disruption_date, disruption_source, disruption_event_id, line_id, stop_name, disruption_{begin,end}_ts, severity, title_merged, is_active/planned_flag, mode, distance_meters |
| `fct_location_opportunity_components_daily` | table | date × location_id | fct_location_impact_daily_{weather,events,mobility,calendar}, fct_location_context_daily | date, location_id, horizon_bucket, delta_att_weather_{wind,rain,snow,heat,cold}_pct, delta_att_{events,mobility,calendar,total}_pct, opportunity_score, {events,mobility,calendar,weather}_score |
| `fct_location_opportunity_score_daily` | table | date × location_id | fct_location_opportunity_components_daily, fct_location_context_features_daily, dim_client_location, dim_calendar, stg_mega_events | date, location_id, location_label, opportunity_score(_raw), score_type, {events,mobility,calendar,weather}_score, opportunity_regime, opportunity_medal, is_mega_event_flag, active_mega_event_name, delta_att_total_pct |
| `fct_location_weather_alerts_5d` | table | client × 5-day window | fct_location_weather_alerts_daily, dim_client_location | window_start/end_date, client_id, region_id, has_alert, peak_date, days_until_peak, window_max_level, lvl_{wind,rain,snow,heat,cold}, impact_{wind,rain}_pct |
| `fct_location_weather_alerts_daily` | table | date × location_id | int_client_weather_alerts_daily | date, location_id, client_id, is_weather_forecast, is_seasonal_fallback, is_weather_missing, alert_source, lvl_{wind,rain,snow,heat,cold}, impact_weather_pct, alert_level_max |
| `fct_location_weather_forecast_daily` | table | date × location_id | int_location_weather_daily_resolved | date, location_id, lat, lon, weather_code, temperature_2m_{max,min}, apparent_temperature_{max,min}, wind_speed/gusts_10m_max, rain_sum, snowfall_sum, precipitation_sum, is_weather_forecast |
| `fct_location_weather_forecast_daily_detail` | table | date × location_id | int_client_weather_daily_details | date, location_id, timezone, weather_code, weather_label_fr, temperature_2m_{min,max}, precipitation_sum_mm, wind_speed_10m_max, is_weather_forecast/seasonal_fallback/missing |
| `fct_mobility_disruptions__lines` | **incremental** (insert_overwrite) | disruption × line × service_date | int_transportation_paris_disruption_line_date | line_id, transport_line, transport_mode, service_date, disruption_{begin,end}_ts, severity(_rank), perturbation_lvl, title_merged, is_active/planned_flag |
| `fct_mobility_disruptions_paris` | **disabled** (`enabled=false`) | — | — | — |
| `fct_region_context_7d_projection` | table | candidate_date × region_id | fct_region_context_features_daily, int_holidays_fr_daily_named, int_school_vacations_region_daily_named | candidate_date, region_id, region_name/code_insee, event_opportunity_score_region_7d_avg_centered, n_alert_days_7d, avg/max_event_count_region_7d, public_holiday_name_7d, school_vacation_name_7d |
| `fct_region_context_daily` | table | date × region_id | int_region_day_grid, int_events_region_daily__aligned, int_commercial_events_daily, int_tourism_region_daily, dim_calendar, int_school_vacations_region_daily_named | date, region_id, region_name/code_insee/nuts2, event_count_region, tourism_index/status_region, mobility_status/disruption_flag_region, is_weekend/holiday/school_flag |
| `fct_region_context_features_daily` | table | date × region_id | fct_region_context_daily | date, region_id, event_count_region, tourism_index_region, {weather,events,tourism,mobility,total}_risk_index, raw_risk_score_region, event_opportunity_score_region, opportunity_label/grade_region |
| `fct_region_day_annotations_daily` | table | date × region_id | int_region_day_grid, int_holidays_fr_daily_named, int_school_vacations_region_daily_named, int_commercial_events_daily | date, region_id, region_name/code_insee, is_public_holiday_fr_flag, public_holiday_name_fr, is_school_holiday_flag, school_vacation_name, commercial_events, commercial_event_count |
| `fct_region_event_calendar_spans` | table | calendar span (event/holiday/vacation/commercial) | int_events_daily, fct_region_day_annotations_daily, int_commercial_events_spans_union, geo_commune_to_region | calendar_item_type/uid, event_name, event_start/end_date, scope_type, city_id, region_id, city/region_name, industry_code, theme |
| `fct_trends_keywords` | **incremental** | date × keyword_id × geo | int_trends_keywords__dedup, stg_trends_keywords__plan | date, keyword_id, geo, category, keyword_text, interest_value, batch_id, retrieved_at |
| `test` / `test_fct` | default | **scratch/test models — not production** | ? | ? |

---

## Dims layer (`dims.dim_*`)

| Model | Mat. | Grain | Upstream refs | Key columns |
|---|---|---|---|---|
| `dim_ai_context_location` | view | location_id | dim_client_company_profile, dim_client_location, dim_client_transit_proximity, geo_commune_to_region | location_id, company_name, company_activity_type, location_type, primary_audience_1/2, city_name, lat, lon, region_name, nearest_transit_stop_id, transit_network |
| `dim_audience_availability` | table | audience × day_type | audience_availability_base | audience, day_type, availability_score, delta_pct, source_note, rationale_fr |
| `dim_calendar` | table | date | stg_holidays_daily | date, year, quarter, month(_name), year_month, week_iso, dow_iso, is_weekend, is_month_start/end |
| `dim_calendar_region` | table | date × region_id | dim_calendar, src raw.school_vacations_periods, dim_holiday_zones | date, region_id, country_code, holiday_zone_code |
| `dim_city_to_region` | default | city_id | geo_commune_to_region, regions_map | city_id, region_code_insee/nuts2, department_id, location_uid, lat, lon, city_geo_point, active_flag |
| `dim_client_company_profile` | view | location_id | client_company_profile, int_client_website_profiles | location_id, company_name, company_activity_type, position, location_type, primary_audience_1/2, origin_city_id_1/2/3, origin_city_label_1 |
| `dim_client_location` | table | location_id | client_fetch_points, int_client_website_profiles, communes_coords, city_map, geo_commune_to_region | location_id, location_label/type, active_flag, city_id_granular/commune, region_code_insee/nuts2, region_id/name, lat, lon |
| `dim_client_locations_weather` | view | location_id | dim_client_location | location_id, location_label, active_flag, lat, lon |
| `dim_client_transit_proximity` | table | location_id | int_client_website_profiles, dim_idf_transportation_stops, dim_idf_stops_lines | location_id, location_access_pattern, nearest_transit_stop(_distance_m), stop_id/name, town_name, transit_network, nearest_transit_line_name/id |
| `dim_event_city_label` | view | location_uid | event_location_city_map | location_uid, city_id/name, region_code_insee, zip_code, source_system, active_flag, lat, lon, geo_point |
| `dim_holiday_zones` | table | region_id | src raw.school_vacations_periods | region_id, holiday_zone_code |
| `dim_idf_stops_lines` | table | (route × stop) | stg_idf_stops_lines_ref | route_id, stop_id, route_long_name, stop_name, stop_lon/lat, operator_name, short_name, mode, nom_commune, code_insee |
| `dim_idf_transportation_lines` | table | line_id | stg_idf_lines_referentiel | line_id/sk, group_id, line_name/short_name, transport_mode/submode, operator_id/name, network_name, color_web_hex, valid_from_date |
| `dim_idf_transportation_stops` | table | stop_id | stg_idf_stops_referentiel | stop_id/sk, stop_version, stop_name(_norm), stop_type, town_name, postal_region, accessibility, fare_zone |
| `dim_longitude_latitude_cities` | table | city (agg by nearest location_id) | longitude_latitude_cities, int_location_id_map | city, region, lat, lon, forecast_location_id_raw, distance_m |
| `dim_opportunity_thresholds` | view | candidate_date × location_id | fct_location_context_daily, opportunity_thresholds, opportunity_tourism_threshold_adjustments | candidate_date, location_id, horizon_bucket, regime_a/b_min_score_adj, medal_min_gap_score, threshold_source_scope, tourism_status_region |
| `dim_region` | table | region_id | regions_map | region_id, region_name, region_code_insee, lat, lon, geo_point |
| `geo_commune_to_region` | default | city_id | city_map, regions_map, departments_map, communes_coords | city_id, city_name, region_id/code_insee/name, department_id/name, location_uid, lat, lon, active_flag |

---

## Sources & staging (`staging.stg_*`) — lineage only

Staging = thin views over `raw`/`open_data` sources. Format: `model | mat | upstream (src:dataset.table or ref)`.

| Model | Mat | Upstream |
|---|---|---|
| `stg_action_log` | view | src:analytics.action_log |
| `stg_alerts` | view | src:raw.alerts |
| `stg_competitor_tracking` | view | src:raw.competitor_tracking |
| `stg_event_outcomes` | view | src:raw.event_outcomes |
| `stg_notification_preferences` | view | src:raw.notification_preferences |
| `stg_saved_item_dates` | view | src:raw.saved_item_dates |
| `stg_saved_item_snapshots` | view | src:raw.saved_item_snapshots |
| `stg_saved_items` | view | src:raw.saved_items |
| `stg_tracked_sources` | view | src:raw.tracked_sources |
| `stg_watched_events` | view | src:raw.watched_events |
| `stg_client_fetch_points` | view | client_fetch_points |
| `stg_commercial_events_spans` | view | src:raw.commercial_events_spans |
| `stg_competitor_alerts` | view | src:raw.competitor_alerts |
| `stg_competitor_directory` | view | src:raw.competitor_directory |
| `stg_competitor_events` | view | src:raw.competitor_events |
| `stg_events_manual` | view | src:raw.raw_events_manual |
| `stg_events_occitanie_musees` | view | src:raw.raw_agenda-d-occitanie-musees |
| `stg_events_occitanie_participatif` | view | src:raw.raw_events_occitanie_participatif_geojson |
| `stg_events_user_contributed` | view | src:raw.user_contributed_events |
| `stg_fact_poi_unified` | view | src:raw.fact_poi_unified |
| `stg_holidays_daily` | view | src:raw.holidays_daily |
| `stg_idf_lines_referentiel` | view | src:raw.idf_lines_referentiel |
| `stg_idf_stop_areas` | view | src:raw.idf_stop_areas |
| `stg_idf_stops_lines_ref` | view | src:raw.idf_arrets_lignes_referenciel |
| `stg_idf_stops_referentiel` | view | src:raw.idf_stops_referentiel |
| `stg_insight_event_user_location_profile` | view | src:raw.insight_event_user_location_profile |
| `stg_mega_events` | view | calendar_city_events_2026 |
| `stg_museum_visits_master` | view | src:raw.museum_visits_master |
| `stg_new_weather_forecast_10d` | view | src:raw.new_weather_forecast_10d |
| `stg_nimes_2026_events_manual` | view | src:raw.raw_nimes_events_2026 |
| `stg_poi_categories_unified` | view | src:raw.poi_categories_unified |
| `stg_poi_classifications_unified` | view | src:raw.poi_classifications_unified |
| `stg_raw_agenda_occitanie` | view | src:raw.raw_agenda_occitanie |
| `stg_raw_agenda_occitanie_musees` | view | — |
| `stg_raw_events_by_agenda_occitanie` | view | int_event_location_city_map, stg_raw_locations_by_agenda_occitanie, src:raw.raw_events_by_agenda_occitanie |
| `stg_raw_events_paris` | view | src:raw.raw_events_paris |
| `stg_raw_locations_by_agenda_occitanie` | view | src:raw.raw_locations_by_agenda_occitanie |
| `stg_school_vacations_periods` | view | src:raw.school_vacations_periods |
| `stg_top_museum_attendance` | view | src:raw.top_museum_attendance |
| `stg_tourism_annual_idf_exhibitions_summary` | view | src:raw.tourism_annual_idf_exhibitions_summary |
| `stg_tourism_annual_idf_sites` | view | src:raw.tourism_annual_idf_sites |
| `stg_tourism_annual_national` | view | src:raw.tourism_annual_national |
| `stg_tourism_annual_sites_nonresident` | view | src:raw.tourism_annual_sites_nonresident |
| `stg_tourism_annual_sites_resident_nonresident` | view | src:raw.tourism_annual_sites_resident_nonresident |
| `stg_tourism_monthly_national` | view | src:raw.tourism_monthly_national |
| `stg_tourism_occupancy_monthly` | view | src:raw.tourism_occupancy_monthly |
| `stg_traffic_incidents` | view | src:raw.road_traffic_incidents_{idf,occitanie,paca} |
| `stg_transportation_status_paris` | incremental | src:raw.idf_traffic_info |
| `stg_trends_keywords` | view | src:raw.trends_keywords |
| `stg_trends_keywords__plan` | view | keyword_plan |
| `stg_watched_competitors` | view | src:raw.watched_competitors |
| `stg_weather_alerts_daily_all` | view | stg_weather_alerts_dept_daily |
| `stg_weather_alerts_dept_daily` | view | city_map, communes_coords, src:raw.new_weather_forecast_10d |
| `stg_weather_forecast_10d` | view | src:raw.weather_forecast_10d |
| `stg_weather_history_daily` | view | src:raw.weather_history_daily |

---

## Intermediate (`intermediate.int_*`) — lineage only

| Model | Mat | Upstream |
|---|---|---|
| `int_airbyte_weather_forecast_inputs` | view | dim_client_locations_weather |
| `int_airbyte_weather_forecast_user_coords` | view | dim_client_locations_weather |
| `int_attendance_effects_daily` | view | dim_client_location, fct_location_weather_alerts_daily |
| `int_calendar_event_spans` | table | int_commercial_events_spans_union, stg_raw_events_by_agenda_occitanie, stg_raw_events_paris |
| `int_calendar_event_spans_enriched` | table | int_calendar_event_spans, int_event_industry_keywords_normalized |
| `int_client_competition_features_daily` | view | — |
| `int_client_distance_pairs` | view | dim_client_location |
| `int_client_fetch_points_geo` | view | regions_map, stg_client_fetch_points |
| `int_client_location_to_forecast_location` | view | dim_client_locations_weather, int_client_weather_forecast_location |
| `int_client_weather_alerts_daily` | table | dim_client_location, int_location_weather_daily_resolved, weather_impacts_coeffs |
| `int_client_weather_alerts_enriched` | view | dim_client_location, int_client_fetch_points_geo, int_client_weather_alerts_daily |
| `int_client_weather_daily_details` | view | int_location_weather_daily_resolved |
| `int_client_weather_forecast_location` | view | stg_new_weather_forecast_10d |
| `int_client_website_profiles` | view | city_map, geo_commune_to_region, stg_insight_event_user_location_profile |
| `int_commercial_events_daily` | view | geo_commune_to_region, int_commercial_events_spans_union |
| `int_commercial_events_spans_union` | view | stg_commercial_events_spans, stg_events_manual, stg_mega_events |
| `int_competitor_alerts` | table | fct_competitor_directory, fct_competitor_threat_profile, stg_competitor_alerts |
| `int_competitor_directory` | table | competitor_industry_profile_defaults, dim_event_city_label, int_events_industry_code_normalization, stg_competitor_directory, src:raw.watched_competitors |
| `int_competitor_events` | table | int_competitor_directory, int_events_industry_code_normalization, stg_competitor_events |
| `int_competitor_threat_profile` | table | dim_client_company_profile, dim_client_location, fct_competitor_directory |
| `int_event_industry_keywords_normalized` | table | event_industry_keywords |
| `int_event_location_city_map` | view | stg_raw_locations_by_agenda_occitanie, src:staging.insee_communes_bocp |
| `int_events_city_daily` | view | int_events_daily |
| `int_events_city_daily_enriched` | view | dim_city_to_region, dim_event_city_label, int_events_event_daily_enriched |
| `int_events_daily` | view | int_events_daily_{admin,idf,occitanie,user} |
| `int_events_daily_admin` | incremental | dim_event_city_label, int_event_industry_keywords_normalized, stg_events_manual, stg_mega_events, stg_nimes_2026_events_manual |
| `int_events_daily_idf` | incremental | dim_event_city_label, int_event_industry_keywords_normalized, stg_raw_events_paris |
| `int_events_daily_occitanie` | incremental | dim_event_city_label, int_event_industry_keywords_normalized, stg_events_occitanie_{musees,participatif}, stg_raw_events_by_agenda_occitanie, stg_raw_locations_by_agenda_occitanie |
| `int_events_daily_user` | incremental | dim_event_city_label, stg_events_user_contributed |
| `int_events_event_daily_enriched` | view | int_event_location_city_map, int_events_daily, int_events_industry_code_normalization, src:dims.dim_event_enrichment |
| `int_events_industry_code_normalization` | view | event_industry_keywords_normalization |
| `int_events_region` | view | int_events_region_daily |
| `int_events_region_daily` | view | int_events_daily |
| `int_events_region_daily__aligned` | view | dim_calendar, dim_region, int_events_region_daily |
| `int_events_region_monthly` | view | int_events_region_daily |
| `int_holidays_fr_daily_named` | view | — |
| `int_holidays_region_daily` | view | dim_calendar_region, src:raw.holidays_daily, src:raw.school_vacations_periods |
| `int_location_id_map` | table | stg_weather_history_daily |
| `int_location_nearest_weather_history` | view | dim_client_locations_weather, int_weather_history_daily |
| `int_location_opportunity_components_daily` | table | int_attendance_effects_daily |
| `int_location_weather_daily_resolved` | view | dim_client_locations_weather, int_client_weather_forecast_location, int_location_nearest_weather_history, int_weather_history_daily |
| `int_mobility_region_daily__aligned` | view | dim_calendar, dim_region |
| `int_museum_visits_city_annual` | view | geo_commune_to_region, stg_museum_visits_master |
| `int_museum_visits_museum_annual` | view | geo_commune_to_region, stg_museum_visits_master |
| `int_region_day_grid` | table | dim_calendar, dim_region |
| `int_region_opportunity_components_daily` | table | int_weather_region_daily__aligned |
| `int_school_holidays_region_daily` | view | departments_map, vacation_zones_france |
| `int_school_vacations_region_daily_named` | view | — |
| `int_site_visits_country_annual` | view | — |
| `int_tourism_country_monthly` | view | stg_tourism_occupancy_monthly |
| `int_tourism_region_daily` | view | int_commercial_events_daily, int_holidays_region_daily, int_region_day_grid, int_tourism_region_monthly |
| `int_tourism_region_daily__aligned` | view | dim_calendar, dim_region, int_tourism_region_daily |
| `int_tourism_region_monthly` | view | region_hotel_occupancy_rate |
| `int_traffic_incidents_geocoded` | view | dim_client_location, stg_traffic_incidents |
| `int_transportation_paris_disruption_line_date` | view | int_transportation_paris_impacted_sections_flat |
| `int_transportation_paris_impacted_sections_flat` | view | int_transportation_status_paris_general |
| `int_transportation_status_paris_general` | view | stg_transportation_status_paris |
| `int_trends_city_daily` | view | departments_map, dim_calendar, geo_commune_to_region, regions_map, stg_trends_keywords(+__plan) |
| `int_trends_keywords__dedup` | view | stg_trends_keywords |
| `int_trends_region_daily` | view | departments_map, dim_calendar, regions_map, stg_trends_keywords(+__plan) |
| `int_w_debug_client_vs_evidence` | view | fct_location_weather_alerts_daily |
| `int_w_debug_join_coverage` | view | fct_location_weather_alerts_daily, int_weather_evidence_features_daily |
| `int_weather_alerts_daily_snapshot` | incremental | int_weather_region_alerts_daily |
| `int_weather_calibration_profile` | view | stg_weather_alerts_dept_daily |
| `int_weather_city_daily` | view | communes_coords, dim_calendar, geo_commune_to_region |
| `int_weather_evidence_catalog` | view | evidence_weight_matrix_v1 |
| `int_weather_evidence_features_daily` | table | dim_calendar, int_weather_calibration_profile, int_weather_region_alerts_daily, stg_weather_alerts_dept_daily |
| `int_weather_hazard_impacts_daily` | table | int_weather_region_alerts_daily, weather_impacts_coeffs |
| `int_weather_history_daily` | view | stg_weather_history_daily |
| `int_weather_level_monotone_summary` | view | int_weather_evidence_features_daily |
| `int_weather_region_alert_levels_daily` | view | int_weather_hazard_impacts_daily, int_weather_region_alerts_daily, regions_map |
| `int_weather_region_alerts_daily` | view | stg_weather_alerts_dept_daily |
| `int_weather_region_daily__aligned` | table | int_region_day_grid, int_weather_region_alert_levels_daily, int_weather_region_alerts_daily, regions_map |
| `legacy_int_commercial_events_region_daily_named` | view | — (legacy) |

---

## Truth B — live column catalog

- [`bq-catalog.json`](bq-catalog.json) — every table+view in `muse-square-open-data` (EU) with columns + types. 430 tables, 7441 columns. Snapshot 2026-07-09.
- [`bq-catalog.allowlist.json`](bq-catalog.allowlist.json) — compact `dataset.table → [column names]` sidecar (for enforcement hooks).
- **These are snapshots.** For any query, re-verify the exact column against live `INFORMATION_SCHEMA` via the `bq-verify` skill. Run BQ with `--location=EU`; always `DATE()`-cast (Node client returns 0 rows silently on type mismatch).
