/*
  Model: int_competitor_snapshot_deltas
  Layer: intermediate
  Goal: Day-over-day deltas per competitor × source, as a JOURNAL over the feed's
        own 14-day window (one row per competitor × source × snapshot day, compared
        to the previous snapshot day). Produces delta columns for rating, hours,
        promo, sold-out, and blog signals. Used downstream by fct_location_change_feed
        to generate 9 change_subtype feed items.
  WHY A JOURNAL (23/08): the previous shape kept ONE state (latest vs previous).
        A change was visible only if the 07:01 build ran the very day it appeared.
        The build skips Sundays (16/08, 23/08 absent) -> a Sunday change was lost for
        good, and over 81 days of snapshots 6 real GBP hours changes (5 competitors)
        never reached the feed. Same defect as the 12-hour window of
        int_competitor_offering_changes, fixed 23/08. The 14-day window matches the
        feed's `date >= current_date - 14` recomputation, so its insert_overwrite
        partitions are the ones it rewrites anyway.
  Sources:
    - {{ ref('stg_competitor_snapshots') }}
  Grain: competitor_id × source × snapshot_date (last 14 days, + the day before for the lag)
  Output schema: intermediate
  Materialization: table
  Clustering: competitor_id
*/

{{
  config(
    materialized = 'table',
    schema = 'intermediate',
    cluster_by = ['competitor_id']
  )
}}

-- The snapshot cron writes the SAME row twice per day (~4 s apart, identical values). Collapse to
-- ONE row per competitor × source × DAY first (keep the last write of the day) so the comparison
-- is day-over-day, as the declared grain intends.
with snapshots_daily as (
  select * except (rn_day)
  from (
    select
      *,
      row_number() over (
        partition by competitor_id, snapshot_source, snapshot_date
        order by created_at desc, snapshot_id desc
      ) as rn_day
    from {{ ref('stg_competitor_snapshots') }}
    -- 14-day journal + up to 30 days before it so the first day of the window still has a
    -- "previous" snapshot (crawls are not daily for every competitor).
    where snapshot_date >= date_sub(current_date(), interval 44 day)
  )
  where rn_day = 1
),

-- Previous snapshot DAY for the same competitor × source (LAG over the collapsed days).
with_previous as (
  select
    c.*,
    lag(c.snapshot_date)        over w as prev_snapshot_date,
    lag(c.google_rating)        over w as prev_google_rating,
    lag(c.google_rating_count)  over w as prev_google_rating_count,
    lag(c.google_hours_hash)    over w as prev_google_hours_hash,
    -- Horaires en clair (GBP regularOpeningHours.periods) : la carte compare jour par jour.
    json_query(c.raw_extraction_json, '$.regularOpeningHours.periods')                 as hours_periods_json,
    lag(json_query(c.raw_extraction_json, '$.regularOpeningHours.periods')) over w     as prev_hours_periods_json,
    lag(c.has_promo)            over w as prev_has_promo,
    lag(c.has_sold_out)         over w as prev_has_sold_out,
    lag(c.blog_post_count)      over w as prev_blog_post_count
  from snapshots_daily c
  window w as (partition by competitor_id, snapshot_source order by snapshot_date)
)

select
  c.snapshot_id,
  c.competitor_id,
  c.entity_type,
  c.location_id,
  c.snapshot_date,
  c.snapshot_source,

  -- Rating deltas (GBP)
  c.google_rating,
  c.google_rating_count,
  c.prev_google_rating,
  c.prev_google_rating_count,
  c.google_rating - c.prev_google_rating                                as delta_rating,
  c.google_rating_count - c.prev_google_rating_count                    as delta_rating_count,

  -- Hours change
  c.google_hours_hash,
  c.prev_google_hours_hash,
  c.hours_periods_json,
  c.prev_hours_periods_json,
  case
    when c.prev_google_hours_hash is null then false
    when c.google_hours_hash != c.prev_google_hours_hash then true
    else false
  end                                                                   as hours_changed,

  -- Promo change
  c.has_promo,
  c.prev_has_promo,
  case
    when c.has_promo = true
      and (c.prev_has_promo = false or c.prev_has_promo is null) then true
    else false
  end                                                                   as promo_changed,
  c.promo_summary,

  -- Sold out change
  c.has_sold_out,
  c.prev_has_sold_out,
  case
    when c.has_sold_out = true
      and (c.prev_has_sold_out = false or c.prev_has_sold_out is null) then true
    else false
  end                                                                   as sold_out_changed,
  c.sold_out_summary,

  -- Blog deltas
  c.blog_post_count,
  c.prev_blog_post_count,
  coalesce(c.blog_post_count, 0) - coalesce(c.prev_blog_post_count, 0) as blog_post_delta,
  c.blog_latest_title,
  c.blog_latest_date,
  date_diff(current_date(), c.blog_latest_date, day)                    as blog_latest_age_days,

  -- Featured offer
  c.featured_offer,

  c.prev_snapshot_date,
  c.created_at

from with_previous c
where c.snapshot_date >= date_sub(current_date(), interval 14 day)
