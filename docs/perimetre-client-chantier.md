# Périmètre de clientèle — chantier code (30/07/2026)

> Décisions figées dans `docs/perimetre-client-spec.md`. Ce document ne décrit que
> l'implémentation : fichiers, ancres, ordre, vérification.
>
> Rappel du principe directeur : **aucun repli automatique**. Sans réponse de l'exploitant, le
> comportement actuel est conservé. Un rayon deviné réintroduirait l'instabilité mesurée (9 lieux
> sur 30 basculaient, dont 7 d'un coup par changement de couverture d'ingestion).

## Le champ

| | |
|---|---|
| Nom | `client_catchment` |
| Grain | `location_id` |
| Valeurs | `'commune'` · `'beyond'` · `NULL` (non répondu) |
| Rayon correspondant | **1 km** · **20 km** · *aucun — comportement actuel* |

`NULL` est un état de plein droit, pas une valeur manquante à combler : c'est lui qui déclenche
l'affichage de la question.

---

## Étage 0 — La colonne 20 km (bloquant absolu)

`fct_location_events_radius_daily` porte **500 m, 1 km, 5 km, 10 km, 50 km**. Le rayon retenu pour
une clientèle « au-delà de la commune » est **20 km**, et cette bande **n'existe pas**.

Rien de ce qui suit ne fonctionne sans elle : à 10 km Les Olivades n'ont que **6 valeurs
distinctes** (dégénéré), à 20 km ils en ont **46**.

Le modèle calcule déjà les distances par bande — ajouter `events_within_20km_count` et son pendant
`events_within_20km_same_bucket_count` est mécanique. **À faire en premier, et à vérifier avant de
coder quoi que ce soit d'autre** : la mesure de référence est 46 valeurs distinctes sur Les
Olivades, obtenue en recalculant les distances à la volée.

## Étage 1 — Stockage et saisie

### 1.1 Colonne

À ajouter au grain `location_id`, **en suivant exactement le chemin de `location_access_pattern`**,
qui est déjà propagé de bout en bout et sert donc de modèle vérifié :

`raw.insight_event_user_location_profile` → `stg_insight_event_user_location_profile` →
`int_client_website_profiles` → `dim_client_location`

Ne PAS surcharger `location_access_pattern` : il porte déjà deux vocabulaires selon la provenance
des lignes et garde trois usages légitimes (proximité transport, mobilité, pondération tourisme).

### 1.2 Endpoint d'écriture

**Nouveau** : `src/pages/api/profile/set-catchment.ts` — POST `{ location_id, catchment }`.

Un endpoint dédié plutôt qu'une extension de `save.ts` : la réponse vient d'un clic sur une carte,
pas d'un formulaire complet. `save.ts` fait un MERGE de ~40 champs et un géocodage ; le réutiliser
ferait payer tout ça pour un mot.

Contraintes :
- vérifier la possession du lieu (`requireLocationOwnership`, déjà en place) ;
- valeurs acceptées strictement `commune` | `beyond`, tout autre rejeté ;
- écrire dans la table de profil **et** synchroniser `dim_client_location`, comme `save.ts` le fait
  à son bloc `dimSyncParams` (ligne ~731).

### 1.3 Formulaire de profil

Ajouter la question au formulaire (`src/pages/profile.astro`) **en plus** de la carte — pour qu'un
exploitant puisse corriger sa réponse sans attendre qu'une carte la lui redemande.

---

## Étage 2 — Le registre (`src/lib/dayClassRegistry.ts`) — **FAIT le 30/07/2026**

