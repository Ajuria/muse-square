# Nettoyage du projet dbt — coût, périmètre, grain, matérialisation — SPEC DE TRAVAIL

Sert : intent § Le métier (« regarder la fréquentation et les ventes tous les jours ») et § Ce qui fait loi (`data-model-index.md`). Constat de départ : [`audits/dbt-audit-2026-09-04.md`](audits/dbt-audit-2026-09-04.md) — ses chiffres datent du 04/09 et ne se réutilisent pas sans re-mesure. Direction arbitrée par l'owner le 04/09 : on travaille **à rebours depuis les consommateurs** (surfaces app et jobs), le grain se déclare partout, et le temps de page pèse dans le choix vue / table.

Ce document dit l'état puis ce qui reste à faire, dans l'ordre d'exécution. Chaque geste dbt part en passation (`dbt-handoff/`), avec son message de commit.

---

## 0. État (04/09, 22 h 45)

- Les 8 jobs dbt Cloud compilent et tournent. Le 04/09 au soir, sept PR sont mergées sur `main` (#97 exposures, #98 fan-out ×21, #99 grain, #100 tourisme calendrier, #101 hotfix config, #102 event_uid NULL-safe, #103 warn → error) ; `Ajuria-branch` = `main` ; dernier run de production vert à 22:37 (run 70471896024602 : refresh J−120, tests de grain, chaîne aval en 3 min 49).
- 334 modèles ; **104 consommateurs** (33 vues semantic lues par l'app, 41 lectures directes de marts/intermédiaires/dims, les modèles sélectionnés par les jobs par nom ou par tag) ; **230 modèles** sur leur chemin amont ; **88 modèles hors de tout chemin de consommation** (+ 16 du dossier `survey/`).
- Aucune `exposure` déclarée : le périmètre « ce que l'app lit » vit dans le code de l'app, pas dans dbt.

---

## 1. Coût — la chaîne événements (geste 1, indépendant du reste)

### 1.1 Ce qui est

**Cause réelle, mesurée le 04/09 après-midi (PR ms_database #98)** : l'explosion est bornée par défaut (aujourd'hui → +365 j, vars `events_daily_min_date` / `events_daily_max_date`) ; ce qui multiplie la table est la jointure `city_dim` sur `city_id` seul, alors que `dim_event_city_label` est au grain `location_uid` — Paris `75056` y a 21 lignes (arrondissements), Marseille 16, Toulouse 6. Chaque clé `date × event_uid × source_system` sortait 21 fois en IdF : 210 687 645 lignes pour 10 144 519 clés, 95,2 % de redondance. La PR #98 met une ligne par `city_id` dans les 5 modèles régionaux, ajoute `partition_expiration_days = 400` et le test de grain ; prouvé en scratch (clés identiques, 0 différence hors `city_name`, build 1,4 Go / 11 s contre 440 Go / 117 s). Le reste de ce § 1 (spans pour le directory, lecteurs app) reste à faire ; les permanents restent explosés (owner 04/09).

`int_events_daily_idf` explose chaque événement en une ligne par jour de `event_start_date` à `event_end_date`, bornée à la fenêtre du run. Mesuré le 04/09 : 210 687 645 lignes, 459 dates, 292 826 événements, 95 % des lignes issues de spans de plus de 30 jours, 33 % de spans de plus d'un an (expositions permanentes jusqu'en 2030, 9 639 lignes chacune). Le modèle est incrémental `insert_overwrite` partitionné par `date` mais sans filtre de date sur la source : chaque run réécrit toutes les partitions (366 Go × 53 runs en 60 jours).

La vue `int_events_event_daily_enriched` (union des `int_events_daily_*`) est rescannée en entier par trois marts dbt (`fct_competitor_directory`, `fct_location_events_topn_daily`, `fct_location_events_radius_daily`) **et par l'app** : le cron `cron/snapshot-competitors.ts` et `insight/dashboard.ts` reconstruisent chaque nuit `analytics.location_public_events` et `analytics.location_public_events_coverage` par `CREATE OR REPLACE TABLE` sur cette vue — 14 exécutions et **5,3 To facturés en 14 jours** côté app, p50 14 s.

`int_calendar_event_spans` (392 688 lignes, une ligne par événement) existe déjà, au bon grain, et n'a pour seul enfant que `int_calendar_event_spans_enriched`, qui n'a aucun consommateur (35 764 slot-min en 60 jours).

### 1.2 À faire

1. **`int_events_daily_idf` (et `_occitanie`, `_paca`) : borner l'explosion** à `date BETWEEN GREATEST(event_start_date, CURRENT_DATE() - 120) AND LEAST(event_end_date, CURRENT_DATE() + 365)` — la fenêtre que radius et topn appliquent déjà. Porter les bornes en vars de projet (`events_daily_lookback_days: 120`, `events_daily_horizon_days: 365`), lues à la place des `min_date` / `max_date` locaux.
2. **Les permanents restent des événements journaliers** (owner 04/09 : une exposition ouverte compte chaque jour où elle est ouverte, pour radius, top-N et le directory). Aucun `is_permanent`, aucune sortie d'explosion : ce point est clos.
3. **Filtre incrémental sur la source** : `WHERE event_end_date >= CURRENT_DATE() - 120` avant l'explosion, et `partitions` limitées à la fenêtre — sinon `insert_overwrite` n'économise rien.
4. **`fct_competitor_directory` lit `int_calendar_event_spans`** pour extraire ses identités de lieux et d'organisateurs (l'opération ne dépend pas du jour). Même chose pour `fct_region_event_calendar_spans`, qui aujourd'hui réagrège la table journalière en spans — l'inverse de la chaîne.
5. **Côté app** : `snapshot-competitors.ts` (`runEventSurface`, `runEventEnrichment`) lit la vue intermédiaire pour des fenêtres 14/30 j avec un entonnoir géodésique que ni topn (arrays par bucket) ni radius (comptes par bucket, pas de 15 km) ne reproduisent tels quels. Le rebranchement n'est PAS fait dans le lot 1 : après #98 la vue est 21 fois plus petite, donc le cron passe de ~380 Go à ~18 Go par nuit sans changer une ligne. Re-mesurer sur `JOBS_BY_PROJECT` après le full-refresh ; ne rebrancher que si le cron reste au-dessus de 100 Go par nuit.
6. Un seul `dbt run --full-refresh --select int_events_daily_idf+ int_events_daily_occitanie+ int_events_daily_paca+` après le merge (job `Account_address_change_save` étape 3 pour topn, ou run manuel).

**Preuve attendue** : `SELECT COUNT(*) FROM intermediate.int_events_daily_idf` < 10 000 000 ; `JOBS_BY_PROJECT` de `ms-database-472505` le lendemain : la chaîne sous 3 To par 60 jours (contre 58) ; le cron app sous 100 Go par nuit.

---

## 2. Périmètre — les exposures (geste 2)

### 2.1 Ce qui est

Le périmètre réel de l'app est connu fichier par fichier (`src/`, `public/` : 89 fichiers lisent BigQuery, 76 modèles dbt distincts). Rien dans dbt ne le porte : `dbt ls` ne sait pas qu'un modèle est lu par Pulse.

### 2.2 À faire

Créer `ms_dbt/models/exposures.yml` — passation prête, générée depuis le code de l'app et validée (YAML parse, chaque `ref()` existe dans le projet) : [`dbt-handoff/HANDOFF-exposures-2026-09-04.md`](dbt-handoff/HANDOFF-exposures-2026-09-04.md). Six exposures, une par surface : `app_pulse_agir`, `app_piloter`, `app_explorer`, `app_competitive`, `app_crons`, `app_compte`.

Dès lors :

- **le périmètre à garder** = `dbt ls --select +exposure:*` ∪ les sélections des jobs ;
- **tout modèle hors de cette liste** est soit tagué `exploration` avec une date et un propriétaire dans sa description, soit supprimé au geste 4 ;
- un nouveau consommateur app = une ligne dans l'exposure de sa surface, dans le même commit que la ligne de `module-index.md` (règle SST).

`dim_event_enrichment` est lu par l'app et écrit par elle dans le dataset `dims` (déjà `source('dims', …)`) ; `fct_location_sensitivity` est référencé par l'app mais **absent de BigQuery le 04/09** (store du moteur Type B, vide) : ni l'un ni l'autre n'est un `ref()` — le premier se déclare en `source()`, le second se vérifie côté app.

---

## 3. Contrats et grain (geste 3)

### 3.1 Ce qui est

27 vues semantic ont un contrat `enforced: true`. 167 modèles n'ont aucune entrée yml, dont 41 marts et vues semantic ; **aucun de ces 41 n'a de test de grain**. Les plus lus : `fct_client_daily_performance` (30 lectures app), `fct_client_sales_signals_daily` (17), `fct_client_offering_daily` (13), `fct_client_day_residual`, `fct_client_hourly_sales`, `fct_competitor_directory`, `fct_location_action_learning`, `fct_region_foreign_country_profile`.

### 3.2 À faire (PR #99 couvre les 33 vues lues par l'app et 25 marts ; PR #103 et #106 ont passé les six tests laissés en warn en error — causes instruites : fan-out ×21 pour directory et lookup concurrent, dimension météo absente d'`entity_id` dans le change feed, grain uid × région pour le calendrier, faux doublon (NULL) pour les offres concurrentes ; restent les 13 contrats `enforced` manquants et les marts du chemin non lus par l'app)

Pour chaque modèle du périmètre (§ 2), dans cet ordre : les 33 vues lues par l'app, puis les 41 marts sans yml par nombre de lectures décroissant, puis le reste du chemin.

- Une entrée yml avec `description` qui **nomme le grain en toutes lettres** (« une ligne par date × site ») et la fenêtre de données quand elle est bornée.
- Un test `dbt_utils.unique_combination_of_columns` sur les colonnes du grain, en `error`. Le test est la définition ; s'il tombe, le modèle ment sur son grain.
- Pour les 13 vues semantic sans contrat : `contract: {enforced: true}` et la liste typée des colonnes, comme les 27 autres.
- Le modèle producteur se lit avant d'écrire le grain (règle CLAUDE.md) ; le grain déclaré et le `GROUP BY` / `QUALIFY` du modèle doivent coïncider, sinon c'est le modèle qu'on corrige.

Les trois marts de grain de l'audit (§ 5 : cycle de vie d'une carte, profil de menace restreint et daté, tourisme étranger par site) viennent **après** ce geste, et chacun naît avec son yml et son test.

