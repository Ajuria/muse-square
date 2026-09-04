# Handoff dbt Cloud IDE — lot 2 : photos des composants + signaux par article dans la couche semantic (03/09/2026)

Sert : `docs/dispositifs-typologie-spec.md` § 5-6 (livrable 2 « exposé mais ne se vend pas ») ; frontière
entrepôt : l'app lit `semantic`, jamais `mart` (`warehouseBoundary.guard`) — il n'existait aucune vue
semantic au grain ARTICLE, ni pour les photos.

**Base vérifiée** : `origin/Ajuria-branch` (= `main` à un merge près, fichiers touchés identiques).
dbt 1.10.11, fichiers en LF, ancres textuelles vérifiées uniques par programme. **Ordre = ordre du
DAG** (règle CLAUDE.md du 03/09) : chaque `ref()` d'un fichier pointe sur un nœud déjà dans la branche
ou livré à un numéro inférieur — vérifié par programme. Coller dans l'ordre.

Note : la déclaration yml de `fct_client_dispositif_components` (lot du matin) manquait dans
`staging/schema.yml` — elle est ajoutée ici (fichier 7). Le mart existe déjà en base, rien d'autre
ne change pour lui.

---

## 1. `ms_dbt/models/ms_open_data/staging/sources.yml` — MODIFIER : déclarer la source

**Insérer juste APRÈS cette ligne** (ligne 331 de la branche, la dernière du bloc `api_error_log`) :
```yaml
        description: "API errors across all endpoints for system health monitoring."
```
**ce bloc** (avant `      - name: action_commitments`) :
```yaml
      - name: dispositif_photos
        identifier: dispositif_photos
        description: >
          Photos des composants des dispositifs permanents (app-write, append-only par photo_id ;
          une confirmation d'articles est une NOUVELLE ligne de la même photo — la dernière gagne).
          Spec app docs/dispositifs-typologie-spec.md § 5.2 (03/09). Une image où une personne est
          visible n'y entre jamais. Source de stg_dispositif_photos → int_client_dispositif_photos_latest.
```

## 2. `ms_dbt/models/ms_open_data/staging/stg_dispositif_photos.sql` — CRÉER
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
        cast(created_at as timestamp) as created_at
    from source
)

select * from renamed
```

## 3. `ms_dbt/models/ms_open_data/intermediate/int_client_dispositif_photos_latest.sql` — CRÉER
```sql
-- models/ms_open_data/intermediate/int_client_dispositif_photos_latest.sql
-- Grain   : (dispositif_id, version_no, component_key) — LA photo courante d'un composant d'une
--           version, avec ses articles : confirmés par l'exploitant s'ils le sont, sinon reconnus.
-- Purpose : LA logique métier des photos (spec app docs/dispositifs-typologie-spec.md § 5.2-5.3,
--           owner 03/09) : la table est append-only — une lecture, puis chaque confirmation
--           d'articles est une NOUVELLE ligne de la même photo_id. Deux dédups, dans l'ordre :
--           (1) la dernière ligne de chaque photo (created_at desc) ; (2) la dernière photo de
--           chaque composant. `items_effective` = items_confirmed si non null, sinon items_matched :
--           le mot de l'exploitant prime, toujours.
-- Contenu : aucun libellé, aucun dérivé chiffré — les JSON restent des JSON, dépliés par les
--           consommateurs qui en ont besoin (vue articles × photos).
-- Source  : {{ ref('stg_dispositif_photos') }} — chaîne en VUES : une photo lue dans la session se
--           lit dans la session.
{{ config(materialized='view', tags=['mart_dependent']) }}

with photos as (

    select *
    from {{ ref('stg_dispositif_photos') }}
    where status = 'read'

),

latest_write as (

    select * except (rn)
    from (
        select p.*, row_number() over (partition by photo_id order by created_at desc) as rn
        from photos p
    )
    where rn = 1

),

latest_photo as (

    select * except (rn)
    from (
        select l.*, row_number() over (partition by dispositif_id, version_no, component_key order by created_at desc) as rn
        from latest_write l
    )
    where rn = 1

)

