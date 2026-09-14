# Réponse aux signaux externes par famille — le moteur des classes de jours dans dbt, le type de document à l'ingestion — DÉFINITIF

Sert : `intent.md` § Le métier (« rapporter [les ventes] au résultat habituel DU lieu ») et § Le test de
valeur ; `strategie-entreprise.md` § 12.12 (variations de volume, panier et mix selon les signaux) ;
`audits/profit-grains-sensibilite-audit-2026-09-11.md` § 3.3, § 5 D4 et D7.

_Réécrit en définitif le 11/09/2026 après la fusion de la PR [ms_database#146](https://github.com/Ajuria/ms_database/pull/146)
(`813176f`) et le run dbt Cloud `70471897062675` ; chaque affirmation ci-dessous est re-vérifiée en base
(`INFORMATION_SCHEMA`, comptages, 15 h 17 UTC). Le chemin parcouru vit dans
`docs/dbt-handoff/HANDOFF-signaux-famille-2026-09-11.md` et dans `git log`. Les modèles font foi :
`~/Documents/ms_database/ms_dbt/models/ms_open_data/…` — aucune copie de SQL ici._

---

## 1. Ce qui est en base

| Objet | Couche | Grain | Contenu (vérifié) |
|---|---|---|---|
| `open_data.document_types` | seed | source_system × document_code | 5 lignes Crisalid (`IVT`, `EST`, `SST` = stock ; `IVD` = invendu ; `RUP` = stock), `counts_as_sale = false` ; les codes de vente et de retour n'y sont pas : ils entrent à la lecture de l'export de détail Crisalid, avec la décision RETOUR |
| `raw.client_transactions.document_type` | raw (app-write) | — | STRING nullable, ALTER additif du 11/09 ; l'importeur ne l'écrit pas encore (NULL partout) |
| `staging.stg_client_transactions` | staging | ligne de ticket | porte `document_type`, `document_kind` ; `is_invoiced = coalesce(règle de routage, seed.counts_as_sale, true)`. 202 895 lignes = raw ; 202 444 facturées, inchangé (une ligne sans type ou à code inconnu garde TRUE) |
| `intermediate.int_location_day_cells` | intermediate | site × jour de vente | la trame du moteur : cellule de contrôle (mois × semaine/week-end), onze appartenances, `n_memberships`. Jours de vente = jours de `fct_client_day_residual` (CA > 0, passés), fenêtre 730 j |
| `intermediate.int_location_day_class_membership` | intermediate | site × jour × classe | 2 804 lignes, 6 sites. Douze classes structurelles : `heat_25_27` (lvl_heat 1), `heat_28_plus` (≥ 2), `rain`, `wind`, `snow`, `cold` (lvl ≥ 1, sévérité décroissante puis ordre chaleur, pluie, vent, neige, froid), `competition_high/low`, `tourism_high/low`, `events_high`, `mobility_disruption`, `followed_activity_high`, `traffic_high`, `school_holiday`, `public_holiday` |
| `mart.fct_location_day_class_impacts` | mart | site × classe × base × métrique | 224 lignes. Métriques `revenue_residual`, `busyness`, `footfall`, `conversion`, `basket`, `transactions`, `discount` ; bases `pure` (jours purs vs résultat habituel, calendrier contrôlé) et `marginal` (tous les jours − contrôle hors classe de la cellule, ≥ 3 jours). Colonnes = celles du store app (`class_family` remplace `family`) |
| `mart.fct_client_family_day_class_response` | mart | site × **famille** × classe × base × métrique | 1 950 lignes, 6 sites, 19 familles ; f10c3e58 : 500 lignes, 9 familles. Métriques (mots owner 04/09) : `family_units` = Ventes/jour avec Y (volume), `family_basket` = Panier moyen avec Y, € par ticket contenant Y (`ticket_revenue_avg`), `family_share` = Part de Y dans le CA (mix, ratio 0-1), `family_revenue` = CA/jour Y, `family_revenue_gap` = écart au résultat habituel (seule métrique à attendu par jour, seule en base `pure`), `family_avg_price` = prix moyen, € par unité, Σ CA ÷ Σ unités (`realized_price`) |
| `semantic.vw_insight_event_day_class_membership` · `…_day_class_impacts` · `…_family_day_class_response` | semantic, contrat enforced, tag `mart_dependent` | id. | projections fidèles ; les surfaces que l'app lit. **Aucun lecteur app au 11/09.** |

Les sept nœuds dbt portent `tags: ['mart_dependent']` : le job `daily mart dependent fresh data run`
(`dbt run --select tag:mart_dependent`) les rejoue chaque matin après le nocturne.

## 2. Ce que le moteur mesure, et ce qu'il ne mesure pas

- **Aucune porte dans les marts.** Ils émettent des agrégats bruts (n, moyenne, écart-type, médiane, stats
  log, portée, r point-bisériel). La politique de lecture (n ≥ 5, portée ≥ 60 j, |t| ≥ 1 sur le log,
  cohérence de signe médiane/log, matérialité 0,3 % du CA, paliers estimé/mesuré) vit chez le lecteur —
  `rowsToImpacts` (`src/lib/kpi/dayClassRegistry.ts`) pour le site ; un lecteur famille l'appliquera à
  l'identique. Un changement de porte ne demande jamais de rebuild.
- **Terciles exacts** (`percentile_disc` 0,3333 / 0,6667 par site) — la seule divergence voulue avec le
  store app, qui utilise `approx_quantiles`. Mesuré le 11/09 : `approx_quantiles` rend 343,7 ou 347,9
  d'un run à l'autre sur f10c3e58 ; le moteur app exécuté deux fois diffère de lui-même sur 5 lignes / 232 ;
  la porte de contrôle amplifie deux jours de frontière en une cellule entière (`competition_low` :
  8 ou 25 jours selon le run). Le mart dbt rend le même résultat sur les mêmes données.
- **Populations de cartes (`pop_*`) et `discount_no_lift` ne sont pas portées** : ce sont des tirs de
  cartes, pas des signaux ; le store app `analytics.day_class_impacts` reste la source des pastilles et
  des coins tant qu'un lot app ne le repointe pas (décision owner 11/09).
- **Le profit par famille × classe n'existe pas** : il entre comme une branche de plus du mart famille
  avec le catalogue de coûts (audit D1), jamais comme une estimation par marge déclarée (garde § 12.12).
- **Le grain pôle n'existe pas** : 0 pôle déclaré au 11/09 ; ce sera le mart famille regroupé par le
  mapping famille → pôle (audit D2).
- **La saisonnalité** est une cellule de contrôle (mois × type de jour), pas un facteur rapporté :
  « selon la saison » se lit « à saison égale ».

## 3. Preuves

- **Parité au même instant** (11/09, avant fusion, `_audit_scratch.lotA_*_20260911`) : `fct_location_day_class_impacts`
  contre le moteur app extrait par `dayClassAggregateSql(false)` et exécuté au même moment, jointure
  site × classe × base × métrique — **137 / 137 lignes identiques sur toutes les colonnes** (1e-6 €,
  1e-9 log) pour les classes déterministes (météo, calendrier, mobilité) ; 54 / 89 sur les classes à
  terciles (§ 2).
- **Parité en base** (11/09 15 h 20, `vw_insight_event_day_class_impacts` contre le store app calculé à
  02 h 00, donc AVANT la reconstruction des marts de 05 h 00) : 131 / 137 `n_days` égaux sur les classes
  déterministes, 115 / 137 écarts moyens à 0,5 € près — la différence est la dérive des données entre
  02 h 00 et 15 h 17, pas la logique (la preuve au même instant est celle du point précédent).
- **Staging** : rejoué par programme sur `origin/main` puis compilé (seed inliné), puis vérifié en base
  après build : raw 202 895 = staging 202 895 ; facturées 202 444 avant et après. Sonde (compilation) :
  une facture forcée `crisalid` + `IVD` → 2 lignes `document_kind = invendu`, `is_invoiced = FALSE`.
- **Lecture brute sur le compte owner** (base `marginal`, avant toute porte, graine `seed_maven`) :
  Coffee pendant les vacances scolaires −59,5 €/j de CA de famille contre les jours comparables (t = 4,6) ;
  Tea les jours de pluie −58,3 €/j (t = 4,6) ; Coffee les jours à 25-27 °C : panier moyen des tickets
  avec Coffee +0,40 € (t = 3,2), part −1,3 point (t = 1,8). Ce sont des agrégats sur une graine : ils
  prouvent la mécanique, pas un fait sur un commerce.

## 4. Ce qui existe côté app, et ce qui reste (état au 11/09)

- **Le store des enjeux est repointé** (`lib/kpi/dayClassRegistry.ts`, `readDayClassStore`) : la vue
  `vw_insight_event_day_class_impacts` d'abord, `analytics.day_class_impacts` pour ce que dbt ne porte pas
  (populations de cartes `pop_*`, `discount_no_lift`, classes absentes de la vue pour le site). La politique de
  lecture (`rowsToImpacts`) n'a pas changé d'une ligne. Mesuré sur f10c3e58 au 10/09 : 11 pastilles → 9 —
  `events_high` (+13 745 €/an) et `followed_activity_high` (−2 434 €/an) passent sous |t| ≥ 1 avec la base
  marginale dbt (31 j → 17 j ; 15 j → 13 j), les autres bougent de 2 à 27 % (`rain` −8 772 → −8 526 €/an,
  `school_holiday` −14 788 → −13 226 €/an). C'est la conséquence attendue des terciles exacts (§ 2, § 3 :
  54 / 89 lignes identiques sur les classes à terciles).
- **Le provider dispositif** (`lib/insightFamilies/dispositif.ts`) lit `vw_insight_event_day_class_membership`
  pour les jours d'une classe ; `dayClassMembersSql` n'existe plus. Parité mesurée : 9 classes sur 11 identiques,
  les deux terciles à ±1-2 jours.
- **Explorer** : `FAMILIES.signaux` (`lib/insightFamilies/signauxFamille.ts`) lit
  `vw_insight_event_family_day_class_response` et applique la porte du site à chaque famille (matérialité sur le
  CA annuel de la famille) ; faits « CA/jour <famille> sur vos <jours> : ±N € vs vos jours comparables, sur n
  jours — ≈ ±N € par an (estimé, à saison égale) », panier moyen et part quand |t| ≥ 1 ; rendu
  `renderSignauxFamille` (rapport de famille, chat). Sur f10c3e58 : 44 lignes, 9 familles.
- **L'importeur** écrit `document_type` (code de la caisse, tel quel), `revenue_ht`, `vat_rate` quand l'export les
  porte (`lib/import/salesCsv.ts`).
- **Reste** : les décisions owner ouvertes (RETOUR dans le brut à l'export de détail ; composants 49, 3-6, 19) ;
  les cartes Agir par famille × classe.
