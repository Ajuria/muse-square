# Les ancêtres jamais reconstruits dans la fenêtre du job (27/08/2026) — SPEC DE TRAVAIL

## Le fait

Le job dbt Cloud planifié construit **127 modèles sur 315**, par sélection **explicite** :
il ne tire PAS les ancêtres. Preuve directe (26/08) : `int_school_holidays_region_daily`
était alors un ancêtre DAG de `fct_region_context_daily`, qui EST construit — et il n'a
jamais été construit lui-même.

Conséquence mesurée : **41 modèles amont d'un modèle construit ne sont jamais reconstruits
dans la fenêtre du job**, dont des dimensions (`dim_calendar`, `dim_region`,
`dim_client_location`) et des faits lus par l'app — `fct_client_daily_performance`
(26 références applicatives), `fct_client_offering_daily`, `fct_client_offering_profile`.

## Pourquoi ce n'est pas un incident aujourd'hui — et pourquoi c'en sera un

Vérifié le 26/08 sur le plus conséquent : `fct_client_daily_performance` était écrit pour
la dernière fois le 19/08 (7 jours plus tôt) et son contenu était pourtant **juste au jour
près** — CA identique à `fct_client_sales_signals_daily` (fraîchement construit) pour
chacun des jours du 18 au 26/08 : 1 668 / 1 564 / 1 837 / 1 717 / 2 257 / 1 754 / 1 969 /
2 005 / 1 967 €.

La raison est le **semis** : les données de démonstration vont jusqu'au 30/09/2026, donc
les lignes des jours récents étaient déjà écrites le 19/08.

**Sur un compte réel dont les ventes arrivent chaque jour, la même table serait périmée de
sept jours sans qu'aucun signal ne le dise.** La justesse vient aujourd'hui du semis, pas
du graphe de dépendances.

## Ce qui reste à trancher (owner)

1. **La sélection du job** vit dans l'interface dbt Cloud, hors dépôt — elle n'est pas
   lisible depuis le code. Première question : la liste des 127 est-elle intentionnelle,
   ou héritée ? Les commandes se lisent dans l'UI dbt Cloud, jamais dans le repo.
2. **Trois voies possibles**, à arbitrer :
   - passer la sélection en clôture d'ancêtres (`+modèle`) — le job grossit, la fraîcheur
     est garantie par le graphe ;
   - garder la sélection explicite et **y ajouter nommément** les ancêtres qui comptent
     (au minimum `fct_client_daily_performance`) ;
   - garder l'état actuel et poser une **porte de fraîcheur** qui échoue quand un mart lu
     par l'app dépasse N jours — la péremption devient visible au lieu d'être silencieuse.
3. **Le test de vérité** de n'importe laquelle de ces voies : rejouer la comparaison
   ci-dessus (mart amont vs mart fraîchement construit, jour par jour) sur un compte dont
   les ventes arrivent réellement — pas sur un compte semé.

## Comment re-mesurer (la requête qui a produit le chiffre)

Les runs dbt Cloud sont facturés au projet `ms-database-472505` (compte `dbt-cloud@…`) et
chaque requête porte un en-tête `/* {"app":"dbt", …, "node_id":"model.ms_dbt.X",
"target_name":"default"} */`. La liste des modèles réellement construits se lit là ; le
graphe de dépendances se reconstruit depuis les `ref()` des fichiers de modèle —
**commentaires INCLUS**, car un `ref()` en commentaire SQL est une vraie arête de DAG
(seuls les commentaires Jinja `{# #}` sont ignorés).

Le croisement des deux donne les ancêtres non construits.
