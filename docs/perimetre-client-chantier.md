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
| Rayon correspondant | 5 km · 50 km · *aucun — comportement actuel* |

`NULL` est un état de plein droit, pas une valeur manquante à combler : c'est lui qui déclenche
l'affichage de la question.

---

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

## Étage 2 — Le registre (`src/lib/dayClassRegistry.ts`)

### 2.1 La colonne de rayon devient conditionnelle

**Ancre — ligne 209**, dans `dayClassAggregateSql` :
```sql
        e.events_within_500m_count AS events_500m,
```

À remplacer par un `CASE` sur le périmètre du lieu. Le join sur `dim_client_location` est à ajouter
(il n'y est pas encore dans cette requête) ou à récupérer depuis `fct_location_context_daily` si la
colonne y est propagée — **à trancher au moment de coder, en lisant le modèle**.

Sémantique attendue :
- `commune` → `events_within_5km_count`
- `beyond` → `events_within_50km_count`
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

## Étage 4 — Le rendu (`src/pages/app/insightevent/pulse.astro`)

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

1. **Colonne + propagation dbt** (étage 1.1). Sans elle, rien d'autre ne peut lire la valeur.
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
| Le rayon utilisé | 50 km — **22 valeurs distinctes** mesurées, contre 1 à 500 m et 1 à 5 km |
| Réponse `commune` sur un lieu parisien | `events_high` calculée sur 5 km, signal non dégénéré (360 valeurs distinctes mesurées) |
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
