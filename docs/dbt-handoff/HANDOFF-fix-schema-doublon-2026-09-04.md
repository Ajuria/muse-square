# Handoff dbt Cloud IDE — CORRECTIF URGENT : doublon `int_client_commitment_latest` dans `staging/schema.yml` (04/09/2026)

**Symptôme** : depuis le 04/09 à 05:00 UTC, TOUS les jobs dbt Cloud échouent à la compilation —
`daily_fresh_data_run_general` (05:00, 36 s, Error), `Refresh client dimensions` (11 échecs de 06:14 à
06:19 UTC), `Daily action candidates refresh` (00:09, Error). Message (run 70471895919455) :

```
Compilation Error
  dbt found two schema.yml entries for the same resource named int_client_commitment_latest.
  To fix this, remove one of the resource entries for int_client_commitment_latest in this file:
   - models/ms_open_data/staging/schema.yml
```

Conséquence : aucune vente du 03/09 n'est mesurée (« combien j'ai vendu hier ? » → jour absent),
aucun mart rafraîchi ce matin, dimensions client non reconstruites.

**Cause** : `main` à `3a38579` (= `Ajuria-branch` `532e87a`, fichier identique) déclare le modèle deux
fois, lignes 652-659 et 660-667, deux blocs BYTE-IDENTIQUES. `git log -S` désigne le commit `16e4f62`
(lot composants du 03/09, passation `HANDOFF-composants-2026-09-03.md`) : le bloc existait déjà et la
passation l'a fait coller une seconde fois. C'est mon erreur de passation ; la règle « rejouer le geste
par programme sur le fichier réel » (CLAUDE.md, point 3) aurait dû attraper le doublon.

**Correctif — UN geste** : dans `ms_dbt/models/ms_open_data/staging/schema.yml` (LF), supprimer les lignes
**660 à 667** (le second bloc, avec sa ligne vide 659 juste avant si l'IDE la laisse en double), c'est-à-dire :

```yaml
  - name: int_client_commitment_latest
    description: "Latest snapshot per commitment_id from the append-only log (current state). Dedup only."
    config:
      materialized: view
    columns:
      - name: commitment_id
        tests: [not_null, unique]

```

Contexte (lignes 658-669 de `main`) — le bloc à supprimer est le second des deux :
```yaml
        tests: [not_null, unique]

  - name: int_client_commitment_latest
    description: "Latest snapshot per commitment_id from the append-only log (current state). Dedup only."
    config:
      materialized: view
    columns:
      - name: commitment_id
        tests: [not_null, unique]

  - name: int_client_dispositif_components
    description: "Un composant d'une version d'un dispositif PERMANENT — la colonne JSON components dépliée (spec app dispositifs-typologie § 3). Grain (dispositif_id, version_no, component_key)."
```

**Rejoué par programme** : le fichier corrigé parse, 43 → 42 entrées, aucun doublon restant, le
même ensemble de modèles. Puis relancer `daily_fresh_data_run_general` (le run de 05:00 UTC a échoué ;
le prochain planifié est samedi 05/09 05:00 UTC) — les ventes du 03/09 entrent avec ce run.

**Message de commit (dépôt `ms_database`, branche `Ajuria-branch`)** :
```
fix(dbt): supprime la déclaration en double de int_client_commitment_latest (staging/schema.yml)

Deux blocs identiques lignes 652-667 depuis 16e4f62 : compilation impossible, tous les jobs
en erreur depuis le 04/09 05:00 UTC. Une seule entrée conservée.
```
