/*
  MODEL  fct_client_day_residual   (PARALLEL — does NOT replace the shipped dow band)
  PURPOSE
    Multi-factor expected-revenue model + residual anomaly flag, run ALONGSIDE the
    day-of-week noise band (revenue_robust_z) so we compare before switching cards over.
    Shrunk additive main-effects (dow, weather, calendar, tourism), fit per venue on
    REAL past days only. Carries the shipped flags for side-by-side.
  SOURCES (truth — verified columns, reuse only)
    - fct_client_sales_signals_daily       daily_revenue, daily_visitors, daily_transactions,
                                            revenue_robust_z, is_revenue_*_anomaly
    - fct_location_context_features_daily   alert_level_max, is_public_holiday_flag,
                                            is_school_holiday_flag, tourism_status_region
                                            (require_partition_filter=TRUE -> date filter mandatory)
  METHOD (calibrated 2026-07-05, ~78 real days/venue: bias~0, fire@k2 ~4-5%, lambda-invariant)
    y = ln(daily_revenue); effect_f = (cell_mean_f - grand) * n/(n+lambda)  [empirical-Bayes shrinkage];
    yhat = grand + sum(effect_f);  residual = y - yhat;  per-venue pred_se = stddev(residual);
    fire when |residual| > k * pred_se.
    Main-effects only (interactions deferred). Per-venue (no cross-venue pooling yet).
    In-sample residuals (anomaly detection, not forecasting). pred_se homoscedastic per venue
    (effect-uncertainty term omitted -> real SE slightly wider -> this is an upper bound on fires).
  FUNNEL FACTORS (added 2026-08-24 — chantier décomposition funnel)
    THE SAME machinery (same factor cells, same lambda, same 120d lookback, same row set:
    real past days with daily_revenue > 0) applied to ln(daily_visitors) and
    ln(daily_transactions), so every factor's "habituel" lives on the SAME referential as
    expected_revenue — never the 28d all-days baselines of fct_client_sales_signals_daily
    (those stay per-card trigger internals; two unlabeled referentials was the bug, 24/08).
    Basket and conversion are DERIVED BY IDENTITY, never fit separately:
      expected_basket     = exp(yhat_rev - yhat_tx)   (= expected_revenue / expected_transactions)
      expected_conversion = exp(yhat_tx  - yhat_vis)  (= expected_transactions / expected_visitors)
    so expected_revenue = expected_visitors x expected_conversion x expected_basket holds
    EXACTLY per day (up to output rounding), and summing expecteds over a window keeps the
    closure at window grain (ratio-of-sums referential). Residual z per factor uses the same
    per-venue stddev-of-residuals method as residual_z; basket/conversion residuals are the
    log-identity differences (r_rev - r_tx, r_tx - r_vis). Days where a factor is NULL or 0
    (e.g. no footfall feed -> daily_visitors NULL) yield NULL expected/z for that factor and
    every factor derived from it — never a fabricated number. expected_conversion is a
    RATIO 0-1 (same referential as conversion_rate in fct_client_sales_signals_daily),
    display multiplies by 100. No fire flags for factors: verdict thresholds live at the
    surface, the mart exposes the z.
  SCOPE  real past days only: transaction_date < current_date() (excludes synthetic future); revenue > 0.
  GRAIN  location_id x date
  PARAMETERS (dbt vars)  residual_lambda = 5   residual_k = 2   analog_lookback_days = 120
*/
{{ config(materialized = 'table', schema = 'mart', cluster_by = ['location_id']) }}

with rd as (
    select
        s.location_id,
        s.transaction_date as date,
        s.daily_revenue,
        s.daily_visitors,
        s.daily_transactions,
        ln(s.daily_revenue) as y,
        s.revenue_robust_z,
        s.is_revenue_down_anomaly,
        s.is_revenue_surge_anomaly,
        extract(dayofweek from s.transaction_date) as dow,
        case when c.alert_level_max >= 3 then 'S' when c.alert_level_max >= 1 then 'P' else 'C' end as wx,
        cast(coalesce(c.is_public_holiday_flag, false) as string) as hol,
        cast(coalesce(c.is_school_holiday_flag, false) as string) as sch,
        coalesce(c.tourism_status_region, 'inconnu') as tour
    from {{ ref('fct_client_sales_signals_daily') }} s
    left join {{ ref('fct_location_context_features_daily') }} c
        on s.location_id = c.location_id
       and s.transaction_date = c.date
    where c.date >= date_sub(current_date(), interval {{ var('analog_lookback_days', 120) }} day)
      and c.date <= current_date()
      and s.transaction_date < current_date()
      and s.daily_revenue > 0
),

g  as (select location_id, avg(y) as gm from rd group by 1),
cd as (select location_id, dow,  avg(y) m, count(*) n from rd group by 1, 2),
cw as (select location_id, wx,   avg(y) m, count(*) n from rd group by 1, 2),
ch as (select location_id, hol,  avg(y) m, count(*) n from rd group by 1, 2),
cs as (select location_id, sch,  avg(y) m, count(*) n from rd group by 1, 2),
ct as (select location_id, tour, avg(y) m, count(*) n from rd group by 1, 2),

ed as (select cd.location_id, dow,  (cd.m - g.gm) * cd.n / (cd.n + {{ var('residual_lambda', 5) }}) as eff from cd join g using (location_id)),
ew as (select cw.location_id, wx,   (cw.m - g.gm) * cw.n / (cw.n + {{ var('residual_lambda', 5) }}) as eff from cw join g using (location_id)),
eh as (select ch.location_id, hol,  (ch.m - g.gm) * ch.n / (ch.n + {{ var('residual_lambda', 5) }}) as eff from ch join g using (location_id)),
es as (select cs.location_id, sch,  (cs.m - g.gm) * cs.n / (cs.n + {{ var('residual_lambda', 5) }}) as eff from cs join g using (location_id)),
et as (select ct.location_id, tour, (ct.m - g.gm) * ct.n / (ct.n + {{ var('residual_lambda', 5) }}) as eff from ct join g using (location_id)),

pred as (
    select
        r.*,
        g.gm
        + coalesce(ed.eff, 0) + coalesce(ew.eff, 0) + coalesce(eh.eff, 0)
        + coalesce(es.eff, 0) + coalesce(et.eff, 0) as yhat
    from rd r
    join g using (location_id)
    left join ed on ed.location_id = r.location_id and ed.dow  = r.dow
    left join ew on ew.location_id = r.location_id and ew.wx   = r.wx
    left join eh on eh.location_id = r.location_id and eh.hol  = r.hol
    left join es on es.location_id = r.location_id and es.sch  = r.sch
    left join et on et.location_id = r.location_id and et.tour = r.tour
),

sev as (select location_id, stddev(y - yhat) as pred_se from pred group by 1),

scored as (
    select
        p.location_id,
        p.date,
        p.daily_revenue,
        round(exp(p.yhat), 0)                                        as expected_revenue,
        round(100 * (exp(p.y - p.yhat) - 1), 1)                      as residual_pct,
        safe_divide(p.y - p.yhat, nullif(sev.pred_se, 0))            as residual_z,
        p.revenue_robust_z,
        p.is_revenue_down_anomaly,
        p.is_revenue_surge_anomaly
    from pred p
    join sev using (location_id)
),

-- ── Funnel factors (2026-08-24) — same machinery in long format over vis/tx ──
rdm as (
    select r.location_id, r.date, m.metric, m.y, r.dow, r.wx, r.hol, r.sch, r.tour
    from rd r,
    unnest([
        struct('vis' as metric, case when r.daily_visitors     > 0 then ln(r.daily_visitors)     end as y),
        struct('tx'  as metric, case when r.daily_transactions > 0 then ln(r.daily_transactions) end as y)
    ]) m
    where m.y is not null
),

g2  as (select location_id, metric, avg(y) as gm from rdm group by 1, 2),
c2d as (select location_id, metric, dow,  avg(y) m, count(*) n from rdm group by 1, 2, 3),
c2w as (select location_id, metric, wx,   avg(y) m, count(*) n from rdm group by 1, 2, 3),
c2h as (select location_id, metric, hol,  avg(y) m, count(*) n from rdm group by 1, 2, 3),
c2s as (select location_id, metric, sch,  avg(y) m, count(*) n from rdm group by 1, 2, 3),
c2t as (select location_id, metric, tour, avg(y) m, count(*) n from rdm group by 1, 2, 3),

e2d as (select c2d.location_id, c2d.metric, dow,  (c2d.m - g2.gm) * c2d.n / (c2d.n + {{ var('residual_lambda', 5) }}) as eff from c2d join g2 using (location_id, metric)),
e2w as (select c2w.location_id, c2w.metric, wx,   (c2w.m - g2.gm) * c2w.n / (c2w.n + {{ var('residual_lambda', 5) }}) as eff from c2w join g2 using (location_id, metric)),
e2h as (select c2h.location_id, c2h.metric, hol,  (c2h.m - g2.gm) * c2h.n / (c2h.n + {{ var('residual_lambda', 5) }}) as eff from c2h join g2 using (location_id, metric)),
e2s as (select c2s.location_id, c2s.metric, sch,  (c2s.m - g2.gm) * c2s.n / (c2s.n + {{ var('residual_lambda', 5) }}) as eff from c2s join g2 using (location_id, metric)),
e2t as (select c2t.location_id, c2t.metric, tour, (c2t.m - g2.gm) * c2t.n / (c2t.n + {{ var('residual_lambda', 5) }}) as eff from c2t join g2 using (location_id, metric)),

