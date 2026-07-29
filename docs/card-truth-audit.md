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


## Arbitrage des verdicts — DÉCIDÉ ET APPLIQUÉ (28/07, owner)

**① Météo pilotée par la mesure, plus par le flag.** `extended_bad_weather_3d` lisait
`weather_sensitivity`, **NULL sur 15 sites sur 32**, alors que la météo est la famille la MIEUX
mesurée du produit (`heat` significative sur 4 sites/4, `rain` sur 2/4). La carte dit désormais ce
que ces journées coûtent RÉELLEMENT au lieu (`a.enjeu.eur_year`), ou « on ne sait pas encore ».
`action-cards.js` v=36.

**② Collision de clé — clé propre + exclusion au source.** `high_competition_density` écrivait
`'competition_pressure_spike:'` et **perdait 18 fois sur 22** face à la carte de transition du
change_feed. L'owner voulait que l'état gagne (il porte la scission même-secteur et le bon geste).
Implémenté selon le patron DÉJÀ établi dans le modèle pour `competitor_event_launch` — mutuellement
exclusives *au source*, jamais via un détournement de `action_priority` (qui signifie l'urgence,
pas le départage).

**③ Trois démotions au Fil** (`DEMOTED_TO_FEED`, `src/lib/recoThemeMap.ts`) — décidées sur la
couverture de mesure réellement constatée, et contre mon conseil précédent :
- `audience_shift_opportunity` (31/j sur 31 sites) : libellé qui n'affirme rien, 1 classe
  calendrier significative sur 8 ;
- `tourism_peak_window` (19/j) : signal RÉGIONAL, pas local ; `tourism_high` sur 2 sites ;
- `review_solicitation` (31/j) : **renverse la décision du 24/07** — aucune série de la note Google
  du lieu, la boucle ne peut pas se fermer sans connecteur GBP. À re-promouvoir quand GBP arrive.

**Raison transverse, à retenir** : le patron « on ne sait pas encore — fixez un objectif » **ne se
duplique pas**. Il marche pour `low_competition_window` (fenêtre datée, rare) ; appliqué à quatre
cartes tirant chaque jour sur trente sites, il servirait la même injonction quatre fois par jour.
Un bruit en remplacerait un autre.

Volume retiré des Actions du jour : **~81 lignes/jour** (les trois cartes les plus fréquentes et
les moins fondées). Elles restent servies par le Fil d'actualité et Consulter.


## Correction du 29/07 — le seuil des classes météo ne voyait pas la canicule

**Constat owner** : « C'est la canicule depuis 2 semaines. Pas trivial. Réel problème. Il ne faut
pas démonétiser les signaux pour des raisons statistiques : ce qui compte c'est la rigueur ET
l'impact business. »

Il avait raison, et mon arbitrage de la veille était bâti sur une évidence incomplète. J'avais
justifié « piloter la météo par la mesure » en annonçant `heat` significative sur 4 sites/4 —
j'avais compté la significativité (|t| ≥ 2) **sans appliquer le plancher qui décide réellement de
l'affichage** (`n_days ≥ 5` ET `span ≥ 60 j` ET |t| ≥ 1, `dayClassRegistry.ts` `rowToImpact`).
Au plancher réel : `heat` passait sur **1 site**, `rain` sur 3.

**La cause n'était pas le manque d'historique — c'était le seuil de la classe.**

| chez `f10c3e58`, 90 j | jours |
|---|---|
| `lvl_heat >= 1` (≥ 32 °C) | **22** |
| `lvl_heat >= 2` (≥ 35 °C) — ce que la classe comptait | **3** |

La classe météo n'admettait que le niveau ≥ 2, soit **35 °C**, alors que le seuil de canicule de
Météo-France en Île-de-France est de **31 °C**. La mesure était plus stricte que la définition
officielle *et* que le vécu de l'exploitant : elle jetait 19 jours sur 22.

**Deux correctifs, un seul foyer** (`conditionCaseSql`, `src/lib/dayClassRegistry.ts` — il alimente
à la fois la construction du store et la résolution carte→classe, donc les deux ne divergent pas) :

