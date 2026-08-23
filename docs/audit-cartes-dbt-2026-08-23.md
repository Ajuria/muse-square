# Audit structurel du modèle cartes dbt — 23/08/2026

> `fct_location_daily_action_candidates.sql` (`main` bb881d9, 3 277 lignes, 82 CTE, 48 types de
> cartes littéraux + le passthrough `change_feed`). Demande owner : ne plus avancer changement par
> changement — auditer tout, livrer tout, avant le lancement commercial.
> Chaque constat porte sa mesure. Scripts rejouables dans l'historique de session.

## 1. Ce qui tire, et ce qui est mort — et POURQUOI

48 types émis. **23 tirent, 25 jamais** (0 tir sur toute la fenêtre de la vue, 19 dates).
Tester chaque condition élémentaire sur J..J+3 (128 site-jours) et sur 120 jours (4 096) tranche
« jamais » de « pas cette semaine » :

| cause | cartes | mesure |
|---|---|---|
| **Stub : la donnée n'arrive jamais** | `weather_mobility_double`, `mobility_comp_squeeze`, `ft_peak_mobility`, `tourism_mobility_hit` | `mobility_disruption_flag_region` vrai sur **0 / 4 096** site-jours en 120 j. Racine : `int_mobility_region_daily__aligned` est un **stub** — `'normal' as mobility_status_region, false as mobility_disruption_flag_region`, constantes en dur sur une grille 2000→2035 (170 937 lignes). Or la source EXISTE et est fraîche : `raw.idf_traffic_info` 992 lignes extraites aujourd'hui, 549 perturbations Paris, et le `change_feed` en produit **1 794 `mobility_disruption` en 14 j**. Deux chemins mobilité : un vivant (change_feed), un mort (grille régionale). |
| **Classe inmesurable par construction** | `tourism_weather_vacation`, `tourism_comp_squeeze`, `low_tourism_local_opp`, `ft_peak_tourism_vacation` | indice tourisme **mensuel** (audit 22/08) |
| **Seuil au-dessus du maximum atteint** | `sales_missed_opportunity` (score ≥ 80), `best_day_of_week`, `day_opportunity` (score ≥ 70, régime A) | score max **79** en 120 j ; ≥ 70 : 455 site-jours en 120 j mais **0 sur J..J+3** ; régime A : 477 / 4 096, 0 cette semaine. Pas mortes — **saisonnières**, et `sales_missed_opportunity` ne peut jamais tirer. |
| **Conjonction rare, chaque terme vivant** | `weather_comp_opportunity` (alerte 0 ∧ pr < 0,7), `holiday_high_comp` (férié ∧ pr > 1,3), `ft_peak_*` | alerte 0 : 12 / 128 ; pr < 0,7 : 80 / 128 ; `ft_day_rank_max` présent sur **12 / 128** (3 sites BestTime). Vivantes mais rares. |
| **Pression haute inexistante cette semaine** | `high_competition_density`, `proven_action_replication` (même CTE) | pr ≥ 1,3 : 752 / 4 096 en 120 j, **0** sur J..J+3. Saisonnier. |
| **Dépend d'un flag jamais vrai** | `regime_c_warning` | `is_forced_regime_c_flag ∨ is_major_realization_risk_flag` : 0 / 128 |
| **Lundi seulement** | `weekly_briefing` | tire le lundi — le 23/08 est un dimanche |

**Conclusion** : sur 25 « mortes », **4 sont un bug de pipeline** (mobilité), **4 sont impossibles**
(tourisme), **1 est impossible** (seuil 80), et **16 sont saisonnières ou rares** — vivantes.

## 2. Doublons : un fait, quatre cartes

| paire | site-dates communs |
|---|---|
| `foreign_tourism_signal` × `audience_shift_opportunity` | 124 |
| `audience_shift_opportunity` × `commercial_event_match` | **124** |
| `commercial_event_match` × `foreign_tourism_signal` | 124 |
| `low_competition_window` × les trois | 120 |