pred2 as (
    select
        r.location_id,
        r.date,
        r.metric,
        r.y,
        g2.gm
        + coalesce(e2d.eff, 0) + coalesce(e2w.eff, 0) + coalesce(e2h.eff, 0)
        + coalesce(e2s.eff, 0) + coalesce(e2t.eff, 0) as yhat
    from rdm r
    join g2 using (location_id, metric)
    left join e2d on e2d.location_id = r.location_id and e2d.metric = r.metric and e2d.dow  = r.dow
    left join e2w on e2w.location_id = r.location_id and e2w.metric = r.metric and e2w.wx   = r.wx
    left join e2h on e2h.location_id = r.location_id and e2h.metric = r.metric and e2h.hol  = r.hol
    left join e2s on e2s.location_id = r.location_id and e2s.metric = r.metric and e2s.sch  = r.sch
    left join e2t on e2t.location_id = r.location_id and e2t.metric = r.metric and e2t.tour = r.tour
),

fx as (
    select
        location_id,
        date,
        max(if(metric = 'vis', y,    null)) as y_vis,
        max(if(metric = 'vis', yhat, null)) as yhat_vis,
        max(if(metric = 'tx',  y,    null)) as y_tx,
        max(if(metric = 'tx',  yhat, null)) as yhat_tx
    from pred2
    group by 1, 2
),

funnel_resid as (
    select
        p.location_id,
        p.date,
        fx.yhat_vis,
        fx.yhat_tx,
        p.yhat as yhat_rev,
        fx.y_vis - fx.yhat_vis                              as r_vis,
        fx.y_tx  - fx.yhat_tx                               as r_tx,
        (p.y - p.yhat) - (fx.y_tx - fx.yhat_tx)             as r_basket,
        (fx.y_tx - fx.yhat_tx) - (fx.y_vis - fx.yhat_vis)   as r_conv
    from pred p
    left join fx on fx.location_id = p.location_id and fx.date = p.date
),

sev2 as (
    select
        location_id,
        stddev(r_vis)    as se_vis,
        stddev(r_tx)     as se_tx,
        stddev(r_basket) as se_basket,
        stddev(r_conv)   as se_conv
    from funnel_resid
    group by 1
),

funnel as (
    select
        f.location_id,
        f.date,
        round(exp(f.yhat_vis), 0)                                    as expected_visitors,
        round(exp(f.yhat_tx), 0)                                     as expected_transactions,
        round(exp(f.yhat_rev - f.yhat_tx), 2)                        as expected_basket,
        round(exp(f.yhat_tx - f.yhat_vis), 4)                        as expected_conversion,
        round(safe_divide(f.r_vis,    nullif(s2.se_vis, 0)), 2)      as visitors_residual_z,
        round(safe_divide(f.r_tx,     nullif(s2.se_tx, 0)), 2)       as transactions_residual_z,
        round(safe_divide(f.r_basket, nullif(s2.se_basket, 0)), 2)   as basket_residual_z,
        round(safe_divide(f.r_conv,   nullif(s2.se_conv, 0)), 2)     as conversion_residual_z
    from funnel_resid f
    join sev2 s2 using (location_id)
)

select
    s.location_id,
    s.date,
    s.daily_revenue,
    s.expected_revenue,
    s.residual_pct,
    round(s.residual_z, 2) as residual_z,
    coalesce(s.residual_z <= -1 * {{ var('residual_k', 2) }}, false) as is_revenue_down_residual,
    coalesce(s.residual_z >=      {{ var('residual_k', 2) }}, false) as is_revenue_surge_residual,
    round(s.revenue_robust_z, 2) as revenue_robust_z,
    s.is_revenue_down_anomaly,
    s.is_revenue_surge_anomaly,
    f.expected_visitors,
    f.visitors_residual_z,
    f.expected_transactions,
    f.transactions_residual_z,
    f.expected_basket,
    f.basket_residual_z,
    f.expected_conversion,
    f.conversion_residual_z
from scored s
left join funnel f
    on f.location_id = s.location_id
   and f.date = s.date
