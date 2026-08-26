# Verdicts HEBDO par canal — « semaine remarquable » (C2) — DÉFINITIF

> Chantier C2, livré le 07/08/2026. Deuxième grain servi après C1 (motifs par client) :
> un canal dont la dispersion quotidienne interdit tout verdict au jour peut se juger **à la
> semaine**.

État vérifié dans le code et dans le mart le 26/08/2026. Le chemin d'application vit dans
`git log` (app `7da2d38`, dbt `3ddb813`).

---

## Ce que le modèle mesure

`models/ms_open_data/mart/fct_location_channel_weekly.sql`.
Grain : **`location_id × channel_key × week_start`**. Canal absent → `__site__`, rendu « du site ».

**Éligibilité — un canal ne se juge à la semaine que si les quatre conditions tiennent** :
≥ 8 semaines d'historique, ≥ 3 jours actifs médians, dispersion hebdomadaire ≤ 3, et régime
`weekly` selon `fct_location_sales_regime`. Le drapeau est `is_weekly_judgeable`.

**Baseline** : médiane des **6 semaines précédentes** (`range between 42 preceding and 1
preceding`), minimum **4 semaines** de recul — sinon `insufficient_baseline`.

**États** : `hole` sous **0,5 ×** la baseline · `spike` au-dessus de **2,0 ×** · `low` / `high` à
±30 % (informatifs, **ne font jamais de carte**) · `normal` sinon.

**`is_run_start`** décide du tir : une carte ne sort qu'au **début** d'une série d'états
identiques. Trois semaines de pic consécutives font une carte, pas trois.

> **Piège de lecture — la baseline n'est pas la médiane exacte.** Le modèle utilise
> `approx_quantiles(v, 2)[offset(1)]`, qui prend la valeur centrale **basse** sur 6 valeurs, là où
> une médiane arithmétique moyennerait les deux centrales. Les baselines du modèle sont donc
> systématiquement un peu **plus basses**, et le détecteur tire un peu **plus facilement**, qu'un
> calcul à la main. Toute mesure de contrôle doit rejouer la requête du mart, jamais recalculer une
> médiane à côté.

---

## Le tir

CTE `weekly_channel_latest` → `weekly_sales_hole` / `weekly_sales_spike` dans
`fct_location_daily_action_candidates.sql`. Priorité **4** pour le trou, **3** pour le pic.
Expiration à **J+13** de la semaine concernée. `channel_hint = 'note_interne'`.

## Le rendu dans l'app

`public/action-cards.js` : **« Semaine très en retrait »** (📉) et **« Semaine exceptionnelle »**
(📈). Le sowhat lit le payload du mart (`week_start`/`week_end`, `ca`, `active_days`,
`baseline_median`, `baseline_weeks`, `data_end`) — jamais de valeur re-dérivée côté client.

Actions : *comprendre la semaine — contexte, achats, animation* (trou) ; *identifier ce qui a porté
la semaine et le capturer* (pic).

Thème `ventes`, déclaré des deux côtés (`action-cards.js` + `src/lib/recoThemeMap.ts`, parité
testée). Trois plans dans `reco-library.js` par type, et les deux types sont inscrits dans
`COUVERTS_ACQUIS` de `recoCoverage.guard.test.ts` — **liste qui ne fait que grandir** : le chantier
ne peut plus régresser silencieusement. Origines d'engagement dans `commitmentOrigins.ts`.

---

## Le fait le plus important : ces cartes n'ont jamais tiré

**Zéro carte `weekly_sales_*` en base, le 07/08 comme le 26/08.**

Ce n'est pas un défaut du détecteur : le flux Olivades est **figé à `data_end = 27/07/2026**,
soit un mois de retard. Aucune semaine nouvelle n'est arrivée depuis l'écriture de la spec. Le
contrat « la carte ne parle que quand il y a quelque chose à dire » tient — mais il n'a **jamais
été éprouvé sur un tir réel**, seulement en `vm` sur des lignes historiques.

---

## Calibrage — sortie réelle du mart, relue le 26/08

Site principal Olivades, canal `comptoir` : **49 semaines**, dont **48 complètes**.
Dispersion `comptoir` **2,42** (jugeable) · `direct` **4,98** (non jugeable — c'est ce canal-là qui
a motivé l'escalade au mois, cf. `monthly-sales-spec.md`).

Les états extrêmes produits par le modèle. **Seules les lignes `is_run_start` font une carte** —
soit **9 tirs : 5 trous et 4 pics** :

| semaine | état | CA | baseline | ratio | tire ? |
|---|---|---|---|---|---|
| 03/11/2025 | trou | 1 200 € | 3 057 € | 0,39 | **oui** |
| 17/11/2025 | trou | 874 € | 2 488 € | 0,35 | **oui** |
| 08/12/2025 | pic | 2 524 € | 1 250 € | 2,02 | **oui** |
| 15/12/2025 | pic | 3 631 € | 1 250 € | 2,91 | non — continuation |
| 22/12/2025 | pic | 4 330 € | 1 385 € | 3,13 | non — continuation |
| 12/01/2026 | trou | 902 € | 2 646 € | 0,34 | **oui** |
| 02/02/2026 | trou | 710 € | 2 155 € | 0,33 | **oui** |
| 09/02/2026 | pic | 3 700 € | 1 624 € | 2,28 | **oui** |
| 16/03/2026 | pic | 4 621 € | 1 882 € | 2,46 | **oui** |
| 30/03/2026 | pic | 13 705 € | 1 882 € | 7,28 | **oui** |
| 06/04/2026 | pic | 8 322 € | 2 047 € | 4,07 | non — continuation |
| 13/04/2026 | pic | 5 018 € | 2 291 € | 2,19 | non — continuation |
| 27/04/2026 | trou | 1 915 € | 5 018 € | 0,38 | **oui** |

Dernière semaine complète (20-26/07) : 4 292 € contre une baseline de 4 040 € — ratio 1,06,
**normale**, zéro carte. C'est le comportement attendu.

Requête de re-vérification :

```sql
select format_date('%d/%m/%Y', week_start) sem, week_state, round(ca) ca,
       round(baseline_median) baseline, round(week_ratio, 2) ratio, is_run_start
from `muse-square-open-data.mart.fct_location_channel_weekly`
where location_id = '14379e18-2060-4b50-871d-edf0818eab8c' and channel_key = 'comptoir'
  and week_state in ('hole', 'spike')
order by week_start
```

---

## Ce qui reste ouvert

1. **Le rail « note interne » n'est pas branché.** Les deux cartes portent
   `channel_hint = 'note_interne'` côté dbt, mais **ne figurent pas** dans `V1_ALERT_ACTION_TYPES`
   (`src/lib/internalAlertCards.ts`). Conséquence : elles ne bénéficient pas du contournement de
   fenêtre du monitor et ne surfacent que le jour de leur ingestion. Soit le `channel_hint` est
   trompeur, soit l'allowlist est incomplète — **jamais arbitré**, et la situation est identique
   pour les cartes mensuelles.
2. **`low` / `high` fuient hors des cartes.** Le contrat « ces états ne font jamais de carte » tient
   pour les cartes, mais `insightFamilies/channels.ts` passe `week_state` brut au rapport.
3. **Baseline saisonnière** (même semaine N−1) : non implémentée, et **inatteignable tant que le
   flux ne repart pas** — il n'y aura pas d'année pleine avec des données arrêtées au 27/07/2026.
4. **Contexte de semaine** (météo, vacances, travaux) dans `detail_fr` : prévu « après le premier
   tir réel », donc bloqué par le point ci-dessus.
5. **Coquille d'indentation** dans `fct_location_daily_action_candidates.sql` (CTE
   `weekly_sales_spike`) : 8 espaces au lieu de 4 sur le `from weekly_channel_latest`. Sans effet
   SQL.

**Livré depuis, retiré de la queue** : le bilan hebdo par canal dans le **rapport**
(`rapport-canaux-spec.md`, famille `channels.ts`) et le **C3 mensuel**
(`monthly-sales-spec.md`).
