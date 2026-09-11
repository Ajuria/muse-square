# Handoff dbt — réponse aux signaux par famille (11/09/2026) — EN BASE : `document_types` (seed), `stg_client_transactions.sql`, `int_location_day_cells.sql`, `int_location_day_class_membership.sql`, `fct_location_day_class_impacts.sql`, `fct_client_family_day_class_response.sql`, trois `vw_insight_event_*`, `schema_grain.yml`, `schema_app_surfaces.yml`

> **11/09, 17 h 20 — EN BASE.** PR [ms_database#146](https://github.com/Ajuria/ms_database/pull/146) fusionnée (`813176f`) ; run ponctuel dbt Cloud `70471897062675` (job `refresh_industry`, étapes de remplacement `dbt seed --select document_types` puis `dbt build --select stg_client_transactions int_location_day_cells+`, 5 étapes vertes, 1 min 07). Vérifié `INFORMATION_SCHEMA` 15 h 17 UTC : `open_data.document_types` (5 lignes), `int_location_day_cells`, `int_location_day_class_membership` (2 804 lignes, 6 sites), `fct_location_day_class_impacts` (224), `fct_client_family_day_class_response` (1 950 ; f10c3e58 = 500, 9 familles), les trois vues ; `stg_client_transactions` porte `document_type` et `document_kind`, 202 895 lignes = raw, 202 444 facturées = avant. Catalogue régénéré (554 tables, 9 988 colonnes). **Ce document est un instantané ; l'état vit dans `docs/reponse-aux-signaux-par-famille.md` (DÉFINITIF).**
>
> Historique — **les fichiers sont dans la PR [ms_database#146](https://github.com/Ajuria/ms_database/pull/146)** (branche `feat/signaux-famille`, commit `12d42f0` sur `origin/main` `f57d632`, 13 fichiers, +762 / −2). Constat qui a mené là : le premier build de l'owner (« Success », 5 nœuds) a recréé `stg_client_transactions` à l'IDENTIQUE et `dbt ls --select document_types int_location_day_cells+` a répondu « No nodes selected » — le dbt Cloud CLI envoie le CLONE LOCAL (`~/Documents/ms_database`, branche `fix/arrondissement-commune`, propre), où aucun fichier collé n'existait. Un collage dans l'IDE web n'atteint pas le Cloud CLI, et inversement. Après fusion : `git pull` sur `main` PUIS les deux commandes de build (ou un run ponctuel du job `refresh_industry` avec des étapes de remplacement, que je lance).

Sert : `docs/reponse-aux-signaux-par-famille-spec.md` (lot A dbt, décisions owner du 11/09 § 6) — le moteur des
classes de jours de l'app entre dans dbt et gagne le grain FAMILLE ; le type de document de caisse entre à
l'ingestion. Aucune lecture app dans ce lot.

**Base vérifiée** : `origin/main` à `f57d632` (PR #145, 11/09). Les quatre fichiers modifiés ou complétés
(`stg_client_transactions.sql`, `schema_grain.yml`, `schema_app_surfaces.yml`, `exposures.yml`) sont en **LF**
(`file`, 11/09). dbt **1.10.11** (`target/manifest.json`) : `access`, `tags`, `contract` sous `config:` dans
les yml, comme les blocs voisins. Chaque `ref()` livré pointe sur un nœud présent dans `origin/main` ou livré
à un numéro inférieur — **vérifié par programme le 11/09 (9 fichiers, ordre valide)**.

**Preuves BigQuery (11/09, EU, refs résolus, résultats dans `_audit_scratch.lotA_*_20260911`)** :
- Les quatre modèles 3 → 6 passent le `--dry_run` et sont matérialisés.
- `fct_location_day_class_impacts` contre le moteur app exécuté au même instant, jointure site × classe ×
  base × métrique : **137 / 137 lignes identiques** (toutes colonnes, 1e-6 €, 1e-9 log) sur les classes
  déterministes (météo, calendrier, mobilité) ; 54 / 89 sur les classes à terciles — divergence voulue
  (`percentile_disc` exact contre `approx_quantiles`, qui rend 343,7 ou 347,9 d'un run à l'autre sur le
  même site ; l'app diffère d'elle-même sur 5 lignes / 232).
- `fct_client_family_day_class_response` : 1 950 lignes, 6 sites, 19 familles, 6 métriques ; f10c3e58 = 500 lignes.
- `stg_client_transactions` patché, rejoué sur le fichier réel d'`origin/main` puis compilé (seed inliné) :
  **raw 202 895 = staging 202 895 lignes ; facturées 202 444 avant et après** (la staging en base dit
  202 444) — zéro écart tant que `document_type` est NULL. Sonde : une facture forcée à
  `source_system = 'crisalid'`, `document_type = 'IVD'` → 2 lignes `document_kind = 'invendu'`,
  `is_invoiced = FALSE`, facturées 202 442. Le seed mord, et seulement sur sa caisse.
- `raw.client_transactions.document_type` (STRING, nullable) est **EN BASE** — ALTER additif exécuté le
  11/09 côté app, vérifié `INFORMATION_SCHEMA`.

**Ordre = ordre du DAG** : 1. seed → 2. staging → 3-4. intermédiaire → 5-6. marts → 7-9. vues semantic →
10-11. yml → 12. exposures. Dix fichiers à CRÉER (coller tel quel), un fichier à REMPLACER en entier
(le staging : rejoué par programme, +16 / −2 lignes, rien d'autre ne bouge), trois blocs à AJOUTER en fin
de fichier yml.

---

## 1. `ms_dbt/seeds/open_data/caisse/document_types.csv` — CRÉER (dossier nouveau)

```csv
source_system,document_code,label_fr,kind,counts_as_sale
crisalid,IVT,Inventaire,stock,false
crisalid,EST,Entrée de stock,stock,false
crisalid,SST,Sortie de stock,stock,false
crisalid,IVD,Invendus,invendu,false
crisalid,RUP,Rupture,stock,false
```

## 2. `ms_dbt/seeds/open_data/caisse/schema.yml` — CRÉER

```yaml
version: 2

# Types de document d'une caisse et ce qu'ils valent pour la mesure (owner 11/09, décision 2 du chantier
# profit par grain). Codes Crisalid cités dans docs/strategie-entreprise.md § 9.2 (spec NF525, lue le
# 05/09) ; les codes de VENTE et de RETOUR n'y entrent qu'à la lecture de l'export de détail — jamais
# devinés. kind ∈ vente | devis_commande | stock | invendu | retour | autre.
# counts_as_sale = la ligne entre dans le CA de mesure (is_invoiced) ; un code absent du seed vaut NULL,
# donc le défaut d'aujourd'hui (is_invoiced = TRUE sauf règle de routage).

seeds:
  - name: document_types
    description: "Types de document par caisse (source_system × document_code) → nature (kind) et comptabilisation en vente (counts_as_sale)."
    config:
      column_types:
        source_system: string
        document_code: string
        label_fr: string
        kind: string
        counts_as_sale: bool
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [source_system, document_code]
    columns:
      - name: source_system
        tests: [not_null]
      - name: document_code
        tests: [not_null]
      - name: kind
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['vente', 'devis_commande', 'stock', 'invendu', 'retour', 'autre']
```

## 3. `ms_dbt/models/ms_open_data/staging/stg_client_transactions.sql` — REMPLACER LE FICHIER ENTIER

Rejoué par programme sur `origin/main` (six ancres, chacune vérifiée UNIQUE) : `document_type` lu dans
`src` et `cleaned`, jointure au seed dans `routed`, `is_invoiced = coalesce(rule_is_invoiced,
document_counts_as_sale, true)`, `document_type` et `document_kind` dans le select final. 206 → 220 lignes.

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

    CANAL PAR FACTURE (06/08/2026, docs app channel-grain-spec.md) — 3e facette :
    analytics.import_invoice_parties rattache chaque facture à son compte tiers
    (rattrapage d'historiques importés sans colonne tiers) ; analytics.party_directory
    porte le canal certain du compte ('comptoir' = caisse). Dérivation :
      channel = canal du tiers si connu ; sinon 'direct' si un tiers existe
      (facturation sur compte) ; sinon la valeur du fichier importé (NULL aujourd'hui —
      le futur re-export avec colonne tiers convergera ici sans changer les consommateurs).
    Contrainte v1 (les 3 facettes) : au plus un match par facette et par ligne —
    policée par tests/assert_stg_client_transactions_no_routing_fanout (conservation
    stricte du nombre de lignes raw = staging ; le grain 4 colonnes n'est PAS unique,
    441 clés en doublon légitimes mesurées le 06/08).

  SOURCE
    raw.client_transactions × analytics.import_routing_rules
    × analytics.import_invoice_parties × analytics.party_directory (app-write)

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
        -- 06/09/2026 : lignes vendues au POIDS (Crisalid, périssables) — un INT64 arrondit à zéro.
        -- Colonne raw additive quantity_decimal (ALTER 06/09) ; quantity entier reste pour les consommateurs existants.
        cast(quantity_decimal      as float64)   as quantity_decimal,
        cast(customer_type         as string)    as customer_type,
        cast(channel               as string)    as channel,
        cast(payment_method        as string)    as payment_method,
        cast(discount_flag         as bool)      as discount_flag,
        cast(invoice_number        as string)    as invoice_number,
        cast(source_system         as string)    as source_system,
        cast(source_type           as string)    as source_type,
        -- 11/09/2026 : type de document de la caisse (Crisalid : IVT, EST, SST, IVD, RUP… ; NULL pour les
        -- caisses qui ne le donnent pas). Colonne raw additive document_type (ALTER 11/09, app).
        cast(document_type         as string)    as document_type,
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
        -- 23/08 : un datetime a minuit PILE (00:00:00) n'est pas une heure de vente — c'est ce que
        -- l'import fabrique quand la source n'en porte pas (Sage 100 des Olivades : 5 958 / 5 958
        -- lignes a 00:00:00). Avant, extract(hour) rendait 0 et fct_client_hourly_sales rangeait
        -- toute la journee a « 0 h » — un faux zero qui ressemble a une mesure. NULL desormais,
        -- que le mart horaire exclut deja (where transaction_hour is not null).
        -- Execute sur raw avant livraison : 4 demos inchangees (15 heures), Olivades 6 297 -> NULL.
        coalesce(
            transaction_hour,
            case when transaction_datetime is not null
                  and not (extract(hour from transaction_datetime) = 0 and extract(minute from transaction_datetime) = 0 and extract(second from transaction_datetime) = 0)
                 then extract(hour from transaction_datetime) end
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
        coalesce(quantity_decimal, cast(quantity as float64)) as quantity_decimal,
        -- 10/09 (owner) : UNE PESÉE COMPTE POUR UNE VENTE — la convention de la caisse elle-même : le ticket
        -- Crisalid d'Épices et Tout du 09/09 imprime « TOTAL ( 6) » pour six pesées (3,255 kg). Une quantité
        -- non entière est une pesée : elle compte pour une vente, du signe de la ligne (un retour pesé
        -- compte −1). Sinon la quantité entière, NULL conservé — chaque modèle garde sa règle de NULL.
        -- L'arrondi de l'import (0,740 kg → 1, 0,170 kg → 0) ne compte plus comme un nombre de ventes.
        -- Lu par int_client_offering_profile, fct_client_hourly_sales, fct_client_item_signals_daily,
        -- fct_client_offering_daily à la place de quantity.
        case
            when abs(coalesce(quantity_decimal, cast(quantity as float64))
                     - round(coalesce(quantity_decimal, cast(quantity as float64)))) > 1e-9
                then cast(sign(coalesce(quantity_decimal, cast(quantity as float64))) as int64)
            else quantity
        end                                      as units_sold,
        nullif(trim(customer_type), '')          as customer_type,
        nullif(trim(channel), '')                as channel,
        nullif(trim(payment_method), '')         as payment_method,
        coalesce(discount_flag, false)           as discount_flag,
        nullif(trim(invoice_number), '')         as invoice_number,
        nullif(trim(source_system), '')          as source_system,
        nullif(trim(source_type), '')            as source_type,
        nullif(trim(document_type), '')          as document_type,
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
        ri.is_invoiced        as rule_is_invoiced,
        ip.party_code         as mapped_party_code,
        pd.channel            as party_channel,
        dt.kind               as document_kind,
        dt.counts_as_sale     as document_counts_as_sale
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
    left join {{ source('analytics', 'import_invoice_parties') }} ip
      on  ip.source_location_id = c.location_id
      and ip.source_system      = c.source_system
      and ip.invoice_number     = c.invoice_number
    left join {{ source('analytics', 'party_directory') }} pd
      on  pd.source_location_id = c.location_id
      and pd.party_code         = ip.party_code
    -- 11/09/2026 : le type de document dit s'il compte comme vente (seed document_types, clé unique).
    left join {{ ref('document_types') }} dt
      on  dt.source_system = c.source_system
      and dt.document_code = c.document_type
)

select
    coalesce(routed_location_id, location_id)   as location_id,
    location_id                                  as source_location_id,
    -- Facturé = règle de routage si elle existe, sinon ce que dit le type de document (seed), sinon TRUE.
    -- Une ligne sans document_type ou à code inconnu garde le comportement d'aujourd'hui.
    coalesce(rule_is_invoiced, document_counts_as_sale, true) as is_invoiced,
    mapped_party_code                            as party_code,
    case
        when party_channel is not null      then party_channel
        when mapped_party_code is not null  then 'direct'
        else channel
    end                                          as channel,
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
    quantity_decimal,
    units_sold,
    customer_type,
    payment_method,
    discount_flag,
    invoice_number,
    source_system,
    source_type,
    document_type,
    document_kind,
    currency,
    ingested_at
from routed
```

## 4. `ms_dbt/models/ms_open_data/intermediate/int_location_day_cells.sql` — CRÉER

```sql
/*
  MODEL
    int_location_day_cells

  GOAL
    La TRAME des jours de vente d'un site pour le moteur des classes de jours : un jour = une
    ligne, avec sa cellule de contrôle (mois × semaine/week-end) et son nombre d'appartenances
    aux classes (pureté). Port À L'IDENTIQUE du CTE `counted` de
    src/lib/kpi/dayClassRegistry.ts (dayClassAggregateSql, app Muse Square) — mêmes seuils, même
    fenêtre 730 j ; seule divergence voulue : terciles EXACTS (percentile_disc), voir le CTE th. Un jour est un jour de vente s'il porte un
    résultat habituel (fct_client_day_residual : CA > 0, jours passés).

  SOURCES
    {{ ref('fct_location_context_daily') }}            lvl_*, flags calendrier, ft_day_mean
    {{ ref('fct_client_day_residual') }}                les jours de vente (grain site × jour)
    {{ ref('fct_location_context_features_daily') }}    competition_index_local, tourism_index_region,
                                                         mobility_disruption_flag_event_window
    {{ ref('fct_location_events_radius_daily') }}       events_within_{500m,1km,20km}_count
    {{ ref('dim_client_location') }}                    client_catchment (rayon déclaré)
    {{ ref('fct_client_daily_performance') }}           daily_visitors (classe traffic_high)
    {{ ref('fct_competitor_events_conflicts') }} × {{ ref('fct_competitor_threat_profile') }}
                                                         activité des suivis (is_followed)

  GRAIN
    location_id × date (jours de vente des 730 derniers jours, ≤ aujourd'hui)
*/
{{ config(materialized = 'table', schema = 'intermediate', cluster_by = ['location_id'], tags = ['mart_dependent']) }}

with suivis_daily as (
    select f.location_id, d as date, count(*) as active_ct
    from {{ ref('fct_competitor_events_conflicts') }} f
    join {{ ref('fct_competitor_threat_profile') }} tp
      on tp.location_id = f.location_id and tp.competitor_id = f.competitor_id,
    unnest(generate_date_array(
        f.event_date,
        least(coalesce(f.event_date_end, f.event_date), date_add(f.event_date, interval 366 day))
    )) as d
    where tp.is_followed = true and f.event_date is not null
    group by 1, 2
),

joined as (
    select
        c.location_id,
        c.date,
        -- Classe météo : balayage par niveau DÉCROISSANT, égalité stricte sur le niveau ; à sévérité
        -- égale l'ordre est chaleur, pluie, vent, neige, froid (WEATHER_DAY_CLASSES de l'app).
        -- heat_25_27 = lvl_heat 1 seulement ; heat_28_plus = lvl_heat >= 2.
        case
            when c.lvl_heat = 4 then 'heat_28_plus' when c.lvl_rain = 4 then 'rain' when c.lvl_wind = 4 then 'wind' when c.lvl_snow = 4 then 'snow' when c.lvl_cold = 4 then 'cold'
            when c.lvl_heat = 3 then 'heat_28_plus' when c.lvl_rain = 3 then 'rain' when c.lvl_wind = 3 then 'wind' when c.lvl_snow = 3 then 'snow' when c.lvl_cold = 3 then 'cold'
            when c.lvl_heat = 2 then 'heat_28_plus' when c.lvl_rain = 2 then 'rain' when c.lvl_wind = 2 then 'wind' when c.lvl_snow = 2 then 'snow' when c.lvl_cold = 2 then 'cold'
            when c.lvl_heat = 1 then 'heat_25_27'   when c.lvl_rain = 1 then 'rain' when c.lvl_wind = 1 then 'wind' when c.lvl_snow = 1 then 'snow' when c.lvl_cold = 1 then 'cold'
        end as weather_class,
        c.is_school_holiday_flag as school_flag,
        c.is_public_holiday_flag as holiday_flag,
        c.is_weekend_flag        as weekend_flag,
        extract(month from c.date) as month_num,
        f.competition_index_local,
        f.tourism_index_region,
        coalesce(f.mobility_disruption_flag_event_window, false) as mobility_flag,
        -- Périmètre de clientèle déclaré (docs app perimetre-client-spec.md) : commune → 1 km,
        -- beyond → 20 km, sinon 500 m.
        case dcl.client_catchment
            when 'commune' then e.events_within_1km_count
            when 'beyond'  then e.events_within_20km_count
            else                e.events_within_500m_count
        end as events_radius,
        coalesce(sv.active_ct, 0) as suivis_ct,
        perf.daily_visitors as visitors
    from {{ ref('fct_location_context_daily') }} c
    join {{ ref('fct_client_day_residual') }} r
      on r.location_id = c.location_id and r.date = c.date
    left join {{ ref('fct_location_context_features_daily') }} f
      on f.location_id = c.location_id and f.date = c.date
     and f.date >= date_sub(current_date(), interval 730 day) and f.date <= current_date()
    left join {{ ref('fct_location_events_radius_daily') }} e
      on e.location_id = c.location_id and e.date = c.date
     and e.date >= date_sub(current_date(), interval 730 day) and e.date <= current_date()
    left join suivis_daily sv
      on sv.location_id = c.location_id and sv.date = c.date
    left join {{ ref('fct_client_daily_performance') }} perf
      on perf.location_id = c.location_id and perf.transaction_date = c.date
    left join {{ ref('dim_client_location') }} dcl
      on dcl.location_id = c.location_id
    where c.date >= date_sub(current_date(), interval 730 day) and c.date <= current_date()
),

th as (
    -- Terciles EXACTS par site (percentile_disc), là où l'app utilise approx_quantiles : mesuré le 11/09,
    -- approx_quantiles rend 343,7 ou 347,9 d'un run à l'autre sur le même site (f10c3e58), et la porte
    -- de contrôle (>= 3 jours hors classe par cellule) amplifie ce décalage de deux jours en +17 jours de
    -- classe. Le moteur dbt est déterministe ; c'est la seule divergence voulue avec le store app.
    select distinct
        location_id,
        percentile_disc(competition_index_local, 0.3333) over (partition by location_id) as comp_t1,
        percentile_disc(competition_index_local, 0.6667) over (partition by location_id) as comp_t2,
        min(competition_index_local) over (partition by location_id) as comp_min,
        max(competition_index_local) over (partition by location_id) as comp_max,
        percentile_disc(tourism_index_region, 0.3333) over (partition by location_id) as tour_t1,
        percentile_disc(tourism_index_region, 0.6667) over (partition by location_id) as tour_t2,
        min(tourism_index_region) over (partition by location_id) as tour_min,
        max(tourism_index_region) over (partition by location_id) as tour_max,
        percentile_disc(events_radius, 0.6667) over (partition by location_id) as ev_t2,
        min(events_radius) over (partition by location_id) as ev_min,
        max(events_radius) over (partition by location_id) as ev_max,
        percentile_disc(if(suivis_ct > 0, suivis_ct, null), 0.6667) over (partition by location_id) as sv_t2,
        count(distinct if(suivis_ct > 0, suivis_ct, null)) over (partition by location_id) as sv_distinct,
        percentile_disc(visitors, 0.6667) over (partition by location_id) as vis_t2,
        min(visitors) over (partition by location_id) as vis_min,
        max(visitors) over (partition by location_id) as vis_max
    from joined
),

flags as (
    select
        j.*,
        (j.weather_class is not null) as in_weather,
        (j.competition_index_local is not null and t.comp_max > t.comp_min and j.competition_index_local >= t.comp_t2) as in_comp,
        (j.tourism_index_region is not null and t.tour_max > t.tour_min and j.tourism_index_region >= t.tour_t2) as in_tour,
        (j.events_radius is not null and t.ev_max > t.ev_min and j.events_radius >= t.ev_t2) as in_events,
        (j.mobility_flag is true) as in_mobility,
        (j.suivis_ct > 0 and t.sv_distinct > 1 and j.suivis_ct >= t.sv_t2) as in_suivis,
        (j.school_flag is true) as in_school,
        (j.holiday_flag is true) as in_holiday,
        (j.visitors is not null and t.vis_max > t.vis_min and j.visitors >= t.vis_t2) as in_traffic,
        (j.competition_index_local is not null and t.comp_max > t.comp_min and j.competition_index_local <= t.comp_t1) as in_comp_low,
        (j.tourism_index_region is not null and t.tour_max > t.tour_min and j.tourism_index_region <= t.tour_t1) as in_tour_low
    from joined j
    join th t on t.location_id = j.location_id
)

select
    location_id,
    date,
    month_num,
    weekend_flag,
    weather_class,
    in_weather, in_comp, in_tour, in_events, in_mobility, in_suivis, in_school, in_holiday, in_traffic, in_comp_low, in_tour_low,
    cast(in_weather as int64) + cast(in_comp as int64) + cast(in_tour as int64) + cast(in_events as int64)
    + cast(in_mobility as int64) + cast(in_suivis as int64) + cast(in_school as int64) + cast(in_holiday as int64)
    + cast(in_traffic as int64) + cast(in_comp_low as int64) + cast(in_tour_low as int64) as n_memberships
from flags
```

## 5. `ms_dbt/models/ms_open_data/intermediate/int_location_day_class_membership.sql` — CRÉER

```sql
/*
  MODEL
    int_location_day_class_membership

  GOAL
    Les JOURS de chaque classe de jour d'un site (appartenances, TOUTES — la pureté est portée par
    n_memberships) : port À L'IDENTIQUE du CTE `class_days` de src/lib/kpi/dayClassRegistry.ts.
    Douze classes structurelles : météo (heat_25_27, heat_28_plus, rain, wind, snow, cold),
    competition_high / competition_low, tourism_high / tourism_low, events_high, mobility_disruption,
    followed_activity_high, traffic_high, school_holiday, public_holiday. Les populations de cartes
    (pop_*) et discount_no_lift restent dans le store app : ce sont des tirs de cartes, pas des signaux.

  SOURCE
    {{ ref('int_location_day_cells') }}

  GRAIN
    location_id × date × class_key
*/
{{ config(materialized = 'table', schema = 'intermediate', cluster_by = ['location_id', 'class_key'], tags = ['mart_dependent']) }}

with c as (select * from {{ ref('int_location_day_cells') }})

select location_id, date, month_num, weekend_flag, n_memberships, 'weather'     as class_family, weather_class            as class_key from c where in_weather
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'competition' as class_family, 'competition_high'       as class_key from c where in_comp
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'tourism'     as class_family, 'tourism_high'           as class_key from c where in_tour
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'events'      as class_family, 'events_high'            as class_key from c where in_events
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'mobility'    as class_family, 'mobility_disruption'    as class_key from c where in_mobility
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'suivis'      as class_family, 'followed_activity_high' as class_key from c where in_suivis
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'traffic'     as class_family, 'traffic_high'           as class_key from c where in_traffic
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'competition' as class_family, 'competition_low'        as class_key from c where in_comp_low
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'tourism'     as class_family, 'tourism_low'            as class_key from c where in_tour_low
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'calendar'    as class_family, 'school_holiday'         as class_key from c where in_school
union all
select location_id, date, month_num, weekend_flag, n_memberships, 'calendar'    as class_family, 'public_holiday'         as class_key from c where in_holiday
```

## 6. `ms_dbt/models/ms_open_data/mart/fct_location_day_class_impacts.sql` — CRÉER

```sql
/*
  MODEL
    fct_location_day_class_impacts

  GOAL
    Ce qu'une classe de jour DÉPLACE sur un site, par métrique : agrégats BRUTS (n, moyenne, écart-type,
    médiane, stats log, portée, r point-bisériel) par site × classe × base × métrique. Port À L'IDENTIQUE
    du store app analytics.day_class_impacts (src/lib/kpi/dayClassRegistry.ts, dayClassAggregateSql),
    classes structurelles seulement. AUCUNE politique ici : les portes (n ≥ 5, portée ≥ 60 j, |t| ≥ 1
    sur le log, cohérence de signe médiane/log, matérialité 0,3 % du CA, paliers estimé/mesuré) vivent
    chez le LECTEUR (rowsToImpacts côté app) — un changement de porte ne demande jamais de rebuild.

    Deux BASES par classe : 'pure' = jours purs (n_memberships = 1), écart brut au résultat habituel —
    sauf calendrier, contrôlé hors classe même cellule ; 'marginal' = TOUS les jours de la classe,
    écart − contrôle hors classe (mois × semaine/week-end du site, ≥ 3 jours), « facteurs mêlés ».
    Les métriques autres que revenue_residual n'ont pas d'attendu par jour : base 'marginal' seule.

  MÉTRIQUES
    revenue_residual (CA − résultat habituel, fct_client_day_residual), busyness (ft_day_mean),
    footfall (daily_visitors), conversion (daily_conversion_rate), basket (daily_avg_basket),
    transactions (daily_transactions), discount (daily_discount_total) — la liste KPI_DAILY_COL de l'app.

  SOURCES
    {{ ref('int_location_day_cells') }}, {{ ref('int_location_day_class_membership') }},
    {{ ref('fct_client_day_residual') }}, {{ ref('fct_location_context_daily') }},
    {{ ref('fct_client_daily_performance') }}

  GRAIN
    location_id × class_key × basis × metric
*/
{{ config(materialized = 'table', schema = 'mart', cluster_by = ['location_id'], tags = ['mart_dependent']) }}

with cells as (
    select location_id, date, month_num, weekend_flag, n_memberships from {{ ref('int_location_day_cells') }}
),

membership as (
    select * from {{ ref('int_location_day_class_membership') }}
),

vals as (
    select d.location_id, d.date, d.month_num, d.weekend_flag, 'revenue_residual' as metric,
           r.daily_revenue - r.expected_revenue as v,
           case when r.daily_revenue > 0 and r.expected_revenue > 0 then ln(r.daily_revenue) - ln(r.expected_revenue) end as v_log
    from cells d
    join {{ ref('fct_client_day_residual') }} r on r.location_id = d.location_id and r.date = d.date
    union all
    select d.location_id, d.date, d.month_num, d.weekend_flag, 'busyness', c.ft_day_mean, ln(c.ft_day_mean)
    from cells d
    join {{ ref('fct_location_context_daily') }} c on c.location_id = d.location_id and c.date = d.date
    where c.ft_day_mean is not null and c.ft_day_mean > 0
    union all
    select d.location_id, d.date, d.month_num, d.weekend_flag, m.metric, m.v, if(m.v > 0, ln(m.v), null)
    from cells d
    join {{ ref('fct_client_daily_performance') }} p on p.location_id = d.location_id and p.transaction_date = d.date,
    unnest([
        struct('footfall'     as metric, p.daily_visitors        as v),
        struct('conversion'   as metric, p.daily_conversion_rate as v),
        struct('basket'       as metric, p.daily_avg_basket      as v),
        struct('transactions' as metric, cast(p.daily_transactions as float64) as v),
        struct('discount'     as metric, p.daily_discount_total  as v)
    ]) m
    where m.v is not null
),

class_metric as (
    select cd.location_id, cd.date, cd.month_num, cd.weekend_flag, cd.n_memberships,
           cd.class_family, cd.class_key, v.metric, v.v as gap_eur, v.v_log as gap_log
    from membership cd
    join vals v on v.location_id = cd.location_id and v.date = cd.date
),

cell_stats as (
    select location_id, month_num, weekend_flag, metric,
           sum(v) as cell_sum, count(*) as cell_cnt, sum(v_log) as cell_sum_log, countif(v_log is not null) as cell_cnt_log
    from vals group by 1, 2, 3, 4
),

cell_class as (
    select location_id, month_num, weekend_flag, class_key, metric,
           sum(gap_eur) as x_sum, count(*) as x_cnt, sum(gap_log) as x_sum_log, countif(gap_log is not null) as x_cnt_log
    from class_metric group by 1, 2, 3, 4, 5
),

adjusted as (
    select
        cd.*,
        safe_divide(cs.cell_sum - cc.x_sum, cs.cell_cnt - cc.x_cnt) as ctrl_gap,
        safe_divide(cs.cell_sum_log - cc.x_sum_log, cs.cell_cnt_log - cc.x_cnt_log) as ctrl_gap_log,
        cs.cell_cnt - cc.x_cnt as ctrl_n
    from class_metric cd
    join cell_stats cs on cs.location_id = cd.location_id and cs.month_num = cd.month_num and cs.weekend_flag = cd.weekend_flag and cs.metric = cd.metric
    join cell_class cc on cc.location_id = cd.location_id and cc.month_num = cd.month_num and cc.weekend_flag = cd.weekend_flag and cc.class_key = cd.class_key and cc.metric = cd.metric
),

classed as (
    select location_id, date, metric, gap_eur, gap_log, class_family, class_key, 'pure' as basis
    from adjusted where metric = 'revenue_residual' and n_memberships = 1 and class_family != 'calendar'
    union all
    select location_id, date, metric, gap_eur - ctrl_gap, gap_log - ctrl_gap_log, class_family, class_key, 'pure'
    from adjusted where metric = 'revenue_residual' and n_memberships = 1 and class_family = 'calendar' and ctrl_n >= 3 and ctrl_gap is not null
    union all
    select location_id, date, metric, gap_eur - ctrl_gap, gap_log - ctrl_gap_log, class_family, class_key, 'marginal'
    from adjusted where ctrl_n >= 3 and ctrl_gap is not null
),

span as (
    select location_id, date_diff(max(date), min(date), day) + 1 as span_days from cells group by 1
),

metric_stats as (
    select location_id, metric, avg(v) as all_avg, stddev_samp(v) as all_sd, count(*) as all_n from vals group by 1, 2
),

raw_class as (
    select location_id, class_key, metric, avg(gap_eur) as raw_avg, count(*) as raw_n from class_metric group by 1, 2, 3
)

select
    cl.location_id,
    cl.class_key,
    cl.class_family,
    cl.basis,
    cl.metric,
    count(*)                                    as n_days,
    avg(cl.gap_eur)                             as avg_gap_eur,
    stddev_samp(cl.gap_eur)                     as sd_gap_eur,
    approx_quantiles(cl.gap_eur, 2)[offset(1)]  as med_gap_eur,
    countif(cl.gap_log is not null)             as n_log,
    avg(cl.gap_log)                             as avg_log,
    stddev_samp(cl.gap_log)                     as sd_log,
    s.span_days,
    max(case when ms.all_sd > 0 and rc.raw_n > 0 and ms.all_n > rc.raw_n then
        safe_divide(rc.raw_avg - safe_divide(ms.all_avg * ms.all_n - rc.raw_avg * rc.raw_n, ms.all_n - rc.raw_n), ms.all_sd)
        * sqrt(safe_divide(rc.raw_n, ms.all_n) * (1 - safe_divide(rc.raw_n, ms.all_n)))
    end)                                        as corr_r,
    current_timestamp()                         as computed_at
from classed cl
join span s on s.location_id = cl.location_id
left join metric_stats ms on ms.location_id = cl.location_id and ms.metric = cl.metric
left join raw_class rc on rc.location_id = cl.location_id and rc.class_key = cl.class_key and rc.metric = cl.metric
group by cl.location_id, cl.class_key, cl.class_family, cl.basis, cl.metric, s.span_days
```

## 7. `ms_dbt/models/ms_open_data/mart/fct_client_family_day_class_response.sql` — CRÉER

```sql
/*
  MODEL
    fct_client_family_day_class_response

  GOAL
    Ce qu'une classe de jour DÉPLACE sur CHAQUE FAMILLE d'un site — le grain que ni le store app ni
    fct_location_day_class_impacts n'ont. Même moteur (appartenances, cellules de contrôle mois ×
    semaine/week-end, deux bases, stats log + médiane, r point-bisériel), la famille ajoutée à toutes
    les clés. Agrégats BRUTS ; les portes vivent chez le lecteur (même politique que le site).

  MÉTRIQUES — les couches de la proposition de valeur, dans leur unité (owner 06/09), avec les mots
  de la lecture dispositif × famille (owner 04/09 : Ventes/jour avec Y · Panier moyen avec Y · CA/jour Y ·
  Part de Y dans le CA) :
    family_revenue_gap : revenue − expected_revenue (part de base × CA attendu du jour) — la seule qui a
                         un attendu par jour, donc la seule en base 'pure' ; log = ln(revenue) − ln(expected)
    family_revenue     : CA/jour de la famille, € (marginal ; log = ln quand > 0)
    family_units       : ventes de la famille, units_sold — la couche VOLUME (marginal)
    family_share       : part de la famille dans le CA du jour, ratio 0-1 — la couche MIX (marginal)
    family_basket      : panier moyen des tickets qui contiennent la famille, € par ticket
                         (fct_client_offering_daily.ticket_revenue_avg) — la couche PANIER (marginal)
    family_avg_price   : prix moyen de vente de la famille, € par unité, Σ CA ÷ Σ unités
                         (fct_client_family_price_daily.realized_price ; pondéré, unités > 0) (marginal)
  Le PROFIT par famille × classe n'entre qu'avec le catalogue de coûts (lot B, D1 de l'audit) : une
  branche de plus ici, jamais une estimation (garde § 12.12 : aucun chiffre de marge avant les prix).

  SOURCES
    {{ ref('int_location_day_cells') }}, {{ ref('int_location_day_class_membership') }},
    {{ ref('fct_client_day_family_decomposition') }}, {{ ref('fct_client_offering_daily') }},
    {{ ref('fct_client_family_price_daily') }}

  GRAIN
    location_id × family × class_key × basis × metric
*/
{{ config(materialized = 'table', schema = 'mart', cluster_by = ['location_id', 'family'], tags = ['mart_dependent']) }}

with cells as (
    select location_id, date, month_num, weekend_flag, n_memberships from {{ ref('int_location_day_cells') }}
),

membership as (
    select * from {{ ref('int_location_day_class_membership') }}
),

fam as (
    select location_id, date, family, revenue, expected_revenue, delta_eur, revenue_share, units
    from {{ ref('fct_client_day_family_decomposition') }}
    where date >= date_sub(current_date(), interval 730 day) and date <= current_date()
),

fam_basket as (
    select location_id, transaction_date as date, item_category as family, ticket_revenue_avg
    from {{ ref('fct_client_offering_daily') }}
    where transaction_date >= date_sub(current_date(), interval 730 day) and transaction_date <= current_date()
),

fam_price as (
    select location_id, transaction_date as date, item_category as family, realized_price
    from {{ ref('fct_client_family_price_daily') }}
    where transaction_date >= date_sub(current_date(), interval 730 day) and transaction_date <= current_date()
),

vals as (
    select d.location_id, d.date, d.month_num, d.weekend_flag, f.family, m.metric, m.v, m.v_log
    from cells d
    join fam f on f.location_id = d.location_id and f.date = d.date
    left join fam_basket b on b.location_id = f.location_id and b.date = f.date and b.family = f.family
    left join fam_price  p on p.location_id = f.location_id and p.date = f.date and p.family = f.family,
    unnest([
        struct('family_revenue_gap' as metric, f.delta_eur as v,
               case when f.revenue > 0 and f.expected_revenue > 0 then ln(f.revenue) - ln(f.expected_revenue) end as v_log),
        struct('family_revenue'     as metric, f.revenue as v, if(f.revenue > 0, ln(f.revenue), null) as v_log),
        struct('family_units'       as metric, cast(f.units as float64) as v, if(f.units > 0, ln(f.units), null) as v_log),
        struct('family_share'       as metric, f.revenue_share as v, if(f.revenue_share > 0, ln(f.revenue_share), null) as v_log),
        struct('family_basket'      as metric, b.ticket_revenue_avg as v, if(b.ticket_revenue_avg > 0, ln(b.ticket_revenue_avg), null) as v_log),
        struct('family_avg_price'   as metric, p.realized_price as v, if(p.realized_price > 0, ln(p.realized_price), null) as v_log)
    ]) m
    where m.v is not null
),

class_metric as (
    select cd.location_id, cd.date, cd.month_num, cd.weekend_flag, cd.n_memberships,
           cd.class_family, cd.class_key, v.family, v.metric, v.v as gap, v.v_log as gap_log
    from membership cd
    join vals v on v.location_id = cd.location_id and v.date = cd.date
),

cell_stats as (
    select location_id, family, month_num, weekend_flag, metric,
           sum(v) as cell_sum, count(*) as cell_cnt, sum(v_log) as cell_sum_log, countif(v_log is not null) as cell_cnt_log
    from vals group by 1, 2, 3, 4, 5
),

cell_class as (
    select location_id, family, month_num, weekend_flag, class_key, metric,
           sum(gap) as x_sum, count(*) as x_cnt, sum(gap_log) as x_sum_log, countif(gap_log is not null) as x_cnt_log
    from class_metric group by 1, 2, 3, 4, 5, 6
),

adjusted as (
    select
        cd.*,
        safe_divide(cs.cell_sum - cc.x_sum, cs.cell_cnt - cc.x_cnt) as ctrl_gap,
        safe_divide(cs.cell_sum_log - cc.x_sum_log, cs.cell_cnt_log - cc.x_cnt_log) as ctrl_gap_log,
        cs.cell_cnt - cc.x_cnt as ctrl_n
    from class_metric cd
    join cell_stats cs on cs.location_id = cd.location_id and cs.family = cd.family and cs.month_num = cd.month_num and cs.weekend_flag = cd.weekend_flag and cs.metric = cd.metric
    join cell_class cc on cc.location_id = cd.location_id and cc.family = cd.family and cc.month_num = cd.month_num and cc.weekend_flag = cd.weekend_flag and cc.class_key = cd.class_key and cc.metric = cd.metric
),

classed as (
    select location_id, date, family, metric, gap, gap_log, class_family, class_key, 'pure' as basis
    from adjusted where metric = 'family_revenue_gap' and n_memberships = 1 and class_family != 'calendar'
    union all
    select location_id, date, family, metric, gap - ctrl_gap, gap_log - ctrl_gap_log, class_family, class_key, 'pure'
    from adjusted where metric = 'family_revenue_gap' and n_memberships = 1 and class_family = 'calendar' and ctrl_n >= 3 and ctrl_gap is not null
    union all
    select location_id, date, family, metric, gap - ctrl_gap, gap_log - ctrl_gap_log, class_family, class_key, 'marginal'
    from adjusted where ctrl_n >= 3 and ctrl_gap is not null
),

span as (
    select location_id, date_diff(max(date), min(date), day) + 1 as span_days from cells group by 1
),

metric_stats as (
    select location_id, family, metric, avg(v) as all_avg, stddev_samp(v) as all_sd, count(*) as all_n from vals group by 1, 2, 3
),

raw_class as (
    select location_id, family, class_key, metric, avg(gap) as raw_avg, count(*) as raw_n from class_metric group by 1, 2, 3, 4
)

select
    cl.location_id,
    cl.family,
    cl.class_key,
    cl.class_family,
    cl.basis,
    cl.metric,
    count(*)                                   as n_days,
    avg(cl.gap)                                as avg_gap,
    stddev_samp(cl.gap)                        as sd_gap,
    approx_quantiles(cl.gap, 2)[offset(1)]     as med_gap,
    countif(cl.gap_log is not null)            as n_log,
    avg(cl.gap_log)                            as avg_log,
    stddev_samp(cl.gap_log)                    as sd_log,
    s.span_days,
    max(case when ms.all_sd > 0 and rc.raw_n > 0 and ms.all_n > rc.raw_n then
        safe_divide(rc.raw_avg - safe_divide(ms.all_avg * ms.all_n - rc.raw_avg * rc.raw_n, ms.all_n - rc.raw_n), ms.all_sd)
        * sqrt(safe_divide(rc.raw_n, ms.all_n) * (1 - safe_divide(rc.raw_n, ms.all_n)))
    end)                                       as corr_r,
    current_timestamp()                        as computed_at
from classed cl
join span s on s.location_id = cl.location_id
left join metric_stats ms on ms.location_id = cl.location_id and ms.family = cl.family and ms.metric = cl.metric
left join raw_class rc on rc.location_id = cl.location_id and rc.family = cl.family and rc.class_key = cl.class_key and rc.metric = cl.metric
group by cl.location_id, cl.family, cl.class_key, cl.class_family, cl.basis, cl.metric, s.span_days
```

## 8. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_day_class_membership.sql` — CRÉER

```sql
-- vw_insight_event_day_class_membership
-- Grain   : location_id x date x class_key — celui de int_location_day_class_membership, inchangé.
-- Purpose : surface de LECTURE de l'app (frontière entrepôt : l'app lit semantic, jamais mart ni intermediate) —
--           les JOURS d'une classe, pour remplacer dayClassMembersSql (app) par une lecture.
-- Contenu : projection FIDÈLE, colonne pour colonne. Aucun champ dérivé.
-- Source  : {{ ref('int_location_day_class_membership') }} — méthode dans l'en-tête du modèle.

{{ config(materialized='view') }}

select * from {{ ref('int_location_day_class_membership') }}
```

## 9. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_day_class_impacts.sql` — CRÉER

```sql
-- vw_insight_event_day_class_impacts
-- Grain   : location_id x class_key x basis x metric — celui de fct_location_day_class_impacts, inchangé.
-- Purpose : surface de LECTURE de l'app (frontière entrepôt). Agrégats BRUTS ; la politique de lecture
--           (portes, paliers, €/an) reste chez le lecteur (rowsToImpacts, app).
-- Contenu : projection FIDÈLE, colonne pour colonne. Aucun champ dérivé.
-- Source  : {{ ref('fct_location_day_class_impacts') }} — méthode dans l'en-tête du mart.

{{ config(materialized='view') }}

select * from {{ ref('fct_location_day_class_impacts') }}
```

## 10. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_family_day_class_response.sql` — CRÉER

```sql
-- vw_insight_event_family_day_class_response
-- Grain   : location_id x family x class_key x basis x metric — celui de fct_client_family_day_class_response, inchangé.
-- Purpose : surface de LECTURE de l'app (frontière entrepôt) : ce qu'une classe de jour déplace sur chaque
--           famille d'un site (écart au résultat habituel, CA, ventes, part, panier moyen avec la famille, prix moyen). Agrégats BRUTS ; portes chez le lecteur.
-- Contenu : projection FIDÈLE, colonne pour colonne. Aucun champ dérivé.
-- Source  : {{ ref('fct_client_family_day_class_response') }} — méthode dans l'en-tête du mart.

{{ config(materialized='view') }}

select * from {{ ref('fct_client_family_day_class_response') }}
```

## 11. `ms_dbt/models/ms_open_data/mart/schema_grain.yml` — AJOUTER EN FIN DE FICHIER (après le bloc `fct_client_day_family_decomposition`, dernier du fichier sur `origin/main`)

```yaml
  - name: int_location_day_cells
    description: "Trame des jours de vente du moteur des classes de jour : cellule de contrôle (mois × semaine/week-end), appartenances, n_memberships. Port de `counted` (dayClassRegistry.ts, app), terciles exacts."
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, date]
    columns:
      - name: location_id
        data_tests: [not_null]
      - name: date
        data_tests: [not_null]
      - name: n_memberships
        data_tests: [not_null]

  - name: int_location_day_class_membership
    description: "Les jours de chaque classe de jour d'un site (douze classes structurelles). Port de `class_days` (dayClassRegistry.ts, app)."
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, date, class_key]
    columns:
      - name: class_key
        data_tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['heat_25_27', 'heat_28_plus', 'rain', 'wind', 'snow', 'cold', 'competition_high', 'competition_low', 'tourism_high', 'tourism_low', 'events_high', 'mobility_disruption', 'followed_activity_high', 'traffic_high', 'school_holiday', 'public_holiday']
      - name: class_family
        data_tests: [not_null]

  - name: fct_location_day_class_impacts
    description: "Ce qu'une classe de jour déplace sur un site, par métrique : agrégats bruts par site × classe × base × métrique (port du store app analytics.day_class_impacts, classes structurelles). Aucune politique de lecture ici."
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, class_key, basis, metric]
    columns:
      - name: basis
        data_tests:
          - accepted_values:
              arguments:
                values: ['pure', 'marginal']
      - name: metric
        data_tests:
          - accepted_values:
              arguments:
                values: ['revenue_residual', 'busyness', 'footfall', 'conversion', 'basket', 'transactions', 'discount']
      - name: n_days
        data_tests: [not_null]

  - name: fct_client_family_day_class_response
    description: "Ce qu'une classe de jour déplace sur chaque famille d'un site : agrégats bruts par site × famille × classe × base × métrique (family_revenue_gap, family_revenue, family_units, family_share, family_basket, family_avg_price). Même moteur que le site, la famille dans toutes les clés."
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, family, class_key, basis, metric]
    columns:
      - name: family
        data_tests: [not_null]
      - name: metric
        data_tests:
          - accepted_values:
              arguments:
                values: ['family_revenue_gap', 'family_revenue', 'family_units', 'family_share', 'family_basket', 'family_avg_price']
      - name: basis
        data_tests:
          - accepted_values:
              arguments:
                values: ['pure', 'marginal']
```

## 12. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — AJOUTER EN FIN DE FICHIER (le dernier bloc sur `origin/main` se termine par `- name: created_at` / `data_type: TIMESTAMP`)

```yaml
  - name: vw_insight_event_day_class_membership
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, date, class_key]
    description: "Surface de lecture de int_location_day_class_membership : les jours de chaque classe de jour d'un site (appartenances, pureté par n_memberships). Projection fidèle, aucun champ dérivé."
    config:
      tags: ["mart_dependent"]
      access: public
      materialized: view
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: date
        data_type: DATE
      - name: month_num
        data_type: INT64
      - name: weekend_flag
        data_type: BOOL
      - name: n_memberships
        data_type: INT64
      - name: class_family
        data_type: STRING
      - name: class_key
        data_type: STRING

  - name: vw_insight_event_day_class_impacts
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, class_key, basis, metric]
    description: "Surface de lecture de fct_location_day_class_impacts : ce qu'une classe de jour déplace sur un site, par métrique (agrégats bruts, deux bases). Projection fidèle, aucun champ dérivé."
    config:
      tags: ["mart_dependent"]
      access: public
      materialized: view
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: class_key
        data_type: STRING
      - name: class_family
        data_type: STRING
      - name: basis
        data_type: STRING
      - name: metric
        data_type: STRING
      - name: n_days
        data_type: INT64
      - name: avg_gap_eur
        data_type: FLOAT64
      - name: sd_gap_eur
        data_type: FLOAT64
      - name: med_gap_eur
        data_type: FLOAT64
      - name: n_log
        data_type: INT64
      - name: avg_log
        data_type: FLOAT64
      - name: sd_log
        data_type: FLOAT64
      - name: span_days
        data_type: INT64
      - name: corr_r
        data_type: FLOAT64
      - name: computed_at
        data_type: TIMESTAMP

  - name: vw_insight_event_family_day_class_response
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [location_id, family, class_key, basis, metric]
    description: "Surface de lecture de fct_client_family_day_class_response : ce qu'une classe de jour déplace sur chaque famille d'un site (écart de CA au résultat habituel, CA, ventes, part), agrégats bruts, deux bases. Projection fidèle, aucun champ dérivé."
    config:
      tags: ["mart_dependent"]
      access: public
      materialized: view
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: family
        data_type: STRING
      - name: class_key
        data_type: STRING
      - name: class_family
        data_type: STRING
      - name: basis
        data_type: STRING
      - name: metric
        data_type: STRING
      - name: n_days
        data_type: INT64
      - name: avg_gap
        data_type: FLOAT64
      - name: sd_gap
        data_type: FLOAT64
      - name: med_gap
        data_type: FLOAT64
      - name: n_log
        data_type: INT64
      - name: avg_log
        data_type: FLOAT64
      - name: sd_log
        data_type: FLOAT64
      - name: span_days
        data_type: INT64
      - name: corr_r
        data_type: FLOAT64
      - name: computed_at
        data_type: TIMESTAMP
```

## 13. `ms_dbt/models/exposures.yml` — AJOUTER trois lignes aux `depends_on` de `app_pulse_agir` (après `- ref('vw_insight_event_user_activity')`, ligne 27)

```yaml
      - ref('vw_insight_event_day_class_membership')
      - ref('vw_insight_event_day_class_impacts')
      - ref('vw_insight_event_family_day_class_response')
```

---

## Build (dbt Cloud IDE, dans cet ordre)

```
dbt seed --select document_types
dbt build --select stg_client_transactions int_location_day_cells+
```

- `stg_client_transactions` est une vue : recréée, aucune reconstruction aval nécessaire (`is_invoiced`
  prouvé identique tant que `document_type` est NULL). Ne PAS lancer `stg_client_transactions+` : c'est la
  chaîne ventes entière pour rien.
- `int_location_day_cells+` = les deux intermédiaires, les deux marts, les trois vues et leurs tests
  (unicité de grain, `accepted_values`, `not_null`, contrats).
- Les sept nœuds portent `tags: ['mart_dependent']` : le job `daily mart dependent fresh data run`
  (`dbt run --select tag:mart_dependent`) les rejoue chaque matin après le nocturne.

**Message de commit :**

```
feat(signaux): le moteur des classes de jours entre dans dbt et gagne le grain famille — int_location_day_cells, int_location_day_class_membership, fct_location_day_class_impacts (port du store app, terciles exacts), fct_client_family_day_class_response (ventes, panier, part, CA, écart, prix moyen × classe), trois vues contrat ; seed document_types et colonne document_type au staging (is_invoiced inchangé sans type)
```

## Après le build — vérifications (à faire par moi, côté app)

1. `bq-verify` des trois vues ; `npm run catalog:refresh` (allowlist).
2. Parité en base : `SELECT … FROM semantic.vw_insight_event_day_class_impacts d JOIN analytics.day_class_impacts a USING (location_id, class_key, basis, metric) WHERE a.family NOT IN ('card','sales')` — n_days égaux sur météo, calendrier, mobilité ; terciles à la frontière près (les deux tables se calculent à des heures différentes : comparer le jour même).
3. Compte owner : `SELECT family, class_key, metric, n_days, avg_gap FROM semantic.vw_insight_event_family_day_class_response WHERE STARTS_WITH(location_id,'f10c3e58') AND basis='marginal'` — 9 familles, 6 métriques.
4. `docs/data-model-index.md` : la note « PAS ENCORE EN BASE » devient « EN BASE (PR, run) » ; la spec se réécrit en DÉFINITIF.

Hors de ce lot (lot app) : l'importeur écrit `document_type` ; `dayClassMembersSql` lit
`vw_insight_event_day_class_membership` ; le lecteur famille applique `rowsToImpacts` ; les surfaces
(Explorer, rapport, coin des cartes famille) avec leurs chaînes passées au lexique.
