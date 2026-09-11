# Handoff dbt — catalogue des prix d'achat et marge brute (11/09/2026) : PR ms_database#147 — EN BASE — DÉFINITIF

> **11/09, 17 h 50 — EN BASE.** PR fusionnée (`9faf044`) ; run ponctuel `70471897065342` (job `refresh_industry`, étapes de remplacement, 4 étapes vertes, 1 min 14). Vérifié `INFORMATION_SCHEMA` 15 h 49 UTC : 16 objets (2 stagings, 2 intermédiaires, 6 marts, 6 vues) ; staging 202 895 = raw, 202 444 facturées ; `fct_client_sales_lines_margin` 202 444 lignes, `cost_known` 0 ; `fct_client_daily_margin` 975 jours, couverture 0 ; paramètres 975 jours, base connue 0 ; `fct_client_monthly_result` 47 mois dont 43 complets ; classes de jour 1 950 / 224 inchangées. Catalogue régénéré (572 tables, 10 273 colonnes). L'état vit dans `docs/catalogue-de-couts-et-marge.md` (DÉFINITIF).

Sert : `docs/catalogue-de-couts-et-marge.md` (M1-M9, décisions owner 1-5 du 11/09). Les fichiers voyagent par git
(`CLAUDE.md` § Où committer) : **PR [ms_database#147](https://github.com/Ajuria/ms_database/pull/147)**, branche
`feat/marge-catalogue-couts` sur `origin/main` `813176f`, 25 fichiers (+993 / −1) + exposures.

**Base vérifiée** : `origin/main` à `813176f` (PR #146 fusionnée). LF partout ; les six yml parsent ; ordre des `ref()`
vérifié par programme sur 20 fichiers ; dbt 1.10.11.

**Déjà en base côté app (11/09)** : `analytics.item_cost_catalog` (12 colonnes), `analytics.declared_parameters`
(10 colonnes) — vides ; `raw.client_transactions.revenue_ht`, `.vat_rate` (FLOAT64, NULL).

**Preuves BigQuery (11/09, lot matérialisé dans `_audit_scratch.lotB_*` dans l'ordre du DAG)** : staging patché
202 895 lignes = raw, 202 444 facturées = staging en base ; `fct_client_sales_lines_margin` 202 444 lignes =
`fct_client_sales_lines`, `cost_known` = 0 ; `fct_client_daily_margin` 975 jours, couverture 0 ; `int_location_declared_parameters_daily`
975 jours, base connue 0 (aucune déclaration, aucun site Crisalid avec ventes) ; classes de jour inchangées 1 950 / 224 ;
`fct_client_monthly_result` 47 mois dont 43 complets, résultat NULL partout (voulu).

**Après fusion** : run ciblé du job `refresh_industry` (70471823595526) avec les étapes :
```
dbt build --select stg_item_cost_catalog stg_declared_parameters stg_client_transactions stg_insight_event_user_location_profile int_location_declared_parameters_daily+ int_client_item_cost_daily+
```
puis `bq-verify` des six vues, `npm run catalog:refresh`, data-model-index → EN BASE, spec → DÉFINITIF.

**Reste côté app (spec § 4)** : importeur de coûts, paramètres déclarés (charges, masse salariale, base) avec date
d'effet, K9 sur `vw_insight_event_daily_margin`, drapeaux Piloter, tuiles résultat net et point mort, provider Explorer,
cartes.