---

## 4. Triage des 88 modèles hors périmètre (geste 4)

### 4.1 La règle (durcie le 04/09, owner : `intent.md` est minimal et ne suffit pas ; un frère sur le chemin ou une source vivante ne suffisent pas non plus)

Un modèle ne quitte le projet que si **les cinq conditions** sont vraies, et la cinquième est celle de l'owner :

1. il est hors de tout chemin d'exposure (§ 2) et de toute sélection de job ;
2. **personne n'a lu sa table en 90 jours** — mesuré sur `INFORMATION_SCHEMA.JOBS` (`referenced_tables`), tous lecteurs confondus : app, owner, notebooks, requêtes ad hoc — pas seulement le code de l'app ;
3. aucun frère ni successeur ne couvre son grain et ses colonnes (comparaison colonne à colonne, pas par nom) ;
4. sa source brute est morte (aucune écriture en 90 jours) **ou** son concept est remplacé par un modèle vivant ;
5. l'owner valide la liste nominative avant le geste.

Et « quitter » n'est jamais une suppression : `enabled: false` dans le yml (le fichier reste, l'historique git aussi) et copie de la table dans le dataset `_archive` (`bq cp`), réversible pendant 90 jours. Le fichier ne disparaît qu'à la réécriture en définitif de ce document, après ce délai.

**Tourisme : exempt.** Aucun modèle de la chaîne tourisme n'est désactivé ni archivé (owner 04/09) — `tourisme-grain-spec.md` n'ajoute que. La liste B ci-dessous les garde en l'état.

Un modèle *architecture* (condition 3 fausse : un frère fait son travail) se répare par un `ref()`, un tag ou une vue — il ne se désactive pas. Un modèle *en construction* reçoit `tags: ['exploration']` et une date, et reste actif.

**Exécution (owner 04/09) : ce travail est fait par Claude sur des branches de `ms_database` issues de `origin/main`, une PR par geste, chaque modèle validé par exécution de son SQL compilé dans BigQuery avant la PR. dbt Cloud IDE et la production ne bougent pas avant le merge ; le merge de l'owner est la seule porte.**

### 4.2 Le classement nominatif (04/09, conditions 1 à 4 mesurées — la 5e est la vôtre)

Mesures : condition 1 = hors exposures et jobs (88 modèles) ; condition 2 = aucune lecture en 90 jours sur `JOBS_BY_PROJECT` des deux projets, tous lecteurs (82 des 88) ; condition 4 = aucune source brute écrite depuis 90 jours (27 des 88) ; tourisme = 25 modèles exemptés, non listés ici.

**Non retirables — lus par l'owner en 90 jours (condition 2 fausse)** : `dim_city_to_region` (10 lectures, 24/08, aussi lu par l'app-service), `fct_location_attendance_effects_daily` (10, 26/08), `fct_location_corrections_learning` (6, 26/08), `fct_location_weather_alerts_5d` (2, 26/08), `fct_signal_feedback_detail` (4, 26/08), `fct_tourism_macro_national_annual` (tourisme). Ils restent actifs ; `exploration` daté si l'owner confirme qu'il ne s'agit que de vérifications.

