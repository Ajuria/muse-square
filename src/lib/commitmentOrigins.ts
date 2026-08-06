// Single source of truth for which action-card types may SEED a commitment.
//
// DELIBERATELY NOT V1_ALERT_ACTION_TYPES (the internal-alert rail's 5 cards).
// A commitment can be seeded from any real action card (design constraint §4:
// v1 origin = action cards, broadly). This set must be the action-card SPECS
// universe, not the alert subset.
//
// AUTHORITATIVE LIST = the SPECS/ACTION_CARDS keys in public/action-cards.js.
// Complete this set from those keys before the endpoint accepts non-sales cards.
// Seeded below ONLY with action_types verified present in the repo; the
// opportunity / threat / weather / tourism / footfall families still need adding
// (copy the exact strings from the SPECS registry — never hand-type from memory).
export const COMMITMENT_ORIGIN_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  // Sales / performance — verified in src/lib/internalAlertCards.ts
  "sales_surge",
  "sales_revenue_down_wow",
  "sales_traffic_not_converting",
  "sales_discount_no_lift",
  "footfall_vs_basket_decomposition",

  // Weather — verified present in public/action-cards.js SPECS (the four types that route to
  // the weather deep page / drill-down in insight.astro `_isWeather`).
  "weather_hazard_onset",
  "weather_worsened",
  "weather_improved",
  "extended_bad_weather",          // → renderWeatherWindow (the extended-window deep page)
  "extended_bad_weather_3d",       // legacy/phantom key kept for back-compat; the real SPECS type is above

  // Events / calendar — verified present in public/action-cards.js SPECS (the types that route to
  // the events deep page / "Paysage événementiel" in insight.astro `_isEvent`).
  "commercial_event_match",
  "mega_event_activation",
  "mega_event_end",

  // Competitor / tarifs — verified present in public/action-cards.js SPECS (types that route to the
  // competitor deep page / "Concurrence" in insight.astro `_isCompetitor`).
  "competition_proximity",
  "high_competition_density",
  "competitor_threat_direct",
  "competition_pressure_spike",
  "same_bucket_saturation",
  "competitor_price_drop",
  "competitor_price_increase",
  "competitor_new_offering",
  "competitor_offering_removed",

  // Tourism — verified present in public/action-cards.js SPECS (types routing to "Tourisme" in `_isTourism`).
  "tourist_high_season",
  "tourist_surge_vacation",
  "tourism_peak_window",
  "tourism_weather_vacation",
  "tourism_comp_squeeze",
  "low_tourism_local_opp",
  "foreign_tourism_signal",

  // footfall family (→ renderFootfall, the venue's own hourly/weekly CA clock).
  // footfall_vs_basket_decomposition is a PERFORMANCE/sales card (→ renderSalesDecomp, its own deep page).
  "best_day_of_week",
  "ft_peak_bad_weather",
  "ft_quiet_good_weather",
  "ft_peak_saturated",
  "ft_peak_low_comp",
  "ft_peak_tourism_vacation",
  "ft_peak_mobility",

  // TODO(complete from public/action-cards.js SPECS keys): opportunity/threat families
  // (verify each string against the registry).

  // Chat décision commits (Day 2, 16/07) — a « Prochaines étapes » line inside an inline FAMILY CARD
  // answer (Consulter) committed via the shared MSCommitForm. Question-scoped: there is NO fired card
  // behind it, so each family gets its own origin type (never borrow a real card's action_type — the
  // learning chain would attribute the outcome to a card that never fired). Themes are mapped in
  // recoThemeMap.CHAT_DECISION_THEME so origin_factor still lands non-NULL.
  "chat_decision_footfall",
  "chat_decision_offering",
  "chat_decision_events",
  "chat_decision_competitor",
  "chat_decision_tourism",
  "chat_decision_weather",
  "chat_decision_audience",
  "chat_decision_salesdiscount",
  "chat_decision_salesdecomp",
  "chat_decision_calendar",

  // Complétion 26/07 (menu Agir universel — décision owner : TOUTE carte « Actions du
  // jour » porte M'engager, y compris les specs card_type 'notification') : la totalité
  // restante du registre SPECS de public/action-cards.js, extraite mécaniquement du
  // fichier (regex sur les appels reg()), jamais recopiée à la main.
  "weather_window",
  "top_day_approaching",
  "audience_shift_opportunity",
  "regime_c_warning",
  "low_competition_window",
  "score_driver_shift",
  "weekend_opportunity",
  "calendar_audience_shift",
  "mobility_disruption",
  "mobility_disruption_planned",
  "mobility_disruption_resolved",
  "score_up",
  "score_down",
  "regime_change",
  "medal_change",
  "competitor_event_launch",
  "competitor_audience_conflict",
  "competitor_review_surge",
  "competitor_review_drop",
  "competitor_hours_change",
  "competitor_sold_out",
  "competitor_content_spike",
  "competitor_content_silent",
  "institution_campaign_detected",
  "media_mention_detected",
  "competitor_positioning_brief",
  "competitor_reputation_strength",
  "review_solicitation",
  "competitor_repricing_event",
  "competitor_event_ending",
  "competitor_positioning_gap",
  "perfect_storm",
  "weather_comp_opportunity",
  "saturated_bad_weather",
  "holiday_high_comp",
  "day_opportunity",
  "weekend_vacation_low_comp",
  "weather_window_after_bad",
  "tourism_mobility_hit",
  "weather_mobility_double",
  "mobility_comp_squeeze",
  "weekly_briefing",
  "sales_missed_opportunity",
  "sales_underperformance",
  "sales_competition_cannibalization",
  "proven_action_replication",
  "offering_mix_shift",

  // Onboarding P2 (05/08) : le PREMIER test mesuré d'un compte neuf — geste du tableau
  // « Engagez votre premier test mesuré » (MSCommitForm, fenêtre à venir, verdict auto).
  "onboarding_first_test",
]);

export function isCommitmentOrigin(actionType: unknown): boolean {
  const t = String(actionType ?? "").trim();
  // Chantiers structurels (26/07) : une carte structurelle seede un engagement avec
  // origin_action_type = `structural_<class_key>` (classes de lib/dayClassRegistry — grain
  // location × motif, sans date). Préfixe plutôt que liste : le registre des classes est
  // LA source de vérité, on ne la duplique pas ici.
  if (t.startsWith("structural_")) return true;
  // Événements utilisateur (03/08, spec docs/evenement-dossier-spec.md § 1.3) : un événement
  // crée son engagement de mesure avec origin_action_type = `event_<event_type>` (types de
  // lib/eventTypes — même logique de préfixe : le registre des types est LA source de vérité).
  if (t.startsWith("event_")) return true;
  return COMMITMENT_ORIGIN_ACTION_TYPES.has(t);
}
