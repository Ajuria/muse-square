# Réponse aux signaux externes par famille — lot A dbt : le moteur des classes de jours entre dans dbt, le type de document entre à l'ingestion — SPEC DE TRAVAIL

Sert : `intent.md` § Le métier (« rapporter [les ventes] au résultat habituel DU lieu ») et § Le test de
valeur ; `strategie-entreprise.md` § 12.12 (variations de volume, panier et mix selon les signaux) ;
`audits/profit-grains-sensibilite-audit-2026-09-11.md` § 3.3, § 5 D4 et D7. Décisions owner du 11/09 :
n° 2 (colonne type de document + seed), n° 7 (moteur des classes en dbt, maintenant), n° 8 (ce lot ne
dépend d'aucune entrée déclarée et part en parallèle de la file marge).

Ce document dit l'état vérifié, puis les fichiers à créer dans l'ordre du DAG, puis les preuves déjà
faites en BigQuery. Chaque bloc SQL ci-dessous a été **compilé et exécuté le 11/09** (refs résolus,
résultats matérialisés dans `_audit_scratch`, comparés au moteur de l'app exécuté au même instant).
La passation `docs/dbt-handoff/` se génère de ce document après le GO owner sur § 6.

---

## 0. Ce que le lot livre

| Objet | Couche | Grain | Rôle |
|---|---|---|---|
| `document_types` (seed + yml) | `open_data` | source_system × document_code | ce qu'un type de document de caisse vaut pour la mesure |
| `raw.client_transactions.document_type` | raw (ALTER additif, côté app) | — | la colonne que l'ingestion ne portait pas (§ 9.2) |
| `stg_client_transactions` (3 blocs) | staging | inchangé | porte `document_type`, `document_kind` ; `is_invoiced` tombe sur le seed quand aucune règle de routage ne parle, sinon TRUE comme aujourd'hui |
| `int_location_day_cells` | intermediate | site × jour de vente | la trame du moteur : cellule (mois × semaine/week-end), appartenances, `n_memberships` |
| `int_location_day_class_membership` | intermediate | site × jour × classe | les JOURS de chaque classe (douze classes structurelles) |
| `fct_location_day_class_impacts` | mart | site × classe × base × métrique | port du store app `analytics.day_class_impacts` — parité prouvée (§ 4) |
| `fct_client_family_day_class_response` | mart | site × **famille** × classe × base × métrique | **le grain nouveau** : ce qu'une classe déplace sur chaque famille — les couches de la proposition de valeur : ventes (volume), panier moyen avec la famille, part dans le CA (mix), CA, écart au résultat habituel, prix moyen ; le profit s'y branche avec le catalogue de coûts (lot B) |
| `vw_insight_event_day_class_membership` · `vw_insight_event_day_class_impacts` · `vw_insight_event_family_day_class_response` | semantic (contrat enforced) | id. | les surfaces que l'app lira |

Ce que le lot NE livre PAS : aucune lecture app (Explorer, rapport, cartes — lot suivant, § 5) ;
aucun grain pôle (0 pôle déclaré ; le mart famille se regroupe par pôle dès que le mapping existe,
D2 de l'audit) ; aucune modification du store app ni de son cron (il reste la source des pastilles
et des coins tant que la parité n'est pas prouvée sur sa lecture).

---

## 1. Ce qui est [vérifié 11/09]

- **Le moteur des classes vit dans l'app** : `src/lib/kpi/dayClassRegistry.ts`, `dayClassAggregateSql`
  (SQL de ~350 lignes construite en TypeScript), matérialisée chaque nuit par
  `src/pages/api/cron/day-class-impacts.ts` dans `analytics.day_class_impacts`. Lecteurs : 11 fichiers
  de `src/` (monitor, dashboard, pulse, planPeriod, entityReading, dispositif, bestPractices…).
- **Ce qu'il mesure** : par site, pour 13 classes (météo `heat_25_27` = lvl_heat 1, `heat_28_plus` = lvl ≥ 2,
  `rain`, `wind`, `snow`, `cold` = lvl ≥ 1 ; `competition_high/low` et `tourism_high/low` = terciles de
  l'index du site ; `events_high` = tercile haut des événements au rayon déclaré ; `mobility_disruption` ;
  `followed_activity_high` ; `traffic_high` ; `school_holiday`, `public_holiday`) × 7 métriques
  (`revenue_residual`, `busyness`, `footfall`, `conversion`, `basket`, `transactions`, `discount`), deux
  bases (`pure` = jours purs vs résultat habituel ; `marginal` = tous les jours − contrôle hors classe
  de la cellule mois × semaine/week-end, ≥ 3 jours). Plus des populations de cartes (`pop_*`, famille
  `card`) et `discount_no_lift` (famille `sales`).
- **La politique est chez le lecteur** : `rowsToImpacts` (n ≥ 5, portée ≥ 60 j, |t| ≥ 1 sur le log,
  cohérence de signe médiane/log, matérialité 0,3 % du CA annualisé, palier `mesuré` si n ≥ 10, |t| ≥ 2,
  portée ≥ 300 j). Le store ne porte que des agrégats bruts.
- **Le grain famille n'existe nulle part** : `dayClassRegistry.ts:497` — « family_revenue est au grain
  PRODUIT, donc une autre jointure ». La part attendue d'une famille est une moyenne 30 j non
  conditionnée (`fct_client_day_family_decomposition.sql:44-51`).
- **`approx_quantiles` n'est pas déterministe.** Mesuré le 11/09 sur f10c3e58 : premier tercile de
  `competition_index_local` = 343,7 dans un run, 347,9 dans le suivant (valeurs adjacentes, 161 jours).
  Le moteur app exécuté deux fois de suite diffère de lui-même sur 5 lignes / 232
  (`followed_activity_high`). La porte de contrôle (≥ 3 jours hors classe par cellule) amplifie un
  décalage de deux jours en une cellule entière : `competition_low` marginal sur f10c3e58 = 8 jours
  ou 25 selon le run.
- **Le raw n'a pas de type de document** : 27 colonnes ; `is_invoiced` vient des règles de routage par
  regex de n° de pièce (`stg_client_transactions.sql:139-162, 175`), défaut TRUE.
- **Jobs dbt Cloud** : le nocturne `daily_fresh_data_run_general` = `dbt build --select source_status:fresher+`
  (05:00 UTC), puis `daily mart dependent fresh data run` = `dbt run --select tag:mart_dependent`. Un
  modèle qui lit des marts et doit tourner chaque nuit porte le tag `mart_dependent`.

---

## 2. Décisions de conception

| # | Décision | Pourquoi | Ce qu'on sacrifie |
|---|---|---|---|
| C1 | **Port à l'identique** des classes, des cellules, des deux bases, des stats log + médiane et du r point-bisériel — même SQL, mêmes noms de colonnes que le store app (`class_family` remplace `family`, qui désigne la famille de produits dans le mart famille) | la parité se prouve ligne à ligne, et le store app pourra se repointer sans changer sa lecture | rien |
| C2 | **Terciles EXACTS** (`percentile_disc` 0,3333 / 0,6667 par site) au lieu de `approx_quantiles` | déterminisme : un mart qui change d'un build à l'autre sur les mêmes données n'est pas un mart | les classes à terciles divergent du store app sur les jours à la frontière (§ 4 : 54 lignes égales sur 89) ; c'est la seule divergence voulue |
| C3 | **Populations de cartes (`pop_*`) et `discount_no_lift` NON portées** | ce sont des tirs de cartes (l'appartenance EST le tir), pas des signaux externes ; elles restent dans le store app | le store app reste nécessaire tant que les cartes lisent leurs populations |
| C4 | **Six métriques famille, les mots de la lecture dispositif × famille (owner 04/09)** : `family_units` = Ventes/jour avec Y (VOLUME) · `family_basket` = Panier moyen avec Y, € par ticket contenant la famille (`fct_client_offering_daily.ticket_revenue_avg`) (PANIER) · `family_share` = Part de Y dans le CA, ratio 0-1 (MIX) · `family_revenue` = CA/jour Y · `family_revenue_gap` = écart au résultat habituel (la seule à attendu par jour, donc la seule en base `pure`) · `family_avg_price` = prix moyen de vente de Y, € par unité, Σ CA ÷ Σ unités (`fct_client_family_price_daily.realized_price` — LE mot est « prix moyen », carte `family_price_move`). **Le profit par famille × classe est une septième branche, ouverte par le catalogue de coûts (lot B, D1)** — jamais une estimation par marge déclarée (garde § 12.12) | les trois couches dans leur unité (owner 06/09) ; tout ce qu'une question « quand il pleut, que se passe-t-il sur Y ? » peut recevoir sans coût | le panier est celui du TICKET qui contient la famille (un ticket n'a pas de panier par famille) |
| C5 | **Fenêtre 730 j, jours de vente = jours de `fct_client_day_residual`** (CA > 0, passés) | identique à l'app ; la famille absente un jour compte 0 € (décomposition famille) | — |
| C6 | **Aucune porte dans les marts** ; la politique reste chez le lecteur (`rowsToImpacts` aujourd'hui, un lecteur famille demain) | un changement de porte ne demande jamais de rebuild ; même doctrine que le store | — |
| C7 | **Type de document = colonne raw + seed**, `is_invoiced = coalesce(règle de routage, seed.counts_as_sale, true)` | le raw reste fidèle au fichier ; le seed dit le sens ; une ligne sans type ou à code inconnu garde le comportement d'aujourd'hui | le seed ne porte que les 5 codes lus dans la spec NF525 (§ 9.2) ; les codes de VENTE et de RETOUR entrent à la lecture de l'export de détail, jamais devinés |
| C8 | Tag `mart_dependent` sur les 4 modèles + 3 vues | c'est le job qui rejoue après le nocturne les modèles qui lisent des marts | — |

---

## 3. Les fichiers, dans l'ordre du DAG (amont → aval)

Chaque `ref()` d'un fichier pointe sur un nœud déjà présent dans `origin/main` (base : `f57d632`,
PR #145) ou livré à un numéro inférieur — vérifié par programme le 11/09 (9 fichiers, ordre valide).

### 3.1 `ms_dbt/seeds/open_data/caisse/document_types.csv` — CRÉER

```csv
source_system,document_code,label_fr,kind,counts_as_sale
crisalid,IVT,Inventaire,stock,false
crisalid,EST,Entrée de stock,stock,false
crisalid,SST,Sortie de stock,stock,false
crisalid,IVD,Invendus,invendu,false
crisalid,RUP,Rupture,stock,false
```

### 3.2 `ms_dbt/seeds/open_data/caisse/schema.yml` — CRÉER

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

### 3.3 `raw.client_transactions.document_type` — EN BASE (ALTER additif exécuté le 11/09, vérifié INFORMATION_SCHEMA : STRING)

```sql
ALTER TABLE `muse-square-open-data.raw.client_transactions` ADD COLUMN IF NOT EXISTS document_type STRING;
```
Même geste que `quantity_decimal` le 06/09 : additif, aucune ligne réécrite. L'importeur
(`src/pages/api/import/sales-csv.ts`, `canonicalToBqRow`) écrira la colonne au lot app ; d'ici là elle
est NULL et `is_invoiced` ne bouge pas.

### 3.4 `ms_dbt/models/ms_open_data/staging/stg_client_transactions.sql` — MODIFIER (six ancres ; la passation livre le fichier entier, rejoué par programme : 206 → 220 lignes, +16 / −2)


**Ancre 1** (CTE `src`, après `cast(source_type as string) as source_type,` ligne 73) — AJOUTER :
```sql
        -- 11/09/2026 : type de document de la caisse (Crisalid : IVT, EST, SST, IVD, RUP… ; NULL pour les
        -- caisses qui ne le donnent pas). Colonne raw additive document_type (ALTER 11/09, app).
        cast(document_type         as string)    as document_type,
```

**Ancre 1 bis** (CTE `cleaned`, après `nullif(trim(source_type), '')            as source_type,` ligne 128) — AJOUTER :
```sql
        nullif(trim(document_type), '')          as document_type,
```
(le CTE `cleaned` énumère ses colonnes : sans cette ligne, `routed` ne voit pas `document_type` — attrapé à la compilation le 11/09.)

**Ancre 2** (CTE `routed`) — REMPLACER la ligne 151 `pd.channel            as party_channel` par :
```sql
        pd.channel            as party_channel,
        dt.kind               as document_kind,
        dt.counts_as_sale     as document_counts_as_sale
```
et après le `left join {{ source('analytics', 'party_directory') }} pd … ` (ligne 169) :
```sql
    left join {{ ref('document_types') }} dt
      on  dt.source_system = c.source_system
      and dt.document_code = c.document_type
```

**Ancre 3** (select final) — REMPLACER `coalesce(rule_is_invoiced, true) as is_invoiced,` (ligne 175) par :
```sql
    -- Facturé = règle de routage si elle existe, sinon ce que dit le type de document (seed), sinon TRUE.
    -- Une ligne sans document_type ou à code inconnu garde le comportement d'aujourd'hui : 0 écart par
    -- construction tant que la colonne est NULL — à PROUVER au build (count raw = count stg, test no_fanout).
    coalesce(rule_is_invoiced, document_counts_as_sale, true) as is_invoiced,
```
et AJOUTER après `source_type,` (ligne 204) :
```sql
    document_type,
    document_kind,
```

Déclarer la source : rien à ajouter dans `sources.yml` (la colonne est lue par `cast(document_type …)`
sur la source existante `raw_clients.client_transactions`). Le test
`tests/assert_stg_client_transactions_no_routing_fanout.sql` reste vrai (une jointure de seed à clé
unique, aucun fan-out — l'unicité (source_system, document_code) est testée au seed).

### 3.5 `ms_dbt/models/ms_open_data/intermediate/int_location_day_cells.sql` — CRÉER

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

### 3.6 `ms_dbt/models/ms_open_data/intermediate/int_location_day_class_membership.sql` — CRÉER

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

### 3.7 `ms_dbt/models/ms_open_data/mart/fct_location_day_class_impacts.sql` — CRÉER

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

### 3.8 `ms_dbt/models/ms_open_data/mart/fct_client_family_day_class_response.sql` — CRÉER

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

### 3.9 `ms_dbt/models/ms_open_data/mart/schema_grain.yml` — AJOUTER (fin du fichier, quatre modèles)

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

### 3.10 `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_day_class_membership.sql` — CRÉER

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

### 3.11 `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_day_class_impacts.sql` — CRÉER

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

### 3.12 `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_family_day_class_response.sql` — CRÉER

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

### 3.13 `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — AJOUTER (fin du fichier, trois vues, contrat enforced)

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

### 3.14 `ms_dbt/models/exposures.yml` — AJOUTER aux `depends_on` de `app_pulse_agir`

```yaml
      - ref('vw_insight_event_day_class_membership')
      - ref('vw_insight_event_day_class_impacts')
      - ref('vw_insight_event_family_day_class_response')
```
(au lot app, quand un lecteur naît ; l'exposure documente, elle ne verrouille pas.)

---

## 4. Preuves faites en BigQuery le 11/09 (EU, refs résolus)

- **Compilation** : les quatre modèles (3.5 à 3.8) passent le `--dry_run` ; les trois marts sont
  matérialisés dans `_audit_scratch` (`lotA_app_engine_20260911` = le SQL de l'app extrait par
  `dayClassAggregateSql(false)` ; `lotA_dbt_site_20260911` ; `lotA_dbt_family_20260911`).
- **Parité site, au même instant** (`fct_location_day_class_impacts` vs moteur app, jointure sur
  site × classe × base × métrique, populations et `discount_no_lift` exclues) :

| Classes | Lignes | n_days égal | avg_gap_eur égal | avg_log égal | med égal | sd_log égal | corr_r égal |
|---|---|---|---|---|---|---|---|
| déterministes (météo, calendrier, mobilité) | 137 | **137** | **137** | **137** | **137** | **137** | **137** |
| à terciles (competition, tourism, events, suivis, traffic) | 89 (+ 2 présentes côté app seulement) | 54 | 54 | 54 | 59 | 56 | 55 |

  Égalité à 1e-6 (€) et 1e-9 (log, r). La divergence des terciles est C2 (exact vs approché) ; le moteur
  app exécuté deux fois diffère de lui-même sur 5 lignes / 232.
- **Mart famille** : 1 950 lignes, 6 sites, 19 familles, 6 métriques ; compte owner f10c3e58 = 500 lignes, 9 familles.
  Lecture brute (base `marginal`, avant toute porte — un lecteur applique `rowsToImpacts`) :

| Famille | Classe | Métrique | n | écart moyen | médiane | t_log | r |
|---|---|---|---|---|---|---|---|
| Coffee | school_holiday | family_revenue_gap | 36 | −59,5 €/j | −63,6 €/j | 4,56 | −0,31 |
| Tea | rain | family_revenue_gap | 20 | −58,3 €/j | −72,4 €/j | 4,59 | −0,21 |
| Bakery | heat_25_27 | family_revenue_gap | 33 | −22,5 €/j | −21,7 €/j | 3,81 | −0,31 |
| Coffee | heat_25_27 | family_share | 33 | −1,3 pt | −2,9 pt | 1,75 | −0,08 |
| Coffee beans | heat_25_27 | family_revenue_gap | 33 | +17,5 €/j | +7,7 €/j | 0,16 | +0,06 |
| Coffee | heat_25_27 | family_basket | 33 | +0,40 €/ticket | +0,45 €/ticket | 3,18 | +0,25 |
| Bakery | heat_25_27 | family_avg_price | 33 | −0,07 €/unité | −0,05 €/unité | 3,59 | −0,08 |

  Requête : `SELECT … FROM _audit_scratch.lotA_dbt_family_20260911 WHERE STARTS_WITH(location_id,'f10c3e58') AND class_key IN ('heat_25_27','rain','school_holiday') AND metric IN ('family_share','family_revenue_gap','family_basket','family_avg_price') AND basis = 'marginal'`.
  Ces chiffres sont des agrégats sur la graine du compte owner (`seed_maven`) : ils prouvent la
  mécanique, pas un fait sur un commerce.

---

## 5. Après le build — ce qui reste, et à qui

1. **Owner (dbt Cloud IDE)** : coller la passation (générée de § 3 après GO), dans l'ordre 3.1 → 3.13 ;
   `dbt build --select document_types stg_client_transactions+ int_location_day_cells+` ;
   vérifier `tests` verts ; le job `daily mart dependent` reprend les 7 nœuds la nuit suivante.
2. **App (lot suivant, ce dépôt)** : ALTER raw (3.3) ; importeur → `document_type` ; `bq-verify` des trois
   vues et régénération du catalogue ; `dayClassMembersSql` remplacé par une lecture de
   `vw_insight_event_day_class_membership` (une lecture, même résultat) ; lecteur famille = `rowsToImpacts`
   paramétré par (famille, métrique) — même politique, jamais une seconde ; puis les surfaces : question
   Explorer « quand il fait chaud / il pleut / pendant les vacances, quelle famille bouge ? », section
   du rapport, coin des cartes famille. Chaque chaîne visible passe le lexique avant d'être proposée.
3. **Store app** : inchangé jusqu'à ce que sa lecture soit repointée sur `vw_insight_event_day_class_impacts`
   ET que les populations de cartes aient une maison ; jamais retiré avant.
4. **Lot B** (après pôles déclarés) : `fct_client_pole_day_class_response` = le mart famille regroupé
   par `int_client_pole_family_map` (audit D2) ; la marge × classe quand D1 existe.

---

## 6. Décisions owner sur cette spec (11/09, actées)

1. **C2, terciles exacts** : oui — `percentile_disc` par site ; la divergence avec le store app sur les
   jours à la frontière est connue et acceptée (§ 4).
2. **C3, populations de cartes** : hors du port pour ce lot ; elles se portent au lot app qui repointera le
   store, en six branches identiques à celles-ci.
3. **C4, métriques famille** : les six de § 2 ; « prix réalisé » n'est pas un mot (c'est la colonne
   `realized_price`), LE mot est **prix moyen** (lexique l. 89) ; le profit attend le catalogue de coûts.
4. **C7, seed** : les cinq codes lus dans la spec NF525 ; les codes de vente et de retour entrent à la
   lecture de l'export de détail Crisalid, avec la décision RETOUR.

Passation : `docs/dbt-handoff/HANDOFF-signaux-famille-2026-09-11.md` — fichiers dans la PR
[ms_database#146](https://github.com/Ajuria/ms_database/pull/146) (base `origin/main` `f57d632`, PR #145), à fusionner puis à builder. La colonne `raw.client_transactions.document_type` est EN BASE (ALTER additif exécuté le 11/09).

— SPEC DE TRAVAIL ; se réécrit en définitif quand la passation est buildée et les vues vérifiées.
