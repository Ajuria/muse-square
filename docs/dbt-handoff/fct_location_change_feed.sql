/*
  PATH
    models/ms_open_data/mart/fct_location_change_feed.sql

  MODEL
    fct_location_change_feed

  PURPOSE
    Feed déterministe des changements détectés quotidiennement par location.
    Produit une ligne par événement de changement détecté en comparant
    l'état du jour à l'état de la veille sur les signaux opérationnels clés.

    Tout l'enrichissement (détail événement, mobilité, concurrent,
    data_provenance) est intégré à l'écriture afin que les vues sémantiques
    downstream n'aient besoin d'aucune jointure supplémentaire.

        Seuils de détection (décisions métier) :
        score_change               : abs(delta) >= 3 points
        weather_change             : abs(delta alert_level) >= 2
        ranking_change             : abs(delta best_day_rank) >= 2
        competition_pressure_spike : franchissement des seuils 1.2 / 0.8
        weather_hazard_onset       : passage de ≤ 1 à ≥ 2 par dimension météo
        foot_traffic_surge         : abs(delta day_max) >= 15 pts (vs J-7)
        foot_traffic_peak_shift    : abs(delta peak_hour) >= 2h (vs J-7)
        competitor_review_surge    : delta_rating_count > 3
        competitor_review_drop     : delta_rating < -0.2
        competitor_content_spike   : blog_post_delta > 2
        competitor_content_silent  : blog_latest_age_days > 14
        competitor_audience_conflict : audience_overlap_score >= 6.7

  AUTHORITATIVE SOURCES (truth)
    - {{ ref('fct_location_context_features_daily') }}         -- score, baseline,
                                                                   ranking, competition
                                                                   pressure, weather hazard
    - {{ ref('fct_location_opportunity_score_daily') }}        -- regime, medal,
                                                                   mega_event flags
    - {{ ref('fct_location_opportunity_components_daily') }}   -- composants delta pour
                                                                   driver attribution
    - {{ ref('fct_location_events_topn_daily') }}              -- top_events_10km
                                                                   (event_new / removed)
    - {{ ref('fct_location_weather_alerts_daily') }}           -- alert_level_max
    - {{ ref('fct_location_context_daily') }}                  -- mobility_status_region,
                                                                   lvl_* weather detail
    - {{ ref('fct_location_impact_daily_calendar') }}          -- audience_availability_label
    - {{ ref('fct_competitor_events_conflicts') }}             -- événements concurrents
                                                                   (launch, ending, conflict)
    - {{ ref('fct_competitor_directory') }}                    -- competitor_name pour
                                                                   enrichissement libellé
    - {{ ref('fct_location_mobility_disruption_changes') }}    -- disruption changes
                                                                   (ongoing, resolved, planned)
    - {{ ref('fct_location_mobility_disruptions__union') }}    -- détail disruption
                                                                   pour mobility_resolved
    - {{ ref('fct_location_foot_traffic_daily') }}             -- foot traffic par
                                                                   jour de semaine (day_int)
    - {{ ref('dim_client_location') }}                         -- location_type
    - {{ ref('dim_client_transit_proximity') }}                -- transit lines + network
    - {{ ref('int_competitor_snapshot_deltas') }}              -- deltas snapshots concurrents
                                                                   (GBP, homepage, promo,
                                                                    sold_out, media, institution)

  OUTPUT GRAIN
    date × location_id × change_type × entity_id

  MATERIALIZATION
    Table incrémentale, schéma mart, partitionnée sur date.
    Fenêtre incrémentale : 14 jours. Full refresh : 365 jours.

  CHANGE TYPES GÉNÉRÉS
    Scoring :
      score_change, future_score_change, regime_change, medal_change,
      mega_event_activation, mega_event_end, baseline_validity_change

    Événements :
      event_new, event_removed

    Météo :
      weather_change, weather_hazard_onset

    Mobilité :
      mobility_change, mobility_disruption, mobility_disruption_resolved,
      mobility_disruption_planned

    Compétition :
      ranking_change, competition_pressure_spike, calendar_audience_shift,
      competitor_event_launch, competitor_event_ending,
      competitor_audience_conflict

    Foot traffic :
      foot_traffic_surge, foot_traffic_peak_shift, foot_traffic_ranking_change

    Snapshots concurrents :
      competitor_review_surge, competitor_review_drop, competitor_hours_change,
      competitor_new_offering, competitor_sold_out, competitor_content_spike,
      competitor_content_silent, institution_campaign_detected,
      media_mention_detected
*/

{{ config(
    materialized = 'incremental',
    incremental_strategy = 'insert_overwrite',
    schema = 'mart',
    partition_by = {'field': 'date', 'data_type': 'date'},
    cluster_by = ['location_id']
) }}

