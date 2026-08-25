/*
  MODEL
    fct_client_hourly_signals_daily
  GOAL
    « Quelle heure a porté la journée, laquelle a manqué ? » — en EUROS, cohérents avec le
    verdict du jour. Feeds the hour_share_move action card.
  WHY EUROS ANCHORED TO THE DAY'S EXPECTATION (owner 23/08, replaces the v1 share-of-day)
    v1 compared the hour's SHARE of the day to its own share baseline. A share is redistributive
    (one hour up = others down): « 7 h = 24 % au lieu de 12 % » on 07/08 read as « 7 h porte la
    journée » while the DAY was −763 €. Not a euro, not a verdict.
    v2: expected_hour(d, h) = expected_revenue(d) [fct_client_day_residual : dow + trend]
                             × typical_share(dow, h) [avg share of the hour on the 8 previous same
                               weekdays]. Sum over the day's hours of expected_hour = expected_revenue(d),
    so the hourly deviations ADD UP to the day's residual: the hour with the largest |delta| is the
    one that explains the day's verdict. Measured 07/08 f10c3e58: 6 h did 35 € vs 228 € expected
    (−193 €) on a −763 € day.
  SPINE
    An hour with NO sale has no row in fct_client_hourly_sales — yet it is the worst miss. The
    day's spine = every hour seen on that weekday over the 8 previous weeks (>= 5 occurrences),
    built from the WEEKDAY profile, not from the day's rows; revenue is 0 when absent.
  GATES (calibrated 23/08, 4 sites × 60 d, past dates only, spine-less version)
    z = delta / stddev(delta of that hour over its 30 previous observations), n >= 15
    |z| >= 2.5 AND |delta| >= 100 € -> 18 % of site-days (~1 / week / site)
    (z 2 / 60 € -> 56 % ; z 3 / 150 € -> 7 %)
  ELIGIBILITY
    transaction_date < current_date() (the seed carries future dates) ; expected_revenue > 0.
    Les Olivades: no hour in the Sage export -> 0 rows, exact.
  RECURRENCE (added 2026-08-24, "recit des cartes" chantier, nature 2)
    n_occurrences_60d / first_occurrence_date : same-fact recurrence, counted over the
    trailing 60 days INCLUDING the current row. The fact's identity is the PARTITION —
    a generic per-type counter would lie (8 hour moves in 30 d were on DIFFERENT slots).
    Card copy: « 3e jeudi en retrait sur ce creneau depuis le 26/06 ». NULL on non-moves.
  SOURCE
    {{ ref('fct_client_hourly_sales') }}, {{ ref('fct_client_day_residual') }}
  GRAIN
    location_id × transaction_date × transaction_hour
*/

{{ config(
    materialized = 'table',
    schema       = 'mart',
    partition_by = {'field': 'transaction_date', 'data_type': 'date'},
    cluster_by   = ['location_id']
) }}

with hourly as (
    select location_id, transaction_date, transaction_hour,
           sum(revenue) as revenue, sum(transactions) as transactions
    from {{ ref('fct_client_hourly_sales') }}
    where transaction_hour is not null
      and transaction_date < current_date()
    group by 1, 2, 3
),

days as (
    select location_id, transaction_date, sum(revenue) as day_revenue,
           sum(transactions) as day_transactions
    from hourly group by 1, 2
),

-- Régime calendaire du jour (drapeau vacances scolaires par site × date) : sert à dire si la
-- base 8 semaines est du MÊME régime que le jour jugé (question owner 25/08 : cyclicité).
cal as (
    select location_id, date, is_school_holiday_flag
    from {{ ref('fct_location_context_daily') }}
),

-- Part observée de chaque heure dans sa journée, par jour de semaine.
shares as (
    select h.*, extract(dayofweek from h.transaction_date) as dow,
           safe_divide(h.revenue, d.day_revenue) as share,
           safe_divide(h.transactions, d.day_transactions) as tx_share
    from hourly h join days d using (location_id, transaction_date)
),

