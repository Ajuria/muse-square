# Handoff dbt — espace et pôle (11/09/2026) : PR ms_database#148 — EN BASE — DÉFINITIF

> **11/09, 19 h 50 — EN BASE.** PR fusionnée (`a36411c`) ; run ponctuel `70471897078124` (job `refresh_industry`, 4 étapes vertes, 1 min 10). Vérifié `INFORMATION_SCHEMA` 17 h 45 UTC : 13 objets (staging, 3 intermédiaires, 3 marts, 6 vues) ; `vw_insight_event_declared_parameters` porte `sales_area_m2`. Sans aucun pôle déclaré : mapping 0 ligne, `fct_client_pole_daily` 899 jours tous « Non rattaché » et Σ pôles = site sur 162/162 jours du compte owner, espace 30 j 50 lignes sur 6 sites, réponse pôle × classe 188 lignes. Catalogue régénéré. L'état vit dans `docs/espace-et-pole.md` (DÉFINITIF).

Sert : `docs/espace-et-pole.md` (E1-E8, décisions owner du 11/09). Les fichiers voyagent par git (`CLAUDE.md`
§ Où committer) : **PR [ms_database#148](https://github.com/Ajuria/ms_database/pull/148)**, branche `feat/espace-et-pole`
sur `origin/main` `9faf044` (après #147), 19 fichiers (+900 / −2).

**Base vérifiée** : `origin/main` à `9faf044`. LF ; les cinq yml parsent ; ordre des `ref()` vérifié par programme
(14 fichiers) ; dbt 1.10.11.

**Déjà en base côté app (11/09)** : `analytics.space_measures` (16 colonnes), vide.

**Preuves BigQuery (11/09, `_audit_scratch.lotC_*`, entrées synthétiques sur le compte owner — trois pôles de deux
composants, mesures plan + une mesure ruban, jamais en table de production)** : Σ pôles = CA du site 162/162 jours ;
map 8 familles → 3 pôles, Branded « Non rattaché » ; 15 lignes composant × famille dont 2 parts déclarées ;
14 lignes d'espace 30 j (site 24,5 m mesurés, 90 m² déclarés par Σ pôles) ; 151 lignes pôle × classe.

**Après fusion** : run ciblé du job `refresh_industry` (70471823595526) :
```
dbt build --select stg_space_measures int_location_declared_parameters_daily+ int_client_pole_family_map+
```
puis `bq-verify` des six vues, `npm run catalog:refresh`, index → EN BASE, spec → DÉFINITIF. En base, tout sera
vide de pôles tant qu'aucun n'est déclaré : `fct_client_pole_daily` ne portera que « Non rattaché » (= le site).

**Reste côté app (spec § 4)** : DDL fait ; `sales_area_m2` dans `DECLARED_METRICS` ; formulaire de pôle (N° sur le
plan, longueur, faces de préhension, parts, surface de vente) ; déclaration des sept pôles d'Épices et Tout ; one-off
des 52 meubles ; Piloter, document du pôle, Explorer, cartes.
