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

### Composition cassée — CORRIGÉ ET RECTIFIÉ le 23/08

**Deux des trois défauts que ce document annonçait n'existaient pas.** Ils venaient de mon
échafaudage, qui rendait les cartes avec `d = {}` alors que `d` est le contexte du JOUR. Mesuré
sur `vw_insight_event_day_surface` : `weather_label_fr` n'est vide sur **aucun** des 14 573 jours.
Le « . » orphelin de `weather_improved` et `weather_worsened`, et le double point, ne se produisent
donc jamais en production.

| carte | tirs | verdict après mesure |
|---|---|---|
| `weather_hazard_onset` | 112 | **RÉEL** — « Alerte **alerte météo** » : le repli de `hazardLabel` est « alerte météo », préfixé par « Alerte ». Mesuré : **2 567 jours sur 8 453 en alerte (30 %)** n'ont aucun aléa nommé. **Corrigé** — bascule sur `hazardPhrase(d)`, le helper qui existait déjà dans le fichier et que 9 autres cartes emploient. Idem sur les brouillons instagram, site (qui doublait aussi : « Bannière alerte météo. alerte météo. ») et note interne. |
| `weather_improved` | 40 | **artefact de l'échafaudage** — rien à corriger |
| `weather_worsened` | 23 | **artefact de l'échafaudage** — rien à corriger |

**Leçon de méthode** : un rendu produit avec une charge utile vide fabrique des défauts. Le relevé
doit se faire avec les VRAIES lignes des tables que la carte lit — payload ET contexte du jour.

### RECTIFICATIONS après passage par `renderActionCandidates` (v3 de l'échafaudage)

Le relevé v1 rendait `spec.sowhat` avec `d = {}` et lisait `spec.brand_label_fr` comme titre. Or la
page passe par **`renderActionCandidates`**, qui reçoit les candidats enrichis par `monitor.ts`
(`enjeu`, `context_motif`) ET surcharge certains titres. Quatre signalements tombent :

| signalé en v1 | réalité par le vrai chemin |
|---|---|
| `commercial_event_match` : « Temps fort commercial — activez » | titre RENDU = « **Préparez une offre pour la rentrée scolaire** » (surcharge ligne 2534, formulation owner) — déjà corrigé |
| `low_competition_window` : « on ne sait pas encore » alors que mesuré | rendu = « Chez vous, ces journées rapportent **moins** que la moyenne » — lit `a.enjeu`/`context_motif`, que v1 ne fournissait pas |
| `top_day_approaching` : « meilleur » vs « 3e meilleur » | les deux viennent du même `rank` du payload ; le rendu réel dit « 2e meilleur score » au geste et n'affirme plus « Meilleur jour » au corps |
| `weather_improved` / `weather_worsened` : « . » orphelin | `weather_label_fr` jamais vide (0 / 14 573 jours) |

**Corrigé ce jour** : `audience_shift_opportunity` — corps et geste choisissaient le motif dans deux
ordres différents ; mesuré **124 tirs sur 124** portant à la fois « Vacances d'été » et « Rentrée
scolaire ». Le geste s'aligne sur l'ordre du corps (commercial d'abord, comme dbt dans
`action_priority`).

### La carte se contredit elle-même

| carte | tirs | corps vs geste |
|---|---|---|
| `competition_proximity` | 32 | corps « Concentration **faible** » · titre « **Différenciez-vous** » · geste « À **défendre** » |

### Lexique — règles violées dans des chaînes livrées

| carte | violation |
|---|---|
| `competitor_reputation_strength` | titre « **Surveillez** la réputation concurrente » — règle 8 liste `surveiller` parmi les verbes proscrits (« on fait, ou on ne fait pas ») |

### Localisation française

| carte | violation |
|---|---|
| `competitor_reputation_strength` | « **96941** avis » — **CORRIGÉ 23/08** (`toLocaleString('fr-FR')` → « 2 580 avis ») |
| `weekend_vacation_low_comp` | « pression **×0.1** » — **CORRIGÉ 23/08, et c'était SYSTÉMIQUE** : 46 `toFixed(1)` à l'écran (pressions, notes /5, distances km, % remise), une seule ligne conforme. Helper `frDec` posé, 46 basculés. Rendu : « 4,4/5 », « ×0,2 », « 4,3 km ». |
| `weekend_vacation_low_comp` | **NOUVEAU, non corrigé** : « pression **×0,0** » sur 1 tir sur 21 — `pressure_ratio = 0` exact (valeur réelle : 601 zéros sur 12 653 jours au day surface). Un ratio nul veut dire « aucun événement autour » ; écrire ×0,0 ne le dit pas. Chaîne visible hors demande — signalé. |

### Grammaire

| carte | violation |
|---|---|
| `top_day_approaching` | « planifier un **événements corporate** » — **CORRIGÉ 23/08**. Cause : `EVT_FR` est un dictionnaire de PLURIELS ; « un » + pluriel sur les 9 types déclarés. Mesuré : 2 tirs sur 8. Accord au pluriel (« vos événements corporate »). Au passage : `charity`, déclaré par un site, n'était pas dans le dictionnaire et sortait en anglais — ajouté. |

### Affirme ce qui n'est pas mesurable

| carte | problème |
|---|---|
| `perfect_storm` | « … **tourisme élevé** » — **CORRIGÉ 23/08, des deux côtés**. dbt (PR #47) retire le tourisme de `favorable_count` ET de la règle de tir ; le client retire la ligne de `favorableParts`, source unique du corps et du geste. Un PR intermédiaire (#46) ne l'avait retiré que du `where` — le payload aurait dit « 3 facteurs » pour un tir à 2. |
| `review_solicitation` | « **6 journées** … **5 prochains jours** » — **CORRIGÉ 23/08 dans dbt** (PR #47) : la fenêtre `<= current_date() + 5 day` bornait SIX jours (J à J+5) ; passée à `+ 4 day`, la colonne `favorable_days_next_5` dit enfin vrai. Relevé le 27/07, resté en place un mois. |

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
