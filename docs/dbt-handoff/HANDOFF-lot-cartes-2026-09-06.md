# Handoff dbt Cloud IDE — lot cartes du 06/09/2026 : porte de régime des cartes de faits, plancher chaleur des alertes

Sert : `docs/audits/cartes-action-audit-2026-09-04.md` § B1 (P1) et `docs/audits/cartes-action-audit-2026-09-06.md`
§ W1 + décision owner a (chaleur = alerte à partir du niveau 3, 32 °C). Les deux règles sont DÉJÀ appliquées
côté app (kit `MS_REGIME_GATE_TYPES`, registre `dateResolutionQuery` / `weatherAlertGone`, commits `dde862c`,
`d199a43`) : ce lot les met dans le mart pour que le parc entier — Explorer, rapport, Fil — les porte aussi, et
pour que l'app cesse de filtrer ce que le mart n'aurait pas dû émettre.

**Base vérifiée** : `origin/Ajuria-branch` à `eb1a547` (05/09) ; les trois fichiers touchés sont identiques entre
la branche et le checkout local (`git diff --stat` vide). Fins de ligne **LF** sur les trois. dbt 1.10.11. SQL
seulement, aucun yml. Chaque ancre ci-dessous a été vérifiée UNIQUE par programme dans son fichier, et le
fichier patché rejoué : +5/−1, +3/−1, +9/−0 lignes — rien d'autre ne bouge.

**Preuves SQL (BQ, 06/09, refs résolus)** :
- Porte de régime, 30 jours sur le parc (`fct_client_*_signals_daily`, colonnes `is_*_move` et
  `baseline_same_regime_n`) : heure **60 → 25** tirs, produit **63 → 41**, famille **36 → 24**. Sur le site
  owner le 06/09 : le créneau 15 h–16 h (0 témoin sur 7) et la famille Coffee tombent, le produit Chai
  (4 témoins sur 30) reste, hedgé.
- Plancher chaleur, 30 jours passés + 7 à venir, parc (`int_client_weather_alerts_daily`) : jours à
  `alert_level_max >= 2` **762 → 316**. Onsets chaleur (`fct_location_context_features_daily`, règle du
  change feed) : **35 → 75** — la règle actuelle (≤ 1 → ≥ 2) ne tire qu'à l'entrée d'un épisode ; la
  nouvelle (≤ 2 → ≥ 3) tire à chaque passage de 32 °C, donc plusieurs fois dans un épisode qui oscille
  autour de 32 °C. C'est le sens de la décision (une alerte = 32 °C et plus) ; si le nombre gêne, le
  plancher de `prev_heat` se remonte à `<= 1` (une seule fois par épisode).

**Ordre = ordre du DAG** : 1. intermédiaire → 2. change feed (mart) → 3. candidates (mart, lit le change feed
par `vw_insight_event_change_feed`).

---

## 1. `ms_dbt/models/ms_open_data/intermediate/int_client_weather_alerts_daily.sql` — MODIFIER (un bloc)

Ancre unique (lignes 286-293) : le `greatest(` de `alert_level_max`. REMPLACER le bloc par :

```sql
      else greatest(
        coalesce(h.lvl_wind, 0),
        coalesce(h.lvl_rain, 0),
        coalesce(h.lvl_snow, 0),
        -- 06/09/2026 (owner) : la chaleur ne compte comme ALERTE qu'à partir du niveau 3 (32 °C) ;
        -- 25–31 °C (niveaux 1-2) reste une classe de jour (lvl_heat inchangé), pas une alerte.
        -- HANDOFF-lot-cartes-2026-09-06. Avant : un dimanche nuageux à 29 °C = « mauvais jour »
        -- (alert_level_max >= 2) et deux cartes d'alerte.
        if(coalesce(h.lvl_heat, 0) >= 3, h.lvl_heat, 0),
        coalesce(h.lvl_cold, 0)
      )
    end as alert_level_max
```

`lvl_heat` lui-même ne change pas : le moteur de classes (« jours à 25–27 °C », « jours à 28 °C et plus »)
le lit tel quel.

## 2. `ms_dbt/models/ms_open_data/mart/fct_location_change_feed.sql` — MODIFIER (une ligne)

Ancre unique (ligne 1129, CTE `weather_hazard_feed`, branche `heat`) :

```sql
    from weather_hazard_source where prev_heat <= 1 and lvl_heat >= 2
```

REMPLACER par :

```sql
    -- 06/09/2026 (owner) : onset chaleur au niveau 3 (32 °C), même plancher que alert_level_max
    -- (int_client_weather_alerts_daily) — HANDOFF-lot-cartes-2026-09-06.
    from weather_hazard_source where prev_heat <= 2 and lvl_heat >= 3
```

## 3. `ms_dbt/models/ms_open_data/mart/fct_location_daily_action_candidates.sql` — MODIFIER (trois insertions)

La même clause s'AJOUTE sous le `where` de chacun des trois blocs de faits, juste après la ligne d'ancre :

```sql
          -- 06/09/2026 — PORTE DE RÉGIME (HANDOFF-lot-cartes-2026-09-06) : sans 3 jours du même
          -- régime (vacances / hors vacances) dans la base typique, le fait n'a pas de témoin.
          and s.baseline_same_regime_n >= 3
```

- 3a. CTE `offering_mix_shift` — ancre : `from {{ ref('fct_client_offering_signals_daily') }} s` puis
  `inner join loc l …` puis **`where s.is_eur_move = true`** (la première des deux occurrences du fichier,
  celle qui suit le ref offering).
- 3b. CTE `item_share_move` — ancre : `on t.location_id = s.location_id and t.transaction_date = s.transaction_date`
  puis **`where s.is_eur_move = true`** (la seconde occurrence).
- 3c. CTE `hour_share_move` — ancre : **`where s.is_hour_move = true`** (unique).

Les deux lignes `and s.transaction_date >= …` / `and s.transaction_date < current_date()` qui suivent
restent en place.

## 4. Message de commit (dbt Cloud IDE)

```
feat(cartes): porte de régime des cartes de faits (baseline_same_regime_n >= 3) et plancher chaleur des alertes au niveau 3 (32 °C) — lot du 06/09 (60→25 / 63→41 / 36→24 tirs sur 30 j ; 762→316 jours d'alerte)
```

## 5. Après le run

- `SELECT action_type, COUNT(*) FROM semantic.vw_insight_event_action_candidates WHERE action_type IN
  ('hour_share_move','item_share_move','offering_mix_shift') AND date >= CURRENT_DATE() - 7 GROUP BY 1` :
  aucune ligne avec `JSON_VALUE(data_payload, '$.baseline_same_regime_n') < 3`.
- `SELECT date, alert_level_max, lvl_heat FROM intermediate.int_client_weather_alerts_daily WHERE
  STARTS_WITH(location_id, 'f10c3e58') AND date = CURRENT_DATE()` : `alert_level_max` 0 quand `lvl_heat` ≤ 2
  et aucun autre aléa.
- Côté app, rien à changer : les gardes client deviennent sans effet (elles ne rencontrent plus de ligne
  à écarter) et restent comme ceinture.

— DÉFINITIF