> **La prémisse de la spec était FAUSSE, et c'est la mesure qui l'a montré.** La spec écrivait
> « tant que la réponse est absente, garder le comportement actuel (la classe n'existe pas) ».
> `events_high` **existe** : 3 lieux dans `analytics.day_class_impacts` (Muse Square n=6,
> Muse Square Occitanie n=3, Poeiti test n=4). Un `ELSE NULL` aurait supprimé ces trois mesures.
>
> Le `CASE` livré applique donc le PRINCIPE de la spec (ne rien changer sans réponse) et non sa
> DESCRIPTION : `commune` → 1 km, `beyond` → 20 km, **absence de réponse → 500 m, l'existant**.
>
> `client_catchment` est lue sur `c.client_catchment` — `fct_location_context_daily` la porte déjà
> (vérifié sur `INFORMATION_SCHEMA`), donc **aucun join supplémentaire**, ce que le chantier laissait
> à trancher. L'alias `events_500m` est renommé `events_radius` (3 usages suivis, lignes 243/244/258),
> et `index_col` est vidé : il n'était lu nulle part.
>
> Équivalence prouvée : la requête d'agrégat rend des lignes **identiques** avant/après sur les trois
> lieux (12, 10 et 11 classes, mêmes `n`, `avg_gap_eur`, `span_days`).

### Ce qui était prévu (conservé pour mémoire)

### 2.1 La colonne de rayon devient conditionnelle

**Ancre — ligne 209**, dans `dayClassAggregateSql` :
```sql
        e.events_within_500m_count AS events_500m,
```

À remplacer par un `CASE` sur le périmètre du lieu. Le join sur `dim_client_location` est à ajouter
(il n'y est pas encore dans cette requête) ou à récupérer depuis `fct_location_context_daily` si la
colonne y est propagée — **à trancher au moment de coder, en lisant le modèle**.

Sémantique attendue :
- `commune` → `events_within_1km_count`
- `beyond` → `events_within_20km_count` *(colonne à créer — étage 0)*
- `NULL` → **NULL** (la classe `events_high` ne se calcule pas — comportement actuel préservé)

L'alias `events_500m` doit être renommé (`events_radius`) : garder un nom qui ment sur son contenu
est exactement ce qui a produit l'erreur de barème du 29/07.

### 2.2 Le libellé

**Ancre — ligne 97** :
```ts
  { key: "events_high", family: "events", index_col: "events_within_500m_count", label_fr: "jours à forte densité d'événements (500 m)" },
```

Deux corrections :
- `index_col` n'est **lu nulle part** (seul `label_fr` sert, via `CLASS_LABELS`). Soit le supprimer,
  soit le brancher réellement — mais ne pas laisser un champ décoratif que le prochain lecteur
  croira faisant autorité.
- `label_fr` code « (500 m) » en dur. Le rayon dépendant désormais du lieu, le libellé doit devenir
  neutre — *« jours à forte densité d'événements »* — ou porter le rayon réel, ce qui suppose un
  libellé calculé par lieu.

---

## Étage 3 — Le mart des cartes (dbt)

`models/ms_open_data/mart/fct_location_daily_action_candidates.sql` — **7 occurrences** :

| colonne codée en dur | occurrences |
|---|---|
| `events_within_500m_count` | 5 |
| `events_within_1km_count` | 2 |

Le CTE `daily_state` fait déjà `inner join loc l on c.location_id = l.location_id`, et `loc` lit
`dim_client_location`. **Il suffit d'ajouter `client_catchment` à la sélection de `loc`**, puis de
remplacer chaque colonne par le `CASE` correspondant.

Les 36 occurrences de `events_within_5km_count` et les 11 de `pct_same_bucket_5km` sont **hors
périmètre de ce chantier** : elles servent la scission même-secteur (cannibalisation vs
entraînement, `docs/competition-split-spec.md`), qui a sa propre logique. Ne pas y toucher sans
décision séparée.

---

## Étage 4 — Le rendu (`src/pages/app/insightevent/pulse.astro`) — **FAIT le 30-31/07/2026**

> **Pourquoi la carte restait invisible malgré huit correctifs (31/07) — mesuré, pas déduit.**
> Toutes les corrections précédentes portaient sur la **sélection**. Le blocage était **après** :
> `buildTriageLayout` re-trie les cartes du DOM par `(data-t-h, |data-t-e|)` et **replie tout au-delà
> du rang 3** (`display:none`). La carte périmètre n'a pas d'enjeu — c'est sa définition — donc
> `data-t-e = 0` la renvoie en fin de son groupe d'horizon.
>
> **Mesure** (vrai `public/action-cards.js` en `vm`, puis bloc de sélection et bloc de triage
> extraits byte-exacts de `pulse.astro`, sur `f10c3e58`, 31/07) : 8 cartes pour le site — ce qui
> reproduit exactement l'en-tête « Muse Square 8 actions » de l'owner —, `competition_proximity`
> au **rang 3, le premier rang replié**. `buildMetricsStrip` produisait bien
> `.ms-catchment-ask` avec le bon `location_id` : **le bloc était caché, pas absent.**
>
> **Correctif** : la place réservée de la sélection est ré-honorée au rendu — la carte qui porte
> `.ms-catchment-ask` est remontée au **dernier rang visible (2)** juste après le tri. Les deux
> cartes les plus urgentes gardent leur rang. La carte est reconnue par le bloc qu'elle porte,
> jamais par une liste de types recopiée ; sans carte périmètre le bloc est un no-op (`_pIdx = -1`).
> Vérifié après correctif par le même harnais : rang 2, **VISIBLE**.

> **Place réservée (31/07)** — une passe dédiée dans `pulse.astro`, AVANT la boucle générale,
> réserve **une place par site** à une carte `needs_catchment`. Sans elle la carte était coupée :
> sans enjeu elle tombe en fin du tri `b.score - a.score`, et `MAX_PER_CAT = 2` la supprime.
> Mesuré le 31/07 sur `f10c3e58` : 7 cartes de catégorie concurrence pour 2 places, les deux
> porteuses de la question étant sans enjeu donc dernières servies.
>
> **Tri, en deux temps (décision owner)** — temps 1 : priorité de la carte puis nombre d'événements
> concurrents. **Ce n'est pas un montant €**, ces cartes n'en ont pas ; en fabriquer un serait la
> faute corrigée le 31/07 sur les 7 cartes concurrent. **Temps 2, NON COMMENCÉ** : le cron calcule
> l'enjeu de `events_high` sous les DEUX hypothèses (1 km et 20 km) et les stocke — la carte
> affichera « entre X et Y €/an selon votre réponse », qui sert à la fois de critère de tri et
> d'argument pour répondre.

> **Signal** : `enjeuWithReasonForCandidate` renvoie `needs_catchment`. Une carte est CONCERNÉE si
> `CARD_TYPE_CLASS[action_type] === 'events_high'` — dérivé du mapping existant, jamais d'une liste
> recopiée : un futur type mappé sur `events_high` héritera de la question sans toucher au code.
> Mesuré sur `f10c3e58` : **2 types sur 19** le portent (`competition_proximity`,
> `same_bucket_saturation`). `high_competition_density` y est mappé aussi mais absent ce jour-là.
>
> **Coût : ZÉRO aller-retour.** `client_catchment` est lue par `dateResolutionQuery`, qui interroge
> déjà `fct_location_context_daily` — laquelle porte la colonne depuis l'étage 1.
>
> **Le drapeau ne sort QUE sans enjeu** : si le montant est chiffré, la question n'a plus d'objet ;
> une carte écartée pour matérialité reste masquée.
>
> Bascule prouvée : `clientCatchment = null` → question ; `'commune'` et `'beyond'` → le motif
> d'absence normal reprend sa place.

> **La lecture du périmètre était cassée depuis l'étage 4 — corrigé le 31/07.**
> `dateResolutionQuery` **et** `dayClassAggregateSql` lisaient `c.client_catchment` sur
> `mart.fct_location_context_daily`, **qui ne porte pas la colonne** (49 colonnes, vérifié live ;
> `location_access_pattern` est la seule voisine). Le chantier affirmait le contraire — c'était faux.
>
> Conséquences mesurées sur `f10c3e58` avant correctif : `conditionByDate = 0`, `calendarByDate = 0`,
> `clientCatchment = null`. Donc (a) répondre ne pouvait **jamais** éteindre la question, et (b) la
> résolution météo/calendrier par date était morte **pour toutes les cartes** — c'est pourquoi les
> cartes météo affichaient toutes « motif non séparable » au lieu d'un montant. `dayClassAggregateSql`
> échouait carrément (« Name client_catchment not found inside c »), tuant le repli live.
> Introduit par `4f86360`, **jamais parti en prod** (`main` n'a aucun de ces commits).
>
> **Correctif** : les deux requêtes lisent `dims.dim_client_location` en `LEFT JOIN`
> (grain vérifié 32 lignes / 32 lieux — aucune démultiplication, zéro aller-retour ajouté puisque la
> requête existait déjà). C'est aussi le **bon référentiel produit** : `set-catchment.ts` écrit la
> dimension dans la seconde, donc la question disparaît au rechargement suivant **sans attendre un
> run dbt**. Le « demain » de la confirmation ne porte plus que sur le MONTANT (cron 02:00).
>
> Vérifié par le comportement : `conditionByDate` 0 → **7**, `calendarByDate` 0 → **7** ;
> `dayClassAggregateSql` repasse et rend `events_high` **identique** à l'avant-correctif
> (`marginal n=6 avg=+20`) — la branche `ELSE 500 m` est donc inchangée. Aller-retour complet sur
> `f10c3e58` : `null → needs_catchment=true`, `beyond → false`, `commune → false`, remis à `null`.

### Rendu final (31/07/2026, arbitrages owner)

| point | décision |
|---|---|
| Hiérarchie des boutons | affordance **primaire** `.agir-btn` (13 px, `#1D3BB3`, rayon 10) au lieu de 11 px / `#D1D5DB` — ils étaient plus discrets qu'un « Pas pour moi » |
| Zone montant | **variante 1** : `? €/an` · « votre réponse le débloque », même bloc `.amt` que les autres cartes ; après réponse → `— €/an` · « calcul cette nuit » |
| Menu Agir | **option B** : « M'engager » n'est PAS désactivé, il **intercale** l'étape 1/2 (la question) puis enchaîne sur le formulaire habituel ; sa description l'annonce et revient à la normale dès la réponse |
| Où la question est posée | **UNIQUEMENT dans « M'engager »** (owner 31/07, après test à l'écran). Elle vivait aussi sur la carte : à l'écran c'était un **doublon** avec l'étape 1. Elle est donc posée une seule fois, là où elle a une conséquence immédiate. ⚠️ Ceci **révise** la décision du 30/07 « sur chaque carte concernée et indéfiniment » — le crochet permanent est désormais la zone montant `? €/an`. |
| Motif d'absence gris | **jamais** sur une carte périmètre : il dirait « non séparable ou insuffisant » là où la zone montant dit « votre réponse le débloque ». D'où le `needs_catchment !== true` dans la condition de `buildMetricsStrip`. |
| Repérage pour la place réservée | `[data-catchment-amt]` (la zone montant), **plus** `.ms-catchment-ask` qui n'existe plus sur la carte. Sans cette bascule la carte reperdait son rang 2 et retombait repliée. |
| Roster « Responsable » | inchangé — l'étape 2 est le formulaire habituel, donc `fetchOwners` → `fetchTeamMembers`, repli self-fetch `/api/channels/team` : les personnes du Compte sont proposées comme partout |

**Pourquoi option B et pas la désactivation** : le KPI d'un engagement ne vient pas de l'enjeu de la
carte mais des ventes réelles du lieu (`api/commitments/index.ts` ~164, `baseline_daily`) —
`creation_baseline_daily` transmis par la carte n'est qu'un repli. Ce qui manque n'est donc pas un
KPI, c'est le **périmètre** auquel l'objectif sera comparé. On le demande, on ne bloque personne.

**Ce qui n'est PAS livré** : les nombres de jours mesurables sous chaque bouton (« rend 10 jours
mesurables ») — c'est le **temps 2**, qui suppose que le cron calcule et stocke les deux hypothèses.
Les coder en dur serait exactement la faute corrigée le 31/07 sur les 7 cartes concurrent.

### Ce qui était prévu (conservé pour mémoire)

### 4.1 Le signal côté API

`src/pages/api/insight/monitor.ts` doit indiquer qu'une carte attend la réponse. Le point d'entrée
naturel est `enjeuWithReasonForCandidate` (ligne ~979), qui renvoie déjà `{ enjeu, reason_fr,
immaterial }` — y ajouter `needs_catchment: boolean`.

Condition : la classe résolue de la carte dépend du rayon **et** `client_catchment IS NULL`.

### 4.2 L'affichage

**Ancre — lignes 1746-1747** :
```js
      if (!enj && a && a.enjeu_reason_fr) {
        pills.unshift('<span class="ab-metric" style="background:transparent;border:0;color:#9CA3AF;font-size:11px;padding-left:0;">' + escapeHtml(String(a.enjeu_reason_fr)) + '</span>');
```

Quand `needs_catchment` est vrai, **la question remplace cette ligne** — même emplacement, pas
d'ajout. Rendu figé par le prototype (`docs/perimetre-client-prototype.html`) :

```
Pour chiffrer ce que cette concurrence vous coûte, une seule chose manque :
la plupart de vos clients viennent-ils de votre commune, ou de plus loin ?
   ⟨ De ma commune ⟩   ⟨ De plus loin, ils se déplacent ⟩
Votre réponse fixe le périmètre sur lequel on mesure — une seule fois, pour toutes vos cartes.
```

Après clic : POST vers `set-catchment`, puis remplacement en place par
`✓ Périmètre <communal|régional> enregistré — le montant apparaîtra demain`.

**Décision owner** : la question s'affiche sur **chaque** carte concernée et **indéfiniment** tant
qu'aucune réponse n'est donnée. Une réponse sur une carte les résout toutes — d'où la ligne
« une seule fois, pour toutes vos cartes », qui doit rester.

Le fichier est un script inline : `node --check` sur le bloc extrait, et bump du cache-buster
`action-cards.js` si le rendu partagé est touché.

---

## Ordre d'exécution

0. **La colonne 20 km** (étage 0). Bloquant absolu, à vérifier avant tout le reste.
1. **Colonne `client_catchment` + propagation dbt** (étage 1.1). Sans elle, rien d'autre ne peut lire la valeur.
2. **Endpoint + formulaire** (1.2, 1.3). Permet de répondre, donc de tester la suite sur un vrai
   lieu.
3. **Mart des cartes** (étage 3) et **registre** (étage 2) — indépendants l'un de l'autre.
4. **Rendu** (étage 4) en dernier : c'est lui qui expose la question, inutile avant que la réponse
   ait un effet.

---

## Vérification — sur `f10c3e58` ET sur Les Olivades

Le compte de référence est urbain, Les Olivades est rural : les deux branches du `CASE` doivent
être exercées.

| étape | attendu |
|---|---|
| Réponse `beyond` sur Les Olivades | `events_high` apparaît dans `analytics.day_class_impacts` après le cron |
| Le rayon utilisé | **20 km — 46 valeurs distinctes** mesurées, contre 1 à 1 km et 6 à 10 km |
| Réponse `commune` sur un lieu parisien | `events_high` calculée sur **1 km** — 56 à 62 valeurs distinctes mesurées sur les lieux parisiens |
| Lieu sans réponse | **aucun changement** — `events_high` reste absente, la carte affiche la question |

Le recalcul passe par `/api/cron/day-class-impacts` — d'où le « demain » de la confirmation.

---

## Le blocage à lever en même temps

`fct_location_events_radius_daily` ne remonte qu'à **25 jours** pour Les Olivades, alors que la base
d'événements en a **93**. Son run incrémental ne reconstruit que 14 jours (ligne 77) et la table se
construit en avant depuis l'entrée du lieu.

**Le bon rayon ne produira rien tant que cette table restera courte.** Un
`dbt run --select fct_location_events_radius_daily+ --full-refresh` la ramène à 120 jours,
plafonnée à 93 par la source. À faire **avant** la vérification ci-dessus, sinon elle échouera pour
une raison sans rapport avec ce chantier.

## Hors périmètre, à ne pas confondre

`followed_activity_high` ne dépend **pas** du rayon : 14 lieux sur 32 n'ont aucun concurrent suivi
(tous les `destination_catchment` et `local_catchment`). Aucun réglage de périmètre ne débloquera
cette famille — c'est un choix de l'exploitant, pas une distance.
