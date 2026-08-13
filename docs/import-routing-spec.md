# Routage d'import des ventes — spec étape A (06/08/2026, GO owner)

Décisions owner (06/08) : préfixe `F*` = facture (FR/FV inclus) ; suffixe `PA/PAT` = Esprit
de Fabrique — pour l'instant. Principe : **le raw reste fidèle au fichier** (c'est ce qui a
permis la validation au centime de l'analyse JF) ; le sens s'applique au STAGING via des
règles déclaratives par compte, parce qu'un fichier = plusieurs flux/sites se reproduira
(Houdan, tout Sage multi-flux). Application dbt = owner (Studio) ; table de règles = app.

## 0. Chiffres de référence (validés sur les 6 297 lignes réelles, 06/08)

| Site routé | Facturé | Lignes / CA |
|---|---|---|
| Les Olivades (14379e18) | oui | 5 701 / **588 851 €** (FC + FR + FV) |
| Les Olivades | non | 257 / 148 849 € (CC + DC + BC + PC) |
| Esprit de Fabrique (2dc69ea6) | oui | 145 / **74 477 €** (FAPA) |
| Esprit de Fabrique | non | 194 / 147 553 € (DPAT + BCPAT) |

Totaux : facturé 663 328 € ✓ (JF : 661 776 €, écart = 11 lignes de dédup d'import) ;
non facturé **296 402 € ✓ exact**. Ces nombres sont le CONTRAT de la validation post-run.

## 1. Table de règles (FAIT côté app, 06/08 — DDL exécuté, 2 règles insérées)

`analytics.import_routing_rules` (app-write, DML — l'app les posera à l'onboarding, UI plus
tard) : rule_id, clerk_user_id, source_location_id, source_system (NULL = toutes),
invoice_regex, target_location_id (NULL = pas de re-routage), is_invoiced (NULL = pas
d'avis), priority, enabled, note, created_at, updated_at.

Règles actives (Olivades) :
- `oliv-pat-esprit` (prio 10) : regex `^[A-Za-z]*(PA|PAT)[0-9]` → target 2dc69ea6 (Esprit).
- `oliv-nonfacture` (prio 20) : regex `^[DdCcBbPp]` → is_invoiced FALSE.
Défaut sans règle : is_invoiced TRUE, site inchangé → **les autres tenants (seed, café…)
sont strictement inchangés**.

Contrainte de conception v1 : au plus UNE règle par facette peut matcher une ligne (nos 2
règles sont disjointes par facette) — le test d'unicité du grain du staging la police ; un
chevauchement dupliquerait des lignes et ferait ÉCHOUER ce test, jamais un double silencieux.

## 2. dbt — `models/ms_open_data/staging/sources.yml` (AJOUT)

Sous `- name: analytics` (ligne ~287) → `tables:`, ajouter :

```yaml
      - name: import_routing_rules
        identifier: import_routing_rules
        description: >
          Règles de routage d'import des ventes par compte (app-write) : re-routage de site
          et facturé/non-facturé par motif de référence de pièce. Lues par
          stg_client_transactions. Défaut sans règle : site inchangé, is_invoiced = TRUE.
```

## 3. dbt — `stg_client_transactions.sql` : FICHIER COMPLET DE REMPLACEMENT

```sql
/*
  MODEL
    stg_client_transactions

  GOAL
    Clean, typed staging contract over raw.client_transactions.
    Normalizes strings, casts types, enforces null safety.
    One row per invoice line item.

    ROUTAGE D'IMPORT (06/08/2026, docs app import-routing-spec.md) : le raw reste fidèle au
    fichier importé ; ce staging applique les règles déclaratives par compte
    (analytics.import_routing_rules) — deux facettes indépendantes :
      - re-routage de SITE (un fichier peut porter plusieurs établissements ;
        ex. Olivades : souches suffixe PA/PAT = Esprit de Fabrique) ;
      - is_invoiced (devis/commandes/bons exclus du CA de mesure par les consommateurs,
        CONSERVÉS ici — c'est le pipeline commercial, pas du déchet).
    Défaut sans règle : site inchangé, is_invoiced = TRUE (tenants sans règles inchangés).
    Contrainte v1 : au plus une règle par facette matche une ligne — le test d'unicité du
    grain police tout chevauchement (fan-out du join → doublon → test rouge).

  SOURCE
    raw.client_transactions × analytics.import_routing_rules (app-write)

  GRAIN
    location_id × transaction_date × invoice_number × item_code
    (one row per line item — location_id est le site ROUTÉ ; l'original vit dans
    source_location_id)
*/

{{ config(
    materialized = 'view',
    schema       = 'staging'
) }}

with src as (
    select
        cast(location_id           as string)    as location_id,
        cast(client_id             as string)    as client_id,
        cast(transaction_date      as date)      as transaction_date,
        cast(transaction_datetime  as timestamp) as transaction_datetime,
        cast(transaction_hour      as int64)     as transaction_hour,
        cast(revenue               as float64)   as revenue,
        cast(discount_amount       as float64)   as discount_amount,
        cast(transaction_count     as int64)     as transaction_count,
        cast(visitor_count         as int64)     as visitor_count,
        cast(avg_basket            as float64)   as avg_basket,
        cast(category              as string)    as category,
        cast(item_code             as string)    as item_code,
        cast(item_description      as string)    as item_description,
        cast(item_category         as string)    as item_category,
        cast(unit_price            as float64)   as unit_price,
        cast(quantity              as int64)     as quantity,
        cast(customer_type         as string)    as customer_type,
        cast(channel               as string)    as channel,
        cast(payment_method        as string)    as payment_method,
        cast(discount_flag         as bool)      as discount_flag,
        cast(invoice_number        as string)    as invoice_number,
        cast(source_system         as string)    as source_system,
        cast(source_type           as string)    as source_type,
        cast(currency              as string)    as currency,
        cast(ingested_at           as timestamp) as ingested_at
    from {{ source('raw_clients', 'client_transactions') }}
),

cleaned as (
    select
        location_id,
        nullif(trim(client_id), '')             as client_id,
        transaction_date,
        transaction_datetime,
        coalesce(
            transaction_hour,
            extract(hour from transaction_datetime)
        )                                        as transaction_hour,
        coalesce(revenue, 0.0)                   as revenue,
        coalesce(discount_amount, 0.0)           as discount_amount,
        coalesce(transaction_count, 1)           as transaction_count,
        visitor_count,
        coalesce(avg_basket, safe_divide(revenue, nullif(transaction_count, 0))) as avg_basket,
        nullif(trim(category), '')               as category,
        nullif(trim(item_code), '')              as item_code,
        nullif(trim(item_description), '')       as item_description,
        nullif(trim(item_category), '')          as item_category,
        unit_price,
        quantity,
        nullif(trim(customer_type), '')          as customer_type,
        nullif(trim(channel), '')                as channel,
        nullif(trim(payment_method), '')         as payment_method,
        coalesce(discount_flag, false)           as discount_flag,
        nullif(trim(invoice_number), '')         as invoice_number,
        nullif(trim(source_system), '')          as source_system,
        nullif(trim(source_type), '')            as source_type,
        coalesce(nullif(trim(currency), ''), 'EUR') as currency,
        coalesce(ingested_at, current_timestamp()) as ingested_at
    from src
    where location_id is not null
      and transaction_date is not null
),

-- Règles actives, une lecture (table minuscule — quelques lignes par compte).
-- JOIN et non sous-requête corrélée : BigQuery refuse la corrélation multi-table ici
-- (vérifié 06/08).
routing_rules as (
    select source_location_id, source_system, invoice_regex, target_location_id, is_invoiced
    from {{ source('analytics', 'import_routing_rules') }}
    where enabled = true
),

routed as (
    select
        c.*,
        rl.target_location_id as routed_location_id,
        ri.is_invoiced        as rule_is_invoiced
    from cleaned c
    left join routing_rules rl
      on  rl.target_location_id is not null
      and rl.source_location_id = c.location_id
      and (rl.source_system is null or rl.source_system = c.source_system)
      and regexp_contains(coalesce(c.invoice_number, ''), rl.invoice_regex)
    left join routing_rules ri
      on  ri.is_invoiced is not null
      and ri.source_location_id = c.location_id
      and (ri.source_system is null or ri.source_system = c.source_system)
      and regexp_contains(coalesce(c.invoice_number, ''), ri.invoice_regex)
)

select
    coalesce(routed_location_id, location_id)   as location_id,
    location_id                                  as source_location_id,
    coalesce(rule_is_invoiced, true)             as is_invoiced,
    client_id,
    transaction_date,
    transaction_datetime,
    transaction_hour,
    revenue,
    discount_amount,
    transaction_count,
    visitor_count,
    avg_basket,
    category,
    item_code,
    item_description,
    item_category,
    unit_price,
    quantity,
    customer_type,
    channel,
    payment_method,
    discount_flag,
    invoice_number,
    source_system,
    source_type,
    currency,
    ingested_at
from routed
```

## 4. dbt — les 4 consommateurs : la mesure ne compte que le facturé

**`intermediate/int_client_daily_performance.sql`** — dans `daily_agg`, remplacer :
```sql
    from {{ ref('stg_client_transactions') }}
    {% if is_incremental() %}
```
par :
```sql
    from {{ ref('stg_client_transactions') }}
    -- CA de mesure = FACTURÉ seul (devis/commandes/bons portés par le staging mais exclus).
    where is_invoiced
    {% if is_incremental() %}
```
et, dans le bloc incrémental qui suit, le `where transaction_date in (` devient
`and transaction_date in (` (la sous-requête interne des dates touchées reste SANS filtre —
une ingestion de devis doit aussi rafraîchir sa partition).

**`intermediate/int_client_offering_profile.sql`** (l. ~27) — remplacer :
```sql
    where transaction_date >= date_sub(current_date(), interval 30 day)
      and item_description is not null
```
par :
```sql
    where transaction_date >= date_sub(current_date(), interval 30 day)
      and item_description is not null
      and is_invoiced
```

**`mart/fct_client_offering_daily.sql`** (l. ~41) — remplacer :
```sql
from {{ ref('stg_client_transactions') }}
{% if is_incremental() %}
where transaction_date >= date_sub(current_date(), interval {{ var('offering_daily_lookback_days', 45) }} day)
{% endif %}
```
par :
```sql
from {{ ref('stg_client_transactions') }}
where is_invoiced
{% if is_incremental() %}
  and transaction_date >= date_sub(current_date(), interval {{ var('offering_daily_lookback_days', 45) }} day)
{% endif %}
```

**`mart/fct_client_hourly_sales.sql`** (l. ~25) — remplacer :
```sql
    where transaction_hour is not null
      and transaction_date is not null
```
par :
```sql
    where transaction_hour is not null
      and transaction_date is not null
      and is_invoiced
```

## 5. dbt — tests (schema du staging, sous l'entrée `stg_client_transactions` ; la créer si absente)

```yaml
      - name: is_invoiced
        description: >
          FALSE = document non facturé (devis/commande/bon, règle par compte) — porté par le
          staging, exclu du CA par les consommateurs de mesure. Défaut TRUE sans règle.
        tests: [not_null]
      - name: source_location_id
        description: "Site d'ORIGINE du fichier importé (avant re-routage) — audit/debug."
        tests: [not_null]
```

## 6. Run + VALIDATION (contrat chiffré)

1. `dbt build --full-refresh --select stg_client_transactions+` (= le job
   `client_sales_full_refresh (after upload)`, un Run now suffit).
2. Valider contre le § 0 :
```sql
select location_id, count(*) n, round(sum(daily_revenue)) ca
from `muse-square-open-data.intermediate.int_client_daily_performance`
where location_id in ('14379e18-2060-4b50-871d-edf0818eab8c','2dc69ea6-1d5a-4257-876e-162d07168633')
group by 1
-- attendu : 14379e18 ≈ 588 851 € ; 2dc69ea6 ≈ 74 477 € (Esprit s'ALLUME) ; plus aucun jour à 14-53 k€
```
3. Re-mesurer le bruit (avant/après) : le taux de jours < 70 % du 30 j chez Olivades doit
   s'effondrer (référence avant : 57 %).

## 7. Hors périmètre étape A (suivis notés)

- Lecteurs app du RAW en direct (provider événement famille K8, mesure famille) : voient
  encore les non-facturés — correctif app à part (lire les marts ou appliquer is_invoiced).
- Étape B (boutique vs pro dans FC) : exige la colonne compte tiers au prochain export
  (COMPTOIRSEG = boutique). Rules prêtes à l'accueillir (nouvelle facette channel).
- Confirmations JF : FR/FV bien factures ; PA/PAT couvre tout Esprit de Fabrique.