**C — source morte ET non lus (conditions 1-4 vraies) — VALIDÉE par l'owner le 05/09 (18 modèles : les 16 ci-dessous + `int_trends_city_daily` et `int_trends_region_daily`, fin de la chaîne trends) : PR ms_database #104 mergée le 05/09, compile du projet entier vert (run 70471896130917), 18 objets copiés dans `_archive` le 05/09 (suppression BQ à J+30, owner)**

| Modèle | Source brute, dernière écriture |
|---|---|
| `stg_trends_keywords`, `stg_trends_keywords__plan`, `int_trends_keywords__dedup`, `fct_trends_keywords`, `agg_trends_keywords_weekly` | `raw.trends_keywords` 16/10/2025 (smoke test, 3 jours de données) |
| `stg_fact_poi_unified`, `stg_poi_categories_unified`, `stg_poi_classifications_unified` | `raw.*poi*` 13/10/2025 |
| `stg_school_vacations_periods` | `raw.school_vacations_periods` 13/10/2025 (doublonne `vacation_zones_france` seed + `int_school_vacations_region_daily_named`, sur le chemin) |
| `stg_idf_stop_areas` | `raw.idf_stop_areas` 10/02/2026 |
| `stg_alerts`, `stg_tracked_sources`, `stg_watched_events` | `raw.alerts` 22/03, `raw.tracked_sources` 07/04, `raw.watched_events` 28/04 — tables app dont l'app lit `raw.*` en direct |
| `dim_longitude_latitude_cities`, `int_location_id_map` | `raw.weather_history_daily` 19/01/2026 ; seed reprojeté |
| `int_weather_evidence_catalog` | seed `evidence_weight_matrix_v1` seul |

Les 7 modèles trends et les 3 POI se désactivent d'un bloc chacun (chaîne entière morte). Les fichiers de seeds (`keyword_plan`, `longitude_latitude_cities`, `evidence_weight_matrix_v1`) restent dans `seeds/` (owner 04/09) : ils sortent de `seed-paths` vers `data/ref/` dans la même PR.

**A et B — réécrits en NEUF DOSSIERS DE CHAÎNE (05/09, pushback owner : « disabled or properly used ? »)**

« Personne ne le lit » est un symptôme, pas un verdict : les sources de ces chaînes sont vivantes. Chaque dossier répond à trois questions — à quoi ça sert (l'en-tête et les notes laissées par l'auteur), ce qui manque pour que ça serve, ce que coûte finir contre garder — et propose **finir / garder en exploration datée / retirer**. Rien n'est désactivé (owner 05/09) ; « retirer » est une proposition à valider ligne à ligne.

| # | Chaîne (modèles) | À quoi ça sert — ce que le code dit | Ce qui manque | Coût de garder (60 j) | Proposition |
|---|---|---|---|---|---|
| 1 | **Ingestion OpenAgenda Occitanie, flux complet** — `stg_raw_events_by_agenda_occitanie`, `stg_raw_locations_by_agenda_occitanie`, `stg_raw_agenda_occitanie` (sources Airbyte `raw_events_by_agenda_occitanie` 871 793 événements / 2,4 Go, `raw_locations_…` 709 756, `raw_agenda_…` 1 000 agendas, synchronisées chaque jour) | Deux ingestions du MÊME OpenAgenda coexistent : le flux **curé** (`events_by_agenda_occitanie`, 1 798 événements, 7 agendas) alimente `int_events_daily_occitanie` ; le flux **complet** n'alimente rien. **Mesuré le 05/09, événements à venir (180 j) à moins de 20 km : Nîmes avenue Feuchères 46 (curé) contre 397 (complet), Centre des congrès 45 / 380, Musée de la Romanité 45 / 380, Saint-Gilles 127 / 395, Beaucaire 162 / 316, Montpellier FRAC 438 / 608 ; Les Olivades (PACA, hors flux) 119 / 110.** Le produit montre aux sites nîmois un événement sur huit. | La décision de flux canonique, puis : `int_events_daily_occitanie` lit le flux complet (le dedup uid y est déjà écrit, ~3 494 doublons Airbyte notés dans l'en-tête), l'autre stream Airbyte s'arrête | Tests seuls : 4 082 slot-min (3 tests sur 871 793 lignes brutes) ; stockage 2,5 Go ; sync quotidienne | **FINIR — décision produit owner** : flux complet canonique pour l'Occitanie (×8 de couverture sur Nîmes). Les tests passent du staging brut au modèle dédupliqué |
| 2 | **Registre des agendas** — `stg_agenda_occitanie` (7), `stg_agenda_paca` (270), historique en append pour détecter la dérive (`official` qui bascule) | La « KNOWN OPEN QUESTION » de `int_events_daily_occitanie` et de PACA : un événement porté par plusieurs agendas doit se réconcilier sur (uid, agendaUid), pas uid seul — c'est ce registre qui le permet (`originAgenda`, `sourceAgendas` sont dans le flux) | La réconciliation elle-même, à écrire avec le dossier 1 | ≈ 0 (vues, 34 runs) | **GARDER, finir avec le dossier 1** |
| 3 | **Contexte région pour l'IA** — `vw_insight_event_ai_region_context` (date × région : événements, index et pic touristique, week-end, fériés, vacances, moments commerciaux) | Le seul contexte régional DATÉ de l'entrepôt : `vw_insight_event_ai_location_context` est un profil statique sans date | Un lecteur : `dayContext.ts` / Explorer (« pourquoi ce jour ») et `tourisme-grain-spec.md` § 2.3 (le contexte région dans le résiduel) | ≈ 0 (vue, 55 runs) | **FINIR** : brancher dans le contexte de jour et dans la spec tourisme ; matière à cartes « semaine de vacances + pic touristique en région » |
| 4 | **Pass 2 région** — `fct_region_context_features_daily` (seul enfant : la projection 7 j), `fct_region_context_7d_projection` | La projection 7 j est **déjà `enabled = false` depuis le 28/08, décision owner (dossier 3 de l'époque)** : « construit 25 fois en 30 j, lu par personne ; c'est la version LOCATION qui nourrit la page 7 jours ». Le pass 2 région n'a plus d'enfant | Rien : le jumeau site fait le travail | 10 slot-min | **RETIRER** (prolonger la décision du 28/08) — à valider |
| 5 | **Évidence météo** — `int_weather_calibration_profile` (percentiles région × mois × aléa), `int_weather_evidence_features_daily`, `int_weather_level_monotone_summary`, `int_weather_city_daily` (placeholder explicite : « replace this block with the real staging sources »), `int_w_debug_*` (déjà désactivés), vars `use_learned_betas` / `enable_attendance_learning` (lues par aucun modèle), seed `weather_impacts_coeffs_learned` (sans référence) | Apprendre les bêtas d'impact météo par région et saison depuis l'historique. Superposé aujourd'hui par le moteur Type B côté app (mémoire : store réel vide à 81 j, baseline dow + tendance) | Un consommateur. Le profil de calibration (seuils par région × mois × aléa) est exactement ce que « seuil de classe mal calibré » réclame (mémoire never-demonetize) | 294 slot-min | **GARDER en exploration datée** ; candidat à FINIR comme entrée des seuils de classes météo ; retirer les vars et le placeholder `int_weather_city_daily` |
| 6 | **Helpers prévisions et géo** — `int_airbyte_weather_forecast_inputs` (1 ligne : les 3 chaînes de configuration du connecteur Airbyte Open-Meteo), `int_airbyte_weather_forecast_user_coords`, `int_client_location_to_forecast_location`, `int_client_distance_pairs` (distances entre sites clients), `int_weather_alerts_daily_snapshot` (photo quotidienne des alertes, 106 runs) | Outillage d'exploitation : la liste de coordonnées que le connecteur Open-Meteo doit recevoir quand un site entre ; distances entre sites pour la répartition multi-sites (Épices et Tout, Les Olivades) ; historique des prévisions pour `fct_signal_accuracy_daily` | Que `forecast_inputs` soit RELU à chaque nouveau site (job d'adresse) — aujourd'hui rien ne dit que le connecteur reçoit les nouveaux sites | 66 slot-min | **GARDER, tag `ops`** ; brancher `forecast_inputs` sur `Account_address_change_save` ; `distance_pairs` en exploration pour la répartition par site |
| 7 | **Corrections déclarées** — `int_location_declared_metrics_current`, `fct_location_corrections_learning` (lu par l'owner, 6 lectures) | Mémoire des corrections Consulter (« Phase 2.3 inc 4 bloquée sur lignes réelles », mémoire corrections-learning-mart-gate) | Des lignes réelles | ≈ 0 | **GARDER** (chantier ouvert, désormais dans `mart_dependent` via #105) |
| 8 | **Spans calendaires** — `int_calendar_event_spans` (392 688 spans), `int_calendar_event_spans_enriched` (+ classification industrie) | LA source au bon grain pour les identités de lieux (`fct_competitor_directory`) et pour `fct_region_event_calendar_spans`, qui aujourd'hui rescannent la table journalière | Les deux `ref()` (geste 1 point 4) ; la classification en deux passes (libellé d'abord) comme `int_events_daily_occitanie` | **34 578 slot-min** pour rien tant qu'aucun `ref()` ne le lit | **FINIR** : rebrancher directory et calendar spans dessus — le coût devient le seul coût de la classification, payé une fois |
| 9 | **Stagings des tables app-write et divers** — `stg_channel_configs`, `stg_notification_preferences`, `stg_saved_item_snapshots`, `stg_competitor_tracking` ; `int_school_holidays_region_daily` (doublon de `int_school_vacations_region_daily_named`) ; chaîne `refresh_address` (3 modèles, tag sans job) ; `vw_insight_event_action_outcomes` (résultats des publications Communiquer, 3 lignes) ; `int_events_city_daily*`, `int_events_region*` (agrégats ville/région sans lecteur) ; `legacy_*` (2), `test`, `test_fct`, `int_client_competition_features_daily` (jamais construit) | L'app lit `raw.*` en direct par doctrine (frontière app-write) : ces stagings ne servent qu'à un mart dbt. `stg_competitor_tracking` en aura un (`interet-etablissement-spec.md`) ; `vw_insight_event_action_outcomes` attend que Communiquer lise ses résultats | Un consommateur dbt par staging, ou rien | ≈ 0 (vues) | **GARDER** `stg_competitor_tracking` et `vw_insight_event_action_outcomes` ; `refresh_address` → brancher le job (§ 6) ; le reste : **RETIRER** proposé, à valider (doublon, legacy, tests hors place, jamais construit) |

