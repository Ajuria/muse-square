# Data Model Index — Single Source of Truth (dbt + BigQuery)

> **Purpose.** Authoritative map of the data layer that feeds the app: every dbt model (what marts/views exist, their grain, lineage, output columns) plus a pointer to the live BigQuery column catalog. It exists to stop two failure modes in data work: (1) **building a mart/view that already exists**, and (2) **guessing a column/table name** instead of verifying it.
>
> **This layer has two truths — treat them differently:**
> - **Truth A — dbt models (static, versioned).** The tables below, generated from the dbt source files. Use to answer *"does a model for X exist, what grain, what feeds it."*
> - **Truth B — live BigQuery schema (dynamic).** Exact columns/types live in `INFORMATION_SCHEMA`, snapshotted to [`bq-catalog.json`](bq-catalog.json) (+ `bq-catalog.allowlist.json`). **This snapshot is a map, NOT current truth** — incremental models drop new columns without `--full-refresh`, and the BQ Node client silently returns 0 rows on DATE/STRING mismatch. **Before writing any query, re-verify the exact column live via the `bq-verify` skill / `INFORMATION_SCHEMA`.**
>
> **Rule before you build.** Grep this file (and `docs/module-index.md`) for the capability before creating a new dbt model or query. Extend the existing model; don't fork a parallel one.
>
> _Generated 2026-07-09. dbt repo: `~/Documents/ms_database/ms_dbt` @ git **`b5d8579`** (`Ajuria-branch`, the live SQL repo — regenerated after pulling 62 commits from the May‑7 snapshot). BQ catalog snapshot: 2026-07-09, project `muse-square-open-data` (EU), 430 tables / 7441 columns. dbt Cloud IDE edits are local until synced to GitHub — if this SHA is behind `origin/Ajuria-branch`, pull + regenerate (`docs/refresh-bq-catalog.sh` for Truth B; re-read the model files for Truth A)._

## ⚠️ Live warehouse vs dbt project — they diverge

The BigQuery region holds **more tables than this dbt project defines** (legacy tables, or built outside this project). Before assuming a table is dbt-managed, check it appears below — if it's only in `bq-catalog.json`, it's an **orphan**.

| Dataset | Live tables | Live views | dbt models here |
|---|---|---|---|
| `semantic` | 26 | 22 | 24 |
| `mart` | 69 | 1 | 54 (2 = `test`/`test_fct`) |
| `dims` | 19 | 5 | 19 |
| `intermediate` | 108 | 76 | 94 |
| `staging` | 82 | 79 | 72 |
| `raw` | 68 | 0 | (sources — ingested, not modelled here) |
| `analytics` | 22 | 0 | (app-write + app_activity sources) |
| `open_data` | 33 | 1 | (reference data) |

> `analytics.*` and `raw.*` are **not produced by dbt** — `raw`/`raw_airbyte`/`raw_crawl` are ingested (Airbyte / crawl / app writes), `analytics` is written directly by the app. The dbt project reads them via `source()` + staging. dbt source aliases `raw_crawl` and `raw_airbyte` map to physical ingest schemas.

---

## Semantic layer (`semantic.vw_*`) — the app's read contract

What API routes query. Full column truth in `bq-catalog.json`.

