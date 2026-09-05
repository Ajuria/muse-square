> **26/08 — les copies `.sql` / `.yml` de ce dossier ont été RETIRÉES. Ne les recherchez pas : le modèle dans `ms_database` fait foi.**
>
> Pourquoi : 4 des 9 copies avaient divergé du modèle réel, et deux étaient devenues dangereuses.
> `fct_client_offering_signals_daily.sql` et `fct_client_item_signals_daily.sql` dataient d'AVANT le
> bloc RÉGIME du 25/08 : les recoller aurait supprimé `typ_n`, `baseline_same_regime_n`,
> `is_school_holiday_flag` et `regime_mismatch_flag` — quatre colonnes vérifiées PRÉSENTES en
> production dans les deux tables. `int_competitor_offering_changes.sql` avait perdu
> `schema = 'intermediate'` (le modèle serait parti dans le mauvais dataset), et
> `fct_location_daily_action_candidates.yml` divergeait de 216 lignes.
>
> Une copie d'un modèle vieillit sans prévenir ; un chemin vers le modèle, non. Le texte de la
> passation ci-dessous est conservé INTACT — c'est lui qui porte le raisonnement.
>
> Statut de CETTE passation : CONSOMMÉ — les facteurs funnel sont dans `fct_client_day_residual` sur `origin/main` (12 occurrences `expected_visitors` / `expected_transactions` / `expected_basket` / `expected_conversion`, en-tête « FUNNEL FACTORS (added 2026-08-24) »).

# Handoff dbt Cloud IDE — attendus par facteur funnel (24/08)

## Contexte (trou de vérité constaté le 24/08)
L'app avait DEUX « habituels » sans étiquette : `fct_client_day_residual.expected_revenue`
(multi-facteurs, LE « résultat habituel » arbitré) et les `*_baseline` 28 j tous-jours de
`fct_client_sales_signals_daily`. Sur la fenêtre 03–09/08 du « Coupon café glacé »
(ff2aeb35), l'un disait −1 275 €, les autres « + partout ». Objectif owner : un écart €
ne s'affiche jamais seul — il porte sa décomposition funnel (CA = passages × conversion
× panier), chaque facteur avec son verdict vs habituel, **sur LE même référentiel**.

## Fichiers à copier tels quels dans l'IDE (base = origin/main, vérifiée le 24/08)
1. `ms_dbt/models/ms_open_data/mart/fct_client_day_residual.sql` (depôt `ms_database` — copie locale retirée le 26/08, voir bandeau)
   - Chemin revenue INTACT (régression BQ : 550 lignes avant/après, **0 divergence, 0 perdue**,
     sur TOUTES les colonnes existantes — compilé origin/main vs compilé étendu, même run).
   - Ajouts : la même machinerie (mêmes cellules dow/météo/férié/vacances/tourisme, même λ=5,
     même lookback 120 j, même ensemble de jours CA>0) appliquée en format long à
     `ln(daily_visitors)` et `ln(daily_transactions)` →
     `expected_visitors`, `expected_transactions` + `visitors_residual_z`, `transactions_residual_z`.
   - `expected_basket = exp(yhat_rev − yhat_tx)`, `expected_conversion = exp(yhat_tx − yhat_vis)`
     — DÉRIVÉS PAR IDENTITÉ, jamais ajustés séparément : la fermeture
     `CA attendu = passages × conversion × panier attendus` est exacte par jour (± arrondi ≤ 2 €,
     vérifié) et se conserve en somme fenêtre. `basket_residual_z`/`conversion_residual_z` =
     résidus log-identité (r_rev − r_tx, r_tx − r_vis) / stddev par site (même méthode que
     `residual_z`). `expected_conversion` = RATIO 0-1.
   - Facteur absent (pas de flux visiteurs, ex. f10c3e58) → NULL propre, jamais un chiffre
     inventé (vérifié : 120/120 lignes NULL sur visitors/conversion, 120/120 présentes sur
     transactions/basket).
2. `ms_dbt/models/ms_open_data/mart/fct_client_sales_signals_daily.sql` (depôt `ms_database` — copie locale retirée le 26/08, voir bandeau)
   - **Commentaire d'en-tête SEULEMENT** (corps SQL prouvé identique au caractère près) :
     étiquette de référentiel des `*_baseline` 28 j (interne de déclenchement, jamais le
     « résultat habituel »).

## Vérifications déjà exécutées en BQ (compilé, --location=EU)
- Régression : `rows_orig=550, rows_new=550, rows_differing=0, rows_lost=0`.
- Fenêtre ff2aeb35 03–09/08 : CA 11 521 € vs attendu 13 053 € (compilé du 24/08 ; la table
  live disait 12 796 — dérive de données/fenêtre depuis son dernier build, pas de logique) ;
  attendus fenêtre : passages 6 488, ventes 2 776, panier 4,70 €, conversion 42,8 %
  (= le « habituel 43 % » de la maquette Palmarès).
- Réalité de la fenêtre élucidée : 6 jours à 50,0 % de conversion puis le 09/08 un pic à
  2 150 visiteurs (~890 attendus) avec conversion à 20,0 % — `conversion_residual_z` du
  09/08 = −2,16, les 6 autres jours positifs. Le modèle raconte la bonne histoire.

## Build + commit (dbt Cloud IDE)
- `dbt build -s fct_client_day_residual fct_client_sales_signals_daily`
  (les deux sont `materialized='table'` → reconstruction complète, pas de --full-refresh).
- Message de commit :
  `feat(day_residual): attendus par facteur funnel (visiteurs/ventes/panier/conversion + z) sur le référentiel d'expected_revenue ; étiquette de référentiel des baselines 28 j de sales_signals_daily`

## Après le build (app, dans l'ordre)
1. `bq-verify` des nouvelles colonnes (le catalogue `docs/catalog/bq-catalog.json` est un snapshot).
2. Surface : ligne de décomposition sur les cartes d'opération de `tableau.astro`
   (grille « Opérations en cours », données `/api/insight/dashboard`) — maquette de
   référence : artboard « PalmaresV2 » du canvas « Piloter — trois pistes », carte
   « Coupon café glacé », slots `passages [—/—] · panier [—/—]`.
   **BLOQUÉ sur un arbitrage owner** : l'agrégation fenêtre de la conversion.
   Sur 03–09/08 le verdict S'INVERSE selon le référentiel :
   - moyenne des ratios journaliers (= kpiRegistry, l'app aujourd'hui, objectifs déjà posés
     dessus) : 45,7 % vs habituel 42,9 % → « a tenu » ;
   - ratio des sommes (= la seule qui décompose exactement l'écart € : CA fenêtre =
     Σpassages × conv × panier) : 40,0 % vs 42,8 % → « manquée ».
   Jamais les deux dans une même phrase. Recommandation : ratio des sommes pour la ligne
   funnel (elle décompose l'écart €), la ligne « objectif du dispositif » restant sur le
   référentiel kpiRegistry où l'objectif a été posé — les deux lignes séparées, chacune
   portant son référentiel.
