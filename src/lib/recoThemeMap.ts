// Canonical theme → action_type vocabulary for server-side recommendation
// filtering. MUST stay in parity with window.RECO_TAXONOMY in
// public/action-cards.js (buckets[].themes[].action_types).
// Client owns labels/buckets/hues for /profile toggle rendering; this module
// owns only the action_type membership used to suppress disabled themes.
//
// PARITY DEBT: the same vocabulary is declared client-side in action-cards.js.
// Keep both in sync until that global script can import this module.
//
// NOTE: action_types `competitor_event_ending` and `review_solicitation` exist
// at runtime but are absent from every theme — ungoverned (always pass) pending
// a decision on where they belong. To govern them, add to BOTH this map and
// the client RECO_TAXONOMY.

export const RECO_THEME_ACTION_TYPES: Record<string, string[]> = {
  meteo: [
    "regime_c_warning", "extended_bad_weather", "weather_hazard_onset",
    "weather_worsened", "saturated_bad_weather", "extended_bad_weather_3d",
    "weather_mobility_double", "ft_peak_bad_weather",
  ],
  mobilite: [
    "mobility_disruption", "mobility_disruption_planned",
    "mobility_disruption_resolved", "tourism_mobility_hit",
    "mobility_comp_squeeze", "ft_peak_mobility",
  ],
  fenetres: [
    "weather_window", "weather_improved", "weather_window_after_bad",
    "low_competition_window", "weekend_opportunity", "perfect_storm",
    "weather_comp_opportunity", "day_opportunity", "best_day_of_week",
    "top_day_approaching", "weekend_vacation_low_comp", "ft_quiet_good_weather",
    "ft_peak_low_comp",
  ],
  calendrier: [
    "audience_shift_opportunity", "calendar_audience_shift",
    "commercial_event_match", "holiday_high_comp", "mega_event_activation",
    "mega_event_end", "institution_campaign_detected", "media_mention_detected",
    "ft_peak_tourism_vacation",
    // 31/07/2026 — MANQUAIT ici alors que le CLIENT le range sous « Calendrier & affluence »
    // (window.RECO_TAXONOMY). Un type absent de cette table « passe toujours » (voir
    // filterDisabledThemes plus bas) : couper le thème dans /profile n'aurait donc PAS fait
    // disparaître la carte, et c'est la PLUS FRÉQUENTE du parc (128 tirs sur 32 lieux, 90 j).
    // Le bouton aurait menti. Entré côté client le 15/06 (096a015), jamais côté serveur —
    // la dérive était rouge dans recoThemeMap.parity.test.ts depuis.
    "foreign_tourism_signal",
  ],
  tourisme: [
    "tourist_high_season", "tourist_surge_vacation", "tourism_peak_window",
    "tourism_weather_vacation", "tourism_comp_squeeze", "low_tourism_local_opp",
  ],
  concurrence: [
    "high_competition_density", "competition_proximity",
    "competition_pressure_spike", "competitor_threat_direct",
    "competitor_event_launch", "competitor_audience_conflict",
    "competitor_hours_change", "competitor_sold_out", "competitor_content_spike",
    "competitor_content_silent", "same_bucket_saturation", "ft_peak_saturated",
  ],
  tarifs: [
    "competitor_new_offering", "competitor_price_increase",
    "competitor_price_drop", "competitor_offering_removed",
    "competitor_repricing_event", "competitor_positioning_brief",
    "competitor_reputation_strength", "competitor_review_surge",
    "competitor_review_drop",
  ],
  ventes: [
    "sales_underperformance", "sales_surge", "sales_missed_opportunity",
    "sales_competition_cannibalization", "sales_traffic_not_converting",
    "sales_discount_no_lift", "sales_revenue_down_wow", "offering_mix_shift",
    // 31/07/2026 — même dérive, côté « Performance ventes » (entré client le 10/06, 832b294).
    // Portée réelle plus faible : monitor.ts l'exclut déjà à la frontière de sa requête
    // (« Retired: redundant with sales_surge »). On l'aligne quand même — un vocabulaire qui
    // ment sur un type ment sur le suivant.
    "footfall_vs_basket_decomposition",
    // 06/08/2026 — chantier C1 (docs/client-patterns-spec.md) : carte au grain CLIENT
    // (client à cadence établie sans commande). Entrée ici LE MÊME JOUR que côté client
    // (action-cards.js taxonomy) — la parité est testée (recoThemeMap.parity.test.ts).
    "client_dormant",
    // 07/08/2026 — chantier C2 (docs/weekly-sales-spec.md) : grain SEMAINE par canal.
    "weekly_sales_hole",
    "weekly_sales_spike",
    // 07/08/2026 — chantier C3 (docs/monthly-sales-spec.md) : grain MOIS par canal.
    "monthly_sales_hole",
    "monthly_sales_spike",
  ],
  apprentissage: [
    "proven_action_replication", "weekly_briefing",
  ],
};

const ACTION_TYPE_TO_THEME: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [themeId, types] of Object.entries(RECO_THEME_ACTION_TYPES))
    for (const at of types) m[at] = themeId;
  return m;
})();

