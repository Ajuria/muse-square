/*
  MODEL
    fct_client_item_signals_daily
  GOAL
    Daily PRODUCT-level signals at location grain — the finest grain the sales export allows.
    Companion of fct_client_offering_signals_daily (family grain) : same shape, three things a
    family cannot carry :
      1. share move of ONE product in the day's revenue (stock-out, placement, price)
      2. dead product : a daily item that has not sold for N days
      3. own price move : unit_price vs its 30-day baseline
    Also the bridge to competitor pricing : a product (« Latte ») is comparable to a competitor
    product ; a family (« Coffee ») is not.
  WHY SHARE, NOT EUROS  — same reason as the family mart : a strong day lifts every product.
  METHOD
    Per (location, date, item) : share of day's revenue, units, avg unit price.
    Baselines over the item's previous 30 SELLING days (rows, not calendar days — an item
    absent on a day has no row, so the window counts selling days).
    is_daily_item  = sold on >= 90 % of the location's selling days (measured on the reference
                     site : 51 of 80 products, 87 % of revenue). Only daily items get a share z :
                     an occasional item's daily share is noise by construction.
    share_robust_z = (share − baseline) / sd ; is_share_move = daily AND n >= 20 AND |z| >= 1.5
                     AND |Δ| >= 2 points (products are smaller than families : 5 pt would mute all)
    price_move     = |unit_price − price_baseline| / price_baseline >= 5 % on a daily item
    days_since_last_sale / is_dead_item : daily item, no row today, last row >= 3 days ago —
                     computed in the LAST-SALE section, one row per (location, item) as of the
                     latest selling day of the location.
  ELIGIBILITY
    Locations with >= 20 selling days and item_description present. Sites whose export carries no
    product (Les Olivades, Sage 100) get 0 rows — exact.
  SOURCE
    {{ ref('fct_client_day_residual') }}   -- 23/08 v2 : CA attendu du jour (moteur) pour les euros
    {{ ref('stg_client_transactions') }}
  GRAIN
    location_id × transaction_date × item_description   (+ one row per dead item on the last day)
  RECURRENCE (added 2026-08-24, "recit des cartes" chantier, nature 2)
    n_occurrences_60d / first_occurrence_date : same-fact recurrence, counted over the
    trailing 60 days INCLUDING the current row. The fact's identity is the PARTITION —
    a generic per-type counter would lie (8 item moves in 30 d were on DIFFERENT slots).
    Card copy: « 3e fois en retrait sur ce produit depuis le 26/06 ». NULL on non-moves.
*/

{{ config(
    materialized = 'table',
    schema       = 'mart',
    partition_by = {'field': 'transaction_date', 'data_type': 'date'},
    cluster_by   = ['location_id']
) }}

with lines as (
    select
        location_id,
        transaction_date,
        item_description,
        coalesce(item_category, 'non classe') as item_category,
        revenue,
        quantity,
        unit_price
    from {{ ref('stg_client_transactions') }}
    where item_description is not null
      and is_invoiced
      and transaction_date < current_date()
),

location_days as (
    select location_id, count(distinct transaction_date) as selling_days, max(transaction_date) as last_day
    from lines group by 1
    having count(distinct transaction_date) >= 20
),

daily_item as (
    select
        l.location_id,
        l.transaction_date,
        l.item_description,
        any_value(l.item_category)                          as item_category,
        sum(l.revenue)                                      as revenue,
        sum(l.quantity)                                     as units,
        safe_divide(sum(l.revenue), nullif(sum(l.quantity), 0)) as unit_price
    from lines l
    inner join location_days d using (location_id)
    group by 1, 2, 3
),

day_totals as (
    select location_id, transaction_date, sum(revenue) as day_revenue
    from daily_item group by 1, 2
),

item_frequency as (
    select
        di.location_id,
        di.item_description,
        count(distinct di.transaction_date)                                  as days_sold,
        count(distinct di.transaction_date) >= 0.9 * any_value(d.selling_days) as is_daily_item,
        max(di.transaction_date)                                             as last_sale_date
    from daily_item di
    inner join location_days d using (location_id)
    group by 1, 2
),

windowed as (
    select
        di.*,
        safe_divide(di.revenue, t.day_revenue)             as revenue_share,
        f.is_daily_item,
        f.days_sold,
        avg(safe_divide(di.revenue, t.day_revenue))  over w as share_baseline,
        stddev_samp(safe_divide(di.revenue, t.day_revenue)) over w as share_sd,
        count(di.revenue)                              over w as share_n,
        avg(di.unit_price)                             over w as price_baseline
    from daily_item di
    inner join day_totals t using (location_id, transaction_date)
    inner join item_frequency f using (location_id, item_description)
    window w as (
        partition by di.location_id, di.item_description
        order by di.transaction_date
        rows between 30 preceding and 1 preceding
    )
),

scored as (
    select
        *,
        safe_divide(revenue_share - share_baseline, nullif(share_sd, 0)) as share_robust_z,
        (revenue_share - share_baseline) * 100                           as share_delta_points,
        safe_divide(unit_price - price_baseline, nullif(price_baseline, 0)) * 100 as price_delta_pct
    from windowed
),

