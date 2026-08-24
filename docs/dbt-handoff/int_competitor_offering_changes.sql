-- models/ms_open_data/intermediate/int_competitor_offering_changes.sql
/*
  MODEL
    int_competitor_offering_changes
  GOAL
    Detect what changed in each competitor's offering over a 30-DAY window, on
    STABLE items only. One row per competitor_id × item_norm : a newly-launched
    offering, a removed offering, or a price move (up/down).
  METHOD (rewritten 2026-08-23 — diagnosis in muse-square repo,
          docs/trou-prix-concurrents-2026-08-23.md)
    1. stable_items : items present in >= 90 % of a competitor's crawls. The LLM
       extraction renames the same product across crawls ("Coussins (outlet)",
       "Coussins en fin de serie", "Coussins – Outlet fins de serie" = 3 item_norm).
       On 466 items, 300 are phantoms (< 50 % of crawls) ; 68 are stable.
       Without this filter new/removed were 82 + 71 per week — crawl noise.
    2. latest_ts / previous_ts : latest crawl vs latest crawl <= latest − 30 days.
       The previous version compared the two most recent crawls, 12 hours apart
       (09:15 / 21:30 same day) : nobody reprices in 12 hours, so the model
       produced 0 rows every day since its first build, DONE OK.
    3. FULL OUTER JOIN latest × previous on (competitor_id, item_norm), classify :
         new_offering / removed_offering / price_increase / price_decrease / unchanged
       Only != 'unchanged' is emitted. Same four types and same columns as before :
       fct_competitor_offering_changes and the cards downstream are untouched.
    4. change_first_seen_on (added 2026-08-24, "recit des cartes" chantier) : the DATE of
       the FACT. latest_ts advances every night, so current_crawled_at dates the latest
       crawl, NOT the change. Here : first crawl AFTER the previous_ts reference where the
       new state is observed (new price seen / item first seen / first crawl after the
       item's last appearance). Stable for the row's whole lifetime -- when previous_ts
       catches up with it, the row leaves the model altogether. Downstream,
       fct_location_daily_action_candidates keys its suppression_key on it (one card per
       fact, "Action menee" suppresses it for good) and renders "le JJ/MM" in the copy.
  MEASURED AT DELIVERY (whole park)
    14 rows : 2 price moves (MesRideaux.fr — Rideau Etamine 222 -> 304 EUR, one
    cushion 96 -> 88 EUR) + 12 new_offering at Micromania-Zing (recent game
    releases, stable since they appeared). 0 removed_offering.
*/

{{ config(
    materialized = 'table',
    schema       = 'intermediate'
) }}

with history as (
    select competitor_id, crawled_at, category, item, item_norm, price_raw, price_numeric, currency, price_qualifier, unit, source_url, tarifs_url
    from {{ ref('stg_competitor_offering_history') }}
    where item_norm is not null and item_norm != ''
),
crawl_counts as (
    select competitor_id, count(distinct crawled_at) as n_crawls from history group by 1
),
stable_items as (
    select h.competitor_id, h.item_norm
    from history h join crawl_counts c using (competitor_id)
    group by 1, 2, c.n_crawls
    having count(distinct h.crawled_at) >= 0.9 * c.n_crawls
),
latest_ts as (
    select competitor_id, max(crawled_at) as ts from history group by 1
),
previous_ts as (
    select h.competitor_id, max(h.crawled_at) as ts
    from history h join latest_ts l using (competitor_id)
    where h.crawled_at <= timestamp_sub(l.ts, interval 30 day)
    group by 1
),
latest as (
    select * except(rn) from (
        select h.competitor_id, h.crawled_at, h.category, h.item, h.item_norm, h.price_raw, h.price_numeric, h.currency, h.price_qualifier, h.unit, h.source_url, h.tarifs_url,
               row_number() over (partition by h.competitor_id, h.item_norm order by h.price_numeric desc nulls last) as rn
        from history h join latest_ts l on h.competitor_id = l.competitor_id and h.crawled_at = l.ts
        join stable_items s on s.competitor_id = h.competitor_id and s.item_norm = h.item_norm
    ) where rn = 1
),
previous as (
    select * except(rn) from (
        select h.competitor_id, h.crawled_at, h.category, h.item, h.item_norm, h.price_raw, h.price_numeric, h.currency, h.price_qualifier, h.unit, h.source_url, h.tarifs_url,
               row_number() over (partition by h.competitor_id, h.item_norm order by h.price_numeric desc nulls last) as rn
        from history h join previous_ts p on h.competitor_id = p.competitor_id and h.crawled_at = p.ts
        join stable_items s on s.competitor_id = h.competitor_id and s.item_norm = h.item_norm
    ) where rn = 1
),
diffed as (
    select
        coalesce(l.competitor_id, p.competitor_id) as competitor_id,
        coalesce(l.item_norm, p.item_norm) as item_norm,
        coalesce(l.category, p.category) as category,
        coalesce(l.item, p.item) as item,
        coalesce(l.unit, p.unit) as unit,
        coalesce(l.currency, p.currency) as currency,
        coalesce(l.source_url, p.source_url) as source_url,
        coalesce(l.tarifs_url, p.tarifs_url) as tarifs_url,
        p.crawled_at as previous_crawled_at,
        l.crawled_at as current_crawled_at,
        p.price_raw as old_price_raw, p.price_numeric as old_price_numeric, p.price_qualifier as old_price_qualifier,
        l.price_raw as new_price_raw, l.price_numeric as new_price_numeric, l.price_qualifier as new_price_qualifier,
        (l.item_norm is not null) as in_latest,
        (p.item_norm is not null) as in_previous
    from latest l
    full outer join previous p on l.competitor_id = p.competitor_id and l.item_norm = p.item_norm
),
classified as (
    select *,
        case
            when in_latest and not in_previous then 'new_offering'
            when in_previous and not in_latest then 'removed_offering'
            when in_latest and in_previous and old_price_numeric is not null and new_price_numeric is not null and new_price_numeric > old_price_numeric then 'price_increase'
            when in_latest and in_previous and old_price_numeric is not null and new_price_numeric is not null and new_price_numeric < old_price_numeric then 'price_decrease'
            else 'unchanged'
        end as change_type,
        case when in_latest and in_previous and old_price_numeric is not null and new_price_numeric is not null
             then round(new_price_numeric - old_price_numeric, 2) end as price_difference,
        case when in_latest and in_previous and old_price_numeric is not null and old_price_numeric != 0 and new_price_numeric is not null
             then round((new_price_numeric - old_price_numeric) / old_price_numeric * 100, 1) end as price_pct_change
    from diffed
),
removed_last_seen as (
    -- derniere apparition d'un article disparu
    select cl.competitor_id, cl.item_norm, max(h.crawled_at) as last_seen_at
    from classified cl
    join history h on h.competitor_id = cl.competitor_id and h.item_norm = cl.item_norm
    where cl.change_type = 'removed_offering'
    group by 1, 2
),
removed_first_seen as (
    -- removed : premier crawl du concurrent APRES la derniere apparition de l'article
    select r.competitor_id, r.item_norm, min(date(h.crawled_at)) as change_first_seen_on
    from removed_last_seen r
    join history h on h.competitor_id = r.competitor_id and h.crawled_at > r.last_seen_at
    group by 1, 2
),
first_seen as (
    -- new_offering / prix : premier crawl posterieur a la reference ou le nouvel etat apparait
    select cl.competitor_id, cl.item_norm, min(date(h.crawled_at)) as change_first_seen_on
    from classified cl
    join history h
      on h.competitor_id = cl.competitor_id and h.item_norm = cl.item_norm
     and (cl.previous_crawled_at is null or h.crawled_at > cl.previous_crawled_at)
     and (cl.change_type = 'new_offering' or h.price_numeric = cl.new_price_numeric)
    where cl.change_type in ('new_offering', 'price_increase', 'price_decrease')
    group by 1, 2
)
select c.competitor_id, c.item_norm, c.category, c.item, c.unit, c.currency, c.change_type, c.old_price_raw, c.old_price_numeric, c.new_price_raw, c.new_price_numeric,
       c.price_difference, c.price_pct_change, c.old_price_qualifier, c.new_price_qualifier, c.previous_crawled_at, c.current_crawled_at, c.source_url, c.tarifs_url,
       coalesce(fs.change_first_seen_on, rf.change_first_seen_on, date(c.current_crawled_at)) as change_first_seen_on,
       current_timestamp() as dbt_updated_at
from classified c
left join first_seen fs on fs.competitor_id = c.competitor_id and fs.item_norm = c.item_norm
left join removed_first_seen rf on rf.competitor_id = c.competitor_id and rf.item_norm = c.item_norm
where c.change_type != 'unchanged'