**Dossier 1, suite (05/09, beta) :** le flux brut est NATIONAL. Pour le testeur de Houdan (site `MS Test`, 0 événement à 20 km avec le seul flux Ville de Paris), PR ms_database #108 mergée : `int_events_daily_idf_openagenda` (IdF hors Paris, ville = plus proche de `dim_event_city_label` à 15 km), sixième branche de `int_events_daily`. Prod le 05/09 : 52 305 lignes / 9 349 événements ; Houdan 0 → 28 événements distincts à 20 km sur 30 j (0 à 1 par jour : densité rurale réelle), Muse Square +163 à 5 km. La bascule Occitanie sur le flux complet et la dédup inter-flux restent à décider.

Ce que ces dossiers changent au plan : le dossier 1 est une **décision produit** (ce que voient les sites nîmois), pas du nettoyage ; les dossiers 3, 6 et 8 sont des **branchements** qui donnent un lecteur à ce qui existe ; seuls 4 et une partie de 9 restent des retraits, et ils attendent la validation.

Fichier de preuve : `triage_evidence.csv` (scratchpad de session) — une ligne par modèle avec lectures 90 j, sources et leur dernière écriture, enfants. À régénérer avant la PR de désactivation ; la PR ne part qu'avec la liste validée ligne à ligne par l'owner.

### 4.3 Ce que fait `enabled: false` — modélisé, puis simulé (05/09)

**Le mécanisme, sans ambiguïté.** `enabled: false` sur un modèle dbt :

