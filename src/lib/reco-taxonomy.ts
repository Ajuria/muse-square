// src/lib/reco-taxonomy.ts
//
// Single source of truth for the Recommandations settings surface.
// Outcome buckets -> themes -> action card types.
//
// Imported by:
//   - the /profile "Recommandations" section (SSR) to render buckets/themes + counts
//   - the card-serving layer to suppress cards whose theme the operator disabled
//
// 73 user-controllable action cards across 9 themes.
// Feed-only subtypes (internal-metric movements) are NOT here: they are governed
// as feed, not recommandations.

export type GateToken =
  | 'pos'
  | 'watched_competitors'
  | 'tourism_source'
  | 'measured_actions'
  | null;

export interface RecoTheme {
  id: string;
  label: string;
  gate: GateToken; // profile/data condition the page resolves; null = always available
  action_types: string[];
}

export interface RecoBucket {
  id: string;
  label: string;
  verb: string;
  hue: string;
  themes: RecoTheme[];
}

// Internal-metric movements. Excluded from recommandations control entirely.
export const FEED_ONLY: readonly string[] = [
  'score_up',
  'score_down',
  'regime_change',
  'medal_change',
  'score_driver_shift',
];

export const RECO_BUCKETS: RecoBucket[] = [
  {
    id: 'gerer',
    label: 'Gérer la journée',
    verb: 'Adapter & temporiser',
    hue: '#B26A2E',
    themes: [
      {
        id: 'meteo',
        label: 'Météo & alertes',
        gate: null,
        action_types: [
          'regime_c_warning',
          'extended_bad_weather',
          'weather_hazard_onset',
          'weather_worsened',
          'saturated_bad_weather',
          'extended_bad_weather_3d',
          'weather_mobility_double',
          'ft_peak_bad_weather',
        ],
      },
      {
        id: 'mobilite',
        label: 'Accès & mobilité',
        gate: null,
        action_types: [
          'mobility_disruption',
          'mobility_disruption_planned',
          'mobility_disruption_resolved',
          'tourism_mobility_hit',
          'mobility_comp_squeeze',
          'ft_peak_mobility',
        ],
      },
    ],
  },
  {
    id: 'faire-venir',
    label: 'Faire venir',
    verb: 'Pousser & capter',
    hue: '#3F7A4E',
    themes: [
      {
        id: 'fenetres',
        label: 'Fenêtres favorables',
        gate: null,
        action_types: [
          'weather_window',
          'weather_improved',
          'weather_window_after_bad',
          'low_competition_window',
          'weekend_opportunity',
          'perfect_storm',
          'weather_comp_opportunity',
          'day_opportunity',
          'best_day_of_week',
          'top_day_approaching',
          'weekend_vacation_low_comp',
          'ft_quiet_good_weather',
          'ft_peak_low_comp',
        ],
      },
      {
        id: 'calendrier',
        label: 'Calendrier & affluence',
        gate: null,
        action_types: [
          'audience_shift_opportunity',
          'calendar_audience_shift',
          'commercial_event_match',
          'holiday_high_comp',
          'mega_event_activation',
          'mega_event_end',
          'institution_campaign_detected',
          'media_mention_detected',
          'ft_peak_tourism_vacation',
        ],
      },
      {
        id: 'tourisme',
        label: 'Tourisme',
        gate: 'tourism_source',
        action_types: [
          'tourist_high_season',
          'tourist_surge_vacation',
          'tourism_peak_window',
          'tourism_weather_vacation',
          'tourism_comp_squeeze',
          'low_tourism_local_opp',
        ],
      },
    ],
  },
  {
    id: 'surveiller',
    label: 'Surveiller le marché',
    verb: 'Défendre & surveiller',
    hue: '#A4442A',
    themes: [
      {
        id: 'concurrence',
        label: 'Concurrence',
        gate: 'watched_competitors',
        action_types: [
          'high_competition_density',
          'competition_proximity',
          'competition_pressure_spike',
          'competitor_threat_direct',
          'competitor_event_launch',
          'competitor_audience_conflict',
          'competitor_hours_change',
          'competitor_sold_out',
          'competitor_content_spike',
          'competitor_content_silent',
          'same_bucket_saturation',
          'ft_peak_saturated',
        ],
      },
      {
        id: 'tarifs',
        label: 'Offres, prix & réputation',
        gate: 'watched_competitors',
        action_types: [
          'competitor_new_offering',
          'competitor_price_increase',
          'competitor_price_drop',
          'competitor_offering_removed',
          'competitor_repricing_event',
          'competitor_positioning_brief',
          'competitor_reputation_strength',
          'competitor_review_surge',
          'competitor_review_drop',
        ],
      },
    ],
  },
  {
    id: 'mesurer',
    label: 'Mesurer',
    verb: 'Attribuer & apprendre',
    hue: '#2F5C8A',
    themes: [
      {
        id: 'ventes',
        label: 'Performance ventes',
        gate: 'pos',
        action_types: [
          'sales_underperformance',
          'sales_surge',
          'sales_missed_opportunity',
          'sales_competition_cannibalization',
          'sales_traffic_not_converting',
          'sales_discount_no_lift',
          'sales_revenue_down_wow',
          'offering_mix_shift',
        ],
      },
      {
        id: 'apprentissage',
        label: 'Apprentissage',
        gate: 'measured_actions',
        action_types: ['proven_action_replication', 'weekly_briefing'],
      },
    ],
  },
];

// action_type -> { bucketId, themeId }. Built once at module load.
export const ACTION_TYPE_THEME: Record<string, { bucketId: string; themeId: string }> =
  (() => {
    const m: Record<string, { bucketId: string; themeId: string }> = {};
    for (const b of RECO_BUCKETS) {
      for (const t of b.themes) {
        for (const at of t.action_types) {
          m[at] = { bucketId: b.id, themeId: t.id };
        }
      }
    }
    return m;
  })();

export function isFeedOnly(action_type: string): boolean {
  return FEED_ONLY.includes(action_type);
}

// Suppress this card? True only when its theme is in the disabled set.
// Unknown/feed-only action types are not theme-governed -> never suppressed here.
export function isThemeDisabled(
  action_type: string,
  disabledThemes: Set<string> | string[],
): boolean {
  const entry = ACTION_TYPE_THEME[action_type];
  if (!entry) return false;
  const set = Array.isArray(disabledThemes) ? new Set(disabledThemes) : disabledThemes;
  return set.has(entry.themeId);
}