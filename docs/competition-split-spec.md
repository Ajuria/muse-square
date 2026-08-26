# Densité concurrente vs densité d'entraînement — la scission — DÉFINITIF

> **Question owner (28/07/2026)** : quand la densité événementielle autour du lieu monte, est-ce
> qu'elle **cannibalise** le trafic du point de vente ou est-ce qu'elle en **amène** ? Le plan
> proposé n'est pas le même — défendre vs capter. Peut-on trancher rigoureusement ?

Ce document dit **la doctrine** et **l'état du modèle**. Il ne conserve pas l'historique des
correctifs : ce qui a été corrigé est décrit tel qu'il est aujourd'hui, et le chemin pour y arriver
vit dans `git log` (`ba82e39`, `638feb6`, `dc7aa69`, 28/07). Seules les **mesures** portent leur
date — un chiffre sans sa fenêtre n'est pas réutilisable.

Portée : `models/ms_open_data/mart/fct_location_daily_action_candidates.sql` (dbt Cloud IDE) +
`public/action-cards.js`. Audit d'origine : `docs/card-truth-audit.md`.

---

## Le discriminant

Les deux effets passent par des canaux différents :
- **Cannibaliser** exige une substitution → événement du **même secteur** (ou audience qui recoupe).
- **Entraîner** ne l'exige pas → n'importe quel événement met du public dans le quartier.

Donc on ne mesure pas « la densité » mais on la **scinde** : densité concurrente (même secteur) vs
densité non concurrente. Une journée peut porter les deux.

**Niveau 1 — ce que fait le produit.** La scission structurelle : disponible immédiatement, sans
historique ni statistique. C'est une **classification**, pas une estimation. Elle détermine le GESTE
(différencier vs capter), jamais le signe de l'effet.

**Niveau 2 — reporté, et pourquoi.** Le signe de l'effet sur le CA par régression (le moteur type B
fait déjà OLS + SE + VIF) est **sous-dimensionné**. Mesuré le 28/07 sur `f10c3e58`, 90 j
d'historique : CA moyen 1 071 €/j, écart-type du résiduel 208 € ⇒ sur les 21 jours de forte
concurrence l'erreur-type est 45 €/j, donc le plus petit effet détectable est **90 €/j = 8,4 % du
CA**. Le +14 €/j observé (t = 0,4) est très à l'intérieur du bruit : on ne peut RIEN conclure. Il
faudrait ~170 jours dans la classe (~2 ans) pour détecter 3 %.

**Conséquence de rédaction** : une carte peut dire « ces événements sont de votre secteur » (fait
structurel) ; elle ne peut pas dire « ils vous coûtent X € » (Niveau 2). Le classement A/B nomme un
canal candidat — il ne préjuge jamais du signe, qui se mesure ailleurs
(`insightFamilies/impactContrast.ts`) et sort parfois **positif** sur une classe dite concurrente.

---

## La donnée

`mart.fct_location_events_radius_daily`, par date × location :
- `events_within_{500m,1km,5km,10km,50km}_count` — tous secteurs ;
- les mêmes en `_same_bucket_count` — filtrés `same_industry_bucket` ;
- `pct_same_bucket_5km` = `safe_divide(same_bucket_5km, total_5km)` ⇒ **ratio 0-1**.

`same_industry_bucket` = `event.industry_bucket = client.client_industry_bucket` (non nul,
≠ `'unknown'`).

---

## Ce que le modèle fait aujourd'hui

Vérifié dans `fct_location_daily_action_candidates.sql` le 26/08/2026.

**Le seuil de scission d'une journée est 25 %**, en 3 emplacements : `>= 0.25` sur la branche de
copie (l. 745) et `> 0.25` sur deux filtres de tir (l. 2730, 2923). Au-dessus, la journée est
disputée ; en dessous, le public est dans le quartier sans vous être disputé. C'est le seuil
arbitré, déployé, et **il n'y a aucun autre seuil de scission à décider**.

**Le geste suit la scission** — CTE `high_competition`, `detail_fr` :
- ≥ 25 % → « N% sont dans votre secteur - ils disputent votre public. Differenciez votre offre. »
- < 25 % → « Seulement N% sont dans votre secteur : ce public est dans le quartier sans vous etre
  dispute. Allez le capter. »

**Le payload porte la scission** (l. 762-763), pour que la carte puisse la dire sans la recalculer :
```
d.events_within_5km_same_bucket_count                                  as events_5km_same_sector,
d.events_within_5km_count - d.events_within_5km_same_bucket_count      as events_5km_other_sector,
```

