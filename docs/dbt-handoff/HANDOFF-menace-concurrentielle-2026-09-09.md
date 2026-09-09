# Handoff dbt Cloud IDE — « menace forte » exige le même secteur que le site (09/09/2026)

Une épicerie fine (Maison Sèvres) se voyait proposer « Suivez Musée d'Orsay ». Le niveau
`threat_level = 'high'` se construisait sur le secteur et la distance SEULS dès que le public
du concurrent est inconnu, ce qui est le cas de 187 573 paires sur 188 414. « Menace forte »
voulait donc dire « c'est à côté ».

**Une seule correction :** `threat_level = 'high'` exige désormais `industry_match_tier = 'direct'`,
c'est-à-dire le même code secteur que le site. Un score élevé hors secteur reste `moderate` :
le signal n'est pas perdu, il n'est plus promu.

Ce qui n'est PAS touché : la formule du chevauchement de public, le grain, les colonnes.
Le mart `fct_competitor_threat_profile` n'a aucune modification à recevoir — le modèle rend
exactement les mêmes 22 colonnes qu'aujourd'hui.

**Preuves d'exécution** — modèle compilé (refs remplacées par les tables réelles) et exécuté
sur BigQuery avant envoi :

| Lignes rendues | 188 414, identique à la table actuelle |
| Colonnes rendues | 22, aucune ajoutée, aucune supprimée |
| Menaces fortes | 7 218 avant, 12 après |
| Halle Odéon et Comptoir Fénelon, suivis, secteur direct | restent `high` |
| Orsay, Louvre, Pompidou, Orangerie, Cité des Sciences, Galeries Lafayette | passent à `moderate` |

**Deux fichiers, dans l'ordre du DAG** : le modèle, puis le `schema.yml` qui le déclare.

---

## 1. `ms_dbt/models/ms_open_data/intermediate/int_competitor_threat_profile.sql`

Ouvrir ce fichier, **tout sélectionner**, puis coller le bloc ci-dessous à la place.
Le fichier est en CRLF : remplacer tout le contenu évite un fichier mixte.

