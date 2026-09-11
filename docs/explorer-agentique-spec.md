# Explorer agentique — SPEC DE TRAVAIL

**Sert : intent § Le métier** — « Muse Square est la mémoire opérationnelle d'un lieu qui reçoit du
public ». L'agent Explorer est la conversation par laquelle l'exploitant DIT à cette mémoire ce que la
mesure ne voit pas (l'entrée, le sens de circulation, ce qu'il y a en vitrine) et lui dépose ce qu'il a
en main (une photo, le plan du magasin). Arbitrages owner du 11/09 : la mémoire vit CHEZ NOUS, par site,
avec l'auteur — jamais dans un espace hébergé par Anthropic ; l'agent se construit À CÔTÉ de
`/api/insight/prompt` (7 000 lignes), jamais dedans.

Ce document dit l'ÉTAT au présent (ce qui est livré sur la branche `feat/explorer-agentique`, base
`dev` @ `94afd6ee`) et, en § 9, ce qui reste à faire à l'impératif.

---

## 1. Ce que c'est

`POST /api/explorer/agent` (`src/pages/api/explorer/agent.ts`) est un endpoint agentique : le modèle
converse avec l'exploitant, LIT le site par cinq outils, ÉCRIT ce qu'on lui dit, et rend un tour de
réponse avec la liste de ce qu'il a lu et enregistré.

- **Modèle** : `modelFor("agent")` = `claude-opus-5` (`src/lib/ai/models.ts`, rôle ajouté le 11/09),
  thinking adaptatif (`thinking: { type: "adaptive" }`), `max_tokens` 16 000.
- **Boucle** : le tool runner du SDK installé — `client.beta.messages.toolRunner(...)` +
  `betaZodTool` (`@anthropic-ai/sdk` **0.88.0**, qui les porte : aucune montée de version n'a été
  nécessaire), `max_iterations` 8, `runUntilDone()`.
- **Prompt système** : `SYSTEME_FR` (`src/lib/explorer/agentSystem.fr.ts`), STABLE — aucune date, aucun
  site, aucun identifiant — en premier bloc avec `cache_control: { type: "ephemeral" }`. Tout ce qui varie
  est dans les messages ; c'est la condition pour que le cache serve (`usage.cache_read_input_tokens`).
- **Sans état** : le client renvoie l'historique complet ; le serveur ne garde rien entre deux tours hors
  la trace (§ 2.2).
- **Transport** : `stream: true` rend du SSE au contrat de `prompt.ts` — un événement `tool` par appel
  d'outil pendant la réponse, puis UN événement `result { status, body }`. Sans `stream`, la réponse est
  le JSON directement.

Le contrat du corps et de la réponse :

```
POST /api/explorer/agent
{ location_id, messages: [{ role: "user" | "assistant", content }],
  files?: [{ kind: "image" | "pdf", media_type, data_base64, name }], thread_id?, stream? }

→ { ok: true, thread_id,
    assistant: { text, stop_reason, refused },
    tool_calls: [{ name, input, ok, summary, ms, label_fr }],
    usage: { input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens }, model }
```

