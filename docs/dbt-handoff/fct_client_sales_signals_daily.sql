/*
  MODEL
    fct_client_sales_signals_daily
  GOAL
    Daily client sales-health signals at location grain, from operational sales
    data crossed with daily opportunity context. Surfaces, for the action layer:
      - is_traffic_not_converting : demand present (footfall above baseline OR a
        favorable opportunity day) AND conversion anomalously below its day-of-week
        band (robust-z), excluding persistent baseline-calibration artifacts (R4).
      - is_discount_without_lift  : discount intensity anomalously above its band
        while revenue is NOT a positive anomaly (promo spend without payoff).
      - primary_revenue_driver    : transactions/basket (or footfall/conversion/basket
        where a footfall feed exists) attribution. Never 'mixed'.
      - is_revenue_down_anomaly / is_revenue_surge_anomaly : revenue beyond a
        day-of-week-aware noise band (robust-z).
      - is_revenue_down_vs_last_week : DEPRECATED single day-pair trigger, retained
        for reference only; no longer drives a card.
    All location x date rows are exposed unfiltered; consumers filter on the flags.
  SOURCES
    fct_client_daily_performance         -- location_id x transaction_date x source_type
    fct_location_context_features_daily  -- date x location_id (opportunity score / regime)
  GRAIN
    location_id x transaction_date
  NOTES
    - fct_client_daily_performance is summed across source_type to reach
      location x date; rate columns (conversion, basket, discount rate) are
      RECOMPUTED from summed components, never averaged across source_type.
    - RÉFÉRENTIEL des *_baseline (label ajouté 24/08, chantier décomposition funnel) :
      visitors/transactions/conversion/basket/discount_rate_baseline = moyenne glissante
      28 jours calendaires TOUS jours confondus (fenêtre w), ancrée à J-1. C'est un
      INTERNE DE DÉCLENCHEMENT (deltas des cartes, drivers, gardes R1/R4) — jamais le
      « résultat habituel » arbitré de l'app. Celui-ci vit dans fct_client_day_residual
      (expected_revenue + expected_visitors/transactions/basket/conversion, même méthode
      multi-facteurs pour tous). Une surface qui affiche un écart vs habituel lit
      day_residual ; elle ne mêle JAMAIS les deux référentiels dans une même phrase.
    - Noise band (R1): a day-of-week-aware trailing distribution (w_dow) of the last
      sales_dow_lookback same-weekday occurrences (excluding today) gives mean + stddev;
      robust_z = (value - mean) / stddev. A movement fires only when the relevant
      robust_z passes sales_robust_z_k with at least sales_dow_min_n observations.
    - Baseline-validity guard (R4): a conversion delta that persists at a similar,
      large level over >= 3 days (spread <= sales_calib_band_pp, |avg| >=
      sales_calib_min_pct) is a baseline-calibration artifact, flagged via
      is_conversion_baseline_suspect and excluded from is_traffic_not_converting.
    - Materialized as table: trailing-window baselines need full history.
    - Boolean flags are coalesced to false so consumers can filter without NULL gaps.
  PARAMETERS (dbt vars, defaults)
    sales_baseline_days       = 28    trailing calendar-day baseline window
    sales_footfall_up_pct     = 10    footfall % over baseline => demand present
    sales_conversion_down_pct = 10    (legacy) conversion % under baseline
    sales_favorable_score     = 7.0   opportunity_score_final_local at/above => favorable
    sales_discount_up_pct     = 20    (legacy) discount-rate % over baseline
    sales_no_lift_pct         = 0     (legacy) revenue vs 30d-avg % at/below => no lift
    sales_wow_down_pct        = 15    revenue % under same-weekday-last-week (deprecated)
    sales_driver_dominance    = 1.5   (deprecated) old sole-driver ratio
    sales_signals_output_days = 90    final output window (baselines use full history)
    sales_dow_lookback        = 6     same-weekday occurrences in the robust band (w_dow)
    sales_dow_min_n           = 4     min same-weekday history to fire (else suppress)
    sales_robust_z_k          = 1.5   noise-band half-width in std-devs
    sales_driver_tie_pp       = 3     factor gap (pp) below which the driver is 'both'
    sales_calib_band_pp       = 5     conversion-delta spread (pp) over 3d => baseline artifact
    sales_calib_min_pct       = 25    conversion-delta magnitude that, if persistent, flags suspect
*/
{{ config(
    materialized = 'table',
    schema = 'mart',
    cluster_by = ['location_id']
) }}
with daily as (
select
        location_id,
        client_id,
        transaction_date,
        sum(daily_revenue)          as daily_revenue,
        sum(daily_net_revenue)      as daily_net_revenue,
        sum(daily_visitors)         as daily_visitors,
        sum(daily_transactions)     as daily_transactions,
        sum(daily_discount_total)   as daily_discount_total,
        sum(daily_promo_line_count) as daily_promo_line_count,
        sum(revenue_30d_avg)        as revenue_30d_avg
from {{ ref('fct_client_daily_performance') }}
group by location_id, client_id, transaction_date
),
ratios as (
select
        d.*,
        safe_divide(d.daily_transactions, d.daily_visitors)  as conversion_rate,
        safe_divide(d.daily_revenue, d.daily_transactions)   as avg_basket,
        safe_divide(d.daily_discount_total, d.daily_revenue) as discount_rate
from daily d
),
context as (
select
        location_id,
        `date`                        as context_date,
        opportunity_score_final_local,
        opportunity_regime
from {{ ref('fct_location_context_features_daily') }}
where `date` >= date_sub(current_date(), interval {{ var('sales_signals_output_days', 90) }} day)
),
joined as (
select
        r.*,
        c.opportunity_score_final_local,
        c.opportunity_regime
from ratios r
left join context c
on c.location_id = r.location_id
and c.context_date = r.transaction_date
),
baselined as (
select
        j.*,
        avg(j.daily_visitors)     over w as visitors_baseline,
        avg(j.daily_transactions) over w as transactions_baseline,
        avg(j.conversion_rate)    over w as conversion_baseline,
        avg(j.avg_basket)         over w as basket_baseline,
        avg(j.discount_rate)      over w as discount_rate_baseline,
        max(j.daily_revenue) over (
            partition by j.location_id
            order by unix_date(j.transaction_date)
            range between 7 preceding and 7 preceding
        ) as revenue_same_weekday_last_week,
        avg(j.daily_revenue)           over w_dow as revenue_dow_mean,
        stddev_samp(j.daily_revenue)   over w_dow as revenue_dow_sd,
        count(j.daily_revenue)         over w_dow as revenue_dow_n,
        avg(j.conversion_rate)         over w_dow as conversion_dow_mean,
        stddev_samp(j.conversion_rate) over w_dow as conversion_dow_sd,
        avg(j.discount_rate)           over w_dow as discount_dow_mean,
        stddev_samp(j.discount_rate)   over w_dow as discount_dow_sd
from joined j
window
    w as (
        partition by j.location_id
        order by unix_date(j.transaction_date)
        range between {{ var('sales_baseline_days', 28) }} preceding and 1 preceding
    ),
    w_dow as (
        partition by j.location_id, extract(dayofweek from j.transaction_date)
        order by unix_date(j.transaction_date)
        rows between {{ var('sales_dow_lookback', 6) }} preceding and 1 preceding
    )
),
scored as (
select
        location_id,
        client_id,
        transaction_date,
        daily_revenue,
        daily_net_revenue,
        daily_visitors,
        daily_transactions,
        daily_discount_total,
        daily_promo_line_count,
        revenue_30d_avg,
        conversion_rate,
        avg_basket,
        discount_rate,
        opportunity_score_final_local,
        opportunity_regime,
        visitors_baseline,
        transactions_baseline,
        conversion_baseline,
        basket_baseline,
        discount_rate_baseline,
        safe_divide(daily_visitors - visitors_baseline, visitors_baseline) * 100        as footfall_delta_pct,
        safe_divide(daily_transactions - transactions_baseline, transactions_baseline) * 100 as transactions_delta_pct,
        safe_divide(conversion_rate - conversion_baseline, conversion_baseline) * 100   as conversion_delta_pct,
        safe_divide(avg_basket - basket_baseline, basket_baseline) * 100                as basket_delta_pct,
        safe_divide(discount_rate - discount_rate_baseline, discount_rate_baseline) * 100 as discount_rate_delta_pct,
        safe_divide(daily_revenue - revenue_30d_avg, revenue_30d_avg) * 100             as revenue_vs_30d_avg_pct,
        revenue_same_weekday_last_week,
        safe_divide(daily_revenue - revenue_same_weekday_last_week, revenue_same_weekday_last_week) * 100 as revenue_vs_last_week_pct,
        revenue_dow_n,
        safe_divide(daily_revenue   - revenue_dow_mean,    nullif(revenue_dow_sd, 0))    as revenue_robust_z,
        safe_divide(conversion_rate - conversion_dow_mean, nullif(conversion_dow_sd, 0)) as conversion_robust_z,
        safe_divide(discount_rate   - discount_dow_mean,   nullif(discount_dow_sd, 0))   as discount_robust_z
from baselined
),
persistence as (
select
        scored.*,
        -- R4 baseline-validity guard: a conversion delta that persists at a similar,
        -- large level over >= 3 days is a baseline-calibration artifact (e.g. a
        -- structural low relative to a lagging baseline), not a daily event.
        coalesce(
            count(conversion_delta_pct) over w3 >= 3
            and (max(conversion_delta_pct) over w3 - min(conversion_delta_pct) over w3) <= {{ var('sales_calib_band_pp', 5) }}
            and abs(avg(conversion_delta_pct) over w3) >= {{ var('sales_calib_min_pct', 25) }}
        , false) as is_conversion_baseline_suspect
from scored
window w3 as (
        partition by location_id
        order by unix_date(transaction_date)
        range between 2 preceding and current row
)
),
final as (
select
        location_id,
        client_id,
        transaction_date,
        daily_revenue,
        daily_net_revenue,
        daily_visitors,
        daily_transactions,
        daily_discount_total,
        daily_promo_line_count,
        revenue_30d_avg,
        conversion_rate,
        avg_basket,
        discount_rate,
        opportunity_score_final_local,
        opportunity_regime,
        visitors_baseline,
        transactions_baseline,
        conversion_baseline,
        basket_baseline,
        discount_rate_baseline,
        footfall_delta_pct,
        transactions_delta_pct,
        conversion_delta_pct,
        basket_delta_pct,
        discount_rate_delta_pct,
        revenue_vs_30d_avg_pct,
        revenue_same_weekday_last_week,
        revenue_vs_last_week_pct,
        revenue_robust_z,
        conversion_robust_z,
        discount_robust_z,
        revenue_dow_n,
        is_conversion_baseline_suspect,
        -- DEPRECATED trigger (single day-pair); retained for reference only.
        coalesce(
            revenue_vs_last_week_pct <= -1 * {{ var('sales_wow_down_pct', 15) }}
        , false) as is_revenue_down_vs_last_week,
        -- R1 revenue triggers: day-of-week-aware noise band.
        coalesce(
            revenue_robust_z <= -1 * {{ var('sales_robust_z_k', 1.5) }}
            and revenue_dow_n >= {{ var('sales_dow_min_n', 4) }}
        , false) as is_revenue_down_anomaly,
        coalesce(
            revenue_robust_z >= {{ var('sales_robust_z_k', 1.5) }}
            and revenue_dow_n >= {{ var('sales_dow_min_n', 4) }}
        , false) as is_revenue_surge_anomaly,
        -- R1 + R4: demand present, conversion an anomaly below its band, not a persistent
        -- baseline artifact, and footfall must actually exist.
        coalesce(
            daily_visitors is not null
            and (footfall_delta_pct >= {{ var('sales_footfall_up_pct', 10) }}
                 or opportunity_score_final_local >= {{ var('sales_favorable_score', 7.0) }})
            and conversion_robust_z <= -1 * {{ var('sales_robust_z_k', 1.5) }}
            and not is_conversion_baseline_suspect
        , false) as is_traffic_not_converting,
        -- R1: discount intensity anomalously high while revenue is NOT a positive anomaly.
        coalesce(
            discount_robust_z >= {{ var('sales_robust_z_k', 1.5) }}
            and revenue_robust_z < {{ var('sales_robust_z_k', 1.5) }}
        , false) as is_discount_without_lift,
        case
            when daily_visitors is not null then
                case
                    when abs(footfall_delta_pct)   - greatest(abs(conversion_delta_pct), abs(basket_delta_pct))    > {{ var('sales_driver_tie_pp', 3) }} then 'footfall'
                    when abs(conversion_delta_pct) - greatest(abs(footfall_delta_pct),  abs(basket_delta_pct))     > {{ var('sales_driver_tie_pp', 3) }} then 'conversion'
                    when abs(basket_delta_pct)     - greatest(abs(footfall_delta_pct),  abs(conversion_delta_pct)) > {{ var('sales_driver_tie_pp', 3) }} then 'basket'
                    else 'both'
                end
            else
                case
                    when abs(transactions_delta_pct) - abs(basket_delta_pct) > {{ var('sales_driver_tie_pp', 3) }} then 'transactions'
                    when abs(basket_delta_pct) - abs(transactions_delta_pct) > {{ var('sales_driver_tie_pp', 3) }} then 'basket'
                    else 'both'
                end
        end as primary_revenue_driver
from persistence
where transaction_date >= date_sub(current_date(), interval {{ var('sales_signals_output_days', 90) }} day)
  and transaction_date <= current_date()
)
select * from final