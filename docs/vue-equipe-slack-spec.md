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

## Accès et rôle (incrément 2)

- La requête profil du middleware s'étend pour couvrir les membres **dans le MÊME
  aller-retour BQ** (UNION avec `location_members` sur `clerk_user_id`, latest-wins,
  `deleted=false`) — jamais une seconde requête séquentielle (budget perf). Elle pose
  `locals.role` (`'owner'` | `'member'`) et, pour un membre, `locals.member_poles`
  (les `dispositif_id` de ses pôles).
- `requireLocationOwnership` ne bouge pas (les écritures owner restent gardées par lui).
  S'ajoute `requireLocationAccess(locals, location_id)` qui accepte owner ET membre — posé
  UNIQUEMENT sur les endpoints que les pages membre consomment (liste fermée à l'incrément
  4, pas un chantier de 57 fichiers).
- Les pages hors périmètre membre redirigent vers Agir (garde de page, pas de lien mort).

## Piloter light (incrément 3)

`dashboard.ts` devient role-aware : pour `role='member'`, la réponse ne contient QUE les
blocs du périmètre (« À faire », opérations/dispositifs en cours — filtrés aux pôles du
membre et aux opérations rattachées à ses pôles) + le bandeau membre (volume d'achats,
affluence, conversion, évolutions en %). Les blocs `impact`, prouvés, `equipe`,
`debloquer`, veille, automatisations **ne sont pas envoyés** — c'est la coupe la moins
chère et la seule sûre (masquer au client = envoyer quand même). `tableau.astro` rend ce
qu'il reçoit ; les blocs absents ne s'affichent pas.

## Agir membre (incrément 4)

- `monitor.ts` devient role-aware. Filtre de périmètre à l'assemblage, par la table des
  types (ci-dessous) : les cartes `site` passent pour tous les membres ; les cartes
  `famille` passent si l'intersection entre leurs familles (lues dans `data_payload`, à
  vérifier type par type via bq-verify au build) et l'union des `pole_families` des pôles
  du membre est non vide ; les familles sans pôle ne sortent que pour l'owner.
- Les chiffres suivent l'arbitrage 3 : colonne €, enjeux, écarts et chips restent tels
  quels. UNE vérification au build : balayer les phrases générées (`action-cards.js`,
  sowhat) pour confirmer qu'aucune ne cite un NIVEAU absolu (CA du jour, marge) — si une
  le fait, c'est cette phrase qu'on traite, pas la copie entière.
- Les blocs owner de la page (config canaux, automatisation, suppression) sont gardés par
  le rôle.

### La table des types (à faire arbitrer PENDANT l'incrément 4)

UNE table de classification par `action_type`, trois colonnes, proposée en tableau à
l'owner avec les tests du lexique montrés :

| `action_type` | portée (`site` \| `famille`) | chiffre déclaré (`volume` \| `panier` \| `%` seul) |

C'est le même objet qui porte deux arbitrages restants : le filtre de périmètre ET la
règle « panier moyen OU volume, jamais les deux sur la même carte ». Elle vit en constante
applicative versionnée (pas en base) : elle change avec le code des cartes.

## Gestes membres v1 (incrément 5)

Ouvrir aux membres, par `requireLocationAccess` + vérification que l'objet touché est dans
leur périmètre (l'engagement/le dispositif appartient à un de leurs pôles) :

1. `POST api/commitments/disposition` — « Action menée ? Oui · Pas encore ».
2. Le feedback de fin de dispositif (rail existant de la fiche).
3. La note déclarée — signée (nom du membre depuis `location_members`), datée, statut
   « déclaré » : jamais un fait tant qu'un dispositif ne l'a pas validée.

Tout le reste (créer/modifier/supprimer un dispositif, config, automatisation) reste
owner. Chaque geste écrit porte l'auteur.

## Routage Slack (incrément 6)

- « Faire suivre » une carte : geste owner sur la carte → `sendSlack` vers le canal du
  pôle concerné (résolu par la table des types → familles → pôle → `dispositif_channels`),
  repli canal général. Trace append-only (patron `consigne_sends`). Le message porte le
  lien profond vers la carte — la session Clerk du membre fait le reste.
- Les consignes d'opération (cas 1 et 2, déjà livrées) apprennent UNE chose : si le
  dispositif a un canal dans `dispositif_channels`, la consigne part AUSSI dans ce canal
  (en plus des destinataires actuels). Rien d'autre ne bouge dans l'automatisation.
- La fiche du dispositif (description `best_practices`) est postable dans son canal
  (« Publier la fiche dans Slack », geste owner) — c'est la doc opérationnelle partagée
  (dispositif pluie, chaleur, corners) accessible aux externes du canal.

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
2. **Accès** : middleware (même aller-retour), `requireLocationAccess`, résolution email à
   la première connexion (inconnue Clerk levée ici), redirections de pages.
3. **Piloter light** : `dashboard.ts` role-aware + rendu.
4. **Agir membre** : `monitor.ts` role-aware + table des types (arbitrage owner) + balayage
   des phrases pour les niveaux absolus.
5. **Gestes v1** : les 3 écritures ouvertes, périmètre vérifié, auteur porté.
6. **Routage Slack** : `dispositif_channels` branché — faire suivre, consignes, fiche.

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