Bornes : 40 tours, 20 000 caractères par tour, 4 fichiers, 32 Mo par fichier (la limite de l'API),
10 appels par minute et par utilisateur (`rate-limit.ts`).

### Le piège zod (conservé comme avertissement permanent)

`zod` 3.25.76 est celui d'Astro (`^3.25.76`, `npm ls zod`) ; il expose l'API v3 à la racine `zod` et
l'API v4 sous `zod/v4`. Le helper du SDK (`helpers/beta/zod.mjs`) APPELLE `z.toJSONSchema` de `zod/v4` —
un schéma v3 y jette `Cannot read properties of undefined (reading 'def')` — mais sa déclaration
(`zod.d.ts`) TYPE `inputSchema` sur la racine `zod`. Les schémas des outils sont donc écrits avec
`zod/v4`, et l'UNIQUE cast vit dans le wrapper `outil()` de `agentTools.ts`, qui garde les arguments de
`run` typés par le schéma. Monter `zod` en 4 casserait Astro : ce n'est pas une option.

---

## 2. Les trois couches de mémoire

| Couche | Où | Grain | Qui la lit |
|---|---|---|---|
| **2.1 La mémoire de travail du site** — ce que l'exploitant a dit de son espace | écrite dans `raw.explorer_site_memory`, lue par `semantic.vw_insight_event_site_memory` | `(location_id, subject)`, avec `author_user_id`, `author_role owner|member`, `source conversation|outil`, `created_at`, `superseded` | l'agent (`lire_memoire`), demain les faits du jour et Piloter |
| **2.2 La trace des tours** — ce qui s'est dit | `raw.explorer_agent_turns` | un tour reçu ou rendu : `thread_id`, `turn_index`, `role`, `content` JSON `{ text, files[noms], tool_calls, stop_reason }`, `user_id` sur le tour user seulement | personne dans l'app en incrément 1 (lisible en BigQuery) |
| **2.3 Le contexte du tour** — la conversation en cours | les `messages` renvoyés par le client + le cache du prompt système | un fil (`thread_id`) | le modèle, pendant la réponse |

### 2.1 La mémoire de travail — règles

- **Par SITE, avec l'AUTEUR.** Une note appartient au site (`location_id`), jamais à l'utilisateur seul
  (mémoire `un-suivi-appartient-a-un-site`) ; l'auteur est gardé (`author_user_id`, `author_role`) comme
  sur les notes-cause (`analytics.day_notes`, `clerk_user_id`). Le rôle vient de l'accès : `owner` si le
  site est dans `locals.all_location_ids`, `member` s'il est dans `member_location_ids`.
- **Append-only, la dernière ligne fait foi.** L'app n'édite jamais une ligne (insertion en flux : pas de
  DML pendant 90 minutes). Redire un sujet = une nouvelle ligne ; retirer un sujet = une ligne
  `superseded = true` (corps `(retiré)`). La vue rend la dernière ligne de chaque `(location_id,
  subject)` quand elle n'est pas un retrait.
- **Le sujet est une clé** : espaces repliés, minuscules (`normalizeSubject`) — « Vitrine » et
  « vitrine  » sont le même sujet. 120 caractères au plus ; le corps, 4 000.
- **L'app ne lit JAMAIS raw** (owner 10/09). `readSiteMemory` lit UNIQUEMENT la vue semantic ; `writeSiteMemory`
  écrit la table raw — le côté producteur, permis. Le garde `warehouseBoundary.guard.test.ts` reste vert
  (aucun `FROM raw.` nouveau).
- **La vue n'est pas construite.** Elle est livrée par la PR
  [ms_database#143](https://github.com/Ajuria/ms_database/pull/143) (branche `feat/explorer-site-memory` :
  source `raw.explorer_site_memory` déclarée dans `staging/app_activity/sources.yml`,
  `stg_explorer_site_memory`, `vw_insight_event_site_memory` — contrat enforced, test d'unicité
  `(location_id, subject)` ; les deux SQL rendus avec refs inlinés passent `bq query --dry_run` en EU).
  Tant qu'elle n'est pas mergée et buildée, la lecture rend `[]` (le `.catch` de `readSiteMemory`) et
  l'outil dit « Aucune note en mémoire pour ce site. » — l'écriture, elle, fonctionne dès maintenant. Le
  contrat de lecture est prouvé par `siteMemory.test.ts` sur un client BigQuery simulé, jamais contre la
  vraie vue.
- **Les tables existent en EU** : `raw.explorer_site_memory` (9 colonnes REQUIRED : `memory_id,
  location_id, subject, body, author_user_id, author_role, source, created_at TIMESTAMP, superseded
  BOOLEAN`) et `raw.explorer_agent_turns` (8 colonnes : `turn_id, location_id, thread_id, turn_index
  INTEGER, role, content, user_id NULLABLE, created_at TIMESTAMP`) — `bq show` du 11/09.

### 2.3 Pourquoi pas l'outil `memory_20250818` d'Anthropic en incrément 1

L'outil mémoire d'Anthropic est un système de fichiers que le modèle pilote (`view`, `create`,
`str_replace`, `delete` sur des chemins), avec un backend à écrire chez nous. Il ne connaît ni le site,
ni l'auteur, ni le sujet comme clé : il faudrait projeter `(location_id, subject, auteur)` sur des chemins
et réécrire des fichiers entiers — l'inverse de l'append-only par ligne que la vue attend. Deux outils
explicites (`lire_memoire`, `ecrire_memoire`) portent le grain owner tel quel et sont testables sans
réseau. **Décision : pas de `memory_20250818` en incrément 1.** À reconsidérer seulement si l'owner
veut une mémoire que le modèle organise lui-même par fichiers.

Les Managed Agents sont exclus par l'arbitrage owner (la mémoire chez nous, jamais chez Anthropic).

---

## 3. La surface d'outils

Cinq outils, dans `src/lib/explorer/agentTools.ts`. Chacun ne lit que la couche `semantic` ou une lib
existante, et n'écrit que dans une table `raw` que l'app produit. Le module est PUR vis-à-vis de l'auth
et du réseau : l'endpoint lui passe des fonctions (`deps`), c'est ce qui le rend testable. Chaque appel
est ENREGISTRÉ (`record` : nom, entrée, issue, résumé français, durée) — c'est ce que le proto affiche
et ce que la trace garde.

| Outil | Entrée | Source | Rend au modèle |
|---|---|---|---|
| `lire_poles` | — | `listPoles` (`src/lib/dispositifs/poleReading.ts` : `analytics.action_commitments` + `semantic.vw_insight_event_dispositif_components`) | les pôles (familles, responsable, levier) et les composants de leur version courante (type, rôle, libellé) — jamais un identifiant |
| `lire_familles` | — | `readSiteFamilies30d` → `semantic.vw_insight_event_client_offering_daily` (colonnes vérifiées le 11/09 : `location_id, transaction_date, item_category, revenue`) | les familles vendues sur les 30 derniers jours MESURÉS (bornés au dernier jour du site, pas 30 jours calendaires), CA total, jours vendus, CA par jour, la fenêtre exacte. **Pas `listSiteFamilies` de `kpiRegistry.ts`** : elle lit `raw.client_transactions`, interdit à une lecture nouvelle |
| `lire_photos` | `pole?` (nom ou partie du nom, accents ignorés), `avec_images?` | le `GET` de `src/pages/api/dispositifs/photos.ts`, importé et appelé en interne (comme `admin/invite.ts` importe `profile/save.ts`) — jamais réécrit ; son rendu v2 (exposition, niveaux, familles présentes, N° sur le plan) entre tel quel dans les champs | la dernière photo lue de chaque composant : ses champs, puis l'image en bloc `image` quand elle tient (8 images par appel, 1,5 Mo chacune, 6 Mo au total — au-delà, « image trop lourde pour être regardée ») ; les composants sans photo, comptés |
| `lire_memoire` | `sujet?` | `readSiteMemory` → `semantic.vw_insight_event_site_memory` | une ligne par sujet, l'auteur (exploitant / membre), la date JJ/MM/AAAA, « lu par un outil » si `source = outil` |
| `ecrire_memoire` | `sujet`, `contenu`, `origine?` (conversation / outil), `retirer?` | `writeSiteMemory` → `raw.explorer_site_memory` | « Enregistré — sujet « … », le JJ/MM/AAAA. » ou « Sujet « … » retiré. » |

Les textes rendus AU MODÈLE (`polesToText`, `familiesToText`, `memoryToText`) disent l'absence et la
chiffrent (« Aucun pôle déclaré sur ce site. », « 1 photo lue, 1 composant sans photo. »). Ils ne sont pas
des chaînes visibles ; les chaînes visibles sont en § 7.

---

## 4. Les fichiers en entrée

`files[]` ne s'attache qu'au DERNIER tour (celui qu'on envoie) ; l'historique renvoyé reste du texte.

- **Image** (`image/jpeg`, `image/png`, `image/webp`, `image/gif`) → bloc `image` base64, AVANT le texte.
- **PDF** (`application/pdf`) → bloc `document` base64 avec `title` = le nom du fichier, AVANT le texte.
- `kind` et `media_type` doivent concorder ; base64 sans espaces ; 4 fichiers, 32 Mo chacun.
- La trace (§ 2.2) garde le NOM et le TYPE du fichier, jamais les octets.
- Ce que le modèle lit sur un fichier se dit comme une lecture (« sur la photo, … »), jamais comme un fait
  mesuré ; une personne visible ne se décrit jamais (`SYSTEME_FR`). Ce qu'il retient d'un fichier à la
  demande de l'exploitant s'enregistre avec `origine = outil`.

---

## 5. Auth, et le contournement de dev

- **Prod** : Clerk ; `requireLocationAccess(locals, location_id)`
  (`src/lib/requireLocationOwnership.ts` — owner ET membre lisent, admin passe). Sans `clerk_user_id` : 401.
- **Dev** : en `astro dev` avec `MS_AUTH_BYPASS=1`, `src/middleware.js` laisse passer
  `/api/explorer/agent` sans session — la MÊME liste `isPromptRoute` que `/api/insight/prompt`, rien
  d'autre n'est touché (c'est la totalité de la modification du middleware). L'endpoint fait alors ce que
  `prompt.ts` fait en bypass (l. 2303-2313) : le site vient du corps, l'auteur est `dev_user_id`
  (défaut `dev-bypass`, rôle `owner`), et les `locals` internes passés au `GET` des photos sont
  `{ clerk_user_id, all_location_ids: [location_id] }`. CORS ouvert en dev seulement : le proto tourne
  sur 4173 (`npm run harness`) et appelle 4321. Rien de tout cela n'existe hors `import.meta.env.DEV`.

---

## 6. Premier cas d'usage — « décris-moi mon espace »

Le proto `tools/proto/explorer-agent-proto.html` (servi par `npm run harness`, 4173) : une question, un
sélecteur de photo ou de plan PDF, et sous la réponse la liste de ce que l'agent a lu et enregistré —
les appels d'outils tels que le serveur les rend (`label_fr` + `summary` + durée). `?location_id=`
pré-remplit le site. Le composer reprend les mots de `prompt.astro` (l. 227 « Posez votre question, ou
déposez un fichier… », l. 232 « Envoyer »). Le proto meurt au commit qui livre la surface ; la surface
elle-même (dans Explorer ? une page ?) est un arbitrage owner en attente.

Le parcours attendu, dicté par `SYSTEME_FR` : au début d'une conversation sur l'espace, `lire_memoire`
puis `lire_poles` ; ensuite `lire_familles` / `lire_photos` selon la question ; quand l'exploitant dit
quelque chose que les outils ne savent pas, `ecrire_memoire`. Le modèle n'enregistre que ce qui est DIT,
jamais une hypothèse.

### Mesure du 11/09 sur le compte réel (Muse Square, `f10c3e58…`)

Deux tours réels, `npm run dev` sur 4321 (worktree, `MS_AUTH_BYPASS=1`, auteur `dev-owner-11-09`), fil
`32fc129b-0de5-49ca-9b0d-7ba7504500de`. Le compte n'a AUCUN pôle déclaré (0 composant dans
`vw_insight_event_dispositif_components`) : c'est ce qui rend le cas intéressant — l'agent doit dire
l'absence, pas la combler.

**Tour 1 — « décris-moi mon espace »** (HTTP 200, 22 s, `claude-opus-5`, `end_turn` ; 797 tokens en
entrée, 812 en sortie, 3 208 lus en cache — le prompt système est servi du cache dès la deuxième requête
de la boucle). Quatre appels, dans l'ordre dicté par `SYSTEME_FR` :

| Outil (libellé rendu) | Entrée | Résumé rendu | Durée |
|---|---|---|---|
| Lecture de ce que vous avez dit de votre espace | — | rien de noté sur cet espace | 1,4 s |
| Lecture de vos pôles et de leurs composants | — | aucun pôle déclaré | 2,6 s |
| Lecture des photos de vos composants | `avec_images: false` | aucun pôle, aucune photo | 1,1 s |
| Lecture de vos familles de produits & services | — | 9 familles sur 30 jours mesurés (du 13/08/2026 au 11/09/2026) | 1,6 s |

Réponse (extraits) : « Côté espace, je n'ai rien : 0 pôle déclaré, donc aucun composant (ni vitrine, ni
linéaire, ni caisse) et aucune photo. Aucune note en mémoire non plus. Je ne peux donc pas vous décrire
votre lieu — je ne l'ai jamais vu. » Puis les neuf familles avec CA sur la fenêtre et CA par jour vendu
(« Coffee — 20 014 € sur 30 jours, soit 667 € par jour » … « Packaged Chocolate — 357 € sur 20 jours,
soit 18 € par jour vendu »), et une question précise pour la suite (combien d'endroits où l'on vend ou
montre quelque chose, lequel le client voit en premier).

**Audit du français, tour 1** — une phrase REFUSÉE à la relecture : « Coffee et Tea **font** à eux deux
1 154 € par jour » = la forme « X a fait N € » refusée par l'owner le 06/09, au pluriel (le garde
`tournures.fr.ts` n'attrape que « a fait N »). Correctif appliqué avant le tour 2 : `SYSTEME_FR` porte
la règle owner (« un montant a pour sujet celui qui le génère … jamais « X font N € » »). À faire :
étendre le motif du garde au pluriel (§ 9).

**Tour 2 — l'exploitant dit son espace** (« Nous avons un seul comptoir, à gauche en entrant : la
machine à café et les thés en vrac y sont. Les paquets de café en grains sont sur une étagère au fond,
que le client ne voit pas depuis la porte. Retiens ça. ») — HTTP 200, 17,6 s, 3 320 tokens lus en cache.
Deux appels `ecrire_memoire`, `origine: conversation` : sujets « comptoir » et « etagere du fond »
(le modèle a écrit le sujet sans accent ; `normalizeSubject` ne touche pas aux accents — un même sujet
redit avec accent ferait une clé distincte, à traiter en § 9). Relecture BigQuery : 2 lignes dans
`raw.explorer_site_memory` (`author_user_id = dev-owner-11-09`, `author_role = owner`, `source =
conversation`, `superseded = false`) ; 4 lignes dans `raw.explorer_agent_turns` pour le fil (user avec
`user_id`, assistant sans).

