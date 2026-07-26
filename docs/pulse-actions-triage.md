# Pulse — triage des actions par site (doctrine + implémentation)

> **Statut : VALIDÉ owner 26/07/2026** (proto interactif `public/actions-triage-proto.html`, itéré
> depuis sa proposition — la version « page Chantiers séparée » a été REJETÉE comme trop compliquée).
> Objet de ce doc : permettre à un futur chat de comprendre POURQUOI la page est ainsi, pas
> seulement comment. Code : `pulse.astro` (buildTriageLayout + renderStructuralSection),
> `lib/dayClassRegistry.ts` (enjeuForCandidate — héritage), `api/insight/monitor.ts` (payload).
> Docs liés : `kpi-enjeu-mapping.md` (quels sous-types ont un enjeu), `enjeu-day-class-registry.md`
> (comment l'enjeu est mesuré).

## La doctrine (décisions owner, 26/07)

1. **UNE page qui centralise l'action** — pas de page « Chantiers » séparée. Le but de Pulse est de
   prendre des décisions, tout ce qui est actionnable vit ici.
2. **Blocs PAR SITE** — un site = un P&L, une équipe, un responsable. Les chips site ne suffisent
   pas. Dans chaque bloc : le contextuel d'abord (le quotidien), puis « Chantiers structurels » en
   format COMPACT (une ligne : titre chiffré + pool + pill + M'engager).
3. **L'Enjeu est une MAGNITUDE, l'urgence une FENÊTRE** — deux axes orthogonaux, jamais confondus.
   L'orage d'aujourd'hui pèse 200 € mais expire ce soir ; le motif à 28 k€/an peut attendre lundi.
   **Tri par défaut : horizon (aujourd'hui → semaine → structurel) puis |enjeu| décroissant.**
4. **Pli (« Voir N autres »)** : 3 cartes contextuelles + 2 chantiers visibles par site. La
   discipline d'exécution vient du pli, pas de la suppression.
5. **Filtres : TROIS, pas plus** (le « too complicated » de l'owner s'applique aussi aux filtres) :
   Horizon / Nature (à défendre · à capter) / Trier par enjeu. **Filtrer déplie tout** (filtrer =
   vouloir toute la tranche) — choix arbitré au proto.
6. **L'Enjeu est un critère de RANG, jamais d'EXISTENCE.** Critère d'existence d'une carte d'action
   = actionnable + KPI mesurable (les informationnelles sont démues au Fil — DEMOTED_TO_FEED).
   Une carte mesurable mais pas encore mesurée (compte jeune, gates non passés) RESTE, sous le pli :
   l'absence d'enjeu est un état de maturité des données, pas une nature de la carte. Cas d'école :
   Les Olivades — exiger l'enjeu pour exister viderait le feed du compte qu'on onboarde.
7. **« Motif de fond » (héritage)** : une carte d'ANOMALIE ventes n'annualise JAMAIS son écart
   (circularité) mais hérite de la classe de son JOUR (météo/calendrier de la date affectée, la
   plus lourde en |€/an|). Preuve réelle : « CA supérieur à vos jeudis » (bon jour) porte
   « Motif de fond ~12 016 €/an · vacances scolaires » AMBRE — le bon jour est l'exception d'un
   motif globalement perdant, et c'est l'insight. Une pill ambre sur une carte opportunité n'est
   pas une contradiction.

## Vocabulaire des CTA (décision owner 26/07 soir — UN concept = UN mot)

- **« M'engager »** est LE mot du concept d'engagement, partout : item du menu Agir des cartes
  contextuelles ET bouton direct des cartes structurelles. Dans les deux cas il ouvre DIRECTEMENT
  le formulaire complet (MSCommitForm inline : méthode = 3 recommandations adaptées à la carte +
  champ libre, objectif % ⇄ €/jour ancré sur le bruit réel du site, fenêtre, responsable).
- **« Analyser et agir » est SUPPRIMÉ du menu** : l'item dupliquait un chemin qui existe déjà —
  le clic sur le corps de la carte ouvre l'analyse (`data-consult-open`) ; le bouton « Voir → »
  des cartes non-action garde son chemin consult propre.
- Correction d'une justification antérieure FAUTIVE (la mienne) : l'asymétrie « la structurelle
  n'a pas besoin d'analyse car l'analyse est déjà faite » présumait du comportement de
  l'utilisateur sans données — un utilisateur peut vouloir creuser DAVANTAGE avant un engagement
  durable. La vraie règle est vocabulaire : même concept, même mot ; l'analyse est accessible
  par la carte elle-même, pas par un item de menu.

## Implémentation (chemin de données)

- **Serveur** : `monitor.ts` → chaque candidate porte `enjeu: DayClassImpact|null`
  (`enjeuForCandidate` : mapping type→classe, résolution par date, héritage anomalies avec
  `inherited: true`) + la réponse porte `day_class_impacts` (motifs du site + copy
  `structuralCardCopyFr`). Multi-sites : merge côté pulse avec `location_label`.
- **Client** (`pulse.astro`, un seul script inline) :
  - le builder de cartes tagge chaque carte : `data-t-site`, `data-t-h` (0/1/2 ; 3 = structurel),
    `data-t-e` (|€/an|), `data-t-n` (defend/capture/none) ;
  - l'assemblage émet un mount `#pls-triage` AVANT les cartes plates (dégradation gracieuse : si le
    JS échoue, la liste plate reste) ;
  - `buildTriageLayout()` (appelé en tête de `wireBriefHandlers`, donc à CHAQUE rendu du brief)
    construit la barre de filtres + les blocs par site, DÉPLACE les cartes dans leur bloc, trie,
    plie, rend les lignes chantiers (`_structRowHtml`), câble M'engager (MSCommitForm, origins
    `structural_<class_key>`) et les filtres ;
  - `renderStructuralSection()` (nom historique, appelé par `renderEngagements` et l'onDone des
    commits) ne fait plus que RE-RENDRE les lignes chantiers pour rafraîchir l'état
    Actif → « En amélioration → <porteur> » quand les engagements arrivent/changent.
- **Pill** (`buildMetricsStrip`) : `enj.inherited` → étiquette « Motif de fond » + classe en
  suffixe ; sinon Enjeu (ambre) / À capter (verte).

## Raisons d'absence — LIVRÉES (26/07 soir)

`enjeuWithReasonForCandidate` (dayClassRegistry) = la façade des endpoints : `{enjeu, reason_fr}`.
Trois raisons nommées (`ABSENCE_REASON_FR`) : anomalie ponctuelle / pas d'historique de ventes /
motif non séparable. **Silence VOULU** pour les absences par design (composites, démues) — pas de
raison affichée. Rendu : micro-texte gris dans la strip (pulse `buildMetricsStrip`) et sous les
pills de monitor.astro (qui gagne au passage la pill Enjeu/Motif de fond — parité des surfaces).
CORRECTION de doc : `days.ts` n'a AUCUN consommateur client (l'ancienne note « insight page » du
data-path est périmée — insight.astro fetch monitor.ts) ; la « 2e surface » réelle est monitor.astro.