// action_type -> its theme (meteo / mobilite / tourisme / calendrier / concurrence …). The theme is
// Chat décision commits (Day 2, 16/07): each `chat_decision_<family>` origin maps to the closest
// reco THEME so origin_factor lands non-NULL (Engine-1 A↔B bridge). Kept OUT of
// RECO_THEME_ACTION_TYPES on purpose — that map must stay in parity with the client RECO_TAXONOMY
// (profile toggles), and chat commits are not feed candidates to govern.
const CHAT_DECISION_THEME: Record<string, string> = {
  chat_decision_footfall: "fenetres",
  chat_decision_offering: "ventes",
  chat_decision_events: "calendrier",
  chat_decision_competitor: "concurrence",
  chat_decision_tourism: "tourisme",
  chat_decision_weather: "meteo",
  chat_decision_audience: "fenetres",
  chat_decision_salesdiscount: "ventes",
  chat_decision_salesdecomp: "ventes",
  chat_decision_calendar: "calendrier",
};

// Libellés FRANÇAIS des thèmes — COPIES CONFORMES de window.RECO_TAXONOMY (action-cards.js,
// buckets[].themes[].label — ce que les toggles de /profile AFFICHENT). Même dette de parité
// que RECO_THEME_ACTION_TYPES ci-dessus : toute retouche d'un label client se répercute ICI.
// Consommé par buildUserInputFacts (P2, 27/08) : « vous avez écarté N cartes du thème « X » ».
export const RECO_THEME_LABEL_FR: Record<string, string> = {
  gerer: "Gérer la journée",
  meteo: "Météo & alertes",
  mobilite: "Accès & mobilité",
  fenetres: "Occasions favorables",
  calendrier: "Calendrier & affluence",
  tourisme: "Tourisme",
  surveiller: "Surveiller le marché",
  concurrence: "Concurrence",
  tarifs: "Offres, prix & réputation",
  mesurer: "Mesurer",
  ventes: "Performance ventes",
  apprentissage: "Apprentissage",
};

// the granularity a card reliably carries, so it is what a commitment stores as `origin_factor`
// (Engine-1 A↔B bridge). Returns null for uncovered action_types.
export function themeForActionType(actionType: string | null | undefined): string | null {
  if (!actionType) return null;
  return ACTION_TYPE_TO_THEME[actionType] || CHAT_DECISION_THEME[actionType] || null;
}

// DÉMOTIONS (étape 4, décision owner 24/07, docs/kpi-enjeu-mapping.md §I + amendement C2) :
// cartes SANS grandeur mesurable attachée → pas des cartes d'action. Elles quittent « À piloter »
// (candidates) ; leur information reste servie par le Fil d'actualité (change feed) et Consulter.
// AMENDEMENT 28/07 (owner, après l'audit de vérité — docs/audits/card-truth-audit.md) : trois démotions
// de plus, décidées sur la couverture de mesure réellement constatée :
//   - audience_shift_opportunity : tire sur 31 sites TOUS LES JOURS, son libellé n'affirme rien
//     (« certains résidents partent, d'autres restent »), 1 classe calendrier significative sur 8 ;
//   - tourism_peak_window : signal RÉGIONAL, pas local ; tourism_high mesurée sur 2 sites seulement ;
//   - review_solicitation : RENVERSE la décision du 24/07 ci-dessous. Aucune série de la note Google
//     du lieu n'existe (kpiRegistry : mesure NULL) — sa boucle ne peut pas se fermer aujourd'hui ni
//     demain sans connecteur GBP. La garder en Actions du jour, c'est promettre une mesure qui
//     n'existe pas. À re-promouvoir le jour où GBP connect est livré.
// Raison transverse : le patron « on ne sait pas encore — fixez un objectif » ne se duplique pas.
// Il marche pour low_competition_window (fenêtre datée, rare) ; appliqué à 4 cartes tirant chaque
// jour sur 30 sites, il servirait la même injonction 4 fois par jour — un bruit en remplace un autre.
export const DEMOTED_TO_FEED = new Set([
  // démotions du 28/07 (audit de vérité)
  "audience_shift_opportunity",
  "tourism_peak_window",
  "review_solicitation",
  // informationnelles (groupe I)
  "competitor_positioning_brief",
  "competitor_positioning_gap",
  "institution_campaign_detected",
  "media_mention_detected",
  "weekly_briefing",
  // signaux concurrents ponctuels non-réputation (amendement C2) : aucune grandeur de VOTRE
  // activité ne mesure l'issue de « réagir au reprix d'un concurrent » — vigilance, pas action.
  "competitor_price_drop",
  "competitor_price_increase",
  "competitor_repricing_event",
  "competitor_hours_change",
  "competitor_new_offering",
  "competitor_offering_removed",
  "competitor_content_spike",
  "competitor_content_silent",
]);

// Drop candidates whose action_type belongs to a disabled theme, plus the DEMOTED types
// (feed-only). Uncovered action_types (not in any theme) always pass the theme check.
export function filterDisabledThemes<T extends { action_type?: string | null }>(
  candidates: T[],
  disabledThemes: string[] | null | undefined
): T[] {
  const disabled = new Set(disabledThemes || []);
  return candidates.filter((c) => {
    const at = c.action_type;
    if (!at) return true;
    if (DEMOTED_TO_FEED.has(at)) return false;
    const theme = ACTION_TYPE_TO_THEME[at];
    return !(theme && disabled.has(theme));
  });
}