select
    *,
    coalesce(items_confirmed, items_matched) as items_effective,
    (items_confirmed is not null)           as items_are_confirmed
from latest_photo
```

## 4. `ms_dbt/models/ms_open_data/mart/fct_client_dispositif_photos.sql` — CRÉER
```sql
-- models/ms_open_data/mart/fct_client_dispositif_photos.sql

/*
  MODEL
    fct_client_dispositif_photos

  PURPOSE
    La photo courante de chaque composant de chaque version des dispositifs permanents, avec ses
    articles effectifs (spec app docs/dispositifs-typologie-spec.md § 5, owner 03/09). La couche
    semantic lit un mart, jamais un intermédiaire.

    THIN fact : TOUTE la logique (double dédup append-only, items_effective) vit dans
    int_client_dispositif_photos_latest — lire son en-tête. Ici : matérialisation seule.

  AUTHORITATIVE SOURCES (truth)
    - {{ ref('int_client_dispositif_photos_latest') }}   -- dispositif_id x version_no x component_key

  OUTPUT GRAIN
    dispositif_id x version_no x component_key

  MATERIALIZATION
    VUE (même règle que fct_client_dispositif_components) : une photo lue en session se lit en session.
*/

{{ config(
    materialized = 'view',
    schema = 'mart',
    tags = ['mart_dependent'],
) }}

select * from {{ ref('int_client_dispositif_photos_latest') }}
```

## 5. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_dispositif_photos.sql` — CRÉER
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
        created_at
    from photos

)

select * from final
```

## 6. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_client_item_signals.sql` — CRÉER
```sql
-- vw_insight_event_client_item_signals
-- Grain   : location_id × transaction_date × item_description — celui de fct_client_item_signals_daily,
--           inchangé (+ une ligne par article mort au dernier jour vendu).
-- Purpose : surface de LECTURE de l'app pour les signaux quotidiens par ARTICLE (spec app
--           docs/dispositifs-typologie-spec.md § 6, livrable 2 « exposé mais ne se vend pas », 03/09).
--           Jusqu'ici aucune vue semantic ne portait le grain article : l'app aurait dû lire le mart,
--           ce que la frontière entrepôt interdit (warehouseBoundary.guard).
-- Contenu : projection FIDÈLE, colonne pour colonne (dbt_updated_at exclu). Aucun champ ajouté,
--           aucun dérivé — la sémantique (part, z, article mort, euros vs attendu du jour) est
--           documentée dans l'en-tête du mart.
-- Source  : {{ ref('fct_client_item_signals_daily') }}

{{ config(materialized='view') }}

with signals as (

    select * from {{ ref('fct_client_item_signals_daily') }}

),

final as (

    select
        location_id,
        transaction_date,
        item_description,
        item_category,
        revenue,
        units,
        unit_price,
        revenue_share,
        baseline_share,
        share_delta_points,
        share_robust_z,
        share_n,
        is_daily_item,
        days_sold,
        price_baseline,
        price_delta_pct,
        direction,
        is_share_move,
        is_price_move,
        days_since_last_sale,
        is_dead_item,
        expected_day_revenue,
        day_gap_eur,
        expected_item_revenue,
        delta_eur,
        delta_z,
        delta_n,
        direction_eur,
        is_eur_move,
        is_school_holiday_flag,
        typ_n,
        baseline_same_regime_n,
        regime_mismatch_flag,
        n_occurrences_60d,
        first_occurrence_date
    from signals

)

select * from final
```

## 7. `ms_dbt/models/ms_open_data/staging/schema.yml` — MODIFIER : déclarer les modèles

