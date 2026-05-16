/**
 * ACTION CARDS v2 — Muse Square Insight
 *
 * Single source of truth for action card branding, personalized sowhat,
 * draft seeds per channel, and Agir dropdown rendering.
 *
 * Architecture:
 *   - API returns { action_type, action_priority, action_category, data_payload }
 *   - This file does ALL rendering using full day_surface + location_context
 *   - No headline_fr / detail_fr from dbt — everything computed client-side
 *
 * Exposes:
 *   window.ACTION_CARDS        — lookup by action_type
 *   window.renderActionCandidates(candidates, prof, day, selectedDate, mode, channelConfig)
 *   window.getActionCandidateTypes(candidates, selectedDate)
 *   window.getDraftSeed(actionType, channel, feedItem, prof, day)
 *   window.getAvailableChannels(actionType, prof, channelConfig)
 */
(function() {
  'use strict';

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  function pct(v) { return v != null ? Math.round(Number(v)) + '%' : ''; }
  function num(v) { return v != null ? String(Math.round(Number(v))) : ''; }
  function temp(v) { return v != null ? Math.round(Number(v)) + '\u00b0C' : ''; }
  function ratio(v) { return v != null ? '\u00d7' + Number(v).toFixed(1) : ''; }
  function siteName(p) { return p.site_name || p.location_label || 'votre site'; }
  function isOutdoor(p) {
    var t = String(p.location_type || p.cl_location_type || p.location_type_client || '').toLowerCase();
    return t === 'outdoor' || t === 'mixed';
  }
  function weatherSens(p) { return Number(p.weather_sensitivity || 0) >= 3; }

  var AUD_FR = {local:'r\u00e9sidents locaux',professionals:'professionnels',tourists:'touristes',students:'\u00e9tudiants',families:'familles',seniors:'seniors',mixed:'public mixte'};
  var EVT_FR = {corporate:'\u00e9v\u00e9nements corporate',product_launch:'lancements produit',store_opening:'ouvertures de point de vente',concert:'concerts',press_conf:'conf\u00e9rences de presse',expo:'expositions',tasting:'d\u00e9gustations',open_day:'journ\u00e9es portes ouvertes',launch_party:'soir\u00e9es de lancement',promo:'promotions'};
  var THREAT_FR = {high:'\u00e9lev\u00e9e',medium:'mod\u00e9r\u00e9e',low:'faible'};
  var OBJ_FR = {maximize_attendance:'maximiser l\u2019affluence',avoid_competition:'\u00e9viter la concurrence',brand_awareness:'notori\u00e9t\u00e9'};

  function audLabel(p) {
    var a1 = AUD_FR[p.primary_audience_1] || '';
    var a2 = AUD_FR[p.primary_audience_2] || '';
    return a1 + (a2 ? ', ' + a2 : '');
  }
  function evLabel(p) {
    var types = [p.event_type_1, p.event_type_2, p.event_type_3].filter(Boolean);
    return types.map(function(t) { return EVT_FR[t] || t; }).join(', ');
  }
  function objLabel(p) { return OBJ_FR[p.main_event_objective] || ''; }
  function todayHours(p) {
    try {
      var h = typeof p.operating_hours === 'string' ? JSON.parse(p.operating_hours) : p.operating_hours;
      if (!h) return '';
      var days = ['dim','lun','mar','mer','jeu','ven','sam'];
      var today = days[new Date().getDay()];
      if (h[today] && h[today].open) return h[today].open + '\u2013' + h[today].close;
    } catch(e) {}
    return '';
  }

  function hazardLabel(d) {
    if (Number(d.lvl_snow || 0) >= 2) return 'neige';
    if (Number(d.lvl_rain || 0) >= 2) return 'fortes pluies';
    if (Number(d.lvl_wind || 0) >= 2) return 'vent fort';
    if (Number(d.lvl_heat || 0) >= 2) return 'canicule';
    if (Number(d.lvl_cold || 0) >= 2) return 'grand froid';
    if (Number(d.lvl_rain || 0) >= 1) return 'pluie';
    if (Number(d.lvl_wind || 0) >= 1) return 'vent';
    return 'alerte m\u00e9t\u00e9o';
  }

  function topComp(d) {
    var tc = d.top_competitors || d.top_competition_events;
    return (Array.isArray(tc) && tc.length > 0) ? (tc[0].e || tc[0]) : {};
  }

  function cfEntry(d, sub) {
    var feed = d.change_feed || d.all_feed || [];
    if (!Array.isArray(feed)) return {};
    for (var i = 0; i < feed.length; i++) {
      if (feed[i].change_type === sub || feed[i].change_subtype === sub) return feed[i];
    }
    return {};
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function crawled(p) {
    if (p._crawled) return p._crawled;
    try {
      var raw = p.auto_enriched_description;
      if (!raw) return (p._crawled = {});
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      p._crawled = obj || {};
      return p._crawled;
    } catch(e) { return (p._crawled = {}); }
  }
  function crawledDesc(p) { return crawled(p).business_description || p.business_short_description || ''; }
  function crawledDiff(p) { return crawled(p).key_differentiators || ''; }
  function crawledAudience(p) { return crawled(p).target_audience || ''; }
  function crawledOffering(p) { return crawled(p).current_offering || ''; }
  function crawledEvents(p) { return crawled(p).event_examples || ''; }
  function crawledTone(p) { return crawled(p).tone_of_voice || ''; }
  function crawledBrand(p) { return crawled(p).brand_positioning || ''; }

  // Truncate with ellipsis
  function trunc(s, n) { return s.length > n ? s.substring(0, n) + '\u2026' : s; }

  // User differentiator — best available string from crawled or profile
  function userEdge(p) {
    return crawledDiff(p) || crawledOffering(p) || crawledDesc(p) || evLabel(p) || '';
  }

  function transitInfo(p) {
    var name = p.nearest_transit_stop_name || '';
    var line = Array.isArray(p.nearest_transit_line_name)
      ? p.nearest_transit_line_name.join(', ')
      : (p.nearest_transit_line_name || '');
    var dist = p.nearest_transit_stop_distance_m
      ? Math.round(Number(p.nearest_transit_stop_distance_m)) + 'm'
      : '';
    if (!name) return '';
    return name + (line ? ' (ligne ' + line + ')' : '') + (dist ? ', ' + dist : '');
  }

  function distLabel(m) {
    if (!m) return '';
    var v = Number(m);
    return v >= 1000 ? (v / 1000).toFixed(1) + ' km' : Math.round(v) + 'm';
  }

  // ─── SPEC REGISTRY ───────────────────────────────────────────────────────

  var SPECS = {};

  function reg(type, label, cat, icon, color, cardType, target, sowhatFn, draftSeeds) {
    SPECS[type] = {
      action_type: type,
      brand_label_fr: label,
      category_label_fr: cat,
      icon: icon,
      color: color,
      card_type: cardType,
      consulter_target: target,
      sowhat: sowhatFn,
      draft_seeds: draftSeeds || {}
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE-BASED (1–11)
  // ═══════════════════════════════════════════════════════════════════════════

  // #1 — high_competition_density
  reg('high_competition_density', 'Forte pression', 'CONCURRENCE', '\u2694\ufe0f', '#D32F2F', 'action', 'pulse#carte',
    function(a, p, d) {
      var n = Number(d.events_within_5km_count || 0);
      var same = Number(d.events_within_5km_same_bucket_count || 0);
      var pr = Number(d.competition_pressure_ratio || 0);
      var samePct = same > 0 && n > 0 ? Math.round(same / n * 100) : 0;
      var edge = userEdge(p);
      var aud = audLabel(p);
      var line = n + ' \u00e9v\u00e9nements \u00e0 5 km';
      if (same > 0) line += ' dont ' + same + ' dans votre secteur (' + samePct + '%)';
      line += '. Pression \u00d7' + pr.toFixed(1) + ' vs normale.';
      if (edge) line += ' Votre atout : ' + trunc(edge, 120) + '.';
      if (aud) line += ' Votre cible (' + aud + ') est sollicit\u00e9e par ' + same + ' concurrents directs.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. ' + num(d.events_within_5km_count) + ' \u00e9v\u00e9nements concurrents \u00e0 5 km. Mettre en avant : ' + (userEdge(p) || 'votre offre unique') + '. Ton direct, local. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Forte concurrence. Inclure horaires : ' + todayHours(p) + '. Acc\u00e8s : ' + (p.nearest_transit_stop_name ? 'station ' + p.nearest_transit_stop_name : 'votre adresse') + '. Diff\u00e9renciant : ' + (userEdge(p) || '') + '.'; },
      email: function(a, p, d) { return 'Email pour ' + siteName(p) + '. Objet : pourquoi nous choisir aujourd\u2019hui. ' + num(d.events_within_5km_count) + ' \u00e9v\u00e9nements autour, voici ce qui nous rend unique : ' + (userEdge(p) || '') + '.'; },
      note_interne: function(a, p, d) { return 'Note interne. Forte densit\u00e9 : ' + num(d.events_within_5km_count) + ' \u00e9v\u00e9nements \u00e0 5 km, pression \u00d7' + Number(d.competition_pressure_ratio||0).toFixed(1) + '. Diff\u00e9renciant : ' + (userEdge(p) || '\u00e0 d\u00e9finir') + '. Renforcer accueil et signal\u00e9tique.'; }
    }
  );

  // #2 — weather_window
  reg('weather_window', '\u00c9claircie', 'OPPORTUNIT\u00c9', '\u2600\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var prevBad = a.prevBadDays || a.consecutive_bad_days || '2+';
      var t = temp(d.temperature_2m_max);
      var offering = crawledOffering(p);
      var line = 'Apr\u00e8s ' + prevBad + 'j de mauvais temps, retour au beau : ' + (d.weather_label_fr || 'am\u00e9lioration');
      if (t) line += ', ' + t;
      line += '.';
      if (weatherSens(p)) line += ' Sensibilit\u00e9 m\u00e9t\u00e9o \u00e9lev\u00e9e (' + p.weather_sensitivity + '/5) \u2014 impact direct sur votre fr\u00e9quentation.';
      if (isOutdoor(p)) line += ' Espace mixte/ext\u00e9rieur \u2014 vos visiteurs reviennent.';
      if (offering) line += ' Mettez en avant : ' + trunc(offering, 80) + '.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Le beau temps revient \u2014 ' + temp(d.temperature_2m_max) + '. Inviter les visiteurs. Mettre en avant : ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Retour du beau temps. Horaires : ' + todayHours(p) + '. Acc\u00e8s : ' + (p.nearest_transit_stop_name || '') + '. Diff\u00e9renciant : ' + (userEdge(p) || '') + '.'; },
      note_interne: function(a, p, d) { return 'Note interne. Fen\u00eatre m\u00e9t\u00e9o apr\u00e8s ' + (a.prevBadDays || '2+') + 'j de mauvais temps. Pr\u00e9voir affluence.' + (Number(p.venue_capacity) > 0 ? ' Capacit\u00e9 : ' + p.venue_capacity + '.' : ''); }
    }
  );

  // #3 — top_day_approaching
  reg('top_day_approaching', 'Meilleur jour', 'OPPORTUNIT\u00c9', '\u2b50', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var score = num(d.opportunity_score_final_local);
      var comp = Number(d.events_within_5km_count || 0);
      var pr = Number(d.competition_pressure_ratio || 0);
      var alert = Number(d.alert_level_max || 0);
      var parts = ['Score ' + score + '/10'];
      if (alert === 0) parts.push('m\u00e9t\u00e9o favorable');
      else if (alert <= 1) parts.push('m\u00e9t\u00e9o acceptable');
      if (pr > 0 && pr < 0.8) parts.push('concurrence faible (' + comp + ' \u00e9v\u00e9n. \u00e0 5 km)');
      else if (pr >= 1.2) parts.push('concurrence \u00e9lev\u00e9e (' + comp + ' \u00e9v\u00e9n.)');
      else if (comp > 0) parts.push(comp + ' \u00e9v\u00e9nements \u00e0 5 km');
      if (d.holiday_name) parts.push(d.holiday_name);
      if (d.vacation_name) parts.push(d.vacation_name);
      var offering = crawledOffering(p) || crawledDesc(p);
      var actionHint = '';
      if (offering) actionHint = ' Mettez en avant : ' + trunc(offering, 100) + '.';
      else { var ev = evLabel(p); if (ev) actionHint = ' Id\u00e9al pour planifier un ' + ev.split(',')[0].trim() + '.'; }
      var obj = p.main_event_objective === 'maximize_attendance' ? ' Objectif affluence \u2014 toutes les conditions sont align\u00e9es.' : p.main_event_objective === 'avoid_competition' ? ' Fen\u00eatre id\u00e9ale pour \u00e9viter la concurrence.' : '';
      return parts.join(' \u00b7 ') + '. Meilleur jour de votre fen\u00eatre.' + actionHint + obj;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Meilleur jour de la semaine, score ' + num(d.opportunity_score_final_local) + '/10. Mettre en avant : ' + (userEdge(p) || 'votre programmation') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Meilleur jour. Horaires : ' + todayHours(p) + '. Diff\u00e9renciant : ' + (userEdge(p) || '') + '.'; },
      note_interne: function(a, p, d) { return 'Note interne. Meilleur jour : score ' + num(d.opportunity_score_final_local) + '/10. Renforcer accueil.' + (Number(p.venue_capacity) > 0 ? ' Capacit\u00e9 max : ' + p.venue_capacity + '.' : ''); }
    }
  );

  // #4 — audience_shift_opportunity
  reg('audience_shift_opportunity', 'Nouvelle audience', 'OPPORTUNIT\u00c9', '\ud83d\udc65', '#1565C0', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var trigger = d.holiday_name || d.vacation_name || ((d.commercial_events && d.commercial_events[0]) ? d.commercial_events[0].event_name : null) || null;
      var delta = Number(d.delta_att_calendar_pct || 0);
      var aud = audLabel(p);
      var crawledAud = crawledAudience(p);
      var h = todayHours(p);
      var line = '';
      if (trigger && delta > 0) {
        line = trigger + ' : +' + Math.round(delta) + '% de trafic attendu.';
        if (aud) line += ' Votre cible (' + aud + ') est disponible.';
        if (crawledAud) line += ' Votre audience selon votre site : ' + trunc(crawledAud, 120) + '.';
        if (h) line += ' Ouvert ' + h + '.';
      } else if (trigger && delta < 0) {
        line = trigger + ' : ' + Math.round(delta) + '% de trafic.';
        if (aud) line += ' Vos ' + aud.split(',')[0] + ' sont moins disponibles.';
        if (p.main_event_objective === 'maximize_attendance') line += ' Objectif affluence compromis \u2014 adaptez vos effectifs.';
      } else if (trigger) {
        line = trigger + '.';
        if (aud) line += ' Public du jour diff\u00e9rent de vos ' + aud.split(',')[0] + ' habituels.';
        if (crawledAud) line += ' Votre site cible : ' + trunc(crawledAud, 100) + '.';
      } else {
        line = 'Changement d\u2019audience d\u00e9tect\u00e9.';
        if (aud) line += ' Vos ' + aud.split(',')[0] + ' se m\u00e9langent avec de nouveaux visiteurs.';
      }
      return line;
    },
    {
      instagram: function(a, p, d) { var trigger = d.holiday_name || d.vacation_name || ''; return 'Post Instagram pour ' + siteName(p) + '. ' + trigger + ' change le profil des visiteurs. Adapter pour ' + (audLabel(p) || 'votre public') + ' et les nouveaux. Mettre en avant : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { var trigger = d.holiday_name || d.vacation_name || ''; return 'Post Facebook pour ' + siteName(p) + '. ' + trigger + ' \u2014 nouveau mix d\u2019audience. D\u00e9tails pratiques + ' + (userEdge(p) || '') + '.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour page d\u2019accueil. Adapter le message au contexte calendaire. Mettre en avant l\u2019offre pour le nouveau public.'; }
    }
  );

  // #5 — competitor_threat_direct
  reg('competitor_threat_direct', 'Menace directe', 'CONCURRENCE', '\ud83d\udea8', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var c = topComp(d);
      var name = c.organizer_name || a.competitor_name || 'Concurrent';
      var event = c.event_label || a.event_label || '';
      var dist = distLabel(a.distance_m || c.distance_m);
      var edge = userEdge(p);
      var line = name;
      if (event) line += ' \u2014 ' + event;
      if (dist) line += ', \u00e0 ' + dist;
      line += '.';
      if (edge) line += ' Votre diff\u00e9renciant face \u00e0 ce concurrent : ' + trunc(edge, 100) + '.';
      var aud = audLabel(p);
      if (aud) line += ' M\u00eame cible (' + aud + ') \u2014 risque de cannibalisation.';
      return line;
    },
    {
      instagram: function(a, p, d) { var c = topComp(d); return 'Post Instagram pour ' + siteName(p) + '. Concurrent actif (' + (c.organizer_name || 'proche') + '). Se diff\u00e9rencier avec : ' + (userEdge(p) || 'votre offre') + '. Ton confiant. Max 2200 car.'; },
      facebook: function(a, p, d) { var c = topComp(d); return 'Post Facebook pour ' + siteName(p) + '. Concurrent (' + (c.organizer_name || '') + ') m\u00eame jour. Positionnement unique + horaires + acc\u00e8s.'; },
      note_interne: function(a, p, d) { var c = topComp(d); return 'Note interne. Menace directe : ' + (c.organizer_name || 'concurrent') + ' \u00e0 ' + distLabel(c.distance_m) + '. Diff\u00e9renciant : ' + (userEdge(p) || '\u00e0 d\u00e9finir') + '. D\u00e9cision : renforcer comm ou adapter offre.'; }
    }
  );

  // #6 — regime_c_warning
  reg('regime_c_warning', 'R\u00e9gime C', 'URGENT', '\u26a0\ufe0f', '#B71C1C', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var score = num(d.opportunity_score_final_local);
      var driver = d.primary_score_driver_label_fr || '';
      var comp = Number(d.events_within_5km_count || 0);
      var forced = d.is_forced_regime_c_flag ? ' (forc\u00e9)' : '';
      var line = 'R\u00e9gime C' + forced + ' \u2014 score ' + score + '/10.';
      if (driver) line += ' Facteur : ' + driver + '.';
      if (comp > 0) line += ' ' + comp + ' \u00e9v\u00e9nements \u00e0 5 km.';
      if (weatherSens(p) && Number(d.alert_level_max || 0) >= 2) line += ' Sensibilit\u00e9 m\u00e9t\u00e9o \u00e9lev\u00e9e \u2014 double risque.';
      if (p.main_event_objective === 'maximize_attendance') line += ' Objectif affluence compromis \u2014 r\u00e9duisez les co\u00fbts ou reportez.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. R\u00e9gime C, score ' + num(d.opportunity_score_final_local) + '/10. Facteur : ' + (d.primary_score_driver_label_fr || '') + '. ' + num(d.events_within_5km_count) + ' \u00e9v\u00e9nements \u00e0 5 km. D\u00e9cisions : effectif, horaires, publications.'; },
      email: function(a, p, d) { return 'Email interne ' + siteName(p) + '. Objet : Alerte R\u00e9gime C. Score ' + num(d.opportunity_score_final_local) + '/10, facteur ' + (d.primary_score_driver_label_fr || '') + '. Actions \u00e0 discuter.'; },
      slack: function(a, p, d) { return 'Alerte R\u00e9gime C pour ' + siteName(p) + '. Score ' + num(d.opportunity_score_final_local) + '/10. Facteur : ' + (d.primary_score_driver_label_fr || '') + '. \u00c0 traiter en priorit\u00e9.'; }
    }
  );

  // #7 — competition_proximity
  reg('competition_proximity', 'Concurrence proche', 'CONCURRENCE', '\ud83d\udccd', '#E65100', 'action', 'pulse#carte',
    function(a, p, d) {
      var n500 = Number(d.events_within_500m_count || 0);
      var n1k = Number(d.events_within_1km_count || 0);
      var ci = Number(d.concentration_index_score || 0);
      var c = topComp(d);
      var nearest = c.organizer_name || c.event_label || '';
      var nearestDist = c.distance_m ? Number(c.distance_m) : 0;
      var edge = userEdge(p);
      var parts = [];
      if (n500 > 0) parts.push(n500 + ' \u00e9v\u00e9nement' + (n500 > 1 ? 's' : '') + ' \u00e0 moins de 500 m');
      if (n1k > 0) parts.push(n1k + ' \u00e0 1 km');
      var density = ci >= 0.5 ? 'Concentration tr\u00e8s \u00e9lev\u00e9e' : ci >= 0.3 ? 'Concentration \u00e9lev\u00e9e' : ci >= 0.15 ? 'Concentration mod\u00e9r\u00e9e' : 'Concentration faible';
      var line = parts.length > 0 ? parts.join(', ') + '. ' : '';
      line += density + ' autour de ' + siteName(p) + '.';
      if (nearest && nearestDist > 0) line += ' Le plus proche : ' + nearest + ' \u00e0 ' + distLabel(nearestDist) + '.';
      if (edge) line += ' Votre atout face \u00e0 cette densit\u00e9 : ' + trunc(edge, 100) + '.';
      if (isOutdoor(p) && n500 >= 3) line += ' Espace mixte \u2014 votre visibilit\u00e9 ext\u00e9rieure est critique.';
      if (p.nearest_transit_stop_name) line += ' Acc\u00e8s pi\u00e9ton via ' + p.nearest_transit_stop_name + ' (' + Math.round(Number(p.nearest_transit_stop_distance_m || 0)) + 'm).';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Forte activit\u00e9 autour de vous. Rappeler votre localisation et : ' + (userEdge(p) || 'ce qui vous rend unique') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + num(d.events_within_500m_count) + ' \u00e9v\u00e9nements \u00e0 500 m, ' + num(d.events_within_1km_count) + ' \u00e0 1 km. Diff\u00e9renciant : ' + (userEdge(p) || '\u00e0 d\u00e9finir') + '. Renforcer accueil.'; }
    }
  );

  // #8 — low_competition_window
  reg('low_competition_window', 'Fen\u00eatre calme', 'OPPORTUNIT\u00c9', '\ud83d\udfe2', '#2E7D32', 'action', 'pulse#carte',
    function(a, p, d) {
      var pr = Number(d.competition_pressure_ratio || 0);
      var n = Number(d.events_within_5km_count || 0);
      var score = num(d.opportunity_score_final_local);
      var edge = userEdge(p);
      var line = 'Pression concurrentielle faible (\u00d7' + pr.toFixed(1) + ') \u2014 ' + n + ' \u00e9v\u00e9nements \u00e0 5 km. Score ' + score + '/10.';
      line += ' C\u2019est le moment de communiquer \u2014 moins de bruit, plus de visibilit\u00e9.';
      if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Peu de concurrence \u2014 moment id\u00e9al pour \u00eatre visible. Mettre en avant : ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Journ\u00e9e calme, publiez maintenant. Horaires : ' + todayHours(p) + '. Acc\u00e8s et offre.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Offre du jour, horaires. Max 1500 car.'; }
    }
  );

  // #9 — extended_bad_weather
  reg('extended_bad_weather', 'M\u00e9t\u00e9o prolong\u00e9e', 'M\u00c9T\u00c9O', '\ud83c\udf27\ufe0f', '#E65100', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var days = a.consecutive_bad_days || a.prevBadDays || '2+';
      var weather = d.weather_label_fr || '';
      var t = temp(d.temperature_2m_max);
      var wind = Number(d.wind_speed_10m_max || 0);
      var impactRaw = Number(d.impact_weather_pct || 0);
      var line = days + 'j cons\u00e9cutifs de mauvais temps. ' + weather;
      if (t) line += ', ' + t;
      if (wind > 0) line += ', vent ' + Math.round(wind) + ' km/h';
      line += '.';
      if (impactRaw !== 0) line += ' Impact fr\u00e9quentation estim\u00e9 : ' + Math.round(impactRaw) + '%.';
      if (weatherSens(p)) line += ' Site sensible m\u00e9t\u00e9o (' + p.weather_sensitivity + '/5) \u2014 impact renforc\u00e9.';
      if (isOutdoor(p)) line += ' Espace ext\u00e9rieur impact\u00e9 \u2014 communiquez sur votre offre int\u00e9rieure.';
      else line += ' Site couvert \u2014 positionnez-vous comme refuge.';
      return line;
    },
    {
      instagram: function(a, p, d) { return isOutdoor(p) ? 'Post Instagram pour ' + siteName(p) + '. Mauvais temps prolong\u00e9 \u2014 mettre en avant offre int\u00e9rieure. ' + (userEdge(p) || '') + '. Max 2200 car.' : 'Post Instagram pour ' + siteName(p) + '. Temps maussade, parfait pour d\u00e9couvrir ' + siteName(p) + '. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. M\u00e9t\u00e9o d\u00e9grad\u00e9e depuis ' + (a.consecutive_bad_days || '2+') + 'j. ' + (weatherSens(p) ? 'Site sensible \u2014 adapter effectif.' : 'Impact limit\u00e9 (couvert).'); }
    }
  );

  // #10 — score_driver_shift
  reg('score_driver_shift', 'Facteur dominant', 'INTELLIGENCE', '\ud83d\udd04', '#1565C0', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var cf = cfEntry(d, 'score_driver_shift');
      var from = cf.old_value || a.old_value || '';
      var to = d.primary_score_driver_label_fr || cf.new_value || a.new_value || '';
      var score = num(d.opportunity_score_final_local);
      var line = 'Le facteur de risque dominant a chang\u00e9';
      if (from && to) line += ' : ' + from + ' \u2192 ' + to;
      else if (to) line += ' : ' + to;
      line += '. Score ' + score + '/10.';
      if (to === 'Concurrence' || to === 'competition') { var edge = userEdge(p); if (edge) line += ' Votre atout : ' + trunc(edge, 80) + '.'; }
      if (to === 'M\u00e9t\u00e9o' || to === 'weather') { if (weatherSens(p)) line += ' Sensibilit\u00e9 m\u00e9t\u00e9o \u00e9lev\u00e9e \u2014 impact direct.'; }
      return line;
    },
    {
      note_interne: function(a, p, d) { var cf = cfEntry(d, 'score_driver_shift'); return 'Note interne. Facteur dominant : ' + (cf.old_value || '') + ' \u2192 ' + (d.primary_score_driver_label_fr || '') + '. Score ' + num(d.opportunity_score_final_local) + '/10. Adapter la priorit\u00e9.'; }
    }
  );

  // #11 — weekend_opportunity
  reg('weekend_opportunity', 'Week-end favorable', 'OPPORTUNIT\u00c9', '\ud83d\udcc5', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var score = num(d.opportunity_score_final_local);
      var comp = Number(d.events_within_5km_count || 0);
      var edge = userEdge(p);
      var line = 'Score ' + score + '/10. ' + (d.weather_label_fr || '') + ', ' + comp + ' \u00e9v\u00e9nements \u00e0 5 km.';
      line += ' Conditions favorables pour le week-end.';
      if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      var aud = audLabel(p); if (aud) line += ' Votre cible (' + aud + ') est disponible le week-end.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Week-end favorable, score ' + num(d.opportunity_score_final_local) + '/10. Mettre en avant : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Programme du week-end. Horaires : ' + todayHours(p) + '. ' + (userEdge(p) || '') + '.'; },
      note_interne: function(a, p, d) { return 'Note interne. Week-end favorable, score ' + num(d.opportunity_score_final_local) + '/10.' + (Number(p.venue_capacity) > 0 ? ' Capacit\u00e9 : ' + p.venue_capacity + '. Renforcer effectif.' : ' Renforcer effectif.'); }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANGE-FEED TRANSITIONS (12–36)
  // ═══════════════════════════════════════════════════════════════════════════

  // #12 — weather_hazard_onset
  reg('weather_hazard_onset', 'Alerte m\u00e9t\u00e9o', 'M\u00c9T\u00c9O', '\u26a1', '#E65100', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var hazard = hazardLabel(d);
      var level = Number(d.alert_level_max || 0);
      var levelFr = level >= 3 ? 'critique' : level >= 2 ? 's\u00e9v\u00e8re' : level >= 1 ? 'mod\u00e9r\u00e9' : 'faible';
      var tRange = '';
      if (d.temperature_2m_min != null && d.temperature_2m_max != null) tRange = temp(d.temperature_2m_min) + '\u2013' + temp(d.temperature_2m_max);
      var line = 'Alerte ' + hazard + ' (niveau ' + levelFr + ').';
      if (d.weather_label_fr) line += ' ' + d.weather_label_fr;
      if (tRange) line += ', ' + tRange;
      var precip = Number(d.precipitation_sum_mm || 0);
      if (precip > 0) line += ', ' + Math.round(precip) + 'mm';
      line += '.';
      if (weatherSens(p)) line += ' Votre site est sensible m\u00e9t\u00e9o (' + p.weather_sensitivity + '/5) \u2014 pr\u00e9parez-vous.';
      if (isOutdoor(p)) line += ' Espace ext\u00e9rieur \u2014 s\u00e9curisez les installations.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Alerte ' + hazardLabel(d) + '. ' + (isOutdoor(p) ? 'Alternatives couvertes.' : 'Accueil normal.') + ' Max 2200 car.'; },
      website: function(a, p, d) { return 'Banni\u00e8re alerte m\u00e9t\u00e9o. ' + hazardLabel(d) + '. Informer sur adaptations.'; },
      note_interne: function(a, p, d) { return 'Note interne. Alerte ' + hazardLabel(d) + ' niveau ' + num(d.alert_level_max) + '. ' + (weatherSens(p) ? 'Site sensible \u2014 adapter effectif, programme, s\u00e9curit\u00e9.' : 'Impact limit\u00e9 mais informer l\u2019\u00e9quipe.'); }
    }
  );

  // #13 — weather_worsened
  reg('weather_worsened', 'M\u00e9t\u00e9o d\u00e9grad\u00e9e', 'M\u00c9T\u00c9O', '\ud83c\udf26\ufe0f', '#E65100', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var weather = d.weather_label_fr || '';
      var impactRaw = Number(d.impact_weather_pct || 0);
      var delta = Number(d.delta_att_weather_total_pct || 0);
      var line = weather + '.';
      if (impactRaw !== 0) line += ' Impact fr\u00e9quentation : ' + Math.round(impactRaw) + '%.';
      if (delta !== 0) line += ' Variation : ' + (delta > 0 ? '+' : '') + Math.round(delta) + '%.';
      if (weatherSens(p)) line += ' Sensibilit\u00e9 m\u00e9t\u00e9o \u00e9lev\u00e9e (' + p.weather_sensitivity + '/5).';
      if (isOutdoor(p)) line += ' Espace ext\u00e9rieur impact\u00e9 \u2014 adaptez votre offre.';
      var edge = userEdge(p); if (edge && isOutdoor(p)) line += ' Mettez en avant votre offre couverte.';
      return line;
    },
    {
      instagram: function(a, p, d) { return isOutdoor(p) ? 'Post Instagram pour ' + siteName(p) + '. M\u00e9t\u00e9o d\u00e9grad\u00e9e \u2014 offre int\u00e9rieure. Max 2200 car.' : 'Post Instagram pour ' + siteName(p) + '. M\u00e9t\u00e9o d\u00e9grad\u00e9e mais accueil normal. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. M\u00e9t\u00e9o d\u00e9grad\u00e9e : ' + (d.weather_label_fr || '') + '. ' + (weatherSens(p) ? 'Adapter effectif et programme.' : 'Pas d\u2019action imm\u00e9diate.'); }
    }
  );

  // #14 — weather_improved
  reg('weather_improved', 'M\u00e9t\u00e9o am\u00e9lior\u00e9e', 'OPPORTUNIT\u00c9', '\ud83c\udf24\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var weather = d.weather_label_fr || '';
      var t = temp(d.temperature_2m_max);
      var delta = Number(d.delta_att_weather_total_pct || 0);
      var line = weather;
      if (t) line += ', ' + t;
      line += '.';
      if (delta > 0) line += ' Hausse de fr\u00e9quentation attendue : +' + Math.round(delta) + '%.';
      if (isOutdoor(p)) line += ' Espace ext\u00e9rieur de nouveau accessible.';
      var edge = userEdge(p); if (edge) line += ' Moment id\u00e9al pour communiquer : ' + trunc(edge, 80) + '.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Le temps s\u2019am\u00e9liore \u2014 ' + (d.weather_label_fr || '') + '. Inviter les visiteurs. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Am\u00e9lioration m\u00e9t\u00e9o. Horaires : ' + todayHours(p) + '. Acc\u00e8s et offre.'; }
    }
  );

  // #15 — competition_pressure_spike
  reg('competition_pressure_spike', 'Pic de pression', 'CONCURRENCE', '\ud83d\udcc8', '#D32F2F', 'action', 'pulse#carte',
    function(a, p, d) {
      var cf = cfEntry(d, 'competition_pressure_spike');
      var oldR = Number(cf.old_value || 0);
      var newR = Number(d.competition_pressure_ratio || 0);
      var n = Number(d.events_within_5km_count || 0);
      var same = Number(d.events_within_5km_same_bucket_count || 0);
      var edge = userEdge(p);
      var line = 'Pression en hausse';
      if (oldR > 0) line += ' : \u00d7' + oldR.toFixed(1) + ' \u2192 \u00d7' + newR.toFixed(1);
      else line += ' : \u00d7' + newR.toFixed(1);
      line += '. ' + n + ' \u00e9v\u00e9nements \u00e0 5 km';
      if (same > 0) line += ', ' + same + ' dans votre secteur';
      line += '.';
      if (edge) line += ' D\u00e9marquez-vous avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Hausse de concurrence. Se d\u00e9marquer avec : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Pic de pression \u00d7' + Number(d.competition_pressure_ratio||0).toFixed(1) + '. ' + num(d.events_within_5km_count) + ' \u00e9v\u00e9nements \u00e0 5 km. Renforcer comm.'; }
    }
  );

  // #16 — calendar_audience_shift
  reg('calendar_audience_shift', 'Contexte calendaire', 'INTELLIGENCE', '\ud83d\uddd3\ufe0f', '#1565C0', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var trigger = d.holiday_name || d.vacation_name || ((d.commercial_events && d.commercial_events[0]) ? d.commercial_events[0].event_name : null) || 'changement calendaire';
      var audience = d.audience_availability_label || '';
      var delta = Number(d.delta_att_calendar_pct || 0);
      var aud = audLabel(p);
      var line = trigger;
      if (audience) line += ' \u2014 ' + audience;
      if (delta !== 0) line += ' (' + (delta > 0 ? '+' : '') + Math.round(delta) + '%)';
      line += '.';
      if (aud) line += ' Votre cible (' + aud + ') ' + (delta >= 0 ? 'est disponible.' : 'est moins pr\u00e9sente.');
      var crawledAud = crawledAudience(p); if (crawledAud) line += ' Votre site cible : ' + trunc(crawledAud, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { var trigger = d.holiday_name || d.vacation_name || ''; return 'Post Instagram pour ' + siteName(p) + '. ' + trigger + '. Adapter pour ' + (audLabel(p) || 'visiteurs') + '. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour site web. Adapter au contexte : ' + (d.holiday_name || d.vacation_name || 'p\u00e9riode sp\u00e9ciale') + '.'; }
    }
  );

  // #17 — mobility_disruption
  reg('mobility_disruption', 'Perturbation acc\u00e8s', 'URGENT', '\ud83d\udea7', '#B71C1C', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var ti = transitInfo(p);
      var impactRaw = Number(d.delta_att_mobility_pct || 0);
      var line = 'Acc\u00e8s perturb\u00e9';
      if (ti) line += ' \u2014 ' + ti;
      line += '.';
      if (impactRaw !== 0) line += ' Impact mobilit\u00e9 : ' + Math.round(impactRaw) + '%.';
      if (p.location_access_pattern === 'walking' || p.location_access_pattern === 'public_transit') line += ' Vos visiteurs viennent \u00e0 pied/transports \u2014 impact direct.';
      var edge = userEdge(p); if (edge) line += ' Communiquez un itin\u00e9raire alternatif et mettez en avant : ' + trunc(edge, 60) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Perturbation acc\u00e8s' + (p.nearest_transit_stop_name ? ' (station ' + p.nearest_transit_stop_name + ')' : '') + '. Alternatives. Max 2200 car.'; },
      website: function(a, p, d) { return 'Banni\u00e8re alerte acc\u00e8s. Perturbation en cours. Itin\u00e9raire alternatif.'; },
      email: function(a, p, d) { return 'Email ' + siteName(p) + '. Info acc\u00e8s \u2014 perturbation. Alternatives et ouverture normale.'; },
      note_interne: function(a, p, d) { return 'Note urgente. Perturbation mobilit\u00e9. ' + (p.nearest_transit_stop_name ? 'Station ' + p.nearest_transit_stop_name + ' concern\u00e9e.' : '') + ' Pr\u00e9parer signal\u00e9tique alternatif.'; }
    }
  );

  // #18 — mobility_disruption_planned
  reg('mobility_disruption_planned', 'Travaux pr\u00e9vus', 'PLANIFICATION', '\ud83d\udea7', '#F57F17', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var ti = transitInfo(p);
      var impactRaw = Number(d.delta_att_mobility_pct || 0);
      var line = 'Travaux annonc\u00e9s';
      if (ti) line += ' \u2014 ' + ti;
      line += '.';
      if (impactRaw !== 0) line += ' Impact mobilit\u00e9 : ' + Math.round(impactRaw) + '%.';
      line += ' Anticipez la communication pour rediriger vos visiteurs.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Travaux pr\u00e9vus. Informer les visiteurs \u00e0 l\u2019avance. Max 2200 car.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour site web. Info travaux + itin\u00e9raire alternatif.'; },
      note_interne: function(a, p, d) { return 'Note interne. Travaux planifi\u00e9s. ' + (p.nearest_transit_stop_name ? 'Station ' + p.nearest_transit_stop_name + ' impact\u00e9e.' : '') + ' Anticiper signal\u00e9tique et comm.'; }
    }
  );

  // #19 — mobility_disruption_resolved
  reg('mobility_disruption_resolved', 'Acc\u00e8s r\u00e9tabli', 'OPPORTUNIT\u00c9', '\u2705', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var ti = transitInfo(p);
      var line = 'Acc\u00e8s r\u00e9tabli';
      if (ti) line += ' \u2014 ' + ti.split(',')[0] + ' de nouveau accessible';
      line += '.';
      var edge = userEdge(p); if (edge) line += ' Profitez-en pour communiquer : ' + trunc(edge, 80) + '.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Acc\u00e8s r\u00e9tabli. Inviter les visiteurs \u00e0 revenir. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      website: function(a, p, d) { return 'Retirer la banni\u00e8re alerte. Retour \u00e0 la normale.'; }
    }
  );

  // #20 — score_up
  reg('score_up', 'Score en hausse', 'OPPORTUNIT\u00c9', '\ud83d\udcc8', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var score = num(d.opportunity_score_final_local);
      var deltaRaw = Number(d.opportunity_score_vs_yesterday || 0);
      var driver = d.primary_score_driver_label_fr || '';
      var line = 'Score ' + score + '/10';
      if (deltaRaw > 0) line += ' (+' + Math.round(deltaRaw) + ' vs hier)';
      line += '.';
      if (driver) line += ' Facteur : ' + driver + '.';
      line += ' Conditions am\u00e9lior\u00e9es \u2014 c\u2019est le moment de communiquer.';
      var edge = userEdge(p); if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Conditions meilleures qu\u2019hier. Communiquer maintenant. ' + (userEdge(p) || '') + '. Max 2200 car.'; }
    }
  );

  // #21 — score_down
  reg('score_down', 'Score en baisse', 'INTELLIGENCE', '\ud83d\udcc9', '#D32F2F', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var score = num(d.opportunity_score_final_local);
      var deltaRaw = Number(d.opportunity_score_vs_yesterday || 0);
      var driver = d.primary_score_driver_label_fr || '';
      var line = 'Score ' + score + '/10';
      if (deltaRaw < 0) line += ' (' + Math.round(deltaRaw) + ' vs hier)';
      line += '.';
      if (driver) line += ' Facteur : ' + driver + '.';
      if (p.main_event_objective === 'maximize_attendance') line += ' Objectif affluence \u2014 \u00e9valuez s\u2019il faut reporter vos publications.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne. Score en baisse : ' + num(d.opportunity_score_final_local) + '/10. Facteur : ' + (d.primary_score_driver_label_fr || '') + '. \u00c9valuer report publications ou r\u00e9duction effectif.'; }
    }
  );

  // #22 — regime_change
  reg('regime_change', 'Changement r\u00e9gime', 'INTELLIGENCE', '\ud83d\udd00', '#1565C0', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var cf = cfEntry(d, 'regime_change');
      var from = cf.old_value || a.old_value || '';
      var to = cf.new_value || d.opportunity_regime || a.new_value || '';
      var score = num(d.opportunity_score_final_local);
      var driver = d.primary_score_driver_label_fr || '';
      var line = 'R\u00e9gime';
      if (from && to) line += ' ' + from + ' \u2192 ' + to;
      else if (to) line += ' ' + to;
      line += '. Score ' + score + '/10';
      if (driver) line += ', facteur : ' + driver;
      line += '.';
      if (to === 'A') line += ' Conditions tr\u00e8s favorables \u2014 communiquez maintenant.';
      else if (to === 'C') line += ' Conditions d\u00e9favorables \u2014 r\u00e9duisez vos co\u00fbts.';
      return line;
    },
    {}
  );

  // #23 — medal_change
  reg('medal_change', 'Changement m\u00e9daille', 'INTELLIGENCE', '\ud83c\udfc5', '#1565C0', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var cf = cfEntry(d, 'medal_change');
      var from = cf.old_value || a.old_value || '';
      var to = cf.new_value || d.opportunity_medal || a.new_value || '';
      var score = num(d.opportunity_score_final_local);
      var line = 'M\u00e9daille';
      if (from && to) line += ' ' + from + ' \u2192 ' + to;
      else if (to) line += ' ' + to;
      line += '. Score ' + score + '/10.';
      if (to === 'A') line += ' Journ\u00e9e de haut niveau \u2014 maximisez votre visibilit\u00e9.';
      return line;
    },
    {}
  );

  // #24 — mega_event_activation
  reg('mega_event_activation', 'M\u00e9ga-\u00e9v\u00e9nement', 'INTELLIGENCE', '\ud83c\udfdf\ufe0f', '#1565C0', 'action', 'pulse#carte',
    function(a, p, d) {
      var c = topComp(d);
      var event = c.event_label || a.event_label || 'M\u00e9ga-\u00e9v\u00e9nement';
      var attendance = c.estimated_attendance ? num(c.estimated_attendance) + ' visiteurs attendus' : '';
      var dist = distLabel(c.distance_m || a.distance_m);
      var edge = userEdge(p);
      var line = event;
      if (dist) line += ' \u00e0 ' + dist;
      if (attendance) line += ' \u2014 ' + attendance;
      line += '.';
      line += ' Afflux de visiteurs dans votre zone.';
      if (edge) line += ' Captez ce trafic en mettant en avant : ' + trunc(edge, 80) + '.';
      var aud = audLabel(p); if (aud) line += ' Votre cible (' + aud + ') sera pr\u00e9sente.';
      return line;
    },
    {
      instagram: function(a, p, d) { var c = topComp(d); return 'Post Instagram pour ' + siteName(p) + '. M\u00e9ga-\u00e9v\u00e9nement (' + (c.event_label || '') + ') dans votre zone. Profiter de l\u2019afflux. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { var c = topComp(d); return 'Note interne. M\u00e9ga-\u00e9v\u00e9nement : ' + (c.event_label || '') + (c.estimated_attendance ? ', ' + num(c.estimated_attendance) + ' visiteurs' : '') + '. Renforcer accueil et signal\u00e9tique.'; }
    }
  );

  // #25 — mega_event_end
  reg('mega_event_end', 'Fin m\u00e9ga-\u00e9v\u00e9nement', 'INTELLIGENCE', '\ud83c\udfc1', '#1565C0', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var pr = Number(d.competition_pressure_ratio || 0);
      var line = 'M\u00e9ga-\u00e9v\u00e9nement termin\u00e9. Retour au rythme normal.';
      if (pr > 0) line += ' Pression concurrentielle : \u00d7' + pr.toFixed(1) + '.';
      if (pr < 1) line += ' Fen\u00eatre favorable \u2014 profitez-en pour communiquer.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne. M\u00e9ga-\u00e9v\u00e9nement termin\u00e9. Pression \u00d7' + Number(d.competition_pressure_ratio||0).toFixed(1) + '. Ajuster effectif.'; }
    }
  );

  // #26 — competitor_event_launch
  reg('competitor_event_launch', 'Lancement concurrent', 'CONCURRENCE', '\ud83d\udce3', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var c = topComp(d);
      var name = c.organizer_name || a.competitor_name || 'Concurrent';
      var event = c.event_label || a.event_label || '';
      var dist = distLabel(a.distance_m || c.distance_m);
      var sd = c.event_start_date; var ed = c.event_end_date;
      if (sd && typeof sd === 'object') sd = sd.value || String(sd);
      if (ed && typeof ed === 'object') ed = ed.value || String(ed);
      var dates = (sd && ed) ? 'du ' + String(sd).slice(0,10) + ' au ' + String(ed).slice(0,10) : '';
      var edge = userEdge(p);
      var line = name + ' lance ' + (event || 'un \u00e9v\u00e9nement');
      if (dist) line += ' \u00e0 ' + dist;
      if (dates) line += ', ' + dates;
      line += '.';
      if (edge) line += ' Votre r\u00e9ponse : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { var c = topComp(d); return 'Post Instagram pour ' + siteName(p) + '. Concurrent (' + (c.organizer_name || '') + ') lance un \u00e9v\u00e9nement. Affirmer : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { var c = topComp(d); return 'Note interne. ' + (c.organizer_name || 'Concurrent') + ' lance ' + (c.event_label || 'un \u00e9v\u00e9nement') + ' \u00e0 ' + distLabel(c.distance_m) + '. \u00c9valuer impact et r\u00e9ponse.'; }
    }
  );

  // #27 — competitor_audience_conflict
  reg('competitor_audience_conflict', 'Conflit audience', 'CONCURRENCE', '\ud83d\udea8', '#B71C1C', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || topComp(d).organizer_name || 'Concurrent';
      var aud = audLabel(p);
      var overlap = Number(a.audience_overlap_pct || 0);
      var threatRaw = a.threat_level || '';
      var threatFr = THREAT_FR[threatRaw] || threatRaw;
      var edge = userEdge(p);
      var line = name + ' cible votre audience' + (aud ? ' (' + aud + ')' : '') + '.';
      if (overlap > 0) line += ' Chevauchement : ' + overlap + '%.';
      if (threatFr) line += ' Menace ' + threatFr + '.';
      if (edge) line += ' Diff\u00e9renciez-vous avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Conflit audience avec un concurrent. Mettre en avant : ' + (userEdge(p) || 'votre offre unique') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Conflit audience avec ' + (a.competitor_name || 'un concurrent') + '. Audience : ' + (audLabel(p) || '') + '. Options : diff\u00e9rencier offre, adapter tarif, renforcer comm.'; }
    }
  );

  // #28 — competitor_review_surge
  reg('competitor_review_surge', 'Avis en hausse', 'CONCURRENCE', '\ud83d\udcac', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || '';
      var count = a.review_count || '';
      var rating = a.rating || '';
      var edge = userEdge(p);
      var line = name + ' accumule les avis positifs';
      if (count) line += ' (' + count + ' r\u00e9cents';
      if (rating) line += ', note ' + rating + '/5';
      if (count) line += ')';
      line += '. Attractivit\u00e9 en hausse.';
      if (edge) line += ' Votre r\u00e9ponse : sollicitez vos visiteurs pour des avis et mettez en avant ' + trunc(edge, 60) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Inviter vos visiteurs \u00e0 laisser un avis. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' accumule des avis (' + (a.review_count || '') + ' r\u00e9cents, ' + (a.rating || '') + '/5). Solliciter vos visiteurs pour des avis Google.'; }
    }
  );

  // #29 — competitor_review_drop
  reg('competitor_review_drop', 'Avis en baisse', 'OPPORTUNIT\u00c9', '\ud83d\udcac', '#2E7D32', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || '';
      var edge = userEdge(p);
      var line = name + ' \u2014 note pass\u00e9e de ' + (a.old_rating || '?') + ' \u00e0 ' + (a.new_rating || '?') + '/5. Visiteurs d\u00e9\u00e7us en recherche d\u2019alternative.';
      if (edge) line += ' Positionnez-vous : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Mettre en avant vos avis positifs et qualit\u00e9 d\u2019accueil. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour site web. Mettre en avant vos meilleurs t\u00e9moignages.'; }
    }
  );

  // #30 — competitor_hours_change
  reg('competitor_hours_change', 'Horaires modifi\u00e9s', 'CONCURRENCE', '\ud83d\udd52', '#E65100', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || '';
      var h = todayHours(p);
      var line = name + ' a chang\u00e9 ses horaires : ' + (a.old_hours || '?') + ' \u2192 ' + (a.new_hours || '?') + '.';
      if (h) line += ' Vos horaires aujourd\u2019hui : ' + h + '.';
      if (a.new_hours && h) line += ' V\u00e9rifiez le chevauchement.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' a chang\u00e9 ses horaires (' + (a.old_hours || '?') + ' \u2192 ' + (a.new_hours || '?') + '). Vos horaires : ' + todayHours(p) + '. V\u00e9rifier chevauchement.'; }
    }
  );

  // #31 — competitor_new_offering
  reg('competitor_new_offering', 'Nouvelle offre', 'CONCURRENCE', '\ud83c\udf81', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var desc = a.offering_description || 'nouvelle offre d\u00e9tect\u00e9e';
      var dist = distLabel(a.distance_m);
      var edge = userEdge(p);
      var name = a.competitor_name || '';
      var line = name + ' \u2014 ' + desc;
      if (dist) line += ', \u00e0 ' + dist;
      line += '.';
      if (edge) line += ' Votre positionnement face \u00e0 cette offre : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Concurrent \u00e9largit son offre. Affirmer votre sp\u00e9cificit\u00e9 : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' nouvelle offre : ' + (a.offering_description || '') + '. Analyser positionnement.'; }
    }
  );

  // #32 — competitor_sold_out
  reg('competitor_sold_out', 'Complet', 'OPPORTUNIT\u00c9', '\ud83d\udeab', '#2E7D32', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var c = topComp(d);
      var name = c.organizer_name || a.competitor_name || '';
      var event = c.event_label || a.event_label || '';
      var dist = distLabel(c.distance_m || a.distance_m);
      var edge = userEdge(p);
      var line = name + ' affiche complet';
      if (event) line += ' pour ' + event;
      if (dist) line += ' \u00e0 ' + dist;
      line += '. Visiteurs refus\u00e9s en recherche d\u2019alternative.';
      if (edge) line += ' Captez-les avec : ' + trunc(edge, 80) + '.';
      var h = todayHours(p); if (h) line += ' Ouvert ' + h + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { var c = topComp(d); return 'Post Instagram pour ' + siteName(p) + '. ' + (c.organizer_name || 'Un lieu') + ' est complet. Inviter les refus\u00e9s. ' + (userEdge(p) || '') + '. ' + todayHours(p) + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Concurrent complet. Vous accueillez, horaires + acc\u00e8s + ' + (userEdge(p) || '') + '.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Alternative disponible. Horaires + acc\u00e8s. Max 1500 car.'; }
    }
  );

  // #33 — competitor_content_spike
  reg('competitor_content_spike', 'Activit\u00e9 comm.', 'CONCURRENCE', '\ud83d\udce2', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || '';
      var count = a.content_count || '';
      var baseline = a.baseline_content_count || '';
      var edge = userEdge(p);
      var line = name + ' multiplie les publications';
      if (count && baseline) line += ' (' + count + ' r\u00e9centes vs ' + baseline + ' en moyenne)';
      line += '. Votre visibilit\u00e9 se r\u00e9duit.';
      if (edge) line += ' Maintenez votre pr\u00e9sence en mettant en avant : ' + trunc(edge, 60) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Concurrent pousse sa comm. Maintenir visibilit\u00e9 : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' multiplie les publications (' + (a.content_count || '') + ' vs ' + (a.baseline_content_count || '') + '). Augmenter notre fr\u00e9quence.'; }
    }
  );

  // #34 — competitor_content_silent
  reg('competitor_content_silent', 'Silence concurrent', 'OPPORTUNIT\u00c9', '\ud83e\udd10', '#2E7D32', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || '';
      var days = a.days_silent || '';
      var edge = userEdge(p);
      var line = name + ' \u2014 aucune publication depuis ' + days + 'j. Espace m\u00e9diatique local disponible.';
      if (edge) line += ' Prenez la parole avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Concurrent silencieux. Moment de prendre la parole. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Espace libre. Publier maintenant avec horaires + ' + (userEdge(p) || '') + '.'; }
    }
  );

  // #35 — institution_campaign_detected
  reg('institution_campaign_detected', 'Campagne instit.', 'INTELLIGENCE', '\ud83c\udfdb\ufe0f', '#1565C0', 'action', 'pulse#carte',
    function(a, p, d) {
      var name = a.campaign_name || 'Campagne institutionnelle';
      var org = a.organizer_name || '';
      var dist = distLabel(a.distance_m);
      var edge = userEdge(p);
      var line = name;
      if (org) line += ' (' + org + ')';
      if (dist) line += ' \u00e0 ' + dist;
      line += ' \u2014 flux de visiteurs attendu.';
      if (edge) line += ' Captez ce trafic : ' + trunc(edge, 80) + '.';
      var aud = audLabel(p); if (aud) line += ' Votre cible (' + aud + ') sera pr\u00e9sente.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Campagne institutionnelle attire du monde. Profitez-en : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Campagne : ' + (a.campaign_name || '') + '. Flux attendu. Envisager partenariat ou offre compl\u00e9mentaire.'; }
    }
  );

  // #36 — media_mention_detected
  reg('media_mention_detected', 'Mention m\u00e9dia', 'INTELLIGENCE', '\ud83d\udcf0', '#1565C0', 'action', 'pulse#media-detail',
    function(a, p, d) {
      var source = a.media_source || 'm\u00e9dia';
      var topic = a.mention_topic || 'votre zone';
      var edge = userEdge(p);
      var line = 'Mention dans ' + source + ' \u2014 sujet : ' + topic + '. Visibilit\u00e9 accrue.';
      if (edge) line += ' Relayez et mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Mention dans ' + (a.media_source || 'les m\u00e9dias') + '. Relayer et inviter. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour site web. Ajouter la mention presse dans actualit\u00e9s.'; }
    }
  );

  // ─── BAR CLASS / PILL MAPPINGS ───────────────────────────────────────────

  var CAT_BAR = {
    'URGENT': 'ab-threat',
    'CONCURRENCE': 'ab-warning',
    'M\u00c9T\u00c9O': 'ab-warning',
    'OPPORTUNIT\u00c9': 'ab-opportunity',
    'INTELLIGENCE': 'ab-info',
    'PLANIFICATION': 'ab-info'
  };

  var CAT_URGENCY = {
    'URGENT': { label: 'Urgent', style: 'background:#FEE2E2;color:#991B1B;' },
    'CONCURRENCE': { label: 'Concurrence', style: 'background:#FEF3C7;color:#92400E;' },
    'M\u00c9T\u00c9O': { label: 'M\u00e9t\u00e9o', style: 'background:#FEF3C7;color:#92400E;' },
    'OPPORTUNIT\u00c9': { label: 'Opportunit\u00e9', style: 'background:#D1FAE5;color:#065F46;' },
    'INTELLIGENCE': { label: 'Intelligence', style: 'background:#EFF6FF;color:#1e40af;' },
    'PLANIFICATION': { label: 'Planification', style: 'background:#F3F4F6;color:#374151;' }
  };

  var PRIO_SCORE = { 4: 95, 3: 80, 2: 60, 1: 40 };

  // ─── CHANNEL AVAILABILITY ────────────────────────────────────────────────

  function getAvailableChannels(actionType, prof, channelConfig) {
    var spec = SPECS[actionType];
    if (!spec || spec.card_type === 'notification') return [];
    var seeds = spec.draft_seeds || {};
    var cc = channelConfig || {};
    var channels = [];
    if (seeds.gbp && cc.gbp) channels.push({ key: 'gbp', label: 'Google Business Profile', charLimit: 1500 });
    if (seeds.instagram && !!prof.instagram_url) channels.push({ key: 'instagram', label: 'Instagram', charLimit: 2200 });
    if (seeds.facebook && !!prof.facebook_url) channels.push({ key: 'facebook', label: 'Facebook', charLimit: null });
    if (seeds.email && cc.email) channels.push({ key: 'email', label: 'Email', charLimit: null });
    if (seeds.sms) channels.push({ key: 'sms', label: 'SMS', charLimit: 160 });
    if (seeds.whatsapp && cc.whatsapp) channels.push({ key: 'whatsapp', label: 'WhatsApp', charLimit: 1000 });
    if (seeds.slack && cc.slack) channels.push({ key: 'slack', label: 'Slack', charLimit: null });
    if (seeds.note_interne) channels.push({ key: 'note_interne', label: 'Note interne', charLimit: null });
    if (seeds.website && !!prof.website_url) channels.push({ key: 'website', label: 'Site web', charLimit: null });
    return channels;
  }

  function getDraftSeed(actionType, channel, feedItem, prof, day) {
    var spec = SPECS[actionType];
    if (!spec || !spec.draft_seeds || !spec.draft_seeds[channel]) return null;
    try { return spec.draft_seeds[channel](feedItem, prof, day); } catch (e) { return null; }
  }

  // ─── RENDERER ────────────────────────────────────────────────────────────

  function normalizeDate(d) {
    if (!d) return '';
    var s = (typeof d === 'object' && d.value) ? String(d.value) : String(d);
    return s.slice(0, 10);
  }

  window.renderActionCandidates = function(candidates, prof, currentDay, selectedDate, mode, channelConfig) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var target = normalizeDate(selectedDate);
    var entries = [];
    prof = prof || {};
    currentDay = currentDay || {};
    channelConfig = channelConfig || {};
    for (var i = 0; i < candidates.length; i++) {
      var ac = candidates[i];
      var acDate = normalizeDate(ac.date);
      if (acDate !== target) continue;
      var actionType = ac.action_type || '';
      var spec = SPECS[actionType];
      var feedItem = {};
      if (ac.data_payload) { var dp = ac.data_payload; for (var k in dp) { if (dp.hasOwnProperty(k)) feedItem[k] = dp[k]; } }
      feedItem.change_subtype = actionType;
      feedItem.affected_date = ac.date;
      feedItem.alert_level = ac.action_priority;
      feedItem.action_category = ac.action_category;
      var mergedDay = {};
      for (var mk in currentDay) { if (currentDay.hasOwnProperty(mk)) mergedDay[mk] = currentDay[mk]; }
      if (mergedDay.opportunity_score != null && mergedDay.opportunity_score_final_local == null) mergedDay.opportunity_score_final_local = mergedDay.opportunity_score;
      if (mergedDay.opportunity_medal == null && mergedDay.opportunity_regime) mergedDay.opportunity_medal = mergedDay.opportunity_regime;
      if (ac.data_payload) { for (var pk in ac.data_payload) { if (ac.data_payload.hasOwnProperty(pk)) mergedDay[pk] = ac.data_payload[pk]; } }
      var sowhatText = '';
      var whatText = '';
      if (spec) {
        try { sowhatText = spec.sowhat(feedItem, prof, mergedDay, mode || 'veille'); } catch (e) { sowhatText = actionType + ' \u2014 donn\u00e9es indisponibles.'; }
        whatText = spec.brand_label_fr;
      } else {
        sowhatText = actionType + ' \u2014 type non reconnu.';
        whatText = actionType.replace(/_/g, ' ');
      }
      var catLabel = spec ? spec.category_label_fr : (ac.action_category || 'INTELLIGENCE');
      var barClass = CAT_BAR[catLabel] || 'ab-info';
      var brandLabel = spec ? spec.brand_label_fr : actionType.replace(/_/g, ' ');
      var brandColor = spec ? spec.color : '#6B7280';
      var brandIcon = spec ? spec.icon : '';
      var cardType = spec ? spec.card_type : 'action';
      var prioLabel = ac.action_priority >= 4 ? "Aujourd'hui" : ac.action_priority >= 3 ? 'Cette semaine' : '\u00c0 noter';
      var prioPill = { label: prioLabel, style: ac.action_priority >= 4 ? 'background:#FEE2E2;color:#991B1B;' : ac.action_priority >= 3 ? (CAT_URGENCY[catLabel] || CAT_URGENCY['INTELLIGENCE']).style : 'background:#F3F4F6;color:#6B7280;' };
      var typePill = { label: (brandIcon ? brandIcon + ' ' : '') + brandLabel, style: 'background:' + brandColor + '18;color:' + brandColor + ';' };
      var channels = getAvailableChannels(actionType, prof, channelConfig);
      var actions = [];
      if (cardType === 'action' && channels.length > 0) { actions.push({ text: 'Communiquer', meta: catLabel, key: 'communicate', channel: channels[0] ? channels[0].key : 'note_interne', channels: channels }); }
      actions.push({ text: 'Consulter', meta: catLabel, key: 'consult', channel: 'internal' });
      actions.push({ text: 'Sauvegarder', meta: '', key: 'save', channel: '' });
      actions.push({ text: 'Signaler', meta: '', key: 'flag', channel: '' });
      var item = { change_subtype: actionType, affected_date: ac.date, alert_level: ac.action_priority || 0, location_label: currentDay.location_label || '', action_category: ac.action_category, suppression_key: ac.suppression_key, card_type: cardType };
      if (ac.data_payload) { var dp2 = ac.data_payload; for (var k2 in dp2) { if (dp2.hasOwnProperty(k2) && !item.hasOwnProperty(k2)) item[k2] = dp2[k2]; } }
      var tmpl = { type: barClass === 'ab-opportunity' ? 'opportunity' : barClass === 'ab-threat' ? 'threat' : barClass === 'ab-warning' ? 'threat' : 'info', barClass: barClass, urgencyPill: prioPill, typePill: typePill, what: escHtml(whatText), sowhat: sowhatText, actions: actions, _is_action_candidate: true, _card_type: cardType, _consulter_target: spec ? spec.consulter_target : null, _spec_action_type: actionType, _available_channels: channels, _draft_seeds: spec ? spec.draft_seeds : {} };
      var score = PRIO_SCORE[ac.action_priority || 2] || 60;
      entries.push({ item: item, tmpl: tmpl, score: score });
    }
    return entries;
  };

  window.getActionCandidateTypes = function(candidates, selectedDate) {
    var target = normalizeDate(selectedDate);
    var types = {};
    if (!Array.isArray(candidates)) return types;
    for (var i = 0; i < candidates.length; i++) {
      var ac = candidates[i];
      if (normalizeDate(ac.date) !== target) continue;
      if (ac.action_type) types[ac.action_type] = true;
      if (ac.suppression_key) { var prefix = ac.suppression_key.split(':')[0]; if (prefix) types[prefix] = true; }
    }
    return types;
  };

  window.getDraftSeed = getDraftSeed;
  window.getAvailableChannels = getAvailableChannels;
  window.ACTION_CARDS = SPECS;

})();