| Model | Mat. | Grain (1 row =) | Upstream refs | Key output columns |
|---|---|---|---|---|
| `vw_insight_event_30d_day_surface` | view | location_id × date | fct_location_opportunity_score_daily, fct_location_weather_forecast_daily(+_detail), fct_location_weather_alerts_daily, fct_location_events_radius_daily, fct_location_context_features_daily, fct_region_day_annotations_daily | date, location_id, opportunity_regime, opportunity_score, opportunity_medal, weather_code, weather_label_fr, weather_alert_level, lvl_heat, lvl_cold, lvl_rain, lvl_snow, lvl_wind, precipitation_probability_max_pct, wind_speed_10m_max, key_takeaway |
| `vw_insight_event_30d_surface` | view | location_id × date | fct_location_context_features_daily, fct_location_weather_forecast_daily(+_detail), fct_location_weather_alerts_daily, fct_location_events_radius_daily, fct_region_day_annotations_daily | date, location_id, opportunity_regime, opportunity_score_final_local, opportunity_medal, weather_code, weather_alert_level, key_takeaway, top_days |
| `vw_insight_event_30d_window_surface` | **table** | location_id × window_start_date | vw_insight_event_30d_surface | location_id, window_start_date, window_end_date, top_days, days_count, days_{a,b,c,risk}, score_min, score_max |
| `vw_insight_event_7d_surface` | **table** | location_id × candidate_date | fct_location_context_7d_projection, fct_region_day_annotations_daily | candidate_date, centered_date, location_id, event_opportunity_score_local_7d_avg_centered, holiday_name, vacation_name, contains_weather_risk_7d, avg_events_in_radius_10km_7d |
| `vw_insight_event_action_candidates` 🆕 | view | date × location_id × action_type | fct_location_daily_action_candidates, dim_client_location | date, location_id, action_type, card_instance_id, action_priority, action_category, channel_hint, confidence_tier, headline_fr, detail_fr, data_payload, suppression_key, expires_at |
| `vw_insight_event_action_outcomes` 🆕 | view | publish_id | fct_action_outcomes, dim_client_location | publish_id, location_id, user_id, channel, action_type, signal_type, external_post_id, published_at, affected_date, outcome_date |
| `vw_insight_event_ai_location_context` | view | location_id | dim_ai_context_location | location_id, company_activity_type, location_type, primary_audience_1/2, capacity_sensitivity, geographic_catchment, business_short_description, website_url, instagram_url, facebook_url, lat, lon |
| `vw_insight_event_ai_region_context` | view | date × region_id | fct_region_context_daily | date, region_id, region_name, event_count_region, tourism_index_region, tourism_status_region, has_tourism_signal_region, is_public_holiday_flag, public_holiday_name_fr, is_school_holiday_flag |
| `vw_insight_event_change_feed` | view | feed_date × location_id × change_type × entity_id | fct_location_change_feed, dim_client_location | feed_date, affected_date, location_id, change_type, entity_id, old_value, new_value, score_delta, alert_level, change_category, change_priority_sort, summary |
| `vw_insight_event_client_offering` 🆕 | view | location_id × item_category × item_description | fct_client_offering_profile, fct_competitor_directory, src raw.watched_competitors | location_id, item_category, item_description, item_code, line_count_30d, units_30d, revenue_30d, avg_unit_price, promo_count_30d, revenue_share, revenue_rank |
| `vw_insight_event_client_performance` 🆕 | view | location_id × date × source_type | fct_client_daily_performance, fct_location_opportunity_score_daily, fct_location_context_features_daily, fct_location_weather_alerts_daily | location_id, date, source_type, daily_revenue, daily_net_revenue, daily_transactions, daily_visitors, daily_avg_basket, daily_conversion_rate, revenue_yesterday, revenue_last_week, revenue_30d_avg |
| `vw_insight_event_competitor_alerts` | view | competitor_alert_id | fct_competitor_alerts | competitor_alert_id, competitor_event_id, competitor_id, location_id, clerk_user_id, alert_level, change_category, affected_date, event_label, conflict_score, entity_threat_score, entity_threat_level |
| `vw_insight_event_competitor_lookup` | view | competitor_id | fct_competitor_directory | competitor_id, competitor_name, address, city, industry_code, industry_bucket, lat, lon, google_place_id, google_rating, google_rating_count, google_photos |
| `vw_insight_event_competitor_signals` | view | location_id × competitor_id × event_date × event_name | fct_competitor_events_conflicts, fct_competitor_directory, fct_competitor_threat_profile | competitor_event_id, competitor_id, location_id, competitor_name, competitor_seasonality, signal_type, event_name, event_type, event_date, google_rating |
| `vw_insight_event_competitors_followed` 🆕 | view | clerk_user_id × location_id × competitor_id | fct_location_competitors_followed | clerk_user_id, location_id, competitor_id, competitor_name, city, industry_code, industry_bucket, lat, lon, google_place_id, google_rating, threat_score, threat_level |
| `vw_insight_event_day_surface` | **table** | date × location_id | fct_location_opportunity_score_daily, fct_location_context_features_daily, fct_region_day_annotations_daily, fct_location_events_topn_daily, fct_location_events_radius_daily, fct_location_weather_alerts_daily, fct_location_weather_forecast_daily_detail, fct_location_change_feed, fct_location_impact_daily_calendar, fct_location_foot_traffic_daily | date, location_id, opportunity_regime, opportunity_score_final_local, events_score, mobility_score, calendar_score, weather_score, opportunity_medal, key_takeaway |
| `vw_insight_event_map_signals` | view | date × location_id × signal_id | fct_location_events_topn_daily, fct_location_mobility_disruption_changes, fct_competitor_events_conflicts, fct_competitor_directory, dim_client_location | date, location_id, signal_id, signal_type, event_label, event_lat, event_lon, distance_m, radius_bucket, mobility_signal_id, mobility_severity |
| `vw_insight_event_mobility_disruptions` | view | location_id × disruption_date × disruption_event_id | fct_location_mobility_disruptions__union | location_id, disruption_date, disruption_source, line_id, stop_name, disruption_{begin,end}_ts, severity, title_merged, is_active_flag, mode, disruption_category |
| `vw_insight_event_selected_days_surface` | **incremental** | date × location_id | vw_insight_event_day_surface, vw_insight_event_7d_surface, fct_location_events_topn_daily | (all of day_surface) + window_centered_date_7d, opportunity_score_local_7d_avg_centered, top_events_{500m,5km,10km,50km} |
| `vw_insight_event_signal_accuracy` 🆕 | view | location_id × signal_type × period | fct_signal_accuracy_daily | location_id, signal_type, period, sample_size, accuracy_avg, accuracy_min, accuracy_max, accuracy_pct |
| `vw_insight_event_user_active_goal` 🆕 | view | user_id × location_id | fct_user_active_goal | user_id, location_id, goal, goal_scope, goal_label_fr, goal_bucket, primary_kpi, effective_from, effective_to |
| `vw_insight_event_user_activity` 🆕 | view | user_id × location_id | fct_user_activity_summary | user_id, location_id, cards_done, cards_already_done, cards_not_done, cards_ignored, total_attempted, total_succeeded, acceptance_rate_pct |
| `vw_insight_eventcalendar_event_lookup` | view | calendar_item_uid (span) | fct_region_event_calendar_spans | calendar_item_uid, calendar_item_type, event_name, event_start_date, event_end_date, scope_type, city_id, city_name, region_id, industry_code, theme, keyword_priority_rank |
| `vw_ms_insight_ai_decision_policy_rules` | view | rule_key × rule_value | (inline only — no refs) | rule_key, rule_value, base_priority_dimensions, boost_priority_dimensions, blocker_focus, auto_constraints, rule_version |

---

## Mart layer (`mart.fct_*`) — facts

Materialization notes captured verbatim (incremental / insert_overwrite / partitioned / clustered). 🆕 = new since the May‑7 snapshot. Marts under `app_activity/` noted.

