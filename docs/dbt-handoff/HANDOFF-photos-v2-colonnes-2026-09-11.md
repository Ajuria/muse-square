# Handoff dbt Cloud IDE — photos v2 : exposition, niveaux, familles reconnues et N° sur le plan dans la couche semantic (11/09/2026) — SPEC DE TRAVAIL

Sert : intent § Le test de valeur — une carte famille montre la photo du composant qui porte la famille : la preuve de ce que la mesure juge, jamais une illustration.

**Base vérifiée** : `origin/Ajuria-branch` (`1884bc7`). Les trois fichiers touchés y sont identiques à `origin/main` (`0293c5d`). Fins de ligne LF partout. dbt 1.10.11 (`target/manifest.json`).

**État (11/09)** : les trois fichiers sont dans la PR [ms_database#144](https://github.com/Ajuria/ms_database/pull/144) (branche `feat/photos-v2-colonnes`, générée depuis `origin/main` `0293c5d` ; le yml de `main` porte en plus le bloc `vw_insight_event_site_memory`, l'insertion reste aux lignes 966-973, preuves refaites sur `main`). Restent la fusion, puis la reconstruction ciblée du § C. Les gestes du § B ne se collent plus dans l'IDE : ils sont dans la PR.

## A. Pourquoi

Depuis le 11/09, l'app écrit quatre colonnes de plus dans `analytics.dispositif_photos` (25 colonnes) : `exposition`, `levels`, `families_present`, `fixture_no`. La chaîne dbt liste ses colonnes et ne les porte pas : `stg_dispositif_photos` en a 21, `int_client_dispositif_photos_latest` et `fct_client_dispositif_photos` 23, `vw_insight_event_dispositif_photos` 20 (INFORMATION_SCHEMA, 11/09). L'app lit la couche semantic, jamais `analytics` : sans ces colonnes dans la vue, une carte famille de Pulse ne peut pas trouver la photo du composant qui porte sa famille.

**Trois fichiers changent, pas quatre.** `int_client_dispositif_photos_latest` et `fct_client_dispositif_photos` sont en `select *` : ils portent les colonnes dès que la staging les a, et le `dbt run` ci-dessous les recrée. Ni `staging/schema.yml` ni `sources.yml` ne changent. La chaîne est une ligne droite : aucun autre modèle ne lit ces quatre modèles.

## B. Les fichiers, dans l'ordre du DAG

### 1. `ms_dbt/models/ms_open_data/staging/stg_dispositif_photos.sql` — REMPLACER tout le fichier par :

```sql
-- models/staging/stg_dispositif_photos.sql
-- Typed passthrough over analytics.dispositif_photos. No dedup — raw grain (one row per photo
-- WRITE : lecture, puis chaque confirmation d'articles). Casts only ; logic lives downstream.
{{ config(materialized='view') }}

with source as (
    select * from {{ source('analytics', 'dispositif_photos') }}
),

renamed as (
    select
        photo_id,
        location_id,
        dispositif_id,
        cast(version_no as int64)   as version_no,
        component_key,
        walk_id,
        cast(seq as int64)          as seq,
        cast(t_offset_s as float64) as t_offset_s,
        gcs_uri,
        dispositif_type,
        dispositif_role,
        status,
        checklist,                  -- JSON texte {clé: oui|non|non_visible}
        items_matched,              -- JSON texte [{item_code, confidence}]
        items_confirmed,            -- JSON texte [{item_code}] — prime sur items_matched
        prices_seen,                -- JSON texte [{item_code|null, label, price_eur}]
        coverage_flag,
        model,
        prompt_version,
        created_by,
        cast(created_at as timestamp) as created_at,
        -- Lecture v2 (app, owner 11/09) : ce que toute photo dit du composant.
        exposition,                 -- comptoir | vitrine | rayonnage | caisses_au_sol | ilot (registre app EXPOSITION_KINDS)
        cast(levels as int64)       as levels,       -- rayonnage seulement, null sinon
        families_present,           -- ARRAY<STRING> : familles vendues du site reconnues sur la photo ([] si aucune)
        cast(fixture_no as int64)   as fixture_no    -- numéro du composant sur le plan, saisi par l'exploitant
    from source
)

select * from renamed
```

### 2. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_dispositif_photos.sql` — REMPLACER tout le fichier par :

```sql
-- vw_insight_event_dispositif_photos
-- Grain   : (dispositif_id, version_no, component_key) — la photo courante d'un composant d'une
--           version, articles effectifs (confirmés sinon reconnus).
-- Purpose : la surface de LECTURE de l'app et d'Explorer pour les photos (spec app
--           docs/dispositifs-typologie-spec.md § 5, owner 03/09) : ce que la photo a montré
--           (check-list), les articles qu'elle porte, les prix lus. La lecture « exposé mais ne se
--           vend pas » joint cette vue à vw_insight_event_client_item_signals par l'article.
-- Contenu : projection FIDÈLE de fct_client_dispositif_photos, colonne pour colonne. Les JSON
--           restent des JSON (dépliés côté app par le registre) ; aucun libellé ici.
-- Source  : {{ ref('fct_client_dispositif_photos') }}, fact mince — chaîne en VUES.
-- v2 (11/09) : exposition, niveaux, familles reconnues, numéro sur le plan — les familles
--           relient une carte famille de l'app à la photo du composant qui les porte.

{{ config(materialized='view') }}

with photos as (

    select * from {{ ref('fct_client_dispositif_photos') }}

),

final as (

    select
        location_id,
        dispositif_id,
        version_no,
        component_key,
        photo_id,
        gcs_uri,
        dispositif_type,
        dispositif_role,
        status,
        checklist,
        items_matched,
        items_confirmed,
        items_effective,
        items_are_confirmed,
        prices_seen,
        coverage_flag,
        model,
        prompt_version,
        created_by,
        created_at,
        exposition,
        levels,
        families_present,
        fixture_no
    from photos

)

select * from final
```

### 3. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — MODIFIER : le contrat de la vue

Dans le bloc `  - name: vw_insight_event_dispositif_photos`, la dernière colonne est `created_at` (lignes 964-965 de la branche). **Insérer juste APRÈS la ligne 965** (`        data_type: TIMESTAMP`), donc avant la ligne vide qui précède `  - name: vw_insight_event_client_item_signals`, ces huit lignes (six espaces avant `- name`, huit avant `data_type`) :

```yaml
      - name: exposition
        data_type: STRING
      - name: levels
        data_type: INT64
      - name: families_present
        data_type: ARRAY<STRING>
      - name: fixture_no
        data_type: INT64
```

`ARRAY<STRING>` suit la syntaxe déjà employée dans ce fichier (`ARRAY<STRUCT<…>>`, ligne 1105 de la branche).

## C. La reconstruction ciblée, une fois, juste après la fusion

**Aucun job ne reconstruit `stg_dispositif_photos`.** Le job de 05:00 (`dbt build --select source_status:fresher+`) ne la prend pas : la source `analytics.dispositif_photos` n'a pas de fraîcheur déclarée et la table est vide. Le job de 05:09 (`dbt run --select tag:mart_dependent`) reconstruit l'intermédiaire, le fact et la vue, jamais la staging, qui n'a pas ce tag (historique BigQuery du 05/09 au 11/09 : 6 constructions de chacun des trois, aucune de la staging). **Sans cette commande, la vue lirait une staging à 21 colonnes et échouerait chaque matin à 05:09.** Elle se lance dans l'IDE, ou par l'API dbt Cloud (un run ponctuel sur `main` avec cette seule commande). L'IDE et l'API écrivent en production (`muse-square-open-data`).

```
dbt run --select stg_dispositif_photos+
dbt test --select vw_insight_event_dispositif_photos
```

La première construit quatre modèles : la staging, l'intermédiaire, le fact et la vue. Le contrat de la vue est vérifié à ce moment-là.

## D. Preuves (11/09)

- **Rejeu par programme** sur les fichiers de la branche : staging +6 −1 ligne, vue +7 −1, yml +8 −0. Seules lignes retirées : `cast(created_at as timestamp) as created_at` et `created_at`, remplacées par la même ligne suivie d'une virgule.
- **Le yml relu après insertion** : 24 modèles avant et après, mêmes noms ; tous les modèles autres que la vue identiques une fois parsés ; le contrat de la vue a 24 colonnes.
- **Le SQL de la chaîne exécuté dans BigQuery** (staging → double dédup → projection de la vue, noms qualifiés à la place des `ref()`) : 0 erreur, 0 ligne (la table ne contient aucune photo au 11/09, tous sites). Le schéma rendu par le dry run a les 24 colonnes du contrat, dans l'ordre et avec ses types : `levels` et `fixture_no` INT64, `families_present` ARRAY<STRING>.

## E. Ce que je vérifie après votre application

```sql
SELECT table_name, COUNT(*) AS n_cols
FROM `muse-square-open-data.region-eu.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name IN ('stg_dispositif_photos', 'int_client_dispositif_photos_latest', 'fct_client_dispositif_photos', 'vw_insight_event_dispositif_photos')
GROUP BY 1
```

Attendu : 25, 27, 27 et 24 colonnes.

## F. Message de commit (dépôt `ms_database`, branche `Ajuria-branch`)

```
feat(photos): la lecture v2 des photos entre dans la couche semantic — exposition, levels, families_present, fixture_no

· stg_dispositif_photos : + les 4 colonnes écrites par l'app depuis le 11/09 (analytics.dispositif_photos, 25 col.).
· vw_insight_event_dispositif_photos : + les 4 dans la projection et dans le contrat (20 → 24 col.).
· int_client_dispositif_photos_latest et fct_client_dispositif_photos inchangés (select *), recréés par le run.
Preuves app 11/09 : SQL de la chaîne exécuté dans BigQuery, schéma du dry run = contrat, 0 ligne (table vide).
```
