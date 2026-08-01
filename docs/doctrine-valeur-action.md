# Doctrine « valeur d'action » — spec par famille (01/08/2026, AVANT tout code)

> **Doctrine validée par l'owner (01/08)** : le coin haut-droit d'une carte sert à **choisir quoi
> faire** — il porte l'**impact business annualisé** de l'action que la carte propose
> (« annualisé » à confirmer, cf. décisions en fin), dans une **unité commune** pour que les
> cartes soient comparables entre elles. Corollaires :
> - la valeur du coin est PROPRE à la carte — deux cartes ne référencent plus jamais le même
>   nombre au coin (le cas déclencheur : −4 925 €/an affiché à l'identique sur la carte météo ET
>   la carte ventes du 30/07) ;
> - un référentiel par emplacement : l'écart DU JOUR reste dans la phrase (livré le 01/08),
>   le motif de fond hérité devient une ligne de contexte, le coin reste l'impact annualisé ;
> - les contraintes d'honnêteté existantes tiennent TOUTES : jamais annualiser un jour isolé
>   (décision 24/07), portes n ≥ 5 / span ≥ 60 / |t_log| ≥ 1 / matérialité 0,3 % CA, médiane
>   (01/08), absence honnête avec raison.

---

## Le mécanisme unificateur : chaque carte = une population de jours

L'infrastructure existe (registre des classes de jours). La doctrine se réalise en classant
chaque famille selon CE QU'EST sa population :

### A — La carte EST le motif environnemental → coin inchangé (poids de classe)

`low_competition_window`, `weekend_vacation_low_comp`, cartes météo (`extended_bad_weather*`,
`weather_hazard_onset`), tourisme, mobilité, calendrier… La population de la carte = les jours
de sa classe ; le coin actuel est déjà sa valeur propre. **Rien ne change.**

### B — La carte est une ANOMALIE de performance → coin = la récurrence de SON problème

`sales_revenue_down_wow`, `sales_surge`, `sales_underperformance`, `sales_missed_opportunity`.
Population = **les jours où CE problème tire** sur l'historique du lieu (flags du mart :
`is_revenue_down_residual`, etc.). Coin = médiane(écart € de ces jours) × fréquence réelle
annualisée, mêmes portes que tout le reste. Lecture : « vos journées anormalement basses vous
coûtent ~X €/an au rythme constaté ».

- Le **motif de fond hérité quitte le coin** → ligne de contexte dans le texte (« Motif du
  jour : journées à 28 °C et plus, −4 925 €/an sur ce lieu ») — il explique, il ne chiffre pas
  l'action de CETTE carte.
- L'**écart du jour** (−572 €) reste dans la phrase (livré).
- **Conséquence à assumer** (mesurée le 01/08 sur MS Occitanie, 119 j de ventes) : les anomalies
  à ~2σ sont rares PAR CONSTRUCTION — `is_revenue_down_residual` = **2 jours** (sous le plancher
  n ≥ 5). Sur un compte jeune, le coin de ces cartes sera souvent **vide avec raison** (« pas
  encore assez de récurrence pour chiffrer ») et se remplira avec l'historique. C'est le prix
  de l'honnêteté ; l'alternative (annualiser le jour × 365) est la faute interdite du 24/07.

### C — La carte est une CONJONCTION comportementale → coin = la récurrence, valeur/jour dédiée

`sales_traffic_not_converting` (cas déclencheur n° 2). Population = ses jours de tir —
**9 jours** sur MS Occitanie (n ≥ 5 ✓, annualisable dès aujourd'hui, tier « estimé » car
span 119 < 300). Valeur/jour = le manque à gagner mesurable du jour :
`visiteurs × (conversion habituelle − conversion du jour) × panier moyen` (tout est dans le
payload), OU l'écart résiduel du jour — à trancher (décision 3).

- La classe `traffic_high` (+33 402 €/an « à gagner ») **quitte le coin** : un poids de classe
  vert sur une carte d'échec était le défaut pointé. Elle peut rester en ligne de contexte
  (« vos jours à fort passage valent +33 402 €/an — c'est ce que la conversion doit servir »).
- La demande « documenter pourquoi le trafic a surgi → base de connaissances » ne crée PAS de
  carte nouvelle : c'est la boucle « Vos bonnes pratiques » (en prod, 26/07) à brancher sur
  cette carte quand `footfall_delta_pct` est en hausse.

### D — Cartes sans € par décision (inchangé)

Les 7 cartes concurrent-événement-singulier + composites/score : décidables par l'urgence,
pas d'argent au coin (retrait logique du 31/07 — un montant y fabriquait une urgence sans
prise). La doctrine ne les rouvre pas.

---

## Ce que la doctrine règle structurellement

- **Plus de doublon de coin** : A garde ses poids de classe, B/C portent leur récurrence
  propre — deux cartes voisines ne peuvent plus afficher le même nombre. Quand deux cartes
  partagent une CAUSE, c'est la ligne de contexte qui le dit, pas le coin.
- **Le tri du feed devient honnête** : le triage trie déjà par |enjeu| — avec une unité commune
  au coin, ce tri EST le classement par impact business que la doctrine vise.
- **Référentiels** : coin = €/an de l'action de la carte ; phrase = € du jour ; contexte =
  motifs/classes. Trois nombres, trois places, trois référentiels nommés.

## Fenêtres de données réelles (mesurées, à ne pas promettre au-delà)

| source | profondeur | conséquence |
|---|---|---|
| `fct_client_day_residual` (populations B) | 400 j max (`analog_lookback_days`), borné par l'historique du compte | B annualisable dès que n ≥ 5 tirs |
| `fct_client_sales_signals_daily` (flags C) | fenêtre de sortie ~90-120 j (`sales_signals_output_days`) | C jamais « mesuré » (span < 300) tant que la fenêtre dbt n'est pas élargie — dire « estimé » |
| comptes réels | Olivades 223 j, autres 119 j | aucun coin B/C « mesuré » avant ~300 j d'historique |

---

## DÉCISIONS OWNER — TRANCHÉES (01/08 soir, feedback proto v1)

1. **Annualisé au coin : OUI** — avec l'exception de l'amendement 6, dont l'unité est dite en clair.
2. **Libellé B : « au rythme constaté »** — retenu.
3. **Valeur/jour C : l'écart résiduel** — tranché par la mesure : la formule conversion
   prétendait ~32 500 €/an que le réalisé dément (±0 sur les 9 jours mesurés).
4. **REMPLACÉE par l'amendement 6** (coût du jour au coin, bascule automatique à la récurrence).

## AMENDEMENTS DU 01/08 SOIR (feedback owner sur le proto v1)

1. **Le nombre n'apparaît qu'UNE fois — au coin.** Les titres structurels
   (`structuralCardCopyFr`) embarquaient le montant (hérité de la ligne compacte, qui n'avait
   pas de coin) : en carte pleine, titre = le SIGNAL, phrase = l'explication + le geste,
   coin = le seul nombre.
2. **La fenêtre de mesure passe en infobulle** (« Mesuré sur N j / M mois — estimé… ») — sur le
   sous-libellé du coin, déjà en pointillé-survol. Provenance à un survol, jamais dans la ligne
   d'explication.
3. **Les titres affirment le fait mesuré** en langue d'exploitant — rejoint le verdict C de
   l'audit sur `audience_shift_opportunity` (« la copie n'affirme rien ») : sa re-promotion se
   fait AVEC cette réécriture.
4. **Tourisme étranger : le € viendra de la MESURE, jamais de l'arithmétique** (43 % × taux de
   captage supposé = % fabriqué, interdit). Chantier : classe de jours « fort chevauchement de
   vacances étrangères » (les données quotidiennes existent), les portes décident. D'ici là,
   absence honnête.
5. **Scission de la porte de matérialité** (réconcilie le 29/07 « −274 €/an irrelevant » et le
   01/08 « affiche, je décide ») : la matérialité continue de GOUVERNER les cartes structurelles
   (un motif négligeable n'a pas à exister comme chantier) ; les coins des cartes
   d'anomalie/conjonction affichent leur VRAI nombre, même petit, sans éditorialiser — la
   petitesse EST l'information. Effet assumé : les petits montants (remises −186 €/an)
   réapparaissent sur leurs cartes.
6. **Coin des anomalies : le coût du JOUR tant que la récurrence n'existe pas.**
   « −572 € · ce jour » (unité en toutes lettres, jamais déguisée en €/an), bascule automatique
   sur « ~X €/an · au rythme constaté » dès n ≥ 5 occurrences. Supprime le coin vide-avec-raison,
   respecte l'interdit d'annualiser un jour isolé ; au tri, une journée se classe naturellement
   sous les motifs annuels.

**Règle 5 du feed (dédup même-motif : la carte datée du jour porte le motif, la structurelle
reste compacte ce jour-là) : TOUJOURS À VALIDER** — présente dans les deux protos.

## Implémentation (après arbitrage — ordre prévu)

1. Registre : populations « jours de tir » par type B/C (mêmes CTE de stats log+médiane,
   flags des marts ventes comme condition d'appartenance), store + portes existantes.
2. Résolution : `enjeuForCandidate` sert la population PROPRE pour B/C ; l'héritage
   « Motif de fond » devient un champ séparé (`context_motif`) que le client rend en texte.
3. Rendu pulse : coin ← valeur propre ; ligne de contexte ← motif ; libellés arbitrés.
4. Bonnes pratiques branchées sur `traffic_not_converting` en hausse de trafic.
Chaque étape avec avant/après harnais sur les comptes réels, comme le 01/08.