Réponse (extraits) : « C'est noté, deux sujets : le comptoir unique à gauche en entrant … et l'étagère
du fond pour les paquets de café en grains, invisible depuis la porte. » Puis le rapprochement que les
outils permettent : ce qui est sur le comptoir (Coffee 667 € par jour, Tea 487 € par jour, vendus
chaque jour de la fenêtre) contre ce qui est au fond (Coffee beans, 116 € par jour vendu sur 22 jours),
et deux questions (« Le thé en vrac du comptoir, est-ce bien la même chose que la famille Loose Tea … ? »,
« sur l'étagère du fond, y a-t-il autre chose que les grains … ? »).

**Audit du français, tour 2** — à relire par l'owner, non validé : « Coffee à 667 € par jour » (montant
sans verbe du métier — forme owner : « Coffee génère 667 € par jour ») ; « c'est le même angle mort qui
les tient » (inférence conditionnelle, dite avec « si », mais tournure de démonstration proche de « c'est
ce qui tient », refusée le 28/08). Toute phrase que l'owner refuse entre dans `tournures.fr.ts`.

---

## 7. Les chaînes visibles — tableau lexique

Ce que l'exploitant VOIT : les cinq libellés d'outils (`OUTILS_FR`, affichés par le proto pendant la
réponse), les résumés d'appel (`summary`), les chaînes du proto, et les erreurs de l'endpoint rendues
dans le bandeau du proto. Les RÉPONSES du modèle sont générées : le lexique ne peut pas les vérifier
avant coup — `SYSTEME_FR` porte les règles (mots du produit, dates JJ/MM/AAAA, montants avec référentiel,
absence chiffrée, aucun geste sur les commandes / le stock, aucun identifiant), et la trace (§ 2.2)
permet à l'owner de relire chaque réponse rendue. Toute phrase refusée s'ajoute à `tournures.fr.ts`.

