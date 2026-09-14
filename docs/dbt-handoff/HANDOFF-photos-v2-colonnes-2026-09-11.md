# Photos v2 dans la couche semantic : exposition, niveaux, familles reconnues et N° sur le plan (11/09/2026) — DÉFINITIF

Sert : intent § Le test de valeur — une carte famille montre la photo du composant qui porte la famille : la preuve de ce que la mesure juge, jamais une illustration.

## Ce qui est en base

`analytics.dispositif_photos` (écrite par l'app, 25 colonnes) porte depuis le 11/09 quatre colonnes de la lecture v2 : `exposition`, `levels`, `families_present`, `fixture_no`. La chaîne dbt les porte jusqu'à la vue que l'app lit. Mesuré dans `INFORMATION_SCHEMA.COLUMNS` le 11/09 à 14:06 UTC, après le run :

| Modèle | Colonnes | Dont les 4 v2 |
|---|---|---|
| `staging.stg_dispositif_photos` | 25 | 4 |
| `intermediate.int_client_dispositif_photos_latest` | 27 | 4 |
| `mart.fct_client_dispositif_photos` | 27 | 4 |
| `semantic.vw_insight_event_dispositif_photos` | 24 (contrat) | 4 |

Types au contrat : `exposition` STRING, `levels` INT64, `families_present` ARRAY<STRING>, `fixture_no` INT64. L'intermédiaire et le fact sont en `select *` : ils portent ce que la staging porte.

## Comment c'est entré

- **PR [ms_database#144](https://github.com/Ajuria/ms_database/pull/144)**, fusionnée le 11/09 à 14:04 UTC (commit de fusion `60dc549`). Trois fichiers : `staging/stg_dispositif_photos.sql` (+ les 4 colonnes), `semantic/insight_event/vw_insight_event_dispositif_photos.sql` (+ les 4 dans la projection), `semantic/insight_event/schema_app_surfaces.yml` (+ les 4 au contrat, lignes 966-973). Aucun `ref()` ni `source()` touché.
- **Un run ponctuel dbt Cloud**, 70471897053059, sur `60dc549` (job « Refresh client dimensions », commandes remplacées pour ce run seul) : `dbt run --select stg_dispositif_photos+` (4 modèles, 33 s) puis `dbt test --select vw_insight_event_dispositif_photos` (15 s). Succès.

## Pourquoi un run ponctuel, et quand il en faudra un autre

**Aucun job planifié ne reconstruit `stg_dispositif_photos`.** Le job de 05:00 (`dbt build --select source_status:fresher+`) ne la choisit pas : la source `analytics.dispositif_photos` n'a pas de fraîcheur déclarée. Le job de 05:09 (`dbt run --select tag:mart_dependent`) reconstruit l'intermédiaire, le fact et la vue, jamais la staging, qui n'a pas ce tag. Historique BigQuery du 05/09 au 11/09 : 6 constructions de chacun des trois, aucune de la staging. **Toute colonne ajoutée à cette staging demande le même run ponctuel juste après la fusion** ; sans lui, la vue lit une staging périmée et le job de 05:09 échoue.

## Preuves avant la fusion (11/09)

- Fichiers générés depuis `origin/main` (`0293c5d`), LF, dbt 1.10.11 ; geste rejoué par programme : staging +6 −1 ligne, vue +7 −1, yml +8 −0 ; yml relu : 25 modèles, tous identiques sauf la vue.
- SQL de la chaîne exécuté dans BigQuery (noms qualifiés à la place des `ref()`) : 0 erreur, 0 ligne (aucune photo en base, tous sites) ; schéma du dry run identique au contrat, dans l'ordre et avec ses types.

## Ce que l'app en fait

Rien encore : aucun lecteur de l'app ne lit ces quatre colonnes au 11/09. La vue permet désormais de relier une carte famille de Pulse à la photo du composant qui porte sa famille (`families_present`), en passant par la couche semantic.
