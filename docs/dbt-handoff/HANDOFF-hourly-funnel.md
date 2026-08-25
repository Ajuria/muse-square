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
