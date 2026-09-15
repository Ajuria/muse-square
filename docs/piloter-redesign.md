# Le Tableau de bord (Piloter) — ce que la page EST — DÉFINITIF

_Réécrit le 27/08/2026 depuis `piloter-redesign-spec.md` (arbitrages owner du 24/08, issus de
l'exploration /design « Piloter — trois pistes »). La spec disait ce qu'il fallait construire ;
ce document dit ce que la page rend — chaque affirmation re-vérifiée dans `tableau.astro` et
`dashboard.ts` à la réécriture. Les MOTS font loi dans `docs/lexique.md`. **Deux instructions
de la spec ne sont PAS appliquées : elles sont nommées en fin de document, et elles seules.**_

## Ordre de page

KPI (héros) → À faire → Opérations en cours → Processus métiers → **Mon environnement**.

La grammaire **grille de cartes-résumé + volet dans le panneau partagé** est un invariant :
l'engagement s'ajoute DANS un volet, jamais en remplacement d'un mécanisme arbitré.

## Héros — deux rangées sans étiquettes

La séparation est purement visuelle (taille, blanc vs fond doux, vert vs encre) ; aucun mot ne
nomme les rangées, le public étant institutionnel.

**Rangée 1, la santé** — que des mesures qui existent, jamais un choix à faire ni un déblocage
(ces gestes-là vivent dans « À faire », seul endroit des to-dos). Elle porte la carte CA pleine
largeur : le chiffre, le % vs votre résultat habituel, la mini-courbe du CA quotidien sur la
période choisie (une série `ca_daily`), le comparatif N-1 en **absence honnête datée**
(`tableau.astro` l. 501-511 : « vs <mois> <année−1> : disponible à partir de <mois> <année>
(12 mois de ventes requis) ») et le CTA « Générer un rapport → » en lien profond vers Consulter,
période pré-remplie. Il n'y a jamais de « vs 30 j précédents » : ce serait un troisième
référentiel, et une comparaison de saisons.

**Rangée 2, le pilotage** — tuiles en retrait, chiffres encre : Impact mesuré · **Prochain
verdict** · Signaux traités · Connaissances créées. La tuile « Objectifs atteints » n'existe
plus : elle insistait sur un négatif qui relève du CALIBRAGE, pas de la performance (owner
24/08 au soir). Le mot ne survit que dans une infobulle de ligne (« atteints k/n »).

## La pastille d'un pôle — ce qu'elle dit (arbitrage owner 15/09)

Une pastille de « Vos pôles » répond à **deux questions, à deux endroits** :

| où | quoi |
|---|---|
| à côté du nom | **« ça monte ou ça descend ? »** — l'écart du pôle sur 30 j, en POURCENTAGE |
| le grand chiffre | **« lequel dois-je ouvrir ? »** — le CA **par mètre linéaire** |
| deux lignes | la part du linéaire, puis la part de la marge — **chacune sur SA ligne** |

**Le grand chiffre est le CA par mètre, pas le CA ni l'écart.** C'est lui qui classe les pôles (65 →
491 € sur le compte de test, un facteur 7,5) ; un pourcentage en tête effacerait la grandeur — +50 %
sur 65 €/m et +50 % sur 491 €/m ne sont pas le même événement.

**L'unité se NOMME : « par mètre linéaire ».** `revenue_per_m` est le CA par mètre linéaire de façade
(en-tête de `fct_client_space_30d` : « KPI 5 par mètre linéaire, KPI 12 par m² ») — et la page disait
« par mètre » juste à côté de « par m² ». Le mot est celui du lexique (owner 03/09).

**La tendance est en POURCENTAGE, jamais en « points »** (owner : « we don't use points in UI anywhere
else »). Une variante « écart face au magasin », en points, a été écrite puis écartée pour cette
raison : une surface n'introduit pas une unité pour une seule pastille. Ce qu'elle apportait reste
vrai et non rendu — sur le compte de test, le magasin monte de 43,9 % et les sept pôles le suivent,
donc les sept tendances sont vertes alors que trois décrochent.

**Ce qui QUITTE la pastille** : responsable, opérations rattachées, dernier « Fait le », part du CA.
Tout cela est DANS LE VOLET, à un toucher, et le volet s'ouvre sous sa propre rangée depuis le 14/09.
**Ce qui reste** : le nom du site (identité, en multi-site) et « Pôle en projet » (une absence de
vente n'est pas du bruit). **Sans mesure d'espace, la pastille garde sa forme d'avant** — CA sur 30 j
et mètres — plutôt qu'un tiret.

Rendu prouvé par `npm run harness:tableau-espace` sur le payload RÉEL du compte : 7 pôles sur 7 disent
« par mètre linéaire », la tendance porte un pourcentage, les deux lignes existent séparément. Trois
mutations vues rouges (tendance retirée, marge privée de sa ligne, unité redevenue ambiguë).

## Multi-site

Deux segments en tête de page — **site** (« Tous les sites · par site ») et **période**
(30 j · 90 j · 12 mois) — filtrent toute la page. La répartition par site reste visible sous
chaque chiffre du héros, dans un ordre FIXE : c'est de l'attribution, jamais un classement.
La période filtre l'affichage et **jamais un recalcul** — un prouvé ne se « déprouve » pas
parce qu'il sort de la fenêtre.

## Cartes d'opération

Le gabarit de la zone explication vit dans `docs/lexique.md`. Les décisions de données :

- Le **€ est la ligne commune** de toute carte ; le **KPI déclaré est la ligne de contrat** —
  un verdict ne se re-juge jamais sur un autre KPI que celui engagé.
- **Deux référentiels contradictoires coexistent en base**, et ce n'est pas un bug à corriger
  mais une distinction à tenir : `fct_client_sales_signals_daily.*_baseline` est une moyenne
  glissante 28 j tous jours confondus, quand `fct_client_day_residual.expected_revenue` est
  dow+tendance — LE résultat habituel arbitré. En période de croissance elles se contredisent
  (des facteurs « + » quand l'habituel dit « − »). Le `kpi_baseline` stocké sur l'engagement
  est le référentiel sûr. Prouvé sur la fenêtre du Coupon, 03-09/08, Occitanie.
- Une occurrence passée sans engagement vivant se dit « **passée sans mesure** ». Le cron
  ré-arme une occurrence annulée tant que le jour n'est pas passé, sauf « Arrêter »
  (`event-occurrences.ts`).

## Volet Opportunités

Le volet garde la PROSPECTIVE — jour chaud annoncé, couverture « N/M couverts par une action »
— et renvoie « les cartes des 7 prochains jours → Agir ». Un objet, une maison : les rangées de
cartes système ne vivent pas dans ce volet.

## Garde-fous — non négociables

- **Aucune métrique brute sans son verdict.** Pas de courbe de CA « pour info » : ce serait
  entrer dans le segment disputé des dashboards de caisse.
- **Jamais extrapolé** : l'Impact € est la somme des écarts mesurés des fenêtres engagées jugées.
- **Deux registres** : « jugées » = tous les verdicts mesurables du journal ; « € » = le mart
  seul. Un verdict `confounded` est NON MESURABLE — hors €, hors tenue, compté à part.
- **Zéro dummy content** : tout compte affiché est calculé ; toute suggestion « À activer »
  correspond à un interrupteur réellement éteint, vérifié en base. Une ligne déjà activée
  disparaît.
- **Multi-sites par défaut** — le mono-site cachait 2 opérations sur 3. Pastille de site par
  ligne, `?location_id=` en filtre optionnel.

## Contrats de données adossés

- **« Fait par défaut » (owner 05/08)** : la date de fin CLÔT l'opération, l'action compte
  menée. Gestes d'exception sur la carte Pulse : « Fait » (exécution finie en avance — n'écourte
  JAMAIS la fenêtre de mesure, garde anti p-hacking) et « Pas menée » (valeur legacy
  `pas_encore`, exclue des €). Mart `fct_client_commitment_outcomes` :
  `coalesce(action_done_status,'') != 'pas_encore'`.
- **Tiebreak canonique du dernier état** (10 surfaces app + 2 modèles dbt) :
  `updated_at DESC, terminal (resolved/cancelled) DESC, verdict non-null DESC, created_at DESC`.
  Deux transitions au même timestamp rendaient un engagement « open » côté app et « resolved »
  côté mart — c'était le double comptage du track record.
- **Fiches dispositifs : « Prouver · Automatiser »** — Prouver = un rejeu mesuré ; Automatiser =
  série récurrente via formulaire pré-rempli. Le déclenchement CONDITIONNEL (« quand la canicule
  est annoncée ») n'est PAS construit : ne jamais le promettre.
- **« Retour »** (dossier, dispositif) = point de départ : `history.back()` si référent app,
  repli `/tableau`.

## Le nettoyage préalable est fait

L'audit de code mort du 24/08 est appliqué : les huit items nommés de `tableau.astro` ont
disparu (`veilleOk`, `covSub`, `nTrouvailles`, `veilleCassee`, `#tb-mg`, `goal_fr`,
`practices_proven`, `.tb-rv`), la collision d'id de volet `"co"` n'existe plus (une seule
carte-porte le porte, « Mon positionnement »), et `tools/build/strip-protos.mjs` purge protos et
harnais de l'artefact de build. Les protos et harnais de la famille tableau restent de
l'outillage VIVANT — seul `radar-proto.html` est orphelin.

---

## Ce qui n'est PAS appliqué — deux items, et seulement deux

1. **Le garde-fou de création d'engagement** : si le texte de l'action parle de CA et que le KPI
   choisi n'est pas le CA, rien ne le signale. Cas réel : le Coupon voulait le CA et mesure la
   conversion. Vérifié le 27/08 — aucune trace du contrôle dans `commit-form.js`,
   `event-form.js` ni côté API.
2. **La grammaire CTA reste à ratifier en bloc** : verbe infinitif + → pour l'ACTION, nom du
   lieu + → pour la NAVIGATION (deux lieux : Dossier →, Agir →), cible ≈ 12-15 libellés pour
   ~8 destinations. La file du lexique porte encore le duo non tranché « Voir → » vs « Lire → »
   (deux mots en prod pour ouvrir une carte, un seul doit rester).
