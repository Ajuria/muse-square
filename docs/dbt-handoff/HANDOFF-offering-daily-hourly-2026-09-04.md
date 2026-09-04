# Handoff dbt Cloud IDE — lot « jour × famille » et « heure × jour daté » dans la couche semantic (04/09/2026)

Sert : `docs/explorer-dispositif-famille-spec.md` (I8 — ventes, panier moyen du ticket entier, mix par
famille pendant une opération) ; frontière entrepôt : l'app lit `semantic`, jamais `mart`
(`src/lib/warehouseBoundary.guard.test.ts`). Relevé des vues manquantes : mémoire `semantic-views-missing`.
Il n'existait aucune vue semantic au grain JOUR × famille ni au grain HEURE × jour daté : quatre
fichiers de l'app lisent `mart.fct_client_offering_daily` en direct, un lit `mart.fct_client_hourly_sales`.

**Base vérifiée** : `origin/Ajuria-branch` à `532e87a` (03/09, = `main` à un merge près ; les fichiers
touchés sont identiques entre la branche et le checkout local). dbt **1.10.11** (manifest). Fins de
ligne : les fichiers touchés sont en **LF** (`schema_app_surfaces.yml` LF — `schema.yml` est en CRLF, il
n'est PAS touché). Ancres vérifiées uniques par programme ; le yml a été rejoué : il parse, aucun
modèle perdu ni déplacé. **Ordre = ordre du DAG** : mart d'abord, puis les deux vues, puis le yml.

**Constat au passage (important)** : `fct_client_offering_daily` et `fct_client_hourly_sales` n'ont
PAS été reconstruits par le job quotidien depuis le **19/08** (`JOBS_BY_PROJECT` de
`ms-database-472505`, cible `default` : dernier run 2026-08-19 12:14 ; le job du 03/09 05:08 a
construit `fct_client_offering_signals_daily`, `fct_client_hourly_signals_daily` et
`vw_insight_event_client_offering`, pas ces deux marts). Sur f10c3e58 (graine jusqu'au 30/09) rien ne
manque ; sur un compte réel, la lecture des pôles et des marges par famille lit une table figée au
19/08. Le point E ci-dessous les ajoute au job.

**Preuve SQL (exécutée sur BQ le 04/09, refs résolus)** : le corps du mart modifié tourne ; sur
f10c3e58, Coffee 08/08 → `invoice_count` 152, `ticket_revenue_avg` 4,6306 ; 22/08 → 151, 5,9076 —
identiques à un calcul direct sur `raw.client_transactions` (jointures, autre requête). Les deux vues
tournent (3 lignes lues chacune, bornées à aujourd'hui). `is_invoiced` : 0 ligne non facturée sur
f10c3e58 en août.

---

## 1. `ms_dbt/models/ms_open_data/mart/fct_client_offering_daily.sql` — MODIFIER (remplacer le fichier ENTIER)

Cinq endroits changent (colonnes `invoice_number`/`transaction_count` lues, `transaction_count_sum`,
trois CTE `tickets`/`cat_tickets`/`cat_ticket_stats`, la jointure dans `with_shares`, deux colonnes en
sortie) : coller le fichier complet (85 → 124 lignes) plutôt que cinq sélections.

```sql
/*
  MODEL
    fct_client_offering_daily
  GOAL
    Daily product-mix per location at category grain. Mirrors
    int_client_offering_profile (30-day, item grain) but per-day and per-category,
    so the action layer can detect product-mix shifts and surface "what is selling
    today / this category is up or down" context.
  SOURCE
    stg_client_transactions
  GRAIN
    location_id x transaction_date x item_category
  NOTES
    - Coarser than int_client_offering_profile (item-level): daily mix is tracked at
      category grain to stay readable and stable day over day, and category is the
      unit used to match competitor offering data.
    - revenue_share / volume_share / revenue_rank are computed WITHIN each
      (location_id, transaction_date) - intra-day, no cross-day window - so the
      incremental insert_overwrite by day is exact.
    - Uncategorized lines are labelled 'non classe' (ASCII per the mart rule); the
      30-day int model labels the same bucket with an accented variant - normalize
      if you ever join the two on the literal value.
    - 04/09/2026 (app, lecture dispositif x famille - docs/explorer-dispositif-famille-spec.md) :
      invoice_count = tickets contenant la famille (count distinct invoice_number ; repli
      sum(transaction_count) quand la facture n'est pas renseignee - la regle du site,
      int_client_daily_performance) ; ticket_revenue_avg = panier moyen du TICKET ENTIER
      (toutes familles) des tickets contenant la famille. Nouvelles colonnes sur un modele
      insert_overwrite sans on_schema_change : un --full-refresh est requis une fois.
*/
{{ config(
    materialized = 'incremental',
    incremental_strategy = 'insert_overwrite',
    schema = 'mart',
    partition_by = {'field': 'transaction_date', 'data_type': 'date'},
    cluster_by = ['location_id']
) }}
with source as (
select
        location_id,
        client_id,
        transaction_date,
        coalesce(item_category, 'non classe') as item_category,
        quantity,
        revenue,
        unit_price,
        discount_flag,
        invoice_number,
        transaction_count
from {{ ref('stg_client_transactions') }}
where is_invoiced
{% if is_incremental() %}
  and transaction_date >= date_sub(current_date(), interval {{ var('offering_daily_lookback_days', 45) }} day)
{% endif %}
),
cat_daily as (
select
        location_id,
        client_id,
        transaction_date,
        item_category,
        count(*)                      as line_count,
        sum(coalesce(quantity, 1))    as units,
        sum(revenue)                  as revenue,
        avg(unit_price)               as avg_unit_price,
        min(unit_price)               as min_unit_price,
        max(unit_price)               as max_unit_price,
        countif(discount_flag = true) as promo_count,
        sum(coalesce(transaction_count, 1)) as transaction_count_sum
from source
group by location_id, client_id, transaction_date, item_category
),
-- Tickets (04/09) : le ticket ENTIER, toutes familles confondues, par numero de facture.
tickets as (
select location_id, client_id, transaction_date, invoice_number, sum(revenue) as ticket_revenue
from source
where invoice_number is not null
group by 1, 2, 3, 4
),
cat_tickets as (
select distinct location_id, client_id, transaction_date, item_category, invoice_number
from source
where invoice_number is not null
),
cat_ticket_stats as (
select
        ct.location_id, ct.client_id, ct.transaction_date, ct.item_category,
        count(*)               as invoice_count_raw,
        avg(t.ticket_revenue)  as ticket_revenue_avg
from cat_tickets ct
join tickets t
  on t.location_id = ct.location_id and t.client_id = ct.client_id
 and t.transaction_date = ct.transaction_date and t.invoice_number = ct.invoice_number
group by 1, 2, 3, 4
),
with_shares as (
select
        c.*,
        coalesce(nullif(s.invoice_count_raw, 0), c.transaction_count_sum) as invoice_count,
        s.ticket_revenue_avg,
        safe_divide(c.revenue, sum(c.revenue) over (partition by c.location_id, c.transaction_date)) as revenue_share,
        safe_divide(c.units, sum(c.units) over (partition by c.location_id, c.transaction_date))     as volume_share,
        row_number() over (partition by c.location_id, c.transaction_date order by c.revenue desc)   as revenue_rank
from cat_daily c
left join cat_ticket_stats s
  on s.location_id = c.location_id and s.client_id = c.client_id
 and s.transaction_date = c.transaction_date and s.item_category = c.item_category
)
select
    location_id,
    client_id,
    transaction_date,
    item_category,
    line_count,
    units,
    revenue,
    avg_unit_price,
    min_unit_price,
    max_unit_price,
    promo_count,
    round(revenue_share, 4) as revenue_share,
    round(volume_share, 4)  as volume_share,
    revenue_rank,
    invoice_count,
    round(ticket_revenue_avg, 4) as ticket_revenue_avg
from with_shares```

## 2. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_client_offering_daily.sql` — CRÉER
```sql
-- vw_insight_event_client_offering_daily
-- Grain   : location_id × client_id × transaction_date × item_category
-- Purpose : la surface semantic au grain JOUR × famille de produits & services que l'app lisait
--           dans mart.fct_client_offering_daily faute de vue (dispositifFamille.ts, dashboard.ts
--           pôles, prompt.ts marges, insightFamilies/offering.ts — cliquet warehouseBoundary).
--           Passthrough du mart, BORNÉ à aujourd'hui : la graine porte des dates futures
--           (mesuré 24/08 : une « fenêtre 30 j » comptait 68 jours dans la vue offering 30 j).
-- Source  : mart.fct_client_offering_daily (invoice_count, ticket_revenue_avg ajoutés le 04/09).

{{ config(materialized='view') }}

select
    location_id,
    client_id,
    transaction_date,
    item_category,
    line_count,
    units,
    revenue,
    avg_unit_price,
    min_unit_price,
    max_unit_price,
    promo_count,
    revenue_share,
    volume_share,
    revenue_rank,
    invoice_count,
    ticket_revenue_avg
from {{ ref('fct_client_offering_daily') }}
where transaction_date <= current_date()
```

## 3. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_client_hourly_daily.sql` — CRÉER
```sql
-- vw_insight_event_client_hourly_daily
-- Grain   : location_id × client_id × transaction_date × transaction_hour (jours DATÉS)
-- Purpose : la surface semantic heure × jour daté que l'app lisait dans mart.fct_client_hourly_sales
--           (commitmentShape.ts : les heures d'une opération et de ses jours comparables). La seule
--           surface horaire existante, vw_insight_event_client_hourly_profile, est un PROFIL moyen
--           par jour de semaine × heure — pas des jours datés. Passthrough, borné à aujourd'hui.
-- Source  : mart.fct_client_hourly_sales.

{{ config(materialized='view') }}

select
    location_id,
    client_id,
    transaction_date,
    transaction_hour,
    revenue,
    units,
    transactions,
    lines,
    visitors,
    avg_basket,
    conversion_rate
from {{ ref('fct_client_hourly_sales') }}
where transaction_date <= current_date()
```

## 4. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — MODIFIER : déclarer les deux vues (contrat)

**Insérer juste AVANT cette ligne** (unique dans le fichier) :
```yaml
  - name: vw_insight_event_competitors_followed
```
**ce bloc** (867 → 939 lignes) :
```yaml
  - name: vw_insight_event_client_offering_daily
    description: "Surface lue par l'app (04/09) : jour x famille de produits & services, bornee a aujourd'hui ; invoice_count = tickets contenant la famille, ticket_revenue_avg = panier du ticket entier."
    config:
      tags: ["mart_dependent"]
      access: public
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: client_id
        data_type: STRING
      - name: transaction_date
        data_type: DATE
      - name: item_category
        data_type: STRING
      - name: line_count
        data_type: INT64
      - name: units
        data_type: INT64
      - name: revenue
        data_type: FLOAT64
      - name: avg_unit_price
        data_type: FLOAT64
      - name: min_unit_price
        data_type: FLOAT64
      - name: max_unit_price
        data_type: FLOAT64
      - name: promo_count
        data_type: INT64
      - name: revenue_share
        data_type: FLOAT64
      - name: volume_share
        data_type: FLOAT64
      - name: revenue_rank
        data_type: INT64
      - name: invoice_count
        data_type: INT64
      - name: ticket_revenue_avg
        data_type: FLOAT64

  - name: vw_insight_event_client_hourly_daily
    description: "Surface lue par l'app (04/09) : heure x jour DATE des ventes (pas le profil moyen), bornee a aujourd'hui."
    config:
      tags: ["mart_dependent"]
      access: public
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: client_id
        data_type: STRING
      - name: transaction_date
        data_type: DATE
      - name: transaction_hour
        data_type: INT64
      - name: revenue
        data_type: FLOAT64
      - name: units
        data_type: INT64
      - name: transactions
        data_type: INT64
      - name: lines
        data_type: INT64
      - name: visitors
        data_type: INT64
      - name: avg_basket
        data_type: FLOAT64
      - name: conversion_rate
        data_type: FLOAT64

```

## E. Job et exécution (dbt Cloud)

1. **Une fois, avant tout** : `dbt run --select fct_client_offering_daily --full-refresh` — le modèle est
   `insert_overwrite` sans `on_schema_change`, les deux colonnes nouvelles n'apparaissent pas sans
   `--full-refresh`.
2. Puis : `dbt run --select fct_client_hourly_sales vw_insight_event_client_offering_daily vw_insight_event_client_hourly_daily`
   et `dbt test --select vw_insight_event_client_offering_daily vw_insight_event_client_hourly_daily`
   (contrats).
3. **Ajouter au job quotidien** (cible `default`) : `fct_client_offering_daily+ fct_client_hourly_sales+`
   — aujourd'hui le job ne les reconstruit pas (voir constat).

## F. Message de commit (dépôt `ms_database`, branche `Ajuria-branch`)

```
feat(semantic): jour × famille et heure × jour daté — deux vues pour l'app, tickets par famille au mart offering

- fct_client_offering_daily : invoice_count (tickets contenant la famille, repli transaction_count)
  et ticket_revenue_avg (panier du ticket entier) — --full-refresh requis une fois
- vw_insight_event_client_offering_daily : passthrough borné à aujourd'hui (grain jour × famille)
- vw_insight_event_client_hourly_daily : heure × jour daté, borné à aujourd'hui
- schema_app_surfaces.yml : contrats des deux vues

Sert docs/explorer-dispositif-famille-spec.md (app, I8) et le cliquet warehouseBoundary :
dispositifFamille.ts, dashboard.ts, prompt.ts, offering.ts, commitmentShape.ts basculeront sur ces vues.
```

## G. Côté app, après le build (pas dans ce lot)

`dispositifFamille.ts` (part + ventes + panier depuis la vue, plus de lecture `raw`), `dashboard.ts`,
`prompt.ts` (marges), `insightFamilies/offering.ts`, `commitmentShape.ts` → les vues ; le cliquet
`warehouseBoundary.guard.test.ts` baisse d'autant.
