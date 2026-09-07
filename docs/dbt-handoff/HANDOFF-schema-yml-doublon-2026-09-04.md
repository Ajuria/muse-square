# FICHIER À OUVRIR : `ms_dbt/models/ms_open_data/staging/schema.yml` — SPEC DE TRAVAIL

**Pourquoi.** Depuis le merge de la PR #95 (`16e4f62`, 03/09 11:09), ce fichier déclare deux fois le modèle `int_client_commitment_latest` (lignes 652–659 et 660–667, blocs identiques). dbt refuse de compiler : les trois jobs de production du 04/09 (`Daily action candidates refresh` 00:09, `daily_fresh_data_run_general` 05:00, `Refresh client dimensions` 05:35) sont en erreur avec :

```
Compilation Error
  dbt found two schema.yml entries for the same resource named int_client_commitment_latest.
  Resources and their associated columns may only be described a single time. To fix this,
  remove one of the resource entries for int_client_commitment_latest in this file:
   - models/ms_open_data/staging/schema.yml
```

Aucun mart n'a été rafraîchi depuis le 03/09 05:13. Tant que ce geste n'est pas fait, aucune autre passation ne s'applique.

**Base vérifiée.** `origin/main` = `origin/Ajuria-branch` (`3a38579`), fichier en LF (866 lignes, 0 CRLF). Le geste a été rejoué par programme : le fichier corrigé parse, contient 42 modèles au lieu de 43, une seule occurrence de `int_client_commitment_latest`, aucun autre doublon ; le diff est exactement 8 lignes supprimées. Aucune autre déclaration n'est en double dans l'ensemble des yml du projet.

## Le geste (un seul)

Dans dbt Cloud IDE, ouvrir `ms_dbt/models/ms_open_data/staging/schema.yml`, chercher `- name: int_client_commitment_latest` : il y a deux résultats. **Supprimer le SECOND bloc entier** (celui qui précède immédiatement le commentaire `# Déclaration OUBLIÉE au lot du matin (03/09)` et le modèle `int_client_dispositif_components`), y compris sa ligne vide :

```yaml
  - name: int_client_commitment_latest
    description: "Latest snapshot per commitment_id from the append-only log (current state). Dedup only."
    config:
      materialized: view
    columns:
      - name: commitment_id
        tests: [not_null, unique]

```

Le premier bloc (juste après la colonne `longitude` de `stg_client_fetch_points`, `warn_if: ">= 5"`) reste.

## Vérification dans l'IDE

```
dbt parse
```

doit se terminer sans `Compilation Error`. Puis relancer `daily_fresh_data_run_general` à la main (ou attendre le 05/09 05:00) et vérifier que `daily mart dependent fresh data run` s'enchaîne en succès.

## Message de commit

```
fix(yml): retire la double déclaration de int_client_commitment_latest (staging/schema.yml) — les jobs prod ne compilaient plus depuis le 03/09
```

— SPEC DE TRAVAIL
