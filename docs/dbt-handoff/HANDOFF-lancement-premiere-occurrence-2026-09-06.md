# Handoff dbt Cloud IDE — un « lancement concurrent » est une PREMIÈRE occurrence (06/09/2026)

Sert : `docs/audits/cartes-action-audit-2026-09-06.md` § E1 et geste N4 ; intent § « dire quelque chose de
vrai que l'exploitant ne pouvait pas voir seul ». Owner 06/09 : un concurrent qui lance un produit ne doit
pas expirer le lendemain — et une gratuité mensuelle n'est pas un lancement.

**Constat mesuré (06/09, `mart.fct_competitor_events_conflicts`, site owner f10c3e58)** : la carte
`competitor_event_launch` du 06/09 était « 1er dimanche du mois gratuit » de l'Orangerie — présente sous
**7 libellés** en 60 jours (« Journée gratuite – 1er dimanche… », « … • Réservation obligatoire », « … –
Musée de l'Orangerie »), donc jamais reconnue comme récurrente ; « English Guided Tour » (07/09) et
« Chefs-d'œuvre, de Monet à Picasso » (10/09) sont des visites répétées. Sur le parc, 14 jours à venir :
**65 « lancements », 38 après la règle** ; sur le site owner il reste les 5 événements réellement nouveaux
(16/09 « Ivre de femmes et de peinture », « Le savoir en trompe-l'œil », 19/09 Journées du patrimoine,
20/09 Éveil musical, « À livres ouverts »).

**La règle** : un événement est un lancement si le MÊME concurrent n'a eu, dans les 35 jours précédents (ou
le même jour avec un identifiant plus petit), aucun événement dont le nom normalisé partage ≥ 50 % de ses
mots (Jaccard sur les mots de ≥ 3 lettres, accents et ponctuation retirés). 35 jours couvre une récurrence
mensuelle ; 50 % attrape les variantes de libellé du crawl sans confondre deux expositions différentes
(« Le savoir en trompe-l'œil » vs « Silla » : 0,13).

**Base vérifiée** : `origin/Ajuria-branch` à `3c1be6b` (05/09) pour `fct_location_change_feed.sql`,
identique au checkout local (`git diff --stat` vide). Fins de ligne **LF** (`file` : UTF-8 text). dbt 1.10.11.
SQL only — aucune syntaxe yml en jeu. Le bloc ci-dessous a été **exécuté sur BQ le 06/09** avec les
`ref()` résolus (`mart.fct_competitor_events_conflicts`, `mart.fct_competitor_directory`) : il tourne,
38 lignes sur le parc à 14 jours, colonnes de sortie inchangées (le `union all` de la fin du fichier ne
bouge pas).

---

## 1. `ms_dbt/models/ms_open_data/mart/fct_location_change_feed.sql` — MODIFIER (un seul bloc)

Dans le fichier, le CTE `competitor_event_launch as ( … ),` (ligne 901 à la ligne `),` qui précède le CTE
suivant) est REMPLACÉ par les trois CTE ci-dessous. Rien d'autre ne change : le `union all select * from
competitor_event_launch` en fin de fichier lit le dernier des trois, qui garde exactement les mêmes colonnes.

```sql
-- 06/09 — un LANCEMENT est une PREMIÈRE occurrence (docs/dbt-handoff/HANDOFF-lancement-premiere-occurrence
-- -2026-09-06.md). Avant : toute occurrence d'événement datée dans les 14 jours était un « lancement » —
-- la gratuité mensuelle de l'Orangerie sous 7 libellés, les visites guidées quotidiennes. Mesuré le 06/09 :
-- 65 lancements sur le parc à 14 jours, 38 après la règle. Règle : même concurrent, un événement dans
-- les 35 jours précédents (ou le même jour, identifiant plus petit) dont le nom normalisé partage >= 50 %
-- des mots (Jaccard, mots >= 3 lettres, accents et ponctuation retirés) => pas un lancement.
competitor_event_launch_toks as (
    select
        cf.*,
        array(
            select distinct w
            from unnest(split(regexp_replace(lower(normalize(cf.event_name, NFD)), r'[^a-z0-9]+', ' '), ' ')) w
            where length(w) >= 3
        ) as name_toks
    from {{ ref('fct_competitor_events_conflicts') }} cf
),

competitor_event_launch_prior as (
    select
        b.location_id,
        b.competitor_event_id,
        max(safe_divide(
            (select count(*) from unnest(b.name_toks) t where t in unnest(p.name_toks)),
            array_length(array(select distinct x from unnest(array_concat(b.name_toks, p.name_toks)) x))
        )) as prior_similarity
    from competitor_event_launch_toks b
    left join competitor_event_launch_toks p
        on p.location_id = b.location_id
       and p.competitor_id = b.competitor_id
       and p.competitor_event_id != b.competitor_event_id
       and p.event_date between date_sub(b.event_date, interval 35 day) and b.event_date
       and (p.event_date < b.event_date or p.competitor_event_id < b.competitor_event_id)
    where b.event_date between current_date() and date_add(current_date(), interval 14 day)
    group by 1, 2
),

competitor_event_launch as (
    select
        cf.event_date as date, cf.location_id,
        'competitor_event_launch' as change_type,
        cf.competitor_event_id as entity_id,
        cast(null as string) as old_value,
        concat(coalesce(cd.competitor_name, ''), ' — ', coalesce(cf.event_name, '')) as new_value,
        cast(null as int64) as score_delta,
        cast(null as string) as driver_type,
        cast(null as float64) as driver_delta,
        cast(null as string) as enriched_mode,
        cast(null as string) as enriched_disruption_category,
        cast(cf.distance_from_location_m as float64) as enriched_distance_m,
        cf.event_city as enriched_city_name,
        case
            when cf.distance_from_location_m <= 500 then '500m'
            when cf.distance_from_location_m <= 1000 then '1km'
            when cf.distance_from_location_m <= 5000 then '5km'
            when cf.distance_from_location_m <= 10000 then '10km'
            else '50km'
        end as enriched_radius_bucket,
        cf.event_industry_code as enriched_industry_code,
        cf.description as enriched_description,
        cf.venue_name as enriched_venue_name,
        cast(null as string) as enriched_venue_address,
        'competitor_crawl' as enriched_data_provenance
    from {{ ref('fct_competitor_events_conflicts') }} cf
    left join {{ ref('fct_competitor_directory') }} cd
        on cf.competitor_id = cd.competitor_id
    inner join competitor_event_launch_prior lp
        on lp.location_id = cf.location_id
       and lp.competitor_event_id = cf.competitor_event_id
    where cf.event_date between current_date() and date_add(current_date(), interval 14 day)
      and coalesce(lp.prior_similarity, 0) < 0.5
    qualify row_number() over (
        partition by cf.location_id, cf.competitor_event_id
        order by cf.crawled_at desc
    ) = 1
),
```

## 2. Message de commit (dbt Cloud IDE)

```
feat(change_feed): un lancement concurrent est une PREMIÈRE occurrence — même concurrent, nom normalisé partagé >= 50 % dans les 35 jours précédents = récurrence, pas un lancement (65 → 38 sur le parc à 14 j, mesuré 06/09)
```

## 3. Après le run

`competitor_event_launch` du 06/09 (Orangerie, gratuité mensuelle) ne doit plus sortir ; le premier
lancement attendu sur f10c3e58 est daté du 16/09. Vérification : `SELECT date, new_value FROM
mart.fct_location_change_feed WHERE change_type = 'competitor_event_launch' AND
STARTS_WITH(location_id, 'f10c3e58') AND date >= CURRENT_DATE() ORDER BY date`.

— DÉFINITIF
