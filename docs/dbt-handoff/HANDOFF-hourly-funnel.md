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
> Statut de CETTE passation : CONSOMMÉ — `fct_client_hourly_signals_daily` existe sur `origin/main` et la copie qui était ici en était le calque exact (0 ligne divergente au 26/08).

# Handoff dbt — funnel horaire + drapeau de régime pour `fct_client_hourly_signals_daily`

_Lot 1 copie Agir, 25/08. Base des instructions : `origin/main` du repo ms_database
(fichier `ms_dbt/models/ms_open_data/mart/fct_client_hourly_signals_daily.sql`, identique au
checkout local vérifié par diff le 25/08). **Le SQL complet modifié a été EXÉCUTÉ en BQ le
25/08** (1,6 s) et vérifié sur la ligne réelle de la carte : Occitanie ff2aeb35 × 2026-08-20 ×
8 h → revenue 465,15 · expected_hour_revenue 164,85 (= la carte « 465 € contre 165 € ») ·
**expected_hour_transactions 36,37** (réel : 95 — la surperformance est portée par les
tickets) · panier attendu 4,53 € · typ_n 8 · baseline_same_regime_n 6 ·
is_school_holiday_flag true · regime_mismatch_flag false._

## Pré-requis (vérifié en base le 25/08 — rien à faire)

`mart.fct_client_day_residual` porte déjà `expected_transactions` (chantier attendus par
facteur, livré). `mart.fct_location_context_daily` porte `is_school_holiday_flag` par
location_id × date.

## Instructions d'édition (dbt Cloud IDE)

Fichier : `models/ms_open_data/mart/fct_client_hourly_signals_daily.sql`

**1. CTE `days` — REMPLACER :**
```sql
days as (
    select location_id, transaction_date, sum(revenue) as day_revenue
    from hourly group by 1, 2
),
```
**par :**
```sql
days as (
    select location_id, transaction_date, sum(revenue) as day_revenue,
           sum(transactions) as day_transactions
    from hourly group by 1, 2
),

-- Régime calendaire du jour (drapeau vacances scolaires par site × date) : sert à dire si la
-- base 8 semaines est du MÊME régime que le jour jugé (question owner 25/08 : cyclicité).
cal as (
    select location_id, date, is_school_holiday_flag
    from {{ ref('fct_location_context_daily') }}
),
```

**2. CTE `shares` — REMPLACER la ligne :**
```sql
           safe_divide(h.revenue, d.day_revenue) as share
```
**par :**
```sql
           safe_divide(h.revenue, d.day_revenue) as share,
           safe_divide(h.transactions, d.day_transactions) as tx_share
```

**3. CTE `spine` — REMPLACER :**
```sql
spine as (
    select d.location_id, d.transaction_date, d.day_revenue, p.transaction_hour,
           avg(p.share) as typ_share, count(*) as typ_n
    from days d
    join shares p
```
**par :**
```sql
spine as (
    select d.location_id, d.transaction_date, d.day_revenue, p.transaction_hour,
           avg(p.share) as typ_share, count(*) as typ_n,
           avg(p.tx_share) as typ_tx_share,
           -- jours de base partageant le régime vacances du jour jugé (coalesce false :
           -- une date absente du contexte compte comme hors vacances, jamais comme match muet)
           countif(coalesce(cp.is_school_holiday_flag, false) = coalesce(cd.is_school_holiday_flag, false)) as baseline_same_regime_n,
           any_value(coalesce(cd.is_school_holiday_flag, false)) as is_school_holiday_flag
    from days d
    left join cal cd on cd.location_id = d.location_id and cd.date = d.transaction_date
    join shares p
```
**puis, dans le même CTE, INSÉRER sous la ligne** `and p.transaction_date >= date_sub(d.transaction_date, interval 56 day)` :
```sql
    left join cal cp on cp.location_id = p.location_id and cp.date = p.transaction_date
```
(le `group by 1, 2, 3, 4` et le `having` ne changent pas.)

