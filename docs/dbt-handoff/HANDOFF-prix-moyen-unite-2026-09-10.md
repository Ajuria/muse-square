# Handoff dbt Cloud IDE — prix moyen d'une famille au poids : « par article » seulement quand c'est prouvé (10/09/2026) — SPEC DE TRAVAIL

Sert : `intent.md` § Le test de valeur (« un chiffre porte son référentiel » ; une carte dit quelque chose
de vrai, ou ne s'affiche pas) et `strategie-entreprise.md` § 12.12 (Épices et Tout : FRUITS ET LEGUMES
pèse 32,7 % du CA net HT du relevé Crisalid du 02/01 au 09/09/2026, et se vend au poids).

## Le défaut

`fct_client_family_price_daily.realized_price` = Σ `revenue` ÷ Σ `quantity_decimal`. Sur une famille
vendue au poids, c'est un prix au kilo et `units` une somme de kilos : le ticket Crisalid d'Épices et
Tout du 09/09 imprime `kg` et `€/kg` (0,740 · 0,170 · 0,745 kg). Le bloc `family_price_move` de
`fct_location_daily_action_candidates` écrit pourtant « € par article » et « articles vendus » — et
`headline_fr` part dans les faits citables de l'IA (`dayContext` → `groundedPayload`).

Le défaut est **latent** : aucune caisse au poids n'est importée (0 ligne à quantité non entière sur
5 048 lignes famille × jour, 4 sites, mesuré le 10/09). Il se déclenche au premier import Crisalid.

## Base et ordre

**Base vérifiée : `origin/main` 2dc198a** (fusion de la PR #131). `origin/Ajuria-branch` (eb1a547, 05/09)
ne contient ni le mart prix ni le bloc `family_price_move` : ne pas en partir. Fichiers en LF. Version de
dbt : 1.10.11 lue dans le `target/manifest.json` local, daté du 24/09/2025 — non re-vérifiée dans l'IDE ;
la passation n'emploie aucune syntaxe qui en dépende (SQL, et `description` / `data_type` / `data_tests`
de colonne, déjà employés dans les deux yml).

**Ordre = ordre du DAG** : 1 mart → 2 candidats (qui font `ref` au 1) → 3 yml du mart → 4 yml de la vue
semantic. Chaque `ref()` d'un fichier livré pointe sur un nœud de `main` ou livré à un numéro inférieur.

**Le fichier 4 n'est pas facultatif.** `vw_insight_event_family_price_daily` est un `select *` sur le
mart, sous `contract: enforced: true` : sans la colonne déclarée à son contrat, son build échoue.

## Preuves (BigQuery, 10/09, SQL généré depuis `origin/main`)

| Contrôle | Résultat |
|---|---|
| Mart, ancien contre nouveau, toutes colonnes | 5 048 = 5 048 lignes ; **0 ligne différente** sur les 17 colonnes existantes (flottants à 10⁻⁶) ; `has_fractional_units` : 0 `true`, 0 `null` |
| Position de la nouvelle colonne | 14ᵉ, entre `discount_rate_sd` et `price_z` — l'ordre du contrat du fichier 4 |
| CTE `family_price_move` généré, texte exact, contre la production | 20 lignes sur 20 appariées ; `headline_fr` 20/20 et `detail_fr` 20/20 identiques ; payload identique hors la nouvelle clé 20/20 ; `has_fractional_units` = `false` dans les 20 |
| Témoin au poids (une ligne injectée en mémoire, aucune écriture) | `headline_fr` « Prix moyen en baisse sur Fruits et légumes le 30/08 : −6 % par rapport à votre prix habituel » · `detail_fr` « Sur 954 € de ventes. Remise 9,5 % contre 1,9 % d'habitude. » |
| Modèle des candidats COMPLET (3 670 lignes, 32 `ref`/`source` résolus) | `--dry_run` validé ; la base compilée de la même façon aussi (témoin) |
| Les deux yml | parsent ; 32 et 23 modèles, tous identiques hors cible ; contrat = colonnes réelles (ordre et types) ; 3 lignes ajoutées chacun, 0 retirée |
| Ce document | ses blocs, relus DANS le document et appliqués aux fichiers de `main`, redonnent les quatre fichiers prouvés octet pour octet |

---

## 1. `ms_dbt/models/ms_open_data/mart/fct_client_family_price_daily.sql` — REMPLACER TOUT LE CONTENU

