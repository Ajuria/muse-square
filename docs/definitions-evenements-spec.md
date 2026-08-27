# Les trois objets « événement » — définitions et branchement — SPEC DE TRAVAIL

> **Demande owner (26/08)** : reprendre la distinction faite dans Agir entre **événements
> concurrents** (opération + recouvrement d'industrie + clientèles primaire et secondaire →
> candidat à cannibaliser le trafic) et **activité événementielle autour du client** (candidate à
> le porter). « Les définitions doivent être streamlinées entre pages pour cohérence. »

## Ce que ce document NE re-tranche PAS

Le discriminant est **déjà arbitré**, sur la question owner mot pour mot, dans
`docs/competition-split-spec.md` (28/07) :

> - **Cannibaliser** exige une substitution → événement du **même secteur** (ou audience qui recoupe).
> - **Entraîner** ne l'exige pas → n'importe quel événement met du public dans le quartier.
> Donc on ne mesure pas « la densité » mais on la **scinde**. Une journée peut porter les deux.

Sont donc acquis et **non rediscutés ici** : le discriminant, le seuil **25 %**
(`pct_same_bucket_5km`, déployé en dbt), la doctrine « ne pas tuer la règle de tir » (une forte
densité non concurrente reste actionnable — c'est du public dans le quartier), et le report du
**Niveau 2** (le signe de l'effet par régression : sous-dimensionné, plus petit effet détectable
90 €/j = 8,4 % du CA sur f10c3e58, ~2 ans d'historique nécessaires pour 3 %).

`docs/menaces-vs-bruit-spec.md` (25/08) rappelle le coût de l'oubli : sa v1 a dû être réécrite pour
avoir « re-dérivé la doctrine du 28/07 sans la citer, et proposé un seuil CONCURRENT du seuil déjà
en production ». **Ce document cite, il ne redérive pas.**

Ce document ajoute la seule chose qui manque : **le branchement**. La doctrine vit dans une spec de
correction dbt ; les surfaces, elles, n'ont jamais été alignées dessus.

---

## 1. Les trois objets, définis par leur VARIABLE (jamais par leur nom)

**Règle fondatrice** : un objet se reconnaît à la colonne qui le produit, pas au mot employé sur la
carte. Le mot suit la variable — jamais l'inverse. C'est la règle que `docs/lexique.md:48` a déjà
posée pour l'indice : « le mot "concurrent" reste réservé aux suivis (`competitor_tracking`) et au
même secteur (`same_bucket`) ».

| | **A — Opération d'un concurrent** | **B — Activité autour** | **C — Vos opérations** |
|---|---|---|---|
| Ce que c'est | Une opération commerciale d'un acteur qui vise le même public que vous | Les événements publics du quartier, tous secteurs | Ce que VOUS organisez |
| Variables | `entity_is_followed` (suivis) · `*_same_bucket_count` · `industry_overlap` · `audience_overlap_pct` · `conflict_score` | `events_within_*_count` (tous secteurs) · `competition_index_local` · `analytics.location_public_events` | `raw.saved_items` × `raw.saved_item_dates` (dossier d'opération) |
| Candidat à | **Substituer** votre trafic | **Porter** votre trafic | — |
| Seuil de qualification | **40 %** de recouvrement d'audience (entité ou événement) | aucun — c'est un volume | — |
| Seuil de scission d'une JOURNÉE | **25 %** (`pct_same_bucket_5km` ≥ 0,25 → la journée est disputée) | < 25 % → public à capter | — |
| Doc de référence | `competition-split-spec.md`, `lexique.md:45` | `competition-split-spec.md`, `lexique.md:48` | `evenement-dossier-spec.md` |

**Les deux seuils ne sont pas concurrents et ne se remplacent pas** — c'est l'erreur exacte qu'a
commise `menaces-vs-bruit-spec.md` v1 :
- **40 %** qualifie une **entité ou un événement** : « cet acteur-là dispute-t-il mon public ? »
- **25 %** scinde une **journée** : « la densité de ce jour est-elle majoritairement de mon secteur ? »

### Le signe est MESURÉ, jamais présumé — le point le plus important

« A cannibalise, B porte » est une **hypothèse de classement**, pas un verdict. Le moteur partagé
(`src/lib/insightFamilies/impactContrast.ts`) laisse le signe libre : sa porte `hi > lo` porte sur
les **seuils de densité**, jamais sur le delta, et le tier se décide sur `Math.abs(t)` — un effet
négatif et un effet positif franchissent la même porte.

**Contre-exemple mesuré, à opposer à toute présomption** : sur f10c3e58, l'activité des concurrents
**suivis** (objet A) mesure **+21,6 pp** (36 j vs 31 j, t ≈ 5, tier émergent) — une expo voisine
*porte* le café. L'indice ambiant (objet B) mesure **−5,7 ± 4,7** : nul mesuré.

**Conséquence de rédaction** : A et B nomment un **canal candidat** (substitution vs entraînement)
et **déterminent le geste** (Niveau 1 : différencier vs capter). Ils ne préjugent jamais du signe.
Une carte qui dit « cannibalise » sans mesure d'audience ≥ 40 % ment sur ce qu'elle sait.

### A/suivis et A/industrie restent séparés

Décision owner déjà en place, à reprendre telle quelle (`competitor.ts:34-36`) : l'activité des
suivis et la densité même-secteur sont **corrélées**, mesurées **séparément**, et chaque fait nomme
SA variable — les deux moteurs ne doivent jamais se lire comme une seule affirmation.

---

## 2. Les défauts vérifiés (chacun avec sa preuve)

Chacun a été vérifié dans le fichier, pas déduit d'un nom.

### D1 — RÉSOLU le 27/08 (une autre session) — `ambient_index` portait un label FAUX

`src/lib/insightFamilies/competitor.ts:82` :
```ts
ambient_index: "Pression locale même secteur (indice)",
```
`competitor.ts:126`, sur **la même variable** :
```ts
`Les jours de forte activité dans votre périmètre (tous secteurs, indice quotidien pondéré par la distance)…`
```
La variable est `competition_index_local` — **sans aucun filtre de secteur** (`lexique.md:48`).
Le label dit « même secteur » : c'est faux. Il dit « pression » : mot **banni** pour cette source.
Les deux s'affichent **l'un au-dessus de l'autre** dans `msImpactBlock` (`card-kit.js:308`) :
l'utilisateur lisait la contradiction en un coup d'œil.

**Corrigé le 27/08** : le label est devenu `"Activité dans votre périmètre (indice)"` — exactement
le mot que `lexique.md:48` réserve à cette source. Cause de survie identifiée au passage :
`insightFamilies/competitor.ts` n'était pas dans les `SURFACES` du garde-fou de copie ; il y entre.
**Conséquence pour le trou 1 ci-dessous** : « activité dans votre périmètre » est désormais PRIS par
l'INDICE. Le mot du grain LISTE d'événements doit donc s'en distinguer — ma proposition
« Activité autour de vous » reste valide et le fait, mais les deux ne peuvent plus fusionner.

### D2 — Le volet « Événements publics autour de vous » est déjà filtré même-secteur

`tableau.astro:1029` titre un volet **« Événements publics autour de vous »** (cadrage B, portage).
Mais sa source est filtrée en amont — `api/insight/dashboard.ts:688`, verbatim :
> « Entonnoir déjà appliqué à la matérialisation : **même bucket que le site** + ≤ 15 km, 14 j »

Le volet montre donc des événements **de votre secteur** (candidats A) sous un titre qui promet du
public à capter (B). Son message vide le dit d'ailleurs sans le savoir (`tableau.astro:1044`) :
« Aucun événement **de votre secteur** dans votre zone ». Le titre et le contenu se contredisent.

### D3 — Le titre du volet A emploie le mot réservé à B

`tableau.astro:930` titre **« Activité dans votre périmètre »** un volet dont le contenu est le
classement par **risque de cannibalisation** (score du mart : audience commune + secteur +
proximité + collision de date, `tableau.astro:977`) et « N concurrents que vous suivez » — du A pur.
Or « activité dans votre périmètre » est **le mot que `lexique.md:48` attribue à l'indice tous
secteurs**, c'est-à-dire à B. Combiné à D2, les deux volets portent chacun le cadrage de l'autre.

*Nuance assumée* : le volet A contient aussi des comptes d'événements bruts (500 m / 5 km), qui
sont du B. Ce n'est donc pas une simple inversion de titres — c'est un volet mixte dont le titre a
choisi la mauvaise moitié.

### D4 — Des comptes tous secteurs étiquetés « Concurrence »

`src/lib/ai/ui_normalized/ui_normalized_v2.ts:473-477` :
```ts
facts.push(`Concurrence : ${r.events_within_10km_count} événement(s) à moins de 10 km`);
```
`events_within_10km_count` est tous secteurs → B. Étiqueté « Concurrence » → A. En violation
directe de la consigne portée par `packagePromptV3.ts:94`, qui interdit ces variables au texte
narratif (« signaux internes non interprétables directement »). Même faute :
`insight.astro:1582` (titre « Pression concurrentielle » sur une grille de `events_within_*_count`).

### D5 — « Concurrents directs » compte des ÉVÉNEMENTS, pas des concurrents

`insight.astro:1976` :
```js
text: 'sollicitée par ' + num(day.events_within_5km_same_bucket_count) + ' concurrents directs'
```
La variable compte des **événements** du même secteur. Et « concurrent direct » est **réservé par
`lexique.md:45`** à « un concurrent à public commun élevé et proche » — ici il n'y a ni mesure
d'audience, ni proximité fine, seulement le bucket d'industrie à 5 km.

### D6 — Sept formulations pour le même seuil de 40 %

Dans le seul `insightFamilies/events.ts` : « dispute d'audience » (L353), « ciblent votre public »
(L311), « vise votre public » (L341), « peu disputé » (L312), « territoire dégagé » (L313, L324),
« dispersion » (L321, L323), « cannibalise » (L278). Même concept, même seuil, sept mots.

### D7 — La hiérarchie primaire/secondaire existe en base et est écrasée au calcul

`days.astro:2387-2395` : l'intersection des audiences est **non pondérée**. Un match
secondaire × secondaire produit exactement la même phrase (« Cible les mêmes audiences ») qu'un
match primaire × primaire. C'est précisément la distinction que la demande owner nomme — elle
existe dans la donnée (`primary_audience_1/2` côté lieu, `competitor_primary/secondary_audience`
côté concurrent) et disparaît au calcul.

### D8 — Quatre moteurs de recouvrement d'audience, aucun canonique

1. Intersection de tokens — `days.astro:2389`
2. `threat_audience_overlap_pct` du mart — `events.ts:274`
3. `audience_overlap_pct` du threat_profile — `competitor.ts:216`
4. Matching lexical sur le texte crawlé (`EP_KW`) — `tableau.astro:994`

Quatre réponses possibles à « ce public est-il le mien ? ». Aucune déclarée faisant foi.

### D9 — Les filtres du fil Agir classent par SIGNE de l'euro, pas par nature d'objet

`pulse.astro:1679` : `enjeu.eur_year > 0 ? 'capture' : 'defend'`. Un événement **public positif**
tombe donc dans « Opportunités » et un signal négatif dans « Menaces », quelle que soit sa nature.
À rapprocher de `lexique.md:49`, où l'owner a justement demandé que ces filtres portent **la NATURE
du signal**. Aujourd'hui ils portent son signe.

---

## 3. Les mots — ce qui manque, et ce que je propose

Rappel de procédure (`CLAUDE.md`, règle 2) : **un concept sans mot se signale, il ne s'invente pas.**
Ci-dessous, les chaînes RENDUES aujourd'hui (règle 4 : citer le rendu avant d'écrire), puis mes
propositions — à trancher par l'owner, aucune n'est appliquée.

### Trou 1 — le mot de l'objet B au grain « liste d'événements »

`lexique.md:48` tranche le mot de l'**indice** (« activité dans votre périmètre »). Il ne dit rien
de la **liste**. Cinq formulations coexistent en production :

| Chaîne rendue aujourd'hui | Surface |
|---|---|
| « Événements à proximité — … » | `rapport.astro:112` |
| « Activité autour de vous : N événements à 500 m · N à 5 km » | `evenement.ts:411` (label owner acté) |
| « Événements publics autour de vous » | `tableau.astro:1029` |
| « Paysage événementiel » | `insight.astro:835` |
| « Concurrence : N événement(s) à moins de 10 km » | `ui_normalized_v2.ts:473` (faux, cf. D4) |

**Proposition : « Activité autour de vous »** — c'est le seul des cinq qui soit **déjà un label
owner acté** (`automatisation-spec.md:101`), il est cohérent avec le mot de l'indice
(`lexique.md:48` « activité dans votre périmètre »), et il ne préjuge pas du signe.

### Trou 2 — le mot de l'objet A au grain « événement »

`lexique.md:45` tranche le grain **entité** (« concurrent direct » ; « menace » banni). Le grain
**événement** n'a pas de mot. Formulations en production : « Événement concurrent ouvert
aujourd'hui » (`pulse.astro:777`), « Même public, même date — risque élevé » (`pulse.astro:782`),
« cannibalise » (tag, `card-kit.js:263`), « le plus concurrent » (`action-cards.js:763`),
« chevauchement » (`pulse.astro:823`).

**Proposition : « opération d'un concurrent direct »** (forme longue) / **« opération concurrente »**
(forme courte) — reprend le mot de l'owner (« opération »), hérite de la qualification déjà
arbitrée au grain entité, et dit que c'est un acte commercial daté, pas une entité permanente.

### Trou 3 — le mot du croisement A × C

`tableau.astro:973` est **le seul endroit du produit** où une opération concurrente est mise en
regard des vôtres : « le jour de votre <opération> ». C'est le cœur de la demande owner et il n'a
pas de mot.

**Proposition : « le jour de votre opération »** — la chaîne existe déjà et se lit seule ; il suffit
de la reconnaître comme LE mot plutôt que comme un détail d'affichage.

### Tableau tests 8-13 des trois propositions

Verdicts honnêtes, y compris les non-applicables — un ✅ faux est pire qu'une phrase refusée.

| Test | « Activité autour de vous » | « Opération d'un concurrent direct » | « Le jour de votre opération » |
|---|---|---|---|
| 8 — verbe ordinaire, objet manipulable | **n/a** — groupe nominal, pas un geste | **n/a** — idem | **n/a** — idem |
| 9 — retournement | ✅ le contraire (« aucune activité ») est dicible et parfois vrai | ✅ « opération d'un acteur qui ne vise pas votre public » est dicible | ✅ « un autre jour » est dicible |
| 10 — condition nommée | ✅ un périmètre et une fenêtre | ✅ une entité qualifiée à 40 % + une date | ✅ une date précise, la vôtre |
| 11 — écrivable sans ouvrir le compte ? | ✅ non — le périmètre vient du profil | ✅ non — le recouvrement est mesuré | ✅ non — votre opération est dans votre dossier |
| 12 — maxime | ✅ aucune sentence | ✅ aucune | ✅ aucune |
| 13 — volume absolu | ✅ le mot ne porte pas de volume | ✅ qualification relative, pas un compte | ✅ aucun volume |

**Réserve à porter au même moment** : la chaîne du rapport « **1 240 événements/j en moyenne dans un
rayon de 5 km** » (`rapport.astro:116`) échoue au **test 13** — un volume absolu, faux sur la moitié
du parc (Paris vs Nîmes) et illisible pour un exploitant. Le tilde a été corrigé le 26/08 ; le
volume, lui, reste à remplacer par un écart au résultat habituel du lieu. Hors périmètre convenu,
signalé ici pour arbitrage.

---

## 4. Le branchement — dans quel ordre

Rien ci-dessous n'est fait ; l'ordre suit la sévérité mesurée, pas la facilité.

| # | Geste | Fichier | Dépend d'un mot owner ? |
|---|---|---|---|
| 1 | Corriger le label `ambient_index` (D1) — il contredit sa propre phrase à l'écran | `competitor.ts:82` | Non : `lexique.md:48` tranche déjà |
| 2 | Retirer « Concurrence » des comptes tous secteurs (D4) | `ui_normalized_v2.ts:473-477`, `insight.astro:1582` | Non : `lexique.md:48` |
| 3 | Corriger « N concurrents directs » qui compte des événements (D5) | `insight.astro:1976` | Trou 2 |
| 4 | Aligner les titres des deux volets sur leur contenu réel (D2, D3) | `tableau.astro:930, 1029` | Trous 1 et 2 |
| 5 | Unifier les sept formulations du seuil 40 % (D6) | `events.ts` | Trou 2 |
| 6 | Pondérer primaire/secondaire, ou dire qu'on ne le fait pas (D7) | `days.astro:2389` | Décision, pas un mot |
| 7 | Désigner LE moteur de recouvrement canonique (D8) | 4 sites | Décision |
| 8 | Filtres du fil : nature d'objet plutôt que signe de l'euro (D9) | `pulse.astro:1679` | Décision (cf. `lexique.md:49`) |

**Garde-fou obligatoire** : `docs/lexique.md:9` — toute ligne ajoutée au lexique doit être
répercutée dans `src/lib/fr/evenement.fr.ts` (`MOTS_BANNIS`), testé par
`evenement.fr.guard.test.ts`. Les mots arbitrés ici y entrent dans le même commit.

**Ce que ce chantier ne fera pas** : mesurer le signe de l'effet par régression (Niveau 2 de la
spec du 28/07). Il reste sous-dimensionné, et le prétendre serait exactement le genre d'affirmation
que le Niveau 1 existe pour éviter.
