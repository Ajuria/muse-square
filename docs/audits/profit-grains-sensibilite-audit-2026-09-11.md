# Audit — profit par grain (pôle, famille, linéaire, m²), variations volume/panier/mix et sensibilité aux signaux externes (11/09/2026) — DÉFINITIF

Sert : `intent.md` § Le métier (« rapporter [les ventes] au résultat habituel DU lieu ») et
`strategie-entreprise.md` § 12.12 (le critère d'achat est le profit ; dix-sept KPI de santé).
Instantané daté, jamais mis à jour. Chaque affirmation porte le fichier lu ; les chiffres portent
leur requête (BigQuery EU, `muse-square-open-data`, lus le 11/09). Ce qui est PROPOSÉ est
marqué « proposé » ; le reste est constaté.

---

## 0. Ce qu'il faut retenir

1. **Aucun coût, aucune marge, aucune surface, aucun mètre n'existe dans dbt ni dans l'app.** Grep
   exhaustif du projet dbt (`cost|cogs|purchase|margin|marge|profit|fixed_cost|payroll|surface|
   lineaire|metre|m2|faces|longueur`) : le seul champ en euros côté coût est `operation_cost_eur`
   (coût saisi d'UNE opération, `stg_client_commitments.sql:74`). Côté app, K9 `profit_estimated`
   multiplie le CA par une marge DÉCLARÉE (`kpiRegistry.ts:333-372`) — et lit `raw.client_transactions`
   (`:342`, dette au cliquet `CLIQUET_BRUT`).
2. **La sensibilité aux signaux externes existe déjà, au grain SITE, dans trois moteurs — dont deux
   vivent dans l'app, pas dans dbt.** (a) `fct_client_day_residual` (dbt) : attendu CA, visiteurs,
   ventes par cellules jour-de-semaine × météo (3 bandes) × férié × vacances × tourisme ; panier et
   conversion dérivés par identité. (b) `analytics.day_class_impacts` (SQL de `dayClassRegistry.ts`,
   cron nocturne) : sur le compte owner, 11 classes hors populations de cartes (chaleur 25-27, 28+, pluie,
   vacances, fériés, activité du périmètre haute/basse, événements, suivis, tourisme, remise sans effet)
   × 5 métriques (CA résiduel, ventes, panier, remise, affluence estimée) ; conversion et visiteurs
   existent dans le moteur mais pas sur ce site (aucun flux visiteurs). (c) `analytics.b_sensitivity_store` (type B,
   OLS) : **une ligne** dans tout l'entrepôt (site démo, chaleur, CA, préliminaire, fenêtre close au
   21/06). **Aucun des trois ne descend à la famille, au pôle ni à la marge.** Le mix produits × signal
   n'est mesuré nulle part (la part de famille attendue est une moyenne 30 j non conditionnée,
   `fct_client_day_family_decomposition.sql:44-51`).
3. **Le pôle n'est pas un objet de l'entrepôt.** Trois colonnes de passage (`pole_families`,
   `attached_pole_id`, `measured_scope`, `stg_client_commitments.sql:70-76`), jamais explosées ; le
   rapprochement famille → pôle se fait dans l'app. Et **zéro pôle déclaré sur les 4 sites** de
   `analytics.action_commitments` (73 lignes, `dispositif_nature` = NULL ou `operation`,
   `pole_families` NULL partout). Tout KPI « par pôle » repose sur un mapping qui n'existe pas encore.