-- Part TYPIQUE de l'heure ce jour de semaine, vue du jour J : moyenne des parts observées sur les
-- 8 semaines précédentes (même jour de semaine), >= 5 occurrences. Calculée pour TOUTES les heures
-- vues ce jour de semaine sur la fenêtre — pas seulement celles vendues le jour J : une heure
-- sans vente ce jour-là entre dans le squelette avec 0 €.
spine as (
    select d.location_id, d.transaction_date, d.day_revenue, p.transaction_hour,
           avg(p.share) as typ_share, count(*) as typ_n,
           avg(p.tx_share) as typ_tx_share,
           -- jours de base partageant le régime vacances du jour jugé (coalesce false :
           -- une date absente du contexte compte comme hors vacances, jamais comme match muet)
           countif(coalesce(cp.is_school_holiday_flag, false) = coalesce(cd.is_school_holiday_flag, false)) as baseline_same_regime_n,
           any_value(coalesce(cd.is_school_holiday_flag, false)) as is_school_holiday_flag
    from days d
    left join cal cd on cd.location_id = d.location_id and cd.date = d.transaction_date
    join shares p
      on p.location_id = d.location_id
     and p.dow = extract(dayofweek from d.transaction_date)
     and p.transaction_date < d.transaction_date
     and p.transaction_date >= date_sub(d.transaction_date, interval 56 day)
    left join cal cp on cp.location_id = p.location_id and cp.date = p.transaction_date
    group by 1, 2, 3, 4
    having count(*) >= 5 and avg(p.share) > 0
),

expected as (
    select s.*, coalesce(h.revenue, 0) as revenue, coalesce(h.transactions, 0) as transactions,
           r.expected_revenue, r.daily_revenue - r.expected_revenue as day_gap_eur,
           s.typ_share * r.expected_revenue as expected_hour_revenue,
           coalesce(h.revenue, 0) - s.typ_share * r.expected_revenue as delta_eur,
           s.typ_tx_share * r.expected_transactions as expected_hour_transactions
    from spine s
    left join hourly h using (location_id, transaction_date, transaction_hour)
    join {{ ref('fct_client_day_residual') }} r
      on r.location_id = s.location_id and r.date = s.transaction_date
    where r.expected_revenue > 0
),

scored as (
    select *,
           safe_divide(delta_eur, nullif(stddev_samp(delta_eur) over w, 0)) as delta_z,
           count(delta_eur) over w as delta_n
    from expected
    window w as (partition by location_id, transaction_hour order by transaction_date
                 rows between 30 preceding and 1 preceding)
),

labeled as (
select
    location_id,
    transaction_date,
    transaction_hour,
    round(revenue, 2)               as revenue,
    transactions,
    round(day_revenue, 2)           as day_revenue,
    round(expected_revenue, 2)      as expected_day_revenue,
    round(day_gap_eur, 2)           as day_gap_eur,
    round(typ_share, 4)             as typical_share,
    round(expected_hour_revenue, 2) as expected_hour_revenue,
    round(expected_hour_transactions, 2) as expected_hour_transactions,
    typ_n,
    baseline_same_regime_n,
    is_school_holiday_flag,
    safe_divide(baseline_same_regime_n, typ_n) < 0.5 as regime_mismatch_flag,
    round(delta_eur, 2)             as delta_eur,
    round(delta_z, 2)               as delta_z,
    delta_n,
    case when delta_n >= 15 and delta_z >= 2.5  and delta_eur >= 100  then 'surge'
         when delta_n >= 15 and delta_z <= -2.5 and delta_eur <= -100 then 'collapse' end as direction,
    (delta_n >= 15 and abs(delta_z) >= 2.5 and abs(delta_eur) >= 100) as is_hour_move
from scored
)

-- Recurrence du MEME fait : meme creneau, meme jour de semaine, meme direction.
select *,
    case when is_hour_move then count(*) over (
        partition by location_id, transaction_hour,
                 extract(dayofweek from transaction_date), direction
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as n_occurrences_60d,
    case when is_hour_move then min(transaction_date) over (
        partition by location_id, transaction_hour,
                 extract(dayofweek from transaction_date), direction
        order by unix_date(transaction_date)
        range between 59 preceding and current row) end as first_occurrence_date,
    current_timestamp() as dbt_updated_at
from labeled
