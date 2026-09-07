# Le bruit du résidu — diagnostic mesuré (01/08/2026) — DÉFINITIF

> **Préalable de l'objectif 1** (un € sur chaque carte) : chez Les Olivades,
> `daily_revenue − expected_revenue` a un écart-type de 5 750 € pour un CA moyen de
> 4 304 €/j — un signal réel de +948 €/j y tombe à t = 0,36. Consigne : instruire
> POURQUOI avant d'ajouter des euros où que ce soit. Voici le pourquoi, en quatre faits
> mesurés. **Aucun correctif n'est appliqué** — les gestes possibles sont en fin de
> document, à arbitrer par l'owner.
>
> Chaîne concernée : `mart.fct_client_day_residual` (dbt) fournit `expected_revenue` ;
> `src/lib/kpi/dayClassRegistry.ts` (`dayClassAggregateSql`, ligne 204) calcule
> `gap_eur = daily_revenue − expected_revenue`, agrège par classe de jours et stocke
> `avg_gap_eur`/`sd_gap_eur` dans `analytics.day_class_impacts` ; `rowToImpact` applique
> les portes (n ≥ 5, span ≥ 60 j, |t| ≥ 1, matérialité 0,3 % du CA).

---

## Fait 1 — Le biais systématique est un artefact de retransformation log-normale

`fct_client_day_residual` ajuste son modèle **en log** (`y = ln(daily_revenue)`) et rend
`expected_revenue = exp(yhat)`. Or `exp(yhat)` estime la moyenne **géométrique** (≈ la
médiane), pas la moyenne arithmétique : pour une distribution log-normale,
`E[X] = exp(µ + σ²/2)`. Plus la variance log du lieu est grande, plus `expected_revenue`
sous-estime le CA moyen — mécaniquement, pas par défaut de calibration.

Mesuré sur Les Olivades (`14379e18`, 223 jours du 28/08/2025 au 27/07/2026, toute la
table) :

| grandeur | valeur | requête |
|---|---|---|
| CA moyen | 4 304 €/j | `AVG(daily_revenue)` sur `fct_client_day_residual` |
| attendu moyen | 2 361 €/j | `AVG(expected_revenue)` — **45 % sous le CA** |
| gap moyen | **+1 942 €/j** | `AVG(daily_revenue − expected_revenue)` |
| σ du résidu log | 1,167 | `STDDEV_SAMP(ln(daily_revenue) − ln(expected_revenue))` |
| facteur de biais théorique `exp(σ²/2)` | **1,975** | — |
| facteur observé `AVG(ca)/AVG(attendu)` | **1,823** | — |

Le facteur théorique prédit le facteur observé à 8 % près : le « gap moyen +1 942 € »
**est** le biais de retransformation. Contre-épreuve : Muse Square (`f10c3e58`, 119 jours
du 03/04 au 30/07/2026), variance faible → gap moyen +22 €/j (0,5 % du CA), sd 211 €.
Le biais n'existe qu'où la variance log est grande.

## Fait 2 — Ce biais fabrique des faux positifs AU-DESSUS du seuil |t| ≥ 2

Si tous les jours portent ≈ +1 942 € d'artefact, n'importe quel sous-ensemble de jours
« mesure » un gain. Preuve par une classe dont l'effet réel est nul par construction —
le jour de semaine, qui est DANS la baseline du modèle :

| jour (n) | gap moyen | t linéaire | t sur le résidu log |
|---|---|---|---|
| mardi (44) | +1 478 € | **+2,03** | +0,31 |
| mercredi (45) | +1 974 € | **+2,83** | +0,31 |
| jeudi (44) | +2 087 € | **+2,52** | −0,02 |
| vendredi (45) | +2 803 € | **+2,21** | −0,03 |
| samedi (39) | +1 618 € | **+2,20** | −0,01 |

(Requête : gaps par `EXTRACT(DAYOFWEEK …)` sur `fct_client_day_residual`, lieu
`14379e18`, les 223 jours.) En linéaire, cinq classes fantômes « significatives » à
t ≥ 2. Sur le résidu **log** — celui que le modèle minimise, centré sur 0 par
construction — les mêmes classes rendent correctement ≈ 0. La base `pure` du moteur
(gap brut vs 0) est donc **inutilisable** sur un lieu à forte variance ; la base
`marginal` (gap − contrôle mois × type de jour) n'absorbe le biais que là où ses
cellules de contrôle sont peuplées (`ctrl_n ≥ 3`).