## Historique des motifs — LIVRÉ (préalable de « Résolu », 26/07 soir)

Le cron nightly archive chaque batch dans `analytics.day_class_impacts_history` (append idempotent
par batch_date, partitionné, schéma explicite). Sans cette archive, aucun motif ne pouvait jamais
être constaté « disparu ». L'UI « Résolu » viendra quand l'historique aura des semaines de
profondeur : Résolu = motif présent avant, absent des gates maintenant, avec engagement résolu.

## Différé, assumé (à reprendre plus tard)

- **État « Résolu »** (UI) : l'archive tourne — attendre la profondeur d'historique.
- Verdict par KPI (variances à établir), barreau 3 (VIF).

## Preuves E2E (26/07)

- Héritage : `sales_surge` du 2026-08-27 (jeudi de vacances, MS Test) →
  `{class_key: school_holiday, eur_year: −12 016, inherited: true}`.
- Payload structurel Occitanie : 4 motifs, copy conforme au proto validé.
- `node --check` sur les 6 scripts inline + `tsc` propres. Rendu visuel + clics = passage owner.

## Restyle des cartes R1-R6 — LIVRÉ sur pulse UNIQUEMENT (26/07 soir)

Validé sur `public/cards-restyle-proto.html` (avant/après). **Pas de parité monitor.astro —
décision owner 26/07 : monitor est une page différente, elle garde son rendu.** Tout est dans le
bâtisseur inline de `pulse.astro` (cardsHtml + buildMetricsStrip + `_structRowHtml`).

- **R1 chiffre d'abord** : l'Enjeu €/an quitte la strip du bas et devient un bloc `.amt` à droite
  du titre (16 px, gras). Pas de mesure → pas de bloc (raison d'absence inchangée dans la strip).
- **R2 barre sémantique** : `border-left` de `.ab-card` prend la couleur du signal (rouge
  `#e24b4a` menace / ambre `#ef9f27` vigilance / vert `#059669` opportunité / gris neutre —
  les couleurs `.ab-bar` historiques). La chip catégorie devient sobre : sans emoji, sans
  MAJUSCULES (title-case générique de `category_label_fr`). La chip confiance (Probable /
  À confirmer) est CONSERVÉE — le proto ne la montrait pas mais sa note disait « toutes les
  pills conservées » ; la retirer serait un retrait de comportement approuvé.
- **R3 deux rangées** : « Action menée ? » + Déjà fait / Pas pour moi fusionnés DANS la strip
  (span portant les mêmes `data-ab-dispo-*` ; le handler passe par
  `closest('[data-ab-dispo-row]')`, inchangé). Le rang `.disc` séparé des cartes action est
  supprimé (les cartes engagement gardent le leur).
- **R4** : `.aline` passe en gras (600).
- **R5/R6 montant honnête et lisible** : plus AUCUN « ~ » (« estimé » porte la prudence) — y
  compris « habituel ~X € » des cartes engagement et la ligne structurelle. Libellé invariant
  deux mots sous le montant : « Enjeu · estimé/mesuré », « Motif de fond · estimé » si hérité.
  « cause multifactorielle », la classe héritée et le SENS DE LA COULEUR (vert = € encaissés en
  plus, à capter ; ambre = € perdus, à défendre — indépendant de la barre) passent en infobulle
  `title` sur `.amt` (pointillé discret). La ligne structurelle garde « cause multifactorielle »
  en toutes lettres (elle a la place) et son montant devient texte coloré nu (plus de pill).

Preuve (26/07 soir) : bloc cardsHtml RÉEL extrait du fichier et exécuté en Node sur 4 formes
d'enjeu (positif simple / hérité+mêlé / mesuré négatif / absent) — zéro « ~ », 3 blocs `.amt`,
0 rang `.disc`, 3 spans dispo ; HTML injecté dans une harness avec le CSS réel de pulse,
screenshots conformes au proto. `node --check` propre sur les 6 scripts inline. Le test a
attrapé un vrai bug (préfixe « jours » mal strippé → « de vacances scolaires » dans l'infobulle),
corrigé avant livraison. E2E authentifié = passage owner.