1. **dbt ne le voit plus** : il sort du graphe, plus aucun job ne le construit ni ne le teste ; `dbt ls` ne le liste plus ; ses tests yml sont désactivés avec lui. Le fichier reste dans le dépôt, l'historique git aussi.
2. **Tout modèle ENCORE actif qui fait `ref()` vers lui casse la compilation** du projet entier (« depends on a node named X which is disabled »), donc tous les jobs, comme le 04/09 au matin. C'est pour ça qu'une chaîne se désactive d'un bloc, feuille comprise, et que la simulation compile le projet entier AVANT tout merge.
3. **BigQuery ne change pas** : dbt ne supprime jamais une table ou une vue qu'il cesse de gérer. L'objet reste lisible tel quel, figé à son dernier build. Une vue désactivée continue même de refléter ses sources si elles bougent. C'est la réversibilité : remettre `enabled: true` et lancer le modèle, et tout repart.
4. **L'app ne voit rien** : aucun des 53 candidats n'est lu par l'app ni par personne depuis 90 jours (mesuré sur les deux projets), aucun n'est dans une exposure.
5. **Ce qui disparaît vraiment** : le coût de reconstruction (23 des 53 sont reconstruits par `fresher+` sans servir : 34 969 slot-min sur 60 jours, dont 35 764 pour `int_calendar_event_spans_enriched` seul avant #98) et le bruit dans l'IDE et dans `dbt ls`. Le stockage (546 Mo pour les 51 objets présents) ne part qu'au geste `_archive` puis à la suppression BQ, à J+30.

Le projet en contient déjà trois exemples vivants : `int_w_debug_client_vs_evidence`, `int_w_debug_join_coverage` et `fct_region_context_7d_projection` sont **déjà** `enabled = false` sur `main` — dbt les ignore, leurs objets BigQuery (vues de décembre 2025, table du 27/08) sont toujours là.

**La simulation.** Branche `nettoyage/09-sim-enabled-false` (à ne PAS merger) : `enabled=false` posé sur les 53 candidats ci-dessous, puis `dbt compile` du projet entier via l'API dbt Cloud, sans aucune écriture. Premier essai : deux blockers trouvés par le graphe avant même de compiler (`int_trends_city_daily`, `int_trends_region_daily` — la chaîne trends fait 7 modèles, pas 5) et ajoutés ; second essai : « keyword argument repeated: enabled » sur les trois modèles déjà désactivés — corrigé. Troisième essai : **le projet entier compile** (run 70471896130348, `dbt compile` en 1 min 06, puis `dbt ls --select +exposure:*` et `dbt ls` en succès) — avec les 53 modèles et l'exposure factice `trends_keywords_looker` (owner `data@musesquare.example`, url « … », déclarée dans `mart/schema.yml`, 0 lecture des marts trends en 90 j) en `enabled: false`. Aucun modèle actif ne dépend d'un candidat ; aucune exposure réelle ne les cite. La désactivation des 53 est donc **sans effet sur dbt, les jobs et l'app** ; leurs objets BigQuery restent en place jusqu'au geste `_archive`. La branche `nettoyage/09-sim-enabled-false` reste comme témoin ; la PR réelle se fera depuis la liste validée, pas depuis cette branche.

**Les 53 candidats, un par ligne** — ce que c'est (extrait de l'en-tête du modèle), qui en dépend (toujours dans la liste), l'objet BigQuery tel qu'il est aujourd'hui, les lectures sur 90 jours, ce qu'il coûte en production sur 60 jours. Chaque ligne est une case à cocher pour la condition 5.

