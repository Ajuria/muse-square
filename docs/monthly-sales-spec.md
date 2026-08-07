# Chantier C3 — verdicts MENSUELS par canal (« mois remarquable ») — spec, 07/08/2026

GO owner 07/08 (« go c3 »). Troisième et dernier étage du chantier grain. La
mesure a RENVERSÉ la cible pressentie : ce n'est PAS le studio Paris qui se
juge au mois — c'est le canal PRO (clients en compte) du site principal.

## 0. Ce que la mesure a tranché (07/08)

**Paris (studio) : INJUGEABLE au mois, définitivement.** 11 mois mesurés :
médiane 7 445 €, dispersion p75/p25 = **6,3** (barre ≤ 3), du 92 € (11/2025)
au 18 877 € (05/2026). Le détecteur extrême y tirerait **62 % des mois** — du
grumeau de factures projet, pas un rythme. Et chaque facture parisienne est
écrite PAR Nicolas (facturation directe maison mère) : une carte « votre mois
est bon » serait du 101 sous son niveau. Paris se sert par le grain client
(C1 — déjà en place) et par le RAPPORT (récap factuel), jamais par des alertes.

**Canal direct (pro) du site principal : JUGEABLE au mois.** Mensualisé, le
canal qui était injugeable à la semaine (dispersion hebdo 4,98) devient une
série propre : 11 mois complets, médiane **37 103 €/mois**, dispersion
p75/p25 = **1,69**. Détecteur extrême (< 0,5× / > 2× la médiane des 6 mois
précédents, min 3) : **2 tirs sur 8 mois jugés**, tous réels :

| mois | état | CA | baseline | ratio |
|---|---|---|---|---|
| 12/2025 | pic | 44 225 € | 20 994 € | 2,11 |
| 03/2026 | pic | 81 582 € | 27 845 € | 2,93 |

