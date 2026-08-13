# Étape B — canal par facture + porte de régime (spec d'application, 06/08/2026)

GO owner 06/08 : « étape B + porte de régime — pas de quick hack, on construit
l'infrastructure pour les prochains cas de grain ». Deux chantiers en un :

- **Canal** : chaque ligne de vente Olivades reçoit son compte tiers (fichier
  `ventes_olivades_25-26.xlsx`, colonne « N° tiers entête ») et son canal
  (`comptoir` = caisse boutique / `direct` = facturation sur compte). Mécanique
  générique : deux tables `analytics` app-write + une 3e facette au staging —
  aucun nom de compte en dur dans dbt.
- **Porte de régime** : un modèle mesure le RYTHME de vente de chaque site et le
  classe (`daily` / `weekly` / `episodic` / `insufficient`) ; les cartes ventes
  QUOTIDIENNES ne tirent plus que sur les sites `daily`. Générique : tout futur
  compte (grossiste, corner, facturation épisodique) est classé par ses données.

## 0. Chiffres de référence (tous VALIDÉS sur les données réelles, 06/08 ~18 h)

Jointure pièce → tiers (les 2 tables ci-dessous étant chargées) — requête § 8.1 :

| canal | factures | CA facturé |
|---|---|---|
| comptoir (COMPTOIRSEG) | 271 | 176 019 € |
| direct (comptes nommés) | 600 | 487 308 € |
| **lignes sans tiers** | — | **0** |