## Fait 3 — La variance n'est pas du bruit : c'est un mélange de canaux non déclaré

20 jours sur 223 portent un gap > 10 000 €. Structure des 5 plus gros
(`fct_client_daily_performance`, mêmes dates) :

| date | CA | transactions | panier moyen |
|---|---|---|---|
| 21/05/2026 | 53 836 € | **3** | **17 945 €** |
| 07/04/2026 | 23 874 € | 5 | 4 775 € |
| 11/03/2026 | 23 401 € | 6 | 3 900 € |
| 30/01/2026 | 19 671 € | 5 | 3 934 € |
| 22/07/2026 | 20 128 € | 56 | 359 € |

Quatre sur cinq sont **3 à 6 factures à 3 900–17 945 €** — des commandes grossiste
(Les Olivades est une manufacture), pas de l'affluence. Une seule (22/07) est une vraie
grosse journée détail. L'arrivée d'une facture B2B n'est prédictible ni par la météo ni
par le calendrier : tant que les canaux sont mélangés, l'écart-type de 5 750 € est
**irréductible par construction**.

Conséquence concrète : le 21/05 est un jour `competition_high` (percentile 95,5 de
`competition_index_local` sur 730 j). La mesure stockée `competition_high` base `pure`
(+7 486 €/j, t = 1,28, n = 9, `analytics.day_class_impacts`) tombe à ≈ +2 020 €/j sans
cette seule journée — **une facture grossiste porte 76 % des euros de la classe**, et le
reliquat est l'ambiant du Fait 1. Une carte monétisant cela dirait à l'exploitant que
les jours de forte concurrence lui rapportent 7 486 €/j.

## Fait 4 — La donnée qui séparerait les canaux existe en schéma, pas en valeurs

`raw.client_transactions` porte les colonnes `customer_type` et `channel`. Sur les
6 297 lignes des Olivades : **100 % NULL** (les deux). C'est la classe **A — déclaratif**
de la grille du réexamen : la séparation détail/grossiste est un paramètre que seul
l'exploitant détient — soit son export CSV porte le champ, soit il ne le porte pas.
(La question « quel est votre logiciel de caisse ? » aux Olivades est déjà en attente —
mémoire `les-olivades-beta-sprint`.) À défaut de déclaration, une heuristique par
montant de transaction est possible mais c'est un seuil à assumer, pas une vérité.

---

## Ce que ça implique pour l'objectif 1 — à arbitrer, rien n'est appliqué

1. **Tester la significativité en log, monétiser ensuite.** Le résidu log du modèle est
   centré et se comporte correctement (Fait 2). Le t d'une classe devrait se calculer
   sur `ln(daily_revenue) − ln(expected_revenue)` ; la conversion en € (pour la pilule)
   se fait après, et par une statistique robuste (médiane des gaps de la classe), jamais
   par la moyenne qu'une facture domine.
2. **La base `pure` ne doit pas produire d'euros sur un lieu à forte variance log** tant
   que le biais n'est pas corrigé (correction de retransformation `exp(σ²/2)` — dite de
   « smearing » — ou centrage sur le gap moyen du lieu).
3. **La séparation des canaux est la vraie réponse de fond** chez Les Olivades :
   demander le champ (classe A) avant de construire un seuil. Sans elle, même un test
   log propre mesure l'environnement sur un CA dont 45 % de la variance vient d'un canal
   que l'environnement ne touche pas.
4. Ces trois points ne se cumulent pas n'importe comment : le 1 est un correctif du
   MOTEUR (dayClassRegistry), le 3 une demande PRODUIT (profil / ingestion). Le 2 est
   une garde immédiate possible sans rien casser (les portes existantes la préfigurent).