4. **Les entrées déclarées ont un canal générique, mais un seul scalaire par (site, type).**
   `analytics.consulter_correction_events` (10 colonnes, sans unité, sans identifiant de pôle ni
   de composant, sans date d'effet) ; côté dbt `int_location_declared_metrics_current` le lit
   (`metric_key`, `value_numeric`) et **personne ne le consomme**. Charges fixes et masse salariale
   mensuelles y passent ; un catalogue de coûts (article × date d'effet × prix) et une mesure par
   composant n'y passent pas.
5. **L'ingestion ne porte ni type de document, ni coût.** `raw.client_transactions` = 27 colonnes ;
   `stg_client_transactions` ne dérive que `is_invoiced` (règles `import_routing_rules`). L'importeur
   (`src/pages/api/import/sales-csv.ts`) est le seul ; l'override `crisalid` est vide. Les KPI 9
   (casse/invendus) et 17 (retours) dépendent d'une colonne qui n'existe pas.

**Conséquence** : le chantier est d'abord un chantier d'ENTRÉES (catalogue de coûts, pôles,
mesures d'espace, charges) et de DBT (marts de marge par grain, réponse aux signaux par famille
et pôle). Les surfaces app suivent des patrons qui existent déjà (bloc `debloquer` du tableau de
bord, `KPI_DAILY_COL`, `reg()` des cartes, `FAMILIES` d'Explorer, sections du rapport).

---

## 1. Périmètre et méthode

- Lu : `docs/strategie-entreprise.md` § 8.3, 9.2, 12.7, 12.12 ; `docs/intent.md` ; `docs/lexique.md` ;
  `docs/marche-guidee-spec.md` ; `docs/dispositifs-typologie-spec.md` § 3 ; `docs/piloter-redesign.md` ;
  `docs/kpi-enjeu-mapping.md` ; `docs/enjeu-day-class-registry.md` ; `docs/dbt-handoff/HANDOFF-funnel-attendus.md` ;
  `docs/tourisme-grain-spec.md` ; `docs/audits/cartes-action-audit-2026-09-04.md`.
- dbt (`~/Documents/ms_database/ms_dbt/`) : les 14 modèles de vente, les 9 modèles de contexte /
  impact / résidu, la chaîne composants, les sources `raw` et `analytics`, les seeds `predictive_models`.
- App : `tableau.astro` + `dashboard.ts`, `kpiRegistry.ts`, `dayClassRegistry.ts`, `corrections.ts` +
  `declaredMetrics.ts`, `sales-csv.ts` + `sourceMappings.ts`, `dispositifTypes.ts` + `pole-form.js`,
  `sensitivityStore.ts` + `sensitivityFeatures.json`, `monitor.ts` + `action-cards.js` +
  `manualCandidates.ts`, `prompt.ts` + `insightFamilies/index.ts` + `weather.ts`, `sales-report.ts` +
  `rapport.astro`, `explorer/agent.ts` + `agentTools.ts`, `dayContext.ts`.
- BigQuery (live) : `INFORMATION_SCHEMA.COLUMNS` de `raw.client_transactions`, des 10 vues semantic
  citées, de `analytics.b_sensitivity_store`, `analytics.day_class_impacts`,
  `analytics.action_commitments`, `raw.saved_items` ; comptages cités § 3.

---

## 2. Les dix-sept KPI de § 12.12 face à l'entrepôt

| # | KPI (§ 12.12) | Ce qui existe (vérifié) | Ce qui manque |
|---|---|---|---|
| 1 | Résultat net mensuel | rien | KPI 3 + charges fixes + masse salariale déclarées |
| 2 | CA net HT vs résultat habituel | `daily_net_revenue = sum(revenue − discount_amount)` (`int_client_daily_performance.sql:36`) jusqu'à `semantic.vw_insight_event_client_performance` (colonne vérifiée live) ; `revenue_30d_avg` | **0 lecteur** de `daily_net_revenue` dans l'app (tout lit `daily_revenue`) ; HT : aucune colonne TVA, mapping `crisalid` vide (`sourceMappings.ts:72-88`) ; LE mot (décision owner 1) |
| 3 | Taux de marge brute réel par famille et article | grain ligne disponible : `vw_insight_event_client_sales_lines` (`item_code, item_category, units, quantity_decimal, unit_price, revenue, discount_amount`) | catalogue de coûts (source + staging + jointure à date d'effet) ; mart de marge |
| 4 | Marge par pôle et famille, € et part | famille : KPI 3 ; pôle : 3 colonnes de passage jamais explosées (`stg_client_commitments.sql:70-76`) | modèle pôle ← famille dans dbt ; **et les pôles eux-mêmes** (0 déclaré) |
| 5 | Marge par mètre linéaire, part de marge vs Part de linéaire | rien : composant = `{key, type, role, label}` (`dispositifTypes.ts:281-286`), 20 colonnes sans dimension dans `vw_insight_event_dispositif_components` ; les 52 mètres d'Épices et Tout sont dans un CSV de session (mémoire `epices-et-tout-metres-lineaires`) | mesure par composant (longueur, faces, part par famille — typologie § 3 : `dispositifs-typologie-spec.md:215-221`) ; une table pour la porter ; KPI 4 |
| 6 | Point mort du jour et heure atteinte | `vw_insight_event_client_hourly_daily` (`revenue, units, transactions, lines, visitors, avg_basket, conversion_rate`, colonnes vérifiées live) ; **sans famille** — la marge horaire passe par `fct_client_sales_lines` (`transaction_hour` × `item_category`) | charges + masse salariale déclarées, jours d'ouverture (champ `operating_hours` du profil, `profile/save.ts`, format non vérifié ici), KPI 3 |
| 7 | Taux de remise | `discount_rate` famille × jour (`fct_client_family_price_daily.sql:53`), `daily_discount_total`, K6 ; carte `family_discount_move` en prod | ratio site remises ÷ CA brut sur la période, surfacé (app seulement) |
| 8 | Ventes à perte ou près du coût | `realized_price` (`fct_client_family_price_daily.sql:52`), `unit_price` ligne, `avg_unit_price` famille | le coût |
| 9 | Casse et invendus en marge perdue | rien : 27 colonnes raw, aucun type de document ; `is_invoiced` seul (`stg_client_transactions.sql:175`) | colonne type de document à l'ingestion + règle (décision owner 2) + mart ; KPI 3 |
| 10 | Articles morts | `is_dead_item`, `days_since_last_sale` (`vw_insight_event_client_item_signals`, vérifié live) ; carte `item_absent_regular` | l'agrégat « part du catalogue » sur la fenêtre + surface |
| 11 | Masse salariale ÷ CA net | `daily_net_revenue` | masse salariale déclarée (mensuelle) |
| 12 | Marge par m² par pôle | rien (aucun champ surface au profil : 56 colonnes de `raw.insight_event_user_location_profile`, aucune) | surface déclarée par pôle et par site ; KPI 4 |
| 13 | Marge par heure d'ouverture | `fct_client_sales_lines` porte `transaction_hour` et `item_category` | KPI 3 au grain heure × famille (mart à créer) |
| 14 | Panier moyen | K4 `daily_avg_basket` ; attendu `expected_basket` (`fct_client_day_residual.sql:203`) | — |
| 15 | Ventes (compte) | K5 `daily_transactions`, `units_sold` (`stg_client_transactions.sql:116-121`) ; attendu `expected_transactions` | — |
| 16 | Taux de conversion | K3 ; `expected_conversion` par identité ; NULL sans flux visiteurs (f10c3e58 : NULL) | flux visiteurs |
| 17 | Taux de retour | `units_sold` = −1 par retour au poids ; aucune colonne « retours » agrégée | décision RETOUR (owner 3) ; colonne `returns_units` / `returns_eur` au mart |

Verdict de `docs/audits/card-truth-audit.md` : aucune carte de marge n'existe, l'audit n'en juge
aucune ; les cartes ventes récentes (`family_price_move`, `family_discount_move`, `item_absent_regular`,
`tickets_lines_move`) sont postérieures à l'audit et arbitrées le 07/09 (mémoire
`trois-couches-grain-facture-chantier`).

---

## 3. Ce qui existe — vérifié

### 3.1 Entrées déclarées

- **Écriture** : `POST /api/insight/corrections` → `analytics.consulter_correction_events`, colonnes
  `event_id, event_action, location_id, correction_type, correction_text, prior_value, raw_turn, source,
  declarant_name, created_at` (`src/lib/ai/corrections.ts:100-104`). `correction_text` = la valeur nue en
  chaîne (`:25`). Types acceptés avec une valeur : `declared_margin_pct` (1-90) et `declared_client_count`
  (`src/pages/api/insight/corrections.ts:67-74`) ; marge par famille = `declared_margin_pct__<slug>`
  (`corrections.ts:32-45`).
- **Lecture app** : `getActiveCorrections` (dernier événement par type, hors `clear`, `corrections.ts:57-85`),
  `getDeclaredFamilyMargins` (`:164-176`), `getDeclaredMetric` générique (`:147-156`). `DECLARED_METRICS`
  n'a que deux entrées (`src/lib/ai/declaredMetrics.ts:50-87`) ; `missing_dim` est une union de deux valeurs (`:26`).
- **Lecture dbt** : `stg_consulter_corrections` → `int_consulter_corrections_current` (lu par
  `dashboard.ts:269-272`) → `int_location_declared_metrics_current` (`location_id × metric_key`,
  `value_numeric`, `declared_at` ; `models/ms_open_data/intermediate/…:16-49`) — **aucun lecteur**.
- **Ce que le canal ne porte pas** : unité, identifiant de portée (pôle, composant, article), date
  d'effet, valeur composée. Une marge par famille y tient parce que la famille est encodée dans le
  nom du type ; un prix d'achat par article daté n'y tient pas.
- **Autre entrée existante** : `operation_cost_eur` sur l'engagement (`analytics.action_commitments`,
  colonne vérifiée live ; 0 valeur sur les 73 lignes).

### 3.2 Les grains de vente disponibles

Tous dans dbt, lus par l'app via `semantic` (sauf dette K8/K9) :

| Grain | Mart → vue | Colonnes utiles à la marge |
|---|---|---|
| ligne de ticket | `fct_client_sales_lines` → `vw_insight_event_client_sales_lines` | `invoice_number, transaction_hour, item_code, item_category, units, quantity_decimal, unit_price, revenue, discount_amount` |
| ticket | `fct_client_tickets` (× jour `fct_client_tickets_daily`) | `units, revenue, discount_amount, families[]` |
| famille × jour | `fct_client_offering_daily` → `vw_…_client_offering_daily` ; `fct_client_family_price_daily` → `vw_…_family_price_daily` | `units, revenue, avg_unit_price, revenue_share` ; `realized_price, discount_rate, has_fractional_units` |
| famille × jour, attendu | `fct_client_day_family_decomposition` → `vw_…_day_family_decomposition` | `expected_revenue, delta_eur, baseline_share, expected_units, delta_units` |
| article × jour | `fct_client_item_signals_daily` → `vw_…_client_item_signals` ; `fct_client_item_absence_daily` | `unit_price, is_dead_item, days_since_last_sale, expected_item_revenue` |
| heure × jour | `fct_client_hourly_sales` → `vw_…_client_hourly_daily` | `revenue, units, transactions` — **sans famille** |
| site × jour | `int/fct_client_daily_performance` → `vw_…_client_performance` ; `fct_client_day_residual` → `vw_…_day_residual` ; `fct_client_day_decomposition` | `daily_net_revenue, daily_discount_total` ; `expected_{revenue,visitors,transactions,basket,conversion}` + z ; `volume_term_eur, basket_term_eur, top_families` |

`units_sold` : une pesée = une vente (ms_database#134) ; `quantity_decimal` porte le poids.

### 3.3 Signaux externes et sensibilité — quatre moteurs, un seul grain

| Moteur | Où | Signaux | Métriques | Grain | État |
|---|---|---|---|---|---|
| Résultat habituel multi-facteurs | dbt `fct_client_day_residual.sql` | cellules `dow`, `wx` (3 bandes sur `alert_level_max` : S ≥ 3, P ≥ 1, C), `hol`, `sch`, `tour` (`:57-61`) ; effets additifs rétrécis, λ = 5 (`:79-83`) | CA, visiteurs, ventes ajustés ; panier et conversion par identité (`:203-204`) | site × jour | en prod, LE référentiel |
| Classes de jours | app `src/lib/kpi/dayClassRegistry.ts` (SQL `dayClassAggregateSql`, cron `api/cron/day-class-impacts.ts`) → `analytics.day_class_impacts` | `heat_25_27` (lvl_heat = 1), `heat_28_plus` (≥ 2), `rain`, `wind`, `snow`, `cold` (lvl ≥ 1, `:108-114`) ; `competition_high/low`, `tourism_high/low`, `events_high`, `mobility_disruption`, `followed_activity_high`, `traffic_high`, `school_holiday`, `public_holiday` (`:122-154`) | `revenue_residual` (écart au résultat habituel), `transactions`, `basket`, `discount`, `conversion`, `footfall` (`KPI_PERF_KEYS`), `busyness` (`:484-528`) ; bases `pure` / `marginal` (contrôle de cellule mois × type de jour) | site × classe × métrique | **live** : compte owner = 57 lignes, 19 classes dont 11 hors populations de cartes, 5 métriques (`basket, busyness, discount, revenue_residual, transactions`), 160 j de portée (`SELECT … FROM analytics.day_class_impacts WHERE STARTS_WITH(location_id,"f10c3e58")`, 11/09) ; rendu comme « coin » des cartes (`funnelCornerForCandidate`, `:1543-1582`) et enjeu €/an |
| Type B (OLS + SE + VIF) | `tools/generators/sensitivity-engine.cjs` → `analytics.b_sensitivity_store` ; accès `src/lib/sensitivity/sensitivityStore.ts` | registre `sensitivityFeatures.json` : `tourism_peak, heat, rain, school_holiday, public_holiday, cold, wind, snow, mobility_disruption` (+ `major_event` inerte) | `revenue` seulement (`METRIC_COLS`, engine `:55`) | site × facteur | **1 ligne** : `ff2aeb35`, `heat`, `revenue`, `down`, −12,2 %, t = −1,81, 28 j, préliminaire, 18/04 → 21/06/2026. Rien sur f10c3e58. Non référencé dans dbt (grep `b_sensitivity` : 0) |
| Priors secteur | dbt `fct_location_impact_daily_{weather,calendar,events,mobility}` ← seeds `predictive_models/*_impacts_coeffs.csv` | `delta_att_*_pct` | aucune mesure client ; `weather_impacts_coeffs_learned.csv` : colonne `beta_att_per_pct_impact` **vide** ; `fct_location_attendance_effects_daily` `enabled = false` (« modèle dégénéré », `:26-30`) | site × jour | priors, jamais étiquetés mesure |

Ce qui manque, précisément :

- **Le grain famille / pôle × signal** : aucun des quatre. La seule lecture famille × condition est
  une moyenne naïve dans le provider Explorer `weather.ts:124-141` (CA moyen de la famille les jours
  `lvl ≥ BAND` contre les autres jours, sans contrôle jour-de-semaine ni saison — étiqueté
  `observed_difference`, `:10-14`). Le commentaire de `dayClassRegistry.ts:497` le dit : « family_revenue
  est au grain PRODUIT, donc une autre jointure ».
- **Le mix** (part de chaque famille) × signal : nulle part.
- **La saisonnalité** n'est pas un facteur rapporté : c'est une cellule de contrôle (mois × type de
  jour) dans le store des classes, et la tendance dans le résidu. « Selon saisonnalité » se lit donc
  aujourd'hui comme « à saison égale », jamais comme « en été vs en hiver ».
- **La marge × signal** : impossible sans KPI 3.
- **La chaleur** est une bande de niveau (25-27, 28+), la pluie un seuil (`lvl_rain ≥ 1` =
  3,3 mm, `int_client_weather_alerts_daily.sql:121-137`). Aucune pente par degré ou par mm nulle part.

### 3.4 Pôle, composant, espace

- Hiérarchie owner pôle → dispositif → composant (`dispositifs-typologie-spec.md` § 3). Le composant du
  plan « est décrit par son N° sur le plan, sa longueur, ses faces accessibles et ses familles avec la
  part de chacune (en % de sa façade) » (`:215-217`) ; mot acté **Part de linéaire** (lexique l. 98).
- Le relevé de l'espace (`marche-guidee-spec.md`) ne demande **jamais de mètres** à l'exploitant (M4,
  `:69` ; `:138`) et un plan photographié « donne la topologie, jamais une mesure » (`:57`). Les mètres
  d'Épices et Tout viennent du plan vectoriel mesuré par nous (52 meubles ; n° 49, 3-6, 19 à confirmer).
  **Donc : la longueur et les faces sont un attribut du composant, saisi hors relevé — et aucune table
  ne les porte.** Idem la surface par pôle (« colonne déclarée à créer », § 12.12).
- En base : `int_client_dispositif_components` n'explose que `components` (`:56`) ; 20 colonnes, toutes
  STRING/INT64/BOOL/TIMESTAMP, aucune dimension (`schema_app_surfaces.yml:873-913`).
- Live (11/09) : `analytics.action_commitments` = 73 lignes sur 4 sites, `dispositif_nature` NULL (68)
  ou `operation` (5), `pole_families` NULL partout, `components` NULL partout ; f10c3e58 : 30 engagements,
  0 pôle ; a3b442c2 (Épices et Tout) : 0 ligne. `raw.saved_items` n'a pas de colonne de nature.

### 3.5 Ingestion

- `raw.client_transactions` : 27 colonnes (live) ; l'importeur en écrit 25 (`sales-csv.ts:61-99`).
  Pas de type de document, pas de coût, pas de TVA. `source_type` = `'pos'` en dur (`:94`).
- `stg_client_transactions` : `is_invoiced` par regex de n° de pièce (`import_routing_rules`, table
  peuplée à la main, 0 lecteur app — `docs/import-routing-spec.md:36-37`).
- Sites avec ventes : 4 sites `seed_maven` (graine, jusqu'au 30/09/2026) + 1 `sage100` (6 297 lignes,
  jusqu'au 27/07). `quantity_decimal` : 0 valeur (aucune pesée importée à ce jour).

### 3.6 Les surfaces app et leurs points d'accroche

- **Piloter** (`/app/insightevent/tableau` ← `GET /api/insight/dashboard?period=365`) : le profit vit
  dans la carte CA (`tableau.astro:652-670`, rien sans marge, règle 5) ; le déblocage est le bloc
  `debloquer` (`dashboard.ts:1501-1539`, chaque drapeau = un manque RÉEL en base) rendu par
  `buildGoals` (`tableau.astro:184-274`), la ligne marge en est le patron (`:261-273`). Payload
  `marges = {familles, profit30, couverture_pct, n_declarees, n_familles}` (`dashboard.ts:1040-1046`).
  Héros v11 : « que des mesures qui existent » en rangée 1 (`piloter-redesign.md`) — un KPI de plus
  au héros est un arbitrage owner, pas une ligne de code.
- **KPI d'engagement** : `KPI_DAILY_COL` (`kpiRegistry.ts:71-76`) est le seul foyer pour un KPI
  mesuré par colonne ; `kpiVerdict` pur (`:563-573`). K8 et K9 ont leur propre requête sur `raw` (dette).
- **Agir** (`/app/insightevent/pulse` ← `GET /api/insight/monitor`) : une carte = une ligne de
  `semantic.vw_insight_event_action_candidates` (`manualCandidates.ts:16`) + `reg()` dans
  `action-cards.js:493` + geste `ACTION_SENTENCES` (`:3536`) + 6 jumeaux serveur
  (`recoThemeMap.ts`, `internalAlertCards.ts`, `kpiRegistry.ts`, `dayClassRegistry.ts`,
  `memberCardPolicy.ts`, `commitmentOrigins.ts`) + 3 plans `reco-library.js` (porte
  `recoCoverage.guard.test.ts`). 100 types enregistrés. Le corps 3 couches de `sales_surge` lit
  `decomposition` attachée depuis `vw_insight_event_day_decomposition` (`monitor.ts:357`).
- **Explorer** (`/app/insightevent/prompt` ← `POST /api/insight/prompt`) : routage par
  `familyForQuestion` (`insightFamilies/index.ts:258`), 13 providers ; la marge déclarée répond par
  `declaredFamilyMarginAnswerFr` (`contextCopy.ts:266-289`, branche `prompt.ts:3045-3078`) ; les
  réponses sont validées (`packagerSchemas`, `groundingChecks`, `honestAbsence`). L'agent
  (`api/explorer/agent.ts`) a 5 outils, lit `semantic`, écrit `raw.explorer_site_memory`.
- **Rapport** (`rapport.astro` ← `POST /api/insight/sales-report`) : 10 sections, KPI tuiles CA ·
  Transactions · Panier moyen · Meilleure journée, « Répartition par catégorie », « Contexte externe »
  (associations, non causes), actions ; `family-report.ts` rejoue TOUS les providers `FAMILIES`.

---

## 4. Livrables débloquables, par entrée — proposé

Principe (§ 12.12) : **tant que les prix d'achat ne sont pas en base, aucun chiffre de marge ne se
montre.** Chaque palier ne s'ouvre que par une entrée réelle, et se dit absent avant.

### Palier 0 — les ventes seules (rien à saisir ; tout est en base)

| Livrable | Surface | Existe / manque |
|---|---|---|
| Ventes et panier moyen par classe de jour (chaleur 25-27 / 28+, pluie, vacances, fériés, activité du périmètre…) | Explorer (question), rapport « Contexte externe » | mesure EXISTE (`day_class_impacts`, base `marginal`) ; aucune question Explorer ne la lit, le rapport ne la lit pas |
| Mix produits par classe de jour (part de chaque famille vs jours comparables) | Explorer, rapport, carte structurelle « famille sensible à <classe> » | **dbt à créer** (§ 5 D4) |
| Taux de remise (KPI 7), articles morts (KPI 10) sur la période | Piloter (arbitrage héros), rapport | colonnes existent ; agrégat période + surface à faire |
| Taux de retour (KPI 17) | id. | décision RETOUR + colonne mart |

### Palier 1 — le catalogue de coûts (article × date d'effet × prix d'achat HT)

| Livrable | Surface |
|---|---|
| KPI 3 taux de marge brute réel par famille et article ; K9 devient **mesuré** (repli déclaré étiqueté) | Piloter carte CA (second chiffre), KPI d'engagement (`KPI_DAILY_COL`) |
| KPI 8 ventes à perte ou près du coût (illégal sous le coût, DGCCRF) | carte Agir (une par site et par jour, article au pire écart), Explorer |
| Remise qui efface la marge : `family_discount_move` relu en marge | carte Agir (corps enrichi, ADD) |
| Marge du jour vs résultat habituel (miroir `sales_down` / `sales_surge` en marge) | carte Agir |
| Famille lourde en CA, légère en marge (KPI 4 sans pôle) | carte structurelle, Explorer, rapport (section marge par famille) |
| Marge × classes de jour (la sensibilité de la MARGE, pas du CA) | Explorer, rapport, coin des cartes |
| KPI 13 marge par heure d'ouverture | Explorer (heure), rapport |

### Palier 2 — charges fixes + masse salariale mensuelles (deux scalaires déclarés)

| Livrable | Surface |
|---|---|
| KPI 1 résultat net du mois ; KPI 11 masse salariale ÷ CA net | Piloter (mot à arbitrer), rapport |
| KPI 6 point mort du jour et heure atteinte (charges ÷ jours d'ouverture ÷ taux de marge, sur `vw_…_client_hourly_daily`) | carte Agir « point mort atteint à Nh contre Mh votre <jour> habituel » (mots à arbitrer), Explorer |
| Journée sous le point mort | carte Agir, KPI d'engagement |

### Palier 3 — pôles déclarés + mesures d'espace

| Livrable | Surface | Entrée |
|---|---|---|
| KPI 4 marge par pôle (€ et part) | Piloter (répartition sous la carte CA, ordre fixe), document du pôle, rapport | pôles déclarés (mapping complet ou il ment) |
| KPI 5 marge par mètre linéaire, part de marge vs Part de linéaire (« 12 % de la façade pour 4 % de la marge » — phrase owner) | carte Agir structurelle par composant, document du pôle, Explorer | longueur + faces + part par famille, par composant |
| KPI 12 marge par m² par pôle | document du pôle, rapport | surface m² par pôle et par site |
| Ventes / panier / mix par pôle × classe de jour | Explorer, rapport | pôles |

### Palier 4 — types de document Crisalid (IVD, SST, RUP)

KPI 9 casse et invendus en marge perdue ; KPI 17 complet. Entrée : colonne à l'ingestion + règle
(décision owner 2), export de détail Crisalid non reçu au 11/09.

---

## 5. Conclusions dbt — proposé, dans l'ordre du DAG

Règle : chaque vue manquante se crée dans dbt AVANT toute lecture app ; l'app lit `semantic`.

- **D1 Catalogue de coûts.** Source app-write `analytics.item_cost_catalog` (à déclarer dans
  `staging/sources.yml` sous `analytics`, comme `consulter_correction_events:358`) : `location_id,
  item_code, item_description?, unit_cost_ht, effective_from, source, declarant, created_at`. Puis
  `stg_item_cost_catalog` → `int_client_item_cost_effective` (article × jour, coût en vigueur à la
  date : jointure « dernier `effective_from` ≤ date ») → `fct_client_sales_lines_margin` (grain ligne :
  `revenue, discount_amount, units, unit_cost, cost, gross_margin, is_below_cost, cost_known`) →
  `fct_client_family_margin_daily` (site × jour × famille : CA brut, net, coût, marge, taux, **couverture**
  = part du CA dont le coût est connu) → `vw_insight_event_family_margin_daily` (contrat enforced).
  Le repli déclaré (marge %) reste app-side et se libelle estimation.
- **D2 Le pôle comme objet.** Aujourd'hui `pole_families` est un JSON de passage. Créer
  `int_client_pole_family_map` (site × famille → `pole_id`, depuis la version courante des pôles de
  `stg_client_commitments`, `dispositif_nature` du pôle) + un test « chaque famille vendue sur 30 j a
  un pôle » (sévérité warn, la ligne « Non rattaché » existe déjà côté app) → `fct_client_pole_daily`
  (site × jour × pôle : CA, ventes, panier, part, marge quand D1). Prérequis : des pôles déclarés.
- **D3 Mesures d'espace.** Une table app-write `analytics.component_measures` (`location_id,
  dispositif_id, version_no, component_key, plan_no, length_m, faces, families_share JSON,
  measured_at, source`) — et non un champ de plus dans le JSON `components`, pour ne pas casser
  `parseComponents` (`dispositifTypes.ts:293-325`) ni la vue contrat. Surface par pôle : colonne
  `pole_surface_m2` sur l'engagement du pôle (ALTER additif, comme `measured_scope`). Puis
  `fct_client_pole_space` (site × pôle × famille : ML de façade = Σ longueur × faces × part, m²) →
  `fct_client_pole_margin_space` (KPI 5 et 12).
- **D4 Réponse aux signaux par famille et pôle.** Le moteur des classes vit dans l'app
  (`dayClassAggregateSql`, ~600 lignes SQL) : le porter en dbt est le geste qui ouvre les grains.
  `int_location_day_class` (date × site × `class_key`, définitions PORTÉES à l'identique depuis
  `dayClassRegistry.ts:108-154`, jamais réécrites) → `fct_client_family_signal_response` (site × famille ×
  classe × métrique {CA, ventes, panier, part, marge} : n jours, écart moyen vs jours comparables,
  écart log, sd, portée) et son jumeau pôle. Le store app reste en place pour les cartes tant que
  la parité n'est pas prouvée (ne jamais retirer avant le remplaçant testé).
- **D5 Résultat habituel de la marge et du mix.** `fct_client_day_family_decomposition` conditionne
  la part attendue sur 30 j seulement : ajouter la cellule (dow, wx, hol, sch, tour) à la part
  attendue — même machinerie que `fct_client_day_residual`, format long par famille — est l'extension
  minimale, à mesurer avant/après sur f10c3e58 (0 écart sur les colonnes existantes).
- **D6 Paramètres déclarés à date d'effet.** Charges fixes et masse salariale changent : une table
  `analytics.declared_parameters` (`location_id, key, value, unit, effective_from, declarant, created_at`)
  plutôt que le journal des corrections (sans date d'effet, sans unité). `int_location_declared_metrics_current`
  peut rester pour la marge %, ou être remplacé — il n'a aucun lecteur.
- **D7 Ingestion.** Colonne `document_type` sur `raw.client_transactions` (ALTER additif) portée par
  `stg_client_transactions` ; `is_invoiced` et les mouvements de stock (IVD/SST/RUP) deviennent des
  règles sur cette colonne, plus seulement sur le n° de pièce ; `returns_units/eur` au grain jour.
- **D8 Dette de frontière.** K8 et K9 lisent `raw` (`kpiRegistry.ts:308, 342`) : le KPI de marge
  mesurée lit `vw_insight_event_family_margin_daily`, et K9 bascule dessus avec repli déclaré.

Ordre de passation (amont → aval, § Passation « colle ce bloc » point 6) : sources yml → staging
(D1, D6, D7) → intermédiaire (D2, D3, D4 classes) → marts (D1, D2, D3, D4, D5) → semantic + contrats.
Chaque mart nouveau : `bq-verify` avant lecture ; `full-refresh` pour les incrémentaux.

---

## 6. Conclusions app — proposé

- **A1 Entrée du catalogue de coûts.** Un importeur de coûts à côté de `sales-csv.ts` (même dossier
  `src/pages/api/import/`, même `resolveMapping` de `sourceMappings.ts`, cible `analytics.item_cost_catalog`),
  écran de correspondance article (`item_code` du catalogue ↔ `item_code` des ventes, couverture
  affichée). Format du fichier = décision owner 5.
- **A2 Paramètres déclarés.** Généraliser `DECLARED_METRICS` (charges fixes, masse salariale,
  surface par pôle) avec unité et date d'effet → `analytics.declared_parameters` (D6). Le formulaire
  inline du tableau de bord (`tableau.astro:1975-2037`) est le patron.
- **A3 Pôles.** Le prérequis de tout « par pôle » est un pôle déclaré : 0 aujourd'hui. Onboarding
  Épices et Tout = déclarer les 7 pôles depuis les zones du plan (décision owner 6), avec la
  correspondance familles caisse ↔ pôle (« Pôle en projet » tant que rien n'est importé).
- **A4 Mesures d'espace.** La longueur, les faces et la part par famille se saisissent sur le
  composant (formulaire de pôle `pole-form.js:78-82` ou page « Fin du relevé ») — jamais pendant le
  relevé (M4). Surface m² au pôle. Épices et Tout : pré-remplir depuis le tableau des 52 meubles.
- **A5 KPI.** Nouvelles clés dans `KPI_DAILY_COL` lues sur les vues D1/D2 (marge brute, marge par
  famille, point mort) ; `kpiVerdict` inchangé ; K9 = mesuré si couverture, sinon déclaré et DIT.
- **A6 Piloter.** Drapeaux `debloquer` : `cost_catalog_missing` (avec couverture), `fixed_costs_missing`,
  `poles_missing`, `space_missing` — chacun vérifié en base ; le profit de la carte CA passe de
  « ≈ » à mesuré ; tout KPI de plus au héros = arbitrage owner. Mots manquants au lexique : marge
  brute, résultat net, point mort, masse salariale, CA net HT.
- **A7 Agir.** Chaque carte nouvelle = une ligne candidate dbt + les 8 déclarations du § 3.6 + 3 plans
  en voix owner ; les cartes de marge n'entrent qu'après D1 et passent la barre `card-review`
  (vrai, invisible sans nous, actionnable, légal — jamais un geste sur les commandes ou le stock).
- **A8 Explorer et rapport.** Un provider `marge` dans `FAMILIES` (patron `salesDecomp.ts`), réutilisé
  par `family-report.ts` et le rapport de ventes (section marge, section réponse aux signaux) ; les
  questions volume/panier/mix × classe lisent D4 ; l'agent gagne un outil de lecture de la marge
  (lecture `semantic` seule). Réponses grounded, absence honnête chiffrée (« coût connu sur 62 % du
  CA »).

---

## 7. Décisions owner nécessaires avant toute spec

1. LE mot de « CA net HT » et les quatre mots (marge brute, résultat net, point mort, masse salariale) — lexique.
2. Type de document Crisalid : colonne ou règle (§ 12.12 décision 2) ; RETOUR dans le brut (décision 3).
3. Format du fichier de prix d'achat : article × date d'effet × prix HT, fournisseur ou non (décision 5).
4. Charges fixes et masse salariale : mensuelles avec date d'effet ; jours d'ouverture depuis le profil ou déclarés.
5. Où se saisissent longueur, faces et part par composant (formulaire de pôle vs Fin du relevé) ; surface m² par pôle.
6. Zones du plan → pôles et familles d'Épices et Tout (décision 6) ; n° 49, 3-6, 19 à confirmer sur place.
7. Porter le moteur des classes de jours en dbt (D4) : oui / non / après la marge.
8. Ordre : § 12.12 fixe ingestion Crisalid → catalogue → marge + fuites → charges ; le palier 0
   (signaux × famille) est indépendant et peut avancer en parallèle côté dbt.

---

## 8. Ordre proposé

1. Décisions 1-3 et 5 (mots, document, prix d'achat, espace) — sans elles, D1/D3/D7 ne s'écrivent pas.
2. dbt lot A (indépendant des prix) : D4 classes en dbt + réponse famille × signal, D5 part attendue
   conditionnée, D7 colonne document. Prouvé sur f10c3e58 (avant/après, 0 écart sur l'existant).
3. Entrées : pôles d'Épices et Tout (A3), catalogue de coûts (A1 + D1), paramètres (A2 + D6).
4. dbt lot B : D1 marge, D2 pôle, D3 espace, D8.
5. App : A5 → A6 → A8 → A7, chaque surface vérifiée sur f10c3e58 et sur a3b442c2 dès ses premières ventes.

— Instantané du 11/09/2026. Les chiffres se re-mesurent avant réutilisation.
