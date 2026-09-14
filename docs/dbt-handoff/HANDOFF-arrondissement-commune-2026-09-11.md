# Handoff dbt Cloud IDE — un site dont l'identifiant est un arrondissement se résout par sa commune (11/09/2026) — SPEC DE TRAVAIL

Sert : intent § Le test de valeur — une carte dit quelque chose de **vrai** ; un site sans commune ni région perd tout son contexte régional (tourisme, calendrier, événements), et ce qu'il affiche est faux par omission.

**Base vérifiée** : `origin/main` (`60dc549`, après la fusion de #144 qui ne touche pas ce fichier) ; le fichier est identique sur `origin/Ajuria-branch` (`1884bc7`). Dernière modification du fichier : `6673b67` (01/08). Fins de ligne LF. Un seul fichier change, aucun `ref()` ajouté, aucune colonne ajoutée ou retirée : pas de `--full-refresh` (table).

**État (11/09)** : le fichier est dans la PR [ms_database#145](https://github.com/Ajuria/ms_database/pull/145) (branche `fix/arrondissement-commune`, commit `8bd2b45`). Le geste du § C.1 ne se colle plus dans l'IDE : il est dans la PR. Restent la fusion, puis la reconstruction du § C.3.

## A. Constat (mesuré le 11/09)

- `dims.dim_client_location` : 33 sites, **1 sans commune ni région** — `paris_musee_du_moyen_age`, ligne 15 de la seed `client_fetch_points.csv` (`location_uid = 75105`, `zip_code = 75005`, `active_flag = TRUE`).
- La cascade de `dim_client_location.sql` (l. 225-230) ne trouve rien : `communes_coords` ne porte pour Paris que `75056_75001` (racine `75056`, pas `75105`) ; `city_map` ne porte pour Paris que le CP `75001` ; la seed n'a pas de nom de ville. D'où `city_id_granular`, `city_id_commune` et `region_code_insee` à NULL.
- La normalisation des arrondissements (751* → 75056, l. 246-251) s'applique APRÈS la résolution : elle n'a rien à normaliser.
- Effet mesuré : `not_null_fct_location_context_daily_city_id` en `warn`, 380 lignes, toutes ce site (run du 11/09 05:00 UTC, #70471896992066).

## B. Le correctif : un dernier recours, jamais un remplacement

La jointure existante ne bouge pas. Une quatrième jointure `cn` ramène la racine d'un `location_uid` d'arrondissement à sa commune (751* → 75056, 6938* → 69123, 132* → 13055 — la même règle que la normalisation l. 246-251) et la cherche dans `communes_coords`. `cn.city_id` entre en **dernier** dans le `coalesce` : une ligne déjà résolue ne peut pas changer. Le `case` n'a pas d'`else` : une ligne qui n'est pas un arrondissement ne joint rien, aucune ligne n'est dupliquée (`communes_coords` porte 1 ligne pour la racine 75056, 1 pour 13055).

**Limite** : `communes_coords` ne porte pas la racine `69123` (Lyon). Un site lyonnais saisi par arrondissement restera sans commune ; aucun site n'est dans ce cas au 11/09.

**Preuve (11/09, BigQuery)** : le modèle d'avant et celui d'après, compilés depuis `origin/main` (relations lues dans le `manifest.json` du run #70471896992066) et joints sur `location_id`, ligne entière comparée (`to_json_string`, hors `geo_point`) :

| | avant | après |
|---|---|---|
| lignes | 33 | 33 |
| lignes identiques | — | **32** |
| `paris_musee_du_moyen_age` : `city_id_granular` / `city_id_commune` / `region_code_insee` | NULL / NULL / NULL | **75056 / 75056 / 11** |

Le « avant » compilé reproduit la table en base : 33 lignes, 1 seule sans commune, ce même site.

**Consommateurs de `city_id_granular` hors dbt** : `src/pages/api/competitive/search-db.ts:34` (le site reçoit désormais 75056 au lieu de NULL) et `src/pages/api/profile/save.ts:852`. Aucun modèle dbt ne le lit.

## C. Le geste

### 1. Ouvrir `ms_dbt/models/ms_open_data/dims/dim_client_location.sql` — REMPLACER tout le fichier par :

```sql
/*
  PATH
    models/ms_open_data/dims/dim_client_location.sql

  MODEL
    dim_client_location

  PURPOSE
    Dimension canonique des locations client (grain location_id).
    Fusionne les profils seed (test) et website/onboarding,
    le website étant prioritaire.

    Résolution city_id en cascade :
      city_id fourni → location_uid root (communes_coords) →
      zip_code (city_map) → zip + city_name (city_map) →
      racine d'arrondissement ramenée à sa commune dans communes_coords
      (751* → 75056, 6938* → 69123, 132* → 13055) : un location_uid
      d'arrondissement absent de communes_coords se résout par sa commune.

    city_id_commune normalise les arrondissements de Paris, Lyon
    et Marseille vers leur code commune principal
    (751* → 75056, 6938* → 69123, 132* → 13055).

    geo_point calculé via st_geogpoint(longitude, latitude) —
    NULL si l'une des deux coordonnées est manquante.

  AUTHORITATIVE SOURCES (truth)
    - {{ ref('client_fetch_points') }}           -- seed (test uniquement)
    - {{ ref('int_client_website_profiles') }}   -- profils website/onboarding
                                                     (prioritaires)
    - {{ ref('communes_coords') }}               -- location_uid → city_id
    - {{ ref('city_map') }}                      -- zip/city → city_id INSEE
    - {{ ref('geo_commune_to_region') }}         -- city_id → region_id,
                                                     region_code_insee,
                                                     region_name

  OUTPUT GRAIN
    location_id

  MATERIALIZATION
    Table, schéma dims.
*/

{{ config(materialized='table') }}

with seed_src as (
    select
        cast(location_id as string) as location_id,
        location_label,
        location_uid,
        zip_code,
        cast(null as string) as city_name,
        region_code,
        cast(null as string) as city_id,
        cast(latitude as float64)  as latitude,
        cast(longitude as float64) as longitude,
        location_type,
        active_flag,
        client_industry_code,
        location_access_pattern,
        cast(null as string) as client_catchment,
        cast(origin_city_ids as string) as origin_city_ids,
        'seed' as location_source,
        cast(null as bool)   as is_primary,
        cast(null as string) as site_name,
        cast(null as int64)  as weather_sensitivity,
        cast(null as string) as seasonality,
        cast(null as string) as event_type_1,
        cast(null as string) as event_type_2,
        cast(null as string) as event_type_3,
        cast(null as string) as main_event_objective,
        cast(null as string) as operating_hours
    from {{ ref('client_fetch_points') }}
),

website_src as (
    -- website/user profiles (BigQuery raw → stg → int)
    -- mapped into the same “src” surface expected downstream
    select
        cast(location_id as string) as location_id,

        -- already standardized in int model
        location_label,

        cast(null as string) as location_uid,
        cast(zip_code as string) as zip_code,
        cast(city_name as string) as city_name,
        cast(null as string) as region_code,
        cast(city_id as string) as city_id,


        cast(latitude as float64)  as latitude,
        cast(longitude as float64) as longitude,

        location_type,
        true as active_flag,

        -- keep these because enriched/final selects reference them
        client_industry_code,
        location_access_pattern,
        client_catchment,
        cast(array_to_string(origin_city_ids, ',') as string) as origin_city_ids,
        'website' as location_source,
        is_primary,
        site_name,
        cast(weather_sensitivity as int64) as weather_sensitivity,
        seasonality,
        event_type_1,
        event_type_2,
        event_type_3,
        main_event_objective,
        operating_hours
    from {{ ref('int_client_website_profiles') }}
),

src as (
  select
    location_id,
    location_label,
    location_uid,
    zip_code,
    city_name,
    region_code,
    city_id,
    latitude,
    longitude,
    location_type,
    active_flag,
    client_industry_code,
    location_access_pattern,
    client_catchment,
    origin_city_ids,
    location_source,
    is_primary,
    site_name,
    weather_sensitivity,
    seasonality,
    event_type_1,
    event_type_2,
    event_type_3,
    main_event_objective,
    operating_hours
  from (
    select * from seed_src
    union all
    select * from website_src
  )
  qualify row_number() over (
    partition by location_id
    order by
      case location_source
        when 'website' then 0
        when 'seed' then 1
        else 9
      end,
      active_flag desc
  ) = 1
),

-- 1) city_id from communes_coords using the *root* of location_uid
city_lookup as (
    select
        c.city_id,
        -- "13011_13520" → "13011"
        split(c.location_uid, '_')[SAFE_OFFSET(0)] as location_uid_root
    from {{ ref('communes_coords') }} c
),

-- 2) fallback: ZIP → city_id via city_map
zip_to_city as (
    select
        cast(cm.zip_code as string) as zip_code,
        cm.insee_city_id            as city_id
    from {{ ref('city_map') }} cm
),

zip_city_to_city_id as (
  select
    cast(zip_code as string) as zip_code,
    lower(trim(city_name))   as city_name_norm,

    any_value(
      case
        when regexp_contains(cast(insee_city_id as string), r'[A-Za-z]') then cast(insee_city_id as string)
        when length(cast(insee_city_id as string)) < 5 then lpad(cast(insee_city_id as string), 5, '0')
        else cast(insee_city_id as string)
      end
    ) as city_id

  from {{ ref('city_map') }}
  where active_flag = true
    and zip_code is not null
    and city_name is not null

  group by
    cast(zip_code as string),
    lower(trim(city_name))
),

enriched as (
    select
        s.location_id,
        s.location_label,
        s.location_uid,
        s.city_name,
        s.zip_code,
        s.region_code           as region_code_insee_client,
        s.latitude,
        s.longitude,
        s.location_type,
        s.active_flag,
        s.location_source,
        s.client_industry_code,
        s.location_access_pattern,
        s.client_catchment,
        s.origin_city_ids,
        s.is_primary,
        s.site_name,
        s.weather_sensitivity,
        s.seasonality,
        s.event_type_1,
        s.event_type_2,
        s.event_type_3,
        s.main_event_objective,
        s.operating_hours,

        -- 1️⃣ resolve granular city_id (priority website)
        coalesce(
            s.city_id,
            c.city_id,
            z.city_id,
            zn.city_id,
            cn.city_id   -- dernier recours : arrondissement → commune
        ) as city_id_granular

    from src s
    left join city_lookup c
        on split(cast(s.location_uid as string), '_')[SAFE_OFFSET(0)] = c.location_uid_root
    left join zip_to_city z
        on cast(s.zip_code as string) = z.zip_code
    left join zip_city_to_city_id zn
        on trim(cast(s.zip_code as string)) = zn.zip_code
       and lower(trim(cast(s.city_name as string))) = zn.city_name_norm
    -- 4) arrondissement (Paris, Lyon, Marseille) → racine de sa commune ;
    --    sans ELSE : aucune autre ligne ne joint, aucune ligne déjà résolue ne change
    left join city_lookup cn
        on case
               when split(cast(s.location_uid as string), '_')[SAFE_OFFSET(0)] like '751%'  then '75056'
               when split(cast(s.location_uid as string), '_')[SAFE_OFFSET(0)] like '6938%' then '69123'
               when split(cast(s.location_uid as string), '_')[SAFE_OFFSET(0)] like '132%'  then '13055'
           end = cn.location_uid_root
),

normalized as (
    select
        e.*,

        case
            when e.city_id_granular like '751%' then '75056'
            when e.city_id_granular like '6938%' then '69123'
            when e.city_id_granular like '132%' then '13055'
            else e.city_id_granular
        end as city_id_commune

    from enriched e
),

-- 3) attach region attributes from geo_commune_to_region
geo as (
    select
        g.city_id,
        g.region_code_insee,
        g.region_name,
        g.region_id          as region_id,
        g.region_id          as region_code_nuts2   -- FRJ / FR10…
    from {{ ref('geo_commune_to_region') }} g
    where g.active_flag = true
),

final as (
    select
        n.location_id,
        n.location_label,
        n.location_type,
        n.active_flag,
        n.city_id_granular,
        n.city_id_commune,
        n.location_source,

        g.region_id,
        g.region_code_insee,
        g.region_id as region_code_nuts2,
        g.region_name,

        n.latitude,
        n.longitude,
        n.client_industry_code,
        n.location_access_pattern,
        n.client_catchment,
        n.origin_city_ids,
        n.is_primary,
        n.site_name,
        n.weather_sensitivity,
        n.seasonality,
        n.event_type_1,
        n.event_type_2,
        n.event_type_3,
        n.main_event_objective,
        n.operating_hours

    from normalized n
    left join geo g
        on n.city_id_commune = g.city_id
),

final_dedup as (
  select
    *
  from final
  qualify row_number() over (
    partition by location_id
    order by
      case location_source
        when 'website' then 0
        when 'seed' then 1
        else 9
      end,
      active_flag desc
  ) = 1
)

select
  location_id,
  location_label,
  location_type,
  active_flag,
  city_id_granular,
  city_id_commune,
  location_source,
  region_code_insee,
  region_id,
  region_code_nuts2,
  region_name,
  latitude,
  longitude,
  client_industry_code,
  location_access_pattern,
  client_catchment,
  origin_city_ids,
  is_primary,
  site_name,
  weather_sensitivity,
  seasonality,
  event_type_1,
  event_type_2,
  event_type_3,
  main_event_objective,
  operating_hours,
  if(longitude is null or latitude is null, null, st_geogpoint(longitude, latitude)) as geo_point
from final_dedup
```

Diff contre `origin/main` : 14 lignes ajoutées, 2 modifiées (la dernière ligne de la cascade dans l'en-tête, et `zn.city_id` qui prend une virgule), rien d'autre (348 → 360 lignes ; liste des CTE identique).

### 2. Message de commit

```
fix(dims): un site dont l'identifiant est un arrondissement se résout par sa commune — dim_client_location

paris_musee_du_moyen_age (seed, location_uid 75105) sortait sans commune ni région :
communes_coords ne porte que la racine 75056, city_map que le CP 75001. Une quatrième
jointure ramène la racine d'arrondissement à sa commune (751* → 75056, 6938* → 69123,
132* → 13055) en dernier recours du coalesce : aucune ligne déjà résolue ne change.
Preuve BigQuery 11/09 : 33 lignes avant/après, 32 identiques, le musée passe à
75056 / région 11.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### 3. Après la fusion sur `main`

Aucun des jobs planifiés ne reconstruit `dim_client_location` (absent des `run_results.json` des runs du 11/09 : `daily_fresh_data_run_general`, `daily mart dependent fresh data run`, `refresh_industry`). Lancer :

```
dbt build --select dim_client_location
```

`fct_location_context_daily` et `fct_location_impact_daily_weather` sont reconstruits par `daily_fresh_data_run_general` (vérifié dans le run du 11/09) : ils porteront la commune au run de 05:00 UTC suivant. `dim_client_location` a 77 modèles en aval (manifest du 11/09) : `dim_client_location+` n'est pas nécessaire pour ce correctif.

## D. Vérification (je la fais après la fusion)

1. `dims.dim_client_location` : 0 site sans commune (`countif(city_id_commune is null)`), le musée à 75056 / 11.
2. Après le run de 05:00 UTC : `not_null_fct_location_context_daily_city_id` passe (0), et `region_code_insee` n'est plus NULL pour ce site dans `fct_location_context_daily` sur la fenêtre de 14 jours.
