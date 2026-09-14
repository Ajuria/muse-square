# Handoff dbt — contours des pôles sur le plan (13/09/2026) : PR ms_database#151 — EN BASE — DÉFINITIF

> **13/09, 07 h 52 — EN BASE.** PR fusionnée (`acefef0`) ; le `dbt build` lancé par l'owner n'a laissé aucune trace dans
> dbt Cloud ni dans le projet (aucun run après la fusion, aucune vue) ; run ciblé `70471897291773` (job `refresh_industry`,
> `dbt build --select stg_space_zones+`, 4 étapes vertes, 35 s, sha `acefef0`). Vérifié en base : `semantic.vw_insight_event_space_zones`
> rend 2 sites × 11 zones × 7 pôles × 308,77 m² ; catalogue rafraîchi (593 tables). L'agent lit la vue
> (`listSpaceZonesEnVigueur`) ; le producteur garde sa lecture pour le one-off.

Sert : `docs/explorer-outil-spec.md` § 9 incrément 8 (le plan coloré) et § 10 décision 2 (le stockage des contours :
grain site × pôle × polygone, points du plan en JSON, aire en m² — la forme que la spec prévoyait, appliquée le 13/09,
à confirmer par l'owner).

**Fichiers, dans l'ordre du DAG** :
1. `ms_dbt/models/ms_open_data/staging/sources.yml` — source `analytics.space_zones` (app-write, append-only).
2. `ms_dbt/models/ms_open_data/staging/stg_space_zones.sql` + son entrée dans `staging/schema.yml` (zone_id not_null/unique, source ∈ {plan}).
3. `ms_dbt/models/ms_open_data/semantic/insight_event/vw_insight_event_space_zones.sql` + son entrée dans
   `semantic/insight_event/schema_app_surfaces.yml` (contrat enforced, 14 colonnes) — la règle « en vigueur » (dernier
   `measured_at` puis `created_at` par pôle) vit ici, une seule fois.

**Base vérifiée** : `origin/main` à `08d26e0`. LF ; les trois yml parsent ; dbt 1.10.11 (`config:` sous le modèle, jamais `access` au niveau du modèle).

**Déjà en base côté app (13/09)** : `analytics.space_zones` (14 colonnes), née par `tools/oneoff/2026-09-13-epices-et-tout-zones-poles.mts`
depuis `zones_poles_epices_et_tout_2026-09-12.json` — 11 polygones pour 7 pôles, 308,77 m² (le plan dit 308,71 : les
aires de polygones sont arrondies au cm²), sur Épices et Tout (`a3b442c2-…`) et sur le compte de test owner (`f10c3e58-…`).

**Preuve BigQuery (13/09)** : la vue compilée à la main (source et ref substitués) rend 2 sites × 11 zones × 7 pôles × 308,77 m².

**Fait après fusion (13/09)** : run ciblé du job `refresh_industry` (70471823595526), `dbt build --select stg_space_zones+`,
puis la vue vérifiée en base et `npm run catalog:refresh`.
