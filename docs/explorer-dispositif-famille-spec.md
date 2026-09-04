# Explorer — lecture « dispositif × famille » : ventes, panier moyen, mix produits & services — DÉFINITIF

> Sert : intent § Le métier — « garder la trace de chaque dispositif avec son résultat » — et
> § Le test de valeur (un chiffre porte son référentiel ; une absence se dit et se chiffre).
> Incrément **I8** du chantier `explorer-routage-inversion-spec.md`. Question owner 03/09, mots
> et décisions owner 04/09, appliqué le 04/09 (dev, non commité au moment de l'écriture).
> Foyer : `src/lib/dispositifFamille.ts` ; branche dans `src/pages/api/insight/prompt.ts`.

## 1. Ce que la lecture répond

À « quel est l'impact du dispositif X sur les ventes de la famille Y, le panier moyen ou le
mix produits & services ? », Explorer rend, pour UNE opération nommée AVEC une ou plusieurs
familles (cap 3) :

1. le titre « X × famille Y — du JJ/MM/AAAA au JJ/MM/AAAA » ;
2. la table des verdicts de l'opération dans son KPI déclaré, et ses totaux (inchangés,
   `buildEntityPeriodBlocks`) ;
3. une table « Famille Y pendant l'opération » (Étape de la vente · Pendant l'opération ·
   Votre résultat habituel · Écart), quatre lignes aux libellés owner : **Ventes/jour avec Y ·
   Panier moyen avec Y · CA/jour Y · Part de Y dans le CA** ; puis la phrase de tête sur le KPI
   demandé (« Part de Coffee dans le CA pendant l'opération : 39,2 % au lieu de 38,5 %
   (+1,6 %). ») et « Ce qui bouge pendant l'opération pour la famille Y : … · ce qui ne suit
   pas : … » ;
4. « Votre site pendant l'opération » : l'échelle de la vente existante ;
5. « Vos N familles, de la plus forte hausse à la plus forte baisse » (tournure owner 28/08) :
   la part de chaque famille pendant l'opération vs habituelle, triée par écart, familles
   nommées en gras, familles sous 1 % de part habituelle regroupées en une ligne ;
6. Sources : la base et les définitions, en clair.

Registre observationnel : « ce qui bouge pendant l'opération », jamais « l'opération a fait ».
Aucun LLM sur ce chemin. Producer `deterministic_dispositif_famille_v1`, registre null.

## 2. Les mots (owner 04/09)

| Concept | LE mot | Foyer |
|---|---|---|
| Nombre de tickets | **ventes** (« Ventes/jour avec Y ») | `kpiRegistry.KPI_NOM_FR.transactions` |
| Dépense moyenne par ticket | **panier moyen** (« Panier moyen avec Y ») | `KPI_NOM_FR.basket` |
| Part de chaque famille dans le CA | **mix produits & services** (« Part de Y dans le CA ») | mot owner 04/09 |

« Mix » n'est pas un `KpiKey` : une part n'a pas de cible, aucun verdict ne la juge. C'est une
lecture. Ligne ajoutée au lexique le 04/09.

## 3. Les définitions, sur la donnée (vérifiées 04/09 — schémas `INFORMATION_SCHEMA`, modèles dbt lus)

**Grain source.** `stg_client_transactions` = une ligne par ligne de facture. Le site compte ses
ventes par `COUNT(DISTINCT invoice_number)`, repli `SUM(transaction_count)`
(`int_client_daily_performance` l. 37-38). Sur f10c3e58, août 2026 : 10 758 lignes = 10 758
factures (une ligne par ticket — la graine) ; une caisse réelle porte plusieurs lignes par ticket.
`mart.fct_client_offering_daily` (location × jour × famille) porte `line_count`, `units`,
`revenue`, `revenue_share` INTRA-JOUR — pas de nombre de tickets par famille.

| Lecture | Définition appliquée | Source |
|---|---|---|
| Ventes/jour avec Y | tickets du jour contenant ≥ 1 ligne de Y (`COUNT(DISTINCT invoice_number)` ; repli `SUM(transaction_count)` sans numéro de facture) ; un jour sans vente de Y compte 0 | `raw.client_transactions` |
| Panier moyen avec Y | **le ticket ENTIER** (toutes lignes) des tickets contenant Y, moyenne par jour (owner 04/09) ; sans numéro de facture → « — » | idem |
| CA/jour Y | Σ revenue des lignes Y | idem (même table que `measureFamilyRevenueMean`, le KPI déclaré `family_revenue`) |
| Part de Y dans le CA | moyenne des `revenue_share` du jour | `mart.fct_client_offering_daily`, jamais recalculée |

