# Densité concurrente vs densité d'entraînement — spec de correction (28/07/2026)

> **Question owner** : quand la densité événementielle autour du lieu monte, est-ce qu'elle
> **cannibalise** le trafic du point de vente ou est-ce qu'elle en **amène** ? Le plan proposé n'est
> pas le même — défendre vs capter. Peut-on trancher rigoureusement ?
>
> Cible : `models/ms_open_data/mart/fct_location_daily_action_candidates.sql` (dbt Cloud IDE) +
> `public/action-cards.js` (app). Audit d'origine : `docs/card-truth-audit.md`.

## Le discriminant

Les deux effets passent par des canaux différents :
- **Cannibaliser** exige une substitution → événement du **même secteur** (ou audience qui recoupe).
- **Entraîner** ne l'exige pas → n'importe quel événement met du public dans le quartier.

Donc on ne mesure pas « la densité » mais on la **scinde** : densité concurrente (même secteur) vs
densité non concurrente. Une journée peut porter les deux.

**Niveau 1 (cette spec)** = la scission structurelle. Disponible immédiatement, sans historique,
sans statistique : c'est une classification, pas une estimation. Elle détermine le GESTE.

**Niveau 2 (reporté)** = le signe de l'effet sur le CA, par régression (le moteur type B fait déjà
OLS + SE + VIF). **Sous-dimensionné aujourd'hui** : sur `f10c3e58`, 90 j d'historique, CA moyen
1 071 €/j, écart-type du résiduel 208 € ⇒ sur les 21 jours de forte concurrence l'erreur-type est
45 €/j, donc le plus petit effet détectable est **90 €/j = 8,4 % du CA**. Le +14 €/j observé
(t = 0,4) est très à l'intérieur du bruit : on ne peut RIEN conclure. Il faudrait ~170 jours
dans la classe (~2 ans) pour détecter 3 %.

## La donnée existe déjà — rien à recalculer

`fct_location_events_radius_daily` porte déjà, par date × location :
`events_within_{500m,1km,5km,10km,50km}_count`, les mêmes en `_same_bucket_count`, et
`pct_same_bucket_5km` = **ratio 0-1** (`safe_divide`). `same_industry_bucket` =
`event.industry_bucket = client.client_industry_bucket` (non nul, ≠ 'unknown').

## Trois défauts à corriger

### D1 — BUG BLOQUANT : trois cartes n'ont jamais tiré

`saturated_bad_weather`, `same_bucket_saturation` et `ft_peak_saturated` filtrent sur
`d.pct_same_bucket_5km > 25` alors que la colonne est un **ratio dont le maximum est 1,0**.
Condition impossible ⇒ **0 ligne depuis la création du modèle** (vérifié sur toute la table).
La copie de `same_bucket_saturation` (« Plus de 25% des evenements… ») prouve l'intention : 25 %.

### D2 — BUG D'AFFICHAGE : la carte annonce « 0 % » quand la réalité est 53 %

Le payload fait `round(ratio, 1)` puis le client fait `Math.round(x) + '%'` :

| Réalité | Payload | Affiché |
|---|---|---|
| 53 % | 0,5 | **« 1 % »** |
| 28 % | 0,3 | **« 0 % »** |
| 4 % | 0,0 | « 0 % » |

Sur les 133 tirs de `high_competition_density`, **74 affichent « 0 »** ; la part réelle moyenne est
28 %, et **53 % sur `f10c3e58`** (155 des 295 événements à 5 km ; 7/7 à moins de 500 m).

### D3 — La règle de `high_competition_density` ignore le même-secteur

Elle exige `pressure_ratio >= 1.3` + `events_5km >= 10`, sans jamais regarder si ces événements
sont concurrents. Elle dit « différenciez-vous » aussi bien sur une journée à 53 % de même-secteur
que sur une à 2 %. **Ne pas la tuer** : une forte densité non concurrente reste actionnable — c'est
du public dans le quartier. C'est la **copie et le payload** qui doivent se brancher sur la
scission, pas la règle de tir.

## Ce qui NE change PAS (correction du 28/07)

`low_competition_window` garde `pressure_ratio < 1.0`. Vérifié : cette règle sélectionne 30 jours
sur 90 sur `f10c3e58`, soit exactement le tercile bas de `competition_index_local` (31 j) sur lequel
la classe `competition_low` mesure **+88 €/j (t = 2,4, n_days = 30)**. Le durcissement envisagé
(≤ 0,5) aurait mis la carte à **zéro tir** et cassé l'alignement carte ↔ mesure. `pressure_ratio`
est relatif à la baseline DU LIEU : 0,93 = « 7 % sous votre normale ».

## Vérification après application

1. `same_bucket_saturation`, `saturated_bad_weather`, `ft_peak_saturated` produisent des lignes.
2. Plus aucun tir n'affiche 0 % avec un ratio réel > 5 %.
3. `low_competition_window` garde son volume (~96 tirs / 90 j).
4. Sur `f10c3e58`, `high_competition_density` porte `pct_same_sector ≈ 53` et la branche « défendre ».