`audience_shift_opportunity` tire sur `is_commercial_event_flag` — **la condition exacte** de
`commercial_event_match`. Doublon pur.

**Réserve owner (23/08)** : un même signal peut légitimement produire plusieurs cartes quand il
appelle **plusieurs dispositifs**. Le test est : les gestes diffèrent-ils ? `low_competition_window`
(geste : commandes/extras) et `commercial_event_match` (geste : offre pour l'événement) — oui,
distincts. `audience_shift_opportunity` et `commercial_event_match` — « adaptez votre message » vs
« préparez une offre », même objet. Doublon.

## 3. Le renouvellement est réel — les cartes ne le voient pas

| source | cadence mesurée |
|---|---|
| `competitor_snapshots` | **28 concurrents re-crawlés / jour**, 14 j sans trou |
| `change_feed` | **~300 changements détectés / jour**, 22 types |
| `besttime_foot_traffic` | quotidien, 91 jours de collecte |
| `idf_traffic_info` | quotidien |
| `own_location_review_snapshots` | **dernière il y a 8 j** — le cron a calé |
| `weather_forecast_10d` | **32 lignes, 1 seul jour de collecte, il y a 4 j** — pas de série |

Le `change_feed` produit par jour : 5 868 `mobility_disruption_resolved`, 2 202 `medal_change`,
1 919 `event_new`, 685 `ranking_up` … sur 14 j. **Le passthrough `change_feed_actions` ne garde
que `alert_level >= 2`** — le reste n'atteint jamais une carte.

## 4. Marts frais que AUCUNE carte ne lit

31 marts location × date, **8 lus** par le modèle cartes, **23 non lus**. Les plus parlants :

| mart | lignes | sites | ce qu'il porte | gap opérationnel |
|---|---|---|---|---|
| `fct_client_hourly_sales` | 9 370 | 6 | ventes à l'**heure** | aucune carte horaire — et l'owner l'a dit stratégique (22/08) |
| `fct_client_offering_daily` | 5 260 | 6 | ventes par **famille produit** / jour | aucune carte au grain produit ; `family_revenue` existe comme KPI mais rien ne le déclenche |
| `fct_client_day_analogs` | 128 | 6 | jours analogues | un « ce jour ressemble au … » jamais rendu |
| `fct_location_events_topn_daily` | 9 461 | 32 | top événements du jour | lu par le day surface, pas par une carte nommant l'événement |
| `fct_location_weather_forecast_snapshot` | 7 524 | 33 | prévisions datées | les cartes lisent l'alerte du jour, pas l'évolution de la prévision |

## 5. Ce que je propose — un seul lot

**Dans `fct_location_daily_action_candidates.sql`** (un fichier, un commit) :
1. `audience_shift_opportunity` : retirer `or a.is_commercial_event_flag = true` (doublon).
2. Supprimer les 4 CTE tourisme + `UNION ALL` (impossibles).
3. Supprimer `sales_missed_opportunity` (seuil 80 > max 79).
4. `competitor_reputation_strength` : porte `> 0` + publics nommés (déjà exécutée).
5. `perfect_storm` : retirer `tourism_index` du payload.
6. **GARDER** les 16 saisonnières/rares et les 4 mobilité — les premières reviendront, les
   secondes tireront dès que le stub sera remplacé.

**Hors de ce fichier, avant lancement** :
7. **Remplacer le stub `int_mobility_region_daily__aligned`** par une vraie agrégation depuis
   `int_location_mobility_disruptions_daily` — débloque 4 cartes d'un coup, la donnée est là.
8. **`fct_competitor_directory.is_followed` sans `location_id`** — 11 « suivis » affichés sur
   f10c3e58, 2 réels.
9. `own_location_review_snapshots` : cron calé depuis 8 j.
10. `weather_forecast_10d` : un seul jour collecté — la série n'existe pas.

**Nouvelles cartes à construire** (gaps de la section 4) : horaire, famille produit, jour
analogue, événement nommé du jour. Chacune a son mart prêt.
