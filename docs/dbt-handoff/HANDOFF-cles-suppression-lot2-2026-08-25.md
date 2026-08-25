# dbt — clés de suppression, LOT 2 : les 7 derniers préfixes (25/08)

_Suite de `HANDOFF-cles-suppression-2026-08-25.md`, dont les 7 remplacements sont **passés**
(build du 25/08 17:45 UTC, vérifié : les trois collisions ont disparu). Base : `origin/main`,
`models/ms_open_data/mart/fct_location_daily_action_candidates.sql`, lignes relevées sur ce
même `origin/main`._

**AUCUN de ces 7 ne collisionne avec un type réel** (vérifié en BQ : 0 collision sur 7). Ils
cassent la convention annoncée en en-tête du modèle, rien de plus — c'est de la lisibilité et
de la cohérence, pas une correction de bug. À faire quand ça vous arrange.

⚠ **Même avertissement de migration qu'au lot 1** : les écartements déjà posés portent
l'ancienne clé et ne correspondront plus. Les cartes concernées réapparaîtront une fois.

## A · Trois remplacements simples (une occurrence chacun)

**1 · l. 1748** — `sales_competition_cannibalization`
```sql
        concat('sales_cannibalization:', cp.location_id, ':', cast(cp.transaction_date as string)) as suppression_key,
```
→
```sql
        concat('sales_competition_cannibalization:', cp.location_id, ':', cast(cp.transaction_date as string)) as suppression_key,
```

**2 · l. 2222** — `competitor_positioning_gap`
```sql
        concat('competitor_gap:', o.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
```
→
```sql
        concat('competitor_positioning_gap:', o.location_id, ':', format_date('%Y-%W', current_date())) as suppression_key,
```
⚠ Le 3e segment de CETTE clé est une **semaine ISO** (`%Y-%W`), pas une date. C'est voulu (la
carte est hebdomadaire) — ne pas l'aligner sur les autres. C'est aussi l'une des raisons pour
lesquelles on ne peut pas lire la date affectée dans la clé de suppression : mesuré le 25/08,
90 lignes sur 558 n'y portent aucune date exploitable.

**3 · l. 2860** — `ft_peak_bad_weather`
```sql
        concat('ft_peak_wx:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('ft_peak_bad_weather:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

## B · Les quatre cartes d'offre — UN seul remplacement pour les quatre

Leur préfixe n'est pas écrit en dur : il est **concaténé** (`'competitor_offering_' ||
oc.change_type`), ce qui produit quatre préfixes dont AUCUN n'égale l'`action_type` :

| `change_type` | `action_type` (l. 2260-2263) | préfixe produit aujourd'hui |
|---|---|---|
| `new_offering` | `competitor_new_offering` | `competitor_offering_new_offering` |
| `price_increase` | `competitor_price_increase` | `competitor_offering_price_increase` |
| `price_decrease` | `competitor_price_drop` | `competitor_offering_price_decrease` |
| `removed_offering` | `competitor_offering_removed` | `competitor_offering_removed_offering` |

Le modèle porte DÉJÀ la bonne correspondance, l. 2259-2264, pour construire `action_type`. Il
suffit de la réutiliser pour la clé — ainsi les deux ne pourront plus diverger.

**4 · l. 2360-2364** — REMPLACER :
```sql
        concat(
            'competitor_offering_', oc.change_type, ':',
            f.location_id, ':', oc.competitor_id, ':', oc.item_norm, ':',
            cast(oc.change_first_seen_on as string)
        ) as suppression_key,
```
**par** (même mapping que l'`action_type` juste au-dessus, écrit une seule fois de plus — pas
une seconde table à tenir à jour, la même expression) :
```sql
        concat(
            case oc.change_type
                when 'new_offering'     then 'competitor_new_offering'
                when 'price_increase'   then 'competitor_price_increase'
                when 'price_decrease'   then 'competitor_price_drop'
                when 'removed_offering' then 'competitor_offering_removed'
            end, ':',
            f.location_id, ':', oc.competitor_id, ':', oc.item_norm, ':',
            cast(oc.change_first_seen_on as string)
        ) as suppression_key,
```
⚠ Cette clé a **cinq** segments (préfixe : lieu : concurrent : article : date de constat) — ne
pas l'aligner sur le gabarit à trois segments. Le commentaire au-dessus explique pourquoi la
date est `change_first_seen_on` : sans elle la carte revenait chaque matin avec une clé neuve.

## Après le build — la vérification qui doit rendre ZÉRO ligne

```sql
SELECT action_type, SPLIT(suppression_key, ':')[SAFE_OFFSET(0)] AS prefixe, COUNT(*) n
FROM `muse-square-open-data.mart.fct_location_daily_action_candidates`
GROUP BY 1, 2
HAVING action_type <> prefixe
ORDER BY n DESC
```

```
dbt build -s fct_location_daily_action_candidates
```

**Message de commit :**
fix(candidates): lot 2 — les 7 derniers préfixes de suppression_key nomment leur action_type.
Trois remplacements simples (sales_competition_cannibalization, competitor_positioning_gap,
ft_peak_bad_weather) et UN pour les quatre cartes d'offre, dont le préfixe était concaténé
('competitor_offering_' || change_type) et ne pouvait donc égaler aucun action_type : la clé
réutilise désormais le MÊME case que l'action_type deux lignes plus haut. Aucun de ces sept ne
collisionnait avec un type réel (vérifié en BQ) — après le lot 1 qui en corrigeait trois, la
convention {action_type}:{...} annoncée en en-tête du modèle est enfin vraie partout.