Les cinq libellés sont composés sur la forme approuvée des étapes d'Explorer :
`contextCopy.STAGE_FR` l. 138 « Lecture de vos ventes » (citée, rendue dans le chat Consulter). Le
concept « ce que l'exploitant a dit de son espace » n'a PAS de mot au lexique (§ À arbitrer) — aucune
chaîne n'en invente un : elle dit la chose.

Trois vérifications de LANGUE d'abord (sujet nommé · verbe du métier · unité et référentiel), puis les
tests 8-13. « s.o. » = sans objet : un libellé d'étape ou un compte n'est ni un geste ni une affirmation.

| Chaîne | Langue (a·b·c) | 8 verbe + objet | 9 retournement | 10 condition | 11 donnée | 12 maxime | 13 écart, pas volume |
|---|---|---|---|---|---|---|---|
| Lecture de vos pôles et de leurs composants | nominal d'étape, forme STAGE_FR · objet nommé · s.o. | s.o. (étape, pas un geste) | s.o. | s.o. | s.o. | s.o. | s.o. |
| Lecture de vos familles de produits & services | idem — le mot du lexique en entier | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| Lecture des photos de vos composants | idem | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| Lecture de ce que vous avez dit de votre espace | idem — dit la chose, pas de mot inventé | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| Enregistrement de ce que vous venez de dire de votre espace | idem | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| 3 pôles, 7 composants (résumé) | compte d'objets nommés · s.o. · unité = l'objet | s.o. | s.o. | s.o. | ✅ vient du compte | s.o. | ✅ un compte, pas un €  |
| aucun pôle déclaré | absence dite | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| 4 familles sur 30 jours mesurés (du 12/08/2026 au 10/09/2026) | fenêtre dans la phrase | s.o. | s.o. | ✅ la fenêtre | ✅ | s.o. | ✅ |
| aucune vente lue | absence dite | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| 2 photos lues, 2 images regardées, 1 composant sans photo | compte + absence chiffrée | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| aucune photo | absence dite | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| 1 sujet noté · rien de noté sur cet espace | compte / absence | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| « vitrine » enregistré · « vitrine » retiré | objet nommé (le sujet) + participe du geste fait | ✅ enregistrer / retirer, sur le sujet | s.o. | s.o. | ✅ | s.o. | s.o. |
| Posez votre question, ou déposez un fichier… (proto) | CITÉE de prompt.astro l. 227 | ✅ poser / déposer | s.o. | s.o. | s.o. | s.o. | s.o. |
| Envoyer (proto) | CITÉE de prompt.astro l. 232 | ✅ CTA verbe | s.o. | s.o. | s.o. | s.o. | s.o. |
| Vous · Explorer (proto, qui parle) | noms | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| Serveur · Site (location_id) (proto, champs de réglage) | libellés techniques d'un PROTO de dev — l'UUID y est saisi par l'owner ; interdit sur toute surface livrée (`no-raw-ids-to-user`) | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |
| tokens : N en entrée (N en cache), N en sortie · modèle (proto) | mesure de dev, PROTO seulement — ne vit pas sur une surface livrée | s.o. | s.o. | s.o. | ✅ | s.o. | s.o. |
| location_id requis · messages requis · fichier : image (jpeg, png, webp, gif) ou PDF · … (erreurs 400) | messages de contrat API, rendus dans le bandeau du proto ; sur une surface livrée, la surface les traduit (comme `ie-prompt.js` pour prompt.ts) | s.o. | s.o. | s.o. | s.o. | s.o. | s.o. |