```sql
/*
  MODEL
    fct_client_family_price_daily

  GOAL
    Prix moyen RÉALISÉ (CA / unités) et taux de remise par famille et par jour, contre la base
    des 28 jours précédents de la famille. Un prix réalisé qui baisse à volume constant = remises
    cachées, poids arrondis, ou mix intra-famille : la carte « prix réalisé en baisse sur <famille> ».
    revenue est BRUT (int_client_daily_performance : net = revenue − discount) ; taux = remise / CA.

  SOURCE
    {{ ref('stg_client_transactions') }} — lignes facturées, famille renseignée, quantité > 0
    (quantity_decimal : poids compris).

  GRAIN
    location_id × transaction_date × item_category

  RULES
    is_price_move    = baseline_n >= 14 AND units >= 10 AND |z| >= 2 AND |delta| >= 5 %
    is_discount_move = baseline_n >= 14 AND units >= 10 AND |z| >= 2 AND |delta| >= 3 points
    (units >= 10 ajouté le 06/09 : 12 tirs sur 13 portaient sur 1 à 6 unités — un article remisé
    faisait le taux de la famille ; même défaut, même parade que le prix.)

    has_fractional_units (10/09) = une quantité NON ENTIÈRE vue sur la famille, ce jour ou dans les
    28 jours précédents. Fait MESURÉ, pas une interprétation : une quantité de 0,740 n'est pas un
    article. Sur une telle famille, units est une somme de poids et realized_price un prix au poids
    — le ticket Crisalid d'Épices et Tout du 09/09 porte « kg » et « €/kg ». L'unité elle-même
    (kilo, litre) n'est PAS dans la caisse importée : ce drapeau dit seulement que « par article »
    serait faux. Fenêtre qui INCLUT le jour, pour qu'une famille ne bascule pas au gré des jours.
    Mesuré le 10/09 sur la base : 5 048 lignes famille × jour, 4 sites, 0 à true (aucune caisse
    au poids importée) ; témoin injecté en mémoire : true.
*/

{{ config(materialized = 'table', schema = 'mart', partition_by = {'field': 'transaction_date', 'data_type': 'date'}, cluster_by = ['location_id', 'item_category']) }}

with lines as (
    select location_id, transaction_date, item_category, revenue, discount_amount, quantity_decimal
    from {{ ref('stg_client_transactions') }}
    where is_invoiced
      and item_category is not null
      and quantity_decimal > 0
),

daily as (
    select
        location_id,
        transaction_date,
        item_category,
        sum(quantity_decimal)                                        as units,
        sum(revenue)                                                 as revenue,
        sum(discount_amount)                                         as discount_amount,
        safe_divide(sum(revenue), sum(quantity_decimal))             as realized_price,
        safe_divide(sum(discount_amount), nullif(sum(revenue), 0))   as discount_rate,
        logical_or(abs(quantity_decimal - round(quantity_decimal)) > 1e-9) as day_has_fractional_units
    from lines
    group by 1, 2, 3
),

baselined as (
    select
        d.*,
        avg(realized_price)         over w as price_baseline,
        stddev_samp(realized_price) over w as price_sd,
        count(realized_price)       over w as baseline_n,
        avg(discount_rate)          over w as discount_rate_baseline,
        stddev_samp(discount_rate)  over w as discount_rate_sd,
        logical_or(day_has_fractional_units) over w_unite as has_fractional_units
    from daily d
    window w as (
        partition by location_id, item_category
        order by unix_date(transaction_date)
        range between 28 preceding and 1 preceding
    ),
    w_unite as (
        partition by location_id, item_category
        order by unix_date(transaction_date)
        range between 28 preceding and current row
    )
),

scored as (
    select
        *,
        safe_divide(realized_price - price_baseline, nullif(price_sd, 0))            as price_z,
        safe_divide(realized_price - price_baseline, nullif(price_baseline, 0)) * 100 as price_delta_pct,
        safe_divide(discount_rate - discount_rate_baseline, nullif(discount_rate_sd, 0)) as discount_z,
        (discount_rate - discount_rate_baseline) * 100                                as discount_delta_points
    from baselined
)

select
    * except (day_has_fractional_units),
    -- units >= 10 : un prix moyen sur 3 unités bouge de 47 % sans rien dire (Branded, owner 25/09, mesuré 06/09).
    (baseline_n >= 14 and units >= 10 and abs(price_z) >= 2 and abs(price_delta_pct) >= 5) as is_price_move,
    (baseline_n >= 14 and units >= 10 and abs(discount_z) >= 2 and abs(discount_delta_points) >= 3) as is_discount_move,
    case when price_delta_pct < 0 then 'collapse' else 'surge' end                   as price_direction
from scored
```