```sql
{#
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  MODÈLE  :  int_competitor_threat_profile                                  ║
  ║  SCHÉMA  :  intermediate                                                   ║
  ║  GRAIN   :  location_id × competitor_id                                    ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  BUT                                                                        ║
  ║  Compare le profil de CHAQUE entrée de l'annuaire située à 50 km ou moins   ║
  ║  du site avec le profil du site, et calcule un niveau de menace agrégé.     ║
  ║  is_followed marque celles que le site suit ; les autres sont des           ║
  ║  CANDIDATES, jamais des concurrents déclarés (188 414 paires, 29 suivis).   ║
  ║  Alimente le Strip 2 (Threats) du radar V4.                                 ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  SOURCES                                                                    ║
  ║  • vw_insight_event_ai_location_context  — profil utilisateur               ║
  ║      Champs : location_id, primary_audience_1, primary_audience_2,          ║
  ║               client_industry_code, seasonality, event_time_profile,        ║
  ║               latitude, longitude                                           ║
  ║                                                                              ║
  ║  • fct_competitor_directory              — profil concurrent                ║
  ║      Champs : competitor_id, competitor_name, primary_audience,             ║
  ║               secondary_audience, industry_code, seasonality,               ║
  ║               event_time_profile, lat, lon,                                 ║
  ║               google_rating, google_rating_count                            ║
  ║                                                                              ║
  ║  • int_competitors_followed              — LE suivi, par site               ║
  ║      Grain  : clerk_user_id × location_id × competitor_id                   ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  CHAMPS CALCULÉS                                                            ║
  ║  • audience_overlap_pct     FLOAT64  — % d'audiences partagées             ║
  ║  • industry_match_tier      STRING   — 'direct' | 'partial' | 'contextual' ║
  ║  • seasonality_alignment    BOOLEAN  — saisonnalité identique               ║
  ║  • programming_rhythm_match BOOLEAN  — event_time_profile identique         ║
  ║  • distance_km              FLOAT64  — distance géographique en km          ║
  ║  • threat_score             FLOAT64  — score agrégé [0.0 – 1.0]            ║
  ║  • threat_level             STRING   — 'high' | 'moderate' | 'low'         ║
  ╠══════════════════════════════════════════════════════════════════════════════╣
  ║  MATÉRIALISATION                                                            ║
  ║  Type          : table                                                      ║
  ║  Clustering    : location_id                                                ║
  ║  Rafraîchissement : quotidien (aligné sur fct_competitor_directory)         ║
  ╚══════════════════════════════════════════════════════════════════════════════╝
#}

{{
  config(
    materialized = 'table',
    schema = 'intermediate',
    cluster_by = ['location_id'],
    tags = ['daily']
  )
}}

with user_profiles as (
    select
        l.location_id,
        c.primary_audience_1,
        c.primary_audience_2,
        c.company_industry_code     as company_industry,
        l.client_industry_code,
        c.seasonality,
        c.event_time_profile,
        l.geo_point
    from {{ ref('dim_client_location') }} l
    left join {{ ref('dim_client_company_profile') }} c
        on l.location_id = c.location_id
    where l.active_flag = true
      and l.geo_point is not null
),

competitor_profiles as (
    select
        fcd.competitor_id,
        fcd.competitor_name,
        fcd.primary_audience                as competitor_primary_audience,
        fcd.secondary_audience              as competitor_secondary_audience,
        fcd.industry_code                   as competitor_industry_code,
        fcd.seasonality                     as competitor_seasonality,
        fcd.event_time_profile              as competitor_event_time_profile,
        fcd.lat                             as competitor_lat,
        fcd.lon                             as competitor_lon,
        fcd.geo_point                       as competitor_geo_point,
        fcd.google_rating                   as competitor_google_rating,
        fcd.google_rating_count             as competitor_google_rating_count
    from {{ ref('fct_competitor_directory') }}  fcd
    where fcd.geo_point is not null
),

-- Le suivi est un fait (site x concurrent), jamais (concurrent) seul : un meme
-- concurrent peut etre suivi par un site du compte et pas par un autre. Le modele
-- qui porte ce grain existe deja — int_competitors_followed, dont l'en-tete dit la
-- regle : « A user follows a competitor for a specific location ». On le reutilise
-- plutot que d'ecrire une seconde definition du suivi.
follows as (
    select distinct
        location_id,
        competitor_id
    from {{ ref('int_competitors_followed') }}
),

pairs as (
    select
        u.location_id,
        c.competitor_id,
        c.competitor_name,
        (f.location_id is not null)         as is_followed,
        u.primary_audience_1,
        u.primary_audience_2,
        c.competitor_primary_audience,
        c.competitor_secondary_audience,
        u.client_industry_code,
        c.competitor_industry_code,
        u.seasonality                       as user_seasonality,
        c.competitor_seasonality,
        u.event_time_profile                as user_event_time_profile,
        c.competitor_event_time_profile,
        u.geo_point,
        c.competitor_lat,
        c.competitor_lon,
        c.competitor_google_rating,
        c.competitor_google_rating_count
    from user_profiles u
    cross join competitor_profiles c
    left join follows f
        on  f.location_id   = u.location_id
        and f.competitor_id = c.competitor_id
    where ST_DISTANCE(u.geo_point, c.competitor_geo_point) <= 50000
),

with_overlap as (
    select
        p.*,

        -- ── audience_overlap_pct ──────────────────────────────────────────────
        -- 23/08 (owner) : 'mixed' compte comme commun a tout, d'un cote comme de l'autre.
        (
          CASE WHEN p.primary_audience_1 IS NOT NULL
                    AND (
                      p.primary_audience_1 = 'mixed'
                      OR 'mixed' IN UNNEST(ARRAY(SELECT a FROM UNNEST([p.competitor_primary_audience, p.competitor_secondary_audience]) AS a WHERE a IS NOT NULL))
                      OR p.primary_audience_1 IN UNNEST(ARRAY(SELECT a FROM UNNEST([p.competitor_primary_audience, p.competitor_secondary_audience]) AS a WHERE a IS NOT NULL))
                    )
               THEN 1 ELSE 0 END
          +
          CASE WHEN p.primary_audience_2 IS NOT NULL
                    AND p.primary_audience_2 != p.primary_audience_1
                    AND (
                      p.primary_audience_2 = 'mixed'
                      OR 'mixed' IN UNNEST(ARRAY(SELECT a FROM UNNEST([p.competitor_primary_audience, p.competitor_secondary_audience]) AS a WHERE a IS NOT NULL))
                      OR p.primary_audience_2 IN UNNEST(ARRAY(SELECT a FROM UNNEST([p.competitor_primary_audience, p.competitor_secondary_audience]) AS a WHERE a IS NOT NULL))
                    )
               THEN 1 ELSE 0 END
        )
        /
        NULLIF(
          ARRAY_LENGTH(
            ARRAY(
              SELECT DISTINCT val
              FROM UNNEST(
                ARRAY_CONCAT(
                  ARRAY(SELECT a FROM UNNEST([p.primary_audience_1, p.primary_audience_2]) AS a WHERE a IS NOT NULL),
                  ARRAY(SELECT a FROM UNNEST([p.competitor_primary_audience, p.competitor_secondary_audience]) AS a WHERE a IS NOT NULL)
                )
              ) AS val
            )
          ),
          0
        )
        * 100.0                             as audience_overlap_pct,

        -- ── seasonality_alignment ─────────────────────────────────────────────
        (p.user_seasonality = p.competitor_seasonality)               as seasonality_alignment,

        -- ── programming_rhythm_match ──────────────────────────────────────────
        (p.user_event_time_profile = p.competitor_event_time_profile) as programming_rhythm_match,

        -- ── distance_km ───────────────────────────────────────────────────────
        ST_DISTANCE(
            p.geo_point,
            ST_GEOGPOINT(p.competitor_lon, p.competitor_lat)
        ) / 1000.0                          as distance_km

    from pairs p
),

with_tiers as (
    select
        *,

        -- ── industry_match_tier ───────────────────────────────────────────────
        CASE
            WHEN client_industry_code = competitor_industry_code
                 AND (audience_overlap_pct > 50 OR (competitor_primary_audience IS NULL AND competitor_secondary_audience IS NULL))
            THEN 'direct'
            WHEN client_industry_code = competitor_industry_code
                 OR  audience_overlap_pct > 25  THEN 'partial'
            ELSE 'contextual'
        END                                 as industry_match_tier

    from with_overlap
),

with_threat as (
    select
        *,

        -- ── threat_score ──────────────────────────────────────────────────────
        -- Adaptive weights: redistribute missing pillars to known ones
        SAFE_DIVIDE(
          -- Audience pillar (only counted when data exists)
          IF(competitor_primary_audience IS NOT NULL OR competitor_secondary_audience IS NOT NULL,
             COALESCE(audience_overlap_pct, 0.0) / 100.0 * 0.35, 0.0)
          +
          -- Industry pillar (always available)
          (CASE industry_match_tier
              WHEN 'direct'  THEN 1.0
              WHEN 'partial' THEN 0.5
              ELSE 0.0
           END * 0.25)
          +
          -- Distance pillar (always available)
          ((1.0 - LEAST(distance_km / 
            CASE competitor_industry_code
              WHEN 'commercial'      THEN 5.0
              WHEN 'market_hall'     THEN 5.0
              WHEN 'food_nightlife'  THEN 5.0
              WHEN 'nightlife'       THEN 5.0
              WHEN 'coworking'       THEN 5.0
              WHEN 'wellness'        THEN 5.0
              WHEN 'sport'           THEN 5.0
              WHEN 'cinema_theatre'  THEN 5.0
              WHEN 'gallery'         THEN 5.0
              WHEN 'culture'         THEN 5.0
              ELSE 15.0
            END
          , 1.0)) * 0.25)
          +
          -- Seasonality pillar (only counted when data exists)
          IF(user_seasonality IS NOT NULL AND competitor_seasonality IS NOT NULL,
             CASE WHEN seasonality_alignment THEN 1.0 ELSE 0.0 END * 0.15, 0.0)
          ,
          -- Denominator: sum of active weights only
          IF(competitor_primary_audience IS NOT NULL OR competitor_secondary_audience IS NOT NULL, 0.35, 0.0)
          + 0.25  -- industry always active
          + 0.25  -- distance always active
          + IF(user_seasonality IS NOT NULL AND competitor_seasonality IS NOT NULL, 0.15, 0.0)
        )
        as threat_score

    from with_tiers
)

select
    -- ── Clés ─────────────────────────────────────────────────────────────────
    location_id,
    competitor_id,
    competitor_name,
    is_followed,

    -- ── Champs calculés ───────────────────────────────────────────────────────
    CASE
        WHEN competitor_primary_audience IS NULL AND competitor_secondary_audience IS NULL
        THEN NULL
        ELSE ROUND(COALESCE(audience_overlap_pct, 0.0), 2)
    END                                              as audience_overlap_pct,
    industry_match_tier,
    seasonality_alignment,
    programming_rhythm_match,
    ROUND(distance_km, 3)                           as distance_km,
    ROUND(threat_score, 4)                          as threat_score,

    -- 09/09 (owner) : « high » exige le MÊME code secteur que le site
    -- (industry_match_tier = 'direct'). Sans cette porte, le niveau se construisait sur
    -- le secteur et la distance SEULS dès que le public du concurrent est inconnu —
    -- 187 573 paires sur 188 414 — et une épicerie fine sortait le musée d'Orsay en
    -- menace forte à 2,4 km. Mesuré sur le mart : 7 218 'high' → 12, tous les retirés
    -- étant de secteur 'partial'. Un score élevé hors secteur reste 'moderate' : le
    -- signal n'est pas perdu, il n'est plus promu.
    CASE
        WHEN threat_score >= 0.6 AND industry_match_tier = 'direct' THEN 'high'
        WHEN threat_score >= 0.3                                    THEN 'moderate'
        ELSE                                                             'low'
    END                                             as threat_level,

    -- ── Métadonnées concurrentes utiles en aval ───────────────────────────────
    competitor_google_rating,
    competitor_google_rating_count,

    -- User profile context
    primary_audience_1          as location_primary_audience_1,
    primary_audience_2          as location_primary_audience_2,
    client_industry_code        as location_industry_code,

    -- Competitor profile context
    competitor_primary_audience,
    competitor_secondary_audience,
    competitor_industry_code,
    competitor_seasonality,
    competitor_event_time_profile,

    -- ── Audit ─────────────────────────────────────────────────────────────────
    CURRENT_TIMESTAMP()                             as dbt_updated_at

from with_threat
```

