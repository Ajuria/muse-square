# Handoff dbt Cloud IDE — familles de l'heure (build 2, owner 06/09/2026) : la carte heure nomme ce qui manque à cette heure

Sert : intent § dire à l'exploitant quelque chose de vrai qu'il ne pouvait pas voir seul — et ne jamais lui demander
un calcul que la base sait faire (verdict owner 06/09 sur mes plans : « vous demandez à l'utilisateur de faire ce
que NOUS devons faire »). Cas 2 du cadre validé : un créneau manque alors que le reste de la journée tient ; la
carte nomme les familles qui manquent (ou portent), calculées.

**État** : livré par PR `ms_database` #120 (branche `ventes/familles-heure`, base `origin/main` `7a4833d` = build 1
mergé), diff hourly **+60/−0**, candidates **+4/−2**. Le job « Daily action candidates refresh » est lancé sur la
branche avec `dbt run --select fct_client_hourly_signals_daily fct_location_daily_action_candidates` ; le MERGE de la
PR revient à l'owner (`gh pr merge` refusé par le classifieur). Aucun yml.

**Règle** : `hour_family_gaps` = les 3 familles au plus grand |écart| à cette heure, JSON `[{family, revenue,
expected, delta}]`, avec expected = part typique poolée de la famille dans l'heure (somme CA famille / somme CA de
l'heure sur les 8 mêmes jours de semaine précédents, ≥ 3 jours) × `expected_hour_revenue`. Même référentiel que
`delta_eur` ; NULL hors `is_hour_move`. `customer_type` et `channel` ne sont PAS nommés : vides sur les quatre sites
à heures (90 j), rien à prouver sur un compte réel.

**Preuves SQL (BQ, 06/09, modèle entier exécuté)** :
- f10c3e58, 8 mouvements sur 30 j, tous avec familles : 09/08 14 h (retrait) → Coffee 22 contre 70, Tea 11 contre
  52, Bakery 0 contre 23 ; 11/08 17 h → Coffee 26 contre 73, Tea 3 contre 45 ; 28/08 16 h (hausse) → Coffee 97
  contre 41, Tea 53 contre 25, Drinking Chocolate 19 contre 4.
- Somme des écarts famille = écart de l'heure sur 37 des 40 mouvements du parc (30 j) ; les 3 autres portent une
  famille vendue ce jour-là sans 3 jours de base (écart ≤ 66 EUR), documenté dans l'en-tête.
- Payload candidat : `hour_family_gaps` en JSON natif ; la ligne d'arrêt (build 1) reste à NULL.

**Rendu app** (commit `dev`) : « Familles : Coffee 22 € contre 70 € d'habitude à cette heure, Tea 11 € contre 52 €,
Bakery 0 € contre 23 €. » — forme de la ligne Familles du verdict (owner 06/09), familles du signe de l'heure, 3 au
plus ; test `tests/client/action-cards.hour-families.test.ts` sur les payloads réels.

**Ordre = ordre du DAG** : 1. modèle horaire → 2. candidats.

## 1. `ms_dbt/models/ms_open_data/mart/fct_client_hourly_signals_daily.sql` — REMPLACER LE FICHIER ENTIER

