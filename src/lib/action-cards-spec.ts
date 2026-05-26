/**
 * ACTION CARDS SPEC — Muse Square Insight
 * 
 * 36 action types: static branding + personalized sowhat + draft seeds
 * 
 * Architecture:
 *   Layer 1 — BRANDING (static, same for all users)
 *   Layer 2 — SOWHAT (personalized at render via day_surface + location_context)
 *   Layer 3 — COMMUNIQUER (draft seed per channel, personalized at draft time)
 *   Layer 4 — CONSULTER TARGET (where the "Consulter" action points)
 * 
 * Universal Agir dropdown on every action card:
 *   - Communiquer → opens Agir workspace with pre-injected draft
 *   - Consulter → opens cta_target view
 *   - Sauvegarder → bookmark / export
 *   - Signaler → flag incorrect / irrelevant
 * 
 * Function signatures match existing BRIEF_TEMPLATES:
 *   sowhat: (a: FeedItem, prof: LocationContext, currentDay: DaySurface, mode: string) => string
 *   draft_seeds[channel]: (a: FeedItem, prof: LocationContext, currentDay: DaySurface) => string
 * 
 * Field sources:
 *   day_surface = vw_insight_event_day_surface
 *   prof = vw_insight_event_ai_location_context
 *   a = change_feed item or compound signal item
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Category = 'URGENT' | 'CONCURRENCE' | 'MÉTÉO' | 'OPPORTUNITÉ' | 'INTELLIGENCE' | 'PLANIFICATION';
type CardType = 'action' | 'notification';
type Channel = 'instagram' | 'facebook' | 'website' | 'email' | 'slack' | 'whatsapp' | 'sms' | 'gbp' | 'note_interne' | 'operations' | 'signaletique' | 'offre';

interface ActionCardSpec {
  // Layer 1 — Static branding
  action_type: string;
  brand_label_fr: string;
  category_label_fr: Category;
  icon: string;
  color: string;
  card_type: CardType;

  // Layer 2 — Sowhat (personalized)
  sowhat: (a: any, prof: any, currentDay: any, mode: string) => string;

  // Layer 3 — Communiquer config
  consulter_target: string;
  draft_seeds: Partial<Record<Channel, (a: any, prof: any, currentDay: any) => string>>;

  // Metadata
  existing_template_key?: string; // maps to existing BRIEF_TEMPLATES key if any
  missing_fields?: string[];      // fields not yet in schema
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pct(v: any): string { return v != null ? Math.round(Number(v)) + '%' : '—'; }
function num(v: any): string { return v != null ? String(Math.round(Number(v))) : '—'; }
function temp(v: any): string { return v != null ? Math.round(Number(v)) + '°C' : '—'; }
function ratio(v: any): string { return v != null ? '×' + Number(v).toFixed(1) : '—'; }
function hasChannel(prof: any, ch: string): boolean {
  if (ch === 'instagram') return !!prof.instagram_url;
  if (ch === 'facebook') return !!prof.facebook_url;
  if (ch === 'website') return !!prof.website_url;
  return true;
}
function siteName(prof: any): string { return prof.site_name || prof.location_label || 'votre site'; }
function isOutdoor(prof: any): boolean { return ['outdoor', 'mixed'].includes(String(prof.location_type || prof.cl_location_type || '').toLowerCase()); }
function weatherSensitive(prof: any): boolean { return Number(prof.weather_sensitivity || 0) >= 3; }
function hazardLabel(day: any): string {
  if (Number(day.lvl_snow || 0) >= 2) return 'neige';
  if (Number(day.lvl_rain || 0) >= 2) return 'fortes pluies';
  if (Number(day.lvl_wind || 0) >= 2) return 'vent fort';
  if (Number(day.lvl_heat || 0) >= 2) return 'canicule';
  if (Number(day.lvl_cold || 0) >= 2) return 'grand froid';
  if (Number(day.lvl_rain || 0) >= 1) return 'pluie';
  if (Number(day.lvl_wind || 0) >= 1) return 'vent';
  return 'alerte météo';
}
function topCompetitor(day: any): any { return day.top_competitors?.[0]?.e || {}; }
function changeFeedEntry(day: any, subtype: string): any {
  return (day.change_feed || []).find((c: any) => c.change_type === subtype || c.change_subtype === subtype) || {};
}


// ─── SPEC ────────────────────────────────────────────────────────────────────

export const ACTION_CARD_SPECS: ActionCardSpec[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE-BASED (1–11)
  // ═══════════════════════════════════════════════════════════════════════════

  // #1 — high_competition_density
  {
    action_type: 'high_competition_density',
    brand_label_fr: 'Forte pression',
    category_label_fr: 'CONCURRENCE',
    icon: '⚔️',
    color: '#D32F2F',
    card_type: 'action',
    existing_template_key: '_same_bucket_saturation', // partial overlap
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const n = num(day.events_within_5km_count);
      const same = num(day.events_within_5km_same_bucket_count);
      const pr = ratio(day.competition_pressure_ratio);
      return `${n} événements à 5 km dont ${same} dans votre secteur — pression ${pr} vs normale.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. ${num(day.events_within_5km_count)} événements concurrents aujourd'hui à 5 km. Mettre en avant ce qui différencie ${siteName(prof)} : ${prof.business_short_description || 'votre offre unique'}. Ton direct, local. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Même angle qu'Instagram, format plus développé. Inclure horaires : ${prof.operating_hours || 'à préciser'}. Mentionner l'accès : ${prof.nearest_transit_stop_name ? 'station ' + prof.nearest_transit_stop_name : 'votre adresse'}.`,
      email: (a, prof, day) =>
        `Email aux contacts de ${siteName(prof)}. Objet : pourquoi nous choisir aujourd'hui. Corps : beaucoup d'événements autour de nous, voici ce qui nous rend unique. Lien : ${prof.website_url || ''}.`,
      note_interne: (a, prof, day) =>
        `Note interne. Journée à forte densité concurrentielle : ${num(day.events_within_5km_count)} événements à 5 km, pression ${ratio(day.competition_pressure_ratio)}. Renforcer l'accueil et la signalétique.`,
    },
  },

  // #2 — weather_window
  {
    action_type: 'weather_window',
    brand_label_fr: 'Éclaircie',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '☀️',
    color: '#2E7D32',
    card_type: 'action',
    existing_template_key: '_weather_window',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const prevBad = a.prevBadDays || a.consecutive_bad_days || '2+';
      const t = temp(day.temperature_2m_max);
      const precip = pct(day.precipitation_probability_max_pct);
      const sens = weatherSensitive(prof) ? ' Impact direct sur votre fréquentation extérieure.' : '';
      return `Après ${prevBad}j de mauvais temps, ${day.weather_label_fr || 'amélioration'} — ${t}, risque précipitations ${precip}.${sens}`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Le beau temps revient après plusieurs jours de pluie — ${temp(day.temperature_2m_max)}. Inviter les visiteurs à ${isOutdoor(prof) ? 'profiter des espaces extérieurs' : 'venir découvrir ' + siteName(prof)}. Mentionner : ${prof.business_short_description || ''}. Ton chaleureux, local. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Retour du beau temps, format plus long. Ajouter horaires : ${prof.operating_hours || 'à préciser'}. Accès : ${prof.nearest_transit_stop_name || 'à préciser'}.`,
      note_interne: (a, prof, day) =>
        `Note interne. Fenêtre météo favorable après ${a.prevBadDays || '2+'}j de mauvais temps. Prévoir affluence. ${Number(prof.venue_capacity) > 0 ? 'Capacité : ' + prof.venue_capacity + '.' : ''}`,
    },
    missing_fields: ['consecutive_bad_days'],
  },

  // #3 — top_day_approaching
  {
    action_type: 'top_day_approaching',
    brand_label_fr: 'Meilleur jour',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '⭐',
    color: '#2E7D32',
    card_type: 'action',
    existing_template_key: '_best_day',
    consulter_target: 'pulse#day-detail',
    sowhat: (a, prof, day) => {
      const score = num(day.opportunity_score_final_local);
      const regime = day.opportunity_regime || '—';
      const weather = day.weather_label_fr || '';
      const comp = num(day.events_within_5km_count);
      return `Score ${score}/100 (régime ${regime}). ${weather}, ${comp} événements à 5 km.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. C'est le meilleur moment de la semaine pour visiter. Score ${num(day.opportunity_score_final_local)}/100. Mettre en avant : ${prof.business_short_description || 'votre programmation'}. Ton enthousiaste mais factuel. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Meilleur jour de la semaine. Développer avec horaires (${prof.operating_hours || 'à préciser'}), accès, et ce qui est au programme.`,
      note_interne: (a, prof, day) =>
        `Note interne. Meilleur jour de la semaine : score ${num(day.opportunity_score_final_local)}/100. Renforcer l'accueil. ${Number(prof.venue_capacity) > 0 ? 'Capacité max : ' + prof.venue_capacity + '.' : ''}`,
    },
  },

  // #4 — audience_shift_opportunity
  {
    action_type: 'audience_shift_opportunity',
    brand_label_fr: 'Nouvelle audience',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '👥',
    color: '#1565C0',
    card_type: 'action',
    existing_template_key: '_audience_mismatch', // related but inverse framing
    consulter_target: 'pulse#radar-changes',
    sowhat: (a, prof, day) => {
      const trigger = day.holiday_name || day.vacation_name || (day.commercial_events?.[0]?.event_name) || 'changement calendaire';
      const audience = day.audience_availability_label || '—';
      const delta = day.delta_att_calendar_pct != null ? ' (' + (Number(day.delta_att_calendar_pct) > 0 ? '+' : '') + pct(day.delta_att_calendar_pct) + ')' : '';
      return `${trigger} — audience disponible : ${audience}${delta}. Votre public habituel (${prof.primary_audience_1 || '—'}) se mélange avec de nouveaux profils.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const trigger = day.holiday_name || day.vacation_name || (day.commercial_events?.[0]?.event_name) || '';
        return `Post Instagram pour ${siteName(prof)}. ${trigger} change le profil des visiteurs. Adapter le message pour toucher à la fois ${prof.primary_audience_1 || 'votre public habituel'} et les nouveaux visiteurs. Mentionner : ${prof.business_short_description || ''}. Max 2200 car.`;
      },
      facebook: (a, prof, day) => {
        const trigger = day.holiday_name || day.vacation_name || (day.commercial_events?.[0]?.event_name) || '';
        return `Post Facebook pour ${siteName(prof)}. ${trigger} — contenu adapté au nouveau mix d'audience. Format plus long avec détails pratiques.`;
      },
      website: (a, prof, day) =>
        `Mise à jour page d'accueil ${prof.website_url || ''}. Adapter le message pour le contexte calendaire actuel. Mettre en avant l'offre pertinente pour le nouveau public.`,
    },
  },

  // #5 — competitor_threat_direct
  {
    action_type: 'competitor_threat_direct',
    brand_label_fr: 'Menace directe',
    category_label_fr: 'CONCURRENCE',
    icon: '🚨',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || topCompetitor(day).organizer_name || 'Concurrent';
      const event = a.event_name || a.event_label || topCompetitor(day).event_label || '—';
      const dist = a.distance_m ? Math.round(Number(a.distance_m)) + 'm' : (topCompetitor(day).distance_m ? Math.round(Number(topCompetitor(day).distance_m)) + 'm' : '—');
      const threat = a.entity_threat_level || a.threat_level || '—';
      const rating = a.google_rating ? a.google_rating + '/5' : '';
      return `${name} — ${event}, à ${dist}. Menace ${threat}${rating ? ', note ' + rating : ''}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Post Instagram pour ${siteName(prof)}. Un concurrent (${c.organizer_name || 'proche'}) programme ${c.event_label || 'un événement'} le même jour. Mettre en avant ce qui vous différencie : ${prof.business_short_description || 'votre offre'}. Ton confiant, pas agressif. Max 2200 car.`;
      },
      facebook: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Post Facebook pour ${siteName(prof)}. Concurrent actif le même jour (${c.organizer_name || ''}). Développer votre positionnement unique avec détails pratiques.`;
      },
      note_interne: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Note interne. Menace directe : ${c.organizer_name || 'concurrent'} programme ${c.event_label || 'un événement'} à ${c.distance_m ? Math.round(Number(c.distance_m)) + 'm' : '—'}. Chevauchement secteur : ${pct(day.pct_same_bucket_5km)}. Décision : renforcer la comm ou adapter l'offre.`;
      },
    },
  },

  // #6 — regime_c_warning
  {
    action_type: 'regime_c_warning',
    brand_label_fr: 'Régime C',
    category_label_fr: 'URGENT',
    icon: '⚠️',
    color: '#B71C1C',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const score = num(day.opportunity_score_final_local);
      const driver = day.primary_score_driver_label_fr || '—';
      const weather = day.weather_label_fr || '';
      const comp = num(day.events_within_5km_count);
      const forced = day.is_forced_regime_c_flag ? ' (forcé)' : '';
      return `Régime C${forced} — ${driver}, score ${score}/100. ${weather}, ${comp} événements à 5 km.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne urgente. Régime C${day.is_forced_regime_c_flag ? ' forcé' : ''} — score ${num(day.opportunity_score_final_local)}/100. Facteur principal : ${day.primary_score_driver_label_fr || '—'}. Météo : ${day.weather_label_fr || '—'}. Concurrence : ${num(day.events_within_5km_count)} événements à 5 km. Décisions à prendre : effectif, horaires, publications.`,
      email: (a, prof, day) =>
        `Email interne à l'équipe de ${siteName(prof)}. Objet : Alerte Régime C — ${day.date}. Journée à haut risque (score ${num(day.opportunity_score_final_local)}/100). Facteur : ${day.primary_score_driver_label_fr || '—'}. Actions recommandées à discuter.`,
      slack: (a, prof, day) =>
        `Message Slack. Alerte Régime C pour ${siteName(prof)} le ${day.date}. Score ${num(day.opportunity_score_final_local)}/100. Facteur : ${day.primary_score_driver_label_fr || '—'}. À traiter en priorité.`,
    },
  },

  // #7 — competition_proximity
  {
    action_type: 'competition_proximity',
    brand_label_fr: 'Concurrence proche',
    category_label_fr: 'CONCURRENCE',
    icon: '📍',
    color: '#E65100',
    card_type: 'action',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const n500 = num(a.events_500m ?? day.events_within_500m_count);
      const n1k = num(a.events_1km ?? day.events_within_1km_count);
      const topComp = a.top_competitor || '';
      const topThreat = a.top_threat_level || '';
      const ci = day.concentration_index_score != null ? Number(day.concentration_index_score).toFixed(2) : '—';
      return `${n500} événement(s) à 500 m, ${n1k} à 1 km${topComp ? '. Principal : ' + topComp + (topThreat ? ' (' + topThreat + ')' : '') : ''}. Concentration : ${ci}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Forte activité événementielle autour de vous aujourd'hui. Rappeler votre localisation exacte et ce qui vous rend unique : ${prof.business_short_description || ''}. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. ${num(day.events_within_500m_count)} événements à 500 m, ${num(day.events_within_1km_count)} à 1 km. Concentration : ${day.concentration_index_score != null ? Number(day.concentration_index_score).toFixed(2) : '—'}. Renforcer signalétique extérieure et accueil.`,
    },
  },

  // #8 — low_competition_window
  {
    action_type: 'low_competition_window',
    brand_label_fr: 'Fenêtre calme',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '🟢',
    color: '#2E7D32',
    card_type: 'action',
    existing_template_key: '_low_competition',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const pr = ratio(day.competition_pressure_ratio);
      const n = num(day.events_within_5km_count);
      const score = num(day.opportunity_score_final_local);
      return `Pression ${pr} vs normale — ${n} événements à 5 km. Score ${score}/100.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Peu de concurrence aujourd'hui — c'est le moment d'être visible. Mettre en avant : ${prof.business_short_description || 'votre offre'}. Ton invitant. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Journée calme côté concurrence, moment idéal pour publier. Inclure horaires (${prof.operating_hours || ''}) et accès.`,
      gbp: (a, prof, day) =>
        `Post Google Business Profile pour ${siteName(prof)}. Mise en avant de l'offre du jour. Court, factuel, avec horaires. Max 1500 car.`,
    },
  },

  // #9 — extended_bad_weather
  {
    action_type: 'extended_bad_weather',
    brand_label_fr: 'Météo prolongée',
    category_label_fr: 'MÉTÉO',
    icon: '🌧️',
    color: '#E65100',
    card_type: 'action',
    existing_template_key: '_extended_bad_weather',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const days = a.consecutive_bad_days || a.prevBadDays || '2+';
      const weather = day.weather_label_fr || '—';
      const t = temp(day.temperature_2m_max);
      const wind = day.wind_speed_10m_max ? num(day.wind_speed_10m_max) + ' km/h' : '';
      const impact = pct(day.impact_weather_pct);
      return `${days}j consécutifs d'alertes. ${weather}, ${t}${wind ? ', vent ' + wind : ''}. Impact fréquentation estimé : ${impact}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        isOutdoor(prof)
          ? `Post Instagram pour ${siteName(prof)}. Mauvais temps prolongé — mettre en avant votre offre intérieure ou alternative couverte. Ton : rassurant, pratique. Max 2200 car.`
          : `Post Instagram pour ${siteName(prof)}. Temps maussade dehors, parfait pour découvrir ${siteName(prof)} à l'intérieur. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Météo dégradée depuis ${a.consecutive_bad_days || '2+'}j. Impact estimé : ${pct(day.impact_weather_pct)}. ${weatherSensitive(prof) ? 'Site sensible météo — adapter effectif et offre.' : 'Impact limité (site couvert).'}`,
    },
    missing_fields: ['consecutive_bad_days'],
  },

  // #10 — score_driver_shift
  {
    action_type: 'score_driver_shift',
    brand_label_fr: 'Facteur dominant',
    category_label_fr: 'INTELLIGENCE',
    icon: '🔄',
    color: '#1565C0',
    card_type: 'notification',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const cf = changeFeedEntry(day, 'score_driver_shift');
      const from = cf.old_value || '—';
      const to = day.primary_score_driver_label_fr || cf.new_value || '—';
      const score = num(day.opportunity_score_final_local);
      return `Facteur principal : ${from} → ${to}. Score ${score}/100.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) => {
        const cf = changeFeedEntry(day, 'score_driver_shift');
        return `Note interne. Le facteur de risque dominant a changé : ${cf.old_value || '—'} → ${day.primary_score_driver_label_fr || '—'}. Score actuel : ${num(day.opportunity_score_final_local)}/100. Adapter la priorité opérationnelle.`;
      },
    },
  },

  // #11 — weekend_opportunity
  {
    action_type: 'weekend_opportunity',
    brand_label_fr: 'Week-end favorable',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '📅',
    color: '#2E7D32',
    card_type: 'action',
    existing_template_key: '_weekend_vacation',
    consulter_target: 'pulse#day-detail',
    sowhat: (a, prof, day) => {
      // Note: weekend card needs sat+sun data — use day as "best of the two"
      const score = num(day.opportunity_score_final_local);
      const weather = day.weather_label_fr || '';
      const comp = num(day.events_within_5km_count);
      return `Score ${score}/100. ${weather}, ${comp} événements à 5 km. Conditions favorables pour le week-end.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Week-end favorable — score ${num(day.opportunity_score_final_local)}/100. Inviter les visiteurs à venir. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Programme du week-end. Conditions favorables. Détailler horaires (${prof.operating_hours || ''}) et offre.`,
      note_interne: (a, prof, day) =>
        `Note interne. Week-end favorable — score ${num(day.opportunity_score_final_local)}/100. ${Number(prof.venue_capacity) > 0 ? 'Capacité : ' + prof.venue_capacity + '. Prévoir effectif renforcé.' : 'Prévoir effectif renforcé.'}`,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE-FEED TRANSITIONS (12–36)
  // ═══════════════════════════════════════════════════════════════════════════

  // #12 — weather_hazard_onset
  {
    action_type: 'weather_hazard_onset',
    brand_label_fr: 'Alerte météo',
    category_label_fr: 'MÉTÉO',
    icon: '⚡',
    color: '#E65100',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const hazard = hazardLabel(day);
      const level = num(day.alert_level_max);
      const weather = day.weather_label_fr || '';
      const tRange = day.temperature_2m_min != null && day.temperature_2m_max != null
        ? temp(day.temperature_2m_min) + '–' + temp(day.temperature_2m_max)
        : '';
      const precip = day.precipitation_sum_mm != null ? num(day.precipitation_sum_mm) + 'mm' : '';
      return `Alerte niveau ${level} — ${hazard}. ${weather}${tRange ? ', ' + tRange : ''}${precip ? ', ' + precip : ''}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Alerte météo (${hazardLabel(day)}) — informer les visiteurs. ${isOutdoor(prof) ? 'Préciser les alternatives couvertes.' : 'Rassurer sur l\'accueil normal.'} Max 2200 car.`,
      website: (a, prof, day) =>
        `Bannière d'alerte météo pour ${prof.website_url || 'votre site web'}. ${hazardLabel(day)} — informer sur les conditions et les adaptations éventuelles.`,
      note_interne: (a, prof, day) =>
        `Note interne. Alerte météo niveau ${num(day.alert_level_max)} (${hazardLabel(day)}). ${weatherSensitive(prof) ? 'Site sensible — adapter : effectif, programme, sécurité extérieure.' : 'Impact limité (site couvert) mais informer l\'équipe.'}`,
    },
  },

  // #13 — weather_worsened
  {
    action_type: 'weather_worsened',
    brand_label_fr: 'Météo dégradée',
    category_label_fr: 'MÉTÉO',
    icon: '🌦️',
    color: '#E65100',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const weather = day.weather_label_fr || '—';
      const impact = pct(day.impact_weather_pct);
      const delta = day.delta_att_weather_total_pct != null
        ? (Number(day.delta_att_weather_total_pct) > 0 ? '+' : '') + pct(day.delta_att_weather_total_pct)
        : '';
      return `${weather} — impact fréquentation estimé ${impact}. Variation météo : ${delta || '—'}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        isOutdoor(prof)
          ? `Post Instagram pour ${siteName(prof)}. Conditions météo dégradées — mettre en avant l'offre intérieure. Ton pratique. Max 2200 car.`
          : `Post Instagram pour ${siteName(prof)}. Météo dégradée mais ${siteName(prof)} vous accueille normalement. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Météo dégradée : ${day.weather_label_fr || '—'}. Impact estimé : ${pct(day.impact_weather_pct)}. ${weatherSensitive(prof) ? 'Adapter effectif et programme.' : 'Pas d\'action immédiate.'}`,
    },
  },

  // #14 — weather_improved
  {
    action_type: 'weather_improved',
    brand_label_fr: 'Météo améliorée',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '🌤️',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const weather = day.weather_label_fr || '—';
      const t = temp(day.temperature_2m_max);
      const delta = day.delta_att_weather_total_pct != null
        ? '+' + pct(day.delta_att_weather_total_pct)
        : '';
      return `${weather}, ${t}. Variation météo : ${delta || '—'}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Le temps s'améliore — ${day.weather_label_fr || ''}, ${temp(day.temperature_2m_max)}. Inviter les visiteurs. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Amélioration météo. Inclure horaires et accès.`,
    },
  },

  // #15 — competition_pressure_spike
  {
    action_type: 'competition_pressure_spike',
    brand_label_fr: 'Pic de pression',
    category_label_fr: 'CONCURRENCE',
    icon: '📈',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const cf = changeFeedEntry(day, 'competition_pressure_spike');
      const oldR = cf.old_value ? '×' + Number(cf.old_value).toFixed(1) : '—';
      const newR = ratio(day.competition_pressure_ratio);
      const n = num(day.events_within_5km_count);
      const same = num(day.events_within_5km_same_bucket_count);
      return `Pression passée de ${oldR} à ${newR}. ${n} événements à 5 km, ${same} dans votre secteur.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Hausse soudaine de la concurrence — se démarquer maintenant. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Pic de pression concurrentielle : ${ratio(day.competition_pressure_ratio)} vs normale. ${num(day.events_within_5km_count)} événements à 5 km. Décision : renforcer comm ou maintenir.`,
    },
  },

  // #16 — calendar_audience_shift
  {
    action_type: 'calendar_audience_shift',
    brand_label_fr: 'Contexte calendaire',
    category_label_fr: 'INTELLIGENCE',
    icon: '🗓️',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#radar-changes',
    sowhat: (a, prof, day) => {
      const trigger = day.holiday_name || day.vacation_name || (day.commercial_events?.[0]?.event_name) || 'changement calendaire';
      const audience = day.audience_availability_label || '—';
      const delta = day.delta_att_calendar_pct != null
        ? ' (' + (Number(day.delta_att_calendar_pct) > 0 ? '+' : '') + pct(day.delta_att_calendar_pct) + ')'
        : '';
      return `${trigger} — audience : ${audience}${delta}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const trigger = day.holiday_name || day.vacation_name || (day.commercial_events?.[0]?.event_name) || '';
        return `Post Instagram pour ${siteName(prof)}. Contexte : ${trigger}. Adapter le message pour le public du moment (${prof.primary_audience_1 || 'visiteurs'}). Max 2200 car.`;
      },
      website: (a, prof, day) =>
        `Mise à jour ${prof.website_url || 'site web'}. Adapter la page d'accueil au contexte : ${day.holiday_name || day.vacation_name || 'période spéciale'}.`,
    },
  },

  // #17 — mobility_disruption
  {
    action_type: 'mobility_disruption',
    brand_label_fr: 'Perturbation accès',
    category_label_fr: 'URGENT',
    icon: '🚧',
    color: '#B71C1C',
    card_type: 'action',
    existing_template_key: '_mobility_comp_squeeze', // partial overlap
    consulter_target: 'pulse#radar-changes',
    sowhat: (a, prof, day) => {
      const transit = prof.nearest_transit_stop_name || '';
      const line = Array.isArray(prof.nearest_transit_line_name) ? prof.nearest_transit_line_name.join(', ') : (prof.nearest_transit_line_name || '');
      const dist = prof.nearest_transit_stop_distance_m ? Math.round(Number(prof.nearest_transit_stop_distance_m)) + 'm' : '';
      const impact = pct(day.delta_att_mobility_pct);
      return `Accès perturbé${transit ? ' — ' + transit + (line ? ' (' + line + ')' : '') + (dist ? ', ' + dist : '') : ''}. Impact mobilité estimé : ${impact}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const transit = prof.nearest_transit_stop_name || '';
        return `Post Instagram pour ${siteName(prof)}. Perturbation d'accès${transit ? ' (station ' + transit + ')' : ''}. Indiquer les alternatives. ${prof.nearest_transit_line_name ? 'Lignes concernées : ' + prof.nearest_transit_line_name : ''}. Ton pratique, pas alarmiste. Max 2200 car.`;
      },
      website: (a, prof, day) =>
        `Bannière d'alerte accès pour ${prof.website_url || 'site web'}. Perturbation en cours. Indiquer itinéraire alternatif.`,
      email: (a, prof, day) =>
        `Email aux réservations de ${siteName(prof)}. Objet : info accès — perturbation en cours. Indiquer alternatives et rassurer sur l'ouverture normale.`,
      note_interne: (a, prof, day) =>
        `Note interne urgente. Perturbation mobilité active. ${prof.nearest_transit_stop_name ? 'Station ' + prof.nearest_transit_stop_name + ' concernée.' : ''} Impact estimé : ${pct(day.delta_att_mobility_pct)}. Préparer signalétique d'accès alternatif.`,
    },
    missing_fields: ['disruption_description', 'disruption_duration'],
  },

  // #18 — mobility_disruption_planned
  {
    action_type: 'mobility_disruption_planned',
    brand_label_fr: 'Travaux prévus',
    category_label_fr: 'PLANIFICATION',
    icon: '🚧',
    color: '#F57F17',
    card_type: 'action',
    consulter_target: 'pulse#radar-changes',
    sowhat: (a, prof, day) => {
      const transit = prof.nearest_transit_stop_name || '';
      const line = Array.isArray(prof.nearest_transit_line_name) ? prof.nearest_transit_line_name.join(', ') : (prof.nearest_transit_line_name || '');
      return `Travaux annoncés${transit ? ' — ' + transit + (line ? ' (' + line + ')' : '') : ''}. Impact mobilité : ${pct(day.delta_att_mobility_pct)}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Travaux prévus à proximité. Informer les visiteurs à l'avance sur les alternatives d'accès. Max 2200 car.`,
      website: (a, prof, day) =>
        `Mise à jour ${prof.website_url || 'site web'}. Ajouter info travaux et itinéraire alternatif.`,
      note_interne: (a, prof, day) =>
        `Note interne. Travaux planifiés. ${prof.nearest_transit_stop_name ? 'Station ' + prof.nearest_transit_stop_name + ' impactée.' : ''} Anticiper : signalétique, communication visiteurs, effectif.`,
    },
    missing_fields: ['disruption_description', 'disruption_start_date', 'disruption_duration'],
  },

  // #19 — mobility_disruption_resolved
  {
    action_type: 'mobility_disruption_resolved',
    brand_label_fr: 'Accès rétabli',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '✅',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-changes',
    sowhat: (a, prof, day) => {
      const transit = prof.nearest_transit_stop_name || '';
      const line = Array.isArray(prof.nearest_transit_line_name) ? prof.nearest_transit_line_name.join(', ') : (prof.nearest_transit_line_name || '');
      return `Accès rétabli${transit ? ' — ' + transit + (line ? ' (' + line + ')' : '') + ' de nouveau accessible' : ''}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. L'accès est rétabli${prof.nearest_transit_stop_name ? ' (station ' + prof.nearest_transit_stop_name + ')' : ''}. Inviter les visiteurs à revenir. Max 2200 car.`,
      website: (a, prof, day) =>
        `Retirer la bannière d'alerte de ${prof.website_url || 'votre site'}. Confirmer le retour à la normale.`,
    },
  },

  // #20 — score_up
  {
    action_type: 'score_up',
    brand_label_fr: 'Score en hausse',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '📈',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const score = num(day.opportunity_score_final_local);
      const delta = day.opportunity_score_vs_yesterday != null
        ? '+' + num(day.opportunity_score_vs_yesterday)
        : '';
      const driver = day.primary_score_driver_label_fr || '—';
      return `Score ${score}/100 (${delta} vs hier). Facteur : ${driver}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Les conditions sont meilleures qu'hier — score en hausse. C'est le moment de communiquer. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`,
      email: (a, prof, day) =>
        `Email aux contacts de ${siteName(prof)}. Objet : les conditions s'améliorent — venez nous voir. Corps : score en hausse (${num(day.opportunity_score_final_local)}/100), ${day.weather_label_fr || 'conditions favorables'}. Inclure horaires (${prof.operating_hours || 'à préciser'}) et lien : ${prof.website_url || ''}.`,
      note_interne: (a, prof, day) =>
        `Note interne. Score en hausse : ${num(day.opportunity_score_final_local)}/100 (+${num(day.opportunity_score_vs_yesterday)} vs hier). Facteur : ${day.primary_score_driver_label_fr || '—'}. Opportunité de communication — publier maintenant.`,
    },
  },

  // #21 — score_down
  {
    action_type: 'score_down',
    brand_label_fr: 'Score en baisse',
    category_label_fr: 'INTELLIGENCE',
    icon: '📉',
    color: '#D32F2F',
    card_type: 'notification',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const score = num(day.opportunity_score_final_local);
      const delta = day.opportunity_score_vs_yesterday != null
        ? num(day.opportunity_score_vs_yesterday)
        : '';
      const driver = day.primary_score_driver_label_fr || '—';
      return `Score ${score}/100 (${delta} vs hier). Facteur : ${driver}.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne. Score en baisse : ${num(day.opportunity_score_final_local)}/100 (${num(day.opportunity_score_vs_yesterday)} vs hier). Facteur : ${day.primary_score_driver_label_fr || '—'}. Évaluer s'il faut reporter des publications ou réduire l'effectif.`,
    },
  },

  // #22 — regime_change
  {
    action_type: 'regime_change',
    brand_label_fr: 'Changement régime',
    category_label_fr: 'INTELLIGENCE',
    icon: '🔀',
    color: '#1565C0',
    card_type: 'notification',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const cf = changeFeedEntry(day, 'regime_change');
      const from = cf.old_value || '—';
      const to = cf.new_value || day.opportunity_regime || '—';
      const score = num(day.opportunity_score_final_local);
      const driver = day.primary_score_driver_label_fr || '';
      return `Régime ${from} → ${to}. Score ${score}/100${driver ? ', facteur : ' + driver : ''}.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) => {
        const cf = changeFeedEntry(day, 'regime_change');
        const from = cf.old_value || '—';
        const to = cf.new_value || day.opportunity_regime || '—';
        return `Note interne. Changement de régime : ${from} → ${to}. Score ${num(day.opportunity_score_final_local)}/100. Facteur : ${day.primary_score_driver_label_fr || '—'}. ${to === 'A' ? 'Conditions favorables — maximiser la présence et la communication.' : to === 'C' ? 'Conditions défavorables — réduire les dépenses, reporter si possible.' : 'Conditions neutres — maintenir le plan.'}`;
      },
      slack: (a, prof, day) => {
        const cf = changeFeedEntry(day, 'regime_change');
        return `Message Slack. Régime ${cf.old_value || '—'} → ${cf.new_value || day.opportunity_regime || '—'} pour ${siteName(prof)} le ${day.date}. Score ${num(day.opportunity_score_final_local)}/100. ${day.primary_score_driver_label_fr ? 'Facteur : ' + day.primary_score_driver_label_fr + '.' : ''}`;
      },
    },
  },

  // #23 — medal_change
  {
    action_type: 'medal_change',
    brand_label_fr: 'Changement médaille',
    category_label_fr: 'INTELLIGENCE',
    icon: '🏅',
    color: '#1565C0',
    card_type: 'notification',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const cf = changeFeedEntry(day, 'medal_change');
      const from = cf.old_value || '—';
      const to = cf.new_value || day.opportunity_medal || '—';
      const score = num(day.opportunity_score_final_local);
      return `Médaille ${from} → ${to}. Score ${score}/100.`;
    },
    draft_seeds: {},
  },

  // #24 — mega_event_activation
  {
    action_type: 'mega_event_activation',
    brand_label_fr: 'Méga-événement',
    category_label_fr: 'INTELLIGENCE',
    icon: '🏟️',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const c = topCompetitor(day);
      const event = c.event_label || a.event_label || 'Méga-événement';
      const attendance = c.estimated_attendance ? num(c.estimated_attendance) + ' visiteurs attendus' : '';
      const dist = c.distance_m ? Math.round(Number(c.distance_m)) + 'm' : '';
      return `${event}${dist ? ' à ' + dist : ''}${attendance ? ' — ' + attendance : ''}. Impact sur la fréquentation de votre zone.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Post Instagram pour ${siteName(prof)}. Un méga-événement (${c.event_label || ''}) attire du monde dans votre zone. Profiter de l'afflux. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`;
      },
      note_interne: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Note interne. Méga-événement : ${c.event_label || '—'}${c.estimated_attendance ? ', ' + num(c.estimated_attendance) + ' visiteurs attendus' : ''}. Renforcer accueil, adapter signalétique${Number(day.tourism_peak_flag_region) ? ', prévoir multilingue' : ''}.`;
      },
    },
  },

  // #25 — mega_event_end
  {
    action_type: 'mega_event_end',
    brand_label_fr: 'Fin méga-événement',
    category_label_fr: 'INTELLIGENCE',
    icon: '🏁',
    color: '#1565C0',
    card_type: 'notification',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const pr = ratio(day.competition_pressure_ratio);
      return `Méga-événement terminé. Retour au rythme normal — pression concurrentielle : ${pr}.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne. Méga-événement terminé. Pression concurrentielle revient à ${ratio(day.competition_pressure_ratio)}. Ajuster effectif au rythme normal.`,
    },
  },

  // #26 — competitor_event_launch
  {
    action_type: 'competitor_event_launch',
    brand_label_fr: 'Lancement concurrent',
    category_label_fr: 'CONCURRENCE',
    icon: '📣',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || topCompetitor(day).organizer_name || 'Concurrent';
      const event = a.event_label || topCompetitor(day).event_label || '—';
      const dist = a.distance_m ? Math.round(Number(a.distance_m)) + 'm' : (topCompetitor(day).distance_m ? Math.round(Number(topCompetitor(day).distance_m)) + 'm' : '—');
      const threat = a.entity_threat_level || '—';
      return `${name} lance ${event} — à ${dist}, menace ${threat}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Post Instagram pour ${siteName(prof)}. Un concurrent (${c.organizer_name || ''}) lance un nouvel événement. Affirmer votre positionnement : ${prof.business_short_description || ''}. Max 2200 car.`;
      },
      note_interne: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Note interne. ${c.organizer_name || 'Concurrent'} lance ${c.event_label || 'un événement'} à ${c.distance_m ? Math.round(Number(c.distance_m)) + 'm' : '—'}. Dates : ${c.event_start_date || '—'} → ${c.event_end_date || '—'}. Évaluer l'impact et décider d'une réponse.`;
      },
    },
  },

  // #27 — competitor_audience_conflict
  {
    action_type: 'competitor_audience_conflict',
    brand_label_fr: 'Conflit audience',
    category_label_fr: 'CONCURRENCE',
    icon: '🚨',
    color: '#B71C1C',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || topCompetitor(day).organizer_name || 'Concurrent';
      const audience = prof.primary_audience_1 || '—';
      // audience_overlap_pct and threat_level from int_competitor_threat_profile — P0 dbt TODO
      const overlap = a.audience_overlap_pct ? pct(a.audience_overlap_pct) : '—';
      const threat = a.entity_threat_level || a.threat_level || '—';
      return `${name} cible ${audience} — chevauchement ${overlap}, menace ${threat}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Conflit d'audience direct avec un concurrent. Mettre en avant ce qui vous rend irremplaçable : ${prof.business_short_description || ''}. Ton confiant. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Conflit audience frontal avec ${a.competitor_name || 'un concurrent'}. Audience ciblée : ${prof.primary_audience_1 || '—'}. Options : différencier l'offre, adapter le tarif, renforcer la comm.`,
    },
  },

  // #28 — competitor_review_surge
  {
    action_type: 'competitor_review_surge',
    brand_label_fr: 'Avis en hausse',
    category_label_fr: 'CONCURRENCE',
    icon: '💬',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const count = a.review_count || '—';
      const rating = a.rating || '—';
      return `${name} — ${count} nouveaux avis, note ${rating}/5. Attractivité en hausse.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Rappeler vos points forts et inviter vos visiteurs à laisser un avis. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. ${a.competitor_name || 'Concurrent'} accumule des avis positifs (${a.review_count || '—'} récents, note ${a.rating || '—'}/5). Action : solliciter vos visiteurs pour des avis Google.`,
    },
    missing_fields: ['review_count', 'rating'],
  },

  // #29 — competitor_review_drop
  {
    action_type: 'competitor_review_drop',
    brand_label_fr: 'Avis en baisse',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '💬',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const oldR = a.old_rating || '—';
      const newR = a.new_rating || '—';
      return `${name} — note passée de ${oldR} à ${newR}/5. Visiteurs déçus en recherche d'alternative.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Mettre en avant vos avis positifs et votre qualité d'accueil. Max 2200 car.`,
      website: (a, prof, day) =>
        `Mise à jour ${prof.website_url || 'site web'}. Mettre en avant vos meilleurs témoignages clients.`,
    },
    missing_fields: ['old_rating', 'new_rating'],
  },

  // #30 — competitor_hours_change
  {
    action_type: 'competitor_hours_change',
    brand_label_fr: 'Horaires modifiés',
    category_label_fr: 'CONCURRENCE',
    icon: '🕒',
    color: '#E65100',
    card_type: 'notification',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const oldH = a.old_hours || '—';
      const newH = a.new_hours || '—';
      return `${name} — horaires : ${oldH} → ${newH}.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne. ${a.competitor_name || 'Concurrent'} a changé ses horaires (${a.old_hours || '—'} → ${a.new_hours || '—'}). Vérifier si vos créneaux se chevauchent maintenant (vos horaires : ${prof.operating_hours || 'à vérifier'}).`,
    },
    missing_fields: ['old_hours', 'new_hours'],
  },

  // #31 — competitor_new_offering
  {
    action_type: 'competitor_new_offering',
    brand_label_fr: 'Nouvelle offre',
    category_label_fr: 'CONCURRENCE',
    icon: '🎁',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const desc = a.offering_description || 'nouvelle offre détectée';
      const dist = a.distance_m ? Math.round(Number(a.distance_m)) + 'm' : '';
      return `${name} — ${desc}${dist ? ', à ' + dist : ''}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Un concurrent élargit son offre. Mettre en avant votre spécificité : ${prof.business_short_description || ''}. Ton confiant. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. ${a.competitor_name || 'Concurrent'} ajoute une nouvelle offre : ${a.offering_description || '—'}. Analyser le positionnement et décider si adaptation nécessaire.`,
    },
    missing_fields: ['offering_description'],
  },

  // #32 — competitor_sold_out
  {
    action_type: 'competitor_sold_out',
    brand_label_fr: 'Complet',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '🚫',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const c = topCompetitor(day);
      const name = c.organizer_name || a.competitor_name || '—';
      const event = c.event_label || a.event_label || '';
      const dist = c.distance_m ? Math.round(Number(c.distance_m)) + 'm' : '';
      return `${name} affiche complet${event ? ' pour ' + event : ''}${dist ? ' — à ' + dist : ''}. Visiteurs refusés en recherche d'alternative.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const c = topCompetitor(day);
        return `Post Instagram pour ${siteName(prof)}. ${c.organizer_name || 'Un lieu voisin'} affiche complet. Inviter les visiteurs refusés : ${siteName(prof)} vous accueille, ${prof.operating_hours || 'aux horaires habituels'}. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`;
      },
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Un concurrent est complet. Format développé — inclure ce qui vous différencie, vos horaires, votre accès.`,
      gbp: (a, prof, day) =>
        `Post Google Business Profile pour ${siteName(prof)}. Alternative disponible — venez nous découvrir. Horaires et accès. Max 1500 car.`,
    },
  },

  // #33 — competitor_content_spike
  {
    action_type: 'competitor_content_spike',
    brand_label_fr: 'Activité comm.',
    category_label_fr: 'CONCURRENCE',
    icon: '📢',
    color: '#D32F2F',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const count = a.content_count || '—';
      const baseline = a.baseline_content_count || '—';
      return `${name} — ${count} publications récentes vs ${baseline} en moyenne.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Un concurrent pousse sa communication. Maintenir votre visibilité : ${prof.business_short_description || ''}. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. ${a.competitor_name || 'Concurrent'} multiplie les publications (${a.content_count || '—'} vs ${a.baseline_content_count || '—'} en moyenne). Envisager d'augmenter notre fréquence de publication.`,
    },
    missing_fields: ['content_count', 'baseline_content_count'],
  },

  // #34 — competitor_content_silent
  {
    action_type: 'competitor_content_silent',
    brand_label_fr: 'Silence concurrent',
    category_label_fr: 'OPPORTUNITÉ',
    icon: '🤐',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const name = a.competitor_name || '—';
      const days = a.days_silent || '—';
      return `${name} — aucune publication depuis ${days}j. Espace médiatique local disponible.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Votre concurrent principal est silencieux. C'est le moment de prendre la parole. Mettre en avant : ${prof.business_short_description || ''}. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Espace libre dans la communication locale. Publier maintenant avec horaires et offre du moment.`,
    },
    missing_fields: ['days_silent'],
  },

  // #35 — institution_campaign_detected
  {
    action_type: 'institution_campaign_detected',
    brand_label_fr: 'Campagne instit.',
    category_label_fr: 'INTELLIGENCE',
    icon: '🏛️',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const name = a.campaign_name || 'Campagne institutionnelle';
      const org = a.organizer_name || '';
      const dist = a.distance_m ? Math.round(Number(a.distance_m)) + 'm' : '';
      return `${name}${org ? ' (' + org + ')' : ''}${dist ? ' à ' + dist : ''} — flux de visiteurs attendu.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Une campagne institutionnelle attire du monde près de chez vous. Profitez de l'afflux — ${prof.business_short_description || ''}. Max 2200 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Campagne institutionnelle détectée : ${a.campaign_name || '—'}. Flux attendu. Envisager un partenariat ou une offre complémentaire.`,
    },
    missing_fields: ['campaign_name'],
  },

  // #36 — media_mention_detected
  {
    action_type: 'media_mention_detected',
    brand_label_fr: 'Mention média',
    category_label_fr: 'INTELLIGENCE',
    icon: '📰',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#media-detail',
    sowhat: (a, prof, day) => {
      const source = a.media_source || 'média';
      const topic = a.mention_topic || 'votre zone';
      return `Mention dans ${source} — sujet : ${topic}. Visibilité accrue.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Votre zone est mentionnée dans les médias (${a.media_source || ''}). Relayer la mention et inviter les curieux. Max 2200 car.`,
      website: (a, prof, day) =>
        `Mise à jour ${prof.website_url || 'site web'}. Ajouter la mention presse dans votre rubrique actualités.`,
    },
    missing_fields: ['media_source', 'mention_topic'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES CROSSOVER CARDS (S1–S4 + COMPETITOR POSITIONING GAP)
  // ═══════════════════════════════════════════════════════════════════════════

  // S1 — sales_underperformance
  {
    action_type: 'sales_underperformance',
    brand_label_fr: 'CA en retrait',
    category_label_fr: 'INTELLIGENCE',
    icon: '\ud83d\udcc9',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const rev = num(a.daily_revenue);
      const avg = num(a.avg_30d);
      const pct_delta = num(a.revenue_vs_avg_pct);
      const driver = a.driver || day.primary_score_driver_label_fr || '\u2014';
      const competitor = a.top_competitor || '';
      const pressure = ratio(a.pressure_ratio);
      if (Number(a.pressure_ratio) > 1.3 && competitor) {
        return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Cause : pression concurrentielle ${pressure} \u2014 ${competitor}.`;
      }
      if (Number(day.alert_level_max || 0) >= 2) {
        return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Cause : conditions m\u00e9t\u00e9o d\u00e9favorables.`;
      }
      return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Facteur dominant : ${driver}.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne. CA en retrait de ${num(a.revenue_vs_avg_pct)}% vs moyenne 30j. ${Number(a.pressure_ratio) > 1.3 ? 'Pression concurrentielle \u00e9lev\u00e9e (' + ratio(a.pressure_ratio) + ').' : ''} ${a.top_competitor ? 'Concurrent principal : ' + a.top_competitor + '.' : ''} ${a.driver ? 'Facteur : ' + a.driver + '.' : ''} D\u00e9cision : ajuster communication ou offre.`,
      slack: (a, prof, day) =>
        `Alerte CA. ${siteName(prof)} : CA ${num(a.daily_revenue)} EUR, -${num(Math.abs(Number(a.revenue_vs_avg_pct)))}% vs moyenne. ${a.top_competitor ? 'Concurrent : ' + a.top_competitor + '.' : ''} ${a.driver ? 'Facteur : ' + a.driver + '.' : ''}`,
    },
  },

  // S2 — sales_surge
  {
    action_type: 'sales_surge',
    brand_label_fr: 'CA en hausse',
    category_label_fr: 'OPPORTUNIT\u00c9',
    icon: '\ud83d\udcc8',
    color: '#2E7D32',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const rev = num(a.daily_revenue);
      const avg = num(a.avg_30d);
      const pct_delta = '+' + num(a.revenue_vs_avg_pct);
      const pressure = Number(a.pressure_ratio);
      if (pressure < 0.85) {
        return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Fen\u00eatre de faible concurrence (\u00d7${pressure.toFixed(1)}) \u2014 conditions \u00e0 reproduire.`;
      }
      if (day.is_public_holiday_flag || day.is_school_holiday_flag) {
        return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Contexte calendaire porteur \u2014 capitalisez sur le momentum.`;
      }
      if (Number(day.alert_level_max || 0) === 0) {
        return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). M\u00e9t\u00e9o favorable, conditions propices.`;
      }
      return `CA ${rev} EUR vs ${avg} EUR en moyenne (${pct_delta}%). Facteur : ${a.driver || '\u2014'}.`;
    },
    draft_seeds: {
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Journ\u00e9e excellente \u2014 mettre en avant ce qui a fonctionn\u00e9 : ${prof.business_short_description || 'votre offre'}. Inviter \u00e0 revenir demain. Ton enthousiaste, factuel. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. Belle journ\u00e9e, capitaliser sur le momentum. Inclure horaires (${prof.operating_hours || '\u00e0 pr\u00e9ciser'}) et acc\u00e8s.`,
      email: (a, prof, day) =>
        `Email aux contacts de ${siteName(prof)}. Objet : les conditions sont r\u00e9unies \u2014 venez nous voir. Corps : CA en hausse, contexte favorable. Lien : ${prof.website_url || ''}.`,
      note_interne: (a, prof, day) =>
        `Note interne. CA +${num(a.revenue_vs_avg_pct)}% vs moyenne 30j. ${Number(a.pressure_ratio) < 0.85 ? 'Concurrence faible \u2014 amplifier la communication.' : 'Identifier les leviers pour reproduire.'} ${a.driver ? 'Facteur : ' + a.driver + '.' : ''}`,
    },
  },

  // S3 — sales_missed_opportunity
  {
    action_type: 'sales_missed_opportunity',
    brand_label_fr: 'Opportunit\u00e9 manqu\u00e9e',
    category_label_fr: 'URGENT',
    icon: '\ud83d\udea8',
    color: '#B71C1C',
    card_type: 'action',
    consulter_target: 'pulse#radar-score',
    sowhat: (a, prof, day) => {
      const score = num(a.score);
      const regime = a.regime || '\u2014';
      const rev = num(a.daily_revenue);
      const avg = num(a.avg_30d);
      const pct_delta = num(a.revenue_vs_avg_pct);
      const pressure = Number(a.pressure_ratio);
      let diagnosis = '';
      if (pressure < 1.0) {
        diagnosis = 'Concurrence faible \u2014 fen\u00eatre id\u00e9ale pour communiquer.';
      } else if (Number(day.alert_level_max || 0) === 0) {
        diagnosis = 'M\u00e9t\u00e9o favorable \u2014 les conditions \u00e9taient r\u00e9unies.';
      } else {
        diagnosis = 'Malgr\u00e9 le contexte, le potentiel \u00e9tait l\u00e0.';
      }
      return `Score ${score}/100 (r\u00e9gime ${regime}) mais CA ${rev} EUR, soit ${pct_delta}% sous la moyenne (${avg} EUR). ${diagnosis}`;
    },
    draft_seeds: {
      email: (a, prof, day) =>
        `Email aux contacts de ${siteName(prof)}. Objet : ne manquez pas la prochaine fen\u00eatre. Corps : les conditions \u00e9taient id\u00e9ales r\u00e9cemment (score ${num(a.score)}/100) et nous n'avons pas communiqu\u00e9 assez. Lien : ${prof.website_url || ''}.`,
      instagram: (a, prof, day) =>
        `Post Instagram pour ${siteName(prof)}. Montrer l'\u00e9nergie et l'offre du moment. ${prof.business_short_description || ''}. Rattraper la visibilit\u00e9 manqu\u00e9e. Ton proactif. Max 2200 car.`,
      facebook: (a, prof, day) =>
        `Post Facebook pour ${siteName(prof)}. M\u00eame angle \u2014 format d\u00e9velopp\u00e9 avec horaires et d\u00e9tails de l'offre.`,
      gbp: (a, prof, day) =>
        `Post Google Business Profile pour ${siteName(prof)}. Mettre en avant l'offre actuelle. Court, factuel, avec horaires. Max 1500 car.`,
      note_interne: (a, prof, day) =>
        `Note interne. Opportunit\u00e9 manqu\u00e9e le ${day.date || '\u2014'} : score ${num(a.score)}/100 mais CA -${num(Math.abs(Number(a.revenue_vs_avg_pct)))}%. ${Number(a.pressure_ratio) < 1.0 ? 'Concurrence faible.' : ''} Action : pr\u00e9parer une communication pour la prochaine fen\u00eatre favorable.`,
    },
  },

  // S4 — sales_competition_cannibalization
  {
    action_type: 'sales_competition_cannibalization',
    brand_label_fr: 'Cannibalisation',
    category_label_fr: 'URGENT',
    icon: '\u2694\ufe0f',
    color: '#B71C1C',
    card_type: 'action',
    consulter_target: 'pulse#carte',
    sowhat: (a, prof, day) => {
      const rev_delta = num(a.revenue_delta_pct);
      const pressure = ratio(a.pressure_ratio);
      const competitor = a.top_competitor || '';
      const dist = a.competitor_distance_km ? a.competitor_distance_km + ' km' : '';
      const overlap = a.competitor_overlap_pct ? pct(Number(a.competitor_overlap_pct) * 100) : '';
      let attribution = `Pression concurrentielle ${pressure}.`;
      if (competitor) {
        attribution = `${competitor}${dist ? ' \u00e0 ' + dist : ''}${overlap ? ', chevauchement audience ' + overlap : ''}.`;
      }
      return `CA ${rev_delta}% vs hier. ${attribution}`;
    },
    draft_seeds: {
      instagram: (a, prof, day) => {
        const competitor = a.top_competitor || 'un concurrent';
        return `Post Instagram pour ${siteName(prof)}. ${competitor} attire votre public \u2014 rappeler ce qui vous diff\u00e9rencie : ${prof.business_short_description || 'votre offre unique'}. Ton confiant, pas agressif. Max 2200 car.`;
      },
      note_interne: (a, prof, day) =>
        `Note interne. CA ${num(a.revenue_delta_pct)}% vs hier. Pression ${ratio(a.pressure_ratio)}. ${a.top_competitor ? 'Concurrent : ' + a.top_competitor + (a.competitor_distance_km ? ' \u00e0 ' + a.competitor_distance_km + ' km' : '') + '.' : ''} D\u00e9cision : renforcer diff\u00e9renciation ou ajuster offre.`,
      slack: (a, prof, day) =>
        `Alerte cannibalisation. ${siteName(prof)} : CA ${num(a.revenue_delta_pct)}% vs hier. ${a.top_competitor ? a.top_competitor + ' (menace ' + (a.competitor_threat_level || '\u2014') + ').' : 'Pression ' + ratio(a.pressure_ratio) + '.'}`,
    },
  },

  // S-NEW — competitor_positioning_gap
  {
    action_type: 'competitor_positioning_gap',
    brand_label_fr: '\u00c9cart concurrent',
    category_label_fr: 'INTELLIGENCE',
    icon: '\ud83d\udd0d',
    color: '#1565C0',
    card_type: 'action',
    consulter_target: 'pulse#radar-threats',
    sowhat: (a, prof, day) => {
      const n = num(a.enriched_competitor_count);
      const topItem = a.top_item_description || '\u2014';
      const share = a.top_item_revenue_share ? pct(Number(a.top_item_revenue_share) * 100) : '\u2014';
      return `${n} concurrent(s) avec offre analys\u00e9e. Votre produit principal : ${topItem} (${share} du CA). V\u00e9rifiez les \u00e9carts de positionnement.`;
    },
    draft_seeds: {
      note_interne: (a, prof, day) =>
        `Note interne. ${num(a.enriched_competitor_count)} concurrent(s) suivi(s) disposent d'une offre enrichie. Top produit : ${a.top_item_description || '\u2014'} (${a.top_item_revenue_share ? pct(Number(a.top_item_revenue_share) * 100) : '\u2014'} du CA). Analyser les \u00e9carts prix/offre/positionnement et d\u00e9cider si adaptation n\u00e9cessaire.`,
      operations: (a, prof, day) =>
        `Directive op\u00e9rationnelle. ${num(a.enriched_competitor_count)} concurrents ont une offre document\u00e9e. Comparer avec notre mix produit (${num(a.client_product_count)} r\u00e9f\u00e9rences). Identifier gaps et opportunit\u00e9s de diff\u00e9renciation.`,
    },
  },
];


// ─── INDEX / LOOKUP ──────────────────────────────────────────────────────────

export const ACTION_CARD_BY_TYPE = Object.fromEntries(
  ACTION_CARD_SPECS.map(spec => [spec.action_type, spec])
);

export const ACTION_CARD_BY_EXISTING_KEY = Object.fromEntries(
  ACTION_CARD_SPECS
    .filter(s => s.existing_template_key)
    .map(s => [s.existing_template_key!, s])
);


// ─── SUMMARY STATS ───────────────────────────────────────────────────────────

/*
  Total: 36 action types
  
  By card_type:
    action: 28
    notification: 8 (#10 score_driver_shift, #21 score_down, #22 regime_change,
                      #23 medal_change, #25 mega_event_end, #30 competitor_hours_change)
  
  By category:
    URGENT: 3 (#6, #17, #27)
    CONCURRENCE: 10 (#1, #5, #7, #15, #26, #28, #31, #33, plus #27 is CONCURRENCE but URGENT color)
    MÉTÉO: 4 (#9, #12, #13)
    OPPORTUNITÉ: 11 (#2, #3, #4, #8, #11, #14, #19, #20, #29, #32, #34)
    INTELLIGENCE: 7 (#10, #16, #22, #23, #24, #25, #35, #36)
    PLANIFICATION: 1 (#18)
  
  Fields with missing_fields (not yet in schema):
    - consecutive_bad_days: #2, #9
    - disruption_description/duration: #17, #18, #19
    - audience_overlap_pct, threat_level: #27
    - review_count, rating, old_rating, new_rating: #28, #29
    - old_hours, new_hours: #30
    - offering_description: #31
    - content_count, baseline_content_count: #33
    - days_silent: #34
    - campaign_name: #35
    - media_source, mention_topic: #36
  
  Existing BRIEF_TEMPLATES mapped:
    _weather_window → #2
    _best_day → #3
    _audience_mismatch → #4 (inverse framing)
    _same_bucket_saturation → #1 (partial)
    _extended_bad_weather → #9
    _low_competition → #8
    _weekend_vacation → #11
    _mobility_comp_squeeze → #17 (partial)
*/