| Model | Mat. | Grain (1 row =) | Upstream refs | Key output columns |
|---|---|---|---|---|
| `agg_trends_keywords_weekly` | table, part. weekly | week_start × keyword_id × geo | fct_trends_keywords | week_start, keyword_id, geo, category, avg/max/min_interest_value, days_observed |
| `fct_action_outcomes` 🆕 `app_activity/` | incr., insert_overwrite, part. daily | publish_id | int_publish_log, int_channel_performance, fct_client_daily_performance | publish_id, location_id, user_id, channel, action_type, signal_type, affected_date, external_post_id, post_views, post_clicks, post_reactions, daily_revenue, revenue_delta_vs_baseline_pct |
| `fct_admin_dashboard` 🆕 `app_activity/` | table | user_id × location_id | fct_user_activity_summary, int_user_profile_latest, dim_client_location, int_user_feedback_summary | dashboard_id, user_id, location_id, first_name, last_name, email, company_name, total_actions, page_views, drafts_published, signals_confirmed, competitors_followed, activity_status, total_crawls, total_errors |
| `fct_signal_feedback_detail` 🆕 `app_activity/` | table | confirmation_id | stg_signal_confirmations, dim_client_location | confirmation_id, user_id, location_id, location_label, client_industry_code, signal_type, signal_ref_id, signal_date, confirmation, feedback_text, created_at |
| `fct_user_active_goal` 🆕 `app_activity/` | view | user_id × location_id | int_user_active_goal, dim_client_goal | user_id, location_id, goal, goal_scope, effective_from, effective_to, goal_label_fr, goal_bucket, primary_kpi |
| `fct_user_activity_summary` 🆕 `app_activity/` | table | user_id × location_id | int_user_activity_summary, int_user_crawl_summary, int_user_error_summary | activity_id, user_id, location_id, total_actions, page_views, drafts_generated, drafts_published, signals_confirmed, activity_status, days_since_last_action, total_crawls, total_errors |
| `fct_client_daily_performance` 🆕 | incr., insert_overwrite, part. daily | location_id × transaction_date × source_type | int_client_daily_performance | location_id, client_id, transaction_date, source_type, daily_revenue, daily_transactions, daily_visitors, daily_conversion_rate, daily_avg_basket, revenue_yesterday, revenue_30d_avg, revenue_vs_30d_avg_pct |
| `fct_client_day_analogs` 🆕 | table, clustered | location_id × date | fct_client_sales_signals_daily, fct_location_context_features_daily | location_id, date, dow, condition_key, weather_band, match_tier, daily_revenue, revenue_robust_z, analog_n, analog_median_revenue, residual_vs_analog_pct, is_unexplained, analogs |
| `fct_client_commitment_outcomes` 🆕 | table | **one row per resolved+done commitment (commitment-grain, pre-explode)** | int_client_commitment_latest | commitment_id, location_id, user_id, source, authorship, action_type, driver, origin_factor (provenance only), **window_active_factors ARRAY<STRING>** (SPLIT of the CSV — the conditions the action ran under), window_days, resolved_date, verdict, is_confounded, beat, effect_residual_pct. Consumed commitment-grain by commitmentContext (action_type rollup) |
| `fct_client_day_residual` 🆕 | table, clustered | location_id × date | fct_client_sales_signals_daily, fct_location_context_features_daily | location_id, date, daily_revenue, expected_revenue, residual_pct, residual_z, is_revenue_down_residual, is_revenue_surge_residual, revenue_robust_z, is_revenue_down_anomaly, is_revenue_surge_anomaly |
| `fct_client_offering_daily` 🆕 | incr., insert_overwrite, part. daily | location_id × transaction_date × item_category | stg_client_transactions | location_id, client_id, transaction_date, item_category, line_count, units, revenue, avg_unit_price, promo_count, revenue_share, volume_share, revenue_rank |
| `fct_client_offering_profile` 🆕 | table, clustered | location_id × item_category × item_description | int_client_offering_profile | location_id, client_id, item_category, item_description, item_code, line_count_30d, units_30d, revenue_30d, avg_unit_price, promo_count_30d, revenue_share, revenue_rank |
| `fct_client_sales_signals_daily` 🆕 | table, clustered | location_id × transaction_date | fct_client_daily_performance, fct_location_context_features_daily | location_id, transaction_date, daily_revenue, daily_visitors, daily_transactions, conversion_rate, avg_basket, discount_rate, revenue_robust_z, is_revenue_down_anomaly, is_revenue_surge_anomaly, is_traffic_not_converting, is_discount_without_lift, primary_revenue_driver |
| `fct_competitor_alerts` | incr., part. daily | competitor_alert_id | int_competitor_alerts | competitor_alert_id, competitor_event_id, competitor_id, location_id, clerk_user_id, alert_level, change_category, affected_date, event_label, score_delta, entity_threat_score, created_at, notified_at |
| `fct_competitor_directory` | table, clustered | competitor_id | int_competitor_directory, int_events_event_daily_enriched, src **raw_crawl**.competitor_events, src **raw_crawl**.watched_competitors | competitor_id, competitor_name, address, city, industry_code, industry_bucket, primary_audience, geo_point, google_place_id, google_rating, confidence_score, is_followed, first_crawled_at, last_crawled_at |
| `fct_competitor_events_conflicts` | incr., insert_overwrite, part. daily | location_id × competitor_id × event_date × event_name | int_competitor_events, fct_competitor_directory, dim_client_location, dim_ai_context_location, fct_competitor_threat_profile | competitor_event_id, competitor_id, location_id, event_name, event_date(+_end), distance_from_location_m, venue_exposure, industry_overlap, audience_overlap(_score), threat_score, threat_level, conflict_score |
| `fct_competitor_threat_profile` | table, clustered | location_id × competitor_id | int_competitor_threat_profile | location_id, competitor_id, competitor_name, is_followed, audience_overlap_pct, industry_match_tier, seasonality_alignment, distance_km, threat_score, threat_level |
| `fct_foreign_tourism_context_daily` 🆕 | table | date | int_openholidays_public_holidays_country_daily, int_openholidays_school_coverage_country_daily | date, countries_on_public_holiday, countries_on_school_holiday, has_foreign_public_holiday_signal, has_foreign_school_holiday_signal |
| `fct_location_action_learning` 🆕 | table, clustered | location_id × action_type | fct_action_outcomes | location_id, action_type, window_days, publish_count, measurable_count, positive_count, positive_rate, avg_revenue_delta_vs_baseline_pct, median_revenue_delta_vs_baseline_pct, has_sufficient_sample, is_proven_lift |
| `fct_location_attendance_effects_daily` | incremental | date × location_id × region_id | int_attendance_effects_daily | date, location_id, region_id, impact_weather_pct, att_delta_pct |
| `fct_location_change_feed` | incr., insert_overwrite, part. daily | date × location_id × change_type × entity_id | fct_location_context_features_daily, fct_location_opportunity_score_daily(+components), fct_location_events_topn_daily, fct_location_weather_alerts_daily, fct_location_context_daily, fct_location_impact_daily_calendar, fct_competitor_events_conflicts, fct_competitor_directory, fct_location_mobility_disruption_changes(+__union), fct_location_foot_traffic_daily, dim_client_location, dim_client_transit_proximity, int_competitor_snapshot_deltas | date, location_id, change_type, entity_id, old_value, new_value, score_delta, driver_type, driver_delta, lvl_{rain,wind,snow,heat,cold}, enriched_event_label, event_venue_name, score_driver_label |
| `fct_location_commitment_learning` 🆕 | table | location_id × **factor** × action_type × window_days | fct_client_commitment_outcomes (`CROSS JOIN UNNEST(window_active_factors) AS factor`) | location_id, factor, action_type, window_days, source, authorship, done_count, beat_count, missed_count, confounded_count, avg/median_effect_residual_pct, last_resolved_date, has_sufficient_sample, is_proven_lift. **factor = window-context (what conditions the action ran under)**, not card-theme origin_factor. Factor-exploded → Tier-4 reads it by factor; NEVER SUM across factor for action_type totals (double-count) — use pre-explode outcomes |
| `fct_location_competitors_followed` 🆕 | table | clerk_user_id × location_id × competitor_id | int_competitors_followed, fct_competitor_threat_profile | clerk_user_id, location_id, competitor_id, competitor_name, city, industry_code, industry_bucket, lat, lon, google_place_id, google_rating, threat_score, threat_level, audience_overlap_pct, distance_km |
| `fct_location_context_7d_projection` | incr., insert_overwrite, part. candidate_date | candidate_date × location_id | fct_location_context_features_daily, int_holidays_fr_daily_named, int_school_vacations_region_daily_named | candidate_date, location_id, region_id, event_opportunity_score_local_7d_avg_centered, n_weather_risky_days_7d, avg/max_events_in_radius_10km_7d, has_tourism_signal_7d, public_holiday_name_7d, school_vacation_name_7d |
| `fct_location_context_daily` | table, clustered | date × location_id | fct_location_weather_alerts_daily, dim_client_location, fct_region_context_daily, **fct_location_foot_traffic_daily** | date, location_id, city_id, client_industry_code, weather_sensitivity, lvl_{wind,rain,snow,heat,cold}, impact_weather_pct, event_count_region, tourism_status_region, mobility_status_region, is_weekend/holiday/school_flag, ft_day_max, ft_peak_hour, ft_avg_busyness_pct |
| `fct_location_context_features_daily` | table, **part. date (RPF=true)**, clustered | date × location_id | fct_location_context_daily, fct_location_events_radius_daily, dim_client_location, dim_opportunity_thresholds, fct_location_opportunity_components_daily | date, location_id, competition_index_local, comp_nearby_weighted, baseline_comp_avg, has_valid_baseline_flag, opportunity_score_final_local, opportunity_regime, opportunity_medal, best_day_rank, primary_score_driver_label |
| `fct_location_daily_action_candidates` 🆕 | table, part. date, clustered | date × location_id × action_type (dedup by suppression_key) | fct_location_context_features_daily, fct_location_events_radius_daily, fct_location_opportunity_score_daily, fct_location_weather_alerts_daily, fct_region_day_annotations_daily, dim_client_location, fct_competitor_events_conflicts, vw_insight_event_change_feed, fct_client_daily_performance, fct_competitor_threat_profile, fct_client_offering_profile, fct_competitor_directory, fct_location_impact_daily_calendar, fct_foreign_tourism_context_daily | date, location_id, action_type, action_priority, action_category, channel_hint, headline_fr, detail_fr, data_payload, suppression_key, expires_at |
| `fct_location_disruptions__lines` | incr., insert_overwrite, part. service_date, clustered | location_id × line_id × service_date | dim_client_transit_proximity, fct_mobility_disruptions__lines, dim_idf_transportation_lines | location_id, line_id, service_date, disruption_{begin,end}_ts, severity(_rank), perturbation_lvl, title_merged, is_active_flag, nearest_transit_line_name, network_name |
| `fct_location_events_radius_daily` | incr., insert_overwrite, **part. date (RPF=true)**, clustered | date × location_id | dim_client_location, event_industry_keywords_normalization, int_events_event_daily_enriched | date, location_id, events_within_{500m,1km,5km,10km,50km}_count, events_within_{500m,1km,5km,10km,50km}_same_bucket_count, pct_same_bucket_5km |
| `fct_location_events_topn_daily` | incr., insert_overwrite, part. date, clustered | date × location_id | dim_client_location, int_events_event_daily_enriched, dim_client_transit_proximity, event_industry_keywords_normalization | date, location_id, client_lat/lon, nearest_transit_stop/line_name, location_access_pattern, top_events_{500m,1km,5km,10km,50km} (ARRAY<STRUCT>) |
| `fct_location_foot_traffic_daily` 🆕 | table, clustered | location_id × day_int (0=lundi…6=dimanche) | int_client_besttime_daily | location_id, clerk_user_id, location_label, besttime_venue_id/name/type, besttime_rating, day_int, day_text, day_max, day_mean, peak_hour, peak_busyness_pct, quiet_hour, avg_busyness_pct, venue_open/closed_hour |
| `fct_location_forecast_avg_weather_daily` | incr., insert_overwrite, **part. date (RPF=true)**, clustered | date × location_id | fct_location_weather_forecast_daily_detail, int_weather_history_daily | date, location_id, forecast_temperature_2m_{min,max}, forecast_precipitation_sum, forecast_wind_speed_10m_max, avg_temperature_2m_{min,max}, display_temperature_2m_{min,max}, value_type, is_avg |
| `fct_location_impact_daily_calendar` | incr., insert_overwrite, **part. date (RPF=true)**, clustered | date × location_id | dim_calendar, dim_client_location, dim_client_company_profile, dim_audience_availability, fct_region_day_annotations_daily, stg_mega_events | date, location_id, delta_att_calendar_pct, audience_availability_label, data_confidence |
| `fct_location_impact_daily_events` | table, **part. date (RPF=true)**, clustered | date × location_id | fct_location_events_radius_daily, dim_client_location | date, location_id, delta_att_events_pct |
| `fct_location_impact_daily_mobility` | incr., insert_overwrite, **part. date (RPF=true)**, clustered | date × location_id | dim_calendar, dim_client_location, dim_client_transit_proximity, int_mobility_region_daily__aligned, fct_location_mobility_disruptions__union(+_changes), stg_mega_events, geo_commune_to_region | date, location_id, changes_from_yesterday, change_reason, delta_att_mobility_{car,subway}_pct, delta_ops_mobility_car_pct, delta_att_mobility_pct |
| `fct_location_impact_daily_weather` | incr., insert_overwrite, **part. date (RPF=true)**, clustered | date × location_id | weather_impacts_coeffs (seed), int_client_weather_alerts_daily, fct_location_weather_forecast_daily_detail, dim_client_location | date, location_id, location_type, delta_att_weather_{rain,heat,cold,snow,wind}_pct, delta_att_weather_total_pct |
| `fct_location_mobility_disruption_changes` | table | location_id × comparison_date × disruption_event_id × change_reason | fct_location_mobility_disruptions__union | location_id, comparison_date, disruption_source, disruption_event_id, line_id, stop_name, severity, title_merged, is_active_flag, mode, delay_minutes, distance_meters, changes_from_yesterday, change_reason |
| `fct_location_mobility_disruptions__union` | incr., insert_overwrite, part. disruption_date, clustered | location_id × disruption_date × disruption_event_id | int_traffic_incidents_geocoded, fct_location_disruptions__lines, dim_idf_stops_lines, dim_client_location | location_id, disruption_date, disruption_source, disruption_event_id, line_id, stop_name, severity, title_merged, is_active/planned_flag, mode, distance_meters, nearest_transit_line_name, network_name |
| `fct_location_opportunity_components_daily` | incr., insert_overwrite, part. date, clustered | date × location_id | fct_location_impact_daily_{weather,events,mobility,calendar}, fct_location_context_daily | date, location_id, horizon_bucket, delta_att_weather_{wind,rain,snow,heat,cold}_pct, delta_att_{events,mobility,calendar,total}_pct, opportunity_score, {events,mobility,calendar,weather}_score, opportunite_regime_fr, primary_score_driver_label |
| `fct_location_opportunity_score_daily` | incr., insert_overwrite, part. date, clustered | date × location_id | fct_location_opportunity_components_daily, fct_location_context_features_daily, dim_client_location, dim_calendar, stg_mega_events | date, location_id, location_label, opportunity_score, opportunity_regime, opportunity_medal, is_forced_regime_c_flag, is_major_realization_risk_flag, major_realization_risk_driver, is_mega_event_flag, active_mega_event_name, delta_att_total_pct, opportunity_score_vs_yesterday |
| `fct_location_weather_alerts_5d` | table, part. window_start_date, clustered | client_id × 5-day window (peak day) | fct_location_weather_alerts_daily, dim_client_location | window_start/end_date, client_id, region_id, has_alert, peak_date, days_until_peak, window_max_level, lvl_{wind,rain,snow,heat,cold}, impact_{wind,rain,snow,heat,cold}_pct, impact_weather_pct |
| `fct_location_weather_alerts_daily` | incr., insert_overwrite, part. date, clustered | date × location_id | int_client_weather_alerts_daily | date, location_id, client_id, is_weather_forecast, is_seasonal_fallback, is_weather_missing, alert_source, lvl_{wind,rain,snow,heat,cold}, impact_weather_pct, alert_level_max |
| `fct_location_weather_forecast_daily` | incr., insert_overwrite, part. date, clustered | date × location_id | int_location_weather_daily_resolved | date, location_id, lat, lon, weather_code, temperature_2m_{max,min}, apparent_temperature_{max,min}, wind_speed/gusts_10m_max, rain_sum, snowfall_sum, precipitation_sum, precipitation_probability_max, uv_index_max, is_weather_forecast |
| `fct_location_weather_forecast_daily_detail` | incr., insert_overwrite, part. date, clustered | date × location_id | int_client_weather_daily_details | date, location_id, timezone, weather_code, weather_label_fr, temperature_2m_{min,max}, precipitation_sum_mm, precipitation_probability_max_pct, wind_speed_10m_max, sunrise_ts, sunset_ts, is_weather_forecast/seasonal_fallback/missing |
| `fct_location_weather_forecast_snapshot` 🆕 | incr., **merge** (uk: location_id,date,snapshot_date), part. date, clustered | date × location_id × snapshot_date | int_location_weather_daily_resolved | date, location_id, snapshot_date, weather_code, temperature_2m_{max,min}, precipitation_sum, precipitation_probability_max, wind_speed_10m_max, rain_sum, snowfall_sum, is_weather_forecast |
| `fct_mobility_disruptions__lines` | incr., insert_overwrite, part. service_date, clustered | line_id × service_date × disruption | int_transportation_paris_disruption_line_date | line_id, transport_line, transport_mode, service_date, disruption_{begin,end}_ts, severity(_rank), perturbation_lvl, title_merged, is_active/planned_flag |
| `fct_region_context_7d_projection` | table, clustered | candidate_date × region_id | fct_region_context_features_daily, int_holidays_fr_daily_named, int_school_vacations_region_daily_named | candidate_date, region_id, event_opportunity_score_region_7d_avg_centered, n_alert_days_7d, avg/max_event_count_region_7d, avg_tourism_index_region_7d, public_holiday_name_7d, school_vacation_name_7d |
| `fct_region_context_daily` | table, clustered | date × region_id | int_region_day_grid, int_events_region_daily__aligned, int_commercial_events_daily, int_tourism_region_daily, dim_calendar, int_school_vacations_region_daily_named | date, region_id, event_count_region, tourism_index/status_region, has_tourism_signal_region, mobility_status/disruption_flag_region, is_weekend/holiday/school_flag, public_holiday_name_fr, commercial_event_names_region |
| `fct_region_context_features_daily` | table, clustered | date × region_id | fct_region_context_daily | date, region_id, event_count_region, tourism_index_region, {weather,events,tourism,mobility,total}_risk_index, event_opportunity_score_region, primary_risk_driver_region, opportunity_label/grade_region, pros_text_region, cons_text_region |
| `fct_region_day_annotations_daily` | table, clustered | date × region_id | int_region_day_grid, int_holidays_fr_daily_named, int_school_vacations_region_daily_named, int_commercial_events_daily | date, region_id, is_public_holiday_fr_flag, public_holiday_name_fr, is_school_holiday_flag, school_vacation_name, commercial_events, commercial_event_count, is_commercial_event_flag |
| `fct_region_event_calendar_spans` | table, part. event_start_date, clustered | calendar span (event/holiday/vacation/commercial) | int_events_daily, fct_region_day_annotations_daily, int_commercial_events_spans_union, geo_commune_to_region | calendar_item_type/uid, event_name, event_start/end_date, scope_type, city_id, region_id, city/region_name, industry_code, keywords, theme, keyword_priority_rank |
| `fct_region_foreign_country_profile` 🆕 | table, clustered | date × region_code × country_name_fr | int_region_foreign_tourism_mix, dim_calendar | date, region_code, region_name, season, reference_year, accommodation_type, country_name_fr, nights_thousands, yoy_pct_change, pct_nonresident, country_share_of_nonresident, source_reliability |
| `fct_signal_accuracy_daily` 🆕 | table (schema `analytics`) | date × location_id × signal_type | fct_location_weather_forecast_snapshot, fct_location_weather_alerts_daily, fct_location_change_feed | date, location_id, signal_type, forecast_horizon_days, predicted/actual_value_code, predicted/actual_precipitation, predicted/actual_wind, predicted/actual_temp_max, accuracy_composite |
| `fct_trends_keywords` | incr. (uk: date,keyword_id,geo), part. date, clustered | date × keyword_id × geo | int_trends_keywords__dedup, stg_trends_keywords__plan | date, geo, keyword_id, category, keyword_text, interest_value, batch_id, retrieved_at |
| `test` / `test_fct` | default | **scratch/test — not production** | test → fct_foreign_tourism_context_daily | (ignore) |

