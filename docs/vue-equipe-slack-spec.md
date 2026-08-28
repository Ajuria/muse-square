# Vue équipe light + rail Slack (onboarding Épices et Tout) — SPEC DE TRAVAIL

> Cadrage arbitré par l'owner les 27-28/08/2026 (fil « Nouveau chantier de préparation de
> l'onboarding d'Épices et tout »). Rien de ce chantier n'est encore construit — ce document
> est la cible et son séquencement. Les fondations citées « au présent » existent et ont été
> relues dans le code le 28/08.

## La doctrine (préservée, jamais amendée)

- **Les externes n'entrent JAMAIS dans l'app** (producteurs invités, extras) : ils reçoivent
  des messages auto-suffisants (doctrine automatisation, `docs/automatisation-spec.md`) et,
  nouveau, communiquent dans des canaux Slack dédiés. Slack n'est pas l'app.
- **L'équipe interne (5 personnes) a une session réelle** : comptes Clerk + rôle `member`,
  vue light. Pas de liens tokenisés, pas d'interactivité Block Kit : les liens Slack sont de
  simples liens profonds vers l'app, la session Clerk fait l'authentification.
- **La vue membre ne peut pas devenir un outil d'audit de l'entreprise** (owner 27/08). Le
  garde-fou est STRUCTUREL, pas cryptographique : la reconstruction ponctuelle par
  recoupement est acceptée (« s'ils finissent par calculer, ce n'est pas grave »).

## Les arbitrages owner (tous datés, tous fermes)

1. **Périmètre membre (28/08)** : un membre porte un ou plusieurs pôles ; l'owner voit
   tout ; les cartes/signaux extérieurs (météo, événements, affluence, concurrence)
   arrivent aussi aux pôles ; les familles rattachées à aucun pôle = owner seul.
2. **Pages membre v1 (27-28/08)** : Agir (`pulse.astro`) + Piloter light (`tableau.astro` :
   bandeau KPI membre, « À faire », opérations/dispositifs en cours — PAS Impact, pas
   Dispositifs prouvés, pas Équipe, pas Veille, pas Débloquer, pas automatisations) + compte.
3. **Chiffres (28/08, formulation validée)** : la frontière n'est pas le €, c'est ce que le
   chiffre décrit. **Montrable : tout € attaché à une occasion d'agir** — enjeu de carte
   (écart, fenêtre, périmètre), cible d'engagement, bilan d'une opération du pôle.
   **Jamais montrable : tout € qui décrit l'état du business** — niveaux (CA, marge,
   profit) et cumuls (totaux de période, Impact, sommes multi-cartes). Test à appliquer à
   chaque chiffre : « qu'est-ce que je gagne si j'agis ? » se montre ; « combien fait
   l'entreprise ? » jamais. Conséquences : la colonne €/enjeu d'Agir RESTE pour le membre ;
   aucune variante de copie membre (les phrases des cartes citent des écarts) ; le chip
   €/an structurel est gardé. Le masquage se réduit à des BLOCS ENTIERS, côté serveur.
4. **Bandeau KPI membre (28/08)** : volume d'achats + affluence + conversion, évolutions en
   % — jamais le panier moyen en même temps que le volume (le produit des deux = le CA).
   Le panier moyen vit dans les cartes qui en parlent, un seul des deux par surface.
5. **Gestes membres v1 (27/08)** : disposition « Action menée ? Oui · Pas encore » ·
   feedback de fin de dispositif · note déclarée (statut ≠ vérité, validable par un
   dispositif — cf. mise en test depuis une cause). Rails d'écriture existants, ouverts par
   la garde de rôle, sur le périmètre du membre.
6. **Canaux Slack (28/08)** : un canal par pôle (PRIVÉ) + des canaux de DISPOSITIF (corner,
   promotion…) où des intervenants externes communiquent et accèdent aux documents partagés
   (fiche dispositif, consignes — postées par le bot, épinglées à la main).
7. **Pas de paramètre de visibilité à la création des cartes** (28/08) : le périmètre se
   DÉRIVE du rattachement membre↔pôle(s). Pour une opération créée à la main,
   `attached_pole_id` EST le paramètre de visibilité. Une dérogation éventuelle se traitera
   comme exception nommée, jamais comme niveau de configuration préventif.

## Ce qui existe et porte le chantier (relu dans le code le 28/08)

- La garde tient en deux points : `src/middleware.js:126` construit
  `locals.all_location_ids` (UNE requête BQ sur la table profil par `clerk_user_id`) ;
  `src/lib/requireLocationOwnership.ts` vérifie l'appartenance à cette liste. 57 fichiers
  d'API l'appellent — ils n'ont PAS à être touchés un par un.