Vérification mécanique : `agentTools.test.ts` passe `OUTILS_FR` et les formes de résumé contre
`TOURNURES_LLM` (`tournures.fr.ts`) et `MOTS_BANNIS` (`evenement.fr.ts`) — verts au 11/09, et vus tomber
sur mutation (« pôle » → « pole »).

**Mot banni à signaler, pas à corriger** (règle 2) : « meuble » — au `MOTS_BANNIS` depuis le 03/09, mot
owner du 11/09 dans « Meuble à niveaux » (lexique § À arbitrer). `SYSTEME_FR` ne l'emploie pas ; le
modèle peut le RECEVOIR par le rendu des photos (`exposition_label_fr`). Rien n'est corrigé ici : le
conflit est dans la file owner.

---

## 8. Hors périmètre (incrément 1)

- Aucune surface livrée : pas de page, pas d'entrée de menu, pas de lien depuis Explorer — le proto seul.
- Aucun outil qui écrit ailleurs que `raw.explorer_site_memory` : pas de création de pôle, de photo,
  d'engagement, de note-cause depuis l'agent.
- Aucun outil sur les ventes au-delà des familles 30 jours (pas de jour, pas d'heure, pas de résultat
  habituel) : le chat Consulter (`prompt.ts`) reste la voie des questions chiffrées.