---

## Dims layer (`dims.dim_*`)

| Model | Mat. | Grain | Upstream refs | Key columns |
|---|---|---|---|---|
| `dim_ai_context_location` | view | location_id | dim_client_company_profile, dim_client_location, dim_client_transit_proximity, geo_commune_to_region, **int_client_besttime_daily**, **int_client_offering_profile** | location_id, company_name, company_activity_type, location_type, event_time_profile, primary_audience_1/2, origin_city_id_1/2/3, origin_city_label_1 |
| `dim_audience_availability` | table | audience × day_type | audience_availability_base | audience, day_type, availability_score, delta_pct, source_note, rationale_fr |
| `dim_calendar` | table | date | stg_holidays_daily | date, year, quarter, month(_name), year_month, week_iso, dow_iso, is_weekend, is_holiday_fr, holiday_name_fr |
| `dim_calendar_region` | table | date × region_id | dim_calendar, src raw.school_vacations_periods, dim_holiday_zones | date, region_id, country_code, holiday_zone_code |
| `dim_city_to_region` | table | city_id | geo_commune_to_region, regions_map | city_id, region_code_insee/nuts2, department_id, location_uid, lat, lon, city_geo_point, active_flag |
| `dim_client_company_profile` | view | location_id | client_company_profile, int_client_website_profiles | location_id, company_name, company_activity_type, position, location_type, event_time_profile, primary_audience_1/2, origin_city_id_1/2/3, origin_city_labels |
| `dim_client_goal` 🆕 | table | goal | (static UNION ALL) | goal, goal_label_fr, goal_bucket, primary_kpi, primary_kpi_source, primary_kpi_is_live, serving_action_families |
| `dim_client_location` | table | location_id | client_fetch_points, int_client_website_profiles, communes_coords, city_map, geo_commune_to_region | location_id, location_label/type, active_flag, city_id_granular/commune, location_source, region_code_insee/nuts2, region_id/name |
| `dim_client_locations_weather` | view | location_id | dim_client_location | location_id, location_label, active_flag, lat, lon |
| `dim_client_transit_proximity` | table | location_id | int_client_website_profiles, dim_idf_transportation_stops, dim_idf_stops_lines | location_id, location_access_pattern, nearest_transit_stop(_id/_name/_distance_m), town_name, transit_network, nearest_transit_line_name |
| `dim_event_city_label` | view | location_uid | event_location_city_map | location_uid, city_id/name, region_code_insee, zip_code, source_system, active_flag, lat, lon, geo_point |
| `dim_holiday_zones` | table | region_id | src raw.school_vacations_periods | region_id, holiday_zone_code |
| `dim_idf_stops_lines` | table | route_id × stop_id | stg_idf_stops_lines_ref | route_id, stop_id, route_long_name, stop_name, stop_lon/lat, operator_name, short_name, mode, nom_commune, code_insee |
| `dim_idf_transportation_lines` | table | line_id | stg_idf_lines_referentiel | line_id/sk, group_id, line_name/short_name, transport_mode/submode, operator_id/name, network_name |
| `dim_idf_transportation_stops` | table | stop_id | stg_idf_stops_referentiel | stop_id/sk, stop_version, stop_name(_norm), stop_type, town_name, postal_region, accessibility, fare_zone, zda_id |
| `dim_longitude_latitude_cities` | table | city | longitude_latitude_cities, int_location_id_map | city, region, lat, lon, forecast_location_id_raw, distance_m |
| `dim_opportunity_thresholds` | view | candidate_date × location_id | fct_location_context_daily, opportunity_thresholds, opportunity_tourism_threshold_adjustments | candidate_date, location_id, horizon_bucket, regime_a/b_min_score_adj, medal_min_gap_score, threshold_source_scope/key, tourism_status_region |
| `dim_region` | table | region_id | regions_map | region_id, region_name, region_code_insee, lat, lon, geo_point |
| `geo_commune_to_region` | view | city_id | city_map, regions_map, departments_map, communes_coords | city_id, city_name, region_id/code_insee/name, department_id/name, location_uid, lat, lon, active_flag |

