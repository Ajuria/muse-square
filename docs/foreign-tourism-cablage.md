# `foreign_tourism_signal` — le câblage régional, diagnostic et correctif

> **À appliquer dans l'IDE dbt Cloud** (`models/ms_open_data/mart/fct_location_daily_action_candidates.sql`).
> Je ne peux ni l'appliquer ni le tester : `dbt run` passe par dbt Cloud. Ce que j'ai vérifié,
> c'est **la logique de jointure elle-même**, exécutée sur les tables réelles — résultats mesurés
> en fin de document.

---

## ÉTAT AU 01/08 — le correctif n'a JAMAIS été déployé, et il portait un bug

**1. Pourquoi le rebuild de 06:14 n'a rien changé : le correctif n'est nulle part.**
Le SQL réellement exécuté a été lu dans le job BigQuery qui a écrit la table — job
`5bf9a650-bd50-46e4-b31f-3ba92c9c859d` (`CREATE_TABLE_AS_SELECT` →
`mart.fct_location_daily_action_candidates`, 01/08 06:14:06 UTC, service account dbt Cloud ;
requête : `INFORMATION_SCHEMA.JOBS_BY_PROJECT` de `ms-database-472505`, région EU — les jobs
dbt sont facturés là, pas dans `muse-square-open-data`). Ce SQL contient encore
`where p.date >= current_date()` et `on m.region_code = d.region_id`, et **zéro** occurrence
de `profile_reference_year` ou `mart_region_code`. Le checkout local du dépôt dbt
(`~/Documents/ms_database`, HEAD `c5cefa1`) ne les contient pas non plus. Le correctif
n'existe que dans ce document : le build de 06:14 a reconstruit l'ancien modèle, d'où
`avec_pays = 0` (mesuré 01/08 : 128 lignes ≥ aujourd'hui, 0/0/0 sur les trois champs).

**2. Le correctif du 31/07 était FAUX tel qu'écrit : il manquait la déduplication.**
Le mart projette le profil sur CHAQUE JOUR (grain date × région × pays) : un mois porte
**31 lignes identiques par pays** (mesuré : 31 lignes, 1 seule part distincte, et aucun
(région, mois, pays) ne porte deux parts distinctes — aucun mois ne chevauche deux saisons).
La jointure au MOIS telle qu'écrite le 31/07 aurait donc multiplié chaque pays par ~31 :
`share_total_pct` ≈ 990 % au lieu de 43 %, chaque pays répété 31 fois dans `countries_named`.
Le SQL ci-dessous est corrigé (`select distinct`). **Le tableau « Ce que ça donnera » du 31/07
était en outre incohérent** : il annonçait « Occitanie 32 % » avec un détail qui somme à 43.
Les chiffres re-mesurés le 01/08 sont dans le tableau plus bas.

**3. Limitation à connaître : le profil ne couvre que les mois d'avril à septembre.**
Mesuré sur `reference_year = 2025` : mois 4 à 9 uniquement (2 400–2 480 lignes/mois), rien
d'octobre à mars. Sur ces six mois-là, la jointure ne rendra rien et la carte gardera sa
branche honnête (« pas encore disponible »). C'est le rythme de publication du Flash INSEE,
pas un défaut du correctif.

---

## Ce que je croyais, et ce qui est vrai

J'ai annoncé ce matin « les champs sont réservés et jamais remplis, il faut câbler ». **Faux.**
Le câblage existe : le CTE `foreign_tourism_named` (ligne ~1000) calcule bien `countries_named`,
`share_total_pct`, `n_countries`, et la copie gère déjà les deux branches (« Le poids de ces
nationalités dans votre région n'est pas encore disponible »).

**Il rend NULL pour deux raisons indépendantes, chacune suffisante à elle seule.**

### Défaut 1 — la date. Le CTE amont ne ramène AUCUNE ligne.

`region_foreign_mix` (ligne ~277) filtre :

```sql
where p.date >= current_date()
  and p.date <= date_add(current_date(), interval 3 day)
```

Or `fct_region_foreign_country_profile` ne projette que les **années publiées par l'INSEE** —
`reference_year = 2025` à ce jour, `max(date) = 2025-09-30`. Mesuré : **0 ligne ≥ `current_date()`**.
Le CTE est vide depuis le 01/01/2026, donc la jointure aval l'est aussi, pour tous les lieux et
tous les jours.

### Défaut 2 — la clé. Trois codages régionaux coexistent.

Ligne ~365 : `on m.region_code = d.region_id`. Ces deux colonnes ne parlent pas la même langue.

| région | `region_id` (lieux, NUTS 2016) | `region_code` (mart profil) | apparie ? |
|---|---|---|---|
| Île-de-France | `FR10` | `FR10` | ✅ |
| Occitanie | `FRJ` | `FR81` | ❌ |
| Bourgogne-Franche-Comté | `FRC` | `FRC1` | ❌ |
| Centre-Val de Loire | `FRB` | `FRB0` | ❌ |
| Normandie | `FRD` | `FRD1` | ❌ |
| Hauts-de-France | `FRE` | `FRE1` | ❌ |
| Provence-Alpes-Côte d'Azur | `FRL` | *absente du mart* | — |

Seule l'Île-de-France coïncide par hasard. **Aucune règle de préfixe ne marche** : quatre régions
suivent `FRx → FRx1/FRx0`, mais Occitanie casse le motif (`FRJ → FR81`). Il faut une
correspondance explicite — et surtout pas une jointure par libellé, même si les six noms
correspondent : c'est la règle « identité par la CLÉ » de `CLAUDE.md`.

### Ce qui n'est PAS en cause

`accommodation_type`, le piège du 28/07, **est déjà traité** : le CTE `region_acc_choice` choisit
une base par région. Ne pas y toucher. (Vérification faite : sans lui, sommer les parts d'Occitanie
à travers `hotels` et `campings` donne 99 % au lieu de 32 % — la part est une part *à l'intérieur*
d'un type d'hébergement, elle ne s'additionne pas d'un type à l'autre.)

---

## Le correctif

### 1. Remplacer le CTE `region_foreign_mix` (ligne ~277)

```sql
region_foreign_mix as (
    -- 31/07/2026 — DEUX CORRECTIFS, chacun rendait la jointure aval vide à 100 %.
    --
    -- 1. LA DATE. fct_region_foreign_country_profile ne projette que les ANNÉES publiées par
    --    l'INSEE (reference_year = 2025 à ce jour, max(date) = 2025-09-30) : le filtre
    --    « p.date >= current_date() » ne ramenait AUCUNE ligne depuis le 01/01/2026. Le profil
    --    étant saisonnier par construction (en-tête du mart : « identique pour toutes les dates
    --    d'une même saison × région × année »), on apparie le MOIS sur la dernière année de
    --    référence disponible. Le millésime ressort en clair pour que la carte le dise : c'est un
    --    profil de référence, jamais une mesure du jour.
    -- 2. LA CLÉ. Le mart porte un troisième codage régional (FR81 = Occitanie, FRC1, FRB0, FRD1,
    --    FRE1) là où les lieux portent le NUTS-2016 (FRJ = Occitanie). Seule l'Île-de-France
    --    coïncidait. Aucune règle de préfixe ne tient — FRJ → FR81 la casse — d'où une
    --    correspondance EXPLICITE. Par la clé, jamais par le libellé.
    -- 3. LE GRAIN (ajout 01/08). Le mart projette le profil sur CHAQUE JOUR (grain
    --    date × région × pays) : un mois porte ~31 lignes identiques par pays. Joindre au MOIS
    --    sans dédupliquer multiplierait share_total_pct par ~31. Mesuré : aucun
    --    (région, mois, pays) ne porte deux parts distinctes, le DISTINCT est donc exact.
    select distinct
        p.reference_year,
        extract(month from p.date)  as profile_month,
        r.region_id,
        p.country_iso_code,
        p.country_name_fr,
        p.country_share_of_nonresident
    from {{ ref('fct_region_foreign_country_profile') }} p
    inner join region_acc_choice a
        on  p.region_code        = a.region_code
        and p.accommodation_type = a.accommodation_type
    inner join (
        select * from unnest([
            struct('FR10' as mart_region_code, 'FR10' as region_id),
            ('FR81', 'FRJ'), ('FRC1', 'FRC'), ('FRB0', 'FRB'),
            ('FRD1', 'FRD'), ('FRE1', 'FRE')
        ])
    ) r
        on r.mart_region_code = p.region_code
    where p.country_iso_code is not null
      and p.reference_year = (
          select max(reference_year) from {{ ref('fct_region_foreign_country_profile') }}
      )
),
```

### 2. Corriger la jointure dans `foreign_tourism_named` (ligne ~365)

**REMPLACER**

```sql
    inner join region_foreign_mix m
        on  m.region_code      = d.region_id
        and m.date             = d.date
        and m.country_iso_code = c.country_iso_code
```

**PAR**

```sql
    inner join region_foreign_mix m
        on  m.region_id        = d.region_id
        and m.profile_month    = extract(month from d.date)
        and m.country_iso_code = c.country_iso_code
```

### 3. Exposer le millésime, pour que la carte ne mente pas sur ce qu'elle montre

Dans le `select` de `foreign_tourism_named`, **AJOUTER** :

```sql
        any_value(m.reference_year)                              as profile_reference_year,
```

Puis, dans `detail_fr` (~ligne 1066), **REMPLACER**

```sql
                    'Les pourcentages sont leur poids dans les nuitees etrangeres de votre region ',
                    '(INSEE, parmi les pays publies au Flash - pas la totalite des non-residents), ',
                    'soit ', cast(ftn.share_total_pct as string), '% cumules. ')
```

**PAR**

```sql
                    'Les pourcentages sont leur poids dans les nuitees etrangeres de votre region ',
                    '(INSEE ', cast(ftn.profile_reference_year as string), ', parmi les pays publies ',
                    'au Flash - pas la totalite des non-residents), soit ',
                    cast(ftn.share_total_pct as string), '% cumules. ')
```

Et ajouter `ftn.profile_reference_year` au `struct(...)` du `data_payload`, pour que le client
puisse afficher le millésime.

---

## Ce que ça donnera — re-mesuré le 01/08 (chaîne complète, avec la déduplication)

Chaîne `region_acc_choice → region_foreign_mix (distinct) → foreign_tourism_named` exécutée
telle quelle sur les tables réelles (mêmes CTE que le modèle, univers `ctx =
fct_location_context_features_daily`), `date = CURRENT_DATE()` (01/08/2026) :

| région | lieux couverts / actifs | pays appariés | part cumulée | détail (`countries_named` réel) |
|---|---|---|---|---|
| **Occitanie** (`FRJ`) | **16 / 16** | 4 | **43 %** | Royaume-Uni 16%, Suisse 11%, Allemagne 11%, Pays-Bas 5% |
| **Île-de-France** (`FR10`) | **11 / 11** | 4 | **33 %** | Royaume-Uni 14%, Allemagne 10%, Pays-Bas 5%, Suisse 4% |
| **PACA** (`FRL`) | 0 / 4 | 0 | — | région absente du mart (documenté dans son en-tête) |
| *(sans région)* | 0 / 1 | 0 | — | `region_id` NULL sur ce lieu |

⚠ Le « 32 % » d'Occitanie annoncé le 31/07 était faux (son propre détail sommait à 43).
Suisse/Allemagne sont à égalité (11 %) : leur ordre dans `string_agg` n'est pas déterministe.

**27 des 32 lieux** passent de « 24 pays sont en vacances scolaires » à « le Royaume-Uni, votre
1er marché étranger à 16 % des nuitées non-résidentes de la région, entre en vacances ».

Les 4 lieux de PACA gardent la branche honnête déjà écrite : « Le poids de ces nationalités dans
votre région n'est pas encore disponible. » **Ne pas inventer pour eux.**

---

## Ce que ce correctif ne fait PAS, et qu'il faut dire

- **Ce n'est pas une mesure de votre fréquentation.** C'est le mix des nuitées non-résidentes de
  la *région*, millésime **2025**, projeté sur le calendrier. La copie actuelle le dit déjà
  (« Ce n'est pas une mesure de votre fréquentation ») — garder cette phrase.
- **Le millésime vieillira.** Tant que l'INSEE ne publie pas 2026, la carte affichera un profil
  2025. C'est pour cela que le correctif fait ressortir `reference_year` : le jour où il devient
  gênant, il est visible plutôt que caché.
- **La carte reste jugée « non saine » par l'audit** tant que ce correctif n'est pas passé en
  production et re-mesuré. Ne pas lui écrire de plans avant.

---

## Les commandes dbt Cloud, dans l'ordre

Vérifié avant de les écrire : `fct_location_daily_action_candidates` est matérialisé en
**`table`** (pas `incremental`), et l'aval est constitué de deux **vues**
(`vw_insight_event_action_candidates`, `vw_insight_event_change_feed`) plus une table
(`int_competitor_offering_changes`).

**1. Compiler d'abord — attrape une faute de SQL sans toucher aux données.**

```
dbt compile --select fct_location_daily_action_candidates
```

**2. Construire le modèle ET son aval, avec les tests du `.yml`.**

```
dbt build --select fct_location_daily_action_candidates+
```

Le `+` final entraîne les deux vues sémantiques et l'intermédiaire qui en dépendent.
`dbt build` exécute les tests en plus des modèles ; `dbt run` seul les sauterait.

**PAS de `--full-refresh`.** La règle de `CLAUDE.md` (« les modèles incrémentaux ne prennent pas
les nouvelles colonnes sans `--full-refresh` ») ne s'applique pas ici : ce modèle est
`materialized = 'table'`, chaque run le reconstruit intégralement. Le drapeau serait sans effet.

⚠ Dans l'IDE, **« Preview » n'écrit rien** — seul « Run » matérialise. Vérifier ensuite
`creation_time` dans `INFORMATION_SCHEMA.TABLES` si un doute subsiste.

## Vérification après le run dbt

```sql
SELECT COUNT(*) AS lignes,
       COUNTIF(JSON_VALUE(data_payload,'$.countries_named') IS NOT NULL) AS avec_pays,
       COUNTIF(JSON_VALUE(data_payload,'$.share_total_pct') IS NOT NULL) AS avec_part,
       COUNTIF(JSON_VALUE(data_payload,'$.profile_reference_year') IS NOT NULL) AS avec_millesime,
       MAX(SAFE_CAST(JSON_VALUE(data_payload,'$.share_total_pct') AS FLOAT64)) AS part_max
FROM `muse-square-open-data.semantic.vw_insight_event_action_candidates`
WHERE action_type = 'foreign_tourism_signal' AND date >= CURRENT_DATE();
```

Attendu : `avec_pays`, `avec_part` et `avec_millesime` ≈ **27/32 des lignes** (tout sauf PACA
et le lieu sans `region_id`) ; **`part_max` ≤ 100** — c'est le témoin du bug de déduplication :
s'il dépasse 100, le `distinct` du CTE n'est pas passé. Au 01/08 (avant correctif) : **0 partout**.
