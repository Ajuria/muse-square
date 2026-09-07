# Trou « prix des concurrents » — diagnostic en données (23/08/2026) — SPEC DE TRAVAIL

> Premier trou attaqué selon `questions-exploitant-vs-cartes-2026-08-23.md`. Cinq cartes au
> registre (`competitor_price_drop`, `_price_increase`, `_repricing_event`, `_new_offering`,
> `_offering_removed`), 0 tir, jamais. Chaîne tracée de la source à la carte, chaque étage mesuré.

## La chaîne, étage par étage

| étage | contenu | verdict |
|---|---|---|
| `raw.competitor_offering_history` (crawl tarifs) | **14 626 lignes, 24 concurrents, 41 jours, 22 à 78 crawls chacun**, 2 crawls/jour (≈ 09:15 et 21:30), 3 388 lignes avec prix numérique, 465 items distincts | **abondant et frais** |
| `stg_competitor_offering_history` | pass-through, 0 item_norm vide | sain |
| `int_competitor_offering_changes` | **0 ligne**, construit chaque jour à 05:01, `DONE OK` | **la rupture** |
| `fct_competitor_offering_changes` | 0 ligne | conséquence |
| les 5 cartes | 0 tir | conséquence |

## Pourquoi 0 : une fenêtre de 12 heures

Le modèle compare **les deux derniers crawls** (`dense_rank` sur `crawled_at`, `rn <= 2`) et ne
garde que `change_type != 'unchanged'`. Or les deux derniers crawls sont espacés de **12 heures**.
Reproduit : 247 lignes au rang 1, 247 au rang 2, `FULL OUTER JOIN` → 247 lignes, toutes
`unchanged`, 0 conservée. **Tous les jours depuis le premier build.** Le modèle est correct pour
ce qu'il dit faire ; il pose la mauvaise question.

## Ce qu'on verrait avec une vraie fenêtre — et le second problème

| fenêtre | nouvelles offres | retirées | hausses | baisses |
|---|---|---|---|---|
| 12 h (actuel) | 0 | 0 | 0 | 0 |
| ≥ 1 j | 1 | 1 | 0 | 0 |
| ≥ 7 j | 82 | 71 | 0 | 0 |
| ≥ 30 j | 135 | 95 | **1** | **1** |

**Les prix bougent peu — deux mouvements réels en 30 jours**, tous deux chez MesRideaux.fr :
« Rideau Etamine » 222 → 304 € (+82), un coussin 96 → 88 € (−8). C'est une vraie information.

**Les « offres » bougent beaucoup trop** : 135 nouvelles, 95 retirées en 30 j. Ce n'est pas du
commerce, c'est le crawl. Mesuré : sur 466 items, **300 sont des « fantômes »** présents à moins
de 50 % des crawls, 98 intermittents, **68 stables** seulement. Le même concurrent porte
« Coussins (outlet) », « Coussins en fin de série », « Coussins – Outlet fins de série » comme
trois `item_norm` distincts — l'extraction LLM renomme, et `item_norm` (accents / espaces /
apostrophes) ne rattrape pas ça. Une carte « nouvelle offre » sur cette base crierait 82 fois
par semaine.

## Ce qu'on peut faire, par ordre de solidité

**1. Prix — faisable, fiable, petit.** Fenêtre ≥ 7 j (ou 30 j) au lieu du crawl précédent, sur
les seuls items **stables** (≥ 90 % des crawls, 68 items). Deux mouvements réels en 30 j sur le
parc : la carte tirera rarement, et dira vrai. C'est une modification de
`int_competitor_offering_changes` : `prev_ts = MAX(crawled_at) WHERE crawled_at <= latest − N j`,
plus un filtre de stabilité.

**2. Offres — pas avant d'avoir stabilisé l'identité des items.** Le rattachement
`item_norm` est insuffisant : il faut soit un rapprochement flou (trigram / distance d'édition
au sein d'un même concurrent), soit un rattachement par `source_url` + catégorie. Sans ça,
`competitor_new_offering` / `_offering_removed` sont du bruit certain.

**3. « Suis-je plus cher que mes concurrents sur le même produit ? »** — la question que pose
tout exploitant. **Impossible aujourd'hui** : les items concurrents (« Rideau Etamine ») et les
familles client (« Coffee », « Tea ») ne sont pas dans le même référentiel, et aucun modèle ne
les rapproche. C'est un chantier de référentiel produit, pas une carte.

## Ce que je propose

Traiter **1** maintenant (dbt, une CTE, exécutée avant livraison — effet mesuré : 2 tirs sur
30 j au lieu de 0 sur toujours). Documenter **2** comme chantier crawl, **3** comme chantier
référentiel. Ne pas réveiller les 5 cartes d'un coup : 2 deviennent vraies, 3 resteraient fausses.