1. **Seuil `>= 2` → `>= 1`.** Effet vérifié sur les 4 sites ayant un historique de ventes :
   chaleur mesurable **1 → 4 sites** (55 → 119 jours classés), pluie **3 → 4 sites** (23 → 49).
   Vent/froid inchangés (l'aléa ne se produit pas). Barème amont : `stg_weather_alerts_daily_all.sql`
   — chaleur 32/35/38/40 °C, pluie 20/40/80/120 mm, froid −5/−8/−12/−16 °C.
2. **Sévérité d'abord.** L'ancienne chaîne prenait la première classe de la LISTE qui matchait ;
   au seuil ≥ 1 une chaleur de niveau 1 aurait éclipsé une pluie de niveau 2 — **4 jours sur 364**
   sur le parc réel. On balaie désormais par niveau décroissant (4→1) ; l'ordre de
   `WEATHER_DAY_CLASSES` ne départage plus qu'à sévérité égale. Prouvé : ces 4 jours donnent bien
   `rain`.

**Ce qui n'est PAS touché** : le seuil de TIR des cartes (`alert_level_max >= 2`, côté dbt). Le
changement est confiné à la couche de mesure.

**Effet de bord assumé** : abaisser le seuil rend plus de jours multi-appartenance, donc non
« purs » ; ils basculent sur la base `marginal` (tier plafonné « estimé, cause multifactorielle »).
C'est le comportement honnête, pas une perte.

**Le store doit être reconstruit** (`/api/cron/day-class-impacts`) pour que le changement porte :
le seuil vit dans la requête qui ALIMENTE `analytics.day_class_impacts`, pas dans la politique de
lecture.

### La leçon, plus large que la météo

Un signal réel que la mesure ne voit pas n'est pas un signal faible : c'est une mesure mal calibrée.
Avant de conclure « pas assez de données », vérifier que **le seuil de la classe voit l'événement
que l'exploitant vit**. Le plancher statistique protège contre la fabrication ; il ne doit jamais
servir d'excuse pour taire un fait établi.


## Scission de la classe chaleur par la dose (29/07, après reconstruction du store)

Le correctif de seuil a fait son travail — `heat` est passée de 2 à 20 jours mesurés sur
`f10c3e58`. Mais l'enjeu restait muet : **+38,7 €/j, t = 0,84**, sous le plancher. Cause réelle :
la classe additionnait **deux régimes de signes opposés**.

Dose-réponse, sur les 4 sites ayant un historique de ventes (écart vs attendu) :

| bande | jours | €/jour | t |
|---|---|---|---|
| < 32 °C | 197 | +29 | 1,85 |
| **32–34 °C** | **68** | **+70** | **3,33** |
| **≥ 35 °C** | **95** | **−72** | **3,62** |

Les deux régimes sont fortement significatifs et opposés : groupés, ils s'annulent. Sur le compte
de l'owner seul : 32–34 °C → **+111 €/j sur 19 jours (t = 2,52)**, ≥ 35 °C → −163 €/j sur 2 jours.
**Ses journées chaudes sont ses bonnes journées** — l'inverse de l'hypothèse de départ.

`WEATHER_DAY_CLASSES` porte désormais des bandes bornées (`min_lvl`/`max_lvl`) :
`heat_32_34` et `heat_35_plus`. La pluie **reste groupée** — son signe est constant à toutes les
doses (−38 / −133 / −131 / −102), la mise en commun y est légitime. **On ne scinde que là où les
signes divergent.**

`conditionCaseSql` balaie par niveau décroissant avec **égalité stricte** sur le niveau (et non
`>=`) : c'est ce qui rend les bandes bornées possibles — sans quoi `heat_32_34` capturerait un
jour à 38 °C. La priorité de sévérité est conservée.

### Sur les libellés — et pourquoi aucun n'est un mot de météo

Les classes chaleur portent leur **bande de température**, pas un terme de vigilance.
`lvl_heat` est une température maximale d'**une** journée : ni nuit, ni durée, ni seuil
départemental. Il ne permet donc pas de dire qu'un jour était en canicule — la canicule est
définie par le gouvernement sur l'**IBM** (minimales + maximales moyennées sur 3 jours) comparé à
un seuil **départemental**, pendant **3 jours et 3 nuits consécutifs**. Météo-France distingue en
outre *pic de chaleur* (1–2 j), *épisode persistant de chaleur* (> 3 j), *canicule*, *canicule
extrême* — tous des termes de durée, aucun applicable à notre variable.

À noter, une erreur de raisonnement à ne pas refaire : la canicule **existe indépendamment de ce
qu'on mesure**. Dire « on n'a pas de canicule » parce que le pipeline ne l'identifie pas est faux.
Ce qui est vrai, plus étroitement : *notre variable actuelle ne l'identifie pas*.

**Chantier ouvert** : ingérer la **vigilance canicule publiée par Météo-France** (par département,
quotidienne). C'est une donnée officielle à ingérer, pas à dériver d'une température — et elle
donnerait une vraie classe `canicule` avec le mot juste et la définition du gouvernement derrière.

Sources : [Canicule, pic ou vague de chaleur](https://meteofrance.com/actualites-et-dossiers/comprendre-la-meteo/canicule-vague-ou-pic-de-chaleur) ·
[Qu'est-ce que la Vigilance canicule ?](https://meteofrance.com/comprendre-la-vigilance/vigilance-canicule)


## Porte de matérialité (29/07, arbitrage owner)

**Constat owner** : « −274 €/an → irrelevant as a yearly number ». Il avait raison, et la preuve est
plus forte que l'intuition : chez Les Olivades, `discount_no_lift` portait le **t le plus élevé du
lieu (3,41)** pour **−274 €/an sur 959 730 € de CA, soit 0,03 %** — pendant que leurs journées à
≥ 35 °C, qui valaient potentiellement 66 000 €/an, étaient tues pour t = 0,77.

Mécanique du piège : des remises **minuscules ET régulières** ont une variance minuscule, donc un
t énorme. Le total des remises des Olivades sur l'année entière est de **391 €** — la carte
chiffrait 71 % de tout ce qui a jamais été remisé.

**Les portes existantes testaient la SIGNIFICATIVITÉ (n ≥ 5, span ≥ 60 j, |t| ≥ 1) et jamais la
MATÉRIALITÉ.** Un enjeu peut être statistiquement béton et économiquement nul.

Seuil retenu : **0,3 % du CA annualisé du LIEU** (relatif, donc valable pour un café comme pour une
manufacture). Choisi sur la mesure, pas à l'estime — les 25 pills du parc au 29/07 forment deux
amas séparés par un vide :

```
discount_no_lift   0,026 %  0,216 %  0,222 %  0,257 %  0,257 %
        ── vide ──
heat_32_34         0,523 %
competition_high   0,677 %
followed_activity  0,710 %
school_holiday     0,982 %  0,982 %
```

0,3 % tombe dans le vide. À 0,5 % on perdait `heat_32_34` (−2 451 €), à 1 % les vacances scolaires
(−4 558 €) : trop large.

Implémentation dans `rowToImpact` (`dayClassRegistry.ts`), foyer unique de la politique, donc
effective **sans re-batch**. Le dénominateur vient d'une requête parallèle (`annualRevenueQuery`),
annualisée sur l'étendue RÉELLE de l'historique — un compte de 3 mois n'est pas jugé sur un CA
sous-estimé d'un facteur 4. **Sans CA connu, la porte ne s'applique pas** : on ne juge pas une
matérialité sans dénominateur.

Preuve par le comportement : `rowToImpact` extrait TEL QUEL du fichier, exécuté sur les 45 lignes
réelles du store — **25 pills → 20**, et les 5 supprimées sont les 5 `discount_no_lift` du parc,
une par site. Les +127 900 €/an des Olivades survivent.
