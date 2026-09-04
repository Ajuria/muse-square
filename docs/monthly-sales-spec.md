# Verdicts MENSUELS par canal — « mois remarquable » (C3) — DÉFINITIF

> Chantier C3, livré le 07/08/2026. Troisième grain servi : un canal trop dispersé pour se juger
> **même à la semaine** peut se juger au **mois**.

État vérifié dans le code et dans le mart le 26/08/2026. Le chemin d'application vit dans
`git log`.

**Une cible renversée par la mesure** : le chantier visait le studio parisien. C'est en réalité le
**canal pro (`direct`) du site principal Olivades** qui se juge au mois — Paris reste trop dispersé
même à ce grain (dispersion 6,3). La donnée a tranché contre l'intuition de départ.

---

## Ce que le modèle mesure

`models/ms_open_data/mart/fct_location_channel_monthly.sql`.
Grain : **`location_id × channel_key × month_start`**.

**Éligibilité** (`is_monthly_judgeable`) : le canal ne doit être servi ni au jour ni à la semaine, et
sa dispersion mensuelle doit rester sous le seuil. Un canal déjà jugeable à la semaine n'escalade
pas — le `comptoir` d'Olivades (dispersion mensuelle 2,56) est **exclu** parce qu'il est déjà servi
par C2.

**Baseline** : médiane des mois précédents, minimum de recul sinon `insufficient_baseline`.
**États** : `hole` · `spike` · `low` / `high` (informatifs, **jamais de carte**) · `normal`.
**`is_run_start`** décide du tir, comme au grain semaine.

> **Même piège qu'en C2** : la baseline est `approx_quantiles(v, 2)[offset(1)]` — la valeur centrale
> **basse**, pas la médiane arithmétique. Elle est donc plus basse qu'un calcul à la main, et le
> détecteur tire un peu plus facilement. Toute mesure de contrôle rejoue la requête du mart.

---

## Le tir et le rendu

CTE `monthly_channel_latest` → `monthly_sales_hole` / `monthly_sales_spike` dans
`fct_location_daily_action_candidates.sql`. Priorité **4** / **3**, expiration à
`last_day + 21 jours`, `channel_hint = 'note_interne'`.

Côté app (`public/action-cards.js`) : copie au format MM/AAAA, nombres en fr-FR, ligne
**« Porté par : »** alimentée par `top_parties`, et **« Données jusqu'au »** — la carte dit toujours
jusqu'où va la donnée.

Thème `ventes` déclaré des deux côtés (parité testée), trois plans par type dans `reco-library.js`,
les deux types inscrits dans `COUVERTS_ACQUIS` de `recoCoverage.guard.test.ts`, et origines
d'engagement dans `commitmentOrigins.ts`.

**`top_parties` est plafonné à 3 comptes** dans le modèle. Une exploration qui en cite quatre décrit
autre chose que la carte.

---

## Le fait le plus important : ces cartes n'ont jamais tiré

**Zéro carte `monthly_sales_*` en base**, le 07/08 comme le 26/08 — même cause qu'en C2 : la donnée
Olivades s'arrête au **27/07/2026**. La copie n'a été validée qu'au harnais, sur des payloads
reconstitués.

---

## Calibrage — sortie réelle du mart, relue le 26/08

Site principal Olivades, canal `direct` : **11 mois**, tous jugeables. Deux pics, tous deux en
début de série, donc **deux cartes** :

| mois | état | CA | baseline | ratio | tire ? |
|---|---|---|---|---|---|
| 08/2025 | recul insuffisant | 1 735 € | — | — | non |
| 09/2025 | recul insuffisant | 37 103 € | 1 735 € | 21,39 | non |
| 10/2025 | recul insuffisant | 17 459 € | 1 735 € | 10,07 | non |
| 11/2025 | normal | 20 994 € | 17 459 € | 1,20 | non |
| **12/2025** | **pic** | **44 225 €** | 17 459 € | **2,53** | **oui** |
| 01/2026 | haut | 29 535 € | 20 994 € | 1,41 | non — informatif |
| 02/2026 | normal | 26 155 € | 20 994 € | 1,25 | non |
| **03/2026** | **pic** | **81 582 €** | 26 155 € | **3,12** | **oui** |
| 04/2026 | haut | 38 072 € | 26 155 € | 1,46 | non — informatif |
| 05/2026 | normal | 27 433 € | 29 535 € | 0,93 | non |
| 06/2026 | haut | 40 719 € | 29 535 € | 1,38 | non — informatif |

Les trois premiers mois sortent en `insufficient_baseline` : c'est le recul minimal qui les
protège, pas une anomalie.

Comptes en tête du pic de 03/2026 : FLAIREKREA 23 068 €, PORTHAULTNE 11 734 €, CHAHAN 8 103 €.
(FREYPIERRE, 7 362 €, est le quatrième — **hors carte**, `top_parties` s'arrête à 3.)

Répartition de jugeabilité : `comptoir` 11 mois, dispersion 2,56, **0 jugeable** (servi à la
semaine) ; `direct` **11/11 jugeables** sur le site principal ; Paris exclu par sa dispersion (6,3,
régime `episodic`) ; les sites `daily` exclus par le régime.

Requête de re-vérification :

```sql
select format_date('%m/%Y', month_start) mois, month_state, round(ca) ca,
       round(baseline_median) baseline, round(month_ratio, 2) ratio, is_run_start
from `muse-square-open-data.mart.fct_location_channel_monthly`
where location_id = '14379e18-2060-4b50-871d-edf0818eab8c' and channel_key = 'direct'
order by month_start
```

---

## Ce qui reste ouvert

1. **Le rail « note interne » n'est pas branché** — `channel_hint = 'note_interne'` côté dbt, mais
   les deux types sont absents de `V1_ALERT_ACTION_TYPES` (`src/lib/context/internalAlertCards.ts`). Les
   cartes ne surfacent donc que le jour de leur ingestion. **Jamais arbitré**, exactement comme en
   C2 — c'est une seule décision à prendre pour les quatre cartes.
2. **La table mensuelle ne se reconstruit plus depuis le 07/08**, alors que ses voisines
   (`fct_location_channel_weekly`, `fct_location_sales_regime`) et son consommateur
   (`fct_location_daily_action_candidates`) l'ont été depuis. Sans conséquence aujourd'hui — la
   donnée source est figée au 27/07 — mais **le mart des cartes la lit tous les jours**. À vérifier
   dans l'ordonnancement dbt Cloud (hors dépôt).
3. **Baseline saisonnière** (mois N−1) : non implémentée, et bloquée par la même absence d'année
   pleine qu'en C2.
4. **Consulter « où en est CHAHAN ? »** : partiel. La famille `channels` est enregistrée et route
   les questions de **canal**, mais ses motifs n'attrapent **aucun nom de compte** — une question
   nominative ne trouve pas son chemin.
5. **Formulation incohérente du même chiffre dans le code** : « 2 tirs sur **8** mois jugés »
   (en-tête du modèle) contre « 2 tirs sur **11** mois » (mart des cartes et `schema.yml`). Les deux
   comptages sont défendables (mois jugés vs mois présents) ; un seul doit rester.

**Livré depuis, retiré de la queue** : le rapport par canal (`rapport-canaux-spec.md`), qui lit ce
mart et `top_parties`.
