# Refonte du Tableau de bord (Piloter) — spec pré-build

_Arbitrages owner du 24/08/2026, issus de l'exploration /design (canvas « Piloter — trois
pistes », artifact 5b4b0f26). Les MOTS font loi dans `docs/lexique.md` (tableau + gabarit de la
zone explication) — ce fichier porte la STRUCTURE et les décisions de données. Maquette de
référence : artboard « A v2 — Palmarès » du canvas._

## Ordre de page (acté)

KPI (héros) → À faire → Opérations en cours → Processus métiers → **Mon environnement**.
La grammaire grille de cartes-résumé + volet dans le panneau partagé est un **invariant**
(principe validé — l'engagement s'ajoute DANS les volets, ex. frise VOUS/EUX dans « Activité
dans votre périmètre » ; un ajout par volet, jamais un remplacement).

## Héros : deux rangées SANS étiquettes (public institutionnel)

Séparation purement visuelle (taille, blanc vs fond doux, vert vs encre) — jamais un mot de
rangée.

- **Rangée 1 — santé** : UNIQUEMENT des mesures qui existent — jamais un choix à faire ni un
  déblocage (leurs gestes vivent dans À faire, seul endroit des to-dos). Contenu : la carte CA
  pleine largeur — chiffre + % vs votre résultat habituel, mini-courbe du CA quotidien sur la
  période sélectionnée (`mart.fct_client_sales_signals_daily`), comparatif N-1 en ABSENCE
  HONNÊTE datée (première vente 03/04/2026 → « disponible à partir d'avril 2027 » ; JAMAIS de
  « vs 30 j précédents » — troisième référentiel + comparaison de saisons), CTA
  « Générer un rapport → » (lien profond Consulter, période pré-remplie). Le profit y entrera
  comme CHIFFRE quand les marges par famille existeront (déblocage progressif : « profit
  calculé sur X % de votre CA »).
- **Rangée 2 — pilotage** (tuiles en retrait, chiffres encre) : Impact mesuré (ce que le user
  a généré — « vs votre résultat habituel · sur N fenêtres mesurées ») · Objectifs atteints k/n
  avec le chip « Seuils trop hauts ? » (copie prod `seuilsCase`, affiché SEULEMENT si € > 0 et
  0 atteint) · Signaux traités · Connaissances créées.

## Multi-site

Deux segments en tête de page — SITE (« Tous les sites · par site ») et PÉRIODE (30 j · 90 j ·
12 mois) — qui filtrent TOUTE la page (aujourd'hui le sélecteur période ne filtre que
l'Impact : asymétrie à corriger). Répartition par site TOUJOURS visible sous chaque chiffre du
héros, ordre FIXE (attribution, jamais classement). Trou de build : `met_recipe` ne porte pas
le site dans le payload.

## Cartes d'opération : grammaire unique + zone explication

Voir `docs/lexique.md` § « Le gabarit de la zone explication » (deux régimes, gabarit verbatim
owner). Décisions de données associées :

- Le € est la LIGNE COMMUNE de toute carte ; le KPI déclaré reste la ligne de CONTRAT — le
  verdict ne se re-juge jamais sur un autre KPI que celui engagé.
- **DEUX RÉFÉRENTIELS contradictoires en base** (prouvé sur la fenêtre du Coupon, 03–09/08
  Occitanie) : `fct_client_sales_signals_daily.*_baseline` = moyenne glissante 28 j TOUS jours
  (fenêtre `w` du modèle dbt) vs `fct_client_day_residual.expected_revenue` = dow+tendance (LE
  résultat habituel arbitré). En période de croissance elles se contredisent (facteurs « + »
  quand l'habituel dit « − »). La décomposition par facteur exige des ATTENDUS PAR FACTEUR
  (passages/ventes/panier) sur LE MÊME référentiel — chantier « Attendus par facteur ».
  Le `kpi_baseline` stocké sur l'engagement est un référentiel sûr dès aujourd'hui.
- Vérifier la définition de la conversion de `kpiRegistry` (45,7 % affiché vs tx/visiteurs
  ≈ 40 % recalculé sur la fenêtre — référentiel à établir).
- Garde-fou à la création d'engagement : si le texte parle de CA et le KPI choisi n'est pas le
  CA, le signaler (cas réel : le Coupon voulait le CA, mesure la conversion).
- Occurrence passée sans engagement vivant = « passée sans mesure » (lexique) ; le cron
  ré-arme une occurrence annulée tant que le jour n'est pas passé, sauf « Arrêter » (livré,
  `event-occurrences.ts`).

## Grammaire CTA (à ratifier en bloc)

Un seul bouton PLEIN par page = le geste le plus payant. ACTION = verbe infinitif + →
(Préparer, Faire le bilan, Déclarer, Fixer, Prouver, Rejouer, Automatiser, Ajuster, Rendre le
verdict, Communiquer — jamais supprimé, cible réparée en lien profond, Configurer, Régler).
NAVIGATION = nom du lieu + →, deux lieux seulement (Dossier →, Agir →). Fusions : trio
Compte→Communication → un CTA ; duo Notifications → un ; Voir/Lire/Comparer → UN mot (à
arbitrer). Les 4 CTA qui atterrissent sur Pulse sans ancre reçoivent un LIEN PROFOND vers la
carte exacte. Cible ≈ 12-15 libellés pour ~8 destinations.

## Volet Opportunités (doublon Agir tranché)

Le volet garde la PROSPECTIVE (jour chaud annoncé + couverture « N/M couverts par une
action ») et renvoie « les cartes des 7 prochains jours → Agir » — un objet, une maison. Les
rangées de cartes système sortent du volet.

## À vérifier au build

- Périmètre de la tuile CA prod : 36 440 € (`c30.real7`, `n_jours` 21) ≠ somme brute 30 j
  (≈ 95 k€ en base) — élucider AVANT de brancher chiffre et courbe sur la même carte.
- Fonte : l'app rend Avenir LT Pro (Book 400 / Medium 500 / Heavy 700, `public/fonts/`).

## Chantiers de données préalables (chips posés le 24/08)

1. **Marge par famille produit** — déclaration par famille via l'infra métriques déclarées,
   KPI profit progressif (couverture dite).
2. **Attendus par facteur** — expected_visitors/transactions/basket sur le référentiel
   dow+tendance + statut des baselines 28 j existantes.
3. Mémoire du dispositif : coût déclaré au bilan (→ ROI), écart à l'objectif capitalisé au
   verdict (→ « seuil suggéré » au prochain engagement), fiche dispositif persistée
   (n exécutions, € cumulé, taux d'atteinte).
