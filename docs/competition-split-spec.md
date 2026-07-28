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

## Les 5 modifications appliquées (dbt Cloud IDE, 28/07 — RUN PASSÉ)

Toutes dans `models/ms_open_data/mart/fct_location_daily_action_candidates.sql`.

**1 · Unité du payload — 4 occurrences** (CTE `high_competition`, `saturated_bad_weather`,
`same_bucket_saturation`, `ft_peak_saturated`). Remplacer partout :
```
round(d.pct_same_bucket_5km, 1) as pct_same_sector
```
par :
```
round(d.pct_same_bucket_5km * 100, 1) as pct_same_sector
```
⚠️ Piège rencontré : `round(x, 100)` (le 100 en 2e argument) arrondit à 100 décimales — le `* 100`
va sur le PREMIER argument. Et vérifier la virgule de fin de ligne : deux ont été perdues à la
saisie, ce qui casse la compilation.

**2 · Seuils morts — 3 occurrences** (`saturated_bad_weather`, `same_bucket_saturation`,
`ft_peak_saturated`). Remplacer :
```
and d.pct_same_bucket_5km > 25
```
par :
```
and d.pct_same_bucket_5km > 0.25
```

**3 · Exposer la scission — CTE `daily_state`**, insérer sous `r.pct_same_bucket_5km,` :
```
        r.events_within_5km_same_bucket_count,
```

**4 · Porter la scission — CTE `high_competition`**, dans le `to_json_string(struct(...))`,
entre `pct_same_sector` et `score_driver` :
```
            d.events_within_5km_same_bucket_count as events_5km_same_sector,
            d.events_within_5km_count - d.events_within_5km_same_bucket_count as events_5km_other_sector,
```

**5 · Le geste suit la scission — CTE `high_competition`**, `detail_fr`. Remplacer le `case`
sur `pressure_ratio` par :
```
            case
                when d.pct_same_bucket_5km >= 0.25 then concat(
                    cast(round(d.pct_same_bucket_5km * 100, 0) as string),
                    '% sont dans votre secteur - ils disputent votre public. Differenciez votre offre.')
                else concat(
                    'Seulement ',
                    cast(round(d.pct_same_bucket_5km * 100, 0) as string),
                    '% sont dans votre secteur : ce public est dans le quartier sans vous etre dispute. Allez le capter.')
            end
```

## Dérives d'en-tête constatées (28/07, non corrigées — documentation seule)

- « 17 types d'action » : il y en a **53** dans le `UNION ALL` ; la liste cite encore
  `score_driver_shift`, supprimé.
- **8 sources manquantes** dans `AUTHORITATIVE SOURCES` : `fct_location_impact_daily_calendar`,
  `fct_foreign_tourism_context_daily`, `int_client_weather_alerts_daily`,
  `fct_client_sales_signals_daily`, `fct_client_day_residual`,
  `int_competitor_offering_changes`, `fct_location_action_learning`,
  `source('raw_crawl','watched_competitors')`.
- `NOTES` annonce `suppression_key = '{action_type}:{location_id}:{date}'` : faux pour plusieurs
  CTE — `high_competition_density` écrit `'competition_pressure_spike:…'` (**collision de clé**
  avec la carte de transition du change_feed : le dédup en garde une par priorité — à arbitrer),
  `low_competition_window` écrit `'low_competition:'`, `same_bucket_saturation` `'same_bucket_sat:'`.

## Côté app — FAIT (28/07, `action-cards.js` v=33)

**DEUX unités coexistent désormais**, c'est le piège à retenir :
- `a.pct_same_sector` (payload de la carte) = **pourcentage 0-100** depuis le correctif dbt ;
- `d.pct_same_bucket_5km` (vue sémantique du jour) = **ratio 0-1**, inchangé.

Le helper `samePct(a, d)` porte seul cette normalisation (payload prioritaire, vue en repli ×100)
et les 5 emplacements passent tous par lui : `same_bucket_saturation` (sowhat + note interne),
`ft_peak_saturated` (sowhat + note interne), `saturated_bad_weather` (ACTION_SENTENCES).
Deux bugs annexes corrigés au passage : les calculs inline faisaient `Math.round()` sur une
**chaîne** déjà arrondie par `num()`, et le `a.pct_same_sector || d.pct_same_bucket_5km` faisait
basculer un **vrai 0 %** sur le repli. Cache-buster `?v=33` sur pulse / insight / monitor / rapport.

Preuve : 9 assertions Node sur le helper réel extrait du fichier (payload 21,8 → 22 % ;
vue 0,534 → 53 % ; vue 0,04 → 4 % au lieu de « 0 % » ; payload prioritaire ; 0 réel préservé ;
régression de l'ancien bug 53 % → « 1 % »). `node --check` propre.

## Vérification après application — RÉSULTAT (28/07, run dbt passé)

1. **`same_bucket_saturation` : 20 lignes. `saturated_bad_weather` : 20 lignes.** Les deux
   ressuscitent après des mois à zéro (part moyenne 50,5 %). **`ft_peak_saturated` reste à 0** :
   ses autres conditions (jour de pointe `ft_day_rank_max <= 2` + `pressure_ratio > 1.3` +
   secteur > 25 %) ne se sont pas encore croisées — conjonction rare, plus un bug d'unité.
2. `high_competition_density` : 133 tirs, part moyenne réelle **21,8 %** (affichait « 0 »), et
   **133/133 portent la scission** `events_5km_same_sector` / `events_5km_other_sector`.
2. Plus aucun tir n'affiche 0 % avec un ratio réel > 5 %.
3. `low_competition_window` garde son volume (~96 tirs / 90 j).
4. Sur `f10c3e58`, `high_competition_density` porte `pct_same_sector ≈ 53` et la branche « défendre ».
