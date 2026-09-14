# Audit des seeds « secteur » — des libellés dans les colonnes de code (10/09/2026) — DÉFINITIF

Sert : `intent.md` § Le test de valeur (une carte dit quelque chose de **vrai**). Demande owner
10/09 : « audit seeds en détail pour le fix des libellés » — le mart des menaces porte « Culture &
Patrimoine » dans `competitor_industry_code` au lieu d'un code. Instantané : mesures du 10/09 sur
`muse-square-open-data`, modèles et seeds lus sur `origin/main` du dépôt dbt (`b21f274`).

---

## 0. En deux phrases

Une colonne nommée `industry_code` porte, sur **192 202 paires sur 192 658 (99,8 %)** du mart des
menaces, un libellé français (« Culture & Patrimoine ») au lieu d'un code (`culture`) : ce n'est pas
un défaut d'affichage, car partout où un code est comparé à cette colonne, la comparaison échoue en
silence. Mais **corriger le libellé seul ferait réapparaître de l'ordre de 7 200 menaces « hautes »
fausses** — le nombre exact que la porte secteur du 09/09 a retiré — et le correctif doit donc porter
sa garde dans le même geste.

---

## 1. La lignée, du seed à l'écran (lue ligne à ligne)

| # | Où | Ce qui s'y passe |
|---|---|---|
| 1 | `seeds/open_data/geo/event_industry_keywords.csv` (339 mots-clés) | sa colonne **`industry_code` porte des libellés** (« Culture & Patrimoine », mot-clé « musée ») — c'est l'origine côté événements |
| 2 | `int_events_daily` (union des six branches `_idf`, `_occitanie`, `_paca`, `_idf_openagenda`, `_admin`, `_user`) | `industry_code` = libellés, mesuré : 3 433 338 lignes « Parcs d'attractions & Loisirs », 3 308 870 « Culture & Patrimoine », 2 014 508 « Sports & Loisirs actifs »… |
| 3 | **`int_events_event_daily_enriched.sql` l. 249** | **le point de fuite** : `coalesce(n.canonical_label_fr, d.industry_code_raw, 'unknown') as industry_code`. La jointure l. 260-262 (`source = 'profile'`, libellé → code) fournit pourtant `n.canonical_industry_code` ; le modèle choisit le libellé, puis recalcule ce même libellé l. 257 dans `industry_label_fr`, colonne qu'**aucun modèle ne lit** |
| 4 | `fct_competitor_directory.sql`, branche `ms_database` (l. 74 et suivantes) | un « concurrent » par événement (`'competitor' as entity_type`, `source_system = 'ms_database'`), `industry_code` repris tel quel : 4 355 « Événementiel », 3 508 « Culture & Patrimoine », 773 « Commerce & Retail »… La branche annuaire (`int_competitor_directory`) porte, elle, des codes |
| 5 | `int_competitor_threat_profile.sql` l. 192 et 195 | `client_industry_code = competitor_industry_code` : un code contre un libellé, jamais égal |
| 6 | Écran | `pulse.astro` l. 4699 et `days.astro` l. 2401 (« Secteur : » + la colonne brute), `prompt.ts` l. 5104 (réponse d'Explorer « secteur : … ») |

Seconde lignée, même maladie : `int_events_daily` → `fct_region_event_calendar_spans.sql` l. 82 →
`vw_insight_eventcalendar_event_lookup.industry_code` (41 311 « Événementiel », 31 797 « Parcs
d'attractions & Loisirs »…), lue par `search-db.ts` et `check-event.ts`.

---

## 2. Ce que ça casse — mesuré

| Endroit | Effet | Mesure (10/09) |
|---|---|---|
| Mart des menaces | le secteur des lieux d'événements est un libellé | 192 202 paires sur 192 658 — exactement la branche `ms_database`. Les 456 paires de l'annuaire portent un code (366) ou rien (90) |
| « Même secteur » | la comparaison échoue | 95 paires reconnues « même secteur » aujourd'hui ; 16 386 le seraient avec un code |
| **Grands événements du calendrier** | **le terme ne s'est jamais appliqué** | `calendar_city_events_2026.csv`, colonne `audience_industry_codes` : des libellés (Tourisme & Loisirs 50, Restauration & Bars 50, Événementiel 48, Hôtellerie & Hébergement 37, Commerce & Retail 25, Culture & Patrimoine 12, Sports & Loisirs actifs 12). `fct_location_impact_daily_calendar` la compare au code du site par `strpos(concat(',', …), concat(',', client_industry_code, ','))` : **0 correspondance sur 1 650 couples événement × site** (50 grands événements × 33 sites actifs) |
| Affichage d'un concurrent de l'annuaire | l'écran montre déjà un code brut | « Secteur : commercial » sur Pulse et Jours — défaut vivant, indépendant du correctif |

---

## 3. Le piège : rétablir le code rouvre les fausses menaces

| | Aujourd'hui | Code rétabli, rien d'autre |
|---|---:|---:|
| Paires « directes » | 30 | jusqu'à **16 258** |
| Menaces « hautes » | 18 | plafond de **7 198** nouvelles, sur 28 sites |

Le plafond compte les paires de même secteur, au public inconnu ou recouvrant à plus de 50 %, dont
le score actuel atteint 0,35 : le pilier secteur y gagnerait au moins 0,25 (pondération 0,25,
redistribuée vers le haut quand le public manque). **C'est l'ordre de grandeur des 7 218 « hautes »
que la porte du 09/09 a retirées** (PR ms_database #131 — le musée d'Orsay en menace forte d'une
épicerie fine à 2,4 km).

La cause est mécanique : 191 660 des 192 202 paires de lieux d'événements ont un public inconnu
(99,7 %), et un public inconnu plus un secteur commun donnent « direct »
(`int_competitor_threat_profile.sql` l. 193).

**Donc le correctif porte sa garde dans le même commit** : un lieu d'événement (`source_system =
'ms_database'`) ne peut pas être un concurrent « direct » — au plus « partiel ». Un événement voisin
se lit déjà par les conflits de date ; il n'est pas un commerce permanent de la même rue.

---

## 4. Les dictionnaires code ↔ libellé : quatre copies, dont une divergente

**Il n'y a pas de version anglaise.** Les codes sont des identifiants (`commercial`, `culture`), les
libellés sont français. La table de correspondance est unique, mais recopiée :

| Copie | Où | Contenu | État |
|---|---|---|---|
| **Seed de normalisation** | `seeds/open_data/geo/event_industry_keywords_normalization.csv` (75 lignes) | trois sources : `profile` (23 lignes, libellé → code), `event` (26, code → code), `client` (26, code → code) | la référence |
| `INDUSTRY_LABEL` | `src/lib/competitive/constants.ts` l. 80 | 23 codes | identique au seed |
| `INDUSTRY_LABELS` | `src/pages/app/insightevent/suivis.astro` l. 57-59 | 23 codes (Œ écrit `\u0152`, règle des scripts inline) | identique au seed |
| **CASE dbt** | `int_client_website_profiles.sql` l. 68-81 | **11 codes seulement**, dont `outdoor_leisure → « Tourisme & Loisirs »` | **divergent et mort** : sa colonne `client_industry_label` n'est lue par aucun modèle ni par l'app |

Deux orphelins :

- **« Tourisme & Loisirs »** — absent du seed de normalisation et d'`INDUSTRY_LABEL` ; présent dans le
  CASE mort et dans 50 lignes du seed calendrier.
- **`outdoor_leisure`** — absent d'`INDUSTRY_LABEL` ; présent dans `competitor_industry_profile_defaults.csv`
  et comme code brut du seed de normalisation (→ `theme_park`).

**Deux seeds portent des libellés dans une colonne de code** : `event_industry_keywords.csv`
(`industry_code`) et `calendar_city_events_2026.csv` (`audience_industry_codes`). Le troisième seed où
figure « Culture & Patrimoine », celui de normalisation, l'y porte légitimement : c'est la
correspondance elle-même.

---

## 5. Ce qui ne fuit pas (vérifié)

- `raw.competitor_directory` : codes ou vide. `raw.competitor_events` : codes ou vide (2 678 vides,
  1 121 `culture`, 543 `wine_tourism`…). Le cron de surveillance lit `raw.competitor_directory`
  (`competitor-surveillance.ts` l. 607), pas le mart : aucun libellé n'est réécrit vers raw.
- `int_competitor_directory` (`where source = 'event'`, code → code) est correct pour des codes — mais
  fragile : un libellé qui atteindrait un jour raw y passerait tel quel.
- `map.ts` l. 134 re-mappe déjà via le seed (`source = 'event'`) : prêt pour des codes.
- `suivis.astro` passe par `INDUSTRY_LABELS` : prêt.
- `search-db.ts`, branche annuaire, exclut `ms_database` : non concernée.

---

## 6. Aucun test ne pouvait l'attraper

- `competitor_industry_code` : `not_null` en `warn` seulement (`intermediate/schema.yml` l. 379).
- Contrats semantic : `data_type: STRING` seulement.
- **Aucun `accepted_values` sur une colonne secteur, nulle part.**

---

## 7. Le correctif, en trois lots (ordre du DAG à l'intérieur de chacun)

**Lot 1 — les menaces** (urgent : la garde du 09/09 tient aujourd'hui par accident, grâce au libellé).

1. `int_events_event_daily_enriched.sql` l. 249 : `n.canonical_industry_code` au lieu de
   `n.canonical_label_fr` ; `industry_label_fr` reste, et devient la colonne d'affichage.
2. `fct_competitor_directory` : exposer `industry_label_fr` à côté de `industry_code` pour les deux
   branches (l'annuaire le tire du seed de normalisation, source `client`).
3. `int_competitor_threat_profile` : **la garde** — `direct` exige `source_system != 'ms_database'`.
4. Test `accepted_values` en `error` sur `competitor_industry_code` (les 23 codes + `unknown`).
5. App : Pulse, Jours et Explorer affichent le libellé (`frActivity`, `profileLabels.ts` l. 101), jamais
   la colonne brute.

Vérifications avant de dire fait : les paires « hautes » restent à 18 (ou ne bougent que sur
l'annuaire) ; le mart ne porte plus aucun libellé dans `competitor_industry_code` ; la carte ouverte
sur `f10c3e58` affiche « Commerce & Retail » et non « commercial ».

**Lot 2 — le calendrier.** `calendar_city_events_2026.csv` : `audience_industry_codes` en codes.
Vérification : le nombre de correspondances événement × site passe de 0 à plus de 0, et chaque
nouveau terme s'explique par un événement nommé.

**Lot 3 — la source.** `event_industry_keywords.csv` : colonne `industry_code` en codes ; les six
branches, `int_events_daily` et la jointure l. 260-262 suivent ; `fct_region_event_calendar_spans` et la
recherche calendrier affichent via le libellé. Lot le plus lourd (plusieurs millions de lignes à
reconstruire) : il ne se lance qu'après les deux premiers.

**Nettoyage.** Supprimer le CASE mort de `int_client_website_profiles.sql` ; trancher `outdoor_leisure`.

Chaque lot se livre en passation dbt selon les six points de CLAUDE.md (fichier nommé, branche de
l'owner, geste rejoué, version de l'outil, un geste, ordre du DAG), SQL compilé en base avant envoi.

---

## 8. Décisions owner

1. **La garde des lieux d'événements — OUI (owner 10/09).** Un lieu d'événement (`source_system =
   'ms_database'`) n'est jamais un concurrent « direct » ; la garde entre au lot 1, dans le même commit
   que le rétablissement du code.
2. **« Tourisme & Loisirs » reçoit un code (owner 10/09).** Dans le seed calendrier, ce libellé marque
   les secteurs qui profitent d'un grand événement — 50 lignes : Jeux Olympiques et Paralympiques 2024,
   Salon de l'Agriculture, Fashion Weeks, marathon et semi-marathon de Paris. Code proposé :
   `tourism_leisure`, regroupement `leisure_activity`. Coût mesuré : **12 fichiers de l'app listent les
   23 codes en dur** (`constants.ts`, `dispositifTypes.ts` et sa garde, `eventTypes.ts`, `profile.astro`,
   `admin.astro`, `suivis.astro`, `prompt.astro`, `search-event.ts`, `search-web.ts`,
   `search-competitor.ts`, `add-competitor.ts`, `cron/competitor-surveillance.ts`) ; côté dbt, trois
   lignes du seed de normalisation (`profile`, `event`, `client`). Le code entre au lot 1, parce que le
   lot 2 en a besoin. `outdoor_leisure` reste rattaché à `theme_park`, comme dans le seed de
   normalisation : c'est le CASE mort qui l'associait à « Tourisme & Loisirs ».
3. **L'ordre des lots** — conseil de l'audit, à valider : lot 0 (affichage, app seule), puis 1, 2, 3.