---

## 2. `ms_dbt/models/ms_open_data/intermediate/schema.yml`

Un seul geste. Chercher `int_competitor_threat_profile` (ligne 404 sur votre branche),
puis remplacer **la ligne `description:` qui la suit**.

Ligne à remplacer :
```yaml
    description: "Profil de menace concurrentielle par industrie. Problème de doublons avec source non identifiée, test unicité non implémenté"
```

Ligne de remplacement :
```yaml
    description: "Profil de menace concurrentielle au grain site x entrée d annuaire, pour toute entrée située à 50 km ou moins du site ; is_followed marque les suivis réels (29 suivis sur 188 414 paires, mesuré le 09/09/2026). threat_level vaut high seulement si l entrée porte le MÊME code secteur que le site (industry_match_tier = direct) : sans cette porte le niveau se construisait sur le secteur et la distance seuls dès que le public du concurrent est inconnu, soit 187 573 paires sur 188 414, et une épicerie fine sortait le musée d Orsay en menace forte à 2,4 km. Doublons d annuaire non résolus, test unicité non implémenté."
```

---

## Message de commit

```
fix(menace): « menace forte » exige le même code secteur que le site

threat_level = high seulement si industry_match_tier = 'direct'. Sans cette porte, le
niveau se construisait sur le secteur et la distance seuls dès que le public du
concurrent est inconnu (187 573 paires sur 188 414), et une épicerie fine sortait le
musée d'Orsay en menace forte à 2,4 km. Mesuré : 7 218 high -> 12, tous les retirés de
secteur 'partial' ; les suivis réels de secteur direct restent high.

Aucune autre modification : la formule du chevauchement de public, le grain et les 22
colonnes rendues sont inchangés, donc le mart n'a rien à recevoir.
```

