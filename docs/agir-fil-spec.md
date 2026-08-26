# Agir — le fil de cartes (spec du chantier, maquette validée 14/08) — SPEC DE TRAVAIL

> **Statut : maquette `public/agir-proto.html` VALIDÉE owner 14/08** (itérée ~10 tours sur les
> 13 cartes réelles du compte owner — corps générés par le VRAI `action-cards.js` exécuté au
> harnais `scripts/agir-proto-harness.ts`). Build par incréments ; ce doc est la cible.
> Grande image : **Piloter = l'état** (héros, radar, carte, veille) · **Agir = l'action**
> (vos engagements, cartes du jour triées par €, chantiers structurels).

## Décisions owner (14/08) — toutes actées dans la maquette

1. **Le radar quitte Agir** (3 volets → dissous dans Piloter V7) ; **le score /10 est RETIRÉ**
   (agrégat qui cache ses composantes — même famille que le « 4/5 » retiré de Piloter ;
   la boussole de priorité de la page est LA COLONNE €, l'état vit sur Piloter).
2. **En-tête** : « Vos actions du jour » (owner 25/08 — ex « Vos cartes du jour », banni) + date + aléa EN MOTS + chip Objectif de la semaine
   (existant) + lien « Piloter → ». Filtres = LES TROIS du triage (26/07) :
   Aujourd'hui/Semaine/Structurel · À défendre/À capter · Trier par enjeu.
3. **Trois sections, trois grains** : « Vos engagements » (cartes utilisateur, grain propre,
   EN PREMIER) · « Actions du jour » (cartes système) · « Chantiers structurels » (format
   compact du triage : titre chiffré + pool + pill + M'engager).
4. **UNE grammaire de rangée** (7 vols ex-Twitter adaptés) : filet 1 px (fini les boîtes),
   médaillon-avatar 30 px par famille (SVG inline, anneau ambre si urgent), titre cliquable
   (= Consulter la source), pastilles date (site seulement si ≠ page), corps ≤ 2 phrases
   respirant (interligne 1,65, max 58ch), provenance atténuée (« estimé sur vos 17 jours … ·
   jamais extrapolé »), **colonne € permanente à droite** (19 px tabulaire sur pastille
   teintée + mini-phrase « à gagner »/« à défendre » ; « pas encore chiffré · mûrit avec
   l'historique » sinon ; tri = |€| décroissant, info sans € possible sous « aussi
   aujourd'hui »).
5. **Grammaire des CTA — le menu Agir ▾ MEURT** (révision du menu unique 03/08, validée
   owner 14/08) : Consulter la source = clic sur le TITRE ; rangée de pied pleine largeur :
   disposition à GAUCHE (« Action menée ? Oui · Pas encore » — engagements SEULEMENT, c'est
   la disposition d'un engagement, jamais d'une carte système) ; à DROITE : « Écarter »
   (tertiaire gris clair, cartes système — état `écarté` existant) · « Communiquer » (gris) ·
   **le geste en bleu 650 tout à droite**, liste FERMÉE existante :
   M'engager (cartes du jour + structurels) · Documenter (verdict tenu) · Ajuster (en cours) ·
   Répondre (carte-question) · Enrichir (bonne pratique). Flèches réservées aux navigations.
6. **Couleur de possession** (Phase 2 du cycle système/utilisateur) : rangée UTILISATEUR
   (engagement, carte-question) = fond bleu très pâle #F7F9FF + liseré gauche bleu 2 px.
   Bleu = « à vous / on vous attend » ; le verdict (vert/ambre) ne vit QUE dans chips,
   médaillons, colonne €. Une carte système engagée GAGNE le fond bleu.
7. **Grammaire du contenu chiffré** : titre = fait + objectif ANNUEL positif quand gated
   (« gagnez jusqu'à … €/an ») ; corps = coût/JOUR une fois + le geste (dispositif possédé
   si origin match, sinon « Testez un dispositif ») ; échelle de repli annuel → jour → sans
   chiffre. **Chaque chiffre UNE fois, à son étage.**
8. **Mécaniques d'engagement** : filet bleu « Nouveau depuis votre dernière visite »
   (localStorage), rangée de VICTOIRE mesurée en tête des engagements (jamais fabriquée),
   « Vous êtes à jour — N cartes ce jour. » en pied. **JAMAIS de valeur animée sur un
   montant** (2 pièges prouvés au harnais : rAF en pause = faux € figé, puis € invisible —
   fondu CSS pur, état naturel visible).

## Incréments de build

- **Inc 1 (FAIT)** : pulse.astro — hero-score retiré → en-tête cible ; bloc « Mon
  environnement » (3 volets radar) retiré de l'assemblage (hooks ops gardés contre null).
- **Inc 2** : rangées du fil (restyle du rendu .ab-card → grammaire de rangée) + colonne € +
  tri par enjeu + « aussi aujourd'hui » + « Nouveau ».
- **Inc 3** : grammaire CTA (mort du menu Agir ▾, titre = Consulter, pied disposition/gestes)
  — touche `action-cards.js` (draft_seeds/consulter_target conservés) + `pulse.astro`.
- **Inc 4** : couleur de possession + sections + chantiers structurels compacts alignés +
  suppression des renderers radar morts (renderRadarStrip, renderScoreDetail,
  renderPerfDetail, renderConcurrenceDetail…).
- **Chantier parallèle dit à l'owner** : lexique des specs de cartes (« niveau 4 »,
  « rang 2 », « Alerte alerte ») — fichier .fr + garde-fou, comme le dossier.
