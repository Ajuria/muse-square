# Audit de vérité des cartes d'action (27/07/2026)

> **Déclencheur** : chantier « méthodes M'engager ». En traçant les données pour écrire des plans
> sous la carte la plus fréquente, on a découvert que **la carte elle-même ne passait pas la barre
> de vérité**. Écrire de bons plans sous une fausse prémisse ne corrige rien — d'où cet audit,
> fait AVANT toute rédaction de méthode.
>
> Méthode : pour chacune des 10 cartes les plus fréquentes sur 90 j
> (`mart.fct_location_daily_action_candidates`), comparer **ce que la carte affirme** (titre +
> `reg()` dans `public/action-cards.js`) à **ce que disent les données du lieu** (payload réel +
> `analytics.day_class_impacts_history` + `mart.fct_competitor_threat_profile`).
> Compte de référence : Muse Square `f10c3e58` (règle CLAUDE.md — jamais un autre lieu de démo).
> Barre appliquée : CLAUDE.md « Card Quality Bar » — une carte doit dire quelque chose de VRAI que
> l'exploitant ne pouvait pas voir seul, ET pointer quelque chose qu'il peut BOUGER.

## Le tableau

| # | Carte (tirs 90 j) | Ce qu'elle affirme | Ce que dit la donnée | Verdict |
|---|---|---|---|---|
| 1 | `competition_proximity` (347) | « Différenciez-vous de vos concurrents proches » | Recouvrement d'audience plat à **33 %**, sous la barre **40 %** que la page profonde concurrence applique déjà (état A honnête) ; « concurrents » = Louvre, Orsay, Quai Branly ; classe `competition_high` mesurée **+14 €/j, t = 0,4** → bruit | **Durcir** (overlap ≥ 40 %) ou démettre |
| 2 | `high_competition_density` (133) | « Différenciez-vous face à vos concurrents » | Payload : 1 004 événements à 5 km, **`pct_same_sector = 0`**, et `score_driver = météo` — la carte affirme la concurrence quand le moteur dit météo | **Durcir** (exiger % même secteur > 0) |
| 3 | `foreign_tourism_signal` (128) | « Adaptez-vous au public touristique étranger » | Payload = liste de **24 pays en vacances scolaires** en août ⇒ « c'est l'été » ; aucune mesure de tourisme étranger sur le lieu | **Démettre au Fil** |
| 4 | `audience_shift_opportunity` (124) | « Ajustez votre message au public du jour » | Libellé du payload : « Certains résidents partent en vacances, d'autres restent en ville » — n'affirme rien ; `school_holiday` mesurée t = −1,1 (non significative) | **Démettre** ou réécrire le libellé |
| 5 | `low_competition_window` (96) | « Prenez la parole — faible concurrence » | Tire jusqu'à **`pressure_ratio` 0,96** (moyenne 0,70) — une pression normale, pas faible. **MAIS** `competition_low` mesurée **+88 €/j sur 30 j, t = 2,4** → fait réel | **Durcir le seuil** (≈ ≤ 0,5) **puis garder** |
| 6 | `tourism_peak_window` (76) | « Pic touristique régional » | Aucune classe « tourisme haut » mesurée sur ce lieu ⇒ zéro € au compteur ; seule `tourism_low` existe (−59 €/j, t = −1,3, non significative) | **Fil** tant qu'il n'y a pas de mesure |
| 7 | `weekend_opportunity` (60) | « Activez une opération ce week-end » | Payload : **`weather_alert = 2`** actif ; or la pluie est mesurée **−131 €/j (t = −3,5)** sur ce lieu — la carte annonce une opportunité sur un jour mesuré perdant | **Durcir** (pas d'opportunité si alerte ≥ 2) |
| 8 | `weekend_vacation_low_comp` (35) | « Week-end de vacances — faible concurrence » | `pressure_ratio` 0,02-0,79 (moy. 0,53) → réellement faible ✓, adossée au +88 €/j mesuré ✓ | **Garder** — la plus saine du lot |
| 9 | `extended_bad_weather_3d` (32) | « Météo dégradée 3+ jours » | Tire avec **`site_sensitivity = 0`** (lieu réputé non sensible) alors que la mesure dit l'inverse : pluie −131 €/j (t = −3,5), chaleur −250 €/j (n = 2) | **Bug de source** — flag vs mesure, à trancher côté dbt |
| 10 | `review_solicitation` (31) | « Sollicitez des avis clients » | `favorable_days_next_5 = 6` (6 jours favorables sur les 5 prochains — incohérent) ; KPI `reputation` **sans aucune série de la note Google du lieu** (kpiRegistry : mesure NULL) ⇒ la boucle ne peut pas se fermer | **Fil**, ou brancher une source de note |

## Constats transverses

1. **4 classes de jours sur 10 sont du bruit pur** (|t| < 0,5) sur ce lieu : concurrence haute (t = 0,4),
   jours fériés (0,2), événements (0,3). Seules trois tiennent : remises sans effet (t = −12,8),
   faible concurrence (+2,4), pluie (−3,5). Calcul : `t = avg_gap_eur / (sd_gap_eur / √n_days)`
   depuis `day_class_impacts_history` (dernier batch).
2. **Rien n'atteint le tier « mesuré »** : l'historique fait 90 jours, la porte « mesuré » en exige
   300 (n ≥ 10 + |t| ≥ 2 + span ≥ 300 j). Tout est au mieux « estimé » — honnête, mais l'enjeu
   affiché repose partout sur des fenêtres courtes.
3. **Deux parties du produit se contredisent** : la page profonde concurrence refuse d'inventer une
   rivalité sous 40 % de recouvrement (état A), la carte du même signal sort quand même tous les
   jours. La barre existe déjà — il faut l'appliquer à l'amont.
4. **Volume** : sur ~1 000 tirs en 90 j, environ **700 disparaîtraient ou changeraient de statut**.
   Les cartes les plus vues sont les moins fondées ; les mieux fondées (cartes ventes : résiduel,
   décomposition, remises) sortent 4 à 13 fois et sont déjà les seules à avoir des plans.

## Suite décidée (owner, 27/07)

- **Durcir `low_competition_window`** (seuil ≈ `pressure_ratio` ≤ 0,5) — validé owner — puis écrire
  ses plans : c'est la seule du haut de classement adossée à un fait mesuré.
- Les autres verdicts (durcir / démettre / bug de source) restent **à arbitrer** : ils touchent
  soit les règles de tir côté dbt, soit `DEMOTED_TO_FEED` côté app.
- Rappel de méthode : la spécificité d'un plan vient des **données du lieu** (créneau, jour, écart
  en €), pas d'un cas étranger — voir `docs/best-in-class-registry.md`.