Vérifications reproductibles : toutes les requêtes ci-dessus tiennent en une ligne sur
`mart.fct_client_day_residual` / `mart.fct_client_daily_performance` /
`analytics.day_class_impacts`, lieu `14379e18-2060-4b50-871d-edf0818eab8c`, fenêtre
28/08/2025 → 27/07/2026 (223 jours = toute la profondeur de la table pour ce lieu ;
`analog_lookback_days = 400` réel dans `dbt_project.yml:41`, l'en-tête du modèle qui dit
120 est périmé).

---

# AVANT/APRÈS MESURÉ (01/08, après-midi) — le chantier « log + médiane » sur pièces

> Méthode : le SQL RÉEL du moteur (`dayClassAggregateSql`) extrait par `npx tsx`, instrumenté
> par remplacements assertés (un `gap_log = ln(daily_revenue) − ln(expected_revenue)` traverse
> les mêmes CTE que `gap_eur`, contrôle mois × type de jour inclus ; médiane en sortie), exécuté
> tel quel sur les **5 lieux à historique de ventes** (Olivades 223 j + 4 × 119 j), fenêtre 730 j
> du moteur. Portes identiques des deux côtés : n ≥ 5, span ≥ 60, |t| ≥ 1, matérialité 0,3 % CA.
> AVANT = t linéaire + € par moyenne. APRÈS = t sur le résidu log + € par médiane × fréquence.
> `discount_no_lift` (classe coût, somme de remises) inchangée par construction.

## Verdict : 19 pilules → 17, et les 3 morts sont EXACTEMENT les fantômes — toutes chez Les Olivades

| mort | avant | après | lecture |
|---|---|---|---|
| `competition_high` pure | **+73 624 €/an, t = 1,28** (la pilule LIVE, servie aujourd'hui à `tourism_comp_squeeze` ×4 et `sales_competition_cannibalization`) | +4 242 €/an, t_log = 0,23 | la facture du 21/05 ne porte plus la classe |
| `cold` marginal | −12 627 €/an, t = −1,68 | t_log = −0,86 | signification portée par les montants extrêmes |
| `heat_28_plus` marginal | −17 036 €/an, t = −1,24 | t_log = −0,42 | idem |

**Et rien ne meurt sur les 4 lieux propres.** Leurs survivants bougent de < 15 % en € :
`traffic_high` +32 126 → +33 379 ; `rain` (MS Test) −8 615 → −10 806 ; `competition_low`
(Occitanie) +9 468 → +9 957 ; `school_holiday` (Muse Square) −5 627 → −2 756 avec un t qui
se RENFORCE (−1,33 → −2,30). Le vrai signal des Olivades survit aussi : `rain` −69 626 →
−66 002 €/an (t_log −1,50). Une méthode robuste rend la même réponse là où la donnée est
propre — c'est le critère de non-régression, et il est mesuré.

## Un cas limite découvert, à trancher dans le chantier : la cohérence de signe

`wind` marginal (Olivades) « naît » sous les portes proposées : t_log = **+1,68** mais
médiane € = **−114 €/j** (−4 378 €/an). Le test log et la monétisation médiane peuvent se
contredire en signe sur une distribution biscornue. Règle proposée : **pas de pilule si
sign(t_log) ≠ sign(médiane)** — absence honnête. Avec cette règle : 19 → 16, zéro naissance,
les 3 morts sont les 3 fantômes.

## Décision d'implémentation (si arbitrée GO)

- Foyer : `dayClassAggregateSql` (ajouter `gap_log` + médiane au store — le SQL instrumenté
  de cette mesure EST le patch, scratchpad `aggregate-instrumented.sql`) et `rowToImpact`
  (t sur log, € par médiane, garde de cohérence de signe). Store à reconstruire
  (`/api/cron/day-class-impacts`) — le seuil vit dans la requête d'alimentation.
- La pilule fausse des Olivades (+73 674 €, vérifiée servie par `enjeuForCandidate` le 01/08
  pour deux cartes dont une tire 4× cette semaine) meurt À LA RECONSTRUCTION du store — le
  chantier est aussi le correctif d'urgence, pas besoin de garde intérimaire s'il part vite.
- Ce que le chantier ne règle PAS : la dilution des effets environnementaux chez Les Olivades
  (45 % de variance de canal grossiste, Fait 3) — la question du champ `customer_type`/`channel`
  reste posée (classe A).
