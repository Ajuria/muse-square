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
> Statut de CETTE passation : CONSOMMÉ — `int_competitor_offering_changes`, `fct_competitor_offering_changes` et `vw_insight_event_competitor_offering_changes` existent tous trois sur `origin/main`.

# PASS UNIQUE dbt — tout ce qui reste, en UN commit (25/08)

_Chaque fragment ci-dessous a été EXÉCUTÉ en BQ le 25/08 (refs résolues, lignes réelles en
preuve). Base : origin/main du repo ms_database, identique au checkout local (diffs vérifiés).
Après ce pass, AUCUN autre édit dbt n'est en file sur les chantiers ouverts — voir « Ce qui
n'est PAS dedans » en fin de document._

## État des lieux vérifié (25/08, diffs fichier-à-fichier + colonnes BQ)

DÉJÀ APPLIQUÉ (rien à faire) : `fct_client_day_residual` (attendus par facteur),
`fct_client_sales_signals_daily` (étiquette), `fct_client_hourly_signals_daily` (funnel +
régime, vos édits du matin), `fct_client_item_signals_daily`/`offering` (v2 euros),
`fct_location_change_feed`, `int_competitor_offering_changes`, `int_competitor_snapshot_deltas`,
`fct_location_daily_action_candidates` (état du 24/08), son `.yml` (diff = blancs).

RESTE = les 5 blocs ci-dessous. Ordre indifférent, un seul commit.

---

## BLOC 1 — payload candidates du CRÉNEAU (hour_share_move)

Fichier : `models/ms_open_data/mart/fct_location_daily_action_candidates.sql`,
CTE `hour_share_move as (` (~l. 2023).

**1a. Dans le `to_json_string(struct(...))`, INSÉRER sous** `cast(first_occurrence_date as string) as first_occurrence_date` **(+ virgule en fin de cette ligne) :**
```sql
            round(expected_hour_transactions, 1) as expected_hour_transactions,
            typ_n,
            baseline_same_regime_n,
            is_school_holiday_flag,
            regime_mismatch_flag
```

**1b. Dans le sous-select du même CTE, REMPLACER :**
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
```
**par :**
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
            s.expected_hour_transactions, s.typ_n, s.baseline_same_regime_n,
            s.is_school_holiday_flag, s.regime_mismatch_flag,
```
_Preuve : STRUCT exécuté — `{"expected_hour_transactions":36.4,"typ_n":8,"baseline_same_regime_n":6,"is_school_holiday_flag":true,"regime_mismatch_flag":false}` (ff2aeb35 × 20/08 × 8 h)._

---

## BLOC 2 — régime sur le PRODUIT (`fct_client_item_signals_daily`)

**2a. INSÉRER un CTE juste AVANT `windowed as (` :**
```sql
-- Régime calendaire (vacances scolaires par site × date) : la base 30 jours est-elle du
-- MÊME régime que le jour jugé ? (réserve de cyclicité, owner 25/08)
cal as (
    select location_id, date, is_school_holiday_flag
    from {{ ref('fct_location_context_daily') }}
),
```

**2b. CTE `windowed` — REMPLACER :**
```sql
        avg(di.unit_price)                             over w as price_baseline
    from daily_item di
    inner join day_totals t using (location_id, transaction_date)
    inner join item_frequency f using (location_id, item_description)
```
**par** (⚠ le join `cal` va APRÈS les `using` — avant, BQ lève « Column location_id in USING clause is ambiguous », attrapé à l'exécution) :
```sql
        avg(di.unit_price)                             over w as price_baseline,
        coalesce(c.is_school_holiday_flag, false)            as is_school_holiday_flag,
        countif(coalesce(c.is_school_holiday_flag, false)) over w as win_vac_n,
        count(*)                                       over w as win_n
    from daily_item di
    inner join day_totals t using (location_id, transaction_date)
    inner join item_frequency f using (location_id, item_description)
    left join cal c on c.location_id = di.location_id and c.date = di.transaction_date
```

**2c. CTE `scored` — REMPLACER :**
```sql
        safe_divide(unit_price - price_baseline, nullif(price_baseline, 0)) * 100 as price_delta_pct
    from windowed
```
**par :**
```sql
        safe_divide(unit_price - price_baseline, nullif(price_baseline, 0)) * 100 as price_delta_pct,
        win_n as typ_n,
        if(is_school_holiday_flag, win_vac_n, win_n - win_vac_n) as baseline_same_regime_n,
        safe_divide(if(is_school_holiday_flag, win_vac_n, win_n - win_vac_n), win_n) < 0.5 as regime_mismatch_flag
    from windowed
```

**2d. CTE `sold_rows` — INSÉRER sous** `(is_daily_item and delta_n >= 20 and abs(delta_z) >= 3.0 and abs(delta_eur) >= 30) as is_eur_move` **(+ virgule) :**
```sql
        is_school_holiday_flag,
        typ_n,
        baseline_same_regime_n,
        regime_mismatch_flag
```

**2e. CTE `dead_rows` — INSÉRER sous** `false                         as is_eur_move` **(+ virgule) :**
```sql
        cast(null as bool)            as is_school_holiday_flag,
        cast(null as int64)           as typ_n,
        cast(null as int64)           as baseline_same_regime_n,
        cast(null as bool)            as regime_mismatch_flag
```
_Preuve : modèle complet modifié exécuté — Latte Rg 22/08 : `typ_n 30 · same 30 · vacances true · mismatch false`._

---

## BLOC 3 — régime sur la FAMILLE (`fct_client_offering_signals_daily`)

**3a. INSÉRER le même CTE `cal` juste AVANT `windowed as (`** (texte du bloc 2a).

**3b. CTE `windowed` — REMPLACER :**
```sql
        count(revenue_share)       over w as share_n
    from offering o
    inner join eligible_locations e using (location_id)
    window w as (
        partition by location_id, item_category
        order by transaction_date
        rows between 30 preceding and 1 preceding
    )
```
**par** (⚠ la fenêtre DOIT se qualifier `o.` — sinon « Column name location_id is ambiguous », attrapé à l'exécution) :
```sql
        count(revenue_share)       over w as share_n,
        coalesce(c.is_school_holiday_flag, false)  as is_school_holiday_flag,
        countif(coalesce(c.is_school_holiday_flag, false)) over w as win_vac_n,
        count(*)                   over w as win_n
    from offering o
    inner join eligible_locations e using (location_id)
    left join cal c on c.location_id = o.location_id and c.date = o.transaction_date
    window w as (
        partition by o.location_id, o.item_category
        order by o.transaction_date
        rows between 30 preceding and 1 preceding
    )
```

**3c. CTE `scored` — INSÉRER sous** `(revenue_share - share_baseline) * 100                           as share_delta_points` **(+ virgule en fin de cette ligne) :**
```sql
        win_n as typ_n,
        if(is_school_holiday_flag, win_vac_n, win_n - win_vac_n) as baseline_same_regime_n,
        safe_divide(if(is_school_holiday_flag, win_vac_n, win_n - win_vac_n), win_n) < 0.5 as regime_mismatch_flag
```

**3d. CTE `labeled` — INSÉRER sous** `(delta_n >= 20 and abs(delta_z) >= 2.5 and abs(delta_eur) >= 60) as is_eur_move` **(+ virgule) :**
```sql
    is_school_holiday_flag,
    typ_n,
    baseline_same_regime_n,
    regime_mismatch_flag
```
_Preuve : modèle complet modifié exécuté — Coffee beans 20/08 : `typ_n 30 · same 25 · mismatch false` (le comptage partiel fonctionne)._

---

## BLOC 4 — payloads candidates PRODUIT + FAMILLE

Fichier : `fct_location_daily_action_candidates.sql`.

**4a. CTE `item_share_move as (` (~l. 1955) — dans le STRUCT, INSÉRER sous** `cast(first_occurrence_date as string) as first_occurrence_date` **(+ virgule) :**
```sql
            typ_n,
            baseline_same_regime_n,
            is_school_holiday_flag,
            regime_mismatch_flag
```
**et dans son sous-select, REMPLACER** `s.n_occurrences_60d, s.first_occurrence_date,` **par :**
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
            s.typ_n, s.baseline_same_regime_n, s.is_school_holiday_flag, s.regime_mismatch_flag,
```

**4b. CTE `offering_mix_shift as (` (~l. 1897)** — dans le STRUCT, INSÉRER sous `cast(first_occurrence_date as string) as first_occurrence_date` (+ virgule) :
```sql
            typ_n,
            baseline_same_regime_n,
            is_school_holiday_flag,
            regime_mismatch_flag
```
et dans son sous-select, REMPLACER `s.n_occurrences_60d, s.first_occurrence_date,` par :
```sql
            s.n_occurrences_60d, s.first_occurrence_date,
            s.typ_n, s.baseline_same_regime_n, s.is_school_holiday_flag, s.regime_mismatch_flag,
```
(Les TROIS CTE candidates complets, prêts à coller en bloc, ont été fournis dans la
conversation du 25/08 — en cas de doute, remplacer chaque bloc `xxx as ( … ),` entier.)
_Preuve : STRUCTs exécutés sur les modèles modifiés (Latte Rg / Coffee beans ci-dessus)._

---

## BLOC 5 — date de CONSTAT des offres retirées (une ligne)

`int_competitor_offering_changes` calcule DÉJÀ `change_first_seen_on` — y compris pour les
retraits (premier crawl après la dernière apparition ; vérifié en base : « Cinéma au musée »
→ 2026-08-24). Le mart ne la passe pas.

Fichier : `models/ms_open_data/mart/fct_competitor_offering_changes.sql` — DEUX insertions
(le CTE fait PASSER la colonne, le select final l'EXPOSE ; un seul des deux → « Unrecognized
name »). Diff prouvé purement additif (4 lignes ajoutées, 0 supprimée). AUCUN édit de l'int :
il calcule déjà `change_first_seen_on` dans son select final.

**5a. Dans le CTE `changes` (en haut du fichier), INSÉRER sous** `    current_crawled_at,` :
```sql
    change_first_seen_on,
```

**5b. Dans le select FINAL (après le bloc « fenêtre de détection »), REMPLACER :**
```sql
  -- fenêtre de détection
  c.previous_crawled_at,
  c.current_crawled_at,

  -- provenance
```
**par :**
```sql
  -- fenêtre de détection
  c.previous_crawled_at,
  c.current_crawled_at,

  -- la DATE du fait (int) — le « vu le » honnête, y compris sur les retraits
  c.change_first_seen_on,

  -- provenance
```

---

## Build + commit (UN seul)

```
dbt build -s fct_client_item_signals_daily fct_client_offering_signals_daily fct_competitor_offering_changes fct_location_daily_action_candidates
```
(rien d'incrémental parmi eux — pas de `--full-refresh`.)

**Message de commit :**
feat(signals): réserve de cyclicité sur les 3 cartes de performance (créneau/produit/famille —
typ_n, baseline_same_regime_n, is_school_holiday_flag, regime_mismatch_flag via
fct_location_context_daily, fenêtres inchangées) + funnel horaire dans le payload candidates
(expected_hour_transactions) + date de constat des offres retirées exposée au mart
(change_first_seen_on, déjà calculée par l'int). Tous fragments exécutés en BQ le 25/08
(lignes témoins : ff2aeb35×20/08×8 h ; Latte Rg 22/08 ; Coffee beans 20/08 ; Cinéma au musée
constat 24/08).

## Ce qui n'est PAS dedans (dit explicitement)

- **Régime pour les cartes JOUR (`sales_*`)** : leur base est la régression jour-de-semaine +
  tendance de `day_residual`, pas une fenêtre de jours listables — un drapeau de régime y est
  un chantier de MODÈLE (design), pas un ajout mécanique. À décider si le besoin se montre.
- **`accepted_values` du yml candidates** (liste fausse depuis le 06/06, test en `warn` muet) :
  la vraie liste est extractible de BQ en une requête — il manque VOTRE arbitrage warn/error.
  Un mot et je l'ajoute au pass.
- Rien d'autre : les 9 fichiers du dossier handoff ont été diffés un à un contre le déployé.