**Insérer juste APRÈS ces trois lignes** (fin du bloc `int_client_dispositif_components`, lignes 687-689) :
```yaml
          - relationships:
              arguments:
                to: ref('dispositif_types')
```
**ce bloc** (une ligne vide avant, une après, avant `  - name: fct_client_commitment_outcomes`) :
```yaml
                field: type_value

  # Déclaration OUBLIÉE au lot du matin (03/09) : le mart des composants existe en base,
  # sa ligne yml manquait. Ajoutée ici avec le lot photos.
  - name: fct_client_dispositif_components
    description: "Fact MINCE sur int_client_dispositif_components (composants des dispositifs permanents, grain dispositif × version × composant) — matérialisation seule, en VUE pour la fraîcheur de session. Lu par vw_insight_event_dispositif_components."
    config:
      materialized: view
      schema: mart
      tags: ["mart_dependent"]

  - name: stg_dispositif_photos
    description: "Typed passthrough over analytics.dispositif_photos — grain d'écriture (une lecture, puis chaque confirmation d'articles). No dedup."
    config:
      materialized: view
    columns:
      - name: photo_id
        tests: [not_null]
      - name: dispositif_id
        tests: [not_null]
      - name: component_key
        tests: [not_null]

  - name: int_client_dispositif_photos_latest
    description: "La photo courante d'un composant d'une version (double dédup append-only : dernière ligne par photo, dernière photo par composant) + items_effective (confirmés sinon reconnus). Grain (dispositif_id, version_no, component_key)."
    config:
      materialized: view
      tags: ["mart_dependent"]
    tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [dispositif_id, version_no, component_key]
    columns:
      - name: photo_id
        tests: [not_null, unique]

  - name: fct_client_dispositif_photos
    description: "Fact MINCE sur int_client_dispositif_photos_latest — matérialisation seule, en VUE. Lu par vw_insight_event_dispositif_photos."
    config:
      materialized: view
      schema: mart
```
Résultat : 39 → 43 modèles, aucune description existante modifiée (contrôlé par programme).

## 8. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — MODIFIER : les deux contrats

**Ajouter EN FIN DE FICHIER** (après la dernière ligne `        data_type: TIMESTAMP` du bloc `vw_insight_event_dispositif_components`, une ligne vide puis) :
```yaml
  - name: vw_insight_event_dispositif_photos
    description: "La photo courante de chaque composant de chaque version des dispositifs permanents — check-list, articles effectifs (confirmés sinon reconnus), prix lus. Chaîne en VUES. Grain (dispositif_id, version_no, component_key)."
    config:
      access: public
      tags: ["mart_dependent"]
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: dispositif_id
        data_type: STRING
      - name: version_no
        data_type: INT64
      - name: component_key
        data_type: STRING
      - name: photo_id
        data_type: STRING
      - name: gcs_uri
        data_type: STRING
      - name: dispositif_type
        data_type: STRING
      - name: dispositif_role
        data_type: STRING
      - name: status
        data_type: STRING
      - name: checklist
        data_type: STRING
      - name: items_matched
        data_type: STRING
      - name: items_confirmed
        data_type: STRING
      - name: items_effective
        data_type: STRING
      - name: items_are_confirmed
        data_type: BOOL
      - name: prices_seen
        data_type: STRING
      - name: coverage_flag
        data_type: STRING
      - name: model
        data_type: STRING
      - name: prompt_version
        data_type: STRING
      - name: created_by
        data_type: STRING
      - name: created_at
        data_type: TIMESTAMP

  - name: vw_insight_event_client_item_signals
    description: "Signaux quotidiens par ARTICLE — projection fidèle de fct_client_item_signals_daily (grain location × jour × article). Première surface semantic au grain article (03/09)."
    config:
      access: public
      tags: ["mart_dependent"]
      contract:
        enforced: true
    columns:
      - name: location_id
        data_type: STRING
      - name: transaction_date
        data_type: DATE
      - name: item_description
        data_type: STRING
      - name: item_category
        data_type: STRING
      - name: revenue
        data_type: FLOAT64
      - name: units
        data_type: FLOAT64
      - name: unit_price
        data_type: FLOAT64
      - name: revenue_share
        data_type: FLOAT64
      - name: baseline_share
        data_type: FLOAT64
      - name: share_delta_points
        data_type: FLOAT64
      - name: share_robust_z
        data_type: FLOAT64
      - name: share_n
        data_type: INT64
      - name: is_daily_item
        data_type: BOOL
      - name: days_sold
        data_type: INT64
      - name: price_baseline
        data_type: FLOAT64
      - name: price_delta_pct
        data_type: FLOAT64
      - name: direction
        data_type: STRING
      - name: is_share_move
        data_type: BOOL
      - name: is_price_move
        data_type: BOOL
      - name: days_since_last_sale
        data_type: INT64
      - name: is_dead_item
        data_type: BOOL
      - name: expected_day_revenue
        data_type: FLOAT64
      - name: day_gap_eur
        data_type: FLOAT64
      - name: expected_item_revenue
        data_type: FLOAT64
      - name: delta_eur
        data_type: FLOAT64
      - name: delta_z
        data_type: FLOAT64
      - name: delta_n
        data_type: INT64
      - name: direction_eur
        data_type: STRING
      - name: is_eur_move
        data_type: BOOL
      - name: is_school_holiday_flag
        data_type: BOOL
      - name: typ_n
        data_type: INT64
      - name: baseline_same_regime_n
        data_type: INT64
      - name: regime_mismatch_flag
        data_type: BOOL
      - name: n_occurrences_60d
        data_type: INT64
      - name: first_occurrence_date
        data_type: DATE
```
Résultat : 13 → 15 modèles, aucune description existante modifiée (contrôlé par programme).