## Après le run

```
dbt run --select int_competitor_threat_profile+
```

Puis vérifier en base. La première requête doit rendre 12 sur 188 414. La seconde doit
montrer Halle Odéon et Comptoir Fénelon en `high`, les musées en `moderate` :

```sql
SELECT COUNTIF(threat_level = 'high') AS high, COUNT(*) AS lignes
FROM `muse-square-open-data.mart.fct_competitor_threat_profile`;

SELECT competitor_name, industry_match_tier, audience_overlap_pct,
       threat_level, is_followed, ROUND(distance_km, 1) AS km
FROM `muse-square-open-data.mart.fct_competitor_threat_profile`
WHERE location_id = '29383776-bd7a-4401-ac26-f2e6efe1f58c'
  AND threat_level IN ('high', 'moderate')
ORDER BY threat_score DESC
LIMIT 10;
```

## Ce que cette passation ne corrige PAS

- **Le chevauchement de public reste tel quel.** Il compare les étiquettes du site à celles
  du concurrent, sans tenir compte du rang principal ou secondaire, et le vocabulaire tient
  en six valeurs déclarables (local, tourists, mixed, professionals, students, families).
  Deux commerces parisiens porteront souvent les mêmes étiquettes.
- **Le public du concurrent peut être hérité de son secteur.** `int_competitor_directory`
  fait un `coalesce` vers le seed `competitor_industry_profile_defaults` quand la fiche n'a
  pas de public à elle. Distinguer une valeur observée d'une valeur héritée demanderait
  d'exposer la valeur d'avant le `coalesce` — non fait ici.
- **Le public manque presque partout.** 21 257 entrées d'annuaire sur 21 288 n'ont aucun
  public renseigné, leur code secteur étant un libellé français que le seed ne rejoint pas.
- **Les doublons d'annuaire.** Le musée d'Orsay existe en deux entrées, l'une en secteur
  `culture`, l'autre en `unknown`. Le test d'unicité n'est toujours pas écrit.