**Base comparable — UN foyer** : `entityReading.OCC_CTE` (jours d'occurrence de l'opération,
`raw.saved_item_dates`, dans la période) et `COMPARABLE_LOOKBACK_DAYS = 90`, partagés
byte-identiques avec l'échelle de la vente (`readSerieFunnel`). Comparables = mêmes jours de
semaine, hors occurrences, de 90 j avant le début de période à la fin. Planchers : ≥ 2 jours
d'opération et ≥ 5 comparables, sinon « — » avec le compte de jours en sub.

**Écart** : RELATIF en %, pour toutes les lignes y compris la part (owner 04/09 — « pp » est
banni au lexique).

**Période par défaut d'une opération = sa vie** : `operationLife` = première occurrence →
aujourd'hui, posée par le code quand la question n'en dit aucune (le résolveur laisse
`periode: null`). Tracé `[dispositif-famille] periode=vie`. Vaut pour toute opération nommée
seule ou avec des familles.

**Mesuré 04/09, f10c3e58, « Corner de vente producteur × famille Coffee — du 08/08/2026 au
04/09/2026 »** (4 samedis d'opération : 08, 15, 22, 29/08 ; 12 samedis comparables) :

| Étape | Pendant l'opération | Résultat habituel | Écart |
|---|---|---|---|
| Ventes/jour avec Coffee | 140 | 94 | +48,5 % |
| Panier moyen avec Coffee | 4,81 € | 5,17 € | −6,9 % |
| CA/jour Coffee | 679 € | 482 € | +40,9 % |
| Part de Coffee dans le CA | 39,2 % | 38,5 % | +1,6 % |

Recoupé par une requête BQ indépendante (jointures, pas la requête du code) : 139,8 / 94,1 ;
4,81 / 5,17 ; 679 / 482 ; 39,2 / 38,5 — identique.

## 4. Le routage (appliqué)

- Dans le bloc entité × période de `prompt.ts` : quand les entités validées comptent UNE
  opération et ≥ 1 famille, la branche `readDispositifFamille` prend la main AVANT la
  comparaison N entités. Un pôle × famille n'est pas concerné (la famille est dans le pôle).
- Le KPI nommé pilote la PHRASE de tête, la table rend toujours les quatre lignes ; « mix »
  dans la question (`/\bmix\b/`) ouvre sur la part.
- Suites : « et la famille Tea ? » lit Tea avec la même opération (cadre écho-é). Le prompt
  du résolveur dit la convention (règle 1) : « et X ? » remplace l'entité de même type, « et
  aussi X » ajoute. Mesuré 04/09 : sur ce cadre à deux natures Haiku a ajouté Tea à Coffee au
  lieu de la remplacer — la réponse rend alors les deux familles, ce qui n'est pas faux ; la
  batterie n'asserte pas l'absence de Coffee (variance LLM), elle asserte Tea lue, l'opération
  gardée, la table Tea présente.
- Registre `INTENTS.entity_period` : la relation « opération nommée AVEC une famille = l'effet
  de l'opération sur cette famille » est dite au résolveur.

## 5. Portes (vertes le 04/09)

- `src/lib/dispositifFamille.test.ts` (5 tests, blocs purs ; mutations vues rouges : format de
  la part, tri du mix).
- Batterie `scripts/prompt-conversation-battery.mjs`, dialogue D11 : la phrase owner complète →
  `deterministic_dispositif_famille_v1`, cadre opération + famille, quatre libellés, table mix
  avec Coffee en gras, phrase de tête sur le mix ; suite « et la famille Tea ? ».
- Échelle de la vente inchangée (D2 et probe « Corner de vente producteur en août » : mêmes
  valeurs qu'avant l'extraction de `OCC_CTE`).

## 6. Limites dites

- La lecture `raw` ne passe pas par `is_invoiced` (devis/bons) — le précédent
  `measureFamilyRevenueMean` non plus. La source cible est une vue `semantic` au grain jour ×
  famille portant `invoice_count` (tickets contenant la famille) et le panier du ticket entier :
  **passation écrite le 04/09** : `docs/dbt-handoff/HANDOFF-offering-daily-hourly-2026-09-04.md`
  (mart `fct_client_offering_daily` + `invoice_count`/`ticket_revenue_avg`, vue
  `vw_insight_event_client_offering_daily` bornée à aujourd'hui, SQL prouvé sur BQ), en attente
  du collage owner. Quand la vue existe, la source bascule sans changer le rendu.
- Le panier moyen du site dans l'échelle s'affiche « 4,7 € » (formateur historique de
  `buildEntityPeriodBlocks`), celui de la famille « 4,81 € » : deux formats côte à côte, le
  premier antérieur à cette lecture. À aligner sur deux décimales dans un passage de copie —
  hors de ce chantier.
- Titre de section « Votre site pendant l'opération » : libellé nouveau (l'échelle n'avait pas
  de titre quand elle suivait seule la table des verdicts). À confirmer ou remplacer par l'owner.

— DÉFINITIF