**L'unité du payload est un POURCENTAGE 0-100** : `round(d.pct_same_bucket_5km * 100, 1) as
pct_same_sector`, en 4 emplacements (`high_competition`, `saturated_bad_weather`,
`same_bucket_saturation`, `ft_peak_saturated`).

**La règle de tir de `high_competition_density` ignore volontairement le même-secteur**
(`pressure_ratio >= 1.3` + `events_5km >= 10`). C'est un choix, pas un oubli : une forte densité
non concurrente reste actionnable — c'est du public dans le quartier. **Ce sont la copie et le
payload qui portent la scission, pas la règle de tir.**

**`low_competition_window` garde `pressure_ratio < 1.0`.** Le durcissement envisagé (≤ 0,5) aurait
mis la carte à **zéro tir** et cassé l'alignement carte ↔ mesure : cette règle sélectionne 30 jours
sur 90 sur `f10c3e58`, soit exactement le tercile bas de `competition_index_local` (31 j) sur
lequel la classe `competition_low` mesure **+88 €/j** (t = 2,4, n = 30) — mesuré le 28/07.
`pressure_ratio` est relatif à la baseline DU LIEU : 0,93 = « 7 % sous votre normale ».

---

## Les deux pièges permanents

### 1. Deux unités coexistent pour la même grandeur

| Champ | Source | Unité |
|---|---|---|
| `a.pct_same_sector` | payload de la carte (dbt) | **pourcentage 0-100** |
| `d.pct_same_bucket_5km` | vue sémantique du jour | **ratio 0-1** |

**Le helper `samePct(a, d)` (`public/action-cards.js:101`) porte seul cette normalisation** —
payload prioritaire, vue en repli ×100 — et tous ses appelants passent par lui
(`same_bucket_saturation`, `ft_peak_saturated`, `saturated_bad_weather`, sowhat + notes internes).
**Ne jamais lire l'un des deux champs directement dans une nouvelle carte** : c'est le bug qui
affichait « 0 % » quand la réalité était 53 %, et « 1 % » quand elle était 53 %.

Deux pièges annexes que le helper neutralise et qu'un contournement ferait revenir : `Math.round()`
appliqué à une **chaîne** déjà arrondie par `num()`, et `a.pct_same_sector || d.pct_same_bucket_5km`
qui fait basculer un **vrai 0 %** sur le repli.

### 2. `round(x, 100)` n'est pas `round(x * 100)`

En SQL, le second argument de `round` est le **nombre de décimales** : `round(x, 100)` arrondit à
100 décimales et ne convertit rien. Le `* 100` va sur le PREMIER argument. Vérifier aussi la virgule
de fin de ligne en éditant ces `struct(...)` — une virgule perdue casse la compilation sans dire où.

---

## Preuve mesurée (28/07/2026, run dbt passé)

Chiffres de la vérification d'origine, conservés avec leur date — ils disent ce que la scission a
débloqué, et sur quelle base :

1. **`same_bucket_saturation` : 20 lignes ; `saturated_bad_weather` : 20 lignes** — les deux
   ressuscitent après des mois à zéro (part moyenne 50,5 %). Elles filtraient `pct_same_bucket_5km
   > 25` sur une colonne dont le maximum est 1,0 : condition impossible, **0 ligne depuis la
   création du modèle**.
2. **`ft_peak_saturated` reste à 0** — ses autres conditions (jour de pointe `ft_day_rank_max <= 2`
   + `pressure_ratio > 1.3` + secteur > 25 %) ne s'étaient pas encore croisées. Conjonction rare,
   plus un bug d'unité.
3. `high_competition_density` : 133 tirs, part réelle moyenne **21,8 %** (la carte affichait « 0 »
   sur 74 d'entre eux), et **133/133 portent la scission**.
4. `low_competition_window` garde son volume (~96 tirs / 90 j).
5. Sur `f10c3e58`, `high_competition_density` porte `pct_same_sector ≈ 53` et la branche
   « défendre » — 155 des 295 événements à 5 km, 7/7 à moins de 500 m.

Côté app, le helper `samePct` est couvert par 9 assertions Node sur le helper réel extrait du
fichier (payload 21,8 → 22 % ; vue 0,534 → 53 % ; vue 0,04 → 4 % ; payload prioritaire ; 0 réel
préservé ; régression de l'ancien 53 % → « 1 % »).

---

## Points ouverts sur l'en-tête du modèle

Re-vérifiés le 26/08/2026 — l'en-tête de `fct_location_daily_action_candidates.sql` décrit encore
imparfaitement son propre corps. Documentation seule, aucun impact sur les tirs.

- **Le compte de types est faux** : l'en-tête énumère une liste qui ne correspond pas aux **46**
  `action_type` distincts réellement présents dans le `UNION ALL`.
- **`score_driver_shift`** : l'en-tête signale désormais sa suppression (l. 21), mais le nom reste
  listé plus bas (l. 32) et référencé dans le corps (l. 1271).
- **`AUTHORITATIVE SOURCES` incomplet** — manquaient au relevé du 28/07 :
  `fct_location_impact_daily_calendar`, `fct_foreign_tourism_context_daily`,
  `int_client_weather_alerts_daily`, `fct_client_sales_signals_daily`, `fct_client_day_residual`,
  `int_competitor_offering_changes`, `fct_location_action_learning`,
  `source('raw_crawl','watched_competitors')`. **Non re-vérifié depuis** — à recontrôler avant de
  s'en servir.
- **Collision de clé de suppression** : `high_competition_density` écrit
  `'competition_pressure_spike:…'`, la même clé que la carte de transition du change_feed. Le dédup
  n'en garde qu'une, par priorité. `low_competition_window` écrit `'low_competition:'` et
  `same_bucket_saturation` `'same_bucket_sat:'` — les trois formes existent toujours dans le
  modèle. **Arbitrage owner ouvert.**

---

## Où vit la suite

Le **branchement des surfaces** sur cette doctrine (quelle page dit quoi, avec quels mots) vit dans
`docs/definitions-evenements-spec.md` (26/08). Le sort de la densité **non** concurrente — carte
d'action ou ligne de contexte — est la seule décision ouverte de `docs/menaces-vs-bruit-spec.md`.