(487 308 = pro site principal 412 832 + studio Paris 74 477, à 1 € d'arrondi près.)

Discriminants de régime mesurés (`fct_client_daily_performance` agrégé par jour,
tout l'historique) :

| site | jours actifs | méd. jours/sem | méd. tickets/j | p75/p25 CA | régime attendu |
|---|---|---|---|---|---|
| muse f10c3e58 | 181 | 7 | 241 | 1,70 | daily |
| café ff2aeb35 | 181 | 7 | 257 | 1,72 | daily |
| 29383776 | 181 | 7 | 262 | 1,76 | daily |
| Poeiti 2af6eb18 | 181 | 7 | 245 | 1,70 | daily |
| Olivades 14379e18 | 218 | 5 | **3** | **5,28** | **weekly** |
| Paris 2dc69ea6 | 33 | **1** | **1** | **9,43** | **episodic** |

Compte E2E synthétique (45 j consécutifs, 20-26 tickets/j, p75/p25 ≈ 1,1) → `daily`
— le contrat E2E (17 cartes) reste vert. Seuils calés avec marge : tickets ≥ 10
(3 ↔ 23), dispersion ≤ 3 (1,76 ↔ 5,28), jours/sem ≥ 4 (5 est retenu par les
tickets et la dispersion, pas par ce seuil).

Cartes ventes AVANT (compteurs figés 06/08 ~18 h, mart candidates) :
Olivades **11**, café **10**, muse **3**, 29383776 **3**, Poeiti **3**, Paris **3**.
APRÈS attendu : Olivades **0**, Paris **0**, les quatre autres INCHANGÉS.

## 1. FAIT par Claude (aucune action owner) — les deux tables `analytics`

Créées et chargées le 06/08 par load job (pas de streaming → DML possible) :

**`analytics.import_invoice_parties`** — 871 lignes. Grain :
(`source_location_id`, `source_system`, `invoice_number`) → `party_code`.
Colonnes : source_location_id, source_system, invoice_number, party_code,
source_file, loaded_at. Source : `ventes_olivades_25-26.xlsx` (zéro conflit
pièce→tiers mesuré). C'est le mécanisme de RATTRAPAGE pour les historiques
importés sans colonne tiers ; quand le re-export portera le tiers ligne à ligne,
la colonne `channel` du CSV convergera dans la même colonne staging (§ 3).

**`analytics.party_directory`** — 484 lignes. Grain :
(`source_location_id`, `party_code`). Colonnes : source_location_id, party_code,
party_name, channel, wave, party_type, postal_code, city, region, country,
match_status, source_file, loaded_at. Sources : fiches « Déjà dans Sage » +
« Doublons Sage - à vérifier » du `fichier_unique_clients_JF.xlsx` (Code Sage,
vague W, géographie ; `match_status` = rapproché / à vérifier) + 2 lignes
manuelles `channel='comptoir'` : COMPTOIRSEG, COMPTOIRUSINE (JF, souches 06/08).
Couverture actuelle : 41 des 242 tiers facturés (le reste attend les vagues
W1/W2/W5-W8 demandées à JF — ça n'affecte PAS le canal, seulement le typage).

## 2. dbt — `sources.yml`, sous `- name: analytics` → `tables:` (même bloc que `import_routing_rules`)

```yaml
      - name: import_invoice_parties
        identifier: import_invoice_parties
        description: >
          Rattachement facture → compte tiers par compte importeur (app-write, load job).
          Rattrapage des historiques importés sans colonne tiers. Grain :
          (source_location_id, source_system, invoice_number) — unicité policée par
          tests/assert_import_invoice_parties_unique_grain.
      - name: party_directory
        identifier: party_directory
        description: >
          Annuaire des comptes tiers par compte importeur (app-write) : canal certain
          (channel, ex. 'comptoir' pour les caisses), vague WaveSoft, typologie,
          géographie client. Grain : (source_location_id, party_code) — unicité policée
          par tests/assert_party_directory_unique_grain.
```

## 3. dbt — `staging/stg_client_transactions.sql` : FICHIER COMPLET DE REMPLACEMENT

(= le fichier de l'étape A + la facette CANAL. Diff réel : bloc GOAL enrichi, 2
CTE de jointure en plus dans `routed`, 2 colonnes de sortie `party_code` /
`channel` — et la ligne passthrough `channel,` du select final SUPPRIMÉE au
profit du `case`.)

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
        ri.is_invoiced        as rule_is_invoiced,
        ip.party_code         as mapped_party_code,
        pd.channel            as party_channel
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
)

select
    coalesce(routed_location_id, location_id)   as location_id,
    location_id                                  as source_location_id,
    coalesce(rule_is_invoiced, true)             as is_invoiced,
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
    customer_type,
    payment_method,
    discount_flag,
    invoice_number,
    source_system,
    source_type,
    currency,
    ingested_at
from routed
```

## 4. dbt — NOUVEAU modèle `mart/fct_location_sales_regime.sql` (fichier complet)

```sql
/*
  MODEL
    fct_location_sales_regime

  GOAL
    Le GRAIN DE VÉRITÉ des ventes de chaque site, mesuré sur ses propres données —
    l'infrastructure « porte de régime » (docs app channel-grain-spec.md, 06/08/2026).
    Un verdict quotidien (CA du jour vs baseline) n'a de sens que si le site vend
    TOUS LES JOURS avec un volume de tickets qui lisse le hasard. Un commerce à
    faible fréquence / fort ticket (Olivades : 3 factures/j médianes, un client à
    15 m de tissu fait la journée) ou à facturation épisodique (studio Paris :
    33 jours de CA en 11 mois) rend TOUTE baseline quotidienne fausse — mesuré
    le 06/08 : 39 % de jours « anormaux » bas + 35 % hauts même avec une médiane
    par jour-de-semaine.

    Classification (seuils calés sur les 6 sites réels du 06/08, marges larges —
    cf. spec § 0 ; JAMAIS un site en dur) :
      insufficient : < 10 jours actifs ou < 28 jours d'historique — on ne SAIT pas.
                     NE BLOQUE PAS les cartes (onboarding : un compte neuf garde
                     ses verdicts, le classement se précise avec les données).
      daily     : ≥ 4 jours actifs/semaine ET ≥ 10 tickets/jour (médians)
                  ET p75/p25 du CA quotidien ≤ 3 ET ≥ 80 % des semaines actives.
      weekly    : pas daily, mais ≥ 3 jours actifs/semaine et ≥ 80 % des semaines
                  actives — le rythme est réel, le grain juste est la SEMAINE.
      episodic  : le reste (facturation par vagues) — grain = la facture/le client.

    Fenêtre : les 180 derniers jours DE DONNÉES de chaque site (ancrée sur son
    max(transaction_date), jamais sur current_date — un compte figé garde son
    régime au lieu de voir sa fenêtre se vider).

    Consommateur actuel : fct_location_daily_action_candidates (porte finale — les
    cartes ventes quotidiennes ne sortent que si sales_grain = 'daily' ou inconnu).
    À venir (chantier C) : verdicts hebdo (weekly), motifs par client (episodic).

  SOURCES
    fct_client_daily_performance  -- location_id × transaction_date × source_type

  GRAIN
    location_id (1 ligne par site ayant au moins 1 jour de ventes)
*/

{{ config(
    materialized = 'table',
    schema       = 'mart'
) }}

with daily as (
    select
        location_id,
        transaction_date,
        sum(daily_revenue)      as ca,
        sum(daily_transactions) as txn
    from {{ ref('fct_client_daily_performance') }}
    group by location_id, transaction_date
),

anchored as (
    select
        *,
        max(transaction_date) over (partition by location_id) as window_end
    from daily
),

windowed as (
    select *
    from anchored
    where transaction_date > date_sub(window_end, interval 180 day)
),

weekly as (
    select
        location_id,
        date_trunc(transaction_date, week(monday)) as week_start,
        count(*)                                   as active_days
    from windowed
    group by location_id, week_start
),

week_stats as (
    select
        location_id,
        approx_quantiles(active_days, 2)[offset(1)] as med_days_per_week,
        count(*)                                    as active_weeks
    from weekly
    group by location_id
),

loc_stats as (
    select
        location_id,
        any_value(window_end)               as window_end,
        min(transaction_date)               as first_active_day,
        count(*)                            as active_days,
        approx_quantiles(txn, 2)[offset(1)] as med_daily_txn,
        approx_quantiles(ca, 4)             as ca_quartiles
    from windowed
    group by location_id
),

assembled as (
    select
        l.location_id,
        l.first_active_day                        as window_start,
        l.window_end,
        l.active_days,
        date_diff(l.window_end, l.first_active_day, day) + 1 as span_days,
        w.med_days_per_week,
        w.active_weeks,
        -- Semaines couvertes par la période observée (bornes incluses).
        cast(ceil((date_diff(l.window_end, l.first_active_day, day) + 1) / 7.0) as int64) as span_weeks,
        l.med_daily_txn,
        round(l.ca_quartiles[offset(1)], 2)       as revenue_p25,
        round(l.ca_quartiles[offset(2)], 2)       as revenue_med,
        round(l.ca_quartiles[offset(3)], 2)       as revenue_p75,
        round(safe_divide(l.ca_quartiles[offset(3)], nullif(l.ca_quartiles[offset(1)], 0)), 2) as iqr_ratio
    from loc_stats l
    join week_stats w using (location_id)
)

select
    location_id,
    window_start,
    window_end,
    active_days,
    span_days,
    med_days_per_week,
    active_weeks,
    span_weeks,
    round(safe_divide(active_weeks, span_weeks), 2) as week_coverage,
    med_daily_txn,
    revenue_p25,
    revenue_med,
    revenue_p75,
    iqr_ratio,
    case
        when active_days < 10 or span_days < 28
            then 'insufficient'
        when med_days_per_week >= 4
         and med_daily_txn >= 10
         and coalesce(iqr_ratio, 99) <= 3
         and safe_divide(active_weeks, span_weeks) >= 0.8
            then 'daily'
        when med_days_per_week >= 3
         and safe_divide(active_weeks, span_weeks) >= 0.8
            then 'weekly'
        else 'episodic'
    end as sales_grain
from assembled
```

## 5. dbt — `mart/fct_location_daily_action_candidates.sql` : la porte (2 edits)

**Edit 1** — après le CTE `client_perf` (l. ~202-207), c'est-à-dire remplacer :

```sql
client_perf as (
    select *
    from {{ ref('fct_client_daily_performance') }}
    where transaction_date >= date_sub(current_date(), interval 30 day)
      and transaction_date <= current_date()
),
```

par :

```sql
client_perf as (
    select *
    from {{ ref('fct_client_daily_performance') }}
    where transaction_date >= date_sub(current_date(), interval 30 day)
      and transaction_date <= current_date()
),

-- Porte de régime (docs app channel-grain-spec.md) : le grain de vérité mesuré
-- de chaque site. Consommée UNE fois, au select final.
sales_regime as (
    select location_id, sales_grain
    from {{ ref('fct_location_sales_regime') }}
),
```

**Edit 2** — le select final du modèle (tout en bas du fichier), remplacer :

```sql
from deduped
where rn = 1
```

par :

```sql
from deduped
left join sales_regime using (location_id)
where rn = 1
  -- Porte de régime : un verdict QUOTIDIEN n'existe que là où le rythme de vente
  -- le porte. 'weekly'/'episodic' → cartes ventes jour supprimées (leurs grains
  -- arrivent au chantier C). 'insufficient' ou site absent → laissé passer
  -- (onboarding : ne jamais priver un compte neuf de ses premières cartes).
  and not (
      starts_with(action_type, 'sales_')
      and coalesce(sales_grain, 'daily') in ('weekly', 'episodic')
  )
```

## 6. dbt — tests

**6.1** Schema du staging (schema.yml, bloc `- name: stg_client_transactions`
créé à l'étape A) — ajouter sous `columns:`, à la suite de `source_location_id` :

```yaml
      - name: party_code
        description: >
          Compte tiers de la facture (analytics.import_invoice_parties — rattrapage
          d'historiques sans colonne tiers). NULL = pas de rattachement connu.
      - name: channel
        description: >
          Canal de la vente : 'comptoir' (caisse, canal certain du tiers) ou 'direct'
          (facturation sur compte). NULL = tenant sans rattachement tiers. Le futur
          re-export avec colonne tiers convergera ici.
        tests:
          - accepted_values:
              arguments:
                values: ['comptoir', 'direct']
              config:
                where: "channel is not null"
                severity: warn
```

**6.2** Schema du mart (le schema.yml qui porte les entrées mart) — nouvelle entrée :

```yaml
  - name: fct_location_sales_regime
    description: >
      Grain de vérité des ventes par site, mesuré sur ses 180 derniers jours de
      données (fenêtre ancrée sur le max(transaction_date) du site). sales_grain
      pilote la porte de régime des candidates : les cartes ventes quotidiennes ne
      sortent que sur 'daily' (ou 'insufficient'/absent — onboarding). Seuils
      documentés dans le header du modèle, calés le 06/08 sur les 6 sites réels.
    columns:
      - name: location_id
        tests: [not_null, unique]
      - name: sales_grain
        tests:
          - not_null
          - accepted_values:
              arguments:
                values: ['daily', 'weekly', 'episodic', 'insufficient']
```

**6.3** Nouveau fichier `tests/assert_import_invoice_parties_unique_grain.sql` :

```sql
/*
  TEST
    assert_import_invoice_parties_unique_grain

  GOAL
    Une facture = UN compte tiers. Un doublon de grain ferait dupliquer les lignes
    de vente par le join de la facette canal (CA surcompté partout en aval) —
    même risque que les règles de routage, même police.

  FAILS WHEN
    Un (source_location_id, source_system, invoice_number) porte plus d'une ligne.
*/

select
    source_location_id,
    source_system,
    invoice_number,
    count(*) as n_rows
from {{ source('analytics', 'import_invoice_parties') }}
group by source_location_id, source_system, invoice_number
having count(*) > 1
```

**6.4** Nouveau fichier `tests/assert_party_directory_unique_grain.sql` :

```sql
/*
  TEST
    assert_party_directory_unique_grain

  GOAL
    Un compte tiers = UNE fiche par compte importeur. Un doublon ferait dupliquer
    les lignes du tiers via la facette canal du staging.

  FAILS WHEN
    Un (source_location_id, party_code) porte plus d'une ligne.
*/

select
    source_location_id,
    party_code,
    count(*) as n_rows
from {{ source('analytics', 'party_directory') }}
group by source_location_id, party_code
having count(*) > 1
```

(Le test de conservation `assert_stg_client_transactions_no_routing_fanout` de
l'étape A couvre AUSSI la nouvelle facette — toute duplication par les joins
tiers/annuaire le met en rouge. Rien à y changer.)

## 7. Jobs — rien à modifier

`client_sales_full_refresh (after upload)` sélectionne `stg_client_transactions+`
→ il construit le nouveau mart régime (aval de la chaîne). Le job candidates
2×/j (`dbt run --select fct_location_daily_action_candidates`, vérifié par l'API
06/08) compile par `ref` sur la table régime existante — le régime se rafraîchit
avec la chaîne quotidienne, ce qui suffit (un rythme de vente évolue en semaines).

## 8. Run + VALIDATION (contrat chiffré)

1. Studio : `dbt build --full-refresh --select stg_client_transactions+`
   (ou Run now du job after-upload une fois le code mergé).
2. Canal — attendu comptoir 271 factures / 176 019 €, direct 600 / 487 308 €,
   zéro ligne Olivades sans tiers. Hors Olivades : les valeurs RAW passent telles
   quelles (seed Kaggle = 'on_site', 196 898 lignes — pré-existant, c'est le
   design) ; le critère est qu'AUCUN 'comptoir'/'direct' n'apparaisse hors
   comptes rattachés :

```sql
select channel, count(distinct invoice_number) factures,
       round(sum(if(is_invoiced, revenue, 0))) ca_facture
from `muse-square-open-data.staging.stg_client_transactions`
where source_location_id = '14379e18-2060-4b50-871d-edf0818eab8c'
group by channel;

select channel, count(*) n   -- attendu : uniquement des valeurs raw ('on_site'), jamais comptoir/direct
from `muse-square-open-data.staging.stg_client_transactions`
where source_location_id != '14379e18-2060-4b50-871d-edf0818eab8c'
group by channel;
```

   VALIDÉ 06/08 ~19 h (les deux requêtes, résultats exacts ci-dessus).

3. Régime — attendu : les 4 sites seed/démo `daily`, Olivades `weekly`,
   Paris `episodic` (table § 0) :

```sql
select location_id, active_days, med_days_per_week, med_daily_txn, iqr_ratio,
       week_coverage, sales_grain
from `muse-square-open-data.mart.fct_location_sales_regime`
order by active_days desc;
```

4. Cartes — attendu : Olivades 0, Paris 0, café 10, muse 3, 29383776 3,
   Poeiti 3 (compteurs avant § 0 ; les non-ventes ne bougent pas) :

```sql
select location_id, count(*) cartes_ventes
from `muse-square-open-data.mart.fct_location_daily_action_candidates`
where starts_with(action_type, 'sales_')
group by location_id order by 2 desc;
```

5. Claude rejoue le E2E synthétique (`npx tsx scripts/e2e-onboarding-synth.ts`)
   — contrat : vert, cartes ventes produites (site synthétique classé `daily`).

## 9. Hors périmètre (queue explicite)

- **Chantier C — les grains servis** : verdicts HEBDO boutique (canal comptoir),
  motifs PAR CLIENT pro (60 factures = 50 % du CA facturé — commande récurrente
  en retard, client en décrochage), mensuel studio. La porte de régime supprime
  le faux ; le chantier C fournit le vrai.
- Vagues W manquantes (W1/W2/W5-W8, demandées à JF) → typage des 201 tiers
  facturés restants dans party_directory (UPDATE DML, table en load job).
- `source_file` capturé à l'import (app) — le nom de fichier porte du sens
  (leçon W), on le jette aujourd'hui.
- Lecteurs app du raw (famille K8) — voient encore le non-facturé.
- Re-export Sage : colonne compte tiers ligne à ligne (+ famille/désignation
  article, + CP/ville tiers, + famille de tiers si tenue) — convergera dans les
  colonnes staging existantes sans toucher les consommateurs.