## 2. `ms_dbt/models/ms_open_data/mart/fct_location_daily_action_candidates.sql` — MODIFIER (trois gestes)

Les trois sont dans le CTE `family_price_move` (ligne 2130). Numéros de ligne = fichier de `main` AVANT
toute modification ; chaque bloc à remplacer est unique dans le fichier.

**2a.** REMPLACER ces 8 lignes (2138-2145) :

```sql
        -- 07/09 owner : registre courant — « prix moyen », « articles », jamais « prix réalisé » ni « l'unité ».
        concat('Prix moyen en ', if(price_delta_pct < 0, 'baisse', 'hausse'), ' sur ', item_category, ' le ', format_date('%d/%m', date), ' : ',
               replace(format('%.2f', realized_price), '.', ','), ' € par article contre ',
               replace(format('%.2f', price_baseline), '.', ','), " € d'habitude") as headline_fr,
        concat(cast(round(units) as string), ' articles vendus, ', case when price_delta_pct >= 0 then '+' else '' end,
               cast(round(price_delta_pct) as string), ' % sur le prix moyen.',
               if(is_discount_move, concat(' Remise ', replace(format('%.1f', discount_rate * 100), '.', ','), ' % contre ',
                                           replace(format('%.1f', discount_rate_baseline * 100), '.', ','), " % d'habitude."), '')) as detail_fr,
```

PAR :

```sql
        -- 07/09 owner : registre courant — « prix moyen », « articles », jamais « prix réalisé » ni « l'unité ».
        -- 10/09 : l'unité ne s'affirme que si elle est prouvée. Sur une famille aux quantités non
        -- entières (has_fractional_units, mart prix), realized_price est un prix au poids et units une
        -- somme de poids : ni « par article » ni « articles vendus ». headline_fr part aussi dans les
        -- faits citables de l'IA (dayContext → groundedPayload). Branche else = le texte d'avant,
        -- octet pour octet (20 lignes de production sur 20 identiques, 10/09).
        case when has_fractional_units then
          concat('Prix moyen en ', if(price_delta_pct < 0, 'baisse', 'hausse'), ' sur ', item_category, ' le ', format_date('%d/%m', date), ' : ',
                 if(price_delta_pct >= 0, '+', '−'), cast(abs(cast(round(price_delta_pct) as int64)) as string), ' % par rapport à votre prix habituel')
        else
          concat('Prix moyen en ', if(price_delta_pct < 0, 'baisse', 'hausse'), ' sur ', item_category, ' le ', format_date('%d/%m', date), ' : ',
                 replace(format('%.2f', realized_price), '.', ','), ' € par article contre ',
                 replace(format('%.2f', price_baseline), '.', ','), " € d'habitude")
        end as headline_fr,
        case when has_fractional_units then
          concat('Sur ', cast(cast(round(revenue) as int64) as string), ' € de ventes.',
                 if(is_discount_move, concat(' Remise ', replace(format('%.1f', discount_rate * 100), '.', ','), ' % contre ',
                                             replace(format('%.1f', discount_rate_baseline * 100), '.', ','), " % d'habitude."), ''))
        else
          concat(cast(round(units) as string), ' articles vendus, ', case when price_delta_pct >= 0 then '+' else '' end,
                 cast(round(price_delta_pct) as string), ' % sur le prix moyen.',
                 if(is_discount_move, concat(' Remise ', replace(format('%.1f', discount_rate * 100), '.', ','), ' % contre ',
                                             replace(format('%.1f', discount_rate_baseline * 100), '.', ','), " % d'habitude."), ''))
        end as detail_fr,
```

**2b.** Dans le `to_json_string(struct(` du même CTE, APRÈS cette ligne (2157) :

```sql
            is_discount_move,
```

AJOUTER :

```sql
            has_fractional_units,
```

**2c.** REMPLACER cette ligne (2169) :

```sql
            f.baseline_n, f.price_direction,
```

PAR :

```sql
            f.baseline_n, f.price_direction, f.has_fractional_units,
```

## 3. `ms_dbt/models/ms_open_data/mart/schema_grain.yml` — MODIFIER (une insertion)

