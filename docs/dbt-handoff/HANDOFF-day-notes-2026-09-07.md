# Handoff dbt Cloud IDE — la note-cause d'un jour : source `analytics.day_notes`, `stg_day_notes`, `semantic.vw_insight_event_day_notes` (07/09/2026)

Sert : `docs/explorer-etat-vide-spec.md` § 6.3 (décision owner 07/09 : « table `analytics.day_notes` +
vue `semantic.vw_insight_event_day_notes`, passation dbt ») — l'état vide d'Explorer demande une note sur
un jour inexpliqué (« Un souvenir ? Notez-le · sinon, laissez ») et le chat cite la note comme fait
observé. L'app ÉCRIT la table (`POST /api/insight/day-notes`) et la lit en direct (table app-write, comme
`action_log`) ; la vue semantic est la surface dbt pour les consommateurs à venir (jointure au résiduel
du jour). La table EXISTE en base depuis le 07/09 (DDL exécuté, six colonnes REQUIRED, vérifiées
`INFORMATION_SCHEMA`, catalogue rafraîchi).

**Base vérifiée** : `origin/main` à `ebee861 (2026-09-07)` — `Ajuria-branch` est 34 commits derrière `main`, les PR
se fusionnent sur `main` : c'est la base. dbt **1.10.11** (manifest). Fins de ligne : `sources.yml` et
`schema_app_surfaces.yml` sont en **LF** (vérifié) — `staging/app_activity/schema.yml` est en CRLF et
n'est PAS touché : `stg_day_notes` n'y est pas déclaré, comme `stg_action_log` et `stg_goal_state`
aujourd'hui. Ancre du bloc source vérifiée UNIQUE par programme ; les deux yml ont été rejoués : ils
parsent, aucun modèle ni table perdu ni modifié (`schema_app_surfaces.yml` 20 → 21 modèles,
`sources.yml` 73 → 74 tables). **Ordre = ordre du DAG** : source, staging, vue, puis le yml qui la déclare.

**Preuve SQL (exécutée sur BQ le 07/09, `source()` et `ref()` résolus)** : le corps de `stg_day_notes`
tourne sur `analytics.day_notes` (0 ligne : la table vient d'être créée, c'est attendu) ; la vue compile
(dry-run) avec exactement les six colonnes du contrat : `note_id STRING, location_id STRING,
clerk_user_id STRING, date DATE, note_text STRING, created_at TIMESTAMP`.

---

## 1. `ms_dbt/models/ms_open_data/staging/sources.yml` — MODIFIER (insérer un bloc)

Sous le bloc `action_log` de la source `analytics`, JUSTE APRÈS la ligne (unique dans le fichier) :

```
        description: "User action log tracking clicks, contributions, and app interactions."
```

coller, à la même indentation que `- name: action_log` (six espaces) :

```yaml
      - name: day_notes
        identifier: day_notes
        description: >
          Notes-cause d'un jour (app-write, POST /api/insight/day-notes, owner 07/09) : ce que la mesure
          ne voit pas, écrit par l'exploitant sur un jour daté. Append-only, la dernière note d'un jour
          fait foi. Grain : note_id. Six colonnes REQUIRED (note_id, location_id, clerk_user_id, date,
          note_text, created_at).
```

Résultat attendu : `+7 −0` lignes ; la table `day_notes` apparaît entre `action_log` et `goal_state`.

## 2. `ms_dbt/models/ms_open_data/staging/app_activity/stg_day_notes.sql` — CRÉER

```sql
/*
MODEL
  stg_day_notes

PURPOSE
  Stage analytics.day_notes with light type normalization. No business logic.
  La note-cause d'un jour ecrite par l'exploitant (owner 07/09, app docs/explorer-etat-vide-spec.md
  section 6.3) : append-only, la derniere note d'un jour fait foi — les consommateurs dedupliquent.

GRAIN
  note_id

ORIGIN
  muse-square-open-data.analytics.day_notes
  (source definition in main sources.yml under analytics schema)
*/

{{ config(
    materialized = 'view',
    schema       = 'staging'
) }}

with src as (
    select
        note_id,
        location_id,
        clerk_user_id,
        date,
        note_text,
        created_at
    from {{ source('analytics', 'day_notes') }}
)

select * from src
```

