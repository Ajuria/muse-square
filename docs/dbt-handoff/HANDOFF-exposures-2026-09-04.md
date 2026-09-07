# FICHIER À CRÉER : `ms_dbt/models/exposures.yml` — SPEC DE TRAVAIL

**Pourquoi.** Le périmètre « ce que l'app lit dans BigQuery » vit dans le code de l'app, pas dans dbt. Ce fichier le déclare : six `exposures`, une par surface, générées le 04/09 depuis les lectures réelles de `src/` et `public/` (89 fichiers, 76 modèles dbt distincts). Spec : `docs/dbt-nettoyage-spec.md` § 2.

**Base vérifiée.** `origin/main` = `origin/Ajuria-branch` (`3ccd79f`). Le fichier parse ; chaque `ref()` désigne un modèle existant du projet (contrôlé par programme contre la liste des 334 modèles). Deux objets lus par l'app ne sont PAS des modèles dbt et n'y figurent pas : `dims.dim_event_enrichment` (déjà `source('dims', …)`) et `mart.fct_location_sensitivity` (référencée par l'app, **absente de BigQuery le 04/09** — store du moteur Type B, mémoire `type-b-sensitivity-engine`) — déclarer la première en `source()` et vérifier la seconde sont des gestes séparés.

## Le geste (un seul)

Dans dbt Cloud IDE, créer le fichier `ms_dbt/models/exposures.yml` avec le contenu ci-dessous, tel quel.

```yaml
version: 2

exposures:
  - name: app_pulse_agir
    label: "Pulse · Agir · Days (fil des cartes, dispositions, jours sélectionnés)"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/insight/days.ts, api/insight/monitor.ts, api/insight/reactions-today.ts, api/legacy/legacy_days_compared_dates.ts, api/saved-items/alerts.ts, api/saved-items/snapshot.ts, app/insightevent/insight.astro, app/insightevent/pulse.astro, public/action-cards.js, public/reco-library.js"
    depends_on:
      - ref('dim_client_location')
      - ref('fct_client_sales_signals_daily')
      - ref('fct_location_commitment_learning')
      - ref('fct_location_context_daily')
      - ref('fct_location_events_topn_daily')
      - ref('vw_insight_event_action_candidates')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_card_dispositions')
      - ref('vw_insight_event_change_feed')
      - ref('vw_insight_event_competitor_alerts')
      - ref('vw_insight_event_day_surface')
      - ref('vw_insight_event_selected_days_surface')
      - ref('vw_insight_event_user_active_goal')
      - ref('vw_insight_event_user_activity')

  - name: app_piloter
    label: "Piloter (tableau de bord, dispositifs, engagements, évolution)"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/analytics/admin-dashboard.ts, api/analytics/party-role.ts, api/analytics/signal-accuracy.ts, api/commitments/evolution.ts, api/commitments/index.ts, api/dispositifs/photos.ts, api/insight/analogs.ts, api/insight/dashboard.ts, profile.astro"
    depends_on:
      - ref('dim_client_location')
      - ref('fct_admin_dashboard')
      - ref('fct_client_commitment_outcomes')
      - ref('fct_client_daily_performance')
      - ref('fct_client_day_analogs')
      - ref('fct_client_offering_daily')
      - ref('fct_client_sales_signals_daily')
      - ref('fct_competitor_events_conflicts')
      - ref('fct_competitor_offering_changes')
      - ref('fct_competitor_threat_profile')
      - ref('fct_location_action_learning')
      - ref('fct_location_action_moves')
      - ref('fct_location_client_patterns')
      - ref('fct_location_competitors_followed')
      - ref('fct_location_context_features_daily')
      - ref('fct_location_daily_action_candidates')
      - ref('int_consulter_corrections_current')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_commitment_memory')
      - ref('vw_insight_event_day_residual')
      - ref('vw_insight_event_day_surface')
      - ref('vw_insight_event_signal_accuracy')

  - name: app_explorer
    label: "Explorer (Consulter, rapport, fenêtre météo, best-in-class)"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/insight/best-in-class.ts, api/insight/evenement.ts, api/insight/prompt.ts, api/insight/sales-report.ts, api/insight/weather-window.ts, public/dossier-proto-data.js (supprimé le 05/09/2026 — surface livrée, historique git)"
    depends_on:
      - ref('dim_client_location')
      - ref('fct_client_daily_performance')
      - ref('fct_client_day_residual')
      - ref('fct_client_offering_daily')
      - ref('fct_client_sales_signals_daily')
      - ref('fct_location_daily_action_candidates')
      - ref('fct_location_events_radius_daily')
      - ref('fct_location_weather_forecast_daily_detail')
      - ref('vw_insight_event_30d_day_surface')
      - ref('vw_insight_event_30d_window_surface')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_client_performance')
      - ref('vw_insight_event_competitor_signals')
      - ref('vw_insight_event_day_residual')
      - ref('vw_insight_event_day_surface')
      - ref('vw_insight_event_location_context')
      - ref('vw_insight_event_mobility_disruptions')
      - ref('vw_insight_event_selected_days_surface')
      - ref('vw_insight_event_user_events')
      - ref('vw_insight_eventcalendar_event_lookup')
      - ref('vw_ms_insight_ai_decision_policy_rules')

  - name: app_competitive
    label: "Veille concurrentielle (suivis, fiches, carte, recherche)"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/competitive/check-competitor.ts, api/competitive/check-event.ts, api/competitive/competitor-profile.ts, api/competitive/competitor-signals.ts, api/competitive/discover-competitors.ts, api/competitive/search-db.ts, api/competitive/search-web.ts, api/competitive/suivis.ts, api/insight/enrich-event.ts, api/insight/map.ts"
    depends_on:
      - ref('dim_client_location')
      - ref('fct_competitor_directory')
      - ref('fct_competitor_threat_profile')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_competitor_alerts')
      - ref('vw_insight_event_competitor_lookup')
      - ref('vw_insight_event_competitor_signals')
      - ref('vw_insight_event_competitors_followed')
      - ref('vw_insight_event_map_signals')
      - ref('vw_insight_eventcalendar_event_lookup')

  - name: app_crons
    label: "Crons (briefing, digest, alertes, snapshots, BestTime, classes de jours)"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/cron/alerts.ts, api/cron/competitor-alerts.ts, api/cron/crawl-best-in-class.ts, api/cron/daily-briefing.ts, api/cron/daily-dispatch.ts, api/cron/day-class-impacts.ts, api/cron/digest.ts, api/cron/event-occurrences.ts, api/cron/internal-alert-sweep.ts, api/cron/snapshot-competitors.ts, api/cron/sync-besttime.ts, api/cron/underperf-watch.ts"
    depends_on:
      - ref('dim_ai_context_location')
      - ref('dim_client_location')
      - ref('fct_client_daily_performance')
      - ref('fct_competitor_directory')
      - ref('fct_competitor_events_conflicts')
      - ref('fct_location_context_features_daily')
      - ref('fct_location_daily_action_candidates')
      - ref('fct_location_weather_alerts_daily')
      - ref('fct_region_day_annotations_daily')
      - ref('int_events_event_daily_enriched')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_change_feed')
      - ref('vw_insight_event_competitor_alerts')
      - ref('vw_insight_event_day_residual')
      - ref('vw_insight_event_day_surface')

  - name: app_compte
    label: "Compte, import, profil, admin"
    type: application
    maturity: high
    url: https://app.musesquare.com
    owner:
      name: Julen de Ajuriaguerra
      email: julen.deajuriaguerra@gmail.com
    description: "Surfaces app lisant BigQuery en direct — fichiers : api/admin/invite.ts, api/import/locations.ts, api/metro/search.ts, api/profile/save.ts, api/profile/set-catchment.ts, src/lib/ai/facts/buildDayPerformanceFacts.ts, src/lib/ai/facts/buildIdentityFacts.ts, src/lib/ai/facts/buildPracticeFacts.ts, src/lib/ai/facts/buildUserInputFacts.ts, src/lib/ai/find_dates/find-dates.ts, src/lib/bestPractices.ts, src/lib/commitmentContext.ts, src/lib/commitmentResolve.ts, src/lib/commitmentShape.ts, src/lib/contextCopy.ts, src/lib/dayClassRegistry.ts, src/lib/dayContext.ts, src/lib/dispositifFamille.ts, src/lib/dispositifPhotos.ts, src/lib/entityReading.ts, src/lib/eventLifecycleCards.ts, src/lib/insightFamilies/audience.ts, src/lib/insightFamilies/calendar.ts, src/lib/insightFamilies/channels.ts, src/lib/insightFamilies/competitor.ts, src/lib/insightFamilies/dispositif.ts, src/lib/insightFamilies/engagements.ts, src/lib/insightFamilies/evenement.ts, src/lib/insightFamilies/events.ts, src/lib/insightFamilies/footfall.ts, src/lib/insightFamilies/offering.ts, src/lib/insightFamilies/sales.ts, src/lib/insightFamilies/salesDecomp.ts, src/lib/insightFamilies/salesDiscount.ts, src/lib/insightFamilies/tourism.ts, src/lib/insightFamilies/weather.ts, src/lib/journalPlan.ts, src/lib/kpiRegistry.ts, src/lib/poleReading.ts, src/lib/proposedFollows.ts, src/lib/sensitivityStore.ts, src/lib/trackRecordCore.ts"
    depends_on:
      - ref('dim_client_location')
      - ref('dim_idf_stops_lines')
      - ref('fct_client_commitment_outcomes')
      - ref('fct_client_daily_performance')
      - ref('fct_client_day_analogs')
      - ref('fct_client_hourly_sales')
      - ref('fct_client_hourly_signals_daily')
      - ref('fct_client_item_signals_daily')
      - ref('fct_client_offering_daily')
      - ref('fct_client_offering_signals_daily')
      - ref('fct_client_sales_signals_daily')
      - ref('fct_competitor_directory')
      - ref('fct_competitor_events_conflicts')
      - ref('fct_competitor_threat_profile')
      - ref('fct_foreign_tourism_context_daily')
      - ref('fct_location_channel_monthly')
      - ref('fct_location_channel_weekly')
      - ref('fct_location_client_patterns')
      - ref('fct_location_commitment_learning')
      - ref('fct_location_context_features_daily')
      - ref('fct_location_daily_action_candidates')
      - ref('fct_location_events_radius_daily')
      - ref('fct_location_events_topn_daily')
      - ref('fct_location_foot_traffic_daily')
      - ref('fct_location_impact_daily_mobility')
      - ref('fct_location_mobility_disruption_changes')
      - ref('fct_location_weather_alerts_daily')
      - ref('fct_location_weather_forecast_daily_detail')
      - ref('fct_region_day_annotations_daily')
      - ref('fct_region_foreign_country_profile')
      - ref('int_competitor_offering_changes')
      - ref('int_competitor_snapshot_deltas')
      - ref('int_events_event_daily_enriched')
      - ref('stg_client_transactions')
      - ref('vw_insight_event_action_candidates')
      - ref('vw_insight_event_ai_location_context')
      - ref('vw_insight_event_automation_rules')
      - ref('vw_insight_event_card_dispositions')
      - ref('vw_insight_event_change_feed')
      - ref('vw_insight_event_client_hourly_profile')
      - ref('vw_insight_event_client_item_signals')
      - ref('vw_insight_event_client_offering')
      - ref('vw_insight_event_client_performance')
      - ref('vw_insight_event_competitor_offering_changes')
      - ref('vw_insight_event_competitor_signals')
      - ref('vw_insight_event_day_residual')
      - ref('vw_insight_event_day_surface')
      - ref('vw_insight_event_dispositif_components')
      - ref('vw_insight_event_dispositif_photos')
      - ref('vw_insight_event_dispositifs')
      - ref('vw_insight_event_location_context')
      - ref('vw_insight_event_mobility_disruptions')
      - ref('vw_insight_event_user_event_bilans')
      - ref('vw_insight_event_user_events')
```

## Vérification dans l'IDE

```
dbt parse
dbt ls --select +exposure:*
```

La seconde commande liste le périmètre à garder (attendu : ≈ 230 nœuds, modèles + seeds). Un modèle absent de cette liste et d'aucune sélection de job est hors périmètre (triage `docs/dbt-nettoyage-spec.md` § 4).

## Message de commit

```
feat(exposures): déclare les six surfaces app comme exposures — le périmètre « lu par l'app » vit dans dbt
```

— SPEC DE TRAVAIL