**4. CTE `expected` — INSÉRER sous la ligne** `coalesce(h.revenue, 0) - s.typ_share * r.expected_revenue as delta_eur` **(ajouter d'abord une virgule en fin de cette ligne) :**
```sql
           s.typ_tx_share * r.expected_transactions as expected_hour_transactions
```
(NULL si `expected_transactions` est NULL — l'app se replie honnêtement, jamais un 0 inventé.)

**5. CTE `labeled` — INSÉRER sous la ligne** `round(expected_hour_revenue, 2) as expected_hour_revenue,` :
```sql
    round(expected_hour_transactions, 2) as expected_hour_transactions,
    typ_n,
    baseline_same_regime_n,
    is_school_holiday_flag,
    safe_divide(baseline_same_regime_n, typ_n) < 0.5 as regime_mismatch_flag,
```

**6. Matérialisation :** table (pas d'incrémental ici) — un simple `dbt build -s fct_client_hourly_signals_daily` suffit, pas de `--full-refresh` nécessaire.

## ÉTAPE 2 (25/08 après-midi — le mart est livré, RESTE le payload des candidates)

Vérifié en base : les 5 colonnes sont dans le mart, ligne témoin exacte. MAIS la carte lit
`data_payload` de `fct_location_daily_action_candidates`, dont le STRUCT liste ses champs —
les nouveaux n'y sont pas. Deux édits dans
`models/ms_open_data/mart/fct_location_daily_action_candidates.sql`, CTE `hour_share_move as (`
(vers la ligne 2023) :

**A. Dans le `to_json_string(struct(...))`, INSÉRER sous la ligne**
`cast(first_occurrence_date as string) as first_occurrence_date` **(ajouter d'abord une
virgule en fin de cette ligne) :**
```sql
            round(expected_hour_transactions, 1) as expected_hour_transactions,
            typ_n,
            baseline_same_regime_n,
            is_school_holiday_flag,
            regime_mismatch_flag
```

**B. Dans le sous-select `from (select ... ) where rn = 1 ...` du même CTE, REMPLACER :**
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
```
**par :**
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
            s.expected_hour_transactions, s.typ_n, s.baseline_same_regime_n,
            s.is_school_holiday_flag, s.regime_mismatch_flag,
```

_Le STRUCT étendu a été EXÉCUTÉ en BQ le 25/08 sur la ligne témoin — payload obtenu :
`{"...","expected_hour_transactions":36.4,"typ_n":8,"baseline_same_regime_n":6,
"is_school_holiday_flag":true,"regime_mismatch_flag":false}`._

**Message de commit proposé :**
feat(action_candidates): le payload hour_share_move transporte le funnel horaire
(expected_hour_transactions) et le drapeau de régime (typ_n, baseline_same_regime_n,
is_school_holiday_flag, regime_mismatch_flag) — livrés par fct_client_hourly_signals_daily ;
STRUCT exécuté en BQ sur ff2aeb35 × 20/08 × 8 h. Côté app, la carte lit ces clés dès
qu'elles arrivent (repli silencieux sinon).

## Architecture côté cartes (avis, tranché app-side)

**UNE seule carte, jamais deux types.** Le fait est le même (le créneau a dévié) ; ce qui
change est la CONFIANCE de la lecture. Le trigger est le drapeau :
- `regime_mismatch_flag = false` → la carte parle comme aujourd'hui ;
- `regime_mismatch_flag = true` → même carte, la phrase porte la réserve de régime (« comparé
  à des jeudis de vacances — premier jeudi hors vacances ») et la carte est rétrogradée en
  information (pas de « surperforme » affirmé) — cohérent avec « non concluant » et la
  discipline causale. Deux types de cartes créeraient deux suppression_keys, deux specs, deux
  copies à maintenir pour un seul fait.

## Message de commit proposé (dbt Cloud IDE)

feat(hourly_signals): expected_hour_transactions + drapeau de régime — attendu tickets par
heure (part typique 8 sem. même dow × expected_transactions du jour, livré par day_residual)
pour la décomposition tickets × panier de la carte créneau ; baseline_same_regime_n /
is_school_holiday_flag / regime_mismatch_flag (base vs jour jugé, contexte location) pour la
réserve de cyclicité. SQL complet exécuté en BQ le 25/08, vérifié sur ff2aeb35 × 20/08 × 8 h
(eht 36,37 vs 95 réels — surge tickets ; 6/8 jours de base même régime).