## 3. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_day_notes.sql` — CRÉER

```sql
-- vw_insight_event_day_notes
-- Grain   : note_id — une ligne par note ; un jour peut en porter plusieurs (append-only),
--           la derniere (created_at) fait foi.
-- Purpose : la note-cause d'un jour exposee a la couche semantic (owner 07/09, app
--           docs/explorer-etat-vide-spec.md section 6.3) : ce que la mesure ne voit pas, ecrit par
--           l'exploitant. Consommateurs a venir : la lecture « jour inexpliqué » jointe a
--           vw_insight_event_day_residual par (location_id, date). L'app ecrit la table et lit
--           cette vue ; aucun libelle ici.
-- Contenu : projection FIDELE de stg_day_notes, colonne pour colonne. Aucun champ derive.
-- Source  : {{ ref('stg_day_notes') }} — chaine en VUES : une note saisie dans la session est
--           visible dans la session.

{{ config(materialized='view') }}

with notes as (

    select * from {{ ref('stg_day_notes') }}

),

final as (

    select
        note_id,
        location_id,
        clerk_user_id,
        date,
        note_text,
        created_at
    from notes

)

select * from final
```

## 4. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — MODIFIER (coller à la FIN du fichier)

Le fichier se termine aujourd'hui par le modèle `vw_insight_event_client_offering`, dernière ligne
`        data_type: FLOAT64` (colonne `baseline_units_per_day`). Coller après cette ligne, tel quel
(le bloc commence par une ligne vide) :

```yaml

  - name: vw_insight_event_day_notes
    data_tests:
      - dbt_utils.unique_combination_of_columns:
          arguments:
            combination_of_columns: [note_id]
    description: "La note-cause d'un jour écrite par l'exploitant (analytics.day_notes, owner 07/09) — ce que la mesure ne voit pas. Append-only, une ligne par note ; la dernière note d'un jour fait foi. Chaîne en VUES. Grain : note_id. Lue par l'état vide d'Explorer et par les faits du jour ; jointure prévue à vw_insight_event_day_residual par (location_id, date)."
    config:
      access: public
      contract:
        enforced: true
    columns:
      - name: note_id
        data_type: STRING
      - name: location_id
        data_type: STRING
      - name: clerk_user_id
        data_type: STRING
      - name: date
        data_type: DATE
      - name: note_text
        data_type: STRING
      - name: created_at
        data_type: TIMESTAMP
```

Résultat attendu : `+24 −0` lignes ; 21 modèles déclarés, le dernier `vw_insight_event_day_notes`.

## 5. Construire, puis commit

Dans l'IDE :

```
dbt build --select +vw_insight_event_day_notes
```

Attendu : `stg_day_notes` et `vw_insight_event_day_notes` en vues, le test d'unicité sur `note_id`
vert (0 ligne aujourd'hui), le contrat respecté (six colonnes typées). Vérification en base :
`SELECT * FROM semantic.vw_insight_event_day_notes LIMIT 1` tourne (vide).

Message de commit :

```
feat(app_activity): la note-cause d'un jour — source analytics.day_notes, stg_day_notes, semantic.vw_insight_event_day_notes (owner 07/09)

Ce que la mesure ne voit pas, écrit par l'exploitant sur un jour daté (état vide d'Explorer,
« Un souvenir ? Notez-le · sinon, laissez »). Append-only, grain note_id, la dernière note d'un
jour fait foi. Chaîne en vues, contrat six colonnes. App : docs/explorer-etat-vide-spec.md § 6.3.
```
