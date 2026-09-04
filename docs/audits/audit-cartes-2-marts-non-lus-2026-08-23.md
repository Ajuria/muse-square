# Second audit — les marts non lus, EN DONNÉES (23/08/2026) — SPEC DE TRAVAIL

> Suite de `audit-cartes-dbt-2026-08-23.md`. Le premier lot (PR #51, validé 6/6 sur la table) a
> corrigé ce qui était branché de travers. Celui-ci regarde ce qui n'est branché nulle part — en
> données, sur le compte de référence `f10c3e58`, pas en en-têtes.

## 0. Le lot 1 validé, et ce qu'il expose

34 types, 935 tirs, 6 contrôles sur 6 exacts. Mais les payloads montrent : **10 des 14 tirs de
`weather_mobility_double` ont un delta mobilité de −0,6 %**. C'est négatif, c'est vrai, et ça ne
vaut pas une carte « double risque ». La porte `< 0` posée au lot 1 est trop basse — **à durcir à
`<= −2` (niveau 1 du barème de `fct_location_impact_daily_mobility`)** dans le lot 2.

## 1. Les trois marts « ignorés » — verdict par mart

### `fct_location_mobility_disruptions__union` — EXPLOITABLE, nomme la ligne
Sur un site parisien, J..J+3 : **« Bus 86 : Travaux — Arrêt(s) non desservi(s) », arrêt
Faidherbe-Chaligny, à 81 m, niveau 4**. Les 3 cartes mobilité disent « perturbation mobilité » ;
la donnée dit *quelle ligne, quel arrêt, à combien de mètres*. Sur `f10c3e58` : 0 perturbation
J..J+3 — la carte ne tirerait pas chez vous cette semaine, et c'est exact.
→ **Enrichir le payload** des 3 cartes mobilité : `line`, `stop_name`, `distance_m`, `title`.
Règle 4 du lexique : « on NOMME ou on se tait ».

### `fct_competitor_alerts` — DÉJÀ CONSOMMÉ, et porte un bug d'écriture
Lu par 4 endpoints app (`monitor`, `map`, `competitor-profile`, `cron/alerts`). Pas un trou.
**Mais** : `new_value = "Musée Guimet détecté le [object Object]"` — un DATE BigQuery sérialisé
sans `.value` (le piège de `_cgWin` du 22/08). À corriger dans le producteur, pas ici.

### `fct_location_weather_alerts_5d` — EXPLOITABLE, dit QUAND
`f10c3e58` aujourd'hui : **pic mercredi 26/08, chaleur niveau 2, dans 4 jours**. Aucune carte
ne dit « le pic est dans 4 jours » — elles lisent l'alerte du jour J. Un exploitant prépare ses
achats à 2-3 jours (CLAUDE.md, droit français) : `days_until_peak` est exactement son horizon.
→ **Carte nouvelle** ou enrichissement de `weather_hazard_onset` : `peak_date`,
`days_until_peak`, `window_max_level`.

## 2. Les quatre gaps opérationnels — verdict par gap

### A. HORAIRE — `fct_client_hourly_sales` — PRÊT, signal net
`f10c3e58`, 30 derniers jours : **7 h–10 h = 51 % du CA** (12,3 / 12,5 / 12,4 / 13,8 %), chute
à 11 h (13,8 → 5,6 %), fin à 18 h. Tranche 6 h sur 16 jours / 31 seulement. C'est le grain que
l'owner a dit stratégique le 22/08 (micro-événementiel). Aucune carte ne le lit.
→ **Carte « votre heure forte »** : la tranche qui porte la part maximale, son écart à la
veille / à la semaine, et le jour où elle a manqué. Une règle de tir : tranche forte en retrait
de plus de X % sur sa moyenne 30 j.

### B. FAMILLE PRODUIT — `fct_client_offering_daily` — PRÊT, signal net
`f10c3e58`, 23/08 vs 30 j : **Coffee +24 % (767 € vs 617), Coffee beans −64 %, Bakery −29 %,
Drinking Chocolate +35 %**. Le KPI `family_revenue` existe dans `kpiRegistry` et rien ne le
déclenche. `revenue_rank`, `revenue_share`, `promo_count` sont déjà calculés.
→ **Carte « mouvement de famille »** : la famille au plus grand |écart €| vs sa moyenne 30 j.
Attention règle 13 : l'écart en € **et** en part, jamais le volume seul.

### C. ANALOGUES — `fct_client_day_analogs` — PAS PRÊT, défaut de construction
Écart médian jour courant vs analogues : **+44,6 % sur f10c3e58, +148 % sur les Olivades,
+319 % sur Esprit de Fabrique**. Jamais un seul `is_unexplained` sur 128 lignes. Un « jour
comparable » qui vaut systématiquement la moitié du jour courant n'est pas comparable : c'est le
**biais de retransformation log** documenté le 01/08 (`docs/audits/residu-bruit-diagnostic.md`), que ce
mart ne corrige pas. Le modèle dit lui-même que le tier `exact` « ne se répète presque jamais »
et retombe sur `dow_weather` (5/5 lignes vues).
→ **Ne pas câbler.** Corriger d'abord le référentiel (médiane log, pas moyenne €), puis
re-mesurer. Sinon la carte dira « +124 % vs vos jours comparables » tous les jours.

### D. ÉVÉNEMENT NOMMÉ DU JOUR — `fct_location_events_topn_daily` — PRÊT
`f10c3e58` aujourd'hui, 1 km : **« Kiosque en fête au jardin du Ranelagh » à 701 m**,
« Kiosque en Fête au parc Sainte-Périne » à 783 m. `competition_proximity` dit « 7 événements à
500 m » sans en nommer un. Le nom est à 701 m.
→ **Enrichir `competition_proximity`** : le premier `top_events_1km` dans le payload. Règle 4.

## 3. Le lot 2 — ce que je propose de livrer en un fichier dbt

| | quoi | fichier |
|---|---|---|
| 1 | porte mobilité `< 0` → `<= -2` | `fct_location_daily_action_candidates` |
| 2 | 3 cartes mobilité : payload nommé (ligne, arrêt, distance, titre) via `fct_location_mobility_disruptions__union` | idem |
| 3 | `competition_proximity` : premier événement nommé à 1 km via `fct_location_events_topn_daily` | idem |
| 4 | **nouvelle** `weather_peak_ahead` : pic météo J+1..J+4 via `fct_location_weather_alerts_5d` | idem |
| 5 | **nouvelle** `hourly_peak_shortfall` : tranche forte en retrait via `fct_client_hourly_sales` | idem |
| 6 | **nouvelle** `family_revenue_move` : famille au plus grand écart via `fct_client_offering_daily` | idem |

**Pas dans ce lot** : les analogues (C, à corriger d'abord), `fct_competitor_alerts` (bug côté
producteur app), `is_followed` sans `location_id` (autre fichier, autre lot).

**Trois cartes nouvelles = trois copies à passer au lexique** (titre, corps, geste) **avant**
que la règle de tir ne parte. Je propose la règle dbt et le payload ; les chaînes visibles
passent par la règle 4 — citer la surface — et le tableau 8-13 montré.
