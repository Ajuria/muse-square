# Intérêt porté à l'établissement — avant l'arrivée en boutique, et face aux suivis — SPEC DE TRAVAIL

Sert : intent § Le métier (« regarder la fréquentation […] tous les jours ») et § Le test de valeur (« pointe quelque chose qu'il peut bouger »). Arbitrage owner 04/09 : Google Trends et Wikipédia sont écartés ; **le travail à faire est de mesurer l'intérêt porté à une entreprise avant que les prospects n'arrivent en boutique, et la part de cet intérêt face aux concurrents suivis.** Remplace la chaîne mots-clés (7 modèles supprimés au geste 4 de [`dbt-nettoyage-spec.md`](dbt-nettoyage-spec.md)).

---

## 0. Le mot

Aucune entrée du lexique ne nomme ce concept (« intérêt », « notoriété », « visibilité » n'y figurent pas ; « passage » y désigne la fréquentation physique). **Mot à demander à l'owner** avant toute chaîne visible. Dans ce document, le nom technique est `interest` ; rien ci-dessous n'est un libellé.

---

## 1. Ce qui existe en base (04/09)

| Source | Qui | Grain | Couverture | Ce qu'elle mesure |
|---|---|---|---|---|
| `raw.channel_performance_daily` (cron `sync-gbp-performance.ts` + `publish.ts`) | **le site** | plateforme × entité × site × jour × métrique | facebook seulement : 2 métriques de posts, 1 site, 05/06 → 05/07/2026 (42 lignes) | pour GBP, le cron sait déjà lire 10 métriques quotidiennes : impressions Maps/Search × desktop/mobile, `BUSINESS_DIRECTION_REQUESTS`, `CALL_CLICKS`, `WEBSITE_CLICKS`, conversations, réservations, commandes — **aucun compte GBP n'est connecté** (`analytics.channel_configs` : meta 1, facebook 3, instagram 3, email, slack ; 0 `gbp`) |
| `raw.own_location_review_snapshots` (cron nocturne) | le site | site × jour | 2 sites, 52 lignes, 28/06 → 04/09 | `google_rating`, `google_rating_count`, `google_photos_count`, textes d'avis |
| `raw.competitor_snapshots` (cron `snapshot-competitors.ts`) | **les suivis** | concurrent × source × jour | gbp : 30 concurrents, 1 606 lignes, 13/05 → 04/09, quotidien ; homepage : 34 lignes, un seul jour | `google_rating_count`, `google_photos_count`, `has_promo`, `featured_offer`, `blog_post_count`, `blog_latest_date` |
| `raw.besttime_foot_traffic` (cron `sync-besttime.ts`) | le site | site × jour de semaine, capture quotidienne | 4 sites, 2 171 lignes, 14/05 → 04/09 | affluence relative par heure, `venue_rating`, `venue_reviews` |
| `int_competitor_snapshot_deltas` (dbt) | les suivis | concurrent × source × jour | dérivé de ci-dessus | Δ note, Δ nombre d'avis, Δ photos, Δ billets de blog — consommé par `fct_location_change_feed` |
| `int_channel_performance` (dbt) | le site | long format typé | dérivé | consommé par `fct_action_outcomes` seulement |

Ce qu'un établissement voit de LUI-MÊME (impressions, itinéraires, appels) n'est pas public. Ce qu'on voit de TOUS (avis, photos, actualité) l'est. La comparaison site / suivis ne peut donc se faire que sur une métrique disponible des deux côtés ; l'« avant l'arrivée » ne se mesure que sur le site, par GBP.

---

## 2. Ce qu'on mesure

### 2.1 Avant l'arrivée — le site seul

**Grain `date × location_id`**, source GBP Performance (les 10 métriques déjà codées dans `GBP_METRICS`). Deux lectures :

- **`interest_searches`** = impressions Search (desktop + mobile) : on a cherché l'établissement, ou sa catégorie, et Google l'a montré ;
- **`interest_intents`** = `BUSINESS_DIRECTION_REQUESTS + CALL_CLICKS + WEBSITE_CLICKS + BUSINESS_BOOKINGS` : on a fait un geste vers lui.

Chacun rapporté au **résultat habituel du site** (même règle que le résiduel ventes : médiane des 8 mêmes jours de semaine précédents, bande de bruit), jamais en volume nu (intent § test de valeur).

**Le « avant »** se mesure, il ne se suppose pas : corrélation croisée `interest_intents(t − k)` × `daily_visitors(t)` pour k = 0…14 sur `fct_client_daily_performance`. Le k qui maximise la corrélation est le **délai d'avance** du site ; il devient une colonne (`lead_days`) et une phrase possible (« les itinéraires demandés annoncent vos passages à J+2 »). Si aucun k ne dépasse 0,3 sur 90 jours, la carte ne s'affiche pas — l'absence se dit et se chiffre.

### 2.2 Face aux suivis — la métrique commune

La seule mesure d'intérêt disponible pour le site ET pour ses suivis, au jour, est la **vitesse des avis Google** : `Δ google_rating_count` par semaine (et, en second, `Δ google_photos_count`). Un avis est un acte du public après visite ; sa vitesse est un proxy de fréquentation acceptable parce qu'il est **le même** des deux côtés.

**Grain `week_start × location_id × competitor_id`** sur les paires de `competitor_tracking` (mémoire `competitor-tracking-is-the-truth`), plus une ligne `competitor_id = location_id` pour le site :

| Colonne | Définition |
|---|---|
| `reviews_added` | `google_rating_count(fin) − google_rating_count(début)` sur la semaine, borné à 0 |
| `photos_added` | idem photos |
| `share_of_reviews` | `reviews_added(site) / Σ reviews_added(site + suivis)` — la **part d'intérêt** ; NULL si Σ < 5 (plancher, sinon bruit) |
| `share_rank` | rang du site parmi ses suivis sur la semaine |
| `promo_weeks`, `blog_posts_added` | activité commerciale des suivis (déjà dans les snapshots) |
| `n_followed_with_data` | suivis ayant deux snapshots dans la semaine — le dénominateur se dit |

Position lisible via le lexique existant : « parmi les mieux notés · dans la moyenne · le moins bien noté de vos suivis » (lexique ligne 45) s'applique déjà à la note ; la part d'intérêt attend son mot (§ 0).

### 2.3 Ce qu'on ne mesure pas

Pas d'API sociales (mémoire `card-quality-and-edge-roadmap` : signal concurrent sans API sociales) ; pas de suivi individuel de personnes (intent § pas un outil de surveillance) ; pas de volume nu affiché.

---

## 3. Les modèles

Dans l'ordre du DAG.

1. **`stg_own_location_review_snapshots`** — nouveau, source `raw.own_location_review_snapshots`, `crawl_status = 'success'`, grain `snapshot_id` ; miroir de `stg_competitor_snapshots`.
2. **`int_location_review_deltas`** — nouveau, miroir de `int_competitor_snapshot_deltas` pour le site : `location_id × snapshot_date`, Δ note, Δ avis, Δ photos.
3. **`int_channel_performance`** — existe ; ajouter la fraîcheur sur la source `raw.channel_performance_daily` (`loaded_at_field: fetched_at`) pour que `fresher+` le voie.
4. **`fct_location_interest_daily`** — nouveau, grain `date × location_id`, table partitionnée `date`, `tag:mart_dependent` : `interest_searches`, `interest_intents`, leurs habituels et écarts (`_vs_usual_pct`), `reviews_added`, `lead_days` (§ 2.1, recalculé chaque semaine sur 90 jours). Sources : `int_channel_performance` (platform `gbp`), `int_location_review_deltas`, `fct_client_daily_performance`.
5. **`fct_location_interest_share_weekly`** — nouveau, grain `week_start × location_id × competitor_id` (§ 2.2). Sources : `int_competitor_snapshot_deltas`, `int_location_review_deltas`, `stg_competitor_tracking` (le staging sort de la liste C du triage), `fct_competitor_directory` (nom, note).
6. **`vw_insight_event_location_interest`** et **`vw_insight_event_interest_share`** — projections à contrat, `enforced: true`, lues par Piloter (Mon environnement) et par le bloc de candidates correspondant.

Tests : `unique_combination_of_columns` sur chaque grain ; `accepted_range` 0–1 sur `share_of_reviews` ; `not_null` sur `n_followed_with_data`.

---

## 4. La porte : un compte GBP connecté

Rien du § 2.1 n'existe tant qu'aucun site n'a connecté Google Business Profile (`channels/gbp-connect.ts` existe ; `analytics.channel_configs` n'a aucune ligne `gbp`). **Action owner** : connecter le GBP de Muse Square ; le cron `sync-gbp-performance.ts` alimente alors `raw.channel_performance_daily` avec l'historique que l'API rend (jusqu'à 18 mois), ce qui suffit à mesurer `lead_days` dès la première nuit.

Le § 2.2 ne dépend de rien : les snapshots existent depuis le 13/05 pour 30 suivis et depuis le 28/06 pour 2 sites. Il se construit en premier.

---

## 5. Preuve

- § 2.2 : sur Muse Square, 12 semaines, la table rend une ligne par suivi et une pour le site, `Σ reviews_added` ≥ 5 sur au moins 8 semaines, sinon la carte ne s'affiche pas et le document le dit.
- § 2.1 : `lead_days` et sa corrélation, avec la requête et la fenêtre, avant tout libellé.
- Chaque carte issue de ce chantier passe la barre `card-review` et le lexique (mot du § 0 acté) avant d'être proposée.

— SPEC DE TRAVAIL