Le pic de mars se DÉCOMPOSE par client — c'est le différenciateur de la carte
(aucun export Sage n'assemble ça) : FLAIREKREA 23 068 €, PORTHAULTNE 11 734 €,
CHAHAN 8 103 €, FREYPIERRE 7 362 €.

Dernier mois complet (juin, données jusqu'au 27/07) : 40 719 € vs 33 804 —
ratio 1,2, NORMAL → **zéro carte au premier run** (même contrat que C2).

**Doctrine d'escalade des grains, refermée** : on sert le grain le plus fin
qui soit jugeable — jour (sites daily) → semaine (comptoir) → mois (pro) →
client (Paris, et le pro aussi via C1). Un canal servi à la semaine n'est
JAMAIS re-servi au mois (redondance) ; un canal injugeable partout se sert au
grain client et au rapport.

## 1. dbt — NOUVEAU modèle `mart/fct_location_channel_monthly.sql` (fichier complet)

```sql
/*
  MODEL
    fct_location_channel_monthly

  GOAL
    Serie MENSUELLE des ventes facturees par canal, avec verdict de mois
    remarquable — l'etage C3 du chantier grain (docs app monthly-sales-spec.md).
    Cible mesuree (§ 0 de la spec) : le canal pro (clients en compte) du site
    principal Olivades — injugeable a la semaine (dispersion 4,98), propre au
    mois (1,69). Paris reste hors verdicts (dispersion mensuelle 6,3 + factures
    ecrites par l'operateur lui-meme) : son grain est le client (C1) et le rapport.

    DETECTEUR (meme doctrine que C2, un cran au-dessus) :
      baseline     = mediane des 6 mois completes precedents (min 3).
      month_state  = 'hole' si ca < 0.5 x baseline | 'spike' si > 2.0 x
                     | 'low'/'high' a ±30 % (INFORMATIF, jamais une carte)
                     | 'normal' | 'insufficient_baseline' sous 3 mois.
      is_run_start = l'etat differe du mois precedent.
      Mesure : 2 tirs sur 8 mois juges (12/2025 et 03/2026, tous deux reels).

    DIFFERENCIATEUR : top_parties — les 3 comptes qui ont porte le mois
    (libelle + CA), assembles depuis les lignes ; c'est la decomposition
    qu'aucun export caisse ne donne.

    ELIGIBILITE (is_monthly_judgeable — l'ESCALADE DES GRAINS) : >= 6 mois
    completes ET dispersion mensuelle p75/p25 <= 3 ET canal NON jugeable a la
    semaine (fct_location_channel_weekly — on sert le grain le plus fin qui
    marche, jamais deux grains sur le meme canal) ET site non 'daily'
    (fct_location_sales_regime).

    Mois COMPLETS seulement (dernier jour du mois <= data_end du site) ;
    ancrage data_end, jamais current_date. NOTE : un debut de serie en cours de
    mois (Olivades : donnees des le 28/08) laisse un premier mois partiel dans
    les premieres baselines — protege par min 3 et par le fait que les cartes
    ne tirent que sur le DERNIER mois ; l'effet s'eteint apres 6 mois.

  SOURCES
    stg_client_transactions       -- lignes facturees + canal + party (etapes A/B)
    analytics.party_directory     -- libelle lisible des comptes (top_parties)
    fct_location_channel_weekly   -- exclusion des canaux deja servis a la semaine
    fct_location_sales_regime     -- exclusion des sites daily

  GRAIN
    location_id x channel_key x month_start
*/

{{ config(
    materialized = 'table',
    schema       = 'mart'
) }}

with lignes as (
    select
        l.location_id,
        coalesce(l.channel, '__site__') as channel_key,
        l.transaction_date,
        l.revenue,
        l.invoice_number,
        coalesce(pd.party_name, l.party_code) as party_label
    from {{ ref('stg_client_transactions') }} l
    left join {{ source('analytics', 'party_directory') }} pd
      on  pd.source_location_id = l.source_location_id
      and pd.party_code         = l.party_code
    where l.is_invoiced
),

anchored as (
    select
        *,
        max(transaction_date) over (partition by location_id) as data_end
    from lignes
),

mensuel as (
    select
        location_id,
        channel_key,
        date_trunc(transaction_date, month)      as month_start,
        any_value(data_end)                      as data_end,
        round(sum(revenue), 2)                   as ca,
        count(distinct transaction_date)         as active_days,
        count(distinct invoice_number)           as invoices,
        string_agg(
            party_label, ', '
            order by party_label
        )                                        as _all_parties_unused
    from anchored
    group by location_id, channel_key, month_start
),

-- Top 3 comptes du mois — assembles a part (grain compte x mois), puis joints.
top_parties_monthly as (
    select
        location_id,
        channel_key,
        month_start,
        string_agg(
            concat(party_label, ' (', cast(round(party_ca, 0) as string), ' EUR)'),
            ', ' order by party_ca desc limit 3
        ) as top_parties
    from (
        select
            location_id,
            coalesce(channel, '__site__')            as channel_key,
            date_trunc(transaction_date, month)      as month_start,
            coalesce(pd.party_name, t.party_code)    as party_label,
            sum(t.revenue)                           as party_ca
        from {{ ref('stg_client_transactions') }} t
        left join {{ source('analytics', 'party_directory') }} pd
          on  pd.source_location_id = t.source_location_id
          and pd.party_code         = t.party_code
        where t.is_invoiced and t.party_code is not null
        group by 1, 2, 3, 4
    )
    group by location_id, channel_key, month_start
),

completes as (
    select
        m.* except (_all_parties_unused),
        last_day(m.month_start, month) as month_end,
        tp.top_parties
    from mensuel m
    left join top_parties_monthly tp
      using (location_id, channel_key, month_start)
    where last_day(m.month_start, month) <= m.data_end
),

stats as (
    select
        location_id,
        channel_key,
        count(*) as months_observed,
        round(safe_divide(
            approx_quantiles(ca, 4)[offset(3)],
            nullif(approx_quantiles(ca, 4)[offset(1)], 0)
        ), 2)    as iqr_ratio
    from completes
    group by location_id, channel_key
),

baselined as (
    select
        c.*,
        array_agg(c.ca) over (
            partition by c.location_id, c.channel_key
            order by extract(year from c.month_start) * 12 + extract(month from c.month_start)
            range between 6 preceding and 1 preceding
        ) as prev_cas
    from completes c
),

judged as (
    select
        b.* except (prev_cas),
        array_length(b.prev_cas) as baseline_months,
        (select round(approx_quantiles(v, 2)[offset(1)], 2) from unnest(b.prev_cas) v) as baseline_median
    from baselined b
),

stated as (
    select
        j.*,
        round(safe_divide(j.ca, nullif(j.baseline_median, 0)), 2) as month_ratio,
        case
            when j.baseline_months < 3 or j.baseline_median is null or j.baseline_median = 0
                then 'insufficient_baseline'
            when j.ca < 0.5 * j.baseline_median then 'hole'
            when j.ca > 2.0 * j.baseline_median then 'spike'
            when j.ca < 0.7 * j.baseline_median then 'low'
            when j.ca > 1.3 * j.baseline_median then 'high'
            else 'normal'
        end as month_state
    from judged j
),

weekly_flags as (
    select location_id, channel_key, logical_or(is_weekly_judgeable) as is_weekly_judgeable
    from {{ ref('fct_location_channel_weekly') }}
    group by location_id, channel_key
)

select
    s.location_id,
    s.channel_key,
    s.month_start,
    s.month_end,
    s.ca,
    s.active_days,
    s.invoices,
    s.top_parties,
    s.data_end,
    st.months_observed,
    st.iqr_ratio,
    r.sales_grain,
    coalesce(w.is_weekly_judgeable, false) as is_weekly_judgeable,
    (
        st.months_observed >= 6
        and coalesce(st.iqr_ratio, 99) <= 3
        and not coalesce(w.is_weekly_judgeable, false)
        and coalesce(r.sales_grain, 'insufficient') != 'daily'
    ) as is_monthly_judgeable,
    s.baseline_median,
    s.baseline_months,
    s.month_ratio,
    s.month_state,
    coalesce(
        s.month_state != lag(s.month_state) over (
            partition by s.location_id, s.channel_key order by s.month_start
        ),
        true
    ) as is_run_start
from stated s
join stats st using (location_id, channel_key)
left join weekly_flags w using (location_id, channel_key)
left join {{ ref('fct_location_sales_regime') }} r
  on r.location_id = s.location_id
```

## 2. dbt — `mart/fct_location_daily_action_candidates.sql` : les 2 cartes (2 edits)

**Edit 1** — juste après le CTE `weekly_sales_spike` (chantier C2), c'est-à-dire
remplacer :

```sql
    from weekly_channel_latest w
    where w.week_state = 'spike' and w.is_run_start
),
```

par :

```sql
    from weekly_channel_latest w
    where w.week_state = 'spike' and w.is_run_start
),

-- Grain MOIS par canal (chantier C3, docs app monthly-sales-spec.md) : le
-- DERNIER mois complet d'un canal jugeable au mois (escalade des grains — un
-- canal servi a la semaine n'est jamais re-servi au mois). Detecteur § 0 :
-- 2 tirs sur 11 mois (canal pro Olivades), zero au premier run (juin normal).
monthly_channel_latest as (
    select *
    from {{ ref('fct_location_channel_monthly') }}
    where is_monthly_judgeable
    qualify month_start = max(month_start) over (partition by location_id, channel_key)
),

monthly_sales_hole as (
    select
        current_date()                          as date,
        m.location_id,
        'monthly_sales_hole'                    as action_type,
        4                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Mois ', if(m.channel_key = 'direct', 'clients en compte', m.channel_key),
            ' tres en retrait : ', cast(round(m.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            format_date('%m/%Y', m.month_start), ' : ',
            cast(round(m.ca, 0) as string), ' EUR (',
            cast(m.invoices as string), ' factures) — moins de la moitie de vos ',
            cast(m.baseline_months as string), ' derniers mois (mediane ',
            cast(round(m.baseline_median, 0) as string), ' EUR).',
            if(m.top_parties is not null,
               concat(' Principaux comptes du mois : ', m.top_parties, '.'), '')
        ) as detail_fr,
        to_json_string(struct(
            m.channel_key,
            cast(m.month_start as string) as month_start,
            m.ca,
            m.invoices,
            m.active_days,
            m.baseline_median,
            m.baseline_months,
            m.month_ratio,
            m.top_parties,
            cast(m.data_end as string)    as data_end
        )) as data_payload,
        concat('monthly_sales_hole:', m.location_id, ':', m.channel_key, ':', cast(m.month_start as string)) as suppression_key,
        date_add(last_day(m.month_start, month), interval 21 day) as expires_at
    from monthly_channel_latest m
    where m.month_state = 'hole' and m.is_run_start
),

monthly_sales_spike as (
    select
        current_date()                          as date,
        m.location_id,
        'monthly_sales_spike'                   as action_type,
        3                                       as action_priority,
        'performance'                           as action_category,
        'note_interne'                          as channel_hint,
        concat(
            'Mois ', if(m.channel_key = 'direct', 'clients en compte', m.channel_key),
            ' exceptionnel : ', cast(round(m.ca, 0) as string), ' EUR'
        ) as headline_fr,
        concat(
            format_date('%m/%Y', m.month_start), ' : ',
            cast(round(m.ca, 0) as string), ' EUR (',
            cast(m.invoices as string), ' factures) — plus du double de vos ',
            cast(m.baseline_months as string), ' derniers mois (mediane ',
            cast(round(m.baseline_median, 0) as string), ' EUR).',
            if(m.top_parties is not null,
               concat(' Porte par : ', m.top_parties, '.'), '')
        ) as detail_fr,
        to_json_string(struct(
            m.channel_key,
            cast(m.month_start as string) as month_start,
            m.ca,
            m.invoices,
            m.active_days,
            m.baseline_median,
            m.baseline_months,
            m.month_ratio,
            m.top_parties,
            cast(m.data_end as string)    as data_end
        )) as data_payload,
        concat('monthly_sales_spike:', m.location_id, ':', m.channel_key, ':', cast(m.month_start as string)) as suppression_key,
        date_add(last_day(m.month_start, month), interval 21 day) as expires_at
    from monthly_channel_latest m
    where m.month_state = 'spike' and m.is_run_start
),
```

**Edit 2** — dans l'union finale, remplacer :

```sql
    select * from weekly_sales_hole
    union all
    select * from weekly_sales_spike
```

par :

```sql
    select * from weekly_sales_hole
    union all
    select * from weekly_sales_spike
    union all
    select * from monthly_sales_hole
    union all
    select * from monthly_sales_spike
```

**Header** (même geste qu'en C2) : dans la liste des types, sous la ligne
`weekly_sales_hole / _spike`, ajouter :

```
      monthly_sales_hole / _spike       — mois extrême d'un canal jugeable au mois (grain MOIS, C3)
```

et dans AUTHORITATIVE SOURCES, sous la ligne `fct_location_channel_weekly`,
ajouter :

```
    - {{ ref('fct_location_channel_monthly') }}          -- location_id × channel_key × month_start
                                                             (grain mois, C3)
```

## 3. dbt — tests (mart schema.yml, à la suite de l'entrée fct_location_channel_weekly)

```yaml
  - name: fct_location_channel_monthly
    description: >
      Serie mensuelle des ventes facturees par canal + verdict de mois remarquable
      (hole < 0,5x / spike > 2x la mediane des 6 mois precedents, min 3) +
      top_parties (les 3 comptes du mois). Escalade des grains : jugeable au mois
      seulement si NON jugeable a la semaine et site non daily. Calibre le 07/08 :
      canal pro Olivades jugeable (dispersion 1,69), Paris exclu (6,3), 2 tirs
      reels sur 11 mois. Sert monthly_sales_hole / monthly_sales_spike.
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, channel_key, month_start]
    columns:
      - name: location_id
        tests: [not_null]
      - name: channel_key
        tests: [not_null]
      - name: month_start
        tests: [not_null]
      - name: ca
        tests: [not_null]
      - name: month_state
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['hole', 'spike', 'low', 'high', 'normal', 'insufficient_baseline']
```

## 4. App (Claude, après le run dbt)

SPECS `monthly_sales_hole` / `monthly_sales_spike` (copie accentuée : mois
MM/AAAA, CA/médiane fr-FR, « Porté par : … » depuis top_parties, données
jusqu'au) ; thème « ventes » + parité ; allowlist AVEC plans reco-library
(diagnostic par comptes → réassort/capacité → rejouer en mesurant) ;
cache-busters. Vérification vm sur les lignes réelles (pic 03/2026 : 81 582 €,
FLAIREKREA en tête).

## 5. Run + VALIDATION (contrat chiffré)

1. Studio : `dbt build --select fct_location_channel_monthly fct_location_daily_action_candidates`.
2. Mart — attendu : (site principal, direct) `is_monthly_judgeable` TRUE,
   ~11-12 mois complets, 2 `spike` en `is_run_start` (12/2025, 03/2026) ;
   comptoir FALSE (déjà servi à la semaine) ; Paris FALSE (dispersion) ;
   seeds FALSE (site daily) :

```sql
select location_id, channel_key, countif(is_monthly_judgeable) judgeables, count(*) mois,
       countif(month_state = 'spike' and is_run_start) pics,
       countif(month_state = 'hole' and is_run_start) trous
from `muse-square-open-data.mart.fct_location_channel_monthly`
group by 1, 2 order by 3 desc, 1;
```

3. Cartes — attendu : **ZÉRO** `monthly_sales_*` (dernier mois complet = juin,
   ratio 1,2, normal). Le premier tir viendra d'un mois qui le mérite.
4. Régression : cartes jour / client_dormant / weekly inchangées.

## 6. Hors périmètre (queue)

- Paris : servi par C1 (grain client) + RAPPORT (récap mensuel factuel par
  canal — consommateur naturel des marts weekly/monthly, chantier rapport).
- Baseline saisonnière mensuelle (même mois année précédente) — ~09/2026.
- Le chantier grain est REFERMÉ côté détection : jour → semaine → mois →
  client, chaque canal servi au grain le plus fin jugeable, mesuré jamais
  décrété. La suite du chantier C est du côté SERVICE : rapport par canal,
  Consulter (« où en est CHAHAN ? »), baselines saisonnières à l'an plein.