```sql
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
  JOURNEE ARRETEE (added 2026-09-06, build 1 owner)
    Le vendredi 07/08 (f10c3e58), la caisse s'est tue a 12 h 53 : 13 h-18 h a zero, matin au
    double. La carte prenait l'heure au plus grand |delta| (15 h, -137 EUR) et l'appelait
    « heure qui a manque » — vrai et a cote : ce n'est pas une heure, c'est la fin de journee.
    Un jour est ARRETE quand >= 2 heures du squelette, APRES la derniere heure vendue, sont a
    zero d'affilee (mesure 06/09, 90 j, parc : f10c3e58 et 2af6eb18 08/07 + 07/08 a 6 heures ;
    29383776 et ff2aeb35 aucun). Ces heures de queue ne sont plus des is_hour_move (une heure
    a zero parce que la caisse est fermee n'est pas « une heure qui a manque ») ; la premiere
    d'entre elles porte is_stop_row et les chiffres du jour : last_sale_hour, last_sale_ts (minute
    exacte, lue au staging), stopped_hours,
    stopped_expected_revenue / _transactions (somme des attendus de la queue, meme referentiel
    que delta_eur), expected_revenue_until_stop, et la recurrence n_stopped_days_90d /
    stopped_dates_90d (jours arretes des 89 jours precedents, courant exclu).
  FAMILLES DE L'HEURE (added 2026-09-06, build 2 owner — cas 2 : creneau manque, le reste tenu)
    hour_family_gaps : les 3 familles au plus grand |ecart| a cette heure, JSON
    [{family, revenue, expected, delta}] — expected = part TYPIQUE de la famille dans l'heure
    (somme des CA famille / somme des CA de l'heure sur les 8 memes jours de semaine precedents,
    >= 3 jours) x expected_hour_revenue : les ecarts famille s'additionnent a delta_eur (meme
    referentiel ; une famille vendue ce jour-la sans 3 jours de base n'y entre pas — mesure
    06/09 : 3 heures sur 40 sur le parc, ecart <= 66 EUR). Source = stg_client_transactions (item_category ; fct_client_hourly_sales
    n'a pas la famille). NULL hors is_hour_move. customer_type / channel ne sont PAS nommes :
    vides sur les 4 sites a heures (mesure 06/09, 90 j), rien a prouver sur un compte reel.
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

-- 06/09/2026 — journee arretee (voir en-tete). Derniere heure vendue du jour et queue du
-- squelette a zero ; agrege au grain jour, rejoint sur chaque heure dans labeled.
day_stop as (
    select location_id, transaction_date,
           max(if(revenue > 0, transaction_hour, null)) as last_sale_hour,
           max(transaction_hour)                         as typical_last_hour
    from expected
    group by 1, 2
),

-- Heure EXACTE de la derniere vente : le mart horaire est a l'heure pleine, la minute vit au
-- staging (owner 06/09 : « 12 h 53 », pas « entre 12 h et 13 h »). Meme filtre que
-- fct_client_hourly_sales (is_invoiced, transaction_hour non nul).
last_sale as (
    select location_id, transaction_date, max(transaction_datetime) as last_sale_ts
    from {{ ref('stg_client_transactions') }}
    where is_invoiced and transaction_hour is not null
    group by 1, 2
),

stopped as (
    select e.location_id, e.transaction_date, d.last_sale_hour, d.typical_last_hour,
           any_value(ls.last_sale_ts)                                                       as last_sale_ts,
           countif(e.transaction_hour > d.last_sale_hour)                                   as stopped_hours,
           min(if(e.transaction_hour > d.last_sale_hour, e.transaction_hour, null))         as stop_hour,
           sum(if(e.transaction_hour > d.last_sale_hour, e.expected_hour_revenue, 0))       as stopped_expected_revenue,
           sum(if(e.transaction_hour > d.last_sale_hour, e.expected_hour_transactions, 0))  as stopped_expected_transactions
    from expected e
    join day_stop d using (location_id, transaction_date)
    left join last_sale ls using (location_id, transaction_date)
    where d.last_sale_hour is not null
    group by 1, 2, 3, 4
),

-- Recurrence des jours arretes : ceux des 89 jours precedents (courant exclu), dates en JJ/MM.
stop_recur as (
    select a.location_id, a.transaction_date,
           count(b.transaction_date) as n_stopped_days_90d,
           string_agg(format_date('%d/%m', b.transaction_date), ', ' order by b.transaction_date) as stopped_dates_90d
    from stopped a
    left join stopped b
      on b.location_id = a.location_id
     and b.stopped_hours >= 2
     and b.transaction_date < a.transaction_date
     and b.transaction_date >= date_sub(a.transaction_date, interval 89 day)
    where a.stopped_hours >= 2
    group by 1, 2
),

-- 06/09/2026 — build 2 : familles de l'heure (voir en-tete). CA par famille x heure, part
-- typique poolee sur les 8 memes jours de semaine precedents, ecart contre l'attendu de l'heure.
fam_hour as (
    select location_id, transaction_date, transaction_hour, item_category,
           sum(revenue) as revenue
    from {{ ref('stg_client_transactions') }}
    where is_invoiced and transaction_hour is not null and item_category is not null
      and transaction_date < current_date()
    group by 1, 2, 3, 4
),

fam_base as (
    select e.location_id, e.transaction_date, e.transaction_hour, p.item_category,
           sum(p.revenue) as fam_base_revenue,
           count(distinct p.transaction_date) as fam_n
    from expected e
    join fam_hour p
      on p.location_id = e.location_id
     and p.transaction_hour = e.transaction_hour
     and extract(dayofweek from p.transaction_date) = extract(dayofweek from e.transaction_date)
     and p.transaction_date < e.transaction_date
     and p.transaction_date >= date_sub(e.transaction_date, interval 56 day)
    group by 1, 2, 3, 4
    having count(distinct p.transaction_date) >= 3
),

fam_delta as (
    select b.location_id, b.transaction_date, b.transaction_hour, b.item_category,
           coalesce(a.revenue, 0) as revenue,
           safe_divide(b.fam_base_revenue, sum(b.fam_base_revenue) over (partition by b.location_id, b.transaction_date, b.transaction_hour))
             * e.expected_hour_revenue as expected_revenue
    from fam_base b
    join expected e using (location_id, transaction_date, transaction_hour)
    left join fam_hour a using (location_id, transaction_date, transaction_hour, item_category)
),

fam_gaps as (
    select location_id, transaction_date, transaction_hour,
           to_json_string(array_agg(struct(item_category as family, round(revenue) as revenue,
                                           round(expected_revenue) as expected,
                                           round(revenue - expected_revenue) as delta)
                                    order by abs(revenue - expected_revenue) desc limit 3)) as hour_family_gaps
    from fam_delta
    group by 1, 2, 3
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
    -- 06/09/2026 — journee arretee (voir en-tete)
    coalesce(st.stopped_hours >= 2, false)                                        as is_day_stopped,
    coalesce(st.stopped_hours >= 2, false) and s.transaction_hour = st.stop_hour  as is_stop_row,
    st.last_sale_hour,
    if(coalesce(st.stopped_hours >= 2, false), st.last_sale_ts, null)             as last_sale_ts,
    st.typical_last_hour,
    if(coalesce(st.stopped_hours >= 2, false), st.stopped_hours, null)            as stopped_hours,
    if(coalesce(st.stopped_hours >= 2, false), st.stop_hour, null)                as stop_hour,
    if(coalesce(st.stopped_hours >= 2, false), round(st.stopped_expected_revenue, 2), null)      as stopped_expected_revenue,
    if(coalesce(st.stopped_hours >= 2, false), round(st.stopped_expected_transactions, 2), null) as stopped_expected_transactions,
    if(coalesce(st.stopped_hours >= 2, false), round(s.expected_revenue - st.stopped_expected_revenue, 2), null) as expected_revenue_until_stop,
    if(coalesce(st.stopped_hours >= 2, false), coalesce(sr.n_stopped_days_90d, 0), null)         as n_stopped_days_90d,
    if(coalesce(st.stopped_hours >= 2, false), sr.stopped_dates_90d, null)        as stopped_dates_90d,
    -- 06/09/2026 — build 2 : familles de l'heure, seulement sur un mouvement d'heure
    if(delta_n >= 15 and abs(delta_z) >= 2.5 and abs(delta_eur) >= 100
       and not (coalesce(st.stopped_hours >= 2, false) and s.transaction_hour > st.last_sale_hour),
       fg.hour_family_gaps, null)                                                  as hour_family_gaps,
    round(delta_eur, 2)             as delta_eur,
    round(delta_z, 2)               as delta_z,
    delta_n,
    -- 06/09/2026 : une heure de queue d'un jour arrete n'est pas une heure qui a manque.
    case when coalesce(st.stopped_hours >= 2, false) and s.transaction_hour > st.last_sale_hour then null
         when delta_n >= 15 and delta_z >= 2.5  and delta_eur >= 100  then 'surge'
         when delta_n >= 15 and delta_z <= -2.5 and delta_eur <= -100 then 'collapse' end as direction,
    (delta_n >= 15 and abs(delta_z) >= 2.5 and abs(delta_eur) >= 100
     and not (coalesce(st.stopped_hours >= 2, false) and s.transaction_hour > st.last_sale_hour)) as is_hour_move
from scored s
left join stopped st using (location_id, transaction_date)
left join stop_recur sr using (location_id, transaction_date)
left join fam_gaps fg using (location_id, transaction_date, transaction_hour)
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
```

## 2. `ms_dbt/models/ms_open_data/mart/fct_location_daily_action_candidates.sql` — REMPLACER LE CTE `hour_share_move`

De la ligne **`hour_share_move as (`** jusqu'à la ligne avant `sales_discount_no_lift as (` (ligne vide incluse) :

```sql
hour_share_move as (
    select
        date,
        location_id,
        'hour_share_move' as action_type,
        case when is_stop_row or abs(delta_z) >= 3.5 then 3 else 2 end as action_priority,
        'performance' as action_category,
        'note_interne' as channel_hint,
        -- 06/09/2026 — journee arretee (build 1 owner, fct_client_hourly_signals_daily § JOURNEE
        -- ARRETEE) : quand la caisse s'est tue avant la fin habituelle, la carte du jour est
        -- la FIN DE JOURNEE, pas une heure ; is_stop_row gagne le rang, l'heure = la premiere
        -- heure a zero, l'attendu = la somme de la queue (meme referentiel que delta_eur).
        case when is_stop_row then
            concat('Aucune vente de ', cast(stop_hour as string), ' h a ', cast(typical_last_hour + 1 as string),
                   ' h le ', format_date('%d/%m', date))
        else
            concat(cast(transaction_hour as string), ' h : ', cast(round(revenue) as string), ' EUR contre ',
                   cast(round(expected_hour_revenue) as string), ' EUR attendus le ', format_date('%d/%m', date))
        end as headline_fr,
        case when is_stop_row then
            concat('Derniere vente a ', coalesce(format_timestamp('%H h %M', last_sale_ts),
                                                 concat('entre ', cast(last_sale_hour as string), ' h et ', cast(last_sale_hour + 1 as string), ' h')),
                   '. De ', cast(stop_hour as string), ' h a ', cast(typical_last_hour + 1 as string), ' h : 0 ticket contre ',
                   cast(round(stopped_expected_transactions) as string), ' tickets et ',
                   cast(round(stopped_expected_revenue) as string), " EUR d'habitude. Journee a ",
                   cast(round(day_revenue) as string), ' EUR contre ', cast(round(expected_day_revenue) as string),
                   ' EUR attendus (', case when day_gap_eur >= 0 then '+' else '' end, cast(round(day_gap_eur) as string), ' EUR).',
                   if(n_stopped_days_90d > 0,
                      concat(' ', cast(n_stopped_days_90d + 1 as string), 'e journee arretee en 90 jours (', stopped_dates_90d, ').'),
                      ''))
        else
            concat('La tranche ', cast(transaction_hour as string), ' h a fait ', cast(round(revenue) as string), ' EUR contre ',
                   cast(round(expected_hour_revenue) as string), ' EUR attendus (', case when delta_eur >= 0 then '+' else '' end,
                   cast(round(delta_eur) as string), ' EUR), sur une journee a ', case when day_gap_eur >= 0 then '+' else '' end,
                   cast(round(day_gap_eur) as string), ' EUR. ',
                   case when direction = 'collapse' then 'Heure qui a manque.' else 'Heure qui a porte la journee.' end)
        end as detail_fr,
        to_json_string(struct(
            transaction_hour,
            round(revenue) as hour_revenue,
            round(expected_hour_revenue) as expected_hour_revenue,
            round(delta_eur) as delta_eur,
            delta_z,
            direction,
            round(day_revenue) as day_revenue,
            round(expected_day_revenue) as expected_day_revenue,
            round(day_gap_eur) as day_gap_eur,
            typical_share,
            transactions as hour_transactions,
            n_occurrences_60d,
            cast(first_occurrence_date as string) as first_occurrence_date,
            round(expected_hour_transactions, 1) as expected_hour_transactions,
            typ_n,
            baseline_same_regime_n,
            is_school_holiday_flag,
            regime_mismatch_flag,
            -- 06/09/2026 — journee arretee
            is_day_stopped,
            last_sale_hour,
            format_timestamp('%H:%M', last_sale_ts) as last_sale_time,
            stop_hour,
            typical_last_hour,
            stopped_hours,
            round(stopped_expected_revenue) as stopped_expected_revenue,
            round(stopped_expected_transactions, 1) as stopped_expected_transactions,
            round(expected_revenue_until_stop) as expected_revenue_until_stop,
            n_stopped_days_90d,
            stopped_dates_90d,
            -- 06/09/2026 — build 2 : familles de l'heure (JSON [{family, revenue, expected, delta}])
            parse_json(hour_family_gaps) as hour_family_gaps
        )) as data_payload,
        concat('hour_share_move:', location_id, ':', cast(date as string)) as suppression_key,
        date as expires_at
    from (
        select
            s.transaction_date as date, s.location_id, s.transaction_hour,
            s.revenue,
            if(s.is_stop_row, s.stopped_expected_revenue, s.expected_hour_revenue)   as expected_hour_revenue,
            if(s.is_stop_row, -s.stopped_expected_revenue, s.delta_eur)              as delta_eur,
            s.delta_z,
            coalesce(s.direction, if(s.is_stop_row, 'collapse', null))               as direction,
            s.day_revenue, s.expected_day_revenue, s.day_gap_eur, s.typical_share, s.transactions,
            s.n_occurrences_60d, s.first_occurrence_date,
            if(s.is_stop_row, s.stopped_expected_transactions, s.expected_hour_transactions) as expected_hour_transactions,
            s.typ_n, s.baseline_same_regime_n,
            s.is_school_holiday_flag, s.regime_mismatch_flag,
            s.is_stop_row, s.is_day_stopped, s.last_sale_hour, s.last_sale_ts, s.stop_hour, s.typical_last_hour, s.stopped_hours,
            s.stopped_expected_revenue, s.stopped_expected_transactions, s.expected_revenue_until_stop,
            s.n_stopped_days_90d, s.stopped_dates_90d, s.hour_family_gaps,
            row_number() over (partition by s.location_id, s.transaction_date
                               order by s.is_stop_row desc, abs(s.delta_eur) desc) as rn
        from {{ ref('fct_client_hourly_signals_daily') }} s
        inner join loc l on s.location_id = l.location_id
        where (s.is_hour_move = true or s.is_stop_row = true)
          -- 06/09/2026 — PORTE DE RÉGIME (HANDOFF-lot-cartes-2026-09-06) : sans 3 jours du même
          -- régime (vacances / hors vacances) dans la base typique, le fait n'a pas de témoin.
          and s.baseline_same_regime_n >= 3
          and s.transaction_date >= date_sub(current_date(), interval 30 day)
          and s.transaction_date < current_date()
    )
    where rn = 1
),

```

## 3. Message de commit

```
feat(hourly_signals): familles de l'heure — hour_family_gaps nomme les 3 familles au plus grand écart à cette heure (part typique poolée 8 mêmes jours de semaine × attendu de l'heure, même référentiel que delta_eur), seulement sur un mouvement d'heure ; le CTE hour_share_move le porte au payload (JSON). Build 2 owner 06/09.
```

## 4. Après le run

- `SELECT JSON_QUERY(data_payload, '$.hour_family_gaps') FROM semantic.vw_insight_event_action_candidates WHERE
  STARTS_WITH(location_id, 'f10c3e58') AND action_type = 'hour_share_move' AND date = DATE '2026-08-09'` : trois
  familles, Coffee en tête à −48.
- `SELECT COUNTIF(hour_family_gaps IS NOT NULL), COUNTIF(is_hour_move) FROM mart.fct_client_hourly_signals_daily
  WHERE transaction_date >= CURRENT_DATE() - 30` : égaux.

— DÉFINITIF