Dans le bloc `  - name: fct_client_family_price_daily` (ligne 366), APRÈS ces deux lignes (377-378 ;
`item_category` apparaît trois fois dans le fichier, c'est celle-ci) :

```yaml
      - name: item_category
        data_tests: [not_null]
```

AJOUTER :

```yaml
      - name: has_fractional_units
        description: "Une quantité non entière vue sur la famille ce jour ou dans les 28 jours précédents (10/09). Sur une telle famille, units est une somme de poids et realized_price un prix au poids : la carte family_price_move ne dit alors ni « par article » ni « articles vendus »."
        data_tests: [not_null]
```

## 4. `ms_dbt/models/ms_open_data/semantic/insight_event/schema_app_surfaces.yml` — MODIFIER (une insertion)

Dans le contrat de `  - name: vw_insight_event_family_price_daily` (ligne 1125), APRÈS ces deux lignes
(1162-1163), donc avant `price_z` :

```yaml
      - name: discount_rate_sd
        data_type: FLOAT64
```

AJOUTER :

```yaml
      - name: has_fractional_units
        data_type: BOOL
        description: "Une quantité non entière vue sur la famille ce jour ou dans les 28 jours précédents (10/09) : units est alors une somme de poids et realized_price un prix au poids — « par article » y serait faux. Fait mesuré ; l'unité elle-même (kilo, litre) n'est pas dans la caisse importée."
```

## 5. Branche et message de commit (dbt Cloud IDE)

Branche : `mart/prix-moyen-unite` (même forme que les PR #126 à #131).

```
fix(prix moyen): « par article » seulement quand c'est prouvé — has_fractional_units sur fct_client_family_price_daily, family_price_move dit l'écart en % sur une famille au poids (10/09 ; 0 ligne changée sur 5 048, 20/20 candidats identiques)
```

## 6. Après la fusion

Le job du matin ne tire pas les ancêtres : construire à la main.
`dbt build --select fct_client_family_price_daily+` — le mart et les candidats sont des `table`, aucun
`--full-refresh` n'est nécessaire. Le `+` reconstruit aussi leurs descendants.

Vérifications :
- `SELECT table_schema, data_type FROM \`muse-square-open-data.region-eu\`.INFORMATION_SCHEMA.COLUMNS WHERE column_name = 'has_fractional_units'`
  → deux lignes BOOL : `mart` (`fct_client_family_price_daily`) et `semantic` (`vw_insight_event_family_price_daily`).
- `SELECT COUNTIF(has_fractional_units), COUNT(*) FROM semantic.vw_insight_event_family_price_daily`
  → 0 `true` tant qu'aucune caisse au poids n'est importée.
- `SELECT headline_fr FROM semantic.vw_insight_event_action_candidates WHERE STARTS_WITH(location_id, 'f10c3e58')
  AND action_type = 'family_price_move' AND date = '2026-09-09'` → **inchangé** : « Prix moyen en hausse sur
  Bakery le 09/09 : 4,21 € par article contre 3,51 € d'habitude » (valeur lue le 10/09 avant la fusion).
- `JSON_VALUE(data_payload, '$.has_fractional_units')` vaut `'false'` sur toutes les lignes `family_price_move`.

## 7. Côté application

La carte est livrée sur `dev` dans le même commit que ce document, et ne dépend pas de l'ordre de
fusion. Drapeau absent ou `false` → le texte d'avant, mot à mot : rejoué le 10/09 par le chemin réel
de Pulse (`monitor`) et par la vue semantic sur `f10c3e58`, 8 rendus identiques sur 8. Drapeau `true` →
« Fruits et légumes : prix moyen −6 % le 30/08 par rapport à votre prix habituel, sur 954 € de ventes. »
(copie PROVISOIRE, `docs/lexique.md` § À arbitrer). Porte : `tests/client/action-cards.price.test.ts`.

## 8. Ce que cela ne corrige pas

- **L'unité n'est pas nommée.** Le kilo n'est pas dans la caisse importée ; l'export de détail Crisalid,
  attendu, la dira. Le mot attend l'owner et le fichier.
- **La branche non-poids de `detail_fr` dit encore « articles vendus »**, alors que la carte dit
  « ventes » depuis le 08/09 (owner). Chaîne non demandée : non réécrite ici, signalée.
- **`fct_client_day_family_decomposition`** fait la même division (`baseline_unit_price` = Σ CA ÷ Σ unités,
  `expected_units` = « ventes attendues »). Sur une famille au poids, ce sont des kilos. Non audité ici :
  à lire avant le premier import au poids.