| # | Modèle | Couche · mat. | Ce que c'est (en-tête du modèle) | Dépendants (tous dans la liste) | Objet BigQuery aujourd'hui | Lectures 90 j | Coût prod 60 j |
|---|---|---|---|---|---|---|---|
| C | `dim_longitude_latitude_cities` | dims · table | dim_longitude_latitude_cities Associe chaque ville du seed de coordonnées à la location_id | aucun | dims.BASE rows=11 mb=0.0 mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `int_location_id_map` | intermediate · table | forecast_location_id_raw as location_id, any_value(latitude) as latitude, | → dim_longitude_latitude_cities | intermediate.BASE rows=11 mb=0.0 mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `int_trends_city_daily` | intermediate · view | date × city_id. Also exposes region_id (NUTS2) for drill and alignment. none (uses existing dims/seeds only) | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-03 | 0 | jamais construit en prod (60 j) |
| C | `int_trends_keywords__dedup` | intermediate · view | int_trends_keywords__dedup.sql cast(interest_value as int64) as interest_value, | → fct_trends_keywords | intermediate.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `int_trends_region_daily` | intermediate · view | date × region_id (NUTS2). We also expose city_id (NULL) for drill consistency. Views in BigQuery ignore partition/cluster; config kept for future tabl | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `int_weather_evidence_catalog` | intermediate · view | One row per numeric threshold (e.g., 35/40/45 for heat), otherwise one row with NULL numeric fields. Preferred LEFT JOIN pattern (no UNION ALL) | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `agg_trends_keywords_weekly` | mart · table | partition_by={'field': 'week_start', 'data_type': 'date'}, cluster_by=['keyword_id','geo'] | aucun | mart.BASE rows=159 mb=0.0 mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `fct_trends_keywords` | mart · incremental | Daily fact table of Google Trends keyword interest values at (date × keyword_id × geo), restricted to active keyword/geo pairs defined in the plan tab | → agg_trends_keywords_weekly | mart.BASE rows=477 mb=0.0 mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_fact_poi_unified` | staging · view | select * from {{ source('raw','fact_poi_unified') }} cast(latitude  as float64)   as latitude, | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_idf_stop_areas` | staging · view | ZdAVersion as stop_area_version, metadata timestamps (parsed safely) | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_poi_categories_unified` | staging · view | select * from {{ source('raw','poi_categories_unified') }} | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_poi_classifications_unified` | staging · view | select * from {{ source('raw','poi_classifications_unified') }} | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_school_vacations_periods` | staging · view | stg_school_vacations_periods.sql select * from {{ source('raw', 'school_vacations_periods') }} | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_trends_keywords` | staging · view | select * from {{ source('raw','trends_keywords') }} | → int_trends_keywords__dedup | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_trends_keywords__plan` | staging · view | cast(active_flag as bool) as active_flag from {{ ref('keyword_plan') }} | → fct_trends_keywords | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_alerts` | staging/app_activity · view | Stage raw.alerts with light type normalization. No business logic. muse-square-open-data.raw.alerts | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_tracked_sources` | staging/app_activity · view | Stage raw.tracked_sources with light type normalization. No business logic. muse-square-open-data.raw.tracked_sources | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| C | `stg_watched_events` | staging/app_activity · view | Stage raw.watched_events with light type normalization. No business logic. muse-square-open-data.raw.watched_events | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| A | `int_calendar_event_spans_enriched` | intermediate · table | This model enriches the canonical event span dataset with industry classification derived from keyword-based matching. | aucun | intermediate.BASE rows=399402 mb=544.8 mod=2026-09-05 | 0 | 54 runs, 42.13 Go, 34577.9 slot-min |
| A | `int_events_city_daily` | intermediate · view | Provide daily city-level aggregates derived exclusively from the canonical event-day fact (int_events_daily). | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 55 runs, 0.0 Go,  slot-min |
| A | `int_events_city_daily_enriched` | intermediate · view | int_events_city_daily_enriched Provide the canonical city-day events aggregation used for | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 55 runs, 0.0 Go,  slot-min |
| A | `int_events_region` | intermediate · view | Provide region-level aggregates across all available dates, derived exclusively from int_events_region_daily. | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 55 runs, 0.0 Go,  slot-min |
| A | `int_events_region_monthly` | intermediate · view | int_events_region_monthly.sql - {{ ref('int_events_region_daily') }}   -- date × region_id, events_count | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 55 runs, 0.0 Go,  slot-min |
| A | `int_school_holidays_region_daily` | intermediate · view | cluster_by = ['region_code_insee', 'date'] 1) Expand vacation periods to daily rows per zone | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| A | `fct_region_context_7d_projection` | mart · table | fct_region_context_7d_projection Provide the centered 7-day contextual envelope around each candidate day (D-3..D+3) | aucun | mart.BASE rows=3094 mb=0.3 mod=2026-08-27 | 0 | 44 runs, 1.38 Go, 21.1 slot-min |
| A | `fct_region_context_features_daily` | mart · table | fct_region_context_features_daily Region-level daily context features for Insight Event MVP (PASS 2). | → fct_region_context_7d_projection | mart.BASE rows=3211 mb=1.2 mod=2026-09-05 | 0 | 55 runs, 0.58 Go, 9.9 slot-min |
| A | `vw_insight_event_action_outcomes` | semantic/insight_event · view | vw_insight_event_action_outcomes UI-ready semantic surface for published-action outcomes. | aucun | semantic.VIEW rows=- mb=- mod=2026-08-19 | 0 | 24 runs, 0.0 Go,  slot-min |
| A | `vw_insight_event_ai_region_context` | semantic/insight_event · view | vw_insight_event_ai_region_context Surface de contexte région pour les surfaces sémantiques Insight Event (quotidienne). | aucun | semantic.VIEW rows=- mb=- mod=2026-09-05 | 0 | 55 runs, 0.0 Go,  slot-min |
| A | `stg_channel_configs` | staging/app_activity · view | Typed staging of channel publish configurations per user/location/channel. config_json kept as raw STRING (parsed downstream). Light typing only. | aucun | staging.VIEW rows=- mb=- mod=2026-06-05 | 0 | jamais construit en prod (60 j) |
| A | `stg_notification_preferences` | staging/app_activity · view | stg_notification_preferences Stage raw.notification_preferences with light type normalization. No business logic. | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| A | `stg_saved_item_snapshots` | staging/app_activity · view | Stage raw.saved_item_snapshots with light type normalization. No business logic. saved_item_id × selected_date × snapshotted_at | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| B | `int_airbyte_weather_forecast_inputs` | intermediate · view | int_airbyte_weather_forecast_inputs - dims.dim_client_locations_weather (active client locations with lat/lon) | aucun | intermediate.VIEW rows=- mb=- mod=2026-08-19 | 0 | 11 runs, 0.0 Go,  slot-min |
| B | `int_airbyte_weather_forecast_user_coords` | intermediate · view | int_airbyte_weather_forecast_user_coords - dim_client_location (canonical client locations) | aucun | intermediate.VIEW rows=- mb=- mod=2026-08-19 | 0 | 11 runs, 0.0 Go,  slot-min |
| B | `int_client_competition_features_daily` | intermediate · view |  | aucun | ABSENT de BQ | 0 | jamais construit en prod (60 j) |
| B | `int_client_distance_pairs` | intermediate · view | schema       = 'intermediate' int_client_distance_pairs.sql | aucun | intermediate.VIEW rows=- mb=- mod=2026-08-19 | 0 | 11 runs, 0.0 Go,  slot-min |
| B | `int_client_location_to_forecast_location` | intermediate · view | int_client_location_to_forecast_location Create a deterministic mapping from each active client location (signup location_id) to the | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 64 runs, 0.0 Go,  slot-min |
| B | `int_location_declared_metrics_current` | intermediate · view | int_location_declared_metrics_current Current-state view of user-DECLARED metrics (chat declarations, e.g. margin %), | aucun | intermediate.VIEW rows=- mb=- mod=2026-07-16 | 0 | jamais construit en prod (60 j) |
| B | `int_w_debug_client_vs_evidence` | intermediate · ? | Debug helper to measure coverage of region-level weather evidence inside the client weather alerts mart. | aucun | intermediate.VIEW rows=- mb=- mod=2025-12-21 | 0 | jamais construit en prod (60 j) |
| B | `int_w_debug_join_coverage` | intermediate · ? | Debug helper to verify the join coverage between: fct_weather_alerts_client_daily (date × region_id from client side) | aucun | intermediate.VIEW rows=- mb=- mod=2025-12-21 | 0 | jamais construit en prod (60 j) |
| B | `int_weather_alerts_daily_snapshot` | intermediate · incremental | materialized = 'incremental', unique_key = ['snapshot_date','date','region_id'], | aucun | intermediate.BASE rows=1800 mb=0.2 mod=2026-09-05 | 0 | 106 runs, 2.78 Go, 65.8 slot-min |
| B | `int_weather_calibration_profile` | intermediate · view | fields: cutoff_value (numeric), sample_days format('M%02d', extract(month from forecast_date)) as season_key, | → int_weather_evidence_features_daily | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 53 runs, 0.0 Go,  slot-min |
| B | `int_weather_city_daily` | intermediate · view | date × city_id. Also exposes region_id (NUTS2). PLACEHOLDERS (NEEDED_SOURCE): | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-03 | 0 | jamais construit en prod (60 j) |
| B | `int_weather_evidence_features_daily` | intermediate · table | pas de dim_calendar : is_weekend est calculé en ligne, l. 256 case when extract(dayofweek from r.date) in (1,7) then 1 else 0 end | → int_w_debug_join_coverage, int_weather_level_monotone_summary | staging.VIEW rows=- mb=- mod=2026-05-25 | 0 | 53 runs, 1.67 Go, 293.9 slot-min |
| B | `int_weather_level_monotone_summary` | intermediate · view | Columns used: date, region_id, lvl_rain_monotone_ok, lvl_wind_monotone_ok, lvl_snow_monotone_ok, lvl_cold_monotone_ok | aucun | intermediate.VIEW rows=- mb=- mod=2026-09-05 | 0 | 53 runs, 0.0 Go,  slot-min |
| B | `legacy_int_commercial_events_region_daily_named` | intermediate · view | int_commercial_events_region_daily_named Provide commercial event names active on each date at region scope. | aucun | intermediate.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| B | `test` | mart · view |  | aucun | ABSENT de BQ | 0 | jamais construit en prod (60 j) |
| B | `test_fct` | mart · view | countif(json_value(data_payload, '$.countries_named') is not null) as avec_pays, countif(json_value(data_payload, '$.profile_reference_year') is not n | aucun | mart.BASE rows=1 mb=0.0 mod=2026-09-05 | 0 | 52 runs, 0.55 Go, 0.3 slot-min |
| B | `legacy_stg_weather_forecast_10d` | staging · view | from {{ source('raw','weather_forecast_10d') }} qualify row_number() over ( | aucun | staging.VIEW rows=- mb=- mod=2026-06-01 | 0 | jamais construit en prod (60 j) |
| B | `stg_agenda_occitanie` | staging · view | Normalize the curated OpenAgenda Occitanie agenda watchlist (surveillance stream, not discovery — see connector). | aucun | staging.VIEW rows=- mb=- mod=2026-09-05 | 0 | 34 runs, 0.0 Go,  slot-min |
| B | `stg_agenda_paca` | staging · view | Normalize the curated OpenAgenda PACA agenda watchlist (surveillance stream, not discovery — see connector). | aucun | staging.VIEW rows=- mb=- mod=2026-09-05 | 0 | 34 runs, 0.0 Go,  slot-min |
| B | `stg_raw_agenda_occitanie` | staging · view | select * from {{ source('raw_airbyte', 'raw_agenda_occitanie') }} uid,                                   -- keep raw | aucun | staging.VIEW rows=- mb=- mod=2026-09-05 | 0 | 53 runs, 0.0 Go,  slot-min |
| B | `stg_raw_events_by_agenda_occitanie` | staging · view | stg_raw_events_by_agenda_occitanie Normalize OpenAgenda Occitanie raw events and attach city / | aucun | staging.VIEW rows=- mb=- mod=2026-09-05 | 0 | 54 runs, 0.0 Go,  slot-min |
| B | `stg_raw_locations_by_agenda_occitanie` | staging · view | stg_raw_locations_by_agenda_occitanie Normalize OpenAgenda Occitanie raw locations, exposing a | → stg_raw_events_by_agenda_occitanie | staging.VIEW rows=- mb=- mod=2026-09-05 | 0 | 53 runs, 0.0 Go,  slot-min |

Hors de cette simulation, volontairement : la chaîne `refresh_address` (3 modèles, décision de câblage au geste 6), `stg_competitor_tracking` (entre dans `interet-etablissement-spec.md`), `int_calendar_event_spans` (future source du directory), les 6 modèles lus par l'owner, et les 25 modèles tourisme (exempts).

**Hors dbt, même geste** : les 35 objets BigQuery orphelins (liste § 3.3 de l'audit) partent dans un dataset `_archive` (`bq cp` puis `bq rm`), suppression définitive à J+30. `staging.insee_communes_bocp` est chargé à la main et déclaré `source('staging', …)` : le déplacer dans `open_data` et corriger la source.

---

## 5. Vue ou table — la règle, avec le temps de page (geste 5)

### 5.1 La règle

Une vue coûte zéro à définir et son SQL entier à chaque lecture. Une table coûte sa construction une fois. Le choix se fait sur **qui lit, combien de fois, et en combien de temps** — le budget de page est 3 secondes, mesuré côté utilisateur, et un aller-retour BigQuery nu vaut ~500 ms.

| Cas | Matérialisation |
|---|---|
| Projection d'UNE table, colonnes renommées, contrat | **vue** (le contrat semantic) |
| Doit être fraîche dans la session (engagements, dispositions, dispositifs : chaîne app-write) | **vue**, chaîne entière en vues, tant que la table app-write reste sous 100 k lignes |
| Joint 2 marts ou plus, fenêtres analytiques, `QUALIFY` | **table** |
| Lue par une page à chaque requête (Pulse, Piloter, Explorer) | **table**, partition `date`, cluster `location_id` |
| Intermédiaire avec plus d'un consommateur, ou sur une table > 10 M lignes | **table** — une vue là est l'anti-motif : chaque consommateur paie le scan |
| Source append-only et fenêtre bornée | **incrémental** `insert_overwrite` sur les partitions de la fenêtre, filtre de date sur la source |
| Le nom | `vw_` = vue, `fct_` = table. Trois surfaces `vw_*` sont des tables : `vw_insight_event_day_surface`, `vw_insight_event_selected_days_surface`, `vw_insight_event_7d_surface` → renommer `fct_*` (l'app suit dans le même lot) |

### 5.2 Ce que l'app paie aujourd'hui (14 jours au 04/09, `JOBS_BY_PROJECT` de `muse-square-open-data`, requêtes hors dbt, par table référencée)

| Table lue | Requêtes | p50 | p95 | Lecteur principal |
|---|---|---|---|---|
| `mart.fct_client_daily_performance` | 1 520 | 1,0 s | 37 s | Piloter, Explorer, crons |
| `mart.fct_location_context_features_daily` | 558 | 1,8 s | 64 s | Piloter, digest |
| `mart.fct_client_sales_signals_daily` | 594 | 0,2 s | 61 s | Piloter, Pulse, rapport |
| `mart.fct_location_events_radius_daily` | 451 | 1,4 s | 68 s | rapport, dashboard |
| `mart.fct_location_context_daily` | 783 | 0,2 s | 54 s | cartes |
| `mart.fct_competitor_directory` | 2 127 | 0,5 s | 15,6 s | veille, crons |
| `mart.fct_competitor_threat_profile` | 3 907 | 0,5 s | 2,3 s | veille, dashboard |
| `mart.fct_client_day_residual` | 3 347 | 0,8 s | 4,4 s | Piloter, engagements |
| `mart.fct_location_opportunity_score_daily` | 230 | 1,6 s | 12 s | |
| `intermediate.int_events_daily_*` via la vue enrichie | 49 | 14 s | 33 s | cron nocturne (§ 1) |

Les p95 à 37–68 s sur les marts ventes/contexte viennent des batchs (`cron/day-class-impacts.ts`, `CREATE OR REPLACE TABLE analytics.day_class_impacts`, jusqu'à 170 s) et non des pages ; les p50 disent le coût par page. `pct_cache = 0` partout : aucune requête ne touche le cache BigQuery (paramètres ou `CURRENT_DATE()` dans le texte).

### 5.3 À faire — SCOPÉ PAR LA MESURE le 05/09

Mesure app (14 j, compte de service Vercel, vue reconnue dans le texte de la requête — `referenced_tables` ne liste pas les vues) : une seule vue semantic paie sa jointure à chaque page, `vw_insight_event_client_performance` (4 marts, p50 1 693 ms, p95 4 309 ms, 4 requêtes/j). Les autres : p50 144 à 288 ms (`competitor_signals` 785, `day_residual` 1 125) ; les p95 à 70–80 s sur `location_context`, `day_residual`, `competitor_signals` sont le cron `day-class-impacts`, pas des pages. Le point 1 ci-dessous se réduit donc à `client_performance` (PR ms_database #107 mergée le 05/09 : mart `fct_client_performance_context_daily` nocturne, la vue = projection à 43 colonnes, 975 = 975 lignes, 0 différence, run de création vert) ; les cinq autres matérialisations ne sont PAS justifiées par la mesure et ne se font pas.


1. **Matérialiser les six vues semantic calculées à chaque requête** : `vw_insight_event_30d_day_surface` (7 tables jointes), `vw_insight_event_map_signals` (5), `vw_insight_event_client_performance` (4), `vw_insight_eventcalendar_event_lookup` (4), `vw_insight_event_competitor_signals` (3, 9 lectures app), `vw_insight_event_change_feed` (2, 6 lectures, lue par Pulse et les crons). Elles deviennent des tables `fct_*` dans `tag:mart_dependent`, la vue `vw_*` restant une projection à contrat par-dessus (l'app ne change pas de nom).
2. **`int_events_event_daily_enriched` devient une table** (ou disparaît au profit des spans, § 1) : trois consommateurs dbt + deux consommateurs app sur une vue de 210 M lignes.
3. **Les 21 vues de projection restent des vues.** Les 5 chaînes app-write (dispositifs, composants, photos, objectif actif, dispositions) restent en vues ; seuil de bascule : 100 k lignes dans `analytics.action_commitments` ou `analytics.action_log`.
4. **Mesure par page, pas par table** : pour Pulse, Piloter, Explorer et Agir, `npx tsx` autour de chaque phase sur `f10c3e58` (méthode CLAUDE.md § Performance), AVANT et APRÈS le point 1. Un mart matérialisé qui ne fait pas baisser le p50 de sa page ne justifie pas son job.
5. **Cache BigQuery** : les requêtes de page qui n'ont pas besoin de `CURRENT_DATE()` dans le texte le reçoivent en paramètre `@today` — une requête identique dans les 24 h devient un hit de cache (0 octet, ~100 ms).

---

## 6. Jobs (geste 6)

### 6.1 Ce qui est

Huit jobs (tableau § 2 de l'audit). `source_status:fresher+` ne reconstruit que l'aval des sources à fraîcheur déclarée (`raw_airbyte`, `raw_clients`, une partie de `raw_crawl`, une table `analytics`) : 102 modèles dims/staging/intermediate n'ont eu aucun run prod en 60 jours. Trois tags ne sont sélectionnés par aucun job (`daily`, `refresh_address`, `legacy`). Huit marts ne sont connus que des runs IDE (`fct_client_commitment_outcomes`, `fct_location_commitment_learning`, `fct_location_action_moves`, `fct_location_channel_monthly`, `fct_region_foreign_country_profile`, `fct_tourism_macro_country_annual`, `fct_tourism_macro_national_annual`, `fct_location_corrections_learning`). La chaîne surfaces/candidates est reconstruite jusqu'à 4 fois par jour par des jobs qui se recouvrent.

### 6.2 À faire

0. **FAIT (PR #105, 05/09)** : les 8 marts « IDE seulement » portent `tags: ['mart_dependent']` (commitment_outcomes, commitment_learning, action_moves, channel_monthly, region_foreign_country_profile, tourism_macro ×2, corrections_learning) ; validé par `dbt ls` + `compile` sur la branche (run 70471896133932) ; rattrapage lancé le 05/09 après merge.
1. **Deux jobs nocturnes, enchaînés** : `daily_fresh_data_run_general` (`build --select source_status:fresher+`) puis `daily mart dependent fresh data run` (`run --select tag:mart_dependent`). Tout mart du périmètre (§ 2) qui n'est pas dans l'aval d'une source fraîche porte `tags: ['mart_dependent']` — les 8 marts « IDE seulement » en premier.
2. **Les jobs déclenchés par l'app sélectionnent par tag, jamais par nom** : `Account_address_change_save` passe à `tag:refresh_address` (+ ses deux `--full-refresh` explicites) ; le tag `daily` disparaît (ses 4 modèles concurrents sont dans `mart_dependent`) ; `legacy` disparaît avec les modèles.
3. **Le job de 12 h** (`Daily action candidates refresh`) ne se justifie que si des blocs de candidates changent en journée (ventes importées, dispositions). Le garder tant que le candidates est un monolithe ; il tombe avec la refonte en intermédiaires par famille (audit § 5.1).
4. **Fraîcheur déclarée sur `source('raw', …)`** pour les tables Airbyte-like qui bougent (`weather_history_daily`, `holidays_daily`, `insee_flash_country_mix`, `school_vacations_periods`) : `loaded_at_field` + `freshness`, pour que `fresher+` les voie.
5. **Une alerte quand un job échoue** : notification dbt Cloud → Slack (rail existant) sur `run_failure`. Le 04/09, trois jobs ont échoué pendant douze heures sans qu'on le sache.

---

## 7. Ordre d'exécution

| # | Geste | Dépend de | Preuve |
|---|---|---|---|
| 1 | Chaîne événements (§ 1) — **#98 mergée + hotfix #101 (commentaire dans config) + #102 (event_uid NULL-safe)** ; mesuré après full-refresh J−120 : chaîne aval entière **70 Go par run** (directory 23,8 / calendar spans 21,9 / topn 11,4 / radius 10,6) contre plusieurs To ; calendar spans 320 696 lignes / 320 659 uids (×17 disparu) ; directory 13 815 = 13 815 ids (les 83 doublons venaient du fan-out — branche directory abandonnée). Règle : tout full-refresh des `int_events_daily_*` passe `events_daily_min_date = J−120`, sinon l'historique disparaît. Restent : lecteurs app (re-mesurer), tests warn → error | rien | `COUNT(*)` < 10 M ; To facturés le lendemain |
| 2 | `exposures.yml` (§ 2) — **PR #97 mergée (ace0cf7)** | rien | `dbt ls --select +exposure:*` = 230 ± les gestes suivants |
| 3 | Contrats + grain sur le périmètre (§ 3) — **PR #99 mergée (bc334af)** (33 vues + 25 marts, grains vérifiés en base ; 4 défauts mesurés en warn) | 2 | `dbt test` vert, 0 mart du périmètre sans `unique_combination_of_columns` |
| 4 | Triage A / B / C (§ 4) + `_archive` BQ | 2, décisions owner sur B | `dbt ls` = 230 − suppressions ; `INFORMATION_SCHEMA` sans orphelin |
| 5 | Vue / table (§ 5) — **scopé par la mesure, PR #107 mergée** (une seule vue dépassait le budget) ; reste la mesure p50 par page après quelques jours | 3 | p50 par page avant/après sur `f10c3e58` |
| 6 | Jobs et tags (§ 6) — **PR #105 mergée** (8 marts IDE-only dans mart_dependent, rattrapés le 05/09) ; restent fraîcheur des sources `raw`, alerte sur échec, tag `refresh_address` | 4 | `execute_steps` relus ; aucun modèle du périmètre sans job |
| 7 | Les trois marts de grain (audit § 5) et [`tourisme-grain-spec.md`](tourisme-grain-spec.md), [`interet-etablissement-spec.md`](interet-etablissement-spec.md) | 3, 6 | chacun vérifié sur `f10c3e58` |

Chaque geste = une passation `dbt-handoff/HANDOFF-<geste>-<date>.md` (un fichier à ouvrir en première ligne, fichiers numérotés dans l'ordre du DAG, message de commit fourni). Après le geste 4, ce document se réécrit en définitif : la liste des 88 disparaît, remplacée par la règle du § 4.1 et le périmètre du § 2.

— SPEC DE TRAVAIL