-- --------------------------------------------------
-- Source tables with required partition filters
-- --------------------------------------------------

with score_source as (

    select *
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

score_state_source as (

    select
        date,
        location_id,
        opportunity_regime,
        opportunity_medal,
        is_mega_event_flag,
        active_mega_event_name
    from {{ ref('fct_location_opportunity_score_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

components_source as (

    select
        date,
        location_id,
        delta_att_weather_total_pct,
        delta_att_events_pct,
        delta_att_mobility_effective_pct,
        delta_att_calendar_pct

    from {{ ref('fct_location_opportunity_components_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

components_change as (

    select

        date,
        location_id,

        delta_att_weather_total_pct
          - lag(delta_att_weather_total_pct)
            over(partition by location_id order by date)
          as weather_delta_change,

        delta_att_events_pct
          - lag(delta_att_events_pct)
            over(partition by location_id order by date)
          as events_delta_change,

        delta_att_mobility_effective_pct
          - lag(delta_att_mobility_effective_pct)
            over(partition by location_id order by date)
          as mobility_delta_change,

        delta_att_calendar_pct
          - lag(delta_att_calendar_pct)
            over(partition by location_id order by date)
          as calendar_delta_change

    from components_source

),

driver_attribution as (

select

    date,
    location_id,

    case
        when abs(weather_delta_change) >= abs(events_delta_change)
         and abs(weather_delta_change) >= abs(mobility_delta_change)
         and abs(weather_delta_change) >= abs(calendar_delta_change)
        then 'weather'

        when abs(events_delta_change) >= abs(mobility_delta_change)
         and abs(events_delta_change) >= abs(calendar_delta_change)
        then 'events'

        when abs(mobility_delta_change) >= abs(calendar_delta_change)
        then 'mobility'

        else 'calendar'
    end as driver_type,

    greatest(
        abs(weather_delta_change),
        abs(events_delta_change),
        abs(mobility_delta_change),
        abs(calendar_delta_change)
    ) as driver_delta

from components_change

),

events_source as (

    select *
    from {{ ref('fct_location_events_topn_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

weather_detail_source as (

    select
        date,
        location_id,
        lvl_rain,
        lvl_wind,
        lvl_snow,
        lvl_heat,
        lvl_cold,
        mobility_status_region,
        mobility_disruption_flag_region
    from {{ ref('fct_location_context_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

location_meta as (

    select
        l.location_id,
        l.location_type,
        t.nearest_transit_line_name,
        t.transit_network
    from {{ ref('dim_client_location') }} l
    left join {{ ref('dim_client_transit_proximity') }} t
        on l.location_id = t.location_id

),

event_detail_source as (

    select
        ev.date,
        ev.location_id,
        e.event_uid,
        e.event_label,
        e.city_name,
        e.distance_m,
        e.radius_bucket,
        e.industry_code,
        e.theme,
        e.description,
        e.event_venue_name,
        e.event_venue_address,
        e.data_provenance
    from {{ ref('fct_location_events_topn_daily') }} ev
    cross join unnest(ev.top_events_10km) e
    where ev.date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}

),

-- --------------------------------------------------
-- Score change detection
-- --------------------------------------------------

score_changes as (

    select
        date,
        location_id,

        case
            when date > current_date()
            then 'future_score_change'
            else 'score_change'
        end as change_type,

        cast(null as string) as entity_id,
        cast(opportunity_score_final_local as string) as new_value,

        cast(
            lag(opportunity_score_final_local)
            over(partition by location_id order by date)
            as string
        ) as old_value

    from score_source

),

regime_changes as (

    select
        date,
        location_id,
        'regime_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(opportunity_regime) over(partition by location_id order by date) as string) as old_value,
        cast(opportunity_regime as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from score_state_source

),

regime_feed as (
    select * from regime_changes
    where old_value is not null and new_value != old_value
),

medal_changes as (

    select
        date,
        location_id,
        'medal_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(opportunity_medal) over(partition by location_id order by date) as string) as old_value,
        cast(opportunity_medal as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from score_state_source

),

medal_feed as (
    select * from medal_changes
    where old_value is not null and new_value != old_value
),

mega_event_changes as (
    select
        date, location_id,
        lag(is_mega_event_flag) over(partition by location_id order by date) as old_flag,
        is_mega_event_flag as new_flag,
        active_mega_event_name,
        lag(active_mega_event_name) over(partition by location_id order by date) as prev_mega_event_name
    from score_state_source
),

mega_event_activation as (
    select
        mc.date, mc.location_id,
        'mega_event_activation' as change_type,
        cast(null as string) as entity_id,
        cast(mc.old_flag as string) as old_value,
        coalesce(mc.active_mega_event_name, cast(mc.new_flag as string)) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from mega_event_changes mc
    where mc.old_flag = false and mc.new_flag = true
),

mega_event_end as (
    select
        date, location_id,
        'mega_event_end' as change_type,
        cast(null as string) as entity_id,
        cast(old_flag as string) as old_value,
        coalesce(prev_mega_event_name, cast(new_flag as string)) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from mega_event_changes
    where old_flag = true and new_flag = false
),

score_feed as (
    select
        sc.date, sc.location_id, change_type, entity_id, old_value, new_value,
        cast(new_value as int64) - cast(old_value as int64) as score_delta,
        d.driver_type, d.driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from score_changes sc
    left join driver_attribution d
      on sc.date = d.date and sc.location_id = d.location_id
    where old_value is not null
      and new_value != old_value
      and abs(cast(new_value as int64) - cast(old_value as int64)) >= 3
),

baseline_changes as (
    select
        date, location_id,
        'baseline_validity_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(has_valid_baseline_flag) over(partition by location_id order by date) as string) as old_value,
        cast(has_valid_baseline_flag as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

baseline_feed as (
    select * from baseline_changes
    where old_value is not null and new_value != old_value
),

-- --------------------------------------------------
-- Weather & Mobility changes
-- --------------------------------------------------

weather_source as (
    select date, location_id, alert_level_max
    from {{ ref('fct_location_weather_alerts_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

weather_changes as (
    select
        date, location_id,
        'weather_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(alert_level_max) over(partition by location_id order by date) as string) as old_value,
        cast(alert_level_max as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from weather_source
),

weather_feed as (
    select * from weather_changes
    where old_value is not null and new_value != old_value
      and abs(safe_cast(new_value as int64) - safe_cast(old_value as int64)) >= 2
),

mobility_changes as (
    select
        date, location_id,
        'mobility_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(mobility_status_region) over(partition by location_id order by date) as string) as old_value,
        cast(mobility_status_region as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from {{ ref('fct_location_context_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

mobility_feed as (
    select * from mobility_changes
    where old_value is not null and new_value != old_value
),

-- --------------------------------------------------
-- Ranking changes
-- --------------------------------------------------

ranking_changes as (
    select
        date, location_id,
        'ranking_change' as change_type,
        cast(null as string) as entity_id,
        cast(lag(best_day_rank) over(partition by location_id order by date) as string) as old_value,
        cast(best_day_rank as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

ranking_feed as (
    select * from ranking_changes
    where old_value is not null and new_value != old_value
      and abs(safe_cast(new_value as int64) - safe_cast(old_value as int64)) >= 2
),

-- --------------------------------------------------
-- Event extraction
-- --------------------------------------------------

events_today as (
    select date, location_id, e.event_uid, e.event_label
    from events_source, unnest(top_events_10km) e
),

events_yesterday as (
    select date_add(date, interval 1 day) as date, location_id, e.event_uid, e.event_label
    from events_source, unnest(top_events_10km) e
),

event_new as (
    select
        t.date, t.location_id,
        'event_new' as change_type,
        t.event_uid as entity_id,
        cast(null as string) as old_value,
        t.event_label as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from events_today t
    left join events_yesterday y
      on t.location_id = y.location_id and t.event_uid = y.event_uid and t.date = y.date
    where y.event_uid is null
),

event_removed as (
    select
        y.date, y.location_id,
        'event_removed' as change_type,
        y.event_uid as entity_id,
        y.event_label as old_value,
        cast(null as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from events_yesterday y
    left join events_today t
      on t.location_id = y.location_id and t.event_uid = y.event_uid and t.date = y.date
    where t.event_uid is null
),

-- --------------------------------------------------
-- Mobility disruption changes
-- --------------------------------------------------

mobility_disruption_source as (
    select
        comparison_date as date, current_disruption_date, location_id,
        disruption_event_id, change_reason, title_merged, severity,
        perturbation_lvl, perturbation_lvl_yesterday, distance_meters,
        mode, disruption_category, nom_commune
    from {{ ref('fct_location_mobility_disruption_changes') }}
    where comparison_date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
      and changes_from_yesterday = true
      and change_reason = 'new_disruption'
),

mobility_disruption_feed as (
    select
        date, location_id, change_type, entity_id, old_value, new_value,
        score_delta, driver_type, driver_delta,
        enriched_mode, enriched_disruption_category, enriched_distance_m, enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'mobility_disruption' as enriched_data_provenance
    from (
        select
            coalesce(current_disruption_date, date) as date, location_id,
            'mobility_disruption' as change_type,
            disruption_event_id as entity_id,
            cast(perturbation_lvl_yesterday as string) as old_value,
            cast(perturbation_lvl as string) as new_value,
            cast(null as int64) as score_delta,
            cast(null as string) as driver_type,
            cast(null as float64) as driver_delta,
            mode as enriched_mode,
            disruption_category as enriched_disruption_category,
            distance_meters as enriched_distance_m,
            nom_commune as enriched_city_name,
            row_number() over (
                partition by location_id, coalesce(current_disruption_date, date)
                order by severity desc, distance_meters asc
            ) as rn
        from mobility_disruption_source
    )
    where rn = 1
),

competition_pressure_source as (
    select
        date, location_id, comp_nearby_weighted, baseline_comp_avg, has_valid_baseline_flag,
        case when has_valid_baseline_flag and baseline_comp_avg > 0
            then comp_nearby_weighted / baseline_comp_avg else null
        end as pressure_ratio,
        lag(case when has_valid_baseline_flag and baseline_comp_avg > 0
            then comp_nearby_weighted / baseline_comp_avg else null end
        ) over (partition by location_id order by date) as prev_pressure_ratio
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

competition_pressure_feed as (
    select
        date, location_id,
        'competition_pressure_spike' as change_type,
        cast(null as string) as entity_id,
        cast(round(prev_pressure_ratio, 2) as string) as old_value,
        cast(round(pressure_ratio, 2) as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from competition_pressure_source
    where prev_pressure_ratio is not null and pressure_ratio is not null
      and ((pressure_ratio >= 1.2 and prev_pressure_ratio < 1.2)
        or (pressure_ratio < 0.8 and prev_pressure_ratio >= 0.8)
        or (pressure_ratio < 1.2 and prev_pressure_ratio >= 1.2)
        or (pressure_ratio >= 0.8 and prev_pressure_ratio < 0.8))
),

foot_traffic_source as (
    select
        s.date,
        s.location_id,
        ft.day_max as ft_day_max,
        ft.day_mean as ft_day_mean,
        ft.peak_hour as ft_peak_hour,
        ft.day_rank_max as ft_day_rank_max,
        lag(ft.day_max, 7) over (partition by s.location_id order by s.date) as prev_ft_day_max,
        lag(ft.peak_hour, 7) over (partition by s.location_id order by s.date) as prev_ft_peak_hour,
        lag(ft.day_rank_max, 7) over (partition by s.location_id order by s.date) as prev_ft_day_rank_max
    from {{ ref('fct_location_context_features_daily') }} s
    inner join {{ ref('fct_location_foot_traffic_daily') }} ft
        on s.location_id = ft.location_id
       and mod(extract(dayofweek from s.date) + 5, 7) = ft.day_int
    where s.date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
      and ft.day_max is not null
),

foot_traffic_surge_feed as (
    select
        date, location_id,
        'foot_traffic_surge' as change_type,
        cast(null as string) as entity_id,
        cast(prev_ft_day_max as string) as old_value,
        cast(ft_day_max as string) as new_value,
        cast(ft_day_max - prev_ft_day_max as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from foot_traffic_source
    where prev_ft_day_max is not null
      and abs(ft_day_max - prev_ft_day_max) >= 15
),

foot_traffic_peak_shift_feed as (
    select
        date, location_id,
        'foot_traffic_peak_shift' as change_type,
        cast(null as string) as entity_id,
        cast(prev_ft_peak_hour as string) as old_value,
        cast(ft_peak_hour as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from foot_traffic_source
    where prev_ft_peak_hour is not null
      and abs(ft_peak_hour - prev_ft_peak_hour) >= 2
),

foot_traffic_ranking_feed as (
    select
        date, location_id,
        'foot_traffic_ranking_change' as change_type,
        cast(null as string) as entity_id,
        cast(prev_ft_day_rank_max as string) as old_value,
        cast(ft_day_rank_max as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from foot_traffic_source
    where prev_ft_day_rank_max is not null
      and ft_day_rank_max != prev_ft_day_rank_max
),

calendar_audience_source as (
    select
        date, location_id, audience_availability_label,
        lag(audience_availability_label) over (partition by location_id order by date) as prev_audience_label
    from {{ ref('fct_location_impact_daily_calendar') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

calendar_audience_feed as (
    select
        cas.date, cas.location_id,
        'calendar_audience_shift' as change_type,
        cast(null as string) as entity_id,
        cas.prev_audience_label as old_value,
        cas.audience_availability_label as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        cast(null as string) as enriched_data_provenance
    from calendar_audience_source cas
    left join score_source ss
        on cas.date = ss.date and cas.location_id = ss.location_id
    where cas.prev_audience_label is not null
      and cas.audience_availability_label != cas.prev_audience_label
),

-- --------------------------------------------------
-- Competitor CTEs (with enrichment baked in)
-- --------------------------------------------------

competitor_event_new as (
    select
        cf.event_date as date, cf.location_id,
        'event_new' as change_type,
        cf.competitor_event_id as entity_id,
        cast(null as string) as old_value,
        concat(coalesce(cd.competitor_name, ''), ' — ', coalesce(cf.event_name, '')) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(cf.distance_from_location_m as float64) as enriched_distance_m,
        cf.event_city as enriched_city_name,
        case
            when cf.distance_from_location_m <= 500 then '500m'
            when cf.distance_from_location_m <= 1000 then '1km'
            when cf.distance_from_location_m <= 5000 then '5km'
            when cf.distance_from_location_m <= 10000 then '10km'
            else '50km'
        end as enriched_radius_bucket,
        cf.event_industry_code as enriched_industry_code,
        cf.description as enriched_description,
        cf.venue_name as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_crawl' as enriched_data_provenance
    from {{ ref('fct_competitor_events_conflicts') }} cf
    left join {{ ref('fct_competitor_directory') }} cd
        on cf.competitor_id = cd.competitor_id
    where cf.event_date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
    qualify row_number() over (
        partition by cf.location_id, cf.competitor_id, cf.event_date, cf.event_name
        order by cf.event_date asc
    ) = 1
),

competitor_event_launch as (
    select
        cf.event_date as date, cf.location_id,
        'competitor_event_launch' as change_type,
        cf.competitor_event_id as entity_id,
        cast(null as string) as old_value,
        concat(coalesce(cd.competitor_name, ''), ' — ', coalesce(cf.event_name, '')) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(cf.distance_from_location_m as float64) as enriched_distance_m,
        cf.event_city as enriched_city_name,
        case
            when cf.distance_from_location_m <= 500 then '500m'
            when cf.distance_from_location_m <= 1000 then '1km'
            when cf.distance_from_location_m <= 5000 then '5km'
            when cf.distance_from_location_m <= 10000 then '10km'
            else '50km'
        end as enriched_radius_bucket,
        cf.event_industry_code as enriched_industry_code,
        cf.description as enriched_description,
        cf.venue_name as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_crawl' as enriched_data_provenance
    from {{ ref('fct_competitor_events_conflicts') }} cf
    left join {{ ref('fct_competitor_directory') }} cd
        on cf.competitor_id = cd.competitor_id
    where cf.event_date between current_date() and date_add(current_date(), interval 14 day)
    qualify row_number() over (
        partition by cf.location_id, cf.competitor_event_id
        order by cf.crawled_at desc
    ) = 1
),

competitor_event_ending as (
    select
        cf.event_date_end as date, cf.location_id,
        'competitor_event_ending' as change_type,
        cf.competitor_event_id as entity_id,
        cast(null as string) as old_value,
        concat(coalesce(cd.competitor_name, ''), ' — ', coalesce(cf.event_name, '')) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(cf.distance_from_location_m as float64) as enriched_distance_m,
        cf.event_city as enriched_city_name,
        case
            when cf.distance_from_location_m <= 500 then '500m'
            when cf.distance_from_location_m <= 1000 then '1km'
            when cf.distance_from_location_m <= 5000 then '5km'
            when cf.distance_from_location_m <= 10000 then '10km'
            else '50km'
        end as enriched_radius_bucket,
        cf.event_industry_code as enriched_industry_code,
        cf.description as enriched_description,
        cf.venue_name as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_crawl' as enriched_data_provenance
    from {{ ref('fct_competitor_events_conflicts') }} cf
    left join {{ ref('fct_competitor_directory') }} cd
        on cf.competitor_id = cd.competitor_id
    where cf.event_date_end is not null
      and cf.event_date_end between current_date() and date_add(current_date(), interval 14 day)
    qualify row_number() over (
        partition by cf.location_id, cf.competitor_event_id
        order by cf.crawled_at desc
    ) = 1
),

competitor_audience_conflict as (
    select
        cf.event_date as date, cf.location_id,
        'competitor_audience_conflict' as change_type,
        cf.competitor_event_id as entity_id,
        cast(round(cf.audience_overlap_score, 1) as string) as old_value,
        concat(coalesce(cd.competitor_name, ''), ' — ', coalesce(cf.event_name, '')) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(cf.distance_from_location_m as float64) as enriched_distance_m,
        cf.event_city as enriched_city_name,
        case
            when cf.distance_from_location_m <= 500 then '500m'
            when cf.distance_from_location_m <= 1000 then '1km'
            when cf.distance_from_location_m <= 5000 then '5km'
            when cf.distance_from_location_m <= 10000 then '10km'
            else '50km'
        end as enriched_radius_bucket,
        cf.event_industry_code as enriched_industry_code,
        cf.description as enriched_description,
        cf.venue_name as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_crawl' as enriched_data_provenance
    from {{ ref('fct_competitor_events_conflicts') }} cf
    left join {{ ref('fct_competitor_directory') }} cd
        on cf.competitor_id = cd.competitor_id
    where cf.audience_overlap_score >= 6.7
      and cf.distance_flag = true
      and cf.date_conflict = true
      and cf.event_date >= current_date()
    qualify row_number() over (
        partition by cf.location_id, cf.competitor_event_id
        order by cf.crawled_at desc
    ) = 1
),

-- --------------------------------------------------
-- Mobility disruption resolved / planned
-- --------------------------------------------------

mobility_disruption_resolved as (
    select
        dc.comparison_date as date, dc.location_id,
        'mobility_disruption_resolved' as change_type,
        dc.disruption_event_id as entity_id,
        dc.title_merged as old_value,
        cast(null as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        du.mode as enriched_mode,
        du.disruption_category as enriched_disruption_category,
        du.distance_meters as enriched_distance_m,
        du.nom_commune as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'mobility_disruption' as enriched_data_provenance
    from {{ ref('fct_location_mobility_disruption_changes') }} dc
    left join {{ ref('fct_location_mobility_disruptions__union') }} du
        on du.disruption_event_id = dc.disruption_event_id
       and du.location_id = dc.location_id
    where dc.change_reason = 'disruption_resolved'
      and dc.comparison_date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
    qualify row_number() over (
        partition by dc.location_id, dc.disruption_event_id, dc.comparison_date
        order by du.disruption_date desc
    ) = 1
),

mobility_disruption_planned as (
    select
        date(dc.disruption_begin_ts) as date, dc.location_id,
        'mobility_disruption_planned' as change_type,
        dc.disruption_event_id as entity_id,
        cast(null as string) as old_value,
        dc.title_merged as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        dc.mode as enriched_mode,
        dc.disruption_category as enriched_disruption_category,
        dc.distance_meters as enriched_distance_m,
        dc.nom_commune as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'mobility_disruption' as enriched_data_provenance
    from {{ ref('fct_location_mobility_disruption_changes') }} dc
    where dc.is_planned_flag = true
      and dc.change_reason = 'new_disruption'
      and dc.disruption_begin_ts >= current_timestamp()
      and dc.disruption_begin_ts <= timestamp_add(current_timestamp(), interval 7 day)
      and dc.comparison_date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

-- --------------------------------------------------
-- Weather hazard onset
-- --------------------------------------------------

weather_hazard_source as (
    select
        date, location_id,
        lvl_rain, lvl_wind, lvl_snow, lvl_heat, lvl_cold,
        lag(lvl_rain) over (partition by location_id order by date) as prev_rain,
        lag(lvl_wind) over (partition by location_id order by date) as prev_wind,
        lag(lvl_snow) over (partition by location_id order by date) as prev_snow,
        lag(lvl_heat) over (partition by location_id order by date) as prev_heat,
        lag(lvl_cold) over (partition by location_id order by date) as prev_cold
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

weather_hazard_feed as (
    select date, location_id, 'weather_hazard_onset' as change_type, cast(null as string) as entity_id,
        cast(prev_rain as string) as old_value, concat('rain:', cast(lvl_rain as string)) as new_value,
        cast(null as int64) as score_delta, cast(null as string) as driver_type, cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode, cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m, cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket, cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description, cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address, cast(null as string) as enriched_data_provenance
    from weather_hazard_source where prev_rain <= 1 and lvl_rain >= 2
    union all
    select date, location_id, 'weather_hazard_onset', cast(null as string),
        cast(prev_wind as string), concat('wind:', cast(lvl_wind as string)),
        cast(null as int64), cast(null as string), cast(null as float64),
        cast(null as string), cast(null as string), cast(null as float64), cast(null as string),
        cast(null as string), cast(null as string), cast(null as string), cast(null as string),
        cast(null as string), cast(null as string)
    from weather_hazard_source where prev_wind <= 1 and lvl_wind >= 2
    union all
    select date, location_id, 'weather_hazard_onset', cast(null as string),
        cast(prev_snow as string), concat('snow:', cast(lvl_snow as string)),
        cast(null as int64), cast(null as string), cast(null as float64),
        cast(null as string), cast(null as string), cast(null as float64), cast(null as string),
        cast(null as string), cast(null as string), cast(null as string), cast(null as string),
        cast(null as string), cast(null as string)
    from weather_hazard_source where prev_snow <= 1 and lvl_snow >= 2
    union all
    select date, location_id, 'weather_hazard_onset', cast(null as string),
        cast(prev_heat as string), concat('heat:', cast(lvl_heat as string)),
        cast(null as int64), cast(null as string), cast(null as float64),
        cast(null as string), cast(null as string), cast(null as float64), cast(null as string),
        cast(null as string), cast(null as string), cast(null as string), cast(null as string),
        cast(null as string), cast(null as string)
    from weather_hazard_source where prev_heat <= 1 and lvl_heat >= 2
    union all
    select date, location_id, 'weather_hazard_onset', cast(null as string),
        cast(prev_cold as string), concat('cold:', cast(lvl_cold as string)),
        cast(null as int64), cast(null as string), cast(null as float64),
        cast(null as string), cast(null as string), cast(null as float64), cast(null as string),
        cast(null as string), cast(null as string), cast(null as string), cast(null as string),
        cast(null as string), cast(null as string)
    from weather_hazard_source where prev_cold <= 1 and lvl_cold >= 2
),

-- --------------------------------------------------
-- Competitor snapshot delta signals (Task 1.6)
-- --------------------------------------------------

snapshot_delta_source as (
    select *
    from {{ ref('int_competitor_snapshot_deltas') }}
),

competitor_review_surge_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_review_surge' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_google_rating_count as string) as old_value,
        cast(d.google_rating_count as string) as new_value,
        cast(d.delta_rating_count as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.snapshot_source = 'gbp'
      and d.delta_rating_count > 3
),

competitor_review_drop_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_review_drop' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_google_rating as string) as old_value,
        cast(d.google_rating as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.snapshot_source = 'gbp'
      and d.delta_rating < -0.2
),

competitor_hours_change_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_hours_change' as change_type,
        d.competitor_id as entity_id,
        -- 23/08 : horaires en clair (periods GBP), plus les hash — la carte rend le jour qui change.
        coalesce(d.prev_hours_periods_json, d.prev_google_hours_hash) as old_value,
        coalesce(d.hours_periods_json, d.google_hours_hash) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.snapshot_source = 'gbp'
      and d.hours_changed = true
),

competitor_new_offering_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_new_offering' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_has_promo as string) as old_value,
        coalesce(d.promo_summary, 'Nouvelle offre détectée') as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        d.promo_summary as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.promo_changed = true
),

competitor_sold_out_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_sold_out' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_has_sold_out as string) as old_value,
        coalesce(d.sold_out_summary, 'Complet détecté') as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        d.sold_out_summary as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.sold_out_changed = true
),

competitor_content_spike_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_content_spike' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_blog_post_count as string) as old_value,
        cast(d.blog_post_count as string) as new_value,
        cast(d.blog_post_delta as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        d.blog_latest_title as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.snapshot_source = 'homepage'
      and d.blog_post_delta > 2
),

competitor_content_silent_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'competitor_content_silent' as change_type,
        d.competitor_id as entity_id,
        cast(d.blog_latest_date as string) as old_value,
        cast(d.blog_latest_age_days as string) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        cast(null as string) as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.snapshot_source = 'homepage'
      and d.blog_latest_age_days > 14
),

institution_campaign_detected_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'institution_campaign_detected' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_has_promo as string) as old_value,
        coalesce(d.promo_summary, 'Campagne institutionnelle d\u00e9tect\u00e9e') as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        d.promo_summary as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.entity_type = 'institution'
      and d.promo_changed = true
),

media_mention_detected_feed as (
    select
        d.snapshot_date as date, d.location_id,
        'media_mention_detected' as change_type,
        d.competitor_id as entity_id,
        cast(d.prev_blog_post_count as string) as old_value,
        coalesce(d.blog_latest_title, 'Nouvel article d\u00e9tect\u00e9') as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(null as float64) as enriched_distance_m,
        cast(null as string) as enriched_city_name,
        cast(null as string) as enriched_radius_bucket,
        cast(null as string) as enriched_industry_code,
        d.blog_latest_title as enriched_description,
        cast(null as string) as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_snapshot' as enriched_data_provenance
    from snapshot_delta_source d
    where d.entity_type = 'media'
      and d.blog_post_delta > 0
),

score_driver_source as (
    select date, location_id, primary_score_driver_label
    from {{ ref('fct_location_context_features_daily') }}
    where date >= {% if is_incremental() %}date_sub(current_date(), interval 14 day){% else %}date_sub(current_date(), interval 365 day){% endif %}
),

-- --------------------------------------------------
-- Final feed
-- --------------------------------------------------
all_feed as (

    select * from score_feed
    union all select * from regime_feed
    union all select * from medal_feed
    union all select * from mega_event_activation
    union all select * from mega_event_end
    union all select * from baseline_feed
    union all select * from event_new
    union all select * from event_removed
    union all select * from weather_feed
    union all select * from mobility_feed
    union all select * from ranking_feed
    union all select * from mobility_disruption_feed
    union all select * from competitor_event_new
    union all select * from competition_pressure_feed
    union all select * from calendar_audience_feed
    union all select * from competitor_event_launch
    union all select * from competitor_event_ending
    union all select * from competitor_audience_conflict
    union all select * from mobility_disruption_resolved
    union all select * from mobility_disruption_planned
    union all select * from weather_hazard_feed
    union all select * from foot_traffic_surge_feed
    union all select * from foot_traffic_peak_shift_feed
    union all select * from foot_traffic_ranking_feed
    union all select * from competitor_review_surge_feed
    union all select * from competitor_review_drop_feed
    union all select * from competitor_hours_change_feed
    union all select * from competitor_new_offering_feed
    union all select * from competitor_sold_out_feed
    union all select * from competitor_content_spike_feed
    union all select * from competitor_content_silent_feed
    union all select * from institution_campaign_detected_feed
    union all select * from media_mention_detected_feed

)

select
    f.date,
    f.location_id,
    f.change_type,
    f.entity_id,
    f.old_value,
    f.new_value,
    f.score_delta,
    f.driver_type,
    f.driver_delta,

    -- Weather detail
    coalesce(wd.lvl_rain,  0) as lvl_rain,
    coalesce(wd.lvl_wind,  0) as lvl_wind,
    coalesce(wd.lvl_snow,  0) as lvl_snow,
    coalesce(wd.lvl_heat,  0) as lvl_heat,
    coalesce(wd.lvl_cold,  0) as lvl_cold,
    wd.mobility_status_region,
    wd.mobility_disruption_flag_region,

    -- Location + transit meta
    lm.location_type,
    lm.nearest_transit_line_name,
    lm.transit_network,

    -- Event enrichment (baked in at write time, with yesterday fallback for removed events)
    case
        when f.change_type in (
            'score_change', 'future_score_change',
            'regime_change', 'medal_change',
            'ranking_change', 'weather_change', 'weather_hazard_onset',
            'mobility_change', 'baseline_validity_change',
            'competition_pressure_spike', 'calendar_audience_shift',
            'foot_traffic_surge', 'foot_traffic_peak_shift', 'foot_traffic_ranking_change'
        ) then null
        when f.change_type in ('mega_event_activation', 'mega_event_end')
        then coalesce(ed.event_label, ed_yesterday.event_label)
        else coalesce(ed.event_label, ed_yesterday.event_label, f.new_value)
    end as enriched_event_label,
    coalesce(ed.city_name, ed_yesterday.city_name, f.enriched_city_name) as enriched_event_city_name,
    coalesce(ed.distance_m, ed_yesterday.distance_m, f.enriched_distance_m) as enriched_distance_m,
    coalesce(ed.radius_bucket, ed_yesterday.radius_bucket, f.enriched_radius_bucket) as enriched_radius_bucket,
    coalesce(ed.industry_code, ed_yesterday.industry_code, f.enriched_industry_code) as enriched_industry_code,
    coalesce(ed.theme, ed_yesterday.theme) as enriched_theme,
    coalesce(ed.description, ed_yesterday.description, f.enriched_description) as enriched_description,
    coalesce(ed.event_venue_name, ed_yesterday.event_venue_name, f.enriched_venue_name) as event_venue_name,
    coalesce(ed.event_venue_address, ed_yesterday.event_venue_address, f.enriched_venue_address) as event_venue_address,
    coalesce(ed.data_provenance, ed_yesterday.data_provenance, f.enriched_data_provenance) as enriched_data_provenance,

    -- Mobility enrichment (baked in at write time)
    f.enriched_mode,
    f.enriched_disruption_category,
    f.enriched_city_name as enriched_mobility_city_name,

    -- Score driver label (French, only for score changes)
    case
        when f.change_type in ('score_change', 'future_score_change')
            then sdr.primary_score_driver_label
        else null
    end as score_driver_label

from all_feed f

left join weather_detail_source wd
    on wd.date = f.date and wd.location_id = f.location_id

inner join location_meta lm
    on lm.location_id = f.location_id

left join event_detail_source ed
    on ed.date = f.date and ed.location_id = f.location_id and ed.event_uid = f.entity_id

left join event_detail_source ed_yesterday
    on ed_yesterday.date = date_sub(f.date, interval 1 day)
   and ed_yesterday.location_id = f.location_id
   and ed_yesterday.event_uid = f.entity_id

left join score_driver_source sdr
    on sdr.date = f.date
   and sdr.location_id = f.location_id