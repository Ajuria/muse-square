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

## Différé, assumé (à reprendre plus tard)

- **Raisons d'absence par carte** (le proto les montrait dans le sowhat : « anomalie ponctuelle »,
  « site sans historique », « non séparable ») — non implémentées carte par carte ; seule la logique
  de rang les traite. À faire proprement via un champ serveur `enjeu_absence_reason`.
- **État « Résolu »** des chantiers : exige l'historique des motifs disparus (le store est un
  snapshot) — palier suivant.
- Verdict par KPI (variances à établir), pills sur la page insight (`days.ts`), barreau 3 (VIF).

## Preuves E2E (26/07)

- Héritage : `sales_surge` du 2026-08-27 (jeudi de vacances, MS Test) →
  `{class_key: school_holiday, eur_year: −12 016, inherited: true}`.
- Payload structurel Occitanie : 4 motifs, copy conforme au proto validé.
- `node --check` sur les 6 scripts inline + `tsc` propres. Rendu visuel + clics = passage owner.
