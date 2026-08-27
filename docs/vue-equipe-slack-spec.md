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
2. **Accès** (FAIT 28/08, harnais 22/22 + mutation) : middleware (même aller-retour),
   `requireLocationAccess`, résolution email 1re connexion (inconnue Clerk LEVÉE),
   redirections de pages. Reste : E2E navigateur d'un membre réel, avec l'incrément 4.
3. **Piloter light** (FAIT 28/08, harnais 32/32 + rendu vm 7/7 + mutation) :
   `dashboard.ts` role-aware + `renderMemberView`.
4. **Agir membre** (FAIT 28/08 serveur, harnais 20/20 + mutation) : `monitor.ts`
   role-aware + memberCardPolicy (la table chiffre est devenue inutile — retrait des
   niveaux) + balayage par preuve de rendu. Gating UI des gestes owner → inc 5.
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