- Le rail Slack : `src/lib/channels/internalSend.ts` (`sendSlack` = chat.postMessage vers
  tout canal où le bot est invité, y compris privés), config `analytics.channel_configs`
  (« site d'abord, sinon compte »), OAuth `api/channels/slack-connect.ts` + callback.
- Le roster : `analytics.team_members` + `/api/channels/team` (noms + contacts). La
  notification d'assignation existe (`api/commitments/index.ts:50`, `notifyAssignment`).
- Les pôles : `analytics.action_commitments` avec `dispositif_nature='permanent'`,
  `pole_families` (familles réelles), `attached_pole_id` pour les opérations rattachées
  (`docs/poles-dispositifs-permanents-spec.md`). Le responsable est un attribut du pôle.
- Le feed des cartes : `api/insight/monitor.ts:269` lit
  `semantic.vw_insight_event_action_candidates` — les cartes portent `action_type`,
  `action_category`, `data_payload`, **PAS de colonne famille**. Le filtre par pôle passe
  donc par une classification par TYPE (voir « La table des types » ci-dessous).
- Piloter : `api/insight/dashboard.ts` assemble tout en UN lot parallèle et rend des blocs
  nommés (`impact`, `operations`, `equipe`, `debloquer`, …) — la coupe membre est un
  filtrage de blocs à la réponse, pas une réécriture.
- Les gestes v1 ont déjà leurs endpoints : `api/commitments/disposition` (Action menée ?),
  le feedback de fin de dispositif, le rail notes.
- **Contrainte transverse : dbt est GELÉ (27/08).** Tout le modèle de données de ce
  chantier est app-write/app-read en `analytics.*`, sans toucher dbt ni les vues
  `semantic`. Aucune colonne ajoutée à `action_commitments` (son passthrough staging est
  contractuel à 78 colonnes) : les nouveaux attributs vivent dans des tables dédiées.

## Modèle de données (incrément 1 — CONSTRUIT 28/08)

Deux tables `analytics`, patron journal streaming latest-wins (répliqué de
`raw.saved_item_participants`, DDL et lecture relus dans `api/saved-items/participants.ts` :
`ROW_NUMBER() OVER (PARTITION BY <clé> ORDER BY updated_at DESC)` puis `rn = 1 AND
COALESCE(deleted, FALSE) = FALSE` ; suppression = ligne tombstone), jamais lues par dbt.
**Les tables SONT en base** — sondes écrites, relues par la lecture latest-wins, masquées
par tombstone (0 visible), puis effacées (les 2 tables sont à 0 ligne). Le catalogue et
l'allowlist sont régénérés depuis le schéma live (`refresh-bq-catalog.sh`, 498 tables).

- **`analytics.location_members`** — grain : `member_id`. Colonnes : `member_id`,
  `location_id` (clé de rattachement — un suivi appartient à un SITE, loi owner 27/08),
  `member_email` (posée à l'invitation), `clerk_user_id` (NULL jusqu'à la première
  connexion), `role` (`'member'` v1 ; l'owner n'est PAS dans cette table — il reste défini
  par la table profil), `pole_dispositif_ids` (JSON array de `dispositif_id` de pôles — un
  ou plusieurs), `deleted`, `created_at`, `updated_at`.
- **`analytics.dispositif_channels`** — grain : `location_id × dispositif_id`. Colonnes :
  `location_id`, `dispositif_id` (un pôle OU un dispositif daté), `slack_channel_id`,
  `deleted`, `created_at`, `updated_at`. C'est l'adresse du canal du pôle/dispositif —
  l'attribut qui manque au routage, rien d'autre.

Rattachement email→compte : l'owner invite par email (ligne `location_members` sans
`clerk_user_id`) ; à la première connexion du membre, la résolution lit l'email de la
session Clerk côté serveur et pose `clerk_user_id`. **À vérifier au build (incrément 2) :
où l'email de session est disponible dans l'intégration Clerk v3 actuelle** — c'est la
seule inconnue technique du chantier ; si l'email n'est pas dans les claims, la résolution
passe par un appel Clerk backend API au premier accès.

## Accès et rôle (incrément 2 — CONSTRUIT 28/08)

- Le contexte profil vit dans `src/lib/profileContext.js` (extrait du middleware pour être
  testable hors Astro) et couvre owner + membre en **UN aller-retour BQ** (UNION ; côté
  membre, latest-wins sur la table ENTIÈRE puis filtre APRÈS `rn = 1` — un tombstone
  écrit par l'owner, clé `member_id` sans `clerk_user_id`, doit gagner : filtrer avant le
  `ROW_NUMBER` rendait la ligne morte encore comptée, défaut ATTRAPÉ par le harnais).
- **`locals.all_location_ids` reste POSSÉDÉ seulement** — c'est la liste que vérifie
  `requireLocationOwnership`, elle ne reçoit jamais un site de membership. Les sites
  membres vivent dans `locals.member_location_ids` + `locals.member_poles` ;
  `locals.role` = `'owner'` | `'member'` | null. Le scope opérationnel d'un pur membre se
  résout sur ses sites de membership (cookie `ms_active_location` honoré sur cette liste).
- `requireLocationAccess(locals, location_id)` (dans `requireLocationOwnership.ts`)
  accepte owner ET membre du site — consommateurs posés aux incréments 3-5.
