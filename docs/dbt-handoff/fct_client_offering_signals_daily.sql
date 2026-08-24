/*
  MODEL
    fct_client_offering_signals_daily
  GOAL
    Daily product-FAMILY signals at location grain : for each (location, date, item_category),
    is the family's SHARE of the day's revenue out of its own noise band ? Feeds the
    offering_mix_shift action card — which existed in the app registry (recoThemeMap,
    commitmentOrigins, bestInClassStore, action-cards.js) with NO producer in dbt, ever.
  WHY SHARE, NOT EUROS
    On 2026-08-22 at the reference site every family was up in euros (Coffee +227, Tea +206) :
    the DAY was strong, not a family. A euro-based card would lie by omission. Share of the
    day's revenue isolates the family from the day (lexicon rule 13 : never an absolute volume).
  METHOD (same shape as fct_client_sales_signals_daily)
    baseline  = avg(revenue_share) over the family's previous 30 days
    sd        = stddev_samp over the same window ; n = observations in window
    robust_z  = (share − baseline) / sd
    is_share_move = n >= 20 AND |z| >= 1.5 AND |share − baseline| >= 5 points
      The 5-point materiality floor was calibrated on 240 site-days (4 sites × 60 d) :
      0 pt -> 120 site-days fire (one in two, unusable), 3 pt -> 104, 5 pt -> 88, 8 pt -> 49.
      At 5 pt « Flavours 2 % -> 3 % » (z = 1.8) no longer fires ; « Tea 27.8 % -> 16.6 % » does.
  ELIGIBILITY
    Locations with >= 2 real families and >= 20 days of history. 'non classe' is excluded :
    a site whose export carries no item_category (Les Olivades, Sage 100) gets 0 rows — exact.
  SOURCE
    {{ ref('fct_client_offering_daily') }}   location_id × transaction_date × item_category
  GRAIN
    location_id × transaction_date × item_category
  MEASURED AT DELIVERY
    5 009 rows, 4 sites, is_share_move on 298 of them over the full history (5-pt floor).
  RECURRENCE (added 2026-08-24, "recit des cartes" chantier, nature 2)
    n_occurrences_60d / first_occurrence_date : same-fact recurrence, counted over the
    trailing 60 days INCLUDING the current row. The fact's identity is the PARTITION —
    a generic per-type counter would lie (8 family moves in 30 d were on DIFFERENT slots).
    Card copy: « 3e fois en retrait sur cette famille depuis le 26/06 ». NULL on non-moves.
*/

{{ config(
    materialized = 'table',
    schema       = 'mart',
    partition_by = {'field': 'transaction_date', 'data_type': 'date'},
    cluster_by   = ['location_id']
) }}

with offering as (
    select location_id, transaction_date, item_category, revenue, revenue_share, revenue_rank, promo_count, units
    from {{ ref('fct_client_offering_daily') }}
    where item_category is not null
      and lower(item_category) not in ('non classe', 'non classé')
),

eligible_locations as (
    select location_id
    from offering
    group by 1
    having count(distinct item_category) >= 2
       and count(distinct transaction_date) >= 20
),

windowed as (
    select
        o.*,
        avg(revenue_share)         over w as share_baseline,
        stddev_samp(revenue_share) over w as share_sd,
        count(revenue_share)       over w as share_n
    from offering o
    inner join eligible_locations e using (location_id)
    window w as (
        partition by location_id, item_category
        order by transaction_date
        rows between 30 preceding and 1 preceding
    )
),

scored as (
    select
        *,
        safe_divide(revenue_share - share_baseline, nullif(share_sd, 0)) as share_robust_z,
        (revenue_share - share_baseline) * 100                           as share_delta_points
    from windowed
),

-- 23/08 v2 (owner : bascule part -> EUROS). Attendu de la famille = sa part typique (30 jours
-- precedents) x le CA attendu du jour par le moteur (fct_client_day_residual). delta_eur =
-- reel - attendu ; les ecarts des familles s'additionnent a l'ecart du jour. La part reste
-- exposee (is_share_move) ; la carte lit les euros (is_eur_move).
eur as (
    select
        sc.*,
        r.expected_revenue                          as expected_day_revenue,
        r.daily_revenue - r.expected_revenue        as day_gap_eur,
        sc.share_baseline * r.expected_revenue      as expected_family_revenue,
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
    window w as (partition by location_id, item_category order by transaction_date
                 rows between 30 preceding and 1 preceding)
),

labeled as (
select
    location_id,
    transaction_date,
    item_category,
    revenue,
    units,
    promo_count,
    revenue_rank,
    round(revenue_share, 4)      as revenue_share,
    round(share_baseline, 4)     as baseline_share,
    round(share_delta_points, 1) as share_delta_points,
    round(share_robust_z, 2)     as share_robust_z,
    share_n,
    case
        when share_n >= 20 and share_robust_z >= 1.5  and share_delta_points >= 5  then 'surge'
        when share_n >= 20 and share_robust_z <= -1.5 and share_delta_points <= -5 then 'collapse'
    end as direction,
    (share_n >= 20 and abs(share_robust_z) >= 1.5 and abs(share_delta_points) >= 5) as is_share_move,
    round(expected_day_revenue, 2)    as expected_day_revenue,
    round(day_gap_eur, 2)             as day_gap_eur,
    round(expected_family_revenue, 2) as expected_family_revenue,
    round(delta_eur, 2)               as delta_eur,
    round(delta_z, 2)                 as delta_z,
    delta_n,
    case when delta_n >= 20 and delta_z >= 2.5  and delta_eur >= 60  then 'surge'
         when delta_n >= 20 and delta_z <= -2.5 and delta_eur <= -60 then 'collapse' end as direction_eur,
    (delta_n >= 20 and abs(delta_z) >= 2.5 and abs(delta_eur) >= 60) as is_eur_move
from eur_scored

)

-- Recurrence du MEME fait : meme famille, meme direction (euros).
select *,
    case when is_eur_move then count(*) over (
        partition by location_id, item_category, direction_eur
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as n_occurrences_60d,
    case when is_eur_move then min(transaction_date) over (
        partition by location_id, item_category, direction_eur
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as first_occurrence_date,
    current_timestamp() as dbt_updated_at
from labeled
