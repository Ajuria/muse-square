# Audit de vérité rejoué — 22/08/2026

> Rejoue l'audit du 27/07 (`docs/card-truth-audit.md`) avec le moteur d'aujourd'hui : régime
> log+médiane (01/08), métrique-dimension à 6 KPI (22/08), store reconstruit ce jour.
> **Méthode** : les portes ne sont PAS réimplémentées — le script `scripts/audit-verite-2608.ts`
> appelle `rowsToImpactsWithImmaterial`, le seul point d'entrée de lecture, exactement comme
> `monitor.ts`. Périmètre : les 32 sites actifs, tirs sur 90 jours.
> Déclencheur : question owner — « cette corrélation a-t-elle un sens ? Donne le score. »

## 0. Le constat qui domine tous les autres : la couverture

| sites actifs | qui tirent des cartes (90 j) | qui ont des ventes | mesurés au store |
|---|---|---|---|
| 32 | **32** | **6** | **6** |

**26 sites sur 32 reçoivent des cartes d'action alors que le moteur ne peut rien mesurer chez
eux.** Aucun enjeu €/an, aucun motif, aucune vérification possible. Ce n'est pas un défaut de
carte : c'est la question de savoir ce qu'on affiche à un site sans historique de ventes.

Tout ce qui suit ne porte donc que sur les **6 sites mesurables**.

## 1. Classes : sur combien de sites la mesure passe-t-elle les portes ?

| classe | passe (pilule) | écartée matérialité | écartée portes | sites où elle existe |
|---|---|---|---|---|
| `rain` | 5 | 0 | 1 | 6 |
| `competition_low` | 5 | 0 | 0 | 5 |
| `competition_high` | 4 | 0 | 1 | 5 |
| `heat_25_27` | 4 | 0 | 2 | 6 |
| `school_holiday` | 4 | 0 | 1 | 5 |
| `followed_activity_high` | 2 | 0 | 0 | 2 |
| `traffic_high` | 1 | 0 | 0 | 1 |
| **`discount_no_lift`** | **0** | **5** | 1 | 6 |
| **`tourism_high`** | **0** | 0 | 2 | 2 |
| **`events_high`** | **0** | 0 | 4 | 4 |
| `public_holiday` | 0 | 0 | 4 | 4 |
| `tourism_low`, `snow`, `wind` | 0 | 0 | 1 | 1 |

## 2. Cartes adossées à une classe : le signal tient-il ?

| carte | classe | tirs 90 j | sites qui tirent | sites où la classe passe | verdict |
|---|---|---|---|---|---|
| `foreign_tourism_signal` | `tourism_high` | 128 | 32 | **0** | tire sans mesure |
| `tourism_peak_window` | `tourism_high` | 80 | 20 | **0** | tire sans mesure |
| `competition_proximity` | `events_high` | 32 | 8 | **0** | tire sans mesure |
| `same_bucket_saturation` | `events_high` | 21 | 6 | **0** | tire sans mesure |
| `tourist_surge_vacation` | `tourism_high` | 16 | 4 | **0** | tire sans mesure |
| `tourist_high_season` | `tourism_high` | 16 | 4 | **0** | tire sans mesure |
| `sales_discount_no_lift` | `discount_no_lift` | 11 | 4 | **0** (matérialité) | tire sans enjeu |
| `competition_pressure_spike` | `competition_high` | 11 | 11 | 4 | minorité |
| `mobility_disruption_planned` | `mobility_disruption` | 1 | 1 | 0 | classe jamais mesurée |

## 3. Ce qui a CHANGÉ depuis le 27/07

**`competition_low` — le signe dépend du SITE.** L'audit la donnait à `+88 €/j, t = 2,4` et la
classait « GARDER TELLE QUELLE — la plus saine du lot ». Aujourd'hui :

| site | base | n | médiane €/j | t |
|---|---|---|---|---|
| `f10c3e58` (référence) | marginal | 20 | **−158** | −3,81 |
| `2af6eb18` | marginal | 20 | −158 | −3,81 |
| `29383776` | marginal | 20 | −98 | −2,39 |
| `ff2aeb35` | marginal | 20 | **+113** | **+2,38** |

La même classe **coûte** à trois sites et **rapporte** au quatrième, avec un signal fort des deux
côtés. Le mécanisme de bascule existe déjà — règle 13 du lexique, clés `enjeu_positif` /
`enjeu_negatif` de `reco-library.js`. Ce qui change, c'est quelle branche tire où.

**`discount_no_lift` — de « la plus forte » à « immatérielle partout ».** L'audit la donnait à
`t = −12,8`. Aujourd'hui les médianes vont de −1 à −28 €/j : elle passe les portes statistiques
sur 5 sites et tombe sur la **matérialité** (0,3 % du CA annuel) sur les 5.

**`followed_activity_high` — la plus faible des classes qui produisent encore une pilule.**
Sur `f10c3e58` : base pure `n = 2` jours, +221 €/j ; base marginale `n = 33`, **−118 €/j, t = −1,45**
— sous le seuil de significativité (2), elle ne franchit que le plancher `|t| >= 1`. Les deux bases
donnent des signes OPPOSÉS. C'est pourtant l'une des trois seules classes à avoir un atelier des
mécanismes.

**`events_high` — signe opposé selon le site, et jamais assez fort.** `ff2aeb35` −168 (t = −3,2,
n = 3) ; `2af6eb18` +81 (t = 0,73) ; `f10c3e58` −11 (t = −0,49). Trois cartes s'y adossent
(`competition_proximity`, `high_competition_density`, `same_bucket_saturation`), aucune ne passe.

## 4. Ce que l'audit NE dit pas

- Il ne juge que le lien **carte → classe de jours**. Une carte peut dire vrai par un autre chemin
  (le payload dbt, une mesure propre) — `low_competition_window` en est l'exemple documenté.
- `span_days = 141` partout : aucune classe ne peut atteindre le tier « mesuré » (span >= 300 j).
  Tout est au mieux « estimé », comme le 27/07.
- Les terciles reposent sur `APPROX_QUANTILES`, non déterministe : un jour bascule d'un batch à
  l'autre (prouvé le 22/08 en comparant l'ancien SQL à lui-même). Effet mesuré : marginal.