- Aucune lecture de `raw.explorer_agent_turns` par l'app, donc aucune vue dbt pour elle.
- Aucun outil `memory_20250818`, aucun Managed Agent (§ 2.3).
- Aucun `fallbacks` (repli de refus côté serveur) : le paramètre n'est pas typé dans le SDK 0.88.0 ;
  un `stop_reason: "refusal"` est rendu tel quel (`assistant.refused = true`).
- Pas de compaction ni de gestion de contexte : 40 tours au plus, l'historique est renvoyé en entier.

---

## 9. Ce qui reste à faire

1. **Owner : merger ms_database#143**, puis un build dbt Cloud construit `vw_insight_event_site_memory`
   ; vérifier ensuite `lire_memoire` sur une note réelle (`bq query` sur la vue, puis un tour « qu'est-ce
   que je t'ai dit de ma vitrine ? »).
2. **Owner : essayer le proto** sur le compte Muse Square avec une photo puis le plan PDF
   (`npm run dev` sur 4321 avec `MS_AUTH_BYPASS=1`, `npm run harness`, ouvrir
   `http://localhost:4173/tools/proto/explorer-agent-proto.html?location_id=f10c3e58-326e-4e38-947c-d59fcbe51df5`),
   et relire les réponses rendues : toute phrase refusée entre dans `tournures.fr.ts`.
3. **Owner : arbitrer la surface** (dans Explorer, à côté du chat Consulter, ou une page à part) et LE
   mot pour « ce que l'exploitant a dit de son espace ». Le proto meurt au commit qui livre.
4. Owner : relire les deux réponses de la mesure du 11/09 (§ 6) et refuser ce qui n'est pas du français de commerçant — chaque refus entre dans `tournures.fr.ts`.
5. Quand un lecteur naît pour la trace des tours, créer sa vue semantic AVANT d'écrire la lecture.
6. Étendre le motif « X a fait N € » de `tournures.fr.ts` au pluriel (« font N € ») — attrapé au tour 1
   à la relecture, pas par le garde.
7. Décider si `normalizeSubject` retire les accents (« étagère » / « etagere » = un seul sujet) — le
   modèle a écrit un sujet sans accent au tour 2.
