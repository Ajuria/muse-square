> **26/08 — les copies `.sql` / `.yml` de ce dossier ont été RETIRÉES. Ne les recherchez pas : le modèle dans `ms_database` fait foi.**
>
> Pourquoi : 4 des 9 copies avaient divergé du modèle réel, et deux étaient devenues dangereuses.
> `fct_client_offering_signals_daily.sql` et `fct_client_item_signals_daily.sql` dataient d'AVANT le
> bloc RÉGIME du 25/08 : les recoller aurait supprimé `typ_n`, `baseline_same_regime_n`,
> `is_school_holiday_flag` et `regime_mismatch_flag` — quatre colonnes vérifiées PRÉSENTES en
> production dans les deux tables. `int_competitor_offering_changes.sql` avait perdu
> `schema = 'intermediate'` (le modèle serait parti dans le mauvais dataset), et
> `fct_location_daily_action_candidates.yml` divergeait de 216 lignes.
>
> Une copie d'un modèle vieillit sans prévenir ; un chemin vers le modèle, non. Le texte de la
> passation ci-dessous est conservé INTACT — c'est lui qui porte le raisonnement.
>
> Statut de CETTE passation : CONSOMMÉ — lot 1 livré dans `ms_database` commit `97c2abd` (7 types réalignés, 3 collisions réelles).

# dbt — clés de suppression alignées sur `action_type` (25/08)

_Base : `origin/main` du dépôt ms_database, fichier
`models/ms_open_data/mart/fct_location_daily_action_candidates.sql`. Numéros de ligne relevés
sur ce même `origin/main`. Chaque constat ci-dessous vient d'une requête exécutée en BQ le
25/08 sur `mart.fct_location_daily_action_candidates` (558 lignes)._

## Le constat (mesuré, pas déduit)

Neuf types de carte écrivent une `suppression_key` dont le PRÉFIXE nomme un AUTRE type :

| lignes | `action_type` | préfixe écrit |
|---|---|---|
| 55 | `weekend_vacation_low_comp` | `wknd_vac_low:` |
| 31 | `commercial_event_match` | `commercial_match:` |
| 31 | **`audience_shift_opportunity`** | **`calendar_audience_shift:`** ← type RÉEL |
| 31 | `low_competition_window` | `low_competition:` |
| 14 | **`top_day_approaching`** | **`score_up:`** ← type RÉEL |
| 14 | `competitor_new_offering` | `competitor_offering_new_offering:` |
| 5 | `same_bucket_saturation` | `same_bucket_sat:` |
| 5 | **`competitor_threat_direct`** | **`competitor_event_launch:`** ← type RÉEL |
| 4 | `competitor_offering_removed` | `competitor_offering_removed_offering:` |

**Pourquoi ça compte.** L'app écarte une carte (« Pas pour moi ») et suit son cycle de vie PAR
`suppression_key`. Les trois lignes en gras sont des **collisions** : la clé écrite appartient à
un type de carte qui existe par ailleurs. Écarter l'un peut donc masquer l'autre, ou laisser
revenir celui qu'on a écarté. Les six autres ne collisionnent pas mais rendent la clé illisible
et cassent la convention annoncée dans l'en-tête du modèle
(`{action_type}:{location_id}:{date}`).

⚠ **MIGRATION — à décider avant de lancer.** Les suppressions déjà écrites par les utilisateurs
portent l'ANCIENNE clé. Après ce changement, elles ne correspondront plus : les cartes écartées
réapparaîtront une fois. Sur le parc au 25/08 cela concerne au plus 190 lignes de candidates ;
le volume réel d'écartements posés est à vérifier côté `analytics.action_log` avant de lancer.

## Les 7 remplacements (le fichier n'en contient qu'une occurrence chacun)

**1 · l. 893** — `top_day_approaching` (collision avec `score_up`)
```sql
        concat('score_up:', t.location_id, ':', cast(t.date as string)) as suppression_key,
```
→
```sql
        concat('top_day_approaching:', t.location_id, ':', cast(t.date as string)) as suppression_key,
```

**2 · l. 963** — `audience_shift_opportunity` (collision avec `calendar_audience_shift`)
```sql
        concat('calendar_audience_shift:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('audience_shift_opportunity:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

**3 · l. 1033** — `competitor_threat_direct` (collision avec `competitor_event_launch`)
```sql
        concat('competitor_event_launch:', c.location_id, ':', c.competitor_id, ':', cast(c.event_date as string)) as suppression_key,
```
→
```sql
        concat('competitor_threat_direct:', c.location_id, ':', c.competitor_id, ':', cast(c.event_date as string)) as suppression_key,
```
⚠ cette clé a QUATRE segments (le `competitor_id` s'intercale) — ne pas l'aligner sur les autres,
la carte est au grain concurrent × événement.

**4 · l. 1395** — `low_competition_window`
```sql
        concat('low_competition:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('low_competition_window:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

**5 · l. 2725** — `same_bucket_saturation`
```sql
        concat('same_bucket_sat:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('same_bucket_saturation:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

**6 · l. 2751** — `weekend_vacation_low_comp`
```sql
        concat('wknd_vac_low:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('weekend_vacation_low_comp:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

**7 · l. 2780** — `commercial_event_match`
```sql
        concat('commercial_match:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```
→
```sql
        concat('commercial_event_match:', d.location_id, ':', cast(d.date as string)) as suppression_key,
```

**Restent 2 types NON traités ici**, faute d'avoir trouvé leur `concat(` dans le fichier —
`competitor_new_offering` (`competitor_offering_new_offering:`) et `competitor_offering_removed`
(`competitor_offering_removed_offering:`). Leur préfixe est construit ailleurs, probablement par
concaténation d'un radical et d'un suffixe. À traiter dans la même passe une fois localisés :
`grep -n "competitor_offering_" sur le modèle`. **Ils ne collisionnent avec aucun type réel**,
donc ils ne bloquent pas cette livraison.

## Après le build — la vérification qui doit rendre ZÉRO

```sql
SELECT action_type, SPLIT(suppression_key, ':')[SAFE_OFFSET(0)] AS prefixe, COUNT(*) n
FROM `muse-square-open-data.mart.fct_location_daily_action_candidates`
GROUP BY 1, 2
HAVING action_type <> prefixe
ORDER BY n DESC
```
Attendu : uniquement les deux types `competitor_offering_*` restants. Toute autre ligne = un
remplacement manqué.

```
dbt build -s fct_location_daily_action_candidates
```

**Message de commit :**
fix(candidates): la suppression_key nomme enfin son propre action_type — 7 types réalignés,
dont TROIS collisions avec un type réel (audience_shift_opportunity écrivait
`calendar_audience_shift:`, top_day_approaching écrivait `score_up:`, competitor_threat_direct
écrivait `competitor_event_launch:`). L'app suit le cycle de vie des cartes PAR cette clé :
écarter l'une pouvait masquer l'autre. Mesuré le 25/08 sur les 558 lignes du mart : 190 lignes
portaient un préfixe étranger. Restent competitor_new_offering et competitor_offering_removed,
dont le préfixe est construit ailleurs — sans collision, à traiter dans la passe suivante.