- Résolution email→`clerk_user_id` à la première connexion (l'inconnue Clerk est LEVÉE) :
  l'API REST backend (`api.clerk.com/v1/users/<id>`, `CLERK_SECRET_KEY`) rend l'email —
  vérifié sur le compte owner réel. Invitations en attente par email → INSERT DML
  copy-forward (même `member_id`, latest-wins fait le reste), tentée une fois par process,
  n'échoue jamais un login.
- Un pur membre : jamais forcé vers /onboarding ni /profile ; sur `/app`, seul
  `pulse` / `tableau` passent, tout le reste redirige vers Agir.
- **Preuves** : harnais réel `scripts/vue-equipe-access-harness.ts` (BQ + Clerk réels,
  compte owner f10c3e58) **22/22**, dont : sorties owner byte-identiques à l'ancienne
  requête du middleware (location_id, first_name, all_location_ids ordre compris),
  tombstone owner-style masque le membre, résolution réelle bout en bout, listes jamais
  fusionnées. Mutation vue tomber : fusion volontaire des listes → les 2 assertions
  sécurité rougissent, puis retour vert 22/22. `node --check` + `tsc --noEmit` propres.
- **Reste (E2E owner)** : le parcours navigateur complet d'un membre réel (compte Clerk
  de test invité, login, redirection vers Agir) — à faire quand l'incrément 4 rend la
  page consommable par un membre.

## Piloter light (incrément 3 — CONSTRUIT 28/08)

`dashboard.ts` est role-aware : garde `requireLocationAccess` (owner inchangé) ; pour
`role='member'` la réponse est une LISTE BLANCHE — {ok, role, period_days, multi_site,
sites, operations, open_commitments, bandeau}. Impact, € cumulés, marges, `ca_daily`,
équipe, prouvés, veille, débloquer, automatisations **ne sont pas envoyés**. Périmètre =
pôles du membre : `dispositif_id` (le pôle) / `attached_pole_id` (opération rattachée),
ajoutés à la CTE `latest` ET au SELECT du feed engagements ; une occurrence passe si un
engagement de son `saved_item` passe. `gap_eur` reste autorisé sous
`operations[].prev_occ` (bilan d'une opération du pôle = occasion d'agir).

