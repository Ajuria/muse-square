# Revue de copie des cartes — 23/08/2026, données réelles

> Produite par `scripts/copy-review-2308.ts` : exécute `reco-library.js` puis `action-cards.js`
> TELS QU'ILS SONT LIVRÉS, rend chaque carte avec un **payload réel** du parc et le profil réel de
> `f10c3e58`, puis croise avec les tirs sur 90 j et la couverture `MS_SALES_RECO_LIB`.
> Aucune chaîne n'est corrigée ici — c'est un relevé.

## 1. L'état du registre

| | |
|---|---|
| cartes au registre | **92** |
| qui ont tiré sur 90 j | **31** |
| qui ne tirent jamais | **61** |
| entrées de plans écrites (`reco-library`) | **13** |
| cartes qui tirent SANS plans | **23** |

## 2. Par catégorie — et le déséquilibre qui saute aux yeux

| catégorie | cartes | qui tirent | tirs | avec plans |
|---|---|---|---|---|
| OPPORTUNITÉ | 29 | 10 | **632** | **3** |
| MÉTÉO | 5 | 3 | 155 | **0** |
| CONCURRENCE | 18 | 7 | 83 | 1 |
| INTELLIGENCE | 27 | 8 | 57 | **9** |
| RÉPUTATION | 1 | 1 | 31 | 0 |
| URGENT | 7 | 1 | 10 | 0 |
| PLANIFICATION | 1 | 1 | 1 | 0 |
| ÉVÉNEMENT | 4 | 0 | 0 | 0 |

**Les plans sont là où les cartes ne sont pas.** INTELLIGENCE porte 9 des 13 entrées pour 57 tirs ;
OPPORTUNITÉ fait 632 tirs avec 3 entrées. MÉTÉO fait 155 tirs sans aucun plan.

## 3. Défauts de rédaction constatés dans le RENDU RÉEL

Chacun est reproductible en exécutant le script. Aucun n'a été corrigé.

### Composition cassée — visible à l'écran

| carte | tirs | ce que le rendu produit |
|---|---|---|
| `weather_hazard_onset` | **112** | « Alerte **alerte météo** (niveau faible)**..** » — mot doublé, double point |
| `weather_improved` | 40 | « **.** Espace extérieur de nouveau accessible. » — point orphelin en tête |
| `weather_worsened` | 23 | « **.** Sensibilité météo élevée (3/5). » — idem |

### La carte se contredit elle-même

| carte | tirs | corps vs geste |
|---|---|---|
| `audience_shift_opportunity` | 124 | corps « **Rentrée scolaire.** » · geste « **Vacances d'été** modifie le profil » — deux motifs différents |
| `competition_proximity` | 32 | corps « Concentration **faible** » · titre « **Différenciez-vous** » · geste « À **défendre** » |
| `top_day_approaching` | 23 | corps « **Meilleur** jour de vos dates » · geste « **3e** meilleur score » |
| `low_competition_window` | 128 | « On ne sait pas encore si elles vous rapportent plus ou moins » — alors que `competition_low` EST mesurée sur ce site (−158 €/j, t = −3,81) |

### Lexique — règles violées dans des chaînes livrées

| carte | violation |
|---|---|
| `competitor_reputation_strength` | titre « **Surveillez** la réputation concurrente » — règle 8 liste `surveiller` parmi les verbes proscrits (« on fait, ou on ne fait pas ») |
| `commercial_event_match` | titre « Temps fort commercial — **activez** » — le tableau de la règle 8 cite CE cas comme refusé : « verbe sans objet : activez quoi ? » |

### Localisation française

| carte | violation |
|---|---|
| `competitor_reputation_strength` | « **96941** avis » — pas de séparateur de milliers |
| `weekend_vacation_low_comp` | « pression **×0.1** » — décimale en point |

### Grammaire

| carte | violation |
|---|---|
| `top_day_approaching` | « planifier un **événements corporate** » |

### Affirme ce qui n'est pas mesurable

| carte | problème |
|---|---|
| `perfect_storm` | « 3 facteurs favorables alignés : … **tourisme élevé** » — `tourism_high` est inmesurable par construction (indice mensuel, `ctrl_n = 0`) |
| `review_solicitation` | « **6 journées** porteuses dans les **5 prochains jours** » — incohérence déjà relevée le 27/07, toujours en place |

## 4. Les 61 cartes qui ne tirent jamais

Elles occupent le registre, la maintenance et les tests sans rien produire. Trois familles :

- **Concurrence fine** (12) : `competitor_price_drop`, `competitor_hours_change`, `competitor_sold_out`,
  `competitor_content_spike`… — le détecteur amont ne produit pas ces sous-types.
- **Combinés météo/tourisme/mobilité** (11) : `ft_peak_bad_weather`, `weather_mobility_double`,
  `tourism_mobility_hit`… — conjonctions trop rares pour se produire.
- **Cycle de vie événement** (4) : `event_prepare`, `event_measure`, `event_threat`,
  `event_decision_due` — dépendent d'événements utilisateur, absents du parc de test.

## 5. Ce que cette revue NE dit pas

- Elle ne juge pas la **voix**. Un rendu grammaticalement correct peut rester du texte de machine.
- Le payload d'exemple est UN tir réel par type, pas la moyenne — un défaut peut être conditionnel.
- Les cartes qui ne tirent pas n'ont pas de rendu, donc pas de verdict de copie.