---

## Sources & staging (`staging.stg_*`) — lineage only

Thin views over `raw` / `raw_airbyte` / `raw_crawl` / `analytics` sources. Format: `model | mat | upstream (src:dataset.table or ref)`.

| Model | Mat | Upstream |
|---|---|---|
| `stg_action_log` | view | src:analytics.action_log |
| `stg_alerts` | view | src:raw.alerts |
| `stg_api_error_log` 🆕 | view | src:analytics.api_error_log |
| `stg_automation_rules` 🆕 | view | src:analytics.automation_rules |
| `stg_channel_configs` 🆕 | view | src:analytics.channel_configs |
| `stg_competitor_tracking` | view | src:raw_crawl.competitor_tracking |
| `stg_crawl_log` 🆕 | view | src:analytics.crawl_log |
| `stg_event_outcomes` | view | src:raw.event_outcomes |
| `stg_goal_state` 🆕 | view | src:analytics.goal_state |
| `stg_notification_preferences` | view | src:raw.notification_preferences |
| `stg_saved_drafts` 🆕 | view | src:analytics.saved_drafts |
| `stg_saved_item_dates` | view | src:raw.saved_item_dates |
| `stg_saved_item_snapshots` | view | src:raw.saved_item_snapshots |
| `stg_saved_items` | view | src:raw.saved_items |
| `stg_signal_confirmations` 🆕 | view | src:analytics.signal_confirmations |
| `stg_tracked_sources` | view | src:raw.tracked_sources |
| `stg_watched_events` | view | src:raw.watched_events |
| `legacy_stg_weather_forecast_10d` | view | src:raw.weather_forecast_10d |
| `stg_besttime_venues_filter` 🆕 | view | src:raw.besttime_foot_traffic, src:raw_airbyte.besttime_venues_filter |
| `stg_client_fetch_points` | view | client_fetch_points |
| `stg_client_transactions` 🆕 | view | src:raw.client_transactions |
| `stg_commercial_events_spans` | view | src:raw.commercial_events_spans |
| `stg_competitor_alerts` | view | src:raw_crawl.competitor_alerts |
| `stg_competitor_directory` | view | src:raw_crawl.competitor_directory |
| `stg_competitor_events` | view | src:raw_crawl.competitor_events |
| `stg_competitor_offering_history` 🆕 | view | src:raw_crawl.competitor_offering_history |
| `stg_competitor_snapshots` 🆕 | view | src:raw_crawl.competitor_snapshots |
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
| `stg_insee_flash_country_mix` 🆕 | view | src:raw.insee_flash_country_mix |
| `stg_insee_tourisme_capacite` 🆕 | view | src:raw_airbyte.ds_tour_cap |
| `stg_insee_tourisme_frequentation` 🆕 | view | src:raw_airbyte.ds_tour_freq |
| `stg_insee_tourisme_suivi_demande` 🆕 | view | src:raw_airbyte.ds_suivi_dde_tour |
| `stg_insight_event_user_location_profile` | view | src:raw.insight_event_user_location_profile |
| `stg_mega_events` | view | calendar_city_events_2026 |
| `stg_museum_visits_master` | view | src:raw.museum_visits_master |
| `stg_new_weather_forecast_10d` | view | src:raw_airbyte.new_weather_forecast_10d |
| `stg_nimes_2026_events_manual` | view | src:raw.raw_nimes_events_2026 |
| `stg_openholidays_foreign_holidays` 🆕 | view | src:raw.foreign_holidays |
| `stg_poi_categories_unified` | view | src:raw.poi_categories_unified |
| `stg_poi_classifications_unified` | view | src:raw.poi_classifications_unified |
| `stg_raw_agenda_occitanie` | view | src:raw_airbyte.raw_agenda_occitanie |
| `stg_raw_agenda_occitanie_musees` | view | — |
| `stg_raw_events_by_agenda_occitanie` | view | int_event_location_city_map, stg_raw_locations_by_agenda_occitanie, src:raw_airbyte.raw_events_by_agenda_occitanie |
| `stg_raw_events_paris` | view | src:raw_airbyte.raw_events_paris |
| `stg_raw_locations_by_agenda_occitanie` | view | src:raw_airbyte.raw_locations_by_agenda_occitanie |
| `stg_school_vacations_periods` | view | src:raw.school_vacations_periods |
| `stg_top_museum_attendance` | view | src:raw.top_museum_attendance |
| `stg_tourism_annual_idf_exhibitions_summary` | view | src:raw.tourism_annual_idf_exhibitions_summary |
| `stg_tourism_annual_idf_sites` | view | src:raw.tourism_annual_idf_sites |
| `stg_tourism_annual_national` | view | src:raw.tourism_annual_national |
| `stg_tourism_annual_sites_nonresident` | view | src:raw.tourism_annual_sites_nonresident |
| `stg_tourism_annual_sites_resident_nonresident` | view | src:raw.tourism_annual_sites_resident_nonresident |
| `stg_tourism_monthly_national` | view | src:raw.tourism_monthly_national |
| `stg_tourism_occupancy_monthly` | view | src:raw.tourism_occupancy_monthly |
| `stg_traffic_incidents` | view | src:raw_airbyte.road_traffic_incidents_{idf,occitanie,paca} |
| `stg_transportation_status_paris` | incremental | src:raw_airbyte.idf_traffic_info |
| `stg_trends_keywords` | view | src:raw.trends_keywords |
| `stg_trends_keywords__plan` | view | keyword_plan |
| `stg_uk_bank_holidays` 🆕 | view | src:raw.uk_bank_holidays |
| `stg_uk_school_holidays` 🆕 | view | uk_school_holidays_periods (seed) |
| `stg_watched_competitors` | view | src:raw_crawl.watched_competitors |
| `stg_weather_alerts_daily_all` | view | city_map, communes_coords, src:raw_airbyte.new_weather_forecast_10d |
| `stg_weather_history_daily` | view | src:raw.weather_history_daily |

