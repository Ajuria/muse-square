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
- **Cas 1 (EN COURS — GO owner 05/08 après livraison cas 2)** : déclencheur = le signal
  d'origine du dispositif (`origin_action_type`). « Armer sur signal » sur la fiche dispositif.
  Chaque déclenchement envoie la consigne + arme un engagement mesuré (réglages du rejeu) →
  les verdicts cumulent vers « prouvé » (n≥5). Garde-fous : cooldown 1 déclenchement max / 7 j ;
  la consigne ne convoque personne (délai de prévenance) — achats et équipe déjà planifiée.
  **Détecteur v1 (RÉVISÉ 05/08 sur données réelles)** : « chaleur annoncée DEMAIN (lvl_heat
  ≥ 3) » + cooldown — PAS « début d'épisode » : le café montre 10 jours ≥ 3 sur les 10
  prochains (été continu) → un détecteur de début d'épisode ne tirerait quasi jamais, alors
  que le texte du dispositif dit « la veille d'une journée où la chaleur est annoncée ».
  Veille + cooldown ≈ 1 tir hebdo l'été (18 j chauds/30 mesurés). Origines couvertes v1 :
  `structural_traffic_high` + sous-types météo chaleur ; les autres origines affichent
  honnêtement « signal non détectable automatiquement (v1) ».
  **Modèle (DDL exécuté 05/08)** : `analytics.best_practices` + `arm_enabled BOOL,
  arm_recipient_name, arm_recipient_contact, arm_channel ('email' v1), arm_cooldown_days
  (défaut 7)` (état SUR la pratique — définition sur l'objet ; table DML → UPDATE sûr) ;
  `analytics.dispositif_triggers` (trigger_id, practice_id, location_id, user_id, signal_key,
  target_date, sent_at, recipients, n_recipients, commitment_id) — trace append-only en DML,
  idempotence par (practice_id, target_date) + cooldown par MAX(sent_at). L'engagement créé
  porte `origin_suppression_key = 'armed:<practice_id>:<target_date>'` (la série de verdicts
  du dispositif armé se lit par ce préfixe).

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

## Avancement (05/08 soir)

- **Cas 2 LIVRÉ** (incréments 1–6, dev) : consigne d'opération au dossier de série, participants
  série+occurrence, chips roster, effacement de champ, aline Activer, envoi J-x greffé au cron
  event-occurrences (E2E réel : email Corner parti, trace, rejeu 0), supervision au tableau.
- **Cas 1 LIVRÉ** (incréments 1–4, dev) : armement sur la pratique (PATCH arm), détecteur v1
  « chaleur annoncée demain » dans cron daily-dispatch (E2E réel coupon : email + engagement
  conversion +20 % baseline 0,43 + trace, rejeu 0, nettoyage test), UI fiche (panneau chiffres
  réels + garde-fous) + volet Automatisation. Fix latent au passage : action_log sans
  metadata/signal_type 500-ait daily-dispatch (reason porte le rule_id désormais).
- **RESTE owner** : E2E écran des deux cas ; armer le coupon depuis la fiche ; ajouter
  `/api/cron/daily-dispatch` ET `/api/cron/bilan` à cron-job.org (NB : daily-dispatch réveille
  aussi 2 règles legacy concurrence → Slack + email owner) ; merge prod sur GO ; « affiner
  les 2 » (retours d'usage) ensuite.

## Incrément 8 — les 5 lignes du jour en faits NOMMÉS + liens (LIVRÉ 05/08 — labels owner : « Le public du jour », « Activité autour de vous » ; harnais Corner 7/7)

Feedback owner : « conceptual crap » dévalorise le produit — un manager veut QUI est là,
QUELLES routes/lignes, et cliquer vers la carte. Audit fait, modèles dbt LUS, pièges attrapés :

1. **Accès nommé** — `semantic.vw_insight_event_mobility_disruptions` (modèle lu : grain
   disruption_event_id × location × date, fenêtre [J-1, J+30]) porte tout en NOMMÉ :
   `mode, route_long_name, short_name, stop_name, title_merged, delay_minutes (NUMERIC),
   severity, is_planned_flag, nom_commune`. La ligne Accès cite la pire perturbation nommée
   (« Ligne X — travaux, ~N min ») + le compte ; muse 08/08 = 0 ligne (le « fluide » actuel
   était vrai). Colonne date = `disruption_date`.
2. **Qui est là (nationalités)** — `mart.fct_region_foreign_country_profile` (modèle lu) :
   projection SAISONNIÈRE (jamais « ce jour-là »), région en **NUTS2** (`FR10` — PAS l'INSEE
   `11` : jointure via `dim_client_location.city_id_commune → dim_city_to_region.
   region_code_nuts2`), season sans accent (`ete`), `accommodation_type` hétérogène (ÎdF =
   hotels seul), ratios 0-1 (×100 à l'affichage), lignes dupliquées par la spine (DISTINCT
   pays). **Le mart s'arrête au 30/09/2025** (pas d'ingestion Flash INSEE 2026) → la ligne
   cite le DERNIER profil connu en le datant : « Été 2025 (hôtels, dernier connu) : 61 % de
   nuitées étrangères en ÎdF — 1er pays : États-Unis (25 %) ». Réel vérifié.
   PACA/Bretagne/Nouvelle-Aquitaine/Corse absents du mart → ligne omise honnêtement.
3. **Voisins cliquables** — `map.astro` accepte `?location_id=&date=` (vérifié) : la ligne
   Événements voisins devient un lien vers la carte du jour. Support `href` à ajouter au
   format de question du provider (`{fact_fr, tone, action_fr, href?}`) + rendu qLine.
4. **Météo cliquable** — cible à trancher : days (`?selected_dates=` + saved_item — la
   surface de détail jour) ou une carte insight ; vérifier le param location avant de câbler.
5. Lexique métier partout (« opération », jamais « occurrence »).

Vérif prévue : harnais provider sur le Corner (08/08) + un lieu à perturbations réelles.

## Périmètre connexe acté (05/08)

- P0a : brancher `/api/cron/bilan` dans cron-job.org (côté owner, après vérification par tir).
- P0b : reco = retirer `daily.ts` (couvert par Point du jour + alerts + cycle événement) —
  décision owner en attente, code intouché d'ici là.
- Routage générique des 73 sous-types (ex-P2) : ABANDONNÉ comme chantier propre — seul le
  morceau consommé par le cas 1 (router UN sous-type vers des gens) survivra.
- Déclenchement conditionnel générique : toujours PAS construit, jamais promis à l'écran.
