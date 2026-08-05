# Automatisation — consigne d'opération (spec, 05/08/2026 — maquette validée owner, GO cas 2)

Chantier « améliorer l'automatisation », concept owner : **automatiser l'exécution vers les
gens** (équipe, participants), pas le routage de signaux. Maquette validée :
`public/automatisation-proto.html` (artifact du 05/08). Deux cas, un même objet :

- **La consigne d'opération** — ce que les gens doivent savoir/faire, structurée, attachée à
  une série d'événements (cas 2) ou à un dispositif (cas 1). Distribuable par email/Slack ;
  les destinataires externes n'ont JAMAIS accès à l'app (Clerk) → **le message est
  auto-suffisant** (tout dans le corps, aucun lien nécessitant une connexion).
- **Cas 2 (EN COURS — GO 05/08)** : déclencheur = l'occurrence. À J-offset de chaque
  occurrence, la consigne part seule aux participants de CETTE occurrence + au responsable.
  Greffée sur le passage quotidien du cron `event-occurrences` (fenêtre [J, J+7]).
- **Cas 1 (APRÈS cas 2)** : déclencheur = le signal d'origine du dispositif
  (`origin_action_type`). « Armer sur signal » sur la fiche dispositif. Chaque déclenchement
  envoie la consigne + arme un engagement mesuré (réglages du rejeu) → les verdicts cumulent
  vers « prouvé » (n≥5). Le détecteur « début d'épisode » (ex. chaleur niveau ≥ 3, premier
  jour) est LE seul moteur neuf. Garde-fous : 1 déclenchement max / 7 j (sans la limite, le
  signal chaleur aurait tiré 18×/mois sur le café) ; la consigne ne convoque personne
  (délai de prévenance) — achats et équipe déjà planifiée seulement.

## Décisions owner (05/08, via maquette)

1. **Aucune porte de preuve** : cas 2 sans condition ; cas 1 armable dès « déclaré » — le
   statut de preuve s'affiche, il n'interdit rien (l'automatisation accélère la preuve).
2. **Définition sur l'objet, jamais de page dédiée** : dossier de série (cas 2), fiche
   dispositif (cas 1). Le volet « Automatisation » du tableau = supervision seule (traces,
   Désactiver) — on n'y définit rien.
3. **Champs de la consigne (cas 2)** : présence & déroulé (horaires de série + arrivée
   participants) · objectif de l'occurrence (la cible de la série, affichée, jamais saisie
   deux fois) · le dispositif (description existante) · à savoir sur la boutique ·
   interactions clients. Envoi par défaut **J-2** (choix J-1/J-2/J-3).
4. **Participants par occurrence** : contacts externes possibles (producteur…), nom +
   email/mobile, RGPD : conservés pour l'envoi des consignes uniquement, supprimables.
   Sans participant, la consigne part au responsable seul.
5. **Labels tranchés** : « Consigne d'opération », « Armer sur signal », « Portée :
   Prévenir seulement / Prévenir, geste prêt », **« Désactiver »** (symétrique du
   « Activer → » du volet — « Couper » rejeté). « Prévenir, geste prêt » = le message porte
   le travail préparé (brouillon Communiquer pré-rempli pour un destinataire app ; contenu
   prêt DANS le message pour un externe).
6. **Canaux v1** : email (Resend, rail `channels/internalSend.ts`) pour tous ; Slack en plus
   pour l'interne. SMS/WhatsApp = plus tard (contacts déjà stockés côté roster).
7. **Trace obligatoire (zéro dummy)** : chaque envoi écrit `analytics.consigne_sends` —
   « Envoyée le X à N destinataires » est un fait vérifiable ; l'idempotence de l'envoi se
   fonde sur cette trace (une occurrence = un envoi max).

## Modèle de données (incrément 1 — DDL exécuté et vérifié 05/08)

- `raw.saved_items` (ALTER additif) : `consigne_arrival STRING`, `consigne_store_info STRING`,
  `consigne_interactions STRING`, `consigne_send_offset INT64` (défaut applicatif 2),
  `consigne_enabled BOOL`.
- `raw.saved_item_participants` (nouvelle, journal streaming latest-wins par `participant_id`,
  patron automation_rules) : participant_id, saved_item_id, location_id, clerk_user_id,
  `date` (l'occurrence), participant_name, contact, deleted, created_at, updated_at.
- `analytics.consigne_sends` (nouvelle, append-only) : send_id, saved_item_id, location_id,
  occurrence_date, send_offset, channel, recipients, n_recipients, sent_at.

## Séquencement (un incrément = un commit vérifié)

1. **Modèle** (FAIT 05/08) : DDL ci-dessus + allowlist catalogue.
2. **API** : saved-items create/update acceptent `consigne_*` ; capacité participants
   (journal GET/POST/DELETE) ; module-index même commit.
3. **UI dossier** : bloc « Consigne d'opération » dans renderDossier (evenement.astro) —
   ADDITIF, rien retiré ; participants par occurrence ; Désactiver.
4. **Envoi** : greffe sur `cron/event-occurrences` — occurrence à J-offset × consigne_enabled
   × pas de trace → email auto-suffisant (internalSend) + trace. Rejeu = 0 envoi.
5. **Supervision** : lecture ajoutée DANS le lot parallèle de `insight/dashboard` (consignes
   actives, prochain envoi, dernière trace) + Désactiver.

Jalon réel : série Corner (56f47021…, hebdo samedi 9 h–13 h, 8 occurrences 08/08→26/09) —
première fenêtre d'envoi réelle : occurrence du 15/08, envoi J-2 jeudi 13/08.

## Périmètre connexe acté (05/08)

- P0a : brancher `/api/cron/bilan` dans cron-job.org (côté owner, après vérification par tir).
- P0b : reco = retirer `daily.ts` (couvert par Point du jour + alerts + cycle événement) —
  décision owner en attente, code intouché d'ici là.
- Routage générique des 73 sous-types (ex-P2) : ABANDONNÉ comme chantier propre — seul le
  morceau consommé par le cas 1 (router UN sous-type vers des gens) survivra.
- Déclenchement conditionnel générique : toujours PAS construit, jamais promis à l'écran.
