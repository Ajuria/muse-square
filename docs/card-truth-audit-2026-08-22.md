# Audit de vérité rejoué — 22/08/2026 — DÉFINITIF

> Rejoue l'audit du 27/07 (`docs/card-truth-audit.md`) avec le moteur d'aujourd'hui : régime
> log+médiane (01/08), métrique-dimension à 6 KPI (22/08), store reconstruit ce jour.
>
> **PÉRIMÈTRE (arbitrage owner 22/08) : les 6 sites QUI ONT DES VENTES.** Un site sans historique
> ne peut pas être jugé sur une corrélation — c'est une question d'amorçage, pas de vérité.
> Une première passe comptait les tirs sur les 32 sites contre une mesurabilité sur 6 : deux
> populations mélangées, verdict gonflé. Corrigé — tout ce qui suit est sur la même population.
>
> **Méthode** : les portes ne sont PAS réimplémentées. `tools/oneoff/2026-08-26-audit-verite.ts` appelle
> `rowsToImpactsWithImmaterial`, le seul point d'entrée de lecture, exactement comme `monitor.ts`.
> Le verdict est donc celui que l'app applique vraiment. Tirs sur 90 jours.
>
> Déclencheur : question owner — « cette corrélation a-t-elle un sens ? Donne le score. »

## 1. Le chiffre qui résume

Sur les 6 sites mesurables, **74 tirs de cartes sont adossés à une classe de jours**. Parmi eux :

| | tirs | cartes |
|---|---|---|
| adossés à une classe qui ne passe sur **AUCUN** site | **71** | 7 |
| adossés à une classe qui passe sur la majorité des sites | **3** | 1 |

## 2. Classes : sur combien de sites la mesure passe-t-elle les portes ?

| classe | passe (pilule) | écartée matérialité | écartée portes | sites où elle existe |
|---|---|---|---|---|
| `rain` | 5 | 0 | 1 | 6 |
| `competition_low` | 5 | 0 | 0 | 5 |
| `competition_high` | 4 | 0 | 1 | 5 |
| `heat_25_27` | 4 | 0 | 2 | 6 |
| `school_holiday` | 4 | 0 | 1 | 5 |
| `followed_activity_high` | 2 | 0 | 0 | 2 |
| `traffic_high` | 1 | 0 | 0 | 1 |
| `heat_28_plus` | 1 | 0 | 4 | 5 |
| **`discount_no_lift`** | **0** | **5** | 1 | 6 |
| **`tourism_high`** | **0** | 0 | 2 | 2 |
| **`events_high`** | **0** | 0 | 4 | 4 |
| `public_holiday` | 0 | 0 | 4 | 4 |
| `tourism_low`, `snow`, `wind` | 0 | 0 | 1 | 1 |

Populations de cartes (famille `card`, hors contraste) : `pop_revenue_down` 2/5, `pop_revenue_surge`
2/6, `pop_underperformance` 2/6, `pop_traffic_not_conv` 1/1.

## 3. Cartes adossées à une classe : le signal tient-il ?

| carte | classe | tirs | sites qui tirent | sites où la classe passe | verdict |
|---|---|---|---|---|---|
| `foreign_tourism_signal` | `tourism_high` | 24 | 6 | **0** | tire sans mesure |
| `competition_proximity` | `events_high` | 12 | 3 | **0** | tire sans mesure |
| `sales_discount_no_lift` | `discount_no_lift` | 11 | 4 | **0** | passe les portes, tombe sur la matérialité |
| `tourism_peak_window` | `tourism_high` | 8 | 2 | **0** | tire sans mesure |
| `same_bucket_saturation` | `events_high` | 8 | 2 | **0** | tire sans mesure |
| `tourist_surge_vacation` | `tourism_high` | 4 | 1 | **0** | tire sans mesure |
| `tourist_high_season` | `tourism_high` | 4 | 1 | **0** | tire sans mesure |
| `competition_pressure_spike` | `competition_high` | 3 | 3 | 4 | **la seule qui tient** |

`tourism_high` porte à elle seule **4 cartes et 40 tirs** alors qu'elle n'existe que sur 2 sites
sur 6, avec `n = 1` et `n = 2` jours — sous le plancher `n >= 5`. Ce n'est pas « faible », c'est
non mesurable.

## 4. Ce qui a CHANGÉ depuis le 27/07

**`competition_low` — le signe dépend du SITE.** L'audit la donnait à `+88 €/j, t = 2,4` et la
classait « GARDER TELLE QUELLE — la plus saine du lot ».

| site | base | n | médiane €/j | t |
|---|---|---|---|---|
| `f10c3e58` (référence) | marginal | 20 | **−158** | −3,81 |
| `2af6eb18` | marginal | 20 | −158 | −3,81 |
| `29383776` | marginal | 20 | −98 | −2,39 |
| `ff2aeb35` | marginal | 20 | **+113** | **+2,38** |

La même classe **coûte** à trois sites et **rapporte** au quatrième, signal fort des deux côtés.
Le mécanisme de bascule existe déjà — règle 13 du lexique, clés `enjeu_positif` / `enjeu_negatif`
de `reco-library.js`. Ce qui change, c'est quelle branche doit tirer où.

**`discount_no_lift` — de « la plus forte » à immatérielle partout.** L'audit la donnait à
`t = −12,8`. Médianes actuelles : −1 à −28 €/j. Elle passe les portes statistiques sur 5 sites et
tombe sur la **matérialité** (0,3 % du CA annuel) sur les 5.

**`followed_activity_high` — la plus faible des classes qui produisent encore une pilule.**
Sur `f10c3e58` : base pure `n = 2` jours, +221 €/j ; base marginale `n = 33`, **−118 €/j, t = −1,45**
— sous le seuil de significativité (2), elle ne franchit que le plancher `|t| >= 1`. **Les deux
bases donnent des signes opposés.** C'est pourtant l'une des trois seules classes à avoir un
atelier des mécanismes.

**`events_high` — signe opposé selon le site, jamais assez fort.** `ff2aeb35` −168 (t = −3,2,
n = 3) ; `2af6eb18` +81 (t = 0,73) ; `f10c3e58` −11 (t = −0,49).

## 5. Ce que cet audit NE dit pas

- Il ne juge que le lien **carte → classe de jours**. Une carte peut dire vrai par un autre chemin
  (son payload dbt, une mesure propre) — `low_competition_window` en est l'exemple documenté.
- `span_days = 141` partout : **aucune** classe ne peut atteindre le tier « mesuré » (span >= 300 j).
  Tout est au mieux « estimé », comme le 27/07.
- Les terciles reposent sur `APPROX_QUANTILES`, non déterministe : un jour bascule d'un batch à
  l'autre (prouvé le 22/08 en comparant l'ancien SQL à lui-même). Effet mesuré : marginal.

**Hors périmètre, noté sans être jugé ici** : 26 des 32 sites actifs tirent des cartes sans avoir
la moindre vente en base. Ce n'est pas une question de vérité mais d'amorçage — que montre-t-on à
un site sans historique ? À instruire séparément.
