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
  function samePct(a, d) {
    var v = (d && d.pct_same_bucket_5km != null) ? Number(d.pct_same_bucket_5km)
          : (a && a.pct_same_sector != null) ? Number(a.pct_same_sector)
          : null;
    return v != null ? Math.round(v * 100) : null;
  }
  function siteName(p) { return p.site_name || p.location_label || 'votre site'; }
  // De-lever staffing language — agnostic across verticals (no RH-flex assumption).
  // Runs on runtime strings (real accents). Ordered longest-match-first.
  var _STAFF_REWRITES = [
    [/adaptez vos effectifs en cons\u00e9quence/g, 'adaptez vos horaires et votre offre en cons\u00e9quence'],
    [/R\u00e9duisez vos effectifs ou adaptez votre offre/g, 'Ajustez vos horaires ou adaptez votre offre'],
    [/r\u00e9duisez l[\u2019']effectif d[\u2019']accueil ext\u00e9rieur/g, 'r\u00e9duisez votre exposition ext\u00e9rieure'],
    [/r\u00e9duisez l[\u2019']effectif ext\u00e9rieur/g, 'r\u00e9duisez votre exposition ext\u00e9rieure'],
    [/ajustez l[\u2019']effectif au plus juste/g, 'ajustez vos horaires au plus juste'],
    [/r\u00e9duisez l[\u2019']effectif/g, 'ajustez vos horaires'],
    [/ajustez l[\u2019']effectif/g, 'ajustez vos horaires'],
    [/Renforcer effectif et comm/g, 'Pr\u00e9parer l\u2019accueil et la communication'],
    [/Renforcer effectif/g, 'Pr\u00e9parer l\u2019accueil'],
    [/Adapter effectif et programme/g, 'Adapter horaires et offre'],
    [/Adapter effectif et publications/g, 'Adapter horaires et publications'],
    [/Adapter effectif, signal\u00e9tique/g, 'Adapter horaires et signal\u00e9tique'],
    [/adapter effectif, programme, s\u00e9curit\u00e9/g, 'adapter horaires, offre, s\u00e9curit\u00e9'],
    [/Adapter effectif/g, 'Adapter horaires et offre'],
    [/adapter effectif/g, 'adapter horaires et offre'],
    [/Ajuster effectif/g, 'Ajuster horaires et communication'],
    [/r\u00e9duction effectif/g, 'report des publications'],
    [/effectif, amplitude horaire, communication/g, 'amplitude horaire, offre, communication'],
    [/effectif, horaires, publications/g, 'horaires, offre, publications'],
    [/effectif, horaires, communication/g, 'horaires, offre, communication'],
    [/effectif en caisse, fluidit\u00e9 du parcours et mise en avant produit/g, 'fluidit\u00e9 du parcours et mise en avant produit'],
    [/un effectif d[\u2019']accueil suffisant/g, 'un dispositif d\u2019accueil suffisant']
  ];
  function deLeverStaffing(s) {
    if (!s) return s;
    var out = String(s);
    for (var i = 0; i < _STAFF_REWRITES.length; i++) out = out.replace(_STAFF_REWRITES[i][0], _STAFF_REWRITES[i][1]);
    return out;
  }
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

  function hazardPhrase(d) {
    var h = hazardLabel(d);
    return h === 'alerte m\u00e9t\u00e9o' ? h : 'alerte ' + h;
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
  function isBoilerplate(s) {
    if (!s) return true;
    var t = String(s).toLowerCase();
    return t.indexOf('signaux contextuels') >= 0
        || t.indexOf('traduction automatique') >= 0
        || t.indexOf('muse square') >= 0
        || t.indexOf('agr\u00e9gation') >= 0
        || t.indexOf('copilote op\u00e9rationnel') >= 0;
  }
  function userEdge(p) {
    var cands = [crawledDiff(p), crawledOffering(p), crawledDesc(p), evLabel(p)];
    for (var i = 0; i < cands.length; i++) { if (cands[i] && !isBoilerplate(cands[i])) return cands[i]; }
    return '';
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

  // Competitor threat/overlap context (offering-change cards) — single compact sentence
  function threatContext(a, withDist) {
    var bits = [];
    var overlap = Number(a.audience_overlap_pct || 0);
    var threatRaw = a.entity_threat_level || a.threat_level || '';
    var threatFr = THREAT_FR[threatRaw] || threatRaw;
    if (overlap > 0) bits.push('chevauchement d\u2019audience ' + overlap + '%');
    if (threatFr) bits.push('menace ' + threatFr);
    if (withDist) {
      var dkm = a.entity_threat_distance_km;
      if (dkm != null) bits.push('\u00e0 ' + distLabel(Number(dkm) * 1000));
    }
    if (!bits.length) return '';
    var joined = bits.join(', ');
    return ' ' + joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
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
  reg('high_competition_density', 'Diff\u00e9renciez-vous face \u00e0 vos concurrents', 'CONCURRENCE', '\u2694\ufe0f', '#D32F2F', 'action', 'pulse#carte',
    function(a, p, d) {
      var pr = Number(d.competition_pressure_ratio || 0);
      var edge = userEdge(p);
      var aud = audLabel(p);
      var line = 'Concurrence pour l\u2019attention au-dessus de la normale';
      if (pr > 0) line += ' (pression \u00d7' + pr.toFixed(1) + ')';
      line += '.';
      if (aud) line += ' Public vis\u00e9 : ' + aud + '.';
      if (edge) line += ' Votre atout : ' + trunc(edge, 120) + '.';
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
  reg('weather_window', 'Saisissez cette fen\u00eatre m\u00e9t\u00e9o', 'OPPORTUNIT\u00c9', '\u2600\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
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
  reg('top_day_approaching', 'Meilleur jour de la semaine \u2014 agissez maintenant', 'OPPORTUNIT\u00c9', '\u2b50', '#2E7D32', 'action', 'pulse#day-detail',
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
  reg('audience_shift_opportunity', 'Ajustez votre message au public du jour', 'OPPORTUNIT\u00c9', '\ud83d\udc65', '#1565C0', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var trigger = (a && a.commercial_event_name) || (a && a.holiday_name) || (a && a.vacation_name)
                  || d.holiday_name || d.vacation_name
                  || ((d.commercial_events && d.commercial_events[0]) ? d.commercial_events[0].event_name : null)
                  || null;
      var audLabelFr = d.audience_availability_label || '';
      var delta = Number(d.delta_att_calendar_pct || 0);
      var pctStr = (delta >= 1) ? '+' + Math.round(delta) + ' %'
                 : (delta <= -1) ? Math.round(delta) + ' %'
                 : '';
      var line = '';
      if (trigger) {
        line = trigger + (pctStr ? ' \u2014 affluence attendue ' + pctStr : '');
        if (audLabelFr) line += ' : ' + audLabelFr;
        line += '.';
      } else if (audLabelFr) {
        line = audLabelFr + (pctStr ? ' (' + pctStr + ' attendu)' : '') + '.';
      } else {
        var aud = audLabel(p);
        line = 'Changement d\u2019audience d\u00e9tect\u00e9' + (pctStr ? ' (' + pctStr + ' attendu)' : '') + '.' + (aud ? ' Vos ' + aud.split(',')[0] + ' c\u00f4toient de nouveaux visiteurs.' : '');
      }
      return line.trim();
    },
    {
      instagram: function(a, p, d) { var trigger = d.holiday_name || d.vacation_name || ''; return 'Post Instagram pour ' + siteName(p) + '. ' + trigger + ' change le profil des visiteurs. Adapter pour ' + (audLabel(p) || 'votre public') + ' et les nouveaux. Mettre en avant : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { var trigger = d.holiday_name || d.vacation_name || ''; return 'Post Facebook pour ' + siteName(p) + '. ' + trigger + ' \u2014 nouveau mix d\u2019audience. D\u00e9tails pratiques + ' + (userEdge(p) || '') + '.'; },
      website: function(a, p, d) { return 'Mise \u00e0 jour page d\u2019accueil. Adapter le message au contexte calendaire. Mettre en avant l\u2019offre pour le nouveau public.'; }
    }
  );

  // foreign_tourism_signal — foreign tourist nationalities on holiday (OpenHolidays + INSEE whitelist).
  // Payload: countries_on_school_holiday / countries_on_public_holiday (arrays of {country_name_en}),
  // has_foreign_*_signal, location_access_pattern. FR map = display whitelist (mirror dbt whitelist).
  reg('foreign_tourism_signal', 'Adaptez-vous au public touristique étranger', 'OPPORTUNITÉ', '🌍', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var FR = {'Germany':'Allemagne','Belgium':'Belgique','Netherlands (the)':'Pays-Bas','Switzerland':'Suisse','Italy':'Italie','Spain':'Espagne','Luxembourg':'Luxembourg','Austria':'Autriche','Ireland':'Irlande','Portugal':'Portugal','Poland':'Pologne','Czechia':'Tchéquie','Sweden':'Suède'};
      function names(arr) {
        if (!Array.isArray(arr)) return [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
          var c = arr[i];
          var en = (c && typeof c === 'object') ? (c.country_name_en || '') : String(c || '');
          if (FR[en]) out.push(FR[en]);
        }
        return out;
      }
      function uniq(arr) { var seen = {}, r = []; for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; r.push(arr[i]); } } return r; }
      var school = uniq(names(a.countries_on_school_holiday));
      var pub = uniq(names(a.countries_on_public_holiday));
      var parts = [];
      if (school.length) parts.push('vacances scolaires : ' + school.join(', '));
      if (pub.length) parts.push('jour férié : ' + pub.join(', '));
      var line = parts.length ? 'Public touristique étranger en congés — ' + parts.join(' ; ') + '.'
                              : 'Contexte touristique étranger détecté.';
      if (a.location_access_pattern === 'destination_catchment') line += ' Votre site capte un flux de passage — pertinence accrue.';
      line += ' Adaptez accueil, langues et communication à ce public.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Public touristique étranger attendu. Message accueillant (multilingue si pertinent). Mettre en avant : ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Afflux touristique étranger possible. Horaires : ' + todayHours(p) + '. Offre découverte. ' + (userEdge(p) || '') + '.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Accueil des visiteurs étrangers. Horaires + offre. Max 1500 car.'; },
      note_interne: function(a, p, d) { return 'Note interne ' + siteName(p) + '. Vacances/férié à l\'étranger — public de passage possible. Prévoir accueil multilingue et signalétique adaptée.'; }
    }
  );

  // #5 — competitor_threat_direct
  reg('competitor_threat_direct', 'Contrez votre concurrent direct', 'CONCURRENCE', '\ud83d\udea8', '#D32F2F', 'action', 'pulse#radar-threats',
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
      var compEnriched = null;
      try { compEnriched = a.competitor_enriched_description ? (typeof a.competitor_enriched_description === 'string' ? JSON.parse(a.competitor_enriched_description) : a.competitor_enriched_description) : null; } catch(e) {}
      if (compEnriched) {
        if (compEnriched.current_offering) line += ' Offre concurrent : ' + trunc(compEnriched.current_offering, 120) + '.';
        if (compEnriched.pricing_info) line += ' Tarifs : ' + trunc(compEnriched.pricing_info, 80) + '.';
      }
      return line;
    },
    {
      instagram: function(a, p, d) { var c = topComp(d); var ce = null; try { ce = a.competitor_enriched_description ? (typeof a.competitor_enriched_description === 'string' ? JSON.parse(a.competitor_enriched_description) : a.competitor_enriched_description) : null; } catch(e) {} var intel = ce && ce.current_offering ? ' Leur offre : ' + trunc(ce.current_offering, 80) + '.' : ''; return 'Post Instagram pour ' + siteName(p) + '. Concurrent actif (' + (c.organizer_name || a.competitor_name || 'proche') + ').' + intel + ' Se diff\u00e9rencier avec : ' + (userEdge(p) || 'votre offre') + '. Ton confiant. Max 2200 car.'; },
      facebook: function(a, p, d) { var c = topComp(d); var ce = null; try { ce = a.competitor_enriched_description ? (typeof a.competitor_enriched_description === 'string' ? JSON.parse(a.competitor_enriched_description) : a.competitor_enriched_description) : null; } catch(e) {} var intel = ce && ce.current_offering ? ' Leur offre : ' + trunc(ce.current_offering, 80) + '.' : ''; return 'Post Facebook pour ' + siteName(p) + '. Concurrent (' + (c.organizer_name || a.competitor_name || '') + ') m\u00eame jour.' + intel + ' Positionnement unique + horaires + acc\u00e8s.'; },
      note_interne: function(a, p, d) { var c = topComp(d); var ce = null; try { ce = a.competitor_enriched_description ? (typeof a.competitor_enriched_description === 'string' ? JSON.parse(a.competitor_enriched_description) : a.competitor_enriched_description) : null; } catch(e) {} var intel = ''; if (ce) { if (ce.current_offering) intel += ' Offre : ' + trunc(ce.current_offering, 100) + '.'; if (ce.pricing_info) intel += ' Tarifs : ' + trunc(ce.pricing_info, 60) + '.'; if (ce.key_differentiators) intel += ' Diff\u00e9renciants : ' + trunc(ce.key_differentiators, 80) + '.'; } return 'Note interne. Menace directe : ' + (c.organizer_name || a.competitor_name || 'concurrent') + ' \u00e0 ' + distLabel(a.distance_m || c.distance_m) + '.' + intel + ' Notre diff\u00e9renciant : ' + (userEdge(p) || '\u00e0 d\u00e9finir') + '. D\u00e9cision : renforcer comm ou adapter offre.'; }
    }
  );

  // #6 — regime_c_warning
  reg('regime_c_warning', 'Reportez ou adaptez vos op\u00e9rations', 'URGENT', '\u26a0\ufe0f', '#B71C1C', 'action', 'pulse#radar-score',
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
  reg('competition_proximity', 'Diff\u00e9renciez-vous de vos concurrents proches', 'CONCURRENCE', '\ud83d\udccd', '#E65100', 'action', 'pulse#carte',
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
  reg('low_competition_window', 'Prenez la parole \u2014 faible concurrence', 'OPPORTUNIT\u00c9', '\ud83d\udfe2', '#2E7D32', 'action', 'pulse#carte',
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
  reg('extended_bad_weather', 'Adaptez vos op\u00e9rations \u2014 m\u00e9t\u00e9o d\u00e9grad\u00e9e prolong\u00e9e', 'M\u00c9T\u00c9O', '\ud83c\udf27\ufe0f', '#E65100', 'action', 'pulse#radar-score',
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
  reg('weekend_opportunity', 'Activez une op\u00e9ration ce week-end', 'OPPORTUNIT\u00c9', '\ud83d\udcc5', '#2E7D32', 'action', 'pulse#day-detail',
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
  reg('weather_worsened', 'Pr\u00e9venez votre \u00e9quipe \u2014 m\u00e9t\u00e9o d\u00e9grad\u00e9e', 'M\u00c9T\u00c9O', '\ud83c\udf26\ufe0f', '#E65100', 'action', 'pulse#radar-score',
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
  reg('weather_improved', 'Saisissez cette fen\u00eatre m\u00e9t\u00e9o', 'OPPORTUNIT\u00c9', '\ud83c\udf24\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
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
  reg('competition_pressure_spike', 'Renforcez votre visibilit\u00e9 \u2014 pression en hausse', 'CONCURRENCE', '\ud83d\udcc8', '#D32F2F', 'action', 'pulse#carte',
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
  reg('mobility_disruption', 'Alertez votre \u00e9quipe \u2014 acc\u00e8s perturb\u00e9', 'URGENT', '\ud83d\udea7', '#B71C1C', 'action', 'pulse#radar-changes',
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
  reg('mobility_disruption_planned', 'Alertez votre \u00e9quipe \u2014 travaux pr\u00e9vus', 'PLANIFICATION', '\ud83d\udea7', '#F57F17', 'action', 'pulse#radar-changes',
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
  reg('score_up', 'Profitez de cette journ\u00e9e favorable', 'OPPORTUNIT\u00c9', '\ud83d\udcc8', '#2E7D32', 'notification', 'pulse#radar-score',
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
  reg('mega_event_activation', 'Captez le trafic du m\u00e9ga-\u00e9v\u00e9nement', 'INTELLIGENCE', '\ud83c\udfdf\ufe0f', '#1565C0', 'action', 'pulse#carte',
    function(a, p, d) {
      var c = topComp(d);
      var lbl = (a.event_label && a.event_label !== 'Signal d\u00e9tect\u00e9') ? a.event_label : null;
      var event = c.event_label || a.new_value || lbl || 'M\u00e9ga-\u00e9v\u00e9nement';
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
  // new_value is "CompName \u2014 EventName" (same shape feedLine1 parses). Read the
  // launching competitor from new_value, NOT topComp(d) (= day's #1 threat, unrelated).
  reg('competitor_event_launch', 'R\u00e9agissez au lancement concurrent', 'CONCURRENCE', '\ud83d\udce3', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var parts = String(a.new_value || '').split(' \u2014 ');
      var name = parts[0] || a.competitor_name || 'Concurrent';
      var event = parts[1] || '';
      var distKm = (a.entity_threat_distance_km != null) ? Number(a.entity_threat_distance_km) : (a.distance_m != null ? Number(a.distance_m) / 1000 : null);
      var distStr = (distKm != null) ? (Math.round(distKm * 10) / 10).toFixed(1).replace('.', ',') + ' km' : '';
      var line = name + (event ? ' lance \u00ab ' + event + ' \u00bb' : ' lance un \u00e9v\u00e9nement');
      if (distStr) line += ' \u00e0 ' + distStr;
      line += '.';
      return line;
    },
    {
      instagram: function(a, p, d) { var name = String(a.new_value || '').split(' \u2014 ')[0] || a.competitor_name || ''; return 'Post Instagram pour ' + siteName(p) + '. Concurrent (' + name + ') lance un \u00e9v\u00e9nement. Affirmer : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { var parts = String(a.new_value || '').split(' \u2014 '); var name = parts[0] || a.competitor_name || 'Concurrent'; var event = parts[1] || a.event_label || 'un \u00e9v\u00e9nement'; var dist = distLabel(a.distance_m); return 'Note interne. ' + name + ' lance ' + event + (dist ? ' \u00e0 ' + dist : '') + '. \u00c9valuer impact et r\u00e9ponse.'; }
    }
  );

  // #27 — competitor_audience_conflict
  reg('competitor_audience_conflict', 'Prot\u00e9gez votre audience', 'CONCURRENCE', '\ud83d\udea8', '#B71C1C', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || topComp(d).organizer_name || 'Concurrent';
      var aud = audLabel(p);
      var overlap = Number(a.audience_overlap_pct || 0);
      var threatRaw = a.threat_level || a.entity_threat_level || '';
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
  reg('competitor_review_surge', 'R\u00e9pondez aux avis \u2014 concurrent en hausse', 'CONCURRENCE', '\ud83d\udcac', '#D32F2F', 'action', 'pulse#radar-threats',
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

  // #31 — competitor_new_offering  (rewired: reads item/category/new_price_raw from int_competitor_offering_changes)
  reg('competitor_new_offering', 'Nouvelle offre', 'CONCURRENCE', '\ud83c\udf81', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une nouvelle offre';
      var cat = a.category || '';
      var price = a.new_price_raw || '';
      var dkm = a.entity_threat_distance_km;
      var dist = (dkm != null) ? distLabel(Number(dkm) * 1000) : '';
      var edge = userEdge(p);
      var line = name + ' lance une nouvelle offre : ' + item;
      if (price) line += ' (' + price + ')';
      if (cat) line += ' \u2014 ' + cat;
      if (dist) line += ', \u00e0 ' + dist;
      line += '.';
      line += threatContext(a, false);
      if (edge) line += ' Votre positionnement face \u00e0 cette offre : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. ' + (a.competitor_name || 'Un concurrent') + ' lance ' + (a.item || 'une nouvelle offre') + '. Affirmer votre sp\u00e9cificit\u00e9 : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' nouvelle offre : ' + (a.item || '') + (a.new_price_raw ? ' (' + a.new_price_raw + ')' : '') + (a.category ? ' \u2014 ' + a.category : '') + '. Analyser positionnement.'; }
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

  // #37 — competitor_price_increase
  reg('competitor_price_increase', 'Saisissez la marge tarifaire', 'INTELLIGENCE', '\ud83d\udcc8', '#1565C0', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || '?';
      var newP = a.new_price_raw || '?';
      var pctv = (a.price_pct_change != null) ? Number(a.price_pct_change) : null;
      var line = name + ' a augment\u00e9 le prix de ' + item + ' : ' + oldP + ' \u2192 ' + newP;
      if (pctv != null) line += ' (+' + pctv + '%)';
      line += '.';
      line += threatContext(a, true);
      line += ' Vous disposez peut-\u00eatre d\u2019une marge de repositionnement tarifaire.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' a augment\u00e9 ' + (a.item || 'une offre') + ' : ' + (a.old_price_raw || '?') + ' \u2192 ' + (a.new_price_raw || '?') + (a.price_pct_change != null ? ' (+' + Number(a.price_pct_change) + '%)' : '') + '. \u00c9valuer une marge de repositionnement.'; }
    }
  );

  // #38 — competitor_price_drop
  reg('competitor_price_drop', 'R\u00e9agissez \u00e0 la baisse de prix concurrente', 'CONCURRENCE', '\ud83d\udcc9', '#D32F2F', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || '?';
      var newP = a.new_price_raw || '?';
      var pctv = (a.price_pct_change != null) ? Number(a.price_pct_change) : null;
      var edge = userEdge(p);
      var line = name + ' a baiss\u00e9 le prix de ' + item + ' : ' + oldP + ' \u2192 ' + newP;
      if (pctv != null) line += ' (' + pctv + '%)';
      line += '.';
      line += threatContext(a, true);
      line += ' Pression tarifaire \u2014 v\u00e9rifiez votre comp\u00e9titivit\u00e9 sur cette offre.';
      if (edge) line += ' Votre atout : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Mettre en avant votre rapport qualit\u00e9-prix et : ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' a baiss\u00e9 ' + (a.item || 'une offre') + ' : ' + (a.old_price_raw || '?') + ' \u2192 ' + (a.new_price_raw || '?') + (a.price_pct_change != null ? ' (' + Number(a.price_pct_change) + '%)' : '') + '. V\u00e9rifier comp\u00e9titivit\u00e9.'; }
    }
  );

  // #39 — competitor_offering_removed
  reg('competitor_offering_removed', 'Captez l\u2019offre abandonn\u00e9e', 'INTELLIGENCE', '\ud83d\uddd1\ufe0f', '#1565C0', 'action', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || '';
      var edge = userEdge(p);
      var line = name + ' ne propose plus : ' + item;
      if (oldP) line += ' (anciennement ' + oldP + ')';
      line += '.';
      line += threatContext(a, true);
      line += ' Opportunit\u00e9 de capter cette demande.';
      if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Mettre en avant votre offre sur ce segment : ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.competitor_name || 'Concurrent') + ' a retir\u00e9 : ' + (a.item || 'une offre') + (a.old_price_raw ? ' (anciennement ' + a.old_price_raw + ')' : '') + '. Opportunit\u00e9 de capter cette demande.'; }
    }
  );

  // competitor_positioning_brief — reads cached competitive_analysis_json
  reg('competitor_positioning_brief', 'Analysez le positionnement concurrent', 'INTELLIGENCE', '\ud83e\udded', '#1565C0', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent suivi';
      var ca = null;
      try { ca = a.competitive_analysis_json ? (typeof a.competitive_analysis_json === 'string' ? JSON.parse(a.competitive_analysis_json) : a.competitive_analysis_json) : null; } catch(e) {}
      if (!ca) { var e0 = userEdge(p); return name + ' \u2014 analyse de positionnement disponible.' + (e0 ? ' Votre atout : ' + trunc(e0, 80) + '.' : ''); }
      var line = name;
      if (ca.relationship_type === 'complementary') line += ' \u2014 profil complementaire (pas un concurrent direct).';
      else if (ca.is_direct_competitor === false) line += ' \u2014 concurrence indirecte.';
      else line += ' \u2014 concurrent direct.';
      if (ca.positioning_theirs) line += ' Leur positionnement : ' + trunc(ca.positioning_theirs, 80) + '.';
      var td = Array.isArray(ca.differentiation_theirs) ? ca.differentiation_theirs.slice(0, 2).join(', ') : '';
      if (td) line += ' Leurs atouts : ' + trunc(td, 100) + '.';
      var gp = Array.isArray(ca.product_gaps) ? ca.product_gaps.slice(0, 2).join(', ') : '';
      if (gp) line += ' Vos manques : ' + trunc(gp, 100) + '.';
      var yd = Array.isArray(ca.differentiation_yours) ? ca.differentiation_yours.slice(0, 2).join(', ') : '';
      if (yd) line += ' Vos differenciateurs : ' + trunc(yd, 100) + '.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var ca = null;
        try { ca = a.competitive_analysis_json ? (typeof a.competitive_analysis_json === 'string' ? JSON.parse(a.competitive_analysis_json) : a.competitive_analysis_json) : null; } catch(e) {}
        var name = a.competitor_name || 'concurrent';
        if (!ca) return 'Note interne. Analyse de positionnement pour ' + name + '.';
        var s = 'Note interne. Positionnement ' + name + '. ';
        if (ca.verdict) s += 'Verdict : ' + trunc(ca.verdict, 120) + '. ';
        var td = Array.isArray(ca.differentiation_theirs) ? ca.differentiation_theirs.join(', ') : '';
        if (td) s += 'Leurs atouts : ' + trunc(td, 120) + '. ';
        var gp = Array.isArray(ca.product_gaps) ? ca.product_gaps.join(', ') : '';
        if (gp) s += 'Vos manques : ' + trunc(gp, 120) + '. ';
        var cm = Array.isArray(ca.product_complements) ? ca.product_complements.join(', ') : '';
        if (cm) s += 'Complementarites : ' + trunc(cm, 120) + '.';
        return s;
      }
    }
  );

  // competitor_reputation_strength — standing rating signal (fires immediately)
  reg('competitor_reputation_strength', 'Surveillez la r\u00e9putation concurrente', 'INTELLIGENCE', '\u2b50', '#1565C0', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent suivi';
      var rating = (a.google_rating != null) ? Number(a.google_rating).toFixed(1) : null;
      var count = (a.google_rating_count != null) ? Number(a.google_rating_count) : null;
      var line = name + ' affiche une r\u00e9putation solide';
      if (rating) line += ' : ' + rating + '/5';
      if (count != null) line += ' sur ' + count + ' avis';
      line += '.';
      line += threatContext(a, true);
      var edge = userEdge(p);
      if (edge) line += ' Votre atout : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var name = a.competitor_name || 'concurrent';
        var rating = (a.google_rating != null) ? Number(a.google_rating).toFixed(1) : '?';
        var count = (a.google_rating_count != null) ? Number(a.google_rating_count) : '?';
        return 'Note interne. R\u00e9putation ' + name + ' : ' + rating + '/5 sur ' + count + ' avis. Solliciter des avis clients et valoriser nos points forts.';
      },
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Invitez vos visiteurs satisfaits \u00e0 laisser un avis. Mettre en avant : ' + (userEdge(p) || 'votre qualit\u00e9 d\u2019accueil') + '. Max 2200 car.'; }
    }
  );

  // review_solicitation — gesture (own reputation). Fires before a favourable day. Profile A.
  reg('review_solicitation', 'Sollicitez des avis clients', 'R\u00c9PUTATION', '\u2b50', '#1565C0', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var n = Number(a.favorable_days_next_5 || d.favorable_days_next_5 || 0);
      var PK = {'jour ferie':'jour f\u00e9ri\u00e9','week-end':'week-end','vacances scolaires':'vacances scolaires','jour de pointe':'jour de forte affluence'};
      var pkRaw = a.peak_window || d.peak_window || '';
      var pk = PK[pkRaw] || pkRaw;
      var line = 'Une fen\u00eatre favorable approche';
      if (pk) line += ' (' + pk + ')';
      line += ' \u2014 c\u2019est le bon moment pour solliciter des avis aupr\u00e8s de vos visiteurs satisfaits.';
      if (n > 1) line += ' ' + n + ' journ\u00e9es porteuses dans les 5 prochains jours.';
      var edge = userEdge(p);
      if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne ' + siteName(p) + '. Fen\u00eatre favorable \u00e0 venir \u2014 pr\u00e9parer une sollicitation d\u2019avis : carte QR en caisse, message de remerciement en fin de visite, relance email. Objectif : convertir la fr\u00e9quentation en avis Google.' + (p.review_link ? ' Lien d\u2019avis configur\u00e9 : ' + p.review_link : ' (Aucun lien d\u2019avis configur\u00e9 \u2014 ajoutez-le dans Sites.)'); },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Invitez vos visiteurs satisfaits \u00e0 laisser un avis Google.' + (p.review_link ? ' Lien direct : ' + p.review_link + '.' : '') + ' ' + (userEdge(p) || '') + ' Max 1500 car.'; },
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Invitez vos visiteurs \u00e0 partager leur exp\u00e9rience en avis. Ton chaleureux. ' + (userEdge(p) || '') + ' Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Remerciez vos visiteurs et invitez-les \u00e0 laisser un avis.' + (p.review_link ? ' Lien direct : ' + p.review_link + '.' : '') + ' ' + (userEdge(p) || '') + '.'; },
      email: function(a, p, d) { return 'Email ' + siteName(p) + '. Objet : votre avis compte. Relance post-visite invitant \u00e0 laisser un avis en ligne.' + (p.review_link ? ' Lien direct : ' + p.review_link + '.' : '') + ' ' + (userEdge(p) || '') + '.'; }
    }
  );

  // competitor_repricing_event — compound: >=2 price moves in one crawl
  reg('competitor_repricing_event', 'Analysez ce mouvement tarifaire', 'CONCURRENCE', '\ud83d\udcb1', '#D32F2F', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var n = (a.price_change_count != null) ? Number(a.price_change_count) : 0;
      var inc = (a.increase_count != null) ? Number(a.increase_count) : 0;
      var dec = (a.decrease_count != null) ? Number(a.decrease_count) : 0;
      var line = name + ' a modifi\u00e9 ' + n + ' prix simultan\u00e9ment';
      var parts = [];
      if (inc > 0) parts.push(inc + ' hausse' + (inc > 1 ? 's' : ''));
      if (dec > 0) parts.push(dec + ' baisse' + (dec > 1 ? 's' : ''));
      if (parts.length) line += ' (' + parts.join(', ') + ')';
      line += '.';
      var items = a.items_changed || '';
      if (items) line += ' Concern\u00e9 : ' + trunc(items, 100) + '.';
      line += threatContext(a, true);
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var name = a.competitor_name || 'concurrent';
        var n = (a.price_change_count != null) ? Number(a.price_change_count) : 0;
        return 'Note interne. ' + name + ' a repositionn\u00e9 ' + n + ' tarifs (' + (a.increase_count || 0) + ' hausses, ' + (a.decrease_count || 0) + ' baisses). Items : ' + (a.items_changed || '') + '. Analyser la strat\u00e9gie et notre comp\u00e9titivit\u00e9.';
      },
      slack: function(a, p, d) {
        var name = a.competitor_name || 'Un concurrent';
        var n = (a.price_change_count != null) ? Number(a.price_change_count) : 0;
        return 'Mouvement tarifaire : ' + name + ' a modifi\u00e9 ' + n + ' prix (' + (a.increase_count || 0) + ' hausses, ' + (a.decrease_count || 0) + ' baisses). \u00c0 analyser.';
      }
    }
  );

  // competitor_event_ending — launch twin. competitor_id is null (no enrichment fetch).
  reg('competitor_event_ending', 'Fin d\u2019\u00e9v\u00e9nement concurrent', 'CONCURRENCE', '\ud83c\udfc1', '#E65100', 'notification', 'pulse#radar-threats',
    function(a, p, d) {
      var parts = String(a.new_value || '').split(' \u2014 ');
      var name = parts[0] || a.competitor_name || 'Un concurrent';
      var event = parts[1] || a.event_label || '';
      return name + (event ? ' termine \u00ab ' + event + ' \u00bb' : ' termine un \u00e9v\u00e9nement') + '. La pression de cet \u00e9v\u00e9nement retombe.';
    },
    {
      note_interne: function(a, p, d) { var parts = String(a.new_value || '').split(' \u2014 '); var name = parts[0] || a.competitor_name || 'Concurrent'; return 'Note interne. ' + name + ' termine un \u00e9v\u00e9nement. Fen\u00eatre potentiellement plus favorable \u2014 \u00e9valuer une prise de parole.'; }
    }
  );

  // competitor_positioning_gap — POS x competitor (Tier C). top_item_revenue_share is a fraction.
  reg('competitor_positioning_gap', 'Analysez votre \u00e9cart de positionnement', 'INTELLIGENCE', '\ud83e\udded', '#1565C0', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var item = a.top_item_description || 'votre produit phare';
      var share = (a.top_item_revenue_share != null) ? Math.round(Number(a.top_item_revenue_share) * 100) : null;
      var line = 'Votre produit phare (' + item + ')' + (share != null ? ' p\u00e8se ' + share + ' % de votre chiffre d\u2019affaires' : '') + '.';
      var n = (a.watched_competitor_count != null) ? Number(a.watched_competitor_count) : null;
      if (n != null) line += ' ' + n + ' concurrents suivis \u00e0 comparer sur ce positionnement.';
      return line;
    },
    {
      note_interne: function(a, p, d) { var item = a.top_item_description || 'produit phare'; return 'Note interne ' + siteName(p) + '. Concentration sur ' + item + (a.top_item_revenue_share != null ? ' (' + Math.round(Number(a.top_item_revenue_share) * 100) + ' % du CA)' : '') + '. Comparer le positionnement face aux concurrents suivis et identifier les \u00e9carts d\u2019offre.'; }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPOUND SIGNALS (C1–C27)
  // ═══════════════════════════════════════════════════════════════════════════

  // C1 — perfect_storm
  reg('perfect_storm', 'Conditions exceptionnelles \u2014 tous les feux au vert', 'OPPORTUNIT\u00c9', '\ud83c\udf1f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var fc = Number(a.favorable_count || 0);
      var score = num(d.opportunity_score_final_local);
      var parts = [];
      if (Number(d.alert_level_max || 0) === 0) parts.push('m\u00e9t\u00e9o favorable');
      if (Number(d.competition_pressure_ratio || a.pressure_ratio || 0) < 0.8) parts.push('concurrence faible');
      if (d.holiday_name) parts.push(d.holiday_name);
      if (d.vacation_name) parts.push('vacances');
      if (d.is_weekend_flag) parts.push('week-end');
      if (Number(a.tourism_index || d.tourism_index_region || 0) > 70) parts.push('tourisme \u00e9lev\u00e9');
      var line = fc + ' facteurs favorables align\u00e9s : ' + (parts.length > 0 ? parts.join(', ') : 'conditions multiples') + '.';
      line += ' Score ' + score + '/10.';
      var edge = userEdge(p); if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Conditions exceptionnelles. ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Tout est align\u00e9 aujourd\u2019hui. Horaires : ' + todayHours(p) + '. ' + (userEdge(p) || '') + '.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Journ\u00e9e id\u00e9ale. Horaires + offre. Max 1500 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. ' + (a.favorable_count || '3+') + ' facteurs favorables. Renforcer effectif et comm.'; }
    }
  );

  // C2 — weather_comp_opportunity
  reg('weather_comp_opportunity', 'Beau temps + faible concurrence', 'OPPORTUNIT\u00c9', '\u2600\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var n = Number(a.events_5km || d.events_within_5km_count || 0);
      var line = 'M\u00e9t\u00e9o favorable et pression concurrentielle faible (\u00d7' + pr.toFixed(1) + ', ' + n + ' \u00e9v\u00e9n. \u00e0 5 km).';
      line += ' Conditions id\u00e9ales pour communiquer.';
      var edge = userEdge(p); if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Beau temps, peu de concurrence. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Conditions id\u00e9ales. Horaires + offre. Max 1500 car.'; }
    }
  );

  // C3 — saturated_bad_weather
  reg('saturated_bad_weather', 'Mauvais temps + saturation sectorielle', 'URGENT', '\u26a0\ufe0f', '#B71C1C', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var pctSame = samePct(a, d) || 0;
      var alert = Number(a.weather_alert || d.alert_level_max || 0);
      var line = 'Double risque : ' + hazardPhrase(d) + ' (niveau ' + alert + ') et ' + Math.round(pctSame) + '% du secteur en comp\u00e9tition directe.';
      if (weatherSens(p)) line += ' Site sensible m\u00e9t\u00e9o.';
      line += ' R\u00e9duisez vos co\u00fbts ou reportez.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. Mauvais temps + saturation ' + samePct(a, d) + '%. Adapter effectif et publications.'; }
    }
  );

  // C4 — holiday_high_comp
  reg('holiday_high_comp', 'Jour f\u00e9ri\u00e9 mais concurrence \u00e9lev\u00e9e', 'CONCURRENCE', '\ud83c\udf89', '#E65100', 'action', 'pulse#carte',
    function(a, p, d) {
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var n = Number(a.events_5km || d.events_within_5km_count || 0);
      var line = 'Jour f\u00e9ri\u00e9 avec pression \u00d7' + pr.toFixed(1) + ' (' + n + ' \u00e9v\u00e9n. \u00e0 5 km).';
      line += ' Public disponible mais concurrence aussi.';
      var edge = userEdge(p); if (edge) line += ' D\u00e9marquez-vous avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Jour f\u00e9ri\u00e9, d\u00e9marquez-vous. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. F\u00e9ri\u00e9 + concurrence \u00d7' + Number(a.pressure_ratio||0).toFixed(1) + '. Renforcer accueil et comm.'; }
    }
  );

  // C5 — best_day_of_week
  reg('best_day_of_week', 'Meilleur jour de la semaine', 'OPPORTUNIT\u00c9', '\ud83c\udfc6', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var score = num(a.score || d.opportunity_score_final_local);
      var regime = a.regime || d.opportunity_regime || '';
      var line = 'Meilleur jour de la semaine : score ' + score + '/10, r\u00e9gime ' + regime + '.';
      var edge = userEdge(p); if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Meilleur jour de la semaine. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Journ\u00e9e optimale. Horaires + offre. Max 1500 car.'; }
    }
  );

  // C6 — day_opportunity
  reg('day_opportunity', 'Journ\u00e9e tr\u00e8s favorable \u2014 r\u00e9gime A', 'OPPORTUNIT\u00c9', '\u2b50', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var score = num(a.score || d.opportunity_score_final_local);
      var line = 'R\u00e9gime A, score ' + score + '/10. Conditions optimales.';
      var edge = userEdge(p); if (edge) line += ' Maximisez avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. R\u00e9gime A. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Conditions optimales. Horaires. Max 1500 car.'; }
    }
  );

  // C7 — same_bucket_saturation
  reg('same_bucket_saturation', 'Saturation dans votre secteur', 'CONCURRENCE', '\ud83d\udfe0', '#E65100', 'action', 'pulse#carte',
    function(a, p, d) {
      var pctSame = num(a.pct_same_sector || d.pct_same_bucket_5km) || 0;
      var n = Number(a.events_5km || d.events_within_5km_count || 0);
      var line = Math.round(pctSame) + '% des ' + n + ' \u00e9v\u00e9nements \u00e0 5 km sont dans votre secteur.';
      var edge = userEdge(p); if (edge) line += ' D\u00e9marquez-vous : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Secteur satur\u00e9. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Saturation sectorielle ' + num(a.pct_same_sector) + '%. Diff\u00e9rencier offre.'; }
    }
  );

  // C8 — weekend_vacation_low_comp
  reg('weekend_vacation_low_comp', 'Week-end de vacances \u2014 faible concurrence', 'OPPORTUNIT\u00c9', '\ud83c\udf34', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var score = num(a.score || d.opportunity_score_final_local);
      var line = 'Week-end de vacances, pression \u00d7' + pr.toFixed(1) + '. Score ' + score + '/10.';
      line += ' Fen\u00eatre rare \u2014 communiquez maintenant.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Week-end de vacances, peu de concurrence. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Week-end vacances. Horaires : ' + todayHours(p) + '. ' + (userEdge(p) || '') + '.'; }
    }
  );

  // C9 — commercial_event_match
  reg('commercial_event_match', 'Temps fort commercial \u2014 activez', 'OPPORTUNIT\u00c9', '\ud83d\udecd\ufe0f', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var ev0 = (d.commercial_events && d.commercial_events[0]) ? d.commercial_events[0] : {};
      var evName = a.commercial_event_name || a.event_label || ev0.event_name || '';
      var evCode = a.commercial_event_code || ev0.event_code || '';
      var isDiscount = evCode
        ? /sales|black-friday|cyber-monday/.test(String(evCode))
        : /soldes|black friday|cyber monday|nouvel an|no\u00ebl/i.test(String(evName));
      var line = evName ? evName + ' en cours dans votre r\u00e9gion.' : 'Temps fort commercial en cours dans votre r\u00e9gion.';
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      if (isDiscount) line += pr > 1.3 ? ' Concurrence \u00e9lev\u00e9e (\u00d7' + pr.toFixed(1) + ') \u2014 d\u00e9marquez-vous sans casser vos prix.' : ' Le flux d\u2019acheteurs est l\u00e0 \u2014 mettez en avant une offre signature plut\u00f4t qu\u2019une remise.';
      else line += pr > 1.3 ? ' Concurrence \u00e9lev\u00e9e (\u00d7' + pr.toFixed(1) + ') \u2014 d\u00e9marquez-vous.' : ' Fen\u00eatre favorable \u2014 captez le flux.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. P\u00e9riode commerciale. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Offre sp\u00e9ciale p\u00e9riode commerciale. Max 1500 car.'; }
    }
  );

  // C10 — weather_window_after_bad
  reg('weather_window_after_bad', 'Retour au beau apr\u00e8s mauvais temps', 'OPPORTUNIT\u00c9', '\ud83c\udf24\ufe0f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var line = 'Am\u00e9lioration m\u00e9t\u00e9o apr\u00e8s 2+ jours d\u00e9grad\u00e9s.';
      if (weatherSens(p)) line += ' Site sensible (' + p.weather_sensitivity + '/5) \u2014 vos visiteurs reviennent.';
      if (isOutdoor(p)) line += ' Espace ext\u00e9rieur de nouveau accessible.';
      var edge = userEdge(p); if (edge) line += ' Communiquez : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Le beau temps revient. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Am\u00e9lioration m\u00e9t\u00e9o. Horaires. Max 1500 car.'; }
    }
  );

  // C11 — extended_bad_weather_3d
  reg('extended_bad_weather_3d', 'M\u00e9t\u00e9o d\u00e9grad\u00e9e 3+ jours', 'M\u00c9T\u00c9O', '\ud83c\udf27\ufe0f', '#B71C1C', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var alert = Number(a.alert_level || d.alert_level_max || 0);
      var line = '3+ jours cons\u00e9cutifs de mauvais temps \u2014 ' + hazardPhrase(d) + ' (niveau ' + alert + ').';
      if (weatherSens(p)) line += ' Site sensible \u2014 impact prolong\u00e9 sur la fr\u00e9quentation.';
      if (isOutdoor(p)) line += ' Activez votre offre int\u00e9rieure.';
      else line += ' Positionnez-vous comme refuge.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. M\u00e9t\u00e9o d\u00e9grad\u00e9e 3+ jours. ' + (weatherSens(p) ? 'Adapter effectif.' : 'Impact limit\u00e9.'); }
    }
  );

  // C12 — tourist_high_season
  reg('tourist_high_season', 'Haute saison touristique', 'OPPORTUNIT\u00c9', '\ud83c\udf0d', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ', ' + ST[a.tourism_status] : '';
      var line = 'Indice touristique \u00e9lev\u00e9 (' + Math.round(idx) + st + '). Afflux de visiteurs dans votre r\u00e9gion.';
      var aud = audLabel(p); if (aud) line += ' Adaptez votre message pour ' + aud + ' et les touristes.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Haute saison touristique. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Accueil touristes. Horaires. Max 1500 car.'; }
    }
  );

  // C13 — tourist_surge_vacation
  reg('tourist_surge_vacation', 'Afflux touristique en vacances', 'OPPORTUNIT\u00c9', '\ud83c\udf34', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ', ' + ST[a.tourism_status] : '';
      var line = 'Tourisme \u00e9lev\u00e9 (' + Math.round(idx) + st + ') + vacances scolaires. Double flux de visiteurs.';
      var edge = userEdge(p); if (edge) line += ' Captez-les avec : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Tourisme + vacances. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. P\u00e9riode touristique. Offre + horaires. Max 1500 car.'; }
    }
  );

  // C14 — tourism_peak_window
  reg('tourism_peak_window', 'Pic touristique r\u00e9gional', 'OPPORTUNIT\u00c9', '\ud83d\udcc8', '#2E7D32', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ', ' + ST[a.tourism_status] : '';
      var line = 'Pic touristique d\u00e9tect\u00e9 (indice ' + Math.round(idx) + st + '). Maximisez votre visibilit\u00e9.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Pic touristique. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Pic touristique. Horaires. Max 1500 car.'; }
    }
  );

  // C15 — tourism_weather_vacation
  reg('tourism_weather_vacation', 'Tourisme + beau temps + vacances', 'OPPORTUNIT\u00c9', '\ud83c\udf1f', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ' ' + ST[a.tourism_status] : '';
      var line = 'Triple signal : tourisme (' + Math.round(idx) + st + '), beau temps, vacances. Conditions exceptionnelles.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Tourisme + beau temps + vacances. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Triple signal favorable. Horaires : ' + todayHours(p) + '. ' + (userEdge(p) || '') + '.'; }
    }
  );

  // C16 — tourism_comp_squeeze
  reg('tourism_comp_squeeze', 'Tourisme \u00e9lev\u00e9 mais concurrence forte', 'CONCURRENCE', '\ud83c\udf0d', '#E65100', 'action', 'pulse#carte',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ', ' + ST[a.tourism_status] : '';
      var line = 'Tourisme \u00e9lev\u00e9 (' + Math.round(idx) + st + ') mais pression \u00d7' + pr.toFixed(1) + '.';
      line += ' Les touristes ont le choix \u2014 d\u00e9marquez-vous.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Tourisme \u00e9lev\u00e9, concurrence aussi. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Tourisme + concurrence \u00d7' + Number(a.pressure_ratio||0).toFixed(1) + '. Renforcer diff\u00e9renciation.'; }
    }
  );

  // C17 — low_tourism_local_opp
  reg('low_tourism_local_opp', 'Tourisme faible \u2014 ciblez les locaux', 'OPPORTUNIT\u00c9', '\ud83c\udfe0', '#1565C0', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var ST = {high:'saison haute',normal:'saison normale',low:'saison basse'};
      var st = ST[a.tourism_status] ? ', ' + ST[a.tourism_status] : '';
      var line = 'Tourisme bas (' + Math.round(idx) + st + ') mais jour f\u00e9ri\u00e9. Les r\u00e9sidents sont disponibles.';
      var aud = audLabel(p); if (aud) line += ' Ciblez vos ' + aud.split(',')[0] + '.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Journ\u00e9e pour les locaux. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. F\u00e9ri\u00e9, pour les locaux. Horaires. Max 1500 car.'; }
    }
  );

  // C18 — tourism_mobility_hit
  reg('tourism_mobility_hit', 'Tourisme \u00e9lev\u00e9 mais mobilit\u00e9 perturb\u00e9e', 'URGENT', '\ud83d\udea7', '#B71C1C', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var stop = p.nearest_transit_stop_name || '';
      var line = 'Tourisme \u00e9lev\u00e9 (' + Math.round(idx) + ') mais acc\u00e8s perturb\u00e9' + (stop ? ' (' + stop + ')' : '') + '. Risque de perte de trafic.';
      line += stop ? ' Communiquez un itin\u00e9raire alternatif depuis ' + stop + '.' : ' Communiquez des itin\u00e9raires alternatifs.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. Tourisme \u00e9lev\u00e9 + mobilit\u00e9 perturb\u00e9e. Signal\u00e9tique + itin\u00e9raires alt.'; },
      website: function(a, p, d) { return 'Banni\u00e8re acc\u00e8s. Tourisme en cours, perturbation mobilit\u00e9. Itin\u00e9raire alternatif.'; }
    }
  );

  // C19 — weather_mobility_double
  reg('weather_mobility_double', 'Double alerte : m\u00e9t\u00e9o + mobilit\u00e9', 'URGENT', '\u26a1', '#B71C1C', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var alert = Number(a.weather_alert || d.alert_level_max || 0);
      var line = 'Double risque : ' + hazardPhrase(d) + ' (niveau ' + alert + ') et perturbation mobilit\u00e9.';
      if (weatherSens(p)) line += ' Site sensible \u2014 impact direct.';
      line += ' Pr\u00e9venez votre \u00e9quipe et vos visiteurs.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. M\u00e9t\u00e9o + mobilit\u00e9 perturb\u00e9es. Adapter effectif, signal\u00e9tique.'; },
      website: function(a, p, d) { return 'Banni\u00e8re alerte. Conditions d\u00e9grad\u00e9es + acc\u00e8s perturb\u00e9. Alternatives.'; }
    }
  );

  // C20 — mobility_comp_squeeze
  reg('mobility_comp_squeeze', 'Mobilit\u00e9 perturb\u00e9e + concurrence', 'URGENT', '\ud83d\udea7', '#B71C1C', 'action', 'pulse#carte',
    function(a, p, d) {
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var stop = p.nearest_transit_stop_name || '';
      var line = 'Acc\u00e8s perturb\u00e9' + (stop ? ' (' + stop + ')' : '') + ' et pression concurrentielle \u00d7' + pr.toFixed(1) + '.';
      line += ' Vos visiteurs risquent de se d\u00e9tourner vers des concurrents mieux accessibles.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 60) + '.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. Mobilit\u00e9 + concurrence \u00d7' + Number(a.pressure_ratio||0).toFixed(1) + '. Itin\u00e9raires alt + comm.'; }
    }
  );

  // C21 — ft_peak_bad_weather
  reg('ft_peak_bad_weather', 'Jour de pointe mais m\u00e9t\u00e9o d\u00e9grad\u00e9e', 'M\u00c9T\u00c9O', '\ud83c\udf26\ufe0f', '#E65100', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var rank = num(a.ft_rank) || 0;
      var alert = Number(a.weather_alert || d.alert_level_max || 0);
      var pk = (a.ft_peak_hour != null) ? ', pic habituel vers ' + Number(a.ft_peak_hour) + 'h' + (a.ft_peak_busyness_pct != null ? ' (affluence ' + Number(a.ft_peak_busyness_pct) + ' %)' : '') : '';
      var line = 'Ce jour est habituellement un pic de fr\u00e9quentation (rang ' + rank + pk + ') mais ' + hazardPhrase(d) + ' (niveau ' + alert + ').';
      if (isOutdoor(p)) line += ' Activez votre offre int\u00e9rieure.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note interne. Jour de pointe + m\u00e9t\u00e9o d\u00e9grad\u00e9e. Adapter offre.'; }
    }
  );

  // C22 — ft_quiet_good_weather
  reg('ft_quiet_good_weather', 'Jour calme + conditions favorables', 'OPPORTUNIT\u00c9', '\ud83d\udfe2', '#2E7D32', 'action', 'pulse#radar-score',
    function(a, p, d) {
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var line = 'Jour habituellement calme mais conditions id\u00e9ales : beau temps et concurrence faible (\u00d7' + pr.toFixed(1) + ').';
      if (a.ft_peak_busyness_pct != null) line += ' Pic habituel ' + (a.ft_peak_hour != null ? 'vers ' + Number(a.ft_peak_hour) + 'h ' : '') + '\u00e0 ' + Number(a.ft_peak_busyness_pct) + ' % d\u2019affluence.';
      line += ' Opportunit\u00e9 de capter du trafic suppl\u00e9mentaire.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Jour calme, beau temps. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Conditions id\u00e9ales. Horaires. Max 1500 car.'; }
    }
  );

  // C23 — ft_peak_saturated
  reg('ft_peak_saturated', 'Jour de pointe satur\u00e9', 'CONCURRENCE', '\ud83d\udfe0', '#E65100', 'action', 'pulse#carte',
    function(a, p, d) {
      var rank = num(a.ft_rank) || 0;
      var pctSame = num(a.pct_same_sector || d.pct_same_bucket_5km) || 0;
      var pk = (a.ft_peak_hour != null) ? ', pic habituel vers ' + Number(a.ft_peak_hour) + 'h' + (a.ft_peak_busyness_pct != null ? ' (affluence ' + Number(a.ft_peak_busyness_pct) + ' %)' : '') : '';
      var line = 'Pic de fr\u00e9quentation (rang ' + rank + pk + ') mais ' + Math.round(pctSame) + '% du secteur en concurrence directe.';
      var edge = userEdge(p); if (edge) line += ' D\u00e9marquez-vous : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Jour de pointe, d\u00e9marquez-vous. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      note_interne: function(a, p, d) { return 'Note interne. Pic + saturation ' + num(a.pct_same_sector) + '%. Diff\u00e9rencier.'; }
    }
  );

  // C24 — ft_peak_low_comp
  reg('ft_peak_low_comp', 'Jour de pointe + faible concurrence', 'OPPORTUNIT\u00c9', '\ud83d\ude80', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rank = num(a.ft_rank) || 0;
      var pr = Number(a.pressure_ratio || d.competition_pressure_ratio || 0);
      var pk = (a.ft_peak_hour != null) ? ', pic habituel vers ' + Number(a.ft_peak_hour) + 'h' + (a.ft_peak_busyness_pct != null ? ' (affluence ' + Number(a.ft_peak_busyness_pct) + ' %)' : '') : '';
      var line = 'Pic de fr\u00e9quentation (rang ' + rank + pk + ') et pression faible (\u00d7' + pr.toFixed(1) + '). Fen\u00eatre en or.';
      var edge = userEdge(p); if (edge) line += ' Mettez en avant : ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Jour de pointe, peu de concurrence. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Journ\u00e9e id\u00e9ale. Horaires + offre. Max 1500 car.'; },
      facebook: function(a, p, d) { return 'Post Facebook pour ' + siteName(p) + '. Jour de pointe favorable. Horaires : ' + todayHours(p) + '. ' + (userEdge(p) || '') + '.'; }
    }
  );

  // C25 — ft_peak_tourism_vacation
  reg('ft_peak_tourism_vacation', 'Jour de pointe + tourisme + vacances', 'OPPORTUNIT\u00c9', '\ud83c\udf1f', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rank = num(a.ft_rank) || 0;
      var idx = num(a.tourism_index || d.tourism_index_region) || 0;
      var pk = (a.ft_peak_hour != null) ? ' vers ' + Number(a.ft_peak_hour) + 'h' + (a.ft_peak_busyness_pct != null ? ' (affluence ' + Number(a.ft_peak_busyness_pct) + ' %)' : '') : '';
      var line = 'Triple signal : pic de fr\u00e9quentation (rang ' + rank + pk + '), tourisme (' + Math.round(idx) + '), vacances. Affluence maximale attendue.';
      var edge = userEdge(p); if (edge) line += ' ' + trunc(edge, 80) + '.';
      return line;
    },
    {
      instagram: function(a, p, d) { return 'Post Instagram pour ' + siteName(p) + '. Pic + tourisme + vacances. ' + (userEdge(p) || '') + '. Max 2200 car.'; },
      gbp: function(a, p, d) { return 'Post GBP pour ' + siteName(p) + '. Affluence max attendue. Horaires. Max 1500 car.'; }
    }
  );

  // C26 — ft_peak_mobility
  reg('ft_peak_mobility', 'Jour de pointe mais mobilit\u00e9 perturb\u00e9e', 'URGENT', '\ud83d\udea7', '#B71C1C', 'action', 'pulse#radar-changes',
    function(a, p, d) {
      var rank = num(a.ft_rank) || 0;
      var pk = (a.ft_peak_hour != null) ? ', pic habituel vers ' + Number(a.ft_peak_hour) + 'h' + (a.ft_peak_busyness_pct != null ? ' (affluence ' + Number(a.ft_peak_busyness_pct) + ' %)' : '') : '';
      var stop = p.nearest_transit_stop_name || '';
      var line = 'Pic de fr\u00e9quentation (rang ' + rank + pk + ') mais acc\u00e8s perturb\u00e9' + (stop ? ' (' + stop + ')' : '') + '. Risque de perte de trafic significative.';
      line += ' Communiquez des alternatives d\u2019acc\u00e8s.';
      return line;
    },
    {
      note_interne: function(a, p, d) { return 'Note urgente. Jour de pointe + mobilit\u00e9 perturb\u00e9e. Signal\u00e9tique + comm acc\u00e8s.'; },
      website: function(a, p, d) { return 'Banni\u00e8re. Jour de pointe, perturbation acc\u00e8s. Itin\u00e9raire alternatif.'; }
    }
  );

  // C27 — weekly_briefing
  reg('weekly_briefing', 'Bilan hebdomadaire', 'INTELLIGENCE', '\ud83d\udcca', '#1565C0', 'notification', 'pulse#radar-score',
    function(a, p, d) {
      var avgScore = num(a.avg_score) || 0;
      var daysA = num(a.days_regime_a) || 0;
      var daysC = num(a.days_regime_c) || 0;
      var daysWx = num(a.days_weather_alert) || 0;
      var avgPr = Number(a.avg_pressure_ratio || 0);
      var parts = ['Score moyen : ' + Math.round(avgScore) + '/10'];
      if (daysA > 0) parts.push(daysA + 'j r\u00e9gime A');
      if (daysC > 0) parts.push(daysC + 'j r\u00e9gime C');
      if (daysWx > 0) parts.push(daysWx + 'j alerte m\u00e9t\u00e9o');
      parts.push('pression moy. \u00d7' + avgPr.toFixed(1));
      return parts.join(' \u00b7 ') + '.';
    },
    {
      email: function(a, p, d) { return 'Bilan hebdomadaire pour ' + siteName(p) + '. Score moyen ' + num(a.avg_score) + '/10, ' + num(a.days_regime_a) + 'j favorables, ' + num(a.days_regime_c) + 'j d\u00e9favorables.'; },
      note_interne: function(a, p, d) { return 'Bilan semaine. Score moy ' + num(a.avg_score) + '/10. ' + num(a.days_regime_a) + 'j r\u00e9gime A, ' + num(a.days_regime_c) + 'j r\u00e9gime C. Pression moy \u00d7' + Number(a.avg_pressure_ratio||0).toFixed(1) + '.'; }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE / ATTRIBUTE (sales — NOTER bucket)
  // ═══════════════════════════════════════════════════════════════════════════

  // sales_missed_opportunity — ATTRIBUTE. Reads payload only: daily_revenue, avg_30d,
  // revenue_vs_avg_pct, regime, pressure_ratio, weather_alert. €-gap is measured (T1);
  // regime/pressure/weather are model signals (T2). No score shown (scale bug). No T3.
  reg('sales_missed_opportunity', 'Opportunité manquée — créez une règle', 'INTELLIGENCE', '💸', '#B45309', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
      var pctBelow = a.revenue_vs_avg_pct != null ? Math.abs(Math.round(Number(a.revenue_vs_avg_pct))) : null;
      var gap = (avg != null && rev != null) ? Math.round(avg - rev) : null;
      var regime = a.regime || '';
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var alert = Number(a.weather_alert || 0);

      var line = (rev != null && avg != null)
        ? 'CA ' + rev + ' € — ~' + gap + ' € sous votre moyenne 30j (' + avg + ' €' + (pctBelow != null ? ', -' + pctBelow + ' %' : '') + ').'
        : 'CA en retrait sur votre moyenne 30j.';

      var fav = [];
      if (regime === 'A' || regime === 'B') fav.push('régime ' + regime);
      if (pr != null && pr < 1) fav.push('concurrence faible (×' + pr.toFixed(1) + ')');
      if (alert === 0) fav.push('météo favorable');
      if (fav.length) line += ' Or le contexte était favorable : ' + fav.join(', ') + '.';

      return line;
    },
    {
      note_interne: function(a, p, d) {
        var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
        var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
        var gap = (avg != null && rev != null) ? Math.round(avg - rev) : null;
        return 'Note interne ' + siteName(p) + '. Jour bien noté mais CA ' + (rev != null ? rev + ' €' : 'en retrait') + (gap != null ? ', écart ~' + gap + ' € vs moyenne 30j (' + avg + ' €)' : '') + '. Identifier la cause (effectif, amplitude horaire, communication) et définir une règle pour les prochains jours favorables.';
      },
      email: function(a, p, d) {
        var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
        var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
        return 'Email interne ' + siteName(p) + '. Objet : créneau favorable sous-exploité. CA ' + (rev != null ? rev + ' €' : 'en retrait') + ' vs moyenne 30j ' + (avg != null ? avg + ' €' : '') + ' sur un jour bien noté. Proposer une routine pour les prochains jours favorables (publication J-2, renfort accueil).';
      }
    }
  );

  // sales_underperformance — ATTRIBUTE. Payload: daily_revenue, avg_30d, revenue_vs_avg_pct,
  // pressure_ratio, weather_alert, driver (EN token), top_competitor, events_5km.
  // €-shortfall T1; cause is model-implied → hedged as "probable".
  reg('sales_underperformance', 'CA en retrait — cause probable', 'INTELLIGENCE', '📉', '#B45309', 'notification', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
      var pctBelow = a.revenue_vs_avg_pct != null ? Math.abs(Math.round(Number(a.revenue_vs_avg_pct))) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var alert = Number(a.weather_alert || 0);
      var comp = a.events_5km != null ? Number(a.events_5km) : null;
      var driverFr = ({competition:'concurrence', major_realization_risk:'risque majeur', baseline_insufficient:'données insuffisantes'})[a.driver] || null;

      var line = (rev != null && avg != null)
        ? 'CA ' + rev + ' € — ' + (pctBelow != null ? '-' + pctBelow + ' %' : 'en net retrait') + ' vs votre moyenne 30j (' + avg + ' €).'
        : 'CA en net retrait vs votre moyenne 30j.';

      if (pr != null && pr > 1.3) {
        line += ' Cause probable : pression concurrentielle ×' + pr.toFixed(1) + (comp != null ? ' (' + comp + ' événements à 5 km)' : '');
        if (a.top_competitor) line += ', principal ' + a.top_competitor;
        line += '.';
      } else if (alert >= 2) {
        line += ' Cause probable : conditions météo défavorables.';
      } else if (driverFr) {
        line += ' Facteur dominant : ' + driverFr + '.';
      }
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
        var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
        var pctBelow = a.revenue_vs_avg_pct != null ? Math.abs(Math.round(Number(a.revenue_vs_avg_pct))) : null;
        return 'Note interne ' + siteName(p) + '. CA ' + (rev != null ? rev + ' €' : 'en net retrait') + (pctBelow != null ? ' (-' + pctBelow + ' % vs moyenne 30j' + (avg != null ? ', ' + avg + ' €' : '') + ')' : '') + '. Vérifier la cause probable et les leviers correctifs (effectif, horaires, communication).';
      },
      email: function(a, p, d) {
        var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
        var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
        return 'Email interne ' + siteName(p) + '. Objet : CA en retrait. ' + (rev != null ? rev + ' €' : 'En net retrait') + (avg != null ? ' vs ' + avg + ' € (moyenne 30j)' : '') + '. Cause probable et actions correctives à discuter.';
      }
    }
  );

  // Weekday named explicitly from a card's date — "vos samedis", never "vos jours comparables".
  var MS_DOW_FR_PLURAL = ['dimanches', 'lundis', 'mardis', 'mercredis', 'jeudis', 'vendredis', 'samedis'];
  window.msWeekdayFr = function (dateStr) {
    try { return MS_DOW_FR_PLURAL[new Date(String(dateStr) + 'T00:00:00Z').getUTCDay()] || 'jours comparables'; }
    catch (e) { return 'jours comparables'; }
  };

  // sales_surge — ATTRIBUTE. Payload: daily_revenue, avg_30d, revenue_vs_avg_pct,
  // pressure_ratio, weather_alert, driver, is_holiday, is_vacation, events_5km.
  // €-rise T1; favourable context T1/T2; "à reproduire" is advice, not a claim.
  reg('sales_surge', 'CA supérieur à vos jours comparables', 'OPPORTUNITÉ', '📈', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var exp = a.expected_revenue != null ? Math.round(Number(a.expected_revenue)) : null;
      var resid = a.residual_pct != null ? Math.round(Number(a.residual_pct)) : null;
      var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
      var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var alert = Number(a.weather_alert || 0);
      var dz = a.revenue_robust_z != null ? Math.abs(Number(a.revenue_robust_z)) : null;

      var jours = window.msWeekdayFr(a.affected_date);
      var line = (rev != null ? 'CA ' + rev + ' € — ' : '') + 'une très bonne journée, ' + ((dz != null && dz >= 2) ? 'nettement ' : '') + 'au-dessus de vos ' + jours + '.';

      if (tx != null && bk != null) {
        line += (Math.abs(tx) >= Math.abs(bk))
          ? ' La hausse vient de l\'affluence : ' + (tx >= 0 ? '+' : '') + tx + ' % de tickets, panier ' + (bk >= 0 ? '+' : '') + bk + ' %.'
          : ' La hausse vient du panier moyen (' + (bk >= 0 ? '+' : '') + bk + ' %), pas du volume.';
      }

      if (a.is_holiday || a.is_vacation) {
        line += ' Contexte porteur : ' + (a.is_holiday ? 'jour férié' : 'vacances scolaires') + '.';
      } else if (pr != null && pr < 0.85) {
        line += ' Concurrence faible ce jour-là.';
      } else if (alert === 0) {
        line += ' Météo favorable.';
      }
      return line;
    },
    {
      instagram: function(a, p, d) {
        var pctUp = a.revenue_vs_avg_pct != null ? Math.round(Number(a.revenue_vs_avg_pct)) : null;
        return 'Post Instagram pour ' + siteName(p) + '. Belle journée' + (pctUp != null ? ' (+' + pctUp + ' % vs habitude)' : '') + ' — capitalisez sur le momentum. Mettre en avant : ' + (userEdge(p) || 'votre offre') + '. Max 2200 car.';
      },
      note_interne: function(a, p, d) {
        var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
        var exp = a.expected_revenue != null ? Math.round(Number(a.expected_revenue)) : null;
        var resid = a.residual_pct != null ? Math.round(Number(a.residual_pct)) : null;
        var soft = msSalesConfidence(a) === 'possible';
        return 'Aux équipes' + (soft ? ' — à noter ensemble : ' : ' : ') + 'belle journée' + (resid != null ? ', CA +' + resid + ' % au-dessus de l\'attendu pour ce jour' : '') + (rev != null && exp != null ? ' (' + rev + ' € vs ' + exp + ' € attendus)' : '') + '. ' + (soft ? 'Notons ce qui a marché aujourd\'hui (offre, accueil, mise en avant) pour voir si on peut le reproduire.' : 'Documentons les conditions du jour et rejouons cette routine sur les prochaines fenêtres comparables.');
      }
    }
  );

  // sales_competition_cannibalization — ATTRIBUTE (hedged). Payload: daily_revenue,
  // revenue_yesterday, revenue_delta_pct, pressure_ratio, top_competitor,
  // competitor_distance_km, competitor_overlap_pct, competitor_threat_level.
  // CO-OCCURRENCE only — never asserts the competitor caused the drop (T3 risk).
  reg('sales_competition_cannibalization', 'CA en baisse — concurrence à surveiller', 'CONCURRENCE', '📉', '#D32F2F', 'notification', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var yest = a.revenue_yesterday != null ? Math.round(Number(a.revenue_yesterday)) : null;
      var delta = a.revenue_delta_pct != null ? Math.round(Number(a.revenue_delta_pct)) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var overlap = a.competitor_overlap_pct != null ? Math.round(Number(a.competitor_overlap_pct) * 100) : null;

      var line = (rev != null && yest != null)
        ? 'CA ' + rev + ' € — ' + (delta != null ? delta + ' %' : 'en baisse') + ' vs la veille (' + yest + ' €).'
        : 'CA en baisse vs la veille.';

      if (pr != null) line += ' Concomitant à une pression concurrentielle ×' + pr.toFixed(1) + '.';
      if (a.top_competitor) {
        line += ' Concurrent le plus proche : ' + a.top_competitor;
        if (a.competitor_distance_km != null) line += ' à ' + Number(a.competitor_distance_km).toFixed(1) + ' km';
        if (overlap != null) line += ' (audience estimée commune ' + overlap + ' %)';
        line += '.';
      }
      return line;
    },
    {
      slack: function(a, p, d) {
        var delta = a.revenue_delta_pct != null ? Math.round(Number(a.revenue_delta_pct)) : null;
        var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
        return 'CA ' + (delta != null ? delta + ' %' : 'en baisse') + ' vs la veille pour ' + siteName(p) + ', concomitant à une pression ×' + (pr != null ? pr.toFixed(1) : '?') + (a.top_competitor ? '. Concurrent proche : ' + a.top_competitor : '') + '. À surveiller.';
      },
      note_interne: function(a, p, d) {
        return 'Note interne ' + siteName(p) + '. Baisse de CA jour-sur-jour concomitante à une pression concurrentielle élevée' + (a.top_competitor ? ' (' + a.top_competitor + ' à proximité)' : '') + '. Co-occurrence à confirmer avant d\'en tirer une conclusion.';
      }
    }
  );

  // sales_traffic_not_converting — PERFORMANCE. Payload: footfall_delta_pct,
  // conversion_delta_pct, conversion_rate, daily_visitors, primary_revenue_driver.
  reg('sales_traffic_not_converting', 'Trafic sans conversion', 'INTELLIGENCE', '🚶', '#B45309', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var foot = a.footfall_delta_pct != null ? Math.round(Number(a.footfall_delta_pct)) : null;
      var cz = a.conversion_robust_z != null ? Number(a.conversion_robust_z) : null;
      var rateN = a.conversion_rate != null ? Number(a.conversion_rate) * 100 : null;
      var cdp = a.conversion_delta_pct != null ? Number(a.conversion_delta_pct) : null;
      var usual = (rateN != null && cdp != null && (100 + cdp) > 0) ? rateN * 100 / (100 + cdp) : null;
      var vis = a.daily_visitors != null ? num(a.daily_visitors) : null;
      var line = 'Le public était là';
      var _fb = [];
      if (vis != null) _fb.push(vis + ' visiteurs');
      if (foot != null) _fb.push('fréquentation ' + (foot >= 0 ? '+' : '') + foot + ' % vs habitude');
      if (_fb.length) line += ' (' + _fb.join(', ') + ')';
      line += ' mais peu d\'achats : ' + (rateN != null ? Math.round(rateN) + ' % des visiteurs achètent aujourd\'hui' : 'conversion en retrait') + (usual != null ? ', contre ~' + Math.round(usual) + ' % d\'ordinaire' : ' (sous votre norme du même jour)') + '.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var foot = a.footfall_delta_pct != null ? Math.round(Number(a.footfall_delta_pct)) : null;
        var cz = a.conversion_robust_z != null ? Number(a.conversion_robust_z) : null;
        var soft = msSalesConfidence(a) === 'possible';
        return 'Aux équipes de vente' + (soft ? ' — à vérifier ensemble : ' : ' : ') + 'du monde en boutique' + (foot != null ? ' (fréquentation ' + (foot >= 0 ? '+' : '') + foot + ' %)' : '') + ' mais peu d\'achats' + (cz != null ? ' (conversion nettement sous notre norme habituelle)' : '') + '. ' + (soft ? 'Regardons ensemble l\'accueil, la caisse et la mise en avant produit pour comprendre le blocage.' : 'Renforçons l\'accueil et la caisse aujourd\'hui, et mettons en place une routine pour les journées à fort passage.');
      }
    }
  );

  // sales_discount_no_lift — PERFORMANCE. Payload: discount_rate,
  // discount_rate_delta_pct, revenue_vs_30d_avg_pct, daily_revenue.
  reg('sales_discount_no_lift', 'Remises sans effet', 'INTELLIGENCE', '🏷️', '#B45309', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var drN = a.discount_rate != null ? Number(a.discount_rate) * 100 : null;
      var ddp = a.discount_rate_delta_pct != null ? Number(a.discount_rate_delta_pct) : null;
      var drUsual = (drN != null && ddp != null && (100 + ddp) > 0) ? drN * 100 / (100 + ddp) : null;
      var line = 'Vous avez remisé ' + (drN != null ? drN.toFixed(1) + ' % du CA aujourd\'hui' : 'plus que d\'habitude') + (drUsual != null ? ', contre ~' + drUsual.toFixed(1) + ' % d\'ordinaire' : '') + ' — sans que le CA suive.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var dz = a.discount_robust_z != null ? Number(a.discount_robust_z) : null;
        var dr = a.discount_rate != null ? (Number(a.discount_rate) * 100).toFixed(1) : null;
        var soft = msSalesConfidence(a) === 'possible';
        return 'Aux équipes commerciales' + (soft ? ' — à vérifier ensemble : ' : ' : ') + 'nos remises sont montées bien au-dessus de l\'habituel' + (dr != null ? ' (' + dr + ' % du CA aujourd\'hui)' : '') + ' sans que le chiffre d\'affaires suive. ' + (soft ? 'Regardons si le ciblage des promos est le bon avant de reconduire.' : 'Recentrons les remises sur les clients à forte valeur et arrêtons les promotions non nécessaires.');
      }
    }
  );

  // sales_revenue_down_wow — PERFORMANCE. Payload: revenue_vs_avg_pct, avg_30d,
  // daily_revenue, revenue_robust_z, primary_revenue_driver, transactions_delta_pct,
  // basket_delta_pct, confidence_tier. Dow-band anomaly (not a same-weekday day-pair).
  reg('sales_revenue_down_wow', 'CA inférieur à vos jours comparables', 'INTELLIGENCE', '📉', '#B45309', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
      var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
      var dz = a.revenue_robust_z != null ? Math.abs(Number(a.revenue_robust_z)) : null;
      var driver = ({footfall:'moins de trafic', transactions:'moins de ventes (tickets)', basket:'un panier moyen plus faible', conversion:'une conversion plus faible'})[a.primary_revenue_driver] || null;
      var jours = window.msWeekdayFr(a.affected_date);
      var line = (rev != null ? 'CA ' + rev + ' € — ' : '') + 'journée en retrait, ' + ((dz != null && dz >= 2) ? 'nettement ' : '') + 'sous vos ' + jours + '.';
      if (driver) {
        line += ' Le recul vient ' + (/^[aeiou]/i.test(driver) ? "d'" : 'de ') + driver + '.';
      } else if (tx != null && bk != null) {
        line += ' Deux facteurs : ventes ' + (tx >= 0 ? '+' : '') + tx + ' %, panier ' + (bk >= 0 ? '+' : '') + bk + ' %.';
      }
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var resid = a.residual_pct != null ? Math.round(Number(a.residual_pct)) : null;
        var exp = a.expected_revenue != null ? Math.round(Number(a.expected_revenue)) : null;
        var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
        var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
        var driverN = ({footfall:'le trafic', transactions:'le volume de ventes', basket:'le panier moyen', conversion:'la conversion'})[a.primary_revenue_driver];
        var lever = (a.primary_revenue_driver === 'both')
          ? 'le volume de ventes (' + (tx != null ? (tx >= 0 ? '+' : '') + tx + ' %' : '?') + ') et le panier (' + (bk != null ? (bk >= 0 ? '+' : '') + bk + ' %' : '?') + ')'
          : (driverN || 'plusieurs facteurs');
        var soft = msSalesConfidence(a) === 'possible';
        return 'Aux équipes de vente' + (soft ? ' — à vérifier ensemble : ' : ' : ') + 'notre CA est passé sous l\'attendu pour ce jour' + (resid != null ? ' (' + Math.abs(resid) + ' % sous l\'attendu' + (exp != null ? ', ' + exp + ' € attendus' : '') + ')' : '') + ', tiré par ' + lever + '. ' + (soft ? 'Confirmons si c\'est ponctuel avant d\'agir, et surveillons les prochains jours.' : 'Agissons sur ' + lever + ' cette semaine et suivons l\'effet.');
      }
    }
  );

  // footfall_vs_basket_decomposition — PERFORMANCE. Payload: revenue_vs_30d_avg_pct,
  // daily_revenue, revenue_30d_avg, daily_transactions, avg_basket,
  // transactions_delta_pct, basket_delta_pct, dominant_factor.
  reg('footfall_vs_basket_decomposition', 'Ventes ou panier — d\u2019o\u00f9 vient le mouvement', 'INTELLIGENCE', '\ud83e\uddee', '#B45309', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var revPct = a.revenue_vs_30d_avg_pct != null ? Math.round(Number(a.revenue_vs_30d_avg_pct)) : null;
      var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
      var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
      var dom = a.dominant_factor || ((tx != null && bk != null && Math.abs(tx) >= Math.abs(bk)) ? 'transactions' : 'basket');
      var line = 'CA ' + (rev != null ? rev + ' \u20ac ' : '') + (revPct != null ? '(' + (revPct >= 0 ? '+' : '') + revPct + ' % vs moyenne 30j)' : 'en mouvement') + '.';
      if (tx != null && bk != null) {
        line += ' Nombre de ventes ' + (tx >= 0 ? '+' : '') + tx + ' %, panier moyen ' + (bk >= 0 ? '+' : '') + bk + ' % vs habitude.';
      }
      line += dom === 'transactions' ? ' Le volume de ventes porte le mouvement.' : ' Le panier moyen porte le mouvement.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var revPct = a.revenue_vs_30d_avg_pct != null ? Math.round(Number(a.revenue_vs_30d_avg_pct)) : null;
        var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
        var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
        var dom = a.dominant_factor || ((tx != null && bk != null && Math.abs(tx) >= Math.abs(bk)) ? 'transactions' : 'basket');
        return 'Note interne ' + siteName(p) + '. CA ' + (revPct != null ? (revPct >= 0 ? '+' : '') + revPct + ' % vs moyenne 30j' : 'en mouvement') + ' : nombre de ventes ' + (tx != null ? (tx >= 0 ? '+' : '') + tx + ' %' : '?') + ', panier moyen ' + (bk != null ? (bk >= 0 ? '+' : '') + bk + ' %' : '?') + ' vs habitude. ' + (dom === 'transactions' ? 'Levier dominant : volume (fr\u00e9quentation / conversion).' : 'Levier dominant : panier (mix produit / mont\u00e9e en gamme).') + ' Tracer pour comparer aux prochains jours.';
      }
    }
  );

  // proven_action_replication — LEARNING. Payload: learned_action_type,
  // avg_revenue_delta_pct, positive_rate, measurable_count, window_days.
  reg('proven_action_replication', 'Action à reproduire', 'OPPORTUNITÉ', '🔁', '#2E7D32', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var avg = a.avg_revenue_delta_pct != null ? Math.round(Number(a.avg_revenue_delta_pct)) : null;
      var n = a.measurable_count != null ? Number(a.measurable_count) : null;
      var rate = a.positive_rate != null ? Math.round(Number(a.positive_rate) * 100) : null;
      var win = a.window_days != null ? Number(a.window_days) : null;
      var line = 'Sur ' + (win != null ? 'les ' + win + ' derniers jours' : 'la période récente') + ', les jours où ce type d\'action a été publié, le CA était en moyenne ' + (avg != null ? (avg >= 0 ? '+' : '') + avg + ' %' : 'au-dessus') + ' vs votre référence';
      if (n != null) line += ' (' + n + ' publication' + (n > 1 ? 's' : '') + ' mesurée' + (n > 1 ? 's' : '') + (rate != null ? ', ' + rate + ' % au-dessus' : '') + ')';
      line += '. Association observée, pas une garantie.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var avg = a.avg_revenue_delta_pct != null ? Math.round(Number(a.avg_revenue_delta_pct)) : null;
        var n = a.measurable_count != null ? Number(a.measurable_count) : null;
        return 'Note interne ' + siteName(p) + '. Une action récurrente est associée à un CA en moyenne ' + (avg != null ? (avg >= 0 ? '+' : '') + avg + ' %' : 'supérieur') + ' vs référence' + (n != null ? ' sur ' + n + ' publication(s) mesurée(s)' : '') + '. À reproduire sur des jours comparables et continuer à mesurer (association, pas causalité).';
      }
    }
  );

  // offering_mix_shift — PERFORMANCE. Payload: item_category, revenue_share,
  // baseline_share, share_delta_points, direction, category_revenue, revenue_rank.
  reg('offering_mix_shift', 'Bascule de votre mix', 'INTELLIGENCE', '🛍️', '#1565C0', 'action', 'pulse#day-detail',
    function(a, p, d) {
      var cat = a.item_category || 'Une catégorie';
      var share = a.revenue_share != null ? Math.round(Number(a.revenue_share) * 100) : null;
      var base = a.baseline_share != null ? Math.round(Number(a.baseline_share) * 100) : null;
      var dpts = a.share_delta_points != null ? Math.round(Number(a.share_delta_points)) : null;
      var dir = a.direction || (dpts != null && dpts < 0 ? 'collapse' : 'surge');
      var line = cat + ' représente ' + (share != null ? share + ' %' : 'une part inhabituelle') + ' de votre CA ce jour';
      if (base != null) line += ' vs ' + base + ' % en moyenne';
      if (dpts != null) line += ' (' + (dpts >= 0 ? '+' : '') + dpts + ' pts)';
      line += '.';
      line += dir === 'collapse' ? ' Catégorie qui décroche.' : ' Catégorie qui surperforme.';
      return line;
    },
    {
      note_interne: function(a, p, d) {
        var cat = a.item_category || 'une catégorie';
        var share = a.revenue_share != null ? Math.round(Number(a.revenue_share) * 100) : null;
        var base = a.baseline_share != null ? Math.round(Number(a.baseline_share) * 100) : null;
        var dir = a.direction || 'surge';
        return 'Note interne ' + siteName(p) + '. ' + cat + ' = ' + (share != null ? share + ' %' : 'part inhabituelle') + ' du CA ce jour vs ' + (base != null ? base + ' %' : 'la normale') + '. ' + (dir === 'collapse' ? 'Catégorie en recul : vérifier stock, visibilité, prix.' : 'Catégorie qui surperforme : sécuriser le réassort et la mettre en avant.');
      }
    }
  );

  // ─── BAR CLASS / PILL MAPPINGS ───────────────────────────────────────────

  var CAT_BAR = {
    'URGENT': 'ab-threat',
    'CONCURRENCE': 'ab-warning',
    'M\u00c9T\u00c9O': 'ab-warning',
    'OPPORTUNIT\u00c9': 'ab-opportunity',
    'INTELLIGENCE': 'ab-info',
    'PLANIFICATION': 'ab-info',
    'R\u00c9PUTATION': 'ab-info'
  };

  var CAT_URGENCY = {
    'URGENT': { label: 'Urgent', style: 'background:#FEE2E2;color:#991B1B;' },
    'CONCURRENCE': { label: 'Concurrence', style: 'background:#FEF3C7;color:#92400E;' },
    'M\u00c9T\u00c9O': { label: 'M\u00e9t\u00e9o', style: 'background:#FEF3C7;color:#92400E;' },
    'OPPORTUNIT\u00c9': { label: 'Opportunit\u00e9', style: 'background:#D1FAE5;color:#065F46;' },
    'INTELLIGENCE': { label: 'Intelligence', style: 'background:#EFF6FF;color:#1e40af;' },
    'PLANIFICATION': { label: 'Planification', style: 'background:#F3F4F6;color:#374151;' },
    'R\u00c9PUTATION': { label: 'R\u00e9putation', style: 'background:#EFF6FF;color:#1e40af;' }
  };

  var PRIO_SCORE = { 4: 95, 3: 80, 2: 60, 1: 40 };

  var AWARENESS_ONLY = { regime_c_warning:1, weather_worsened:1, weather_hazard_onset:1, extended_bad_weather:1, extended_bad_weather_3d:1, saturated_bad_weather:1, ft_peak_bad_weather:1, weather_mobility_double:1, mobility_comp_squeeze:1, tourism_mobility_hit:1, ft_peak_mobility:1 };
  var RULE_ONLY = { sales_missed_opportunity:1, sales_surge:1, sales_traffic_not_converting:1, sales_discount_no_lift:1, sales_revenue_down_wow:1, footfall_vs_basket_decomposition:1, proven_action_replication:1, competitor_positioning_gap:1, offering_mix_shift:1 };

  // ─── CHANNEL AVAILABILITY ────────────────────────────────────────────────
  function getAvailableChannels(actionType, prof, channelConfig) {
    var spec = SPECS[actionType];
    if (!spec || spec.card_type === 'notification') return [];
    if (RULE_ONLY[actionType]) return [];
    var seeds = spec.draft_seeds || {};
    var cc = channelConfig || {};
    var channels = [];
    // A card that declares a public social seed (instagram) is a public-communicate card.
    // Offer GBP + Facebook for it too when the client has them, even without a bespoke seed —
    // getDraftSeed synthesizes one from the card's own sowhat. Internal-only cards
    // (no instagram seed) are unaffected and stay on note_interne/email/slack.
    var isPublicComm = !!seeds.instagram;
    if ((seeds.gbp || isPublicComm) && cc.gbp) channels.push({ key: 'gbp', label: 'Google Business Profile', charLimit: 1500 });
    if (seeds.instagram && !!prof.instagram_url) channels.push({ key: 'instagram', label: 'Instagram', charLimit: 2200 });
    if ((seeds.facebook || isPublicComm) && !!prof.facebook_url) channels.push({ key: 'facebook', label: 'Facebook', charLimit: null });
    if (seeds.email && cc.email) channels.push({ key: 'email', label: 'Email', charLimit: null });
    if (seeds.sms) channels.push({ key: 'sms', label: 'SMS', charLimit: 160 });
    if (seeds.whatsapp && cc.whatsapp) channels.push({ key: 'whatsapp', label: 'WhatsApp', charLimit: 1000 });
    if (seeds.slack && cc.slack) channels.push({ key: 'slack', label: 'Slack', charLimit: null });
    if (seeds.note_interne || channels.length === 0) channels.push({ key: 'note_interne', label: 'Note interne', charLimit: null }); 
    if (seeds.website && !!prof.website_url) channels.push({ key: 'website', label: 'Site web', charLimit: null });
    return channels;
  }

  // Corroboration-aware confidence for residual sales cards: the residual model
  // AND the same-weekday (dow) baseline agreeing raises confidence. Keeps the
  // tier KEYS (possible/probable/confirme) so note_interne soft-gating is intact.
  function msSalesConfidence(a) {
    var rz = (a && a.residual_z != null) ? Math.abs(Number(a.residual_z)) : null;
    if (rz == null) return (a && a.confidence_tier) ? a.confidence_tier : 'possible';
    var dz = (a && a.revenue_robust_z != null) ? Math.abs(Number(a.revenue_robust_z)) : null;
    if (rz >= 2.5 || (rz >= 2 && dz != null && dz >= 2)) return 'confirme';
    if (rz >= 2 || (dz != null && dz >= 2)) return 'probable';
    return 'possible';
  }
  var MS_TIER_LABEL = { possible: 'À confirmer', probable: 'Probable', confirme: 'Confirmé', 'confirmé': 'Confirmé' };
  window.msSalesConfidence = msSalesConfidence;
  window.MS_TIER_LABEL = MS_TIER_LABEL;

  function getDraftSeed(actionType, channel, feedItem, prof, day) {
    var spec = SPECS[actionType];
    if (!spec) return null;
    var seeds = spec.draft_seeds || {};
    if (seeds[channel]) { try { return deLeverStaffing(seeds[channel](feedItem, prof, day)); } catch (e) { return null; } }
    // Synthesized fallback: GBP/Facebook on a public-communicate card with no bespoke seed.
    if ((channel === 'gbp' || channel === 'facebook') && seeds.instagram && typeof spec.sowhat === 'function') {
      try {
        var sw = spec.sowhat(feedItem, prof, day);
        var ctx = (sw && typeof sw === 'object') ? (sw.context || '') : String(sw || '');
        var label = channel === 'gbp' ? 'Post Google Business Profile' : 'Post Facebook';
        var lim = channel === 'gbp' ? ' Max 1500 car.' : '';
        var edge = userEdge(prof);
        return label + ' pour ' + siteName(prof) + '. ' + ctx + ' Mettre en avant : ' + (edge || 'votre offre') + '.' + lim;
      } catch (e) { return null; }
    }
    return null;
  }

  // ─── RENDERER ────────────────────────────────────────────────────────────

  function normalizeDate(d) {
    if (!d) return '';
    var s = (typeof d === 'object' && d.value) ? String(d.value) : String(d);
    return s.slice(0, 10);
  }

  window.renderActionCandidates = function(candidates, prof, currentDay, selectedDate, mode, channelConfig, today) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    var target = normalizeDate(selectedDate);
    var entries = [];
    prof = prof || {};
    currentDay = currentDay || {};
    channelConfig = channelConfig || {};
    // Performance cards (in MS_INTERNAL_ALERT_TYPES) carry an INGESTION date (past, gap 1-30+
    // days), not an action date. They surface on TODAY's brief only, and only the LATEST anomaly
    // per action_type — so multiple anomaly dates of the same type don't produce duplicate-
    // looking cards. The mart's 30-day window feeds the per-type pick; the brief cap sets how
    // many distinct sales types show.
    var _perfTypes = window.MS_INTERNAL_ALERT_TYPES || [];
    var _perfLatest = {};
    for (var _pi = 0; _pi < candidates.length; _pi++) {
      var _pat = candidates[_pi].action_type || '';
      if (_perfTypes.indexOf(_pat) < 0) continue;
      var _pd = normalizeDate(candidates[_pi].date);
      if (!_perfLatest[_pat] || _pd > _perfLatest[_pat]) _perfLatest[_pat] = _pd;
    }
    var _todayN = today ? normalizeDate(today) : '';
    for (var i = 0; i < candidates.length; i++) {
      var ac = candidates[i];
      var acDate = normalizeDate(ac.date);
      var actionType = ac.action_type || '';
      if (_perfTypes.indexOf(actionType) >= 0) {
        if (!_todayN || target !== _todayN || acDate !== _perfLatest[actionType]) continue;
      } else if (acDate !== target) {
        continue;
      }
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
      var actionText = '';
      var whatText = '';
      if (spec) {
        try { var _swObj = spec.sowhat(feedItem, prof, mergedDay, mode || 'veille'); if (_swObj && typeof _swObj === 'object') { if (_swObj.action) actionText = String(_swObj.action); sowhatText = _swObj.context != null ? String(_swObj.context) : ''; } else { sowhatText = String(_swObj == null ? '' : _swObj); } var _sArr = String(sowhatText || '').split('. '); var _s1 = _sArr.slice(0, 2).join('. '); if (_s1 && !_s1.endsWith('.')) _s1 += '.'; sowhatText = _s1.length > 200 ? _s1.slice(0, 197) + '...' : _s1; } catch (e) { sowhatText = actionType + ' \u2014 donn\u00e9es indisponibles.'; }
        whatText = spec.brand_label_fr;
        // Name the actual weekday on the sales movement cards — never "jours comparables".
        if (actionType === 'sales_surge') whatText = 'CA supérieur à vos ' + window.msWeekdayFr(feedItem.affected_date);
        else if (actionType === 'sales_revenue_down_wow') whatText = 'CA inférieur à vos ' + window.msWeekdayFr(feedItem.affected_date);
      } else {
        sowhatText = actionType + ' \u2014 type non reconnu.';
        whatText = actionType.replace(/_/g, ' ');
      }
      sowhatText = deLeverStaffing(sowhatText); actionText = deLeverStaffing(actionText);
      var catLabel = spec ? spec.category_label_fr : (ac.action_category || 'INTELLIGENCE');
      var barClass = CAT_BAR[catLabel] || 'ab-info';
      var brandLabel = spec ? spec.category_label_fr : actionType.replace(/_/g, ' ');
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
      var item = { change_subtype: actionType, affected_date: ac.date, alert_level: ac.action_priority || 0, location_id: ac.location_id || null, location_label: currentDay.location_label || '', action_category: ac.action_category, card_instance_id: ac.card_instance_id || null, suppression_key: ac.suppression_key, card_type: cardType };
      if (ac.data_payload) { var dp2 = ac.data_payload; for (var k2 in dp2) { if (dp2.hasOwnProperty(k2) && !item.hasOwnProperty(k2)) item[k2] = dp2[k2]; } }
      var tmpl = { type: barClass === 'ab-opportunity' ? 'opportunity' : barClass === 'ab-threat' ? 'threat' : barClass === 'ab-warning' ? 'threat' : 'info', barClass: barClass, urgencyPill: prioPill, typePill: typePill, what: escHtml(whatText), sowhat: sowhatText, action: actionText, actions: actions, _is_action_candidate: true, confidence_tier: ((item && item.residual_z != null) ? msSalesConfidence(item) : (ac.confidence_tier || (ac.data_payload && ac.data_payload.confidence_tier) || null)), _card_type: cardType, _consulter_target: spec ? spec.consulter_target : null, _spec_action_type: actionType, _available_channels: channels, _draft_seeds: spec ? spec.draft_seeds : {} };
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

  // ── Wrap sowhats to return {context, action, urgency} ──
  var ACTION_SENTENCES = {
    'competitor_event_ending': { action: function(a, p, d) {
      return 'À noter : un événement concurrent se termine. La pression retombe sur cette fenêtre — c\'est peut-être le bon moment pour prendre la parole.';
    }, urgency: 'plan' },
    'competitor_positioning_gap': { action: function(a, p, d) {
      return 'À analyser : votre chiffre d\'affaires repose fortement sur un produit. Comparez votre positionnement à vos concurrents suivis pour repérer les écarts d\'offre exploitables.';
    }, urgency: 'plan' },
    'score_down': { action: function(a, p, d) {
      return 'À noter : votre score d\'opportunité est en baisse. Adaptez votre planning et vos attentes pour cette journée.';
    }, urgency: 'soon' },
    'score_driver_shift': { action: function(a, p, d) {
      return 'À noter : le facteur dominant de votre score change d\'aujourd\'hui à demain. Surveillez ce basculement pour ajuster vos priorités opérationnelles.';
    }, urgency: 'plan' },
    'day_opportunity': { action: function(a, p, d) {
      var regime = a.regime || null;
      return 'À noter : journée favorable' + (regime ? ' (régime ' + regime + ')' : '') + '. Conditions globalement positives — à confirmer avec votre planning.';
    }, urgency: 'plan' },
    'regime_c_warning': { action: function(a, p, d) {
      var s = 'À noter : journée défavorable signalée à venir';
      if (a.forced_c) s += ' (régime C forcé)';
      else if (a.realization_risk) s += ' (risque de réalisation majeur)';
      s += '. Anticipez : reportez les activités sensibles ou prévoyez une alternative.';
      return s;
    }, urgency: 'soon' },
    'competitor_positioning_brief': { action: function(a, p, d) {
      var name = a.competitor_name || 'ce concurrent';
      var r = a.google_rating != null ? Number(a.google_rating).toFixed(1) : null;
      return 'À consulter : analyse de positionnement de ' + name + (r != null ? ' (note ' + r + '/5)' : '') + ' disponible. Ouvrez-la pour situer votre offre face à ce concurrent.';
    }, urgency: 'plan' },
    'competitor_reputation_strength': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent suivi';
      var r = a.google_rating != null ? Number(a.google_rating).toFixed(1) : null;
      var n = a.google_rating_count != null ? Number(a.google_rating_count) : null;
      return 'À noter : ' + name + ' affiche une réputation solide' + (r != null ? ' (' + r + '/5' + (n != null ? ' sur ' + n + ' avis' : '') + ')' : '') + '. Point de comparaison pour votre propre e-réputation.';
    }, urgency: 'plan' },
    'sales_missed_opportunity': { action: function(a, p, d) {
      var avg = a.avg_30d != null ? Math.round(Number(a.avg_30d)) : null;
      var rev = a.daily_revenue != null ? Math.round(Number(a.daily_revenue)) : null;
      var gap = (avg != null && rev != null) ? Math.round(avg - rev) : null;
      var regime = a.regime || '';
      return 'À noter : ' + (gap != null ? 'écart ~' + gap + ' € sur un jour ' + (regime ? 'noté ' + regime : 'favorable') + '. ' : '') + 'Posez une règle pour les prochains jours favorables (publication J-2, renfort accueil) et tracez ce qui a limité ce jour-ci.';
    }, urgency: 'plan' },
    'sales_underperformance': { action: function(a, p, d) {
      var pctBelow = a.revenue_vs_avg_pct != null ? Math.abs(Math.round(Number(a.revenue_vs_avg_pct))) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var alert = Number(a.weather_alert || 0);
      var lever = (pr != null && pr > 1.3) ? 'renforcez votre visibilité face à la concurrence' : (alert >= 2) ? 'communiquez vos conditions adaptées à la météo' : 'vérifiez vos leviers internes (effectif, horaires, communication)';
      return 'À noter : CA ' + (pctBelow != null ? '-' + pctBelow + ' % ' : '') + 'sous la moyenne — ' + lever + ', et tracez la cause pour ne pas la répéter.';
    }, urgency: 'plan' },
    'sales_surge': { action: function(a, p, d) {
      var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
      var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
      var byVol = (tx != null && bk != null) ? (Math.abs(tx) >= Math.abs(bk)) : true;
      var lever = byVol
        ? ('le volume' + (tx != null ? ' (+' + tx + ' % de tickets' + (bk != null ? ', panier ' + (bk >= 0 ? '+' : '') + bk + ' %' : '') + ')' : ''))
        : ('le panier moyen' + (bk != null ? ' (' + (bk >= 0 ? '+' : '') + bk + ' %)' : ''));
      var hook = a.is_vacation ? 'vacances scolaires' : (a.is_holiday ? 'jour férié' : (Number(a.weather_alert || 0) === 0 ? 'météo favorable' : 'contexte du jour'));
      return 'À rejouer : porté par ' + lever + '. Repérez ce qui a amené le monde (' + hook + ', mise en avant, offre) et rejouez-le sur vos prochaines journées comparables.';
    }, urgency: 'plan' },
    'sales_competition_cannibalization': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      return 'À surveiller : baisse concomitante à une pression ×' + (pr != null ? pr.toFixed(1) : '?') + '. Confirmez la récurrence avant d\'agir' + (a.top_competitor ? ' ; gardez un œil sur ' + a.top_competitor : '') + '.';
    }, urgency: 'plan' },
    'high_competition_density': { action: function(a, p, d) {
      return 'À temporiser : n\'en faites pas votre créneau de communication prioritaire. Gardez vos ressources pour une fenêtre moins disputée et misez sur un angle différenciant plutôt que sur le volume.';
    }, urgency: 'soon' },
    'competitor_threat_direct': { action: function(a, p, d) {
      var name = a.competitor_name || null;
      var dist = a.threat_distance_km != null ? Number(a.threat_distance_km) : (a.distance_m != null ? Number(a.distance_m) / 1000 : null);
      var ov = a.audience_overlap_pct != null ? Math.round(Number(a.audience_overlap_pct) * 100) : null;
      var ev = a.event_label || null;
      var s = 'À défendre : ';
      if (name) {
        s += name + (ev ? ' (' + ev + ')' : '');
        if (dist != null) s += ' à ' + dist.toFixed(1) + ' km';
        if (ov != null) s += ', audience estimée commune ' + ov + ' %';
        s += '. ';
      } else { s += 'concurrent actif à proximité. '; }
      s += 'Mettez en avant votre différence (offre, cadre, expérience) plutôt que de vous aligner.';
      return s;
    }, urgency: 'soon' },
    'competition_proximity': { action: function(a, p, d) {
      var e500 = a.events_500m != null ? Number(a.events_500m) : null;
      var e1km = a.events_1km != null ? Number(a.events_1km) : null;
      var name = a.top_competitor || null;
      var dist = a.top_competitor_distance_km != null ? Number(a.top_competitor_distance_km) : null;
      var s = 'À défendre : ';
      if (e500 != null && e500 >= 3) s += e500 + ' événements à 500 m';
      else if (e1km != null) s += e1km + ' événements à 1 km';
      else s += 'forte concentration locale';
      s += '. ';
      if (name) s += 'Concurrent le plus menaçant : ' + name + (dist != null ? ' à ' + dist.toFixed(1) + ' km' : '') + '. ';
      s += 'Renforcez votre visibilité locale (signalétique, fiche GBP, accueil) pour rester repérable dans la densité.';
      return s;
    }, urgency: 'soon' },
    'low_competition_window': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var ev = a.events_5km != null ? Number(a.events_5km) : null;
      var base = a.baseline_avg != null ? Number(a.baseline_avg) : null;
      var s = 'À capter : concurrence sous la normale';
      if (pr != null) s += ' (pression ×' + pr.toFixed(1) + ')';
      if (ev != null && base != null) s += ' — ' + ev + ' événements à 5 km vs ~' + Math.round(base) + ' habituellement';
      s += '. Fenêtre rare : prenez la parole pendant que vos concurrents sont silencieux.';
      return s;
    }, urgency: 'now' },
    'competition_pressure_spike': { action: function(a, p, d) {
      var name = a.competitor_name || null;
      var s = 'À défendre : pression concurrentielle en forte hausse';
      if (name) s += ', portée notamment par ' + name;
      s += '. Maintenez votre présence pour ne pas perdre en partage d\'attention.';
      return s;
    }, urgency: 'now' },
    'competitor_event_launch': { action: function(a, p, d) {
      var ov = a.audience_overlap_pct != null ? Math.round(Number(a.audience_overlap_pct)) : null;
      var tier = String(a.entity_threat_industry_tier || '').toLowerCase();
      var contextual = (tier === 'contextual') || (ov === 0);
      var s = (ov != null && ov > 0) ? 'Chevauchement d\'audience ' + ov + ' %' : 'Audiences distinctes (0 % de chevauchement)';
      s += contextual ? ' \u2014 pertinence contextuelle. À suivre, sans réaction urgente.'
                      : '. Proposez une alternative à votre public sur la même fenêtre.';
      return s;
    }, urgency: 'now' },
    'competitor_audience_conflict': { action: function(a, p, d) {
      var name = a.competitor_name || null;
      var ov = a.audience_overlap_pct != null ? Math.round(Number(a.audience_overlap_pct) * 100) : null;
      return 'À défendre : conflit d\'audience' + (name ? ' avec ' + name : '') + (ov != null ? ' (audience estimée commune ' + ov + ' %)' : '') + '. Adressez directement votre public partagé avant l\'échéance pour sécuriser votre fréquentation.';
    }, urgency: 'now' },
    'competitor_review_surge': { action: 'Communiquer : sollicitez des avis clients pour \u00e9quilibrer.', urgency: 'soon', channel: 'communiquer' },
    'competitor_review_drop': { action: 'Communiquer : capitalisez sur votre r\u00e9putation.', urgency: 'plan', channel: 'communiquer' },
    'review_solicitation': { action: function(a, p, d) {
      return 'À pousser : une fenêtre favorable approche. Profitez de l\'affluence attendue pour solliciter des avis auprès de vos visiteurs satisfaits — un bon moment pour renforcer votre e-réputation.';
    }, urgency: 'soon' },
    'competitor_hours_change': { action: 'Faire suivre : v\u00e9rifiez si vos horaires restent comp\u00e9titifs.', urgency: 'soon', channel: 'suivre' },
    'competitor_new_offering': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une nouvelle offre';
      var newP = a.new_price_raw || null;
      return 'À défendre : ' + name + ' lance ' + item + (newP ? ' à ' + newP : '') + '. Repositionnez votre offre équivalente et mettez en avant ce qui vous distingue.';
    }, urgency: 'soon' },
    'competitor_price_increase': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || null;
      var newP = a.new_price_raw || null;
      var pct = a.price_pct_change != null ? Number(a.price_pct_change) : null;
      var s = 'À exploiter : ' + name + ' a augmenté ' + item;
      if (oldP && newP) s += ' (' + oldP + ' → ' + newP + ')';
      else if (pct != null) s += ' (+' + pct + ' %)';
      s += '. Votre positionnement tarifaire devient relativement plus attractif : mettez en avant votre rapport qualité-prix, ou évaluez une marge de repositionnement.';
      return s;
    }, urgency: 'plan' },
    'competitor_price_drop': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || null;
      var newP = a.new_price_raw || null;
      var pct = a.price_pct_change != null ? Number(a.price_pct_change) : null;
      var s = 'À défendre : ' + name + ' a baissé ' + item;
      if (oldP && newP) s += ' (' + oldP + ' → ' + newP + ')';
      else if (pct != null) s += ' (' + pct + ' %)';
      s += '. Ne vous alignez pas par réflexe : vérifiez votre marge sur ce poste, puis argumentez sur votre différence de gamme.';
      return s;
    }, urgency: 'soon' },
    'competitor_offering_removed': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var item = a.item || 'une offre';
      var oldP = a.old_price_raw || null;
      return 'À vérifier : ' + name + ' ne propose plus ' + item + (oldP ? ' (anciennement ' + oldP + ')' : '') + '. Confirmez que le retrait est durable (pas un simple changement de page) ; si vous proposez un équivalent, vous êtes peut-être seul sur ce créneau localement.';
    }, urgency: 'soon' },
    'competitor_repricing_event': { action: function(a, p, d) {
      var name = a.competitor_name || 'Un concurrent';
      var n = a.price_change_count != null ? Number(a.price_change_count) : null;
      var inc = a.increase_count != null ? Number(a.increase_count) : null;
      var dec = a.decrease_count != null ? Number(a.decrease_count) : null;
      var s = 'À noter : ' + name + ' a repositionné ' + (n != null ? n + ' tarifs' : 'plusieurs tarifs');
      if (inc != null && dec != null) s += ' (' + inc + ' hausse(s), ' + dec + ' baisse(s))';
      s += '. Analysez le mouvement avant d\'ajuster les vôtres.';
      return s;
    }, urgency: 'soon' },
    'competitor_sold_out': { action: 'À capter : un concurrent affiche complet. Adressez-vous au public qui n\'a pas pu réserver pour récupérer ce report de demande.', urgency: 'now' },
    'competitor_content_spike': { action: 'À défendre : un concurrent intensifie ses publications. Maintenez votre présence pour ne pas perdre en partage d\'attention.', urgency: 'now' },
    'competitor_content_silent': { action: 'À capter : un concurrent est silencieux sur ses canaux. Prenez la parole maintenant pour occuper l\'espace d\'attention local.', urgency: 'now' },
    'top_day_approaching': { action: function(a, p, d) {
      var rank = a.rank != null ? Number(a.rank) : null;
      var regime = a.regime || null;
      var s = 'À pousser : ';
      if (rank === 1) s += 'votre meilleur score des prochains jours';
      else if (rank != null) s += rank + 'e meilleur score des prochains jours';
      else s += 'fenêtre favorable à venir';
      if (regime) s += ' (régime ' + regime + ')';
      s += '. Si vous prévoyez une action de visibilité cette semaine, concentrez-la sur ce jour.';
      return s;
    }, urgency: 'now' },
    'weekend_opportunity': { action: function(a, p, d) {
      var regime = a.regime || null;
      var alert = Number(a.weather_alert || 0);
      var ev = a.events_5km != null ? Number(a.events_5km) : null;
      var s = 'À pousser : week-end favorable' + (regime ? ' (régime ' + regime + ')' : '') + (alert === 0 ? ', sans alerte météo' : '') + '. ';
      if (ev != null && ev >= 50) s += 'Concurrence dense (' + ev + ' événements à 5 km) — démarquez-vous, mais c\'est une fenêtre à activer.';
      else s += 'Concentrez votre communication sur ce week-end pour capter le flux.';
      return s;
    }, urgency: 'now' },
    'audience_shift_opportunity': { action: function(a, p, d) {
      var driver = a.is_holiday ? (a.holiday_name || 'jour férié')
                 : a.is_vacation ? (a.vacation_name || 'vacances scolaires')
                 : a.commercial_event_name ? a.commercial_event_name
                 : a.is_commercial ? 'événement commercial'
                 : null;
      var s = 'À réorienter : ';
      s += driver ? driver + ' modifie le profil des visiteurs attendus. ' : 'le profil des visiteurs attendus change. ';
      s += 'Adaptez votre message, votre offre et votre accueil au public du jour plutôt qu\'à votre cible habituelle.';
      return s;
    }, urgency: 'soon' },
    'foreign_tourism_signal': { action: function(a, p, d) {
      return 'À capter : un public touristique étranger est en congés. Adaptez accueil, langues et offre découverte pour capter ce flux de passage.';
    }, urgency: 'soon' },
    'score_up': { action: function(a, p, d) {
      return 'À noter : votre score d\'opportunité est en hausse. Vérifiez si une action de visibilité vaut le coup sur cette fenêtre.';
    }, urgency: 'now' },
    'weather_window': { action: function(a, p, d) {
      var ya = a.yesterday_alert != null ? Number(a.yesterday_alert) : null;
      var ta = a.today_alert != null ? Number(a.today_alert) : null;
      var sens = a.site_sensitivity != null ? Number(a.site_sensitivity) : null;
      var s = 'À pousser : retour de conditions favorables';
      if (ya != null && ta != null) s += ' (alerte ' + ya + ' → ' + ta + ')';
      s += '. ';
      if (sens != null && sens >= 3) s += 'Votre site est sensible à la météo — relancez vos visiteurs et activez vos espaces extérieurs aujourd\'hui.';
      else s += 'Communiquez vite sur l\'embellie pour relancer la fréquentation.';
      return s;
    }, urgency: 'now' },
    'extended_bad_weather': { action: function(a, p, d) {
      var lvl = a.alert_level != null ? Number(a.alert_level) : null;
      var sens = a.site_sensitivity != null ? Number(a.site_sensitivity) : null;
      var s = 'À adapter : météo dégradée sur au moins 2 jours';
      if (lvl != null) s += ' — ' + hazardPhrase(d) + ' (niveau ' + lvl + ')';
      s += '. ';
      if (sens != null && sens >= 3) s += 'Site sensible à la météo : repliez en intérieur si vous avez un espace couvert, sinon réduisez l\'effectif d\'accueil extérieur.';
      else s += 'Préparez une alternative couverte et réduisez l\'effectif extérieur sur ces jours.';
      return s;
    }, urgency: 'now' },
    'weather_hazard_onset': { action: function(a, p, d) {
      return 'À adapter : apparition d\'un risque météo. Sécurisez vos installations extérieures et prévenez votre équipe des mesures à prendre.';
    }, urgency: 'now' },
    'calendar_audience_shift': { action: function(a, p, d) {
      return 'À réorienter : changement de profil d\'audience attendu. Adaptez votre message et votre offre au public du jour plutôt qu\'à votre cible habituelle.';
    }, urgency: 'plan' },
    'institution_campaign_detected': { action: 'À capter : une campagne institutionnelle proche peut générer du passage. Préparez une offre ou un message pour capter ce flux.', urgency: 'soon' },
    'mega_event_activation': { action: function(a, p, d) {
      var ev = (a.event_label && a.event_label !== 'Signal détecté') ? a.event_label : (a.new_value || null);
      return 'À capter : ' + (ev ? 'méga-événement « ' + ev + ' »' : 'méga-événement') + ' générant du trafic dans votre zone. Publiez une offre ou un message ciblé pour capter ce flux de passage.';
    }, urgency: 'now' },
    'mega_event_end': { action: function(a, p, d) {
      return 'À noter : fin d\'un méga-événement dans votre zone. Le pic de trafic retombe — reprenez votre communication habituelle.';
    }, urgency: 'now' },
    'mobility_disruption': { action: function(a, p, d) {
      return 'À adapter : perturbation d\'accès à votre zone. Communiquez un itinéraire alternatif et anticipez une baisse de fréquentation à l\'entrée.';
    }, urgency: 'now' },
    'mobility_disruption_planned': { action: function(a, p, d) {
      return 'À adapter : perturbation d\'accès prévue. Préparez un plan d\'accès alternatif (itinéraire, parking, horaires) et informez vos visiteurs en amont.';
    }, urgency: 'soon' },
    'mobility_disruption_resolved': { action: function(a, p, d) {
      return 'À capter : l\'accès à votre zone est rétabli. Relancez vos visiteurs et signalez le retour à la normale.';
    }, urgency: 'now' },
    'media_mention_detected': { action: 'À capter : une mention média dans votre zone peut générer de la visibilité. Relayez-la et préparez un message pour convertir ce passage.', urgency: 'soon' },
    'weekly_summary': { action: 'Faire suivre : partagez le bilan avec votre \u00e9quipe.', urgency: 'plan', channel: 'suivre' },
    'weather_worsened': { action: function(a, p, d) {
      return 'À adapter : dégradation des conditions météo. Repliez en intérieur si possible, réduisez l\'exposition extérieure et ajustez l\'effectif.';
    }, urgency: 'now' },
    'weather_improved': { action: function(a, p, d) {
      return 'À pousser : amélioration des conditions météo. Relancez vos visiteurs dès maintenant pour profiter de l\'embellie.';
    }, urgency: 'now' },
    'perfect_storm': { action: function(a, p, d) {
      var n = a.favorable_count != null ? Number(a.favorable_count) : null;
      return 'À pousser : ' + (n != null ? n + ' facteurs favorables alignés' : 'plusieurs facteurs favorables alignés') + '. Fenêtre rare — concentrez ici votre principal effort de visibilité de la période.';
    }, urgency: 'now' },
    'weather_comp_opportunity': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      return 'À pousser : beau temps et faible concurrence' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Conditions propices à la visibilité — concentrez votre communication sur cette fenêtre.';
    }, urgency: 'now' },
    'saturated_bad_weather': { action: function(a, p, d) {
      var lvl = a.weather_alert != null ? Number(a.weather_alert) : null;
      var pct = a.pct_same_sector != null ? Math.round(Number(a.pct_same_sector)) : null;
      var s = 'À adapter : ' + hazardPhrase(d) + (lvl != null ? ' (niveau ' + lvl + ')' : '') + ' et secteur saturé' + (pct != null ? ' (' + pct + ' % des événements à 5 km dans votre secteur)' : '') + '. Conditions doublement défavorables : dimensionnez vos opérations au minimum et gardez vos ressources pour une meilleure fenêtre.';
      return s;
    }, urgency: 'now' },
    'holiday_high_comp': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var e5 = a.events_5km != null ? Number(a.events_5km) : null;
      var s = 'À temporiser : jour férié mais concurrence élevée';
      if (pr != null) s += ' (pression ×' + pr.toFixed(1) + ')';
      if (e5 != null) s += ' — ' + e5 + ' événements à 5 km';
      s += '. Le férié attire du monde mais l\'offre est pléthorique : ne surinvestissez pas en communication, démarquez-vous par un angle simple plutôt que par le volume.';
      return s;
    }, urgency: 'now' },
    'best_day_of_week': { action: function(a, p, d) {
      var regime = a.regime || null;
      return 'À pousser : meilleur jour de la semaine' + (regime ? ' (régime ' + regime + ')' : '') + '. Si vous ne menez qu\'une action cette semaine, faites-la aujourd\'hui.';
    }, urgency: 'now' },
    'same_bucket_saturation': { action: function(a, p, d) {
      var pct = a.pct_same_sector != null ? Math.round(Number(a.pct_same_sector)) : null;
      var e5 = a.events_5km != null ? Number(a.events_5km) : null;
      var s = 'À temporiser : votre secteur est saturé' + (pct != null ? ' (' + pct + ' % des ' + (e5 != null ? e5 + ' ' : '') + 'événements à 5 km)' : '') + '. Inutile de surcommuniquer dans le bruit — réservez votre effort pour un jour où votre secteur est moins représenté.';
      return s;
    }, urgency: 'soon' },
    'weekend_vacation_low_comp': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      return 'À pousser : week-end de vacances à faible concurrence' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Fenêtre rare — concentrez votre communication dessus.';
    }, urgency: 'now' },
    'commercial_event_match': { action: function(a, p, d) {
      var ev = a.commercial_event_name || (d.commercial_events && d.commercial_events[0] ? d.commercial_events[0].event_name : null) || null;
      var evCode = a.commercial_event_code || (d.commercial_events && d.commercial_events[0] ? d.commercial_events[0].event_code : '') || '';
      var isDiscount = evCode
        ? /sales|black-friday|cyber-monday/.test(String(evCode))
        : /soldes|black friday|cyber monday|nouvel an|noël/i.test(String(ev || ''));
      var head = 'À capter : ' + (ev ? 'temps fort commercial « ' + ev + ' »' : 'temps fort commercial en cours') + '. ';
      return isDiscount
        ? head + 'Le flux d\'acheteurs vient à vous : mettez en avant une offre signature ou une expérience différenciante plutôt qu\'une remise — sur un temps fort, une promotion non nécessaire érode la marge sans gagner de visiteurs.'
        : head + 'Alignez une offre ou un accueil dédié sur l\'événement pour capter ce flux de passage, plutôt que de vous en tenir à votre programmation habituelle.';
    }, urgency: 'now' },
    'weather_window_after_bad': { action: function(a, p, d) {
      var sens = a.site_sensitivity != null ? Number(a.site_sensitivity) : null;
      var s = 'À capter : retour au beau après plusieurs jours dégradés. ';
      if (sens != null && sens >= 3) s += 'Votre site est sensible à la météo — relancez vos visiteurs et rouvrez vos espaces extérieurs dès aujourd\'hui.';
      else s += 'Relancez vos visiteurs maintenant que les conditions sont favorables.';
      return s;
    }, urgency: 'now' },
    'extended_bad_weather_3d': { action: function(a, p, d) {
      var lvl = a.alert_level != null ? Number(a.alert_level) : null;
      var sens = a.site_sensitivity != null ? Number(a.site_sensitivity) : null;
      var s = 'À adapter : météo dégradée sur 3 jours ou plus';
      if (lvl != null) s += ' — ' + hazardPhrase(d) + ' (niveau ' + lvl + ')';
      s += '. ';
      if (sens != null && sens >= 3) s += 'Site très exposé : planifiez un repli intérieur sur toute la période et ajustez les horaires si la fréquentation chute.';
      else s += 'Planifiez des alternatives couvertes sur toute la période et adaptez vos effectifs.';
      return s;
    }, urgency: 'now' },
    'tourist_high_season': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      var s = 'À réorienter : haute saison touristique' + (ti != null ? ' (indice ' + ti + ')' : '') + '. Votre public de passage est surtout touristique — adaptez votre message et votre offre découverte à ce profil plutôt qu\'aux habitués locaux.';
      return s;
    }, urgency: 'now' },
    'tourist_surge_vacation': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      return 'À capter : afflux touristique en période de vacances' + (ti != null ? ' (indice ' + ti + ')' : '') + '. Adressez-vous à ce public de passage (signalétique, offre découverte, horaires élargis) pour capter ce flux.';
    }, urgency: 'now' },
    'tourism_peak_window': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      return 'À capter : pic touristique régional' + (ti != null ? ' (indice ' + ti + ')' : '') + '. Mettez en avant votre offre auprès des visiteurs de passage pour capter ce flux supplémentaire.';
    }, urgency: 'now' },
    'tourism_weather_vacation': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      return 'À pousser : tourisme élevé' + (ti != null ? ' (indice ' + ti + ')' : '') + ', beau temps et vacances. Triple signal — concentrez ici votre effort de visibilité.';
    }, urgency: 'now' },
    'tourism_comp_squeeze': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var s = 'À réorienter : flux touristique élevé' + (ti != null ? ' (indice ' + ti + ')' : '') + ' mais très disputé' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Ciblez un segment ou un angle que vos concurrents n\'adressent pas pour vous démarquer sur ce public.';
      return s;
    }, urgency: 'soon' },
    'low_tourism_local_opp': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      var s = 'À réorienter : tourisme faible' + (ti != null ? ' (indice ' + ti + ')' : '') + ' mais contexte calendaire porteur. Ciblez les résidents locaux (offre habitués, communication de proximité) plutôt que le public de passage.';
      return s;
    }, urgency: 'plan' },
    'tourism_mobility_hit': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      var s = 'À adapter : afflux touristique' + (ti != null ? ' (indice ' + ti + ')' : '') + ' mais accès perturbé. Communiquez un itinéraire alternatif et renforcez l\'accueil pour ne pas perdre ce flux à l\'entrée.';
      return s;
    }, urgency: 'now' },
    'weather_mobility_double': { action: function(a, p, d) {
      var lvl = a.weather_alert != null ? Number(a.weather_alert) : null;
      var s = 'À adapter : double contrainte — ' + hazardPhrase(d) + (lvl != null ? ' (niveau ' + lvl + ')' : '') + ' et accès perturbé. Sécurisez l\'installation, anticipez un accès alternatif et ajustez l\'effectif au plus juste.';
      return s;
    }, urgency: 'now' },
    'mobility_comp_squeeze': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var s = 'À temporiser : accès perturbé et concurrence élevée' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Conditions doublement défavorables : gardez votre effort de communication pour une meilleure fenêtre et concentrez-vous sur l\'opérationnel (accès, accueil).';
      return s;
    }, urgency: 'now' },
    'ft_peak_bad_weather': { action: function(a, p, d) {
      var lvl = a.weather_alert != null ? Number(a.weather_alert) : null;
      var s = 'À adapter : jour habituellement fréquenté mais ' + hazardPhrase(d) + (lvl != null ? ' (niveau ' + lvl + ')' : '') + '. Prévoyez un repli couvert et un effectif d\'accueil suffisant : la fréquentation peut rester élevée malgré la météo.';
      return s;
    }, urgency: 'now' },
    'ft_quiet_good_weather': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      return 'À capter : jour habituellement calme mais météo et concurrence favorables' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Stimulez la fréquentation par une communication ciblée pour dépasser l\'affluence habituelle.';
    }, urgency: 'now' },
    'ft_peak_saturated': { action: function(a, p, d) {
      var pct = a.pct_same_sector != null ? Math.round(Number(a.pct_same_sector)) : null;
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      var s = 'À temporiser : jour habituellement fréquenté mais saturé';
      if (pct != null) s += ' (' + pct + ' % des événements à 5 km dans votre secteur)';
      if (pr != null) s += ', pression ×' + pr.toFixed(1);
      s += '. L\'affluence est là, mais l\'attention est dispersée — misez sur l\'accueil et l\'expérience sur place plutôt que sur la communication.';
      return s;
    }, urgency: 'soon' },
    'ft_peak_low_comp': { action: function(a, p, d) {
      var pr = a.pressure_ratio != null ? Number(a.pressure_ratio) : null;
      return 'À pousser : jour habituellement fréquenté + faible concurrence' + (pr != null ? ' (pression ×' + pr.toFixed(1) + ')' : '') + '. Fenêtre à fort potentiel — concentrez votre communication.';
    }, urgency: 'now' },
    'ft_peak_tourism_vacation': { action: function(a, p, d) {
      var ti = a.tourism_index != null ? Math.round(Number(a.tourism_index)) : null;
      return 'À pousser : jour de pointe + tourisme élevé' + (ti != null ? ' (indice ' + ti + ')' : '') + ' + vacances. Affluence attendue maximale — concentrez ici votre principal effort.';
    }, urgency: 'now' },
    'ft_peak_mobility': { action: function(a, p, d) {
      var s = 'À adapter : jour de pointe mais accès perturbé. Communiquez un itinéraire/parking alternatif et renforcez l\'accueil pour absorber l\'affluence malgré la gêne d\'accès.';
      return s;
    }, urgency: 'now' },
    'weekly_briefing': { action: function(a, p, d) {
      var avg = a.avg_score != null ? Math.round(Number(a.avg_score)) : null;
      var ra = a.days_regime_a != null ? Number(a.days_regime_a) : null;
      var rc = a.days_regime_c != null ? Number(a.days_regime_c) : null;
      var s = 'À transmettre : bilan de la semaine';
      if (ra != null || rc != null) s += ' — ' + (ra != null ? ra + ' jour(s) favorable(s)' : '') + (ra != null && rc != null ? ', ' : '') + (rc != null ? rc + ' défavorable(s)' : '');
      if (avg != null) s += ', score moyen ' + avg;
      s += '. Partagez-le avec votre équipe.';
      return s;
    }, urgency: 'plan' },
    'sales_traffic_not_converting': { action: function(a, p, d) {
      var cz = a.conversion_robust_z != null ? Number(a.conversion_robust_z) : null;
      return 'À corriger : du trafic mais ' + (cz != null ? 'conversion nettement sous votre norme' : 'peu de conversions') + '. Vérifiez l\'accueil, la caisse et la mise en avant aujourd\'hui, et posez une routine pour les prochains jours à fort passage.';
    }, urgency: 'soon' },
    'sales_discount_no_lift': { action: function(a, p, d) {
      return 'À corriger : vos remises n\'ont pas tiré le CA. Réexaminez le ciblage et le niveau de promotion avant de reconduire ce type d\'offre.';
    }, urgency: 'plan' },
    'sales_revenue_down_wow': { action: function(a, p, d) {
      var driver = ({footfall:'le trafic', transactions:'le volume de ventes', basket:'le panier moyen', conversion:'la conversion'})[a.primary_revenue_driver] || null;
      return 'À surveiller : confirmez si c\'est ponctuel ou récurrent' + (driver ? ' (levier : ' + driver + ')' : '') + ' avant d\'agir ; tracez la cause pour comparer aux prochaines semaines.';
    }, urgency: 'soon' },
    'footfall_vs_basket_decomposition': { action: function(a, p, d) {
      var revPct = a.revenue_vs_30d_avg_pct != null ? Number(a.revenue_vs_30d_avg_pct) : null;
      var tx = a.transactions_delta_pct != null ? Math.round(Number(a.transactions_delta_pct)) : null;
      var bk = a.basket_delta_pct != null ? Math.round(Number(a.basket_delta_pct)) : null;
      var dom = a.dominant_factor || ((tx != null && bk != null && Math.abs(tx) >= Math.abs(bk)) ? 'transactions' : 'basket');
      var up = revPct != null && revPct >= 0;
      var src = dom === 'transactions' ? 'le volume de ventes' : 'le panier moyen';
      var lever = dom === 'transactions'
        ? 'la fréquentation et la conversion (accueil, mise en avant, communication)'
        : 'le mix produit et la montée en gamme (cross-sell, offres groupées)';
      return up
        ? 'À amplifier : le CA est tiré par ' + src + '. Renforcez ' + lever + ' pour prolonger l\'effet.'
        : 'À corriger : le recul de CA vient surtout de ' + src + '. Agissez sur ' + lever + '.';
    }, urgency: 'soon' },
    'proven_action_replication': { action: function(a, p, d) {
      var avg = a.avg_revenue_delta_pct != null ? Math.round(Number(a.avg_revenue_delta_pct)) : null;
      return 'À reproduire : ce type d\'action est associé à un CA ' + (avg != null ? (avg >= 0 ? '+' : '') + avg + ' % ' : '') + 'au-dessus de votre référence. Rejouez-le sur des jours comparables et continuez à mesurer.';
    }, urgency: 'plan' },
    'offering_mix_shift': { action: function(a, p, d) {
      var cat = a.item_category || 'une catégorie';
      var dir = a.direction || 'surge';
      return dir === 'collapse'
        ? 'À surveiller : ' + cat + ' décroche dans vos ventes du jour. Vérifiez stock, visibilité et prix avant que ça s\'installe.'
        : 'À exploiter : ' + cat + ' surperforme aujourd\'hui. Sécurisez le réassort et mettez cette catégorie en avant pendant qu\'elle tire.';
    }, urgency: 'soon' }
  };

  var _origSpecs = {};
  for (var _k in SPECS) {
    if (SPECS[_k] && typeof SPECS[_k].sowhat === 'function') {
      _origSpecs[_k] = SPECS[_k].sowhat;
      (function(key, origFn) {
        SPECS[key].sowhat = function(a, p, d) {
          var _raw = origFn(a, p, d);
          var _meta = ACTION_SENTENCES[key];
          if (!_meta) return _raw;
          var _action = (typeof _meta.action === 'function') ? _meta.action(a, p, d) : _meta.action;
          return { context: _raw, action: _action, urgency: _meta.urgency };
        };
      })(_k, _origSpecs[_k]);
    }
  }

  // ─── RECOMMANDATIONS TAXONOMY (settings page: buckets → themes → action_types) ───
  // Additive. Maps each user-controllable action card to one theme under one outcome
  // bucket. Feed-only subtypes (internal-metric movements) are excluded — governed as
  // feed, not recommandations. 73 controllable cards across 9 themes.
  // `gate` is a profile-condition token the settings page resolves (null = always on).
  window.RECO_TAXONOMY = {
    feed_only: ['score_up', 'score_down', 'regime_change', 'medal_change', 'score_driver_shift'],
    buckets: [
      { id: 'gerer', label: 'Gérer la journée', verb: 'Adapter & temporiser', hue: '#B26A2E', themes: [
        { id: 'meteo', label: 'Météo & alertes', gate: null, action_types: [
          'regime_c_warning', 'extended_bad_weather', 'weather_hazard_onset', 'weather_worsened',
          'saturated_bad_weather', 'extended_bad_weather_3d', 'weather_mobility_double', 'ft_peak_bad_weather'] },
        { id: 'mobilite', label: 'Accès & mobilité', gate: null, action_types: [
          'mobility_disruption', 'mobility_disruption_planned', 'mobility_disruption_resolved',
          'tourism_mobility_hit', 'mobility_comp_squeeze', 'ft_peak_mobility'] },
      ]},
      { id: 'faire-venir', label: 'Faire venir', verb: 'Pousser & capter', hue: '#3F7A4E', themes: [
        { id: 'fenetres', label: 'Fenêtres favorables', gate: null, action_types: [
          'weather_window', 'weather_improved', 'weather_window_after_bad', 'low_competition_window',
          'weekend_opportunity', 'perfect_storm', 'weather_comp_opportunity', 'day_opportunity',
          'best_day_of_week', 'top_day_approaching', 'weekend_vacation_low_comp', 'ft_quiet_good_weather', 'ft_peak_low_comp'] },
        { id: 'calendrier', label: 'Calendrier & affluence', gate: null, action_types: [
          'audience_shift_opportunity', 'calendar_audience_shift', 'commercial_event_match', 'holiday_high_comp',
          'mega_event_activation', 'mega_event_end', 'institution_campaign_detected', 'media_mention_detected', 'ft_peak_tourism_vacation', 'foreign_tourism_signal'] },
        { id: 'tourisme', label: 'Tourisme', gate: 'tourism_source', action_types: [
          'tourist_high_season', 'tourist_surge_vacation', 'tourism_peak_window', 'tourism_weather_vacation',
          'tourism_comp_squeeze', 'low_tourism_local_opp'] },
      ]},
      { id: 'surveiller', label: 'Surveiller le marché', verb: 'Défendre & surveiller', hue: '#A4442A', themes: [
        { id: 'concurrence', label: 'Concurrence', gate: 'watched_competitors', action_types: [
          'high_competition_density', 'competition_proximity', 'competition_pressure_spike', 'competitor_threat_direct',
          'competitor_event_launch', 'competitor_audience_conflict', 'competitor_hours_change', 'competitor_sold_out',
          'competitor_content_spike', 'competitor_content_silent', 'same_bucket_saturation', 'ft_peak_saturated'] },
        { id: 'tarifs', label: 'Offres, prix & réputation', gate: 'watched_competitors', action_types: [
          'competitor_new_offering', 'competitor_price_increase', 'competitor_price_drop', 'competitor_offering_removed',
          'competitor_repricing_event', 'competitor_positioning_brief', 'competitor_reputation_strength',
          'competitor_review_surge', 'competitor_review_drop'] },
      ]},
      { id: 'mesurer', label: 'Mesurer', verb: 'Attribuer & apprendre', hue: '#2F5C8A', themes: [
        { id: 'ventes', label: 'Performance ventes', gate: 'pos', action_types: [
          'sales_underperformance', 'sales_surge', 'sales_missed_opportunity', 'sales_competition_cannibalization',
          'sales_traffic_not_converting', 'sales_discount_no_lift', 'sales_revenue_down_wow', 'offering_mix_shift',
          'footfall_vs_basket_decomposition'] },
        { id: 'apprentissage', label: 'Apprentissage', gate: 'measured_actions', action_types: [
          'proven_action_replication', 'weekly_briefing'] },
      ]},
    ]
  };

  // Goal → serving action_types. The daily brief surfaces up to 3 of these first.
  // Additive: context cards keep their natural rank. Aligns with dim_client_goal.
  // Editable. plus_avis stays thin until the review_solicitation gesture card ships.
  window.GOAL_SERVING_TYPES = {
    faire_venir: [
      'weather_window','weather_improved','weather_window_after_bad','low_competition_window',
      'weekend_opportunity','perfect_storm','weather_comp_opportunity','day_opportunity',
      'best_day_of_week','top_day_approaching','weekend_vacation_low_comp','ft_quiet_good_weather',
      'ft_peak_low_comp','audience_shift_opportunity','calendar_audience_shift','commercial_event_match',
      'holiday_high_comp','mega_event_activation','mega_event_end','institution_campaign_detected',
      'media_mention_detected','ft_peak_tourism_vacation','tourist_high_season','tourist_surge_vacation',
      'tourism_peak_window','tourism_weather_vacation','tourism_comp_squeeze','low_tourism_local_opp',
      'foreign_tourism_signal'
    ],
    augmenter_panier: [
      'sales_underperformance','sales_missed_opportunity','sales_competition_cannibalization',
      'offering_mix_shift','proven_action_replication'
    ],
    plus_avis: [
      'competitor_review_surge','competitor_review_drop','competitor_reputation_strength','review_solicitation'
    ],
    surveiller_marche: [
      'high_competition_density','competition_proximity','competition_pressure_spike','competitor_threat_direct',
      'competitor_event_launch','competitor_audience_conflict','competitor_hours_change','competitor_sold_out',
      'competitor_content_spike','competitor_content_silent','same_bucket_saturation','ft_peak_saturated',
      'competitor_new_offering','competitor_price_increase','competitor_price_drop','competitor_offering_removed',
      'competitor_repricing_event','competitor_positioning_brief'
    ]
  };

  // Sales movement cards route to the priority they actually serve, by their driver —
  // a volume-driven surge serves "Faire venir", a basket-driven one "Augmenter le panier".
  // Returns the goal key a sales card serves, or null (ambiguous / not a sales card).
  window.msSalesGoal = function(item) {
    var t = String((item && item.change_subtype) || '');
    if (t === 'sales_traffic_not_converting') return 'faire_venir';
    if (t === 'sales_discount_no_lift') return 'augmenter_panier';
    if (t === 'sales_surge' || t === 'sales_revenue_down_wow') {
      var d = String((item && (item.dominant_factor || item.primary_revenue_driver)) || '');
      if (d === 'basket') return 'augmenter_panier';
      if (d === 'transactions' || d === 'footfall') return 'faire_venir';
    }
    return null;
  };

  // Recommended actions per sales card — a real "à faire". CONTENT lives in the
  // owner-editable window.MS_SALES_RECO_LIB (public/reco-library.js), loaded BEFORE
  // this file on surfaces that show recos (pulse form, rapport). Here we only wire it:
  //   spec.recos(item) -> up to 3 driver-matched actions (the M'engager form options)
  //   spec.reco(item)  -> the top one as a string (the sales report, back-compat)
  // Degrades to [] / '' when the library isn't loaded — never throws, never wrong text.
  function _recoDriverKey(a) {
    var d = String((a && (a.primary_revenue_driver || a.dominant_factor)) || '').toLowerCase();
    return d === 'transactions' ? 'footfall' : d;
  }
  function _recosFor(cardType, a) {
    var lib = (typeof window !== 'undefined' && window.MS_SALES_RECO_LIB) ? window.MS_SALES_RECO_LIB[cardType] : null;
    if (!lib) return [];
    var arr = lib[_recoDriverKey(a)] || lib._default || [];
    return Array.isArray(arr) ? arr.slice(0, 3) : [];
  }
  ['sales_revenue_down_wow', 'sales_surge', 'sales_traffic_not_converting', 'sales_discount_no_lift', 'footfall_vs_basket_decomposition', 'sales_competition_cannibalization'].forEach(function (_rt) {
    if (!SPECS[_rt]) return;
    SPECS[_rt].recos = (function (t) { return function (a) { return _recosFor(t, a); }; })(_rt);
    SPECS[_rt].reco = (function (t) { return function (a) { var r = _recosFor(t, a); return r.length ? r[0] : ''; }; })(_rt);
  });

  window.ACTION_CARDS = SPECS;
  window.MS_ROUTING_MAP = {weather_worsened:'weather',weather_improved:'weather',weather_hazard_onset:'weather',competitor_event_launch:'competition',competitor_audience_conflict:'competition',competition_pressure_spike:'competition',competitor_event_ending:'competition',mobility_disruption:'mobility',mobility_disruption_planned:'mobility',score_up:'opportunity',score_down:'opportunity',_day_opportunity:'opportunity',_best_day:'opportunity',_low_competition:'competition',_same_bucket_saturation:'competition',_holiday_high_comp:'competition',_perfect_storm:'opportunity',_commercial_event:'calendar',_extended_bad_weather:'weather',_weather_mobility_double:'weather',_saturated_bad_weather:'weather',_mobility_comp_squeeze:'mobility',_audience_mismatch:'competition',_weather_window:'weather',competitor_review_surge:'competition',competitor_review_drop:'competition',competitor_hours_change:'competition',competitor_new_offering:'competition',competitor_sold_out:'competition',competitor_content_spike:'competition',competitor_content_silent:'competition',institution_campaign_detected:'competition',media_mention_detected:'competition',calendar_audience_shift:'calendar'};

  // v1 internal-alert allowlist — the 5 performance RULE cards eligible for "Communiquer en interne".
  // Keep in sync with src/lib/internalAlertCards.ts (backend Barrier 2).
  window.MS_INTERNAL_ALERT_TYPES = ['sales_surge','sales_traffic_not_converting','sales_discount_no_lift','sales_revenue_down_wow','footfall_vs_basket_decomposition'];

})();