-- 23/08 v2 (owner : bascule part -> EUROS). Attendu du produit = sa part typique (30 jours de
-- vente precedents) x le CA attendu du jour par le moteur (fct_client_day_residual : jour de
-- semaine + tendance). delta_eur = reel - attendu ; les ecarts produits s'additionnent a l'ecart
-- du jour. Une part est redistributive (un produit monte, les autres baissent) : elle reste
-- exposee (is_share_move) mais la carte lit les euros (is_eur_move).
eur as (
    select
        sc.*,
        r.expected_revenue                          as expected_day_revenue,
        r.daily_revenue - r.expected_revenue        as day_gap_eur,
        sc.share_baseline * r.expected_revenue      as expected_item_revenue,
        sc.revenue - sc.share_baseline * r.expected_revenue as delta_eur
    from scored sc
    join {{ ref('fct_client_day_residual') }} r
      on r.location_id = sc.location_id and r.date = sc.transaction_date
    where r.expected_revenue > 0
),

eur_scored as (
    select
        *,
        safe_divide(delta_eur, nullif(stddev_samp(delta_eur) over w, 0)) as delta_z,
        count(delta_eur) over w                                           as delta_n
    from eur
    window w as (partition by location_id, item_description order by transaction_date
                 rows between 30 preceding and 1 preceding)
),

sold_rows as (
    select
        location_id,
        transaction_date,
        item_description,
        item_category,
        revenue,
        units,
        round(unit_price, 2)          as unit_price,
        round(revenue_share, 4)       as revenue_share,
        round(share_baseline, 4)      as baseline_share,
        round(share_delta_points, 1)  as share_delta_points,
        round(share_robust_z, 2)      as share_robust_z,
        share_n,
        is_daily_item,
        days_sold,
        round(price_baseline, 2)      as price_baseline,
        round(price_delta_pct, 1)     as price_delta_pct,
        case
            when is_daily_item and share_n >= 20 and share_robust_z >= 1.5  and share_delta_points >= 2  then 'surge'
            when is_daily_item and share_n >= 20 and share_robust_z <= -1.5 and share_delta_points <= -2 then 'collapse'
        end                           as direction,
        (is_daily_item and share_n >= 20 and abs(share_robust_z) >= 1.5 and abs(share_delta_points) >= 2) as is_share_move,
        (is_daily_item and share_n >= 20 and abs(price_delta_pct) >= 5)                                   as is_price_move,
        cast(null as int64)           as days_since_last_sale,
        false                         as is_dead_item,
        round(expected_day_revenue, 2)  as expected_day_revenue,
        round(day_gap_eur, 2)           as day_gap_eur,
        round(expected_item_revenue, 2) as expected_item_revenue,
        round(delta_eur, 2)             as delta_eur,
        round(delta_z, 2)               as delta_z,
        delta_n,
        case when is_daily_item and delta_n >= 20 and delta_z >= 3.0  and delta_eur >= 30  then 'surge'
             when is_daily_item and delta_n >= 20 and delta_z <= -3.0 and delta_eur <= -30 then 'collapse' end as direction_eur,
        (is_daily_item and delta_n >= 20 and abs(delta_z) >= 3.0 and abs(delta_eur) >= 30) as is_eur_move
    from eur_scored
),

-- DEAD ITEMS : one row per daily item absent on the location's last selling day, stamped on that day.
dead_rows as (
    select
        f.location_id,
        d.last_day                    as transaction_date,
        f.item_description,
        cast(null as string)          as item_category,
        cast(null as float64)         as revenue,
        cast(null as float64)         as units,
        cast(null as float64)         as unit_price,
        cast(null as float64)         as revenue_share,
        cast(null as float64)         as baseline_share,
        cast(null as float64)         as share_delta_points,
        cast(null as float64)         as share_robust_z,
        cast(null as int64)           as share_n,
        f.is_daily_item,
        f.days_sold,
        cast(null as float64)         as price_baseline,
        cast(null as float64)         as price_delta_pct,
        cast(null as string)          as direction,
        false                         as is_share_move,
        false                         as is_price_move,
        date_diff(d.last_day, f.last_sale_date, day) as days_since_last_sale,
        true                          as is_dead_item,
        cast(null as float64)         as expected_day_revenue,
        cast(null as float64)         as day_gap_eur,
        cast(null as float64)         as expected_item_revenue,
        cast(null as float64)         as delta_eur,
        cast(null as float64)         as delta_z,
        cast(null as int64)           as delta_n,
        cast(null as string)          as direction_eur,
        false                         as is_eur_move
    from item_frequency f
    inner join location_days d using (location_id)
    where f.is_daily_item
      and date_diff(d.last_day, f.last_sale_date, day) >= 3
),
unioned as (
    select * from sold_rows
    union all
    select * from dead_rows
)

-- Recurrence du MEME fait : meme produit, meme direction (euros).
select *,
    case when is_eur_move then count(*) over (
        partition by location_id, item_description, direction_eur
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as n_occurrences_60d,
    case when is_eur_move then min(transaction_date) over (
        partition by location_id, item_description, direction_eur
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as first_occurrence_date,
    current_timestamp() as dbt_updated_at
from unioned