Le `bandeau` est une requête membre-seule (l'owner ne la paie pas) sur
`mart.fct_client_daily_performance` (modèle LU : grain location × date × source_type →
agrégats par fenêtre, conversion recalculée Σtx/Σvis jamais moyenne de taux ; borne
STRICTE `< CURRENT_DATE()` — la graine porte des dates futures, revérifié : max
2026-09-30) : 30 derniers jours vs les 90 précédents (convention poleReading), volume
d'achats + visiteurs, AUCUN champ €.

Rendu : `renderMemberView` dans `tableau.astro` (early-exit de `render()`) — grammaire
existante de la page (tb-hero2/tb-t2, tb-eb/tb-card, « habituel », « Rien à faire — vos
opérations suivent leur cours. »), libellés KPI repris de `KPI_MINI_FR` (chaînes déjà
rendues de la page : « ventes/jour », « nombre de visiteurs/jour », « taux de
conversion ») ; plancher n ≥ 5 j ; un compte sans capteur d'affluence rend « — », jamais
« 0 » ; « Nouvelle opération » masqué (geste owner).

**Preuves** : harnais réel `scripts/vue-equipe-dashboard-harness.ts` (handler réel, BQ
réel, f10c3e58) **32/32** — owner byte-compatible (tous ses blocs, pas de champ role),
clés membre exactes, filtre pôle positif ET négatif sur les 2 engagements ouverts réels,
5 occurrences Corner filtrées, 403 hors périmètre — + **rendu vm 7/7** (renderMemberView
byte-exact sur le payload réel : 3 tuiles, visiteurs « — », aucun €). Mutation vue
tomber : branche membre neutralisée → 8 assertions rougissent (le membre recevait tout),
restauration verte. Le harnais a attrapé en route la projection manquante de la CTE
(`Unrecognized name: dispositif_id`).

## Agir membre (incrément 4 — CONSTRUIT 28/08, serveur ; UI gestes = inc 5)

- `monitor.ts` est role-aware : garde `requireLocationAccess` (owner byte-compatible —
  pas de champ `role` chez lui, prouvé), FORBIDDEN → 403. Pour un membre :
  `applyMemberPolicy` filtre les candidates par PORTÉE de type (`lib/memberCardPolicy.ts`)
  et expurge chaque `data_payload` (`redactPayloadForMember`) ; `sales_summary` (8 j de
  CA/transactions/panier absolus) part à null. Les familles des pôles du membre se lisent
  par une requête AMORCÉE tôt (version courante du pôle = dernière ligne journal de son
  `dispositif_id`, pôle fermé exclu).
- **La table des types s'est SIMPLIFIÉE au build** (l'audit des payloads réels a tranché) :
  - **Portée** — défaut `site` ; `famille` = {item_share_move, offering_mix_shift} (clé
    payload `item_category`, vérifiée) ; `owner` = {client_dormant (identité + CA cumulé
    d'un client B2B), weekly_briefing, weekly_sales_spike/hole, monthly_sales_spike/hole
    (synthèses de période = totaux d'état du business ; conservateur v1)}.
  - **Chiffre** — la colonne volume/panier par type est DEVENUE INUTILE : le retrait des
    clés « niveau » (revenue/basket hors formes relatives `_pct/_share/_z/_rank`, +
    `avg_30d` ; écarts `delta_eur`/`day_gap_eur` gardés) supprime mécaniquement tout
    panier absolu ET éteint la décomposition panier+ventes (elle exige ses niveaux et
    rend null) — « jamais PM et volume ensemble » est tenu par construction. Les % passent
    toujours.
- **Le balayage des phrases est FAIT par preuve de rendu**, pas par grep : les sowhat
  portent des null-guards et dégradent sur leurs replis approuvés existants. Témoin réel
  (sales_revenue_down_wow, f10c3e58) : plein = « CA 1169 € le 07/08 — … −892 € (2061 €). » ;
  membre = « journée en retrait, sous votre vendredi habituel. Deux facteurs : ventes
  −13 %, panier −3 %. » Note : l'écart € du jour disparaît AUSSI quand il se calcule
  depuis des niveaux — plus strict que l'arbitrage (écarts permis) ; à desserrer type par
  type si l'owner le veut.
- **Preuves** : `scripts/vue-equipe-agir-harness.ts` **20/20** — politique pure sur
  payloads réels, endpoint réel owner (byte-compat) + membre, **balayage récursif du
  payload membre entier : zéro clé de niveau** (days et all_feed inclus), 403 hors
  périmètre, rendu sowhat plein vs expurgé via le vrai `renderActionCandidates` en vm.
  Mutation vue tomber : politique neutralisée → cartes famille visibles + fuites de
  niveaux nommées, 2 rouges ; restauré 20/20.
- **Reporté à l'inc 5 (gestes)** : le gating client des gestes owner sur pulse.astro
  (M'engager, config, suppression…) — il se décide avec la liste des gestes membres.

## Gestes membres v1 (incrément 5 — CONSTRUIT 28/08)

- **Disposition** (`POST api/commitments/disposition`, « Action menée ? Oui · Pas
  encore » + `dispositif_note`) et **feedback de fin de dispositif**
  (`POST api/commitments/retro`, « Documenter », 409 avant résolution inchangé) sont
  ouverts au membre : `requireLocationAccess` + `memberCommitmentInPerimeter` (le pôle —
  `dispositif_id` — ou une opération rattachée — `attached_pole_id` ; sinon 403).
- **La note membre** passe par deux rails existants : `dispositif_note` sur la
  disposition (périmètre vérifié) et `api/analytics/track` (déjà ouvert à toute session,
  auteur = `user_id`). Le devenir des notes est le chantier « Notez ce qui a changé »
  (ouvert) — rien de nouveau inventé ici.
- **Auteur** : le journal des engagements garde le `user_id` du COMPTE (c'est la clé de
  toutes les lectures — ne jamais y mettre le clerk id du membre) ; l'auteur réel d'un
  geste membre se trace dans `analytics.action_log` (`event='member_gesture'`,
  `action_key='disposition:<id>'`, INSERT DML non bloquant — `logMemberGesture`).
- **La LISTE s'ouvre aussi** (`GET api/commitments`) — nécessaire pour voir ses
  engagements : filtrée au périmètre + PROJECTION liste blanche
  (`memberCommitmentProjection` : la cible passe, `kpi_baseline` — un CA habituel, un
  niveau — et le reste du journal non) ; `?goal_context` (M'engager) refusé 403.
- **Gating client** : `window._msMemberView` (posé par pulse depuis `monitor.role`,
  chemins fetch ET cache sessionStorage) → la rangée d'actions des cartes
  (action-cards.js `?v=96`) ne garde que « Consulter » ; Communiquer / Sauvegarder /
  Signaler / M'engager restent owner. Le reste du gating fin de pulse se constate à
  l'E2E navigateur membre (voir Vérification).
- **Preuves** : `scripts/vue-equipe-gestes-harness.ts` **17/17** sur les VRAIS endpoints
  — sonde engagement DML (termes complets, nettoyée), liste membre filtrée + projetée,
  goal_context 403, disposition/retro dans le périmètre (journal + auteur action_log
  vérifiés en base), refus hors périmètre testé sur une SECONDE sonde (jamais un
  engagement réel — une mutation ne peut pas écrire sur du réel), owner byte-compatible,
  rangée d'actions vm owner vs membre. Mutation vue tomber : périmètre neutralisé → le
  membre voit tout + écrit hors pôle (2 rouges, sur sondes), restauré 17/17. Deux défauts
  de SONDE attrapés en route par le rail lui-même (assertTermsPresent, timestamps ns).

## Routage Slack (incrément 6 — CONSTRUIT 28/08)

Arbitrages owner 28/08 avant build : **le contenu de la carte vit DANS le message** (pas
un simple lien), le geste se fait dans l'app par lien profond ; le feedback DIALOGIQUE
dans Slack (boutons + modal) est ACTÉ comme incrément 7, après constat d'usage.

- **`POST /api/channels/forward`** (« Faire suivre », geste OWNER) : la page envoie le
  RENDU MEMBRE de la carte (`msMemberForwardText` d'action-cards.js — payload expurgé par
  `msRedactPayloadForMember`, JUMEAU CLIENT assumé de `memberCardPolicy` : un canal
  d'équipe n'a pas plus de droits qu'une session membre) ; le serveur résout le canal
  (`lib/channels/slackRouting.resolveForwardChannel` : dispositif explicite → pôle par
  famille (`pole_families` de la version courante, pôle fermé exclu) → `default_channel`
  de la config Slack), envoie par `sendSlack`, trace TOUT envoi (échec compris) dans
  `analytics.card_forwards` (DDL 28/08). Sans canal → 400 clair. Le message se termine
  par « Ouvrir : <lien> » vers **Agir (pulse)** — pas la page engagement : l'ouvrir au
  membre exigerait la rédaction des séries CA d'`evolution` (reste nommé ci-dessous).
- **`PUT /api/channels/forward`** : poser/retirer l'adresse du canal d'un pôle /
  dispositif / série (`analytics.dispositif_channels` — la colonne `dispositif_id`
  accepte un `saved_item_id` pour une série ; tombstone si null). L'UI de saisie du canal
  n'existe pas encore — setup Épices et Tout owner-assisté par ce PUT.
- **Bouton « Faire suivre »** sur la rangée de pied des cartes du fil Agir (pulse, owner
  seul — jamais rendu en vue membre) : états « Envoi… » → « Envoyée » / retour arrière
  sur échec avec l'erreur en infobulle.
- **Greffe consignes** (cron `event-occurrences`) : si la série porte un canal déclaré,
  la consigne part AUSSI dans ce canal — additif, non bloquant, trace `consigne_sends`
  ligne `channel='slack'`. Se constate à la première consigne réelle (série Corner).
- **La fiche dispositif postable** passe par le MÊME POST (`kind:'fiche'`, titre + corps
  depuis la fiche) — l'entrée UI sur la fiche viendra avec l'E2E.
- **Preuves** : `scripts/vue-equipe-forward-harness.ts` **15/15** — routage pur
  (écrit/relu/tombstone, famille→pôle→canal sur pôle-sonde), 403 membre (POST et PUT),
  502 canal-sonde avec l'erreur DE SLACK (token vivant, résolution pôle prouvée dans la
  réponse), 400 sans canal, **UN envoi réel DÉLIVRÉ** dans le workspace owner (routé par
  le pôle-sonde), traces échec ET succès relues en base, `msMemberForwardText` réel sans
  niveau, sondes nettoyées. Mutation vue tomber : résolution famille neutralisée → 4
  rouges, restauré 15/15.

## Le dialogique (incrément 7 — CONSTRUIT 28/08 ; activation = config Slack owner)

Arbitrage owner 28/08 : répondre là où on lit — boutons + modal dans Slack, pas de
conversation libre (événements/parsing = déconseillé, hors périmètre).

- **`POST /api/channels/slack-interact`** — endpoint PUBLIC appelé par Slack, SANS session
  Clerk : l'authenticité est la SIGNATURE Slack (HMAC v0 du corps brut,
  `SLACK_SIGNING_SECRET`, fenêtre anti-rejeu 5 min, comparaison à temps constant) ; sans
  secret en env → 503, rien ne se traite. L'identité du cliqueur = mappage
  `location_members.slack_user_id` (colonne AJOUTÉE 28/08, allowlist et copy-forward de la
  résolution email mis à jour — sans quoi le mappage se perdait à la première connexion) ;
  repli email `users.info` si le bot a le scope (`missing_scope` constaté aujourd'hui —
  voir setup). Les gestes sont DISPATCHÉS EN INTERNE aux handlers disposition/retro avec
  des locals synthétiques (`localsFromSlackUser`) : mêmes gardes, même périmètre de pôles,
  même trace d'auteur — un membre jamais connecté à l'app agit sous `slack:<id>`,
  traçable. Rien n'est réécrit.
- **Boutons** sur la notification d'assignation Slack (`notifyAssignment`) : « Action
  menée ? Oui » / « Pas encore » / « Documenter » — mots du geste app. `sendSlack` accepte
  désormais des blocs (additif ; le texte reste, l'email les ignore).
- **Modal « Documenter »** : libellés VERBATIM de `commitmentCopy` (« Qu'est-ce qui a
  marché ? », « Qu'est-ce que je changerais ? », « À reproduire ? » Oui/Non,
  Enregistrer/Annuler) — zéro chaîne inventée, un seul foyer de copie. Soumission →
  handler retro ; ses règles répondent dans le modal (409 « après résolution » affiché).
- **Réponses** : confirmation éphémère au cliqueur (« Enregistré — action menée. ») ;
  compte non relié → phrase d'orientation, aucune écriture.
- **Preuves** : `scripts/vue-equipe-interact-harness.ts` **13/13** — 401 sans/fausse
  signature + anti-rejeu, mappage pur (locals `slack:<id>`), bouton Fait → journal +
  auteur tracés en base, hors périmètre AUCUNE écriture, non mappé AUCUNE écriture, modal
  → retro écrit, modal sur engagement ouvert → erreurs du rail. Mutation vue tomber :
  vérification de signature neutralisée → les 3 assertions 401 rougissent, restauré 13/13.
- **Limite connue** : l'ack Slack veut < 3 s ; le traitement est synchrone (~2-3 s BQ) —
  un avertissement Slack peut apparaître à froid, le geste est quand même écrit. À
  observer à l'usage.

### Activation (gestes OWNER, hors de ma portée — api.slack.com + Vercel)

1. **`SLACK_SIGNING_SECRET`** : api.slack.com/apps → l'app Muse Square → Basic
   Information → App Credentials → Signing Secret → le poser dans les env Vercel (prod)
   ET `.env` local. Sans lui l'endpoint répond 503.
2. **Interactivity & Shortcuts** → activer → Request URL =
   `https://<domaine-prod>/api/channels/slack-interact`.
3. *(Repli email, optionnel)* OAuth & Permissions → ajouter `users:read` +
   `users:read.email` → réinstaller l'app dans le workspace.
4. **Mappage des membres** : poser `slack_user_id` sur leurs lignes `location_members`
   (setup owner-assisté — pas encore d'UI).
5. **Porte de vérification** : un clic réel « Pas encore » sur une notification
   d'assignation, vérifié en base (journal + action_log) — c'est l'E2E de l'incrément.

## Messages par étape du cycle (incrément 8 — CADRÉ 28/08, owner ; À CONSTRUIRE)

Retour owner sur le premier message réel (28/08) : la notification d'assignation mélangeait
deux moments du cycle (boutons de SUIVI sur un message de PARTAGE), et sa copie ne disait
pas ce qui est attendu du destinataire. Architecture arbitrée : **un message par étape du
cycle de la carte**, chacun avec ses mots et ses boutons, mappés sur les gestes RÉELS de
l'interface — jamais des libellés inventés pour Slack.

| Étape | Message | Boutons | Rail |
|---|---|---|---|
| 1. Carte système PARTAGÉE | « X a partagé cette priorité avec vous. Cliquez sur M'engager ou Pas pour moi, et au besoin échangez avec lui concernant le dispositif à mettre en place » + titre / description / action proposée (proposition owner 28/08, base de la copie) | **M'engager · Pas pour moi** | M'engager = lien profond vers le formulaire de l'app (définition dispositif/KPI/échelle = trop riche pour Slack) ; « Pas pour moi » = NOUVEAU rail (refus enregistré + retour à l'expéditeur) |
| 2. Carte user EN COURS (suivi au responsable) | rappel calibré | **Fait · Pas pour moi · Piloter** | Fait = disposition existante ; Piloter = lien vers la fiche ; « Pas pour moi » ici = se désengager — NOUVEAU rail (rien ne « rend » une carte aujourd'hui). « Pas encore » MEURT dans Slack (le silence dit pareil). |
| 3. Verdict / fin de dispositif | bilan | **Feedback (Documenter) · Ajuster · Terminer** | retro + moves existants |
| 4. TROISIÈME résultat négatif | notification proactive (owner : « important ») | — | NOUVEAU détecteur : la chaîne de verdicts est en base, personne ne la surveille — 3 manqués consécutifs sur la chaîne d'un dispositif → notifier owner + responsable |

**Mots à trancher AVANT le build** (concepts sans mot arbitré — jamais improvisés) :
- **« Piloter » est déjà l'onglet principal de l'app** — le même mot pour le bouton de
  carte = deux gestes sous un mot. Owner tranche : assumer le doublon ou renommer l'un.
- **« priorité »** (message de partage) : mot absent du lexique (Agir dit « actions ») —
  s'il devient le mot du partage, l'acter au lexique.
- **« Pas pour moi »** : mot owner 28/08 — à acter au lexique avec ses deux sens (refus
  d'un partage / désengagement d'une carte prise).
- Cycle complet de référence (owner 28/08) : carte système → Je m'engage → carte user
  (définition dispositif, KPI, échelle de temps du verdict) → ajuster ou arrêter (nouveau
  cycle) → fin du dispositif OU notification au 3e résultat négatif → feedback + Ajuster /
  Terminer.

**Renommage de l'app Slack** (owner, fait/à faire 28/08) : « Muse Square insight » →
« Muse Square » — api.slack.com → Basic Information → App name, + App Home → Display Name.

**Jusqu'au build de cet incrément, AUCUN message Slack de carte ne part chez un client** :
le rail technique (inc 7) est prouvé, la copie ne l'est pas.

### E2E CONSTATÉ (28/08, 11:33)

Config owner FAITE (signing secret Vercel, Interactivity URL avec `www`, scopes
users:read(.email) + réinstallation, canal renommé `#muse_square_app` — l'ID C0B360KSWDC
n'a pas bougé, le contact roster de Poeiti a été rebasculé sur l'ID). **Clic réel owner
« Pas encore » sur un message-sonde à boutons → vérifié en base** : `action_done_status =
pas_encore`, transition `disposition`, 11:33:56 — signature prod, identité par email
Slack, garde, écriture. Le « Operation timed out » Slack est apparu comme documenté
(traitement synchrone > 3 s) : cosmétique, le geste s'écrit — correctif ack-immédiat
rangé dans l'incrément 8. Sondes nettoyées.

## Messages par étape du cycle (incrément 8 — CADRÉ 28/08, retour owner sur le message réel)

Verdict owner sur le premier message reçu : il CONFOND le partage et le suivi, et ses
boutons ne mappent pas les gestes réels de l'interface. **Architecture actée : un message
par étape du cycle de la carte**, chacun avec ses mots et ses boutons.

| Étape | Message | Boutons | Rail |
|---|---|---|---|
| Carte système PARTAGÉE | « X a partagé cette priorité avec vous… » + titre/description/action proposée | M'engager · Pas pour moi | M'engager = lien vers le formulaire app (dispositif/KPI/échelle = trop riche pour Slack) ; « Pas pour moi » = NOUVEAU rail (refus enregistré + retour à l'expéditeur) |
| Carte user EN COURS (suivi au responsable) | rappel calibré | Fait · Pas pour moi · Piloter* | Fait = disposition ; Piloter = lien fiche ; « Pas pour moi » = désengagement, NOUVEAU rail |
| Verdict / fin de dispositif | bilan | Feedback (Documenter) · Ajuster · Terminer | retro + moves existants |
| **3e résultat négatif** | notification proactive (owner : important) | — | NOUVEAU détecteur sur la chaîne de verdicts (elle existe en base, personne ne la surveille) |

Acté aussi : « Pas encore » disparaît (le silence le dit) ; l'échange humain vit dans le
fil Slack, pas dans un bouton ; l'app Slack est renommée « Muse Square » (geste owner).

**Mots TRANCHÉS (owner 28/08)** : le bouton reste **« Ajuster »** (« Piloter » retiré
par l'owner — collision avec l'onglet) ; **« priorité »** entre au lexique dans un
registre « interactions humaines » distinct des surfaces app (section ajoutée à
`lexique.md`). **Le texte de CHAQUE notification est arbitré par l'owner** (« rien à ma
discrétion ») — gabarits proposés au fil du 28/08, GO owner requis avant tout envoi réel ;
mot restant à trancher : le geste de fin (« Terminer » — mot du feedback owner — vs
« Arrêter », le move existant de l'app).

### CONSTRUIT 28/08 (harnais `scripts/vue-equipe-cycle-harness.ts` 22/22 + mutation)

- **Ack-immédiat** : les boutons de `slack-interact` répondent 200 tout de suite (mesuré :
  3 ms) et le travail court dans `waitUntil` (4,6 s derrière — le « Operation timed out »
  est mort) ; confirmation par response_url ; le modal RESTE synchrone (ses erreurs
  s'affichent dedans, le 409 du rail compris).
- **Copie au foyer unique `lib/channels/slackMessagesFr.ts`** — mots owner 28/08, mots
  bannis scannés au harnais (mutation : « vs attendu » réintroduit → 2 rouges) :
  G1 partage (« {Prénom} a partagé cette priorité avec vous » + titre/corps équipe +
  action proposée + consigne d'échange ; M'engager = lien app · Pas pour moi) — branché
  sur « Faire suivre » (forward.ts, kind='card') ; G2 assignation (« {Prénom} vous a
  assigné une tâche » + action + « Objectif : … (CA vs votre résultat habituel) … —
  verdict le JJ/MM/AAAA » ; Consulter · Ajuster, jamais Fait — corrige le « CA vs
  attendu » banni qui vivait en prod) ; G3 verdict (« Votre opération « … » vient d'être
  évaluée. Verdict : résultat opérationnel ±x € sur la période (du … au …), objectif
  atteint/manqué/dépassé/non concluant » — € = réel − résultat habituel de la fenêtre,
  clause omise si non mesurable ; Documenter · Ajuster) — greffé sur
  `cron/commitment-resolve` (canal du dispositif sinon default_channel sinon rien, dit
  au résultat) ; G4 sous-performance (« … a sous-performé pour la 3ᵉ fois cette
  semaine. Trois journées … nettement sous votre résultat habituel : d1, d2, d3. » + −€
  des trois journées ; Ajuster seul).
- **« Pas pour moi » (partage)** : bouton Slack → MÊME événement que le bouton de l'app
  (`action_log` `card_not_done` — l'état s'affiche dans le fil Agir) ; `user_id` = le
  COMPTE (card-states lit par lui), auteur réel dans `reason`, `method='slack'` ; le
  refus se dit à l'expéditeur en réponse de fil (« {prénom} a répondu « Pas pour moi ». »).
- **Détecteur G4** : `api/cron/underperf-watch.ts` (Bearer CRON_SECRET, quotidien) — v1 :
  opérations OUVERTES à métrique `revenue_residual` ; mauvaise journée = `residual_z <=
  -1` (vw_insight_event_day_residual, le seuil de l'app) ; semaine lundi→hier, jamais le
  jour en cours ; ≥ 3 → un envoi, idempotence par trace `card_forwards` kind='underperf3'.
  Les métriques FAMILLE sont exclues v1 : pas de bande de bruit par famille et par jour —
  on n'invente pas un seuil.

RESTES inc 8 : ajouter `/api/cron/underperf-watch` à cron-job.org (geste owner) · le slot
« Preuve » de G2 (relier la carte d'origine à l'engagement au moment de l'envoi) ·
« Documenter » sur G4 (refusé avant résolution par le rail — arbitrage owner : l'ouvrir
quand même ou Ajuster seul, v1 = Ajuster seul) · « Pas pour moi » désengagement d'une
tâche ASSIGNÉE (owner : « peut-être ») · G3/G4 constatés sur une résolution réelle.

## Setup Slack Épices et Tout (opérationnel, hors code)

- Workspace connecté par le flux existant (`slack-connect`), bot invité canal par canal.
- **Slack gratuit n'a pas de comptes invités** : tout invité au workspace est membre
  complet et peut rejoindre les canaux PUBLICS. Parade : canaux de pôle en PRIVÉ (équipe
  seule), canaux de dispositif avec externes = dédiés. L'historique gratuit ~90 j → les
  docs de référence vivent en épinglé (ou sont repostées par le bot), jamais « dans le fil ».

## Les mots (lexique — concepts sans mot, à demander, jamais improvisés)

| Concept | Statut |
|---|---|
| Le geste « faire suivre » une carte vers Slack | mot owner EN ATTENTE |
| Le nom du rôle membre (visible : « membre » ? « équipe » ?) | mot owner EN ATTENTE |
| Le statut de la note d'un membre (« déclaré » ?) | mot owner EN ATTENTE |
| Le libellé du bandeau KPI membre (volume d'achats, affluence, conversion) | dépend de l'arbitrage vocabulaire KPI déjà en attente (22/08) |

Aucune chaîne visible ne s'écrit avant ces mots + le passage des règles 1-13 du lexique,
tableau de tests MONTRÉ, chaîne rendue de la surface CITÉE d'abord (règle 4).

## Séquencement (un incrément = un commit vérifié)

1. **Modèle** (FAIT 28/08) : DDL des 2 tables + catalogue/allowlist régénérés.
2. **Accès** (FAIT 28/08, harnais 22/22 + mutation) : middleware (même aller-retour),
   `requireLocationAccess`, résolution email 1re connexion (inconnue Clerk LEVÉE),
   redirections de pages. Reste : E2E navigateur d'un membre réel, avec l'incrément 4.
3. **Piloter light** (FAIT 28/08, harnais 32/32 + rendu vm 7/7 + mutation) :
   `dashboard.ts` role-aware + `renderMemberView`.
4. **Agir membre** (FAIT 28/08 serveur, harnais 20/20 + mutation) : `monitor.ts`
   role-aware + memberCardPolicy (la table chiffre est devenue inutile — retrait des
   niveaux) + balayage par preuve de rendu. Gating UI des gestes owner → inc 5.
5. **Gestes v1** (FAIT 28/08, harnais 17/17 + mutation) : disposition + retro + liste
   ouverts au périmètre membre, auteur tracé action_log, rangée d'actions membre.
6. **Routage Slack** (FAIT 28/08, harnais 15/15 + envoi réel délivré + mutation) :
   forward.ts POST/PUT, slackRouting, greffe consignes, bouton Faire suivre.
7. **Dialogique** (FAIT 28/08 côté code, harnais 13/13 + mutation signature ; ACTIVATION
   = config app Slack owner, spec § Activation) : slack-interact signé, boutons
   disposition + modal Documenter, mappage slack_user_id.

Vérification à chaque incrément : compte réel owner (`f10c3e58…`) + **un compte membre de
test créé dès l'incrément 2** (le « works for me » owner ne prouve rien du rendu membre) —
pour chaque surface : ce que le membre VOIT (screenshot) et ce que la réponse API ne
CONTIENT PAS (les blocs coupés, vérifiés dans le payload, pas à l'œil). Le premier cas
réel (déclaration des pôles d'Épices et Tout, invitation des 5) reste un geste owner.

## Hors périmètre de ce chantier (nommé pour ne pas y glisser)

- WhatsApp (pas de numéro d'entreprise — hors de portée, acté owner 27/08).
- Toute vue membre riche (modifier/créer un dispositif) — réexaminer seulement si l'usage
  le prouve.
- Le conflit de vocabulaire `channel` dbt/API (`comptoir`/`direct` vs
  `corner`/`commission`/`canal`, aucune intersection — `docs/channel-grain-spec.md`) :
  chantier séparé, à arbitrer AVANT les premiers corners d'Épices et Tout.
