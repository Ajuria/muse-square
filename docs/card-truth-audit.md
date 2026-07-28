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
| 2 | `high_competition_density` (133) | « Différenciez-vous face à vos concurrents » | La règle de tir **ignore complètement le même-secteur** : elle exige `pressure_ratio >= 1.3` + `events_5km >= 10`, jamais une densité CONCURRENTE. Sur 74 des 133 tirs le payload affiche « 0 » (bug d'unité, cf. plus bas) alors que la part réelle moyenne est de 28 % — et de **53 % sur f10c3e58** | **Brancher la copie** sur la part même-secteur (défendre vs capter) + corriger l'unité |
| 3 | `foreign_tourism_signal` (128) | « Adaptez-vous au public touristique étranger » | Payload = liste de **24 pays en vacances scolaires** en août ⇒ « c'est l'été » ; aucune mesure de tourisme étranger sur le lieu | **Démettre au Fil** |
| 4 | `audience_shift_opportunity` (124) | « Ajustez votre message au public du jour » | Libellé du payload : « Certains résidents partent en vacances, d'autres restent en ville » — n'affirme rien ; `school_holiday` mesurée t = −1,1 (non significative) | **Démettre** ou réécrire le libellé |
| 5 | `low_competition_window` (96) | « Prenez la parole — faible concurrence » | **CORRECTION 28/07 : la règle est SAINE.** `pressure_ratio < 1.0` sélectionne 30 jours sur 90 — soit exactement le tercile bas de `competition_index_local` (31 j) sur lequel `competition_low` mesure **+88 €/j, t = 2,4** (n_days = 30). Le ratio est relatif à la baseline DU LIEU : « 0,93 » veut dire « 7 % sous votre normale », pas « pression normale » | **GARDER TELLE QUELLE** — durcir la découplerait de sa mesure |
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


## Correction du 28/07 — deux erreurs de ma part, et un troisième bug découvert

1. **`pct_same_sector` : erreur de lecture de ma part.** J'avais lu « 0 » sur un payload agrégé
   toutes-sites. `pct_same_bucket_5km` est un **ratio 0-1** ; le payload fait `round(ratio, 1)` et le
   client fait `Math.round(x) + '%'`. Donc 53 % → payload 0,5 → **affiché « 1 % »** ; 28 % → 0,3 →
   **« 0 % »**. Sur f10c3e58 la vraie part est **53 %** (155 des 295 événements à 5 km, et 7/7 à
   moins de 500 m) : le canal de cannibalisation n'est PAS vide, contrairement à ce que j'avais dit.
2. **`low_competition_window` : ma recommandation de durcissement était FAUSSE.** Vérifié : la règle
   `pressure_ratio < 1.0` produit le même ensemble de jours que le tercile bas qui porte la mesure
   de +88 €/j. La durcir à 0,5 aurait supprimé la carte (0 tir) ET cassé l'alignement carte↔mesure.
   Décision corrigée : **ne rien changer** à cette règle.
3. **TROISIÈME BUG — trois cartes n'ont JAMAIS tiré.** `same_bucket_saturation`,
   `saturated_bad_weather` et `ft_peak_saturated` filtrent sur `pct_same_bucket_5km > 25` alors que
   la colonne est un ratio dont le **maximum possible est 1,0**. Condition impossible → 0 ligne
   depuis la création du modèle (vérifié sur toute la table). Trois types de cartes sur 54 sont du
   code mort.

Spécification de correction : `docs/competition-split-spec.md`.


## Correction du 28/07 (2) — le classement de FRÉQUENCE de cet audit était faussé

La table est reconstruite entièrement à chaque run. La plupart des CTE n'émettent que sur
J → J+3 (4 dates), **mais `competition_proximity` et `high_competition_density` n'ont AUCUN filtre
de date** : elles balayent toute la fenêtre de `daily_state` (J−30 → J+7 = 38 dates). Leurs gros
totaux (347, 133) sont donc un artefact, pas une fréquence. Rapporté au jour :

| Carte | lignes/jour | sites touchés | lignes datées dans le passé |
|---|---|---|---|
| `foreign_tourism_signal` | 32 | **32 / 32** | 0 |
| `extended_bad_weather_3d` | 32 | **32 / 32** | 0 |
| `review_solicitation` | 31 | 31 | 0 |
| `audience_shift_opportunity` | 31 | 31 | 0 |
| `weekend_opportunity` | 30 | 30 | 0 |
| `low_competition_window` | 24 | 24 | 0 |
| `competition_proximity` | **9,1** | **10 / 32** | **275 / 347** |

Conséquences : (a) `competition_proximity` n'est PAS la carte la plus fréquente — c'est la moins
fréquente du haut de tableau, sur 10 sites, et 3/4 de ses lignes portent une date passée
(**bug de filtre**, pas un arbitrage) ; (b) les vraies cartes ubiquitaires sont
`foreign_tourism_signal` et `extended_bad_weather_3d`, sur TOUS les sites TOUS les jours.

Deux verdicts de l'audit sont aussi tempérés :
- **`extended_bad_weather_3d` a RAISON de tirer partout** : les 32 sites sont réellement en alerte
  ≥ 2 sur 5 jours (niveau moyen 2,0-3,3) — épisode national réel. Le défaut restant est seulement
  qu'elle lit `site_sensitivity` là où la mesure du lieu dit l'inverse.
- **`weekend_opportunity`** : ses 60 tirs sont en alerte ≥ 2 parce que la fenêtre courante est dans
  cet épisode, pas par contradiction systémique. Le vrai défaut : elle appelle « météo acceptable »
  une alerte de niveau 3 et n'en dit pas un mot (`case when alert = 0 then 'beau temps' else
  'meteo acceptable' end`).

## Suite décidée (owner, 27/07)

- ~~Durcir `low_competition_window`~~ — **ANNULÉ le 28/07** (voir correction ci-dessus) : la règle
  est déjà alignée sur la mesure. Ses plans restent à écrire, la carte ne change pas.
- Les autres verdicts (durcir / démettre / bug de source) restent **à arbitrer** : ils touchent
  soit les règles de tir côté dbt, soit `DEMOTED_TO_FEED` côté app.
- Rappel de méthode : la spécificité d'un plan vient des **données du lieu** (créneau, jour, écart
  en €), pas d'un cas étranger — voir `docs/best-in-class-registry.md`.
