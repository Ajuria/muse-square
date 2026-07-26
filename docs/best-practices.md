# « Vos bonnes pratiques » — base de connaissance du lieu (validé 26/07)

Proto validé : `public/methode-proto.html`. Doctrine owner : le nom vend la FIN (un actif du
lieu qui grandit), jamais le moyen ; on ne force JAMAIS une explication (pas de champ
obligatoire, deux sorties honnêtes sans écriture) ; branchement sur la NATURE de la carte
(opportunité), jamais sur la couleur du montant.

## Audit BigQuery (26/07 — fait AVANT le DDL, demande owner)

| Candidat existant | Verdict |
|---|---|
| `analytics.best_in_class_plays` | Références EXTERNES crawlées (industry_code, source_url, pas de location/auteur) — autre concept (« références du secteur »), pas de collision de nom. Son vocabulaire `lever` (conversion/panier/yield/frequentation/fidelisation) + `leverForActionType()` (bestInClassStore.ts) est RÉUTILISÉ comme levier-résultat dérivé. |
| `analytics.action_commitments` | Grain objectif+fenêtre ; les colonnes retro (`retro_worked`/`retro_change`/`retro_repeat`) capturent la connaissance À LA RÉSOLUTION. Une pratique sans objectif n'y a pas sa place (cron de résolution, track-record) — mais les engagements résolus `verdict='met'` SONT des pratiques prouvées : la lecture les UNIONNE. |
| → `analytics.best_practices` | NOUVELLE table app-write (motif actionCommitments COLUMN_SPEC + CREATE IF NOT EXISTS au premier usage — zéro modèle dbt en v1, conforme « s'il manque des modèles, après »). Créée en prod le 26/07. |

## Modèle

`analytics.best_practices` : practice_id, user_id, location_id, created_at, author_person_name,
origin_card_instance_id, origin_action_type, origin_driver, origin_affected_date,
kpi, outcome_lever, means_lever, day_class_key, practice_text, replay_commitment_id, status.

- `kpi` = `kpiKeyForOrigin(type, driver)` ; `outcome_lever` = `leverForActionType(type)` ;
  `day_class_key` = `enjeu.class_key` serveur — tous DÉRIVÉS, jamais demandés.
- `means_lever` (offre|staffing|communication|prix|accueil|autre) = la SEULE saisie taxonomique.
- **Tier calculé à la lecture, jamais stocké** : « prouvée » si `replay_commitment_id` →
  commitment `verdict='met'` (JOIN), sinon « déclarée ». Aucun cron de promotion.
- La lecture (`listMatchedPractices`) UNIONNE les engagements résolus 'met' du lieu
  (texte = retro_worked sinon committed_action_text ; `measured_metric` NULL coalescé →
  'revenue_residual' — l'historique pré-colonne KPI mesurait tous le résiduel CA).
- Appariement : même lieu, même `kpi`, et (`outcome_lever` égal OU `day_class_key` égal).

## Flux

1. Carte OPPORTUNITÉ → menu « M'engager » (`data-agir-positive`) → `MSBpForm`
   (public/bp-form.js) : pistes tirées du driver, texte libre, levier-moyen, auteur (roster).
   Sorties « c'était le contexte » / « je ne peux pas l'expliquer » = première classe, rien
   n'entre en base (événements `bp_context_exit`/`bp_unexplained_exit` via analytics/track).
2. « Ajouter + m'engager à la rejouer » → MSCommitForm prérempli (action = pratique, 7 j) →
   POST /api/commitments → PATCH /api/best-practices lie `replay_commitment_id`.
3. Carte NÉGATIVE affiliée → MSCommitForm self-fetch GET /api/best-practices → rangées
   « Vos bonnes pratiques » AU-DESSUS des suggestions génériques, signées/datées avec tier.

## Preuves (26/07)

- SQL exact de `listMatchedPractices` rejoué via bq : pratique déclarée retrouvée sur
  f10c3e58 (ligne test insérée puis SUPPRIMÉE — pas de fausse connaissance en base) ; branche
  union prouvée sur ff2aeb35 (le seul `verdict='met'` réel : « Relancer une offre les jours de
  forte chaleur » ressort tier « prouvée » — le coalesce measured_metric a été ajouté parce que
  ce row pré-colonne était invisible sans lui).
- `tsc --noEmit` + `node --check` (6 scripts inline pulse, bp-form.js, commit-form.js) propres ;
  bloc cardsHtml réel exécuté en Node : `data-agir-positive` posé sur la carte opportunité
  seulement ; buildHtml MSBpForm porte titre/sorties/chaîne/leviers attendus.
- E2E UI authentifié = passage owner (formulaire sur carte positive réelle, POST, remontée).

## Étape 2 (notée, pas construite)

Remontée PROACTIVE sur jours comparables À VENIR (registre de classes → « demain = vacances,
rejouez X ») — même table, aucun schéma à changer. Multi-sites : lecture compte (site d'abord,
sinon compte). La carte `proven_action_replication` (corrélation des actions PUBLIÉES, mesure
auto) reste complémentaire — jamais fusionnée avec les pratiques déclarées.
