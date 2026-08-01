# `foreign_tourism_signal` — le câblage régional, diagnostic et correctif

> **À appliquer dans l'IDE dbt Cloud** (`models/ms_open_data/mart/fct_location_daily_action_candidates.sql`).
> Je ne peux ni l'appliquer ni le tester : `dbt run` passe par dbt Cloud. Ce que j'ai vérifié,
> c'est **la logique de jointure elle-même**, exécutée sur les tables réelles — résultats mesurés
> en fin de document.

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
    select
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

## Ce que ça donnera — mesuré, pas espéré

Logique de jointure corrigée, exécutée sur les tables réelles, `date = CURRENT_DATE()` :

| région | lieux | base | pays appariés | part cumulée | détail |
|---|---|---|---|---|---|
| **Occitanie** (`FRJ`) | **16** | `hotels` | 4 | **32 %** | Royaume-Uni 16 %, Allemagne 11 %, Suisse 11 %, Pays-Bas 5 % |
| **Île-de-France** (`FR10`) | **11** | `hotels` | 4 | **33 %** | Royaume-Uni 14 %, Allemagne 10 %, Pays-Bas 5 %, Suisse 4 % |
| **PACA** (`FRL`) | **4** | — | 0 | — | région absente du mart (documenté dans son en-tête) |

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

## Vérification après le run dbt

```sql
SELECT COUNT(*) AS lignes,
       COUNTIF(JSON_VALUE(data_payload,'$.countries_named') IS NOT NULL) AS avec_pays,
       COUNTIF(JSON_VALUE(data_payload,'$.share_total_pct') IS NOT NULL) AS avec_part
FROM `muse-square-open-data.semantic.vw_insight_event_action_candidates`
WHERE action_type = 'foreign_tourism_signal' AND date >= CURRENT_DATE();
```

Attendu : `avec_pays` et `avec_part` ≈ **27/32 des lignes** (tout sauf PACA). Aujourd'hui : **0**.