---

## Intermediate (`intermediate.int_*`) — lineage only

App-activity chain (`int_user_*`, `int_publish_log`, `int_channel_performance`), sales chain (`int_client_daily_performance`, `int_client_offering_profile`), foot-traffic (`int_client_besttime_*`), foreign tourism (`int_openholidays_*`, `int_region_foreign_tourism_mix`) are new since May‑7.

| Model | Mat | Upstream |
|---|---|---|
| `int_channel_performance` 🆕 | view | src:raw.channel_performance_daily |
| `int_publish_log` 🆕 | view | src:analytics.publish_log |
| `int_user_active_goal` 🆕 | view | stg_goal_state |
| `int_user_activity_summary` 🆕 | table | stg_action_log, stg_saved_drafts, stg_signal_confirmations |
| `int_user_crawl_summary` 🆕 | view | stg_crawl_log |
| `int_user_error_summary` 🆕 | view | stg_api_error_log |
| `int_user_feedback_summary` 🆕 | view | stg_signal_confirmations |
| `int_user_profile_latest` 🆕 | view | stg_insight_event_user_location_profile |
| `int_airbyte_weather_forecast_inputs` | view | dim_client_locations_weather |
| `int_airbyte_weather_forecast_user_coords` | view | dim_client_locations_weather |
| `int_attendance_effects_daily` | view | dim_client_location, fct_location_weather_alerts_daily |
| `int_calendar_event_spans` | table | int_commercial_events_spans_union, stg_raw_events_by_agenda_occitanie, stg_raw_events_paris |
| `int_calendar_event_spans_enriched` | table | int_calendar_event_spans, int_event_industry_keywords_normalized |
| `int_client_besttime_daily` 🆕 | view | int_client_besttime_hourly |
| `int_client_besttime_hourly` 🆕 | view | int_client_website_profiles, stg_besttime_venues_filter |
| `int_client_competition_features_daily` | view | — |
| `int_client_daily_performance` 🆕 | incremental | stg_client_transactions |
| `int_client_distance_pairs` | view | dim_client_location |
| `int_client_fetch_points_geo` | view | regions_map, stg_client_fetch_points |
| `int_client_location_to_forecast_location` | view | dim_client_locations_weather, int_client_weather_forecast_location |
| `int_client_offering_profile` 🆕 | table | stg_client_transactions |
| `int_client_weather_alerts_daily` | table | dim_client_location, int_location_weather_daily_resolved, weather_impacts_coeffs |
| `int_client_weather_alerts_enriched` | view | dim_client_location, int_client_fetch_points_geo, int_client_weather_alerts_daily |
| `int_client_weather_daily_details` | view | int_location_weather_daily_resolved |
| `int_client_weather_forecast_location` | view | stg_new_weather_forecast_10d |
| `int_client_website_profiles` | view | city_map, geo_commune_to_region, stg_insight_event_user_location_profile |
| `int_commercial_events_daily` | view | geo_commune_to_region, int_commercial_events_spans_union |
| `int_commercial_events_spans_union` | view | stg_commercial_events_spans, stg_events_manual |
| `int_competitor_alerts` | table | fct_competitor_directory, fct_competitor_threat_profile, stg_competitor_alerts |
| `int_competitor_directory` | table | competitor_industry_profile_defaults, dim_event_city_label, int_events_industry_code_normalization, stg_competitor_directory, stg_watched_competitors |
| `int_competitor_events` | table | int_competitor_directory, int_events_industry_code_normalization, stg_competitor_events |
| `int_competitor_offering_changes` 🆕 | table | stg_competitor_offering_history |
| `int_competitor_snapshot_deltas` 🆕 | table | stg_competitor_snapshots |
| `int_competitor_threat_profile` | table | dim_client_company_profile, dim_client_location, fct_competitor_directory |
| `int_competitors_followed` 🆕 | view | int_competitor_directory, stg_watched_competitors |
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
| `int_openholidays_public_holidays_country_daily` 🆕 | table | int_openholidays_public_holidays_daily |
| `int_openholidays_public_holidays_daily` 🆕 | table | stg_openholidays_foreign_holidays, stg_uk_bank_holidays |
| `int_openholidays_school_coverage_country_daily` 🆕 | table | int_openholidays_school_holidays_daily, stg_openholidays_foreign_holidays |
| `int_openholidays_school_holidays_daily` 🆕 | table | stg_openholidays_foreign_holidays, stg_uk_school_holidays |
| `int_region_day_grid` | table | dim_calendar, dim_region |
| `int_region_foreign_tourism_mix` 🆕 | view | stg_insee_flash_country_mix, stg_insee_tourisme_frequentation |
| `int_region_opportunity_components_daily` | table | int_weather_region_daily__aligned |
| `int_school_holidays_region_daily` | view | departments_map, vacation_zones_france |
| `int_school_vacations_region_daily_named` | view | — |
| `int_site_visits_country_annual` | view | — |
| `int_tourism_country_monthly` | view | stg_tourism_occupancy_monthly |
| `int_tourism_region_daily` | view | int_commercial_events_daily, int_holidays_region_daily, int_region_day_grid, int_tourism_region_monthly |
| `int_tourism_region_daily__aligned` | view | dim_calendar, dim_region, int_tourism_region_daily |
| `int_tourism_region_monthly` | view | dim_region, region_hotel_occupancy_rate, stg_insee_tourisme_frequentation |
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
| `int_weather_calibration_profile` | view | stg_weather_alerts_daily_all |
| `int_weather_city_daily` | view | communes_coords, dim_calendar, geo_commune_to_region |
| `int_weather_evidence_catalog` | view | evidence_weight_matrix_v1 |
| `int_weather_evidence_features_daily` | table | dim_calendar, int_weather_calibration_profile, int_weather_region_alerts_daily, stg_weather_alerts_daily_all |
| `int_weather_hazard_impacts_daily` | table | int_weather_region_alerts_daily, weather_impacts_coeffs |
| `int_weather_history_daily` | view | stg_weather_history_daily |
| `int_weather_level_monotone_summary` | view | int_weather_evidence_features_daily |
| `int_weather_region_alert_levels_daily` | view | int_weather_hazard_impacts_daily, int_weather_region_alerts_daily, regions_map |
| `int_weather_region_alerts_daily` | view | stg_weather_alerts_daily_all |
| `int_weather_region_daily__aligned` | table | int_region_day_grid, int_weather_region_alert_levels_daily, int_weather_region_alerts_daily, regions_map |
| `legacy_int_commercial_events_region_daily_named` | view | — (legacy) |

---

## Truth B — live column catalog

- [`bq-catalog.json`](bq-catalog.json) — every table+view in `muse-square-open-data` (EU) with columns + types. 430 tables, 7445 columns. Snapshot 2026-07-09, dbt SHA `b5d8579`. Includes `analytics.b_sensitivity_store` (Type B store, app-write) with `period_start`/`period_end` (observation window).
- [`bq-catalog.allowlist.json`](bq-catalog.allowlist.json) — compact `dataset.table → [column names]` sidecar (allowlist for the `bq-guard` hook).
- Regenerate with [`refresh-bq-catalog.sh`](refresh-bq-catalog.sh). For any query, re-verify the exact column against live `INFORMATION_SCHEMA` via the `bq-verify` skill. Run BQ with `--location=EU`; always `DATE()`-cast.
