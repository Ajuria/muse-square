# Tourisme au grain du site — du signal région-mois au signal jour × site — SPEC DE TRAVAIL

Sert : intent § Le métier (« rapporter [la fréquentation et les ventes] au résultat habituel DU lieu ») et § Le test de valeur (« quelque chose de vrai que l'exploitant ne pouvait pas voir seul »). Constat : [`audits/dbt-audit-2026-09-04.md`](audits/dbt-audit-2026-09-04.md) § 5.3. Arbitrage owner 04/09 : la chaîne tourisme est en construction, son rendu est jugé faible — on la répare si elle est réparable.

---

## 0. Ce que la mesure dit (04/09)

Requête : `fct_client_day_residual` × `fct_location_context_daily` sur `(location_id, date)`, `residual_pct` non nul, 400 derniers jours.

| Site | Jours | Fenêtre | corr(résiduel, `tourism_index_region`) | Résiduel moyen, jours « high » | jours « low » |
|---|---|---|---|---|---|
| Muse Square `f10c3e58…` | 154 | 03/04 → 03/09/2026 | **+0,41** | **+15,9 %** | **−14,6 %** |
| `29383776…` (IdF) | 154 | idem | +0,41 | +18,9 % | −10,0 % |
| `ff2aeb35…` (démo) | 154 | idem | −0,37 | −9,1 % | +12,5 % |

Le résiduel est déjà corrigé du jour de semaine et de la tendance : un écart de 30 points entre jours « high » et « low » est le plus fort facteur externe mesuré dans cet entrepôt. **Mais l'index n'a que 6 valeurs distinctes sur 154 jours** : il est mensuel et régional (occupation hôtelière INSEE), donc identique pour tous les sites d'Île-de-France pendant un mois. Il porte de la saisonnalité mensuelle sans pouvoir la séparer du tourisme, et il ne dit rien à un Parisien qu'il ne sache déjà. C'est ça, le « faible impact » : pas le signal, son grain.

La chaîne est donc **réparable**, et la réparation consiste à descendre au jour et au site.

---

## 1. Ce qui est

| Chaîne | Grain | Ce qui atteint le site | Défaut |
|---|---|---|---|
| `stg_insee_tourisme_frequentation` + seed `region_hotel_occupancy_rate` → `int_tourism_region_monthly` → `int_tourism_region_daily` → `fct_region_context_daily` → `fct_location_context_daily` → `vw_insight_event_location_context` | mois × région, projeté au jour | `tourism_index_region`, `tourism_peak_flag_region`, `tourism_status_region`, `has_tourism_signal_region` | le seed est statique ; 6 valeurs par semestre |
| OpenHolidays → `int_openholidays_public_holidays_country_daily`, `int_openholidays_school_coverage_country_daily` → `fct_foreign_tourism_context_daily` | **date seule** (470 lignes, 14/05/2026 → 12/09/2027) | lu par date par `dayContext.ts`, `tourism.ts`, et le bloc `foreign_tourism_signal` des candidates | aucune pondération par la région du site |
| Flash INSEE → `stg_insee_flash_country_mix` → `int_region_foreign_tourism_mix` → `fct_region_foreign_country_profile` | date × région NUTS2 × pays (14 640 lignes) | lu par `dayContext.ts` et `tourism.ts` | **couvre 01/04/2025 → 30/09/2025 seulement** : `covered_years` joint `dim_calendar` sur les années ingérées ; l'app remonte à 2025 par `QUALIFY … ORDER BY date DESC` |
| Annuel national, sites, musées, capacité, BdF (`stg_tourism_annual_*`, `stg_museum_visits_master`, `int_museum_visits_*`, `int_insee_tourisme_*`, `int_bdf_bpm6_*`, `fct_tourism_macro_*`, `vw_insight_national_tourism_macro_context`) | année × pays / site | rien | aucun consommateur ; `vw_insight_national_tourism_macro_context` jamais construit |

`dim_client_location` porte `region_code_insee` et `region_code_nuts2` : la clé pour descendre au site existe.

---

## 2. À faire, dans l'ordre

### 2.1 Projeter le profil pays sur le calendrier courant — PR ms_database #100 ouverte (04/09, validée en scratch : 32 160 lignes uniques, 31/07/2025 → 04/09/2027, 80 lignes aujourd'hui, 0 différence sur 2025)

`fct_region_foreign_country_profile` : remplacer la spine `covered_years` (années ingérées) par `dim_calendar` sur `[CURRENT_DATE() − 400, CURRENT_DATE() + 365]`, joint sur `season(date)` × `region_code` au **dernier `reference_year` disponible** pour cette saison × région. `reference_year` reste en colonne, en attribut : le lecteur sait que la part est celle de l'été 2025 appliquée à l'été 2026. Grain inchangé (`date × region_code × country_name_fr`), test `unique_combination_of_columns` ajouté. L'app cesse de remonter à 2025 par `QUALIFY` : `dayContext.ts` et `tourism.ts` lisent `p.date = @d`.

Preuve : `SELECT MIN(date), MAX(date) FROM mart.fct_region_foreign_country_profile` couvre aujourd'hui ; la lecture Muse Square pour la date du jour rend des lignes `reference_year = 2025`.

### 2.2 Le mart qui manque : `fct_location_foreign_tourism_daily`

Grain **`date × location_id`**, une ligne par jour et par site actif, fenêtre `[−400 j, +365 j]`, table partitionnée `date`, cluster `location_id`, `tag:mart_dependent`.

Sources : `fct_foreign_tourism_context_daily` (pays en congé ce jour : `countries_on_public_holiday`, `countries_on_school_holiday` avec taux de couverture), `fct_region_foreign_country_profile` (part de chaque pays dans les nuitées non résidentes de la région du site, § 2.1), `dim_client_location` (`region_code_nuts2`, `active_flag`).

Colonnes :

| Colonne | Définition |
|---|---|
| `foreign_pressure_index` | Σ sur les pays en congé ce jour de `country_share_of_nonresident × coverage` (coverage = 1 pour un férié national, le taux de couverture pour des vacances scolaires) — un ratio 0–1 : la part des touristes étrangers de la région dont le pays est en congé ce jour |
| `foreign_pressure_pct_of_max` | l'index rapporté à son maximum annuel pour la région — lisible (« 62 % du pic ») |
| `top_countries_on_holiday` | ARRAY<STRUCT<country_name_fr, share, holiday_kind>> trié par part, les 5 premiers |
| `n_countries_on_holiday` | nombre de pays du profil en congé |
| `reference_year` | millésime du profil appliqué |

Le bloc `foreign_tourism_signal` de `fct_location_daily_action_candidates` lit ce mart au lieu de recombiner les deux marts ; `dayContext.ts` et `tourism.ts` aussi (une lecture au lieu de deux). Vue semantic `vw_insight_event_foreign_tourism_daily`, projection à contrat.

### 2.3 Le signal entre dans le contexte site

`fct_location_context_daily` reçoit `foreign_pressure_index` à côté des 4 colonnes région ; `vw_insight_event_location_context` le projette. Alors `fct_client_day_residual` peut en faire un facteur au même titre que la météo (moteur Type B, mémoire `type-b-sensitivity-engine`).

### 2.4 Rafraîchir l'index régional

`int_tourism_region_monthly` lit `stg_insee_tourisme_frequentation` (série DS_TOUR_FREQ ingérée par Airbyte, `ds_tour_freq`) **seule** ; le seed `region_hotel_occupancy_rate` sort du modèle (le fichier reste dans `data/ref/`, jamais supprimé). Fraîcheur déclarée sur la source pour que `fresher+` le reconstruise chaque mois.

### 2.5 L'annuel attend un consommateur

`stg_museum_visits_master` / `int_museum_visits_museum_annual` ne servent que si `fct_competitor_directory` porte `annual_attendance` et `attendance_year` pour les lieux qu'il liste (`entity_kind = venue`, audit § 5.2). Tant que ce n'est pas décidé : `tags: ['exploration']`, date 04/09. Le macro national et la BdF : supprimer (geste 4 de `dbt-nettoyage-spec.md`).

### 2.6 Un attribut légal au site

`dim_client_location.is_zone_touristique_internationale` (BOOL) depuis la liste des arrêtés ZTI (open data, seed `zones_touristiques_internationales.csv` : commune, périmètre, arrêté). C'est ce qui décide le travail du dimanche (règle CLAUDE.md § Localisation, cas du 01/08). Aucun texte de carte ne suppose plus un dimanche ouvert sans lire cette colonne.

---

## 3. La preuve que ça valait le coup

Rejouer la requête du § 0 avec `foreign_pressure_index` à la place de `tourism_index_region`, sur les mêmes 154 jours de Muse Square. Le mart a gagné sa place si la corrélation dépasse **0,41** ou si, à corrélation égale, le signal a plus de 30 valeurs distinctes sur la fenêtre (c'est-à-dire : il varie d'un jour à l'autre). Sinon, § 2.2 et § 2.3 se retirent et seule la réparation § 2.1 reste.

Le chiffre livré porte sa requête et sa fenêtre.

---

## 4. Mots (lexique)

Aucun mot du lexique ne nomme « la part des touristes étrangers en congé aujourd'hui ». Concept sans mot ⇒ **mot à demander à l'owner** avant tout libellé de carte ou de colonne visible. Proposition soumise, non actée : « touristes étrangers en congé ». Les colonnes dbt ci-dessus sont des noms techniques, jamais affichés.

— SPEC DE TRAVAIL