---

## C. Les commandes dans l'IDE, dans cet ordre
```bash
dbt run --select stg_dispositif_photos int_client_dispositif_photos_latest fct_client_dispositif_photos vw_insight_event_dispositif_photos vw_insight_event_client_item_signals
```
```bash
dbt test --select stg_dispositif_photos int_client_dispositif_photos_latest fct_client_dispositif_photos vw_insight_event_dispositif_photos vw_insight_event_client_item_signals
```
Attendu : la vue photos rend 0 ligne aujourd'hui (aucune photo réelle en base — les sondes sont
effacées) ; la vue signaux rend, pour Muse Square, 8 973 lignes, 80 articles, du 03/04/2026 au
02/09/2026 (mesuré le 03/09 sur le SQL compilé). Puis commit sur `Ajuria-branch` (§ E), PR vers `main`.

## D. Preuves (03/09)
- Trois yml rejoués par programme sur les fichiers de la branche et relus : sources 72 → 73 tables ;
  staging 39 → 43 modèles ; surfaces 13 → 15 modèles ; 0 description existante modifiée ; les trois parsent.
- SQL compilé à la main (source → stg → int → fct → vue ; mart → vue signaux), dry-run OK, puis exécuté
  sur QUATRE lignes sonde de la table photos (une photo lue, sa confirmation, la photo d'un second
  composant, une vieille photo du premier) : la vue rend 2 lignes — la photo courante du premier
  composant porte les articles CONFIRMÉS `[59, 38]`, celle du second les reconnus non confirmés, la
  vieille photo est écartée. Sondes effacées, 0 restante. La vue signaux compte 8 973 lignes / 80 articles
  sur Muse Square.

## E. Message de commit (dépôt `ms_database`, branche `Ajuria-branch`)
```
feat(dispositifs): lot 2 — photos des composants et signaux par article dans la couche semantic

· source analytics.dispositif_photos ; stg_dispositif_photos (passthrough typé) ;
  int_client_dispositif_photos_latest (double dédup append-only : dernière ligne par photo, dernière
  photo par composant ; items_effective = confirmés sinon reconnus) ; fct_client_dispositif_photos
  (fact mince en vue) ; vw_insight_event_dispositif_photos (contrat 20 col.).
· vw_insight_event_client_item_signals : projection fidèle de fct_client_item_signals_daily
  (35 col.) — première surface semantic au grain article (frontière entrepôt : l'app ne lit pas mart).
· staging/schema.yml : + déclaration de fct_client_dispositif_components oubliée au lot du matin.
Preuves app 03/09 : SQL compilé exécuté sur 4 lignes sonde (photo courante = confirmée), sondes effacées ;
signaux Muse Square 8 973 lignes / 80 articles.
```
