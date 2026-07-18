// Shared Communiquer/Faire suivre workspace — window.MSDraftWorkspace. Static /public asset
// (browser-cached by ?v=N), loaded via <script is:inline src="/draft-workspace.js?v=N">.
//
// UNIFICATION (18/07, owner) : Pulse et la page détail (insight) avaient chacun LEUR copie du
// workspace de rédaction/envoi — toutes les incohérences (destinataires absents, libellés,
// envois morts, erreurs muettes) venaient de cette dérive. Ce module est l'extraction FIDÈLE
// du workspace de Pulse (la référence validée par l'owner), paramétrée :
//
//   MSDraftWorkspace.open(mount, opts)
//     mount : l'élément qui reçoit le workspace (div de carte sur Pulse, panel overlay sur insight)
//     opts  : { location_id, signal_type, affected_date, card_what, card_sowhat, signal,
//               artifact_mode ('post'|'offer'), severity, channel (initial), draft_seed,
//               detail_url (lien « Consulter le détail » joint aux envois), onStatus(status) }
//   MSDraftWorkspace.openLibrary(opts)      — le tiroir « Mes brouillons » (partagé)
//   MSDraftWorkspace.pickChannel(mode, cfg) — "comm" : 1er canal d'ENVOI configuré, sinon null
//                                             (marche à suivre) ; "offer" : 1er canal PUBLIC
//                                             configuré, sinon null. JAMAIS de repli croisé.
//   MSDraftWorkspace.fetchChannelConfigs(location_id) — cache partagé de la config canaux
//
// Règles (owner 18/07, identiques partout désormais) :
//  - NOTE INTERNE SUPPRIMÉE (une note sans destinataire = néant) ; AUCUNE option inactive :
//    le dropdown n'offre que les canaux réellement configurés ;
//  - destinataires roster + suggestion signal_routing sur TOUS les canaux d'envoi ;
//  - libellés par nature de canal (pub → Publier ; envoi → Envoyer) ;
//  - erreurs d'envoi VISIBLES (la cause serveur s'affiche sous le pied du workspace) ;
//  - l'éditeur s'affiche IMMÉDIATEMENT (owner 19/07) : la génération remplit les champs
//    ensuite — état « Rédaction en cours » visible, actions gelées, jamais d'écran vide.
(function () {
  "use strict";

  // Le module est chargé sur des pages qui ne définissent pas toutes @keyframes ms-spin
  // (pulse ne l'a pas) — il embarque son animation pour être auto-suffisant.
  if (!document.getElementById("ms-dw-style")) {
    var _style = document.createElement("style");
    _style.id = "ms-dw-style";
    _style.textContent = "@keyframes ms-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(_style);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var CHANNEL_DEFS = {gbp:{label:"Google Business Profile",max:1500,icon:"G",color:"#4285F4",cat:"pub"},instagram:{label:"Instagram",max:2200,icon:"IG",color:"#E1306C",cat:"pub"},facebook:{label:"Facebook",max:null,icon:"FB",color:"#0866FF",cat:"pub"},email:{label:"Email",max:null,icon:"@",color:"#6B7280",cat:"send"},sms:{label:"SMS",max:160,icon:"SM",color:"#059669",cat:"send"},whatsapp:{label:"WhatsApp",max:1000,icon:"WA",color:"#25D366",cat:"send"},slack:{label:"Slack",max:null,icon:"SL",color:"#4A154B",cat:"send"},internal:{label:"Note interne",max:null,icon:"N",color:"#374151",cat:"send"},phone:{label:"Appel téléphonique",max:null,icon:"T",color:"#0ea5e9",cat:"send"}};
  // Owner 18/07 : note interne SUPPRIMÉE (une note sans destinataire = néant pour l'opérateur)
  // et AUCUNE option inactive — le dropdown n'offre que les canaux réellement configurés.
  var CHANNEL_PUB_ALL = ["gbp", "facebook", "instagram"];
  var CHANNEL_SEND_ALL = ["email", "slack", "sms", "whatsapp"];
  function usableChannels(cfg) {
    cfg = cfg || {};
    return {
      pub: CHANNEL_PUB_ALL.filter(function (c) { return !!cfg[c]; }),
      send: CHANNEL_SEND_ALL.filter(function (c) { return !!cfg[c]; }),
    };
  }
  var NO_AUTOMATE = {high_competition_density:1,weather_window:1,top_day_approaching:1,audience_shift_opportunity:1,foreign_tourism_signal:1,competitor_threat_direct:1,regime_c_warning:1,competition_proximity:1,low_competition_window:1,extended_bad_weather:1,weekend_opportunity:1,mobility_disruption_resolved:1,mega_event_activation:1,competitor_price_drop:1,competitor_offering_removed:1,review_solicitation:1,competitor_positioning_gap:1,perfect_storm:1,weather_comp_opportunity:1,saturated_bad_weather:1,holiday_high_comp:1,best_day_of_week:1,day_opportunity:1,same_bucket_saturation:1,weekend_vacation_low_comp:1,commercial_event_match:1,weather_window_after_bad:1,extended_bad_weather_3d:1,tourist_high_season:1,tourist_surge_vacation:1,tourism_peak_window:1,tourism_weather_vacation:1,tourism_comp_squeeze:1,low_tourism_local_opp:1,tourism_mobility_hit:1,weather_mobility_double:1,mobility_comp_squeeze:1,ft_peak_bad_weather:1,ft_quiet_good_weather:1,ft_peak_saturated:1,ft_peak_low_comp:1,ft_peak_tourism_vacation:1,ft_peak_mobility:1,sales_missed_opportunity:1,sales_surge:1,sales_traffic_not_converting:1,sales_discount_no_lift:1,sales_revenue_down_wow:1,footfall_vs_basket_decomposition:1,proven_action_replication:1,offering_mix_shift:1};

  // 'internal' est un alias d'AFFICHAGE ; toutes les API parlent 'note_interne'.
  function displayChannel(ch) { return ch === "note_interne" ? "internal" : ch; }
  function apiChannel(ch) { return ch === "internal" ? "note_interne" : ch; }

  // ── Caches partagés (par location) ──
  var _cfgByLoc = {};
  var _teamByLoc = {};
  var _draftsByLoc = {};
  // ── État par workspace (idx) : brouillon courant + jeton de génération ──
  // _draftByIdx : le brouillon vit ici (pas dans la closure de wire) car la génération
  // remplit les champs EN PLACE sans re-render. _genSeq : une réponse en retard (canal
  // changé, panneau fermé, nouvelle génération) ne doit jamais écraser l'éditeur.
  var _draftByIdx = {};
  var _genSeq = {};
  // Révélation « machine à écrire » en cours par workspace (handle MSTypewrite) — toute
  // nouvelle génération la termine d'abord pour que le champ ne soit jamais disputé.
  var _twByIdx = {};

  async function fetchChannelConfigs(locationId) {
    if (_cfgByLoc[locationId]) return _cfgByLoc[locationId];
    var out = {};
    try {
      var res = await fetch("/api/channels/config?location_id=" + encodeURIComponent(locationId));
      var json = await res.json().catch(function () { return null; });
      if (json && json.ok && Array.isArray(json.items)) {
        json.items.forEach(function (item) { if (item.enabled) out[item.channel] = item.config || {}; });
      }
    } catch (e) {}
    _cfgByLoc[locationId] = out;
    return out;
  }

  async function fetchTeamMembers(locationId) {
    if (!locationId) return [];
    if (_teamByLoc[locationId]) return _teamByLoc[locationId];
    var out = [];
    try {
      var res = await fetch("/api/channels/team?location_id=" + encodeURIComponent(locationId));
      var json = await res.json().catch(function () { return null; });
      if (json && json.ok && Array.isArray(json.items)) out = json.items;
    } catch (e) {}
    _teamByLoc[locationId] = out;
    return out;
  }

  // Pool destinataires : le site de la carte s'il a des membres, sinon tous les membres
  // configurés (dédupliqués) — des destinataires sont TOUJOURS proposés (pattern Pulse).
  function teamMembersPool(locationId) {
    var own = _teamByLoc[locationId] || [];
    if (own.length) return own;
    var seen = {}, pool = [];
    for (var k in _teamByLoc) {
      var arr = _teamByLoc[k] || [];
      for (var i = 0; i < arr.length; i++) {
        var m = arr[i];
        var id = m.member_id || (String(m.first_name || "") + "|" + JSON.stringify(m.channels_contact || {}));
        if (!seen[id]) { seen[id] = true; pool.push(m); }
      }
    }
    return pool;
  }

  async function fetchSavedDrafts(locationId) {
    if (_draftsByLoc[locationId]) return _draftsByLoc[locationId];
    var out = [];
    try {
      var res = await fetch("/api/analytics/list-drafts?location_id=" + encodeURIComponent(locationId));
      var json = await res.json().catch(function () { return null; });
      if (json && json.ok && Array.isArray(json.items)) out = json.items;
    } catch (e) {}
    _draftsByLoc[locationId] = out;
    return out;
  }

  // Communiquer ("comm") = envoyer le brief interne à l'équipe : canal d'ENVOI uniquement.
  // Le repli public (u.pub[0]) est INTERDIT — bug du 17/07 : sur un site sans email/slack
  // configuré, Communiquer ouvrait Facebook avec un post marketing. Sans canal d'envoi →
  // null = la marche à suivre (« Configurer mes canaux → /profile »). "offer" (Proposer une
  // offre, Pulse) = canal PUBLIC uniquement, même règle sans repli croisé.
  function pickChannel(mode, cfg) {
    var u = usableChannels(cfg);
    if (mode === "offer") return u.pub[0] || null;
    return u.send[0] || null;
  }

  function autoResizeTextarea(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  function spinnerHtml(label) {
    return '<div style="padding:20px 0;display:flex;align-items:center;justify-content:center;gap:8px;color:#9ca3af;font-size:11px;"><span style="width:10px;height:10px;border:1.5px solid #e5e7eb;border-top-color:#1D3BB3;border-radius:50%;display:inline-block;animation:ms-spin 0.7s linear infinite;flex-shrink:0;"></span>' + label + '</div>';
  }

  // ── Tiroir « Mes brouillons » (extraction verbatim de Pulse) ──
  function openBrouillonLibrary(opts) {
    var existing = document.getElementById("ms-draft-library");
    if (existing) { existing.remove(); return; }
    var drafts = opts.drafts || [];
    var showAdapt = opts.showAdapt !== false;
    var overlay = document.createElement("div");
    overlay.id = "ms-draft-library";
    overlay.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:380px;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,0.12);z-index:9999;display:flex;flex-direction:column;font-family:inherit;";
    var header = '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">'
      + '<div><div style="font-weight:700;font-size:15px;color:#111827;">Mes brouillons</div><div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + drafts.length + ' brouillon' + (drafts.length > 1 ? 's' : '') + '</div></div>'
      + '<button type="button" id="ms-lib-close" style="background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer;padding:4px 8px;line-height:1;">×</button>'
    + '</div>';
    var SIGNAL_LABELS = {weather_worsened:"Météo dégradée",weather_improved:"Météo améliorée",weather_hazard_onset:"Alerte météo",competitor_event_launch:"Lancement concurrent",competitor_audience_conflict:"Conflit audience",competition_pressure_spike:"Pression concurrentielle",competitor_event_ending:"Fin concurrent",mobility_disruption:"Perturbation mobilité",score_up:"Score en hausse",_day_opportunity:"Opportunité jour",_best_day:"Meilleur jour",score_down:"Score en baisse",sales_surge:"CA au-dessus de l’attendu",sales_revenue_down_wow:"CA sous l’attendu",sales_traffic_not_converting:"Trafic sans conversion",sales_discount_no_lift:"Remise sans effet"};
    var cards = '';
    for (var di = 0; di < drafts.length; di++) {
      var d = drafts[di];
      var dCh = CHANNEL_DEFS[displayChannel(d.channel)] || CHANNEL_DEFS.gbp;
      var sigLbl = SIGNAL_LABELS[d.signal_type] || d.signal_type || "";
      var isMatch = d.signal_type === opts.activeSignalType && apiChannel(d.channel || "") === apiChannel(opts.activeChannel || "");
      var preview = (d.body || "").substring(0, 120) + ((d.body || "").length > 120 ? "…" : "");
      var dateLbl = d.created_at ? String(d.created_at).substring(0, 10) : "";
      cards += '<div style="padding:12px 14px;border-radius:8px;margin-bottom:8px;border:' + (isMatch ? '1.5px solid #1D3BB3' : '1px solid #e5e7eb') + ';background:' + (isMatch ? '#F5F7FF' : '#fff') + ';cursor:pointer;">'
        + '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap;">'
          + '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#EFF6FF;color:#1D3BB3;">' + escapeHtml(sigLbl) + '</span>'
          + '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px;background:' + dCh.color + '18;color:' + dCh.color + ';">' + escapeHtml(dCh.icon + ' ' + dCh.label) + '</span>'
          + (isMatch ? '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#DCFCE7;color:#166534;">Correspondance</span>' : '')
          + '<span style="font-size:10px;color:#9ca3af;margin-left:auto;">' + escapeHtml(dateLbl) + '</span>'
        + '</div>'
        + (d.title ? '<div style="font-weight:600;font-size:12px;color:#111827;margin-bottom:3px;">' + escapeHtml(d.title) + '</div>' : '')
        + '<div style="font-size:11px;color:#6b7280;line-height:1.4;">' + escapeHtml(preview) + '</div>'
        + (d.tone ? '<div style="font-size:10px;color:#9ca3af;margin-top:6px;font-style:italic;">Ton : ' + escapeHtml(d.tone) + '</div>' : '')
        + '<div style="display:flex;gap:6px;margin-top:8px;">'
          + (showAdapt ? '<button type="button" data-lib-style="' + di + '" style="flex:1;padding:6px 0;border-radius:6px;font-size:11px;font-weight:600;background:#1D3BB3;color:#fff;border:none;cursor:pointer;font-family:inherit;">Adapter au signal</button>' : '')
          + '<button type="button" data-lib-raw="' + di + '" style="flex:1;padding:6px 0;border-radius:6px;font-size:11px;font-weight:600;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;cursor:pointer;font-family:inherit;">Utiliser tel quel</button>'
        + '</div>'
      + '</div>';
    }
    overlay.innerHTML = header + '<div style="flex:1;overflow-y:auto;padding:12px 16px;">' + cards + '</div>';
    document.body.appendChild(overlay);
    document.getElementById("ms-lib-close").addEventListener("click", function () { overlay.remove(); });
    overlay.querySelectorAll("[data-lib-raw]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-lib-raw"), 10);
        var picked = drafts[idx];
        if (!picked) return;
        overlay.remove();
        if (opts.onRaw) opts.onRaw(picked);
      });
    });
    if (showAdapt) overlay.querySelectorAll("[data-lib-style]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(btn.getAttribute("data-lib-style"), 10);
        var picked = drafts[idx];
        if (!picked) return;
        overlay.remove();
        if (opts.onAdapt) opts.onAdapt(picked);
      });
    });
  }

  // ── Dropdown canaux (extraction verbatim de Pulse) ──
  function buildChannelDropdown(currentCh, idx, cfg) {
    currentCh = displayChannel(currentCh);
    var u = usableChannels(cfg);
    var ch = CHANNEL_DEFS[currentCh] || CHANNEL_DEFS.gbp;
    function chItems(list, heading) {
      return '<div style="padding:6px 14px 2px;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">' + heading + '</div>'
        + list.map(function (cId) {
          var c = CHANNEL_DEFS[cId];
          return '<button type="button" data-ch-select="' + cId + '" data-ch-card="' + idx + '" style="display:flex;align-items:center;gap:10px;padding:8px 14px;width:100%;border:none;background:' + (cId === currentCh ? '#EFF6FF' : '#fff') + ';cursor:pointer;font-size:12px;color:#374151;font-family:inherit;text-align:left;border-bottom:0.5px solid #f3f4f6;">'
            + '<span style="width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;background:' + c.color + ';flex-shrink:0;">' + c.icon + '</span>'
            + '<span style="flex:1;">' + escapeHtml(c.label) + '</span>'
            + (c.max ? '<span style="font-size:10px;color:#9ca3af;">' + c.max + ' car.</span>' : '')
          + '</button>';
        }).join("");
    }
    return '<div style="position:relative;display:inline-block;" data-ch-dropdown="' + idx + '">'
      + '<button type="button" data-ch-toggle="' + idx + '" style="display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;font-size:11px;font-weight:600;color:#374151;font-family:inherit;">'
        + '<span style="width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff;background:' + ch.color + ';flex-shrink:0;">' + ch.icon + '</span>'
        + escapeHtml(ch.label)
        + ' <span style="font-size:9px;color:#9ca3af;">▾</span>'
      + '</button>'
      + '<div data-ch-menu="' + idx + '" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.1);z-index:10;min-width:240px;overflow:hidden;">'
        + (u.pub.length ? chItems(u.pub, "Publier sur") : "")
        + (u.send.length ? chItems(u.send, "Envoyer à") : "")
      + '</div>'
    + '</div>';
  }

  // Texte du corps : brouillon + lien fiche signal pour les canaux d'envoi. Partagé entre
  // le rendu initial et le remplissage en place post-génération.
  function draftBodyText(channel, draft, opts) {
    var ch = CHANNEL_DEFS[displayChannel(channel)] || CHANNEL_DEFS.gbp;
    var bodyText = draft ? (draft.body || draft.full_text || "") : "";
    if (ch.cat === "send" && bodyText && opts.detail_url) {
      bodyText += "\n\n—\nConsulter le détail : " + opts.detail_url;
    }
    return bodyText;
  }

  // ── Corps du workspace (extraction verbatim de Pulse, paramétrée par opts) ──
  function buildWorkspaceHtml(idx, channel, draft, isStyled, opts) {
    channel = displayChannel(channel);
    var ch = CHANNEL_DEFS[channel] || CHANNEL_DEFS.gbp;
    var isOffer = opts.artifact_mode === "offer";
    var showTitle = channel === "gbp" || channel === "email";
    var showHashtags = channel === "instagram" || channel === "gbp";
    var showRecipient = ch.cat === "send";
    var bodyText = draftBodyText(channel, draft, opts);
    var titleText = draft ? (draft.title || "") : "";
    var hashText = draft ? (draft.hashtags || "") : "";
    var charCount = bodyText.length + (titleText ? titleText.length + 1 : 0) + (hashText ? hashText.length + 1 : 0);
    var recipientPlaceholder = channel === "email" ? "destinataire@email.com" : channel === "sms" ? "+33 6 12 34 56 78" : channel === "whatsapp" ? "+33 6 12 34 56 78" : channel === "slack" ? "#canal ou @nom" : channel === "phone" ? "+33 6 12 34 56 78" : "";
    var cfg = _cfgByLoc[opts.location_id] || {};
    var drafts = _draftsByLoc[opts.location_id] || [];
    var isPub = ch.cat === "pub";
    var hasConfig = !!cfg[apiChannel(channel)];
    var actionIdle = isPub ? "Publier →" : "Envoyer →";

    return '<div style="background:#fff;border:1px solid #E8EDF5;border-top:3px solid #1D3BB3;overflow:hidden;margin-top:10px;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f3f4f6;">'
        + '<div style="display:flex;align-items:center;gap:8px;">'
          + buildChannelDropdown(channel, idx, cfg)
          + '<button type="button" data-ws-close="' + idx + '" style="background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af;padding:2px 4px;line-height:1;font-family:inherit;">×</button>'
        + '</div>'
        + (drafts.length > 0 ? '<button type="button" data-ws-library="' + idx + '" style="background:none;border:none;color:#1D3BB3;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;">Mes brouillons (' + drafts.length + ')</button>' : '')
      + '</div>'
      + '<div data-ws-style-banner="' + idx + '" style="margin:8px 14px 0;padding:8px 12px;border-radius:6px;background:#F5F7FF;border:1px solid #DBEAFE;display:' + (isStyled ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;"><span style="font-size:11px;color:#1D3BB3;font-weight:500;">Adapté depuis votre brouillon précédent</span><button type="button" data-ws-regen="' + idx + '" style="background:none;border:none;color:#6b7280;font-size:10px;font-weight:600;cursor:pointer;text-decoration:underline;font-family:inherit;">Réécrire sans modèle</button></div>'
      + (ch.cat === "send" && opts.detail_url ? '<div style="margin:8px 14px 0;padding:8px 12px;border-radius:6px;background:#F5F7FF;border:1px solid #DBEAFE;display:flex;align-items:center;justify-content:space-between;"><span style="font-size:11px;color:#1D3BB3;font-weight:500;">📎 Fiche signal jointe au message</span><span style="font-size:10px;color:#9ca3af;">auto</span></div>' : '')
      + (showRecipient ? (function () {
        var members = teamMembersPool(opts.location_id).filter(function (m) { var cc = m.channels_contact || {}; return cc[channel]; });
        var ROUTING_MAP = window.MS_ROUTING_MAP || {};
        var sigCat = ROUTING_MAP[opts.signal_type] || '';
        var suggested = sigCat ? members.find(function (m) { var r = m.signal_routing || {}; return r[sigCat] === true || r[sigCat] === 'true'; }) : null;
        var html = '<div style="padding:8px 14px 0;position:relative;" data-ws-recipient-wrap="' + idx + '">'
          + '<div style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Destinataire</div>'
          + '<input data-ws-recipient="' + idx + '" placeholder="' + escapeHtml(recipientPlaceholder) + '" value="' + (suggested ? escapeHtml(suggested.channels_contact[channel]) : '') + '" data-display-name="' + (suggested ? escapeHtml(suggested.first_name + (suggested.last_name ? ' ' + suggested.last_name : '') + ' · ' + suggested.channels_contact[channel]) : '') + '" style="width:100%;border:none;border-bottom:1px solid #e5e7eb;padding:6px 0;font-size:12px;color:#111827;outline:none;font-family:inherit;background:transparent;" autocomplete="off" />';
        if (members.length > 0) {
          html += '<div data-ws-recipient-dd="' + idx + '" style="display:none;position:absolute;top:100%;left:14px;right:14px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.06);z-index:100;margin-top:4px;overflow:hidden;">';
          if (suggested) {
            html += '<div data-ws-pick-member="' + escapeHtml(suggested.channels_contact[channel]) + '" style="padding:10px 12px;cursor:pointer;background:#F5F7FF;border-bottom:1px solid #e5e7eb;">'
              + '<div style="display:flex;align-items:center;justify-content:space-between;">'
                + '<div><span style="font-size:13px;font-weight:600;color:#111827;">' + escapeHtml(suggested.first_name + (suggested.last_name ? ' ' + suggested.last_name : '')) + '</span><span style="font-size:11px;color:#9ca3af;margin-left:6px;">' + escapeHtml(suggested.role || '') + '</span></div>'
                + '<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:#DCFCE7;color:#166534;">Suggéré</span>'
              + '</div>'
              + '<div style="font-size:11px;color:#6b7280;margin-top:2px;">' + escapeHtml(suggested.channels_contact[channel]) + '</div>'
            + '</div>';
          }
          members.filter(function (m) { return !suggested || m.member_id !== suggested.member_id; }).forEach(function (m) {
            html += '<div data-ws-pick-member="' + escapeHtml(m.channels_contact[channel]) + '" style="padding:10px 12px;cursor:pointer;">'
              + '<span style="font-size:13px;font-weight:500;color:#111827;">' + escapeHtml(m.first_name + (m.last_name ? ' ' + m.last_name : '')) + '</span>'
              + '<span style="font-size:11px;color:#9ca3af;margin-left:6px;">' + escapeHtml(m.role || '') + '</span>'
              + '<div style="font-size:11px;color:#6b7280;margin-top:1px;">' + escapeHtml(m.channels_contact[channel]) + '</div>'
            + '</div>';
          });
          html += '<div style="padding:8px 12px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af;">Ou saisissez directement</div>';
          html += '</div>';
        }
        html += '</div>';
        return html;
      })() : '')
      + (showTitle ? '<div style="padding:10px 14px 0;"><input data-ws-title="' + idx + '" value="' + escapeHtml(titleText) + '" placeholder="Titre" style="width:100%;border:none;border-bottom:1px solid #e5e7eb;padding:6px 0;font-size:13px;font-weight:600;color:#111827;outline:none;font-family:inherit;background:transparent;" /></div>' : '')
      + '<div style="padding:10px 14px;">'
        + '<div data-ws-genstate="' + idx + '" style="display:none;align-items:center;gap:8px;padding:2px 0 8px;color:#6b7280;font-size:11px;">'
          + '<span style="width:10px;height:10px;border:1.5px solid #e5e7eb;border-top-color:#1D3BB3;border-radius:50%;display:inline-block;animation:ms-spin 0.7s linear infinite;flex-shrink:0;"></span>'
          + '<span data-ws-genstate-label="' + idx + '"></span>'
        + '</div>'
        + '<textarea data-ws-body="' + idx + '" style="width:100%;border:none;outline:none;font-size:12.5px;color:#111827;line-height:1.6;resize:none;overflow:hidden;min-height:100px;font-family:inherit;background:transparent;">' + escapeHtml(bodyText) + '</textarea>'
      + '</div>'
      + (isOffer ? '<div style="padding:0 14px 10px;border-top:1px solid #f3f4f6;">'
          + '<div style="font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:#6b7280;margin:10px 0 6px;">Offre</div>'
          + '<div style="display:flex;gap:8px;margin-bottom:6px;">'
            + '<input data-ws-validity-from="' + idx + '" placeholder="Valable du" style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:11px;color:#111827;outline:none;font-family:inherit;background:#f9fafb;box-sizing:border-box;" />'
            + '<input data-ws-validity-to="' + idx + '" placeholder="au" style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:11px;color:#111827;outline:none;font-family:inherit;background:#f9fafb;box-sizing:border-box;" />'
          + '</div>'
          + '<input data-ws-cta="' + idx + '" placeholder="Appel à l’action (ex. Réserver)" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:11px;color:#111827;outline:none;font-family:inherit;background:#f9fafb;box-sizing:border-box;margin-bottom:6px;" />'
          + '<input data-ws-code="' + idx + '" placeholder="Code promo (optionnel)" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:11px;color:#111827;outline:none;font-family:inherit;background:#f9fafb;box-sizing:border-box;" />'
        + '</div>' : '')
      + (showHashtags ? '<div style="padding:0 14px 10px;"><input data-ws-hashtags="' + idx + '" value="' + escapeHtml(hashText) + '" placeholder="#hashtags" style="width:100%;border:none;border-top:1px solid #f3f4f6;padding:6px 0;font-size:11px;color:#6366f1;outline:none;font-family:inherit;background:transparent;" /></div>' : '')
      + '<div style="padding:0 14px 10px;display:flex;align-items:center;gap:10px;" data-ws-charcount="' + idx + '">'
        + (ch.max
          ? '<div style="flex:1;height:3px;background:#e5e7eb;border-radius:2px;overflow:hidden;"><div data-ws-charbar="' + idx + '" style="width:' + Math.min(100, Math.round(charCount / ch.max * 100)) + '%;height:100%;background:#1D3BB3;border-radius:2px;transition:width 0.2s;"></div></div><span data-ws-charnum="' + idx + '" style="font-size:10px;font-weight:500;white-space:nowrap;color:#9ca3af;">' + charCount + ' / ' + ch.max + '</span>'
          : '<span data-ws-charnum="' + idx + '" style="font-size:10px;color:#9ca3af;">' + charCount + ' caractères</span>')
      + '</div>'
      + '<div style="padding:6px 14px 10px;border-top:1px solid #f3f4f6;display:flex;align-items:center;gap:6px;">'
        + '<input data-ws-adjust="' + idx + '" placeholder="Ajuster : plus court, ajouter les horaires…" style="flex:1;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;font-size:11px;color:#111827;outline:none;font-family:inherit;background:#f9fafb;" />'
        + '<button type="button" data-ws-adjust-submit="' + idx + '" style="padding:6px 12px;border-radius:6px;background:#1D3BB3;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">→</button>'
      + '</div>'
      + '<div style="padding:10px 14px;border-top:1px solid #f3f4f6;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
        + '<button type="button" data-ws-copy="' + idx + '" style="padding:7px 14px;border-radius:6px;background:#1D3BB3;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Copier</button>'
        + '<button type="button" data-ws-save="' + idx + '" style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Enregistrer</button>'
        + '<div style="flex:1;"></div>'
        + (hasConfig
          ? '<button type="button" data-ws-publish="' + idx + '" style="padding:7px 14px;border-radius:6px;background:#fff;color:#1D3BB3;border:1px solid #1D3BB3;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">' + actionIdle + '</button>'
          : '<button type="button" disabled data-ws-publish="' + idx + '" data-ws-cfg-disabled="1" title="Configurez ce canal dans vos paramètres" style="padding:7px 14px;border-radius:6px;background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:not-allowed;font-family:inherit;opacity:0.5;">' + actionIdle + '</button>')
        + (NO_AUTOMATE[String(opts.signal_type || "")] ? "" : '<button type="button" data-ws-automate="' + idx + '" style="padding:7px 10px;border-radius:6px;background:none;color:#1D3BB3;border:1px dashed #C7D2FE;font-size:10px;font-weight:500;cursor:pointer;font-family:inherit;">&#9889; Automatiser</button>')
      + '<div data-ws-auto-prompt="' + idx + '" style="display:none;"></div>'
      + '</div>'
      + '<div data-ws-pub-err="' + idx + '" style="display:none;padding:0 14px 12px;font-size:11px;color:#B91C1C;line-height:1.5;"></div>'
    + '</div>';
  }

  // État « rédaction en cours » (owner 19/07) : l'éditeur reste affiché, les champs texte
  // et les actions sont gelés le temps de la génération — jamais d'écran vide. Le champ
  // destinataire reste actif : le user peut choisir à qui envoyer pendant que ça rédige.
  function setGenerating(mount, idx, on, label) {
    var gs = mount.querySelector('[data-ws-genstate="' + idx + '"]');
    var gsLabel = mount.querySelector('[data-ws-genstate-label="' + idx + '"]');
    if (gs) gs.style.display = on ? "flex" : "none";
    if (gsLabel && label) gsLabel.textContent = label;
    ["data-ws-body", "data-ws-title", "data-ws-hashtags", "data-ws-adjust"].forEach(function (attr) {
      var el = mount.querySelector('[' + attr + '="' + idx + '"]');
      if (el) { el.disabled = on; el.style.opacity = on ? "0.45" : "1"; }
    });
    ["data-ws-copy", "data-ws-save", "data-ws-adjust-submit", "data-ws-automate", "data-ws-regen"].forEach(function (attr) {
      var el = mount.querySelector('[' + attr + '="' + idx + '"]');
      if (el) { el.disabled = on; el.style.opacity = on ? "0.5" : "1"; }
    });
    var pub = mount.querySelector('[data-ws-publish="' + idx + '"]');
    if (pub && !pub.hasAttribute("data-ws-cfg-disabled")) { pub.disabled = on; pub.style.opacity = on ? "0.5" : "1"; }
  }

  function updateCharCount(mount, idx, channel) {
    var ch = CHANNEL_DEFS[displayChannel(channel)] || CHANNEL_DEFS.gbp;
    var bodyEl = mount.querySelector('[data-ws-body="' + idx + '"]');
    var titleEl = mount.querySelector('[data-ws-title="' + idx + '"]');
    var hashEl = mount.querySelector('[data-ws-hashtags="' + idx + '"]');
    var barEl = mount.querySelector('[data-ws-charbar="' + idx + '"]');
    var numEl = mount.querySelector('[data-ws-charnum="' + idx + '"]');
    var count = (bodyEl ? bodyEl.value.length : 0) + (titleEl ? titleEl.value.length + 1 : 0) + (hashEl ? hashEl.value.length + 1 : 0);
    if (ch.max) {
      var pct = Math.min(100, Math.round(count / ch.max * 100));
      var over = count > ch.max;
      if (barEl) { barEl.style.width = pct + "%"; barEl.style.background = over ? "#dc2626" : "#1D3BB3"; }
      if (numEl) { numEl.textContent = count + " / " + ch.max; numEl.style.color = over ? "#dc2626" : "#9ca3af"; }
    } else {
      if (numEl) numEl.textContent = count + " caractères";
    }
  }

  function showRecipientSavePrompt(mount, idx, channel, locationId, recipVal) {
    if (!recipVal) return;
    var isKnown = (_teamByLoc[locationId] || []).some(function (m) { return (m.channels_contact || {})[channel] === recipVal; });
    if (isKnown) return;
    var savePrompt = document.createElement("div");
    savePrompt.style.cssText = "margin:10px 0 0;padding:14px 16px;border-radius:8px;background:#F5F7FF;border:1px solid #DBEAFE;";
    savePrompt.innerHTML = '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">Enregistrer ce destinataire ?</div>'
      + '<div style="font-size:11px;color:#6b7280;margin-bottom:12px;">' + escapeHtml(recipVal) + ' sera disponible pour vos prochaines publications.</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">'
        + '<input data-save-recip-fn placeholder="Prénom" style="border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;outline:none;font-family:inherit;" />'
        + '<input data-save-recip-ln placeholder="Nom" style="border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;outline:none;font-family:inherit;" />'
      + '</div>'
      + '<input data-save-recip-role placeholder="Rôle (optionnel)" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;outline:none;font-family:inherit;margin-bottom:10px;box-sizing:border-box;" />'
      + '<div style="display:flex;gap:8px;">'
        + '<button type="button" data-save-recip-ok style="padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;background:#1D3BB3;color:#fff;border:none;cursor:pointer;font-family:inherit;">Enregistrer</button>'
        + '<button type="button" data-save-recip-skip style="padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;cursor:pointer;font-family:inherit;">Pas maintenant</button>'
      + '</div>';
    mount.appendChild(savePrompt);
    savePrompt.querySelector("[data-save-recip-skip]").addEventListener("click", function () { savePrompt.remove(); });
    savePrompt.querySelector("[data-save-recip-ok]").addEventListener("click", async function () {
      var fnEl = savePrompt.querySelector("[data-save-recip-fn]");
      var lnEl = savePrompt.querySelector("[data-save-recip-ln]");
      var roleEl = savePrompt.querySelector("[data-save-recip-role]");
      var fn = fnEl ? fnEl.value.trim() : "";
      if (!fn) { fnEl.style.borderColor = "#ef4444"; return; }
      var chContact = {};
      chContact[channel] = recipVal;
      this.disabled = true;
      this.textContent = "...";
      try {
        var res = await fetch("/api/channels/team", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ location_id: locationId, first_name: fn, last_name: lnEl ? lnEl.value.trim() : "", role: roleEl ? roleEl.value.trim() : "", channels_contact: chContact, signal_routing: {} }),
        });
        var json2 = await res.json();
        if (json2 && json2.ok) {
          delete _teamByLoc[locationId];
          await fetchTeamMembers(locationId);
          savePrompt.innerHTML = '<div style="display:flex;align-items:center;gap:8px;"><span style="color:#166534;">✓</span><span style="font-size:12px;color:#166534;font-weight:500;">Destinataire enregistré</span></div>';
          setTimeout(function () { savePrompt.remove(); }, 2000);
        }
      } catch (e) { this.textContent = "Erreur"; this.disabled = false; }
    });
  }

  function showAutoPrompt(container, mount, idx, channel, opts) {
    var ROUTING_MAP = window.MS_ROUTING_MAP || {};
    var CAT_LABELS = {weather:"Météo",competition:"Concurrence",mobility:"Mobilité",opportunity:"Opportunité",calendar:"Calendrier"};
    var sigCat = ROUTING_MAP[opts.signal_type] || "competition";
    var catLabel = CAT_LABELS[sigCat] || sigCat;
    var chDefL = {gbp:"GBP",instagram:"Instagram",facebook:"Facebook",email:"Email",sms:"SMS",whatsapp:"WhatsApp",slack:"Slack",internal:"Interne",phone:"Téléphone"};
    var chLabel = chDefL[displayChannel(channel)] || channel;
    var rEl = mount.querySelector('[data-ws-recipient="' + idx + '"]');
    var recipVal = rEl ? rEl.value.trim() : "";
    var cfg = _cfgByLoc[opts.location_id] || {};
    var dCh = displayChannel(channel);
    var hasChannelConfig = !!cfg[apiChannel(channel)];
    var canPublish = hasChannelConfig && (dCh === "gbp" || dCh === "facebook" || dCh === "instagram" || recipVal);

    container.style.display = "block";
    container.innerHTML = '<div style="padding:12px 14px;margin:8px 0 4px;background:#EFF3FF;border-radius:8px;border:1px solid #D6DFFF;">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="width:22px;height:22px;border-radius:5px;background:#1D3BB3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">⚡</span>'
        + '<span style="font-size:12px;font-weight:600;color:#1D3BB3;">Publier + automatiser</span>'
      + '</div>'
      + '<div style="font-size:11px;color:#4B5563;margin-bottom:8px;line-height:1.4;">'
        + (canPublish
          ? 'Publie ce brouillon sur <strong style="color:#1F2937;">' + escapeHtml(chLabel) + '</strong>' + (recipVal ? ' pour <strong style="color:#1F2937;">' + escapeHtml(recipVal) + '</strong>' : '') + ' maintenant, et automatise pour les prochains signaux <strong style="color:#1F2937;">' + escapeHtml(catLabel) + '</strong>.'
          : 'Copie ce brouillon et automatise pour les prochains signaux <strong style="color:#1F2937;">' + escapeHtml(catLabel) + '</strong> sur <strong style="color:#1F2937;">' + escapeHtml(chLabel) + '</strong>' + (recipVal ? ' pour <strong style="color:#1F2937;">' + escapeHtml(recipVal) + '</strong>' : '') + '.')
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        + '<button type="button" data-auto-confirm="validation" style="font-size:10px;font-weight:600;padding:5px 10px;border-radius:5px;background:#1D3BB3;color:#fff;border:none;cursor:pointer;font-family:inherit;">' + (canPublish ? 'Publier + validation' : 'Copier + validation') + '</button>'
        + '<button type="button" data-auto-confirm="auto" style="font-size:10px;font-weight:600;padding:5px 10px;border-radius:5px;background:#fff;color:#1D3BB3;border:1px solid #C7D2FE;cursor:pointer;font-family:inherit;">' + (canPublish ? 'Publier + auto' : 'Copier + auto') + '</button>'
        + '<button type="button" data-auto-confirm="dismiss" style="font-size:10px;font-weight:500;padding:5px 6px;background:none;border:none;color:#9CA3AF;cursor:pointer;font-family:inherit;">Non merci</button>'
      + '</div>'
    + '</div>';

    container.querySelectorAll("[data-auto-confirm]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var mode = btn.getAttribute("data-auto-confirm");
        if (mode === "dismiss") { container.style.display = "none"; container.innerHTML = ""; return; }
        btn.disabled = true;
        btn.textContent = "...";
        var bEl = mount.querySelector('[data-ws-body="' + idx + '"]');
        var tEl = mount.querySelector('[data-ws-title="' + idx + '"]');
        var hEl = mount.querySelector('[data-ws-hashtags="' + idx + '"]');
        var bodyText = bEl ? bEl.value : "";
        var titleText = tEl ? tEl.value : "";
        var hashText = hEl ? hEl.value : "";
        fetch("/api/channels/automation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ location_id: opts.location_id, signal_category: sigCat, channel: apiChannel(channel), recipient: recipVal, require_approval: mode === "validation", frequency: "first_occurrence" }),
        }).then(function (ruleRes) { return ruleRes.json(); }).then(function (ruleJson) {
          if (!ruleJson || !ruleJson.ok) throw new Error(ruleJson?.error || "Erreur règle");
          if (opts.onAutomationCreated) opts.onAutomationCreated();
          if (canPublish) {
            return fetch("/api/channels/publish", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ channel: apiChannel(channel), location_id: opts.location_id, title: titleText, body: bodyText, hashtags: hashText, recipient: recipVal, signal_type: opts.signal_type || "", affected_date: opts.affected_date || "" }),
            }).then(function (pubRes) { return pubRes.json(); }).then(function (pubJson) {
              if (pubJson && pubJson.ok) {
                fetch("/api/analytics/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "auto_publish", location_id: opts.location_id, change_subtype: opts.signal_type, action_key: "auto_publish", channel: apiChannel(channel), affected_date: opts.affected_date || null }) }).catch(function () {});
                if (opts.onStatus) opts.onStatus("published");
                container.innerHTML = '<div style="padding:10px 14px;margin:8px 0 4px;background:#ECFDF5;border-radius:8px;border:1px solid #D1FAE5;">'
                  + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                    + '<span style="width:18px;height:18px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;">✓</span>'
                    + '<span style="font-size:11px;color:#065F46;font-weight:600;">Publié sur ' + escapeHtml(chLabel) + '</span>'
                  + '</div>'
                  + '<div style="display:flex;align-items:center;gap:8px;">'
                    + '<span style="width:18px;height:18px;border-radius:50%;background:#1D3BB3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;">⚡</span>'
                    + '<span style="font-size:11px;color:#1D3BB3;font-weight:500;">Règle créée : ' + escapeHtml(catLabel) + ' → ' + escapeHtml(chLabel) + ' (' + (mode === "auto" ? "auto" : "validation") + ')</span>'
                  + '</div>'
                + '</div>';
                showRecipientSavePrompt(mount, idx, displayChannel(channel), opts.location_id, recipVal);
              } else {
                throw new Error(pubJson?.error || "Erreur publication");
              }
            });
          } else {
            var fullText = [titleText, bodyText, hashText].filter(Boolean).join("\n\n");
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(fullText).catch(function () {});
            fetch("/api/analytics/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "draft_copied", location_id: opts.location_id, change_subtype: opts.signal_type, action_key: "draft", channel: apiChannel(channel), affected_date: opts.affected_date || null }) }).catch(function () {});
            if (opts.onStatus) opts.onStatus("copied");
            container.innerHTML = '<div style="padding:10px 14px;margin:8px 0 4px;background:#EFF3FF;border-radius:8px;border:1px solid #D6DFFF;">'
              + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">'
                + '<span style="width:18px;height:18px;border-radius:50%;background:#1D3BB3;color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;">✓</span>'
                + '<span style="font-size:11px;color:#1D3BB3;font-weight:500;">Texte copié + Règle créée : ' + escapeHtml(catLabel) + ' → ' + escapeHtml(chLabel) + ' (' + (mode === "auto" ? "auto" : "validation") + ')</span>'
              + '</div>'
            + '</div>';
          }
        }).catch(function (err) {
          container.innerHTML = '<div style="padding:10px 14px;font-size:11px;color:#B91C1C;">Erreur : ' + escapeHtml(err?.message || "Réessayez") + '</div>';
        });
      });
    });
  }

  function buildDraftPayload(opts, channel, userInstruction, styleReference) {
    var p = {
      action_key: "draft",
      channel: apiChannel(channel),
      change_subtype: opts.signal_type,
      signal: opts.signal || {},
      card_what: opts.card_what || opts.signal_type,
      card_sowhat: opts.card_sowhat || "",
      artifact_mode: opts.artifact_mode || "post",
      data_payload: opts.signal || {},
    };
    var seed = null;
    if (window.getDraftSeed && window.ACTION_CARDS) {
      try { seed = window.getDraftSeed(opts.signal_type, apiChannel(channel), opts.signal || {}, opts.prof || {}, opts.day || {}); } catch (e) {}
    }
    if (seed) p.draft_seed = seed;
    if (userInstruction) p.user_instruction = userInstruction;
    if (styleReference) p.style_reference = styleReference;
    return p;
  }

  function wire(mount, idx, channel, draft, opts) {
    var bodyEl = mount.querySelector('[data-ws-body="' + idx + '"]');
    if (bodyEl) { autoResizeTextarea(bodyEl); bodyEl.addEventListener("input", function () { autoResizeTextarea(bodyEl); updateCharCount(mount, idx, channel); }); }
    var titleEl = mount.querySelector('[data-ws-title="' + idx + '"]');
    if (titleEl) titleEl.addEventListener("input", function () { updateCharCount(mount, idx, channel); });
    var hashEl = mount.querySelector('[data-ws-hashtags="' + idx + '"]');
    if (hashEl) hashEl.addEventListener("input", function () { updateCharCount(mount, idx, channel); });

    var chToggle = mount.querySelector('[data-ch-toggle="' + idx + '"]');
    var chMenu = mount.querySelector('[data-ch-menu="' + idx + '"]');
    if (chToggle && chMenu) chToggle.addEventListener("click", function (ev) { ev.stopPropagation(); chMenu.style.display = chMenu.style.display === "none" ? "block" : "none"; });
    mount.querySelectorAll('[data-ch-select]').forEach(function (chBtn) {
      chBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        // _draftByIdx, pas la closure : la génération remplit en place sans re-wire.
        render(mount, idx, chBtn.getAttribute("data-ch-select"), _draftByIdx[idx] || draft, false, opts);
      });
    });

    var closeBtn = mount.querySelector('[data-ws-close="' + idx + '"]');
    if (closeBtn) closeBtn.addEventListener("click", function () {
      mount.style.display = "none";
      mount.innerHTML = "";
      if (opts.onClose) opts.onClose();
    });

    function offerSuffix() {
      var vfEl = mount.querySelector('[data-ws-validity-from="' + idx + '"]');
      var vtEl = mount.querySelector('[data-ws-validity-to="' + idx + '"]');
      var ctaEl = mount.querySelector('[data-ws-cta="' + idx + '"]');
      var codeEl = mount.querySelector('[data-ws-code="' + idx + '"]');
      var lines = [];
      if (vfEl && vfEl.value) lines.push("Valable du " + vfEl.value + (vtEl && vtEl.value ? " au " + vtEl.value : ""));
      else if (vtEl && vtEl.value) lines.push("Valable jusqu’au " + vtEl.value);
      if (ctaEl && ctaEl.value) lines.push(ctaEl.value);
      if (codeEl && codeEl.value) lines.push("Code : " + codeEl.value);
      return lines.length ? lines.join("\n") : "";
    }

    var copyBtn = mount.querySelector('[data-ws-copy="' + idx + '"]');
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var fullText = [titleEl ? titleEl.value : "", bodyEl ? bodyEl.value : "", offerSuffix(), hashEl ? hashEl.value : ""].filter(Boolean).join("\n\n");
      navigator.clipboard.writeText(fullText).then(function () {
        copyBtn.textContent = "Copié ✓";
        setTimeout(function () { copyBtn.textContent = "Copier"; }, 2000);
      }).catch(function () {});
      if (opts.onStatus) opts.onStatus("copied");
      fetch("/api/analytics/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "draft_copied", location_id: opts.location_id, action_key: "draft", channel: apiChannel(channel), affected_date: opts.affected_date || null }) }).catch(function () {});
    });

    var saveBtn = mount.querySelector('[data-ws-save="' + idx + '"]');
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var rEl = mount.querySelector('[data-ws-recipient="' + idx + '"]');
      saveBtn.textContent = "✓ Enregistré";
      saveBtn.style.background = "#f0fdf4"; saveBtn.style.color = "#166534"; saveBtn.style.borderColor = "#bbf7d0";
      setTimeout(function () { saveBtn.textContent = "Enregistrer"; saveBtn.style.background = "#f9fafb"; saveBtn.style.color = "#374151"; saveBtn.style.borderColor = "#e5e7eb"; }, 2000);
      if (opts.onStatus) opts.onStatus("saved");
      fetch("/api/analytics/save-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location_id: opts.location_id,
          signal_type: opts.signal_type || "",
          channel: apiChannel(channel),
          card_what: opts.card_what || "",
          card_sowhat: opts.card_sowhat || "",
          affected_date: opts.affected_date || null,
          severity: opts.severity || "",
          title: titleEl ? titleEl.value : "",
          body: [bodyEl ? bodyEl.value : "", offerSuffix()].filter(Boolean).join("\n\n"),
          hashtags: hashEl ? hashEl.value : "",
          recipient: rEl ? rEl.value : "",
          original_ai_text: (function () { var d = _draftByIdx[idx] || draft; return d ? (d.full_text || d.body || "") : ""; })(),
          user_instruction: "",
          artifact_mode: opts.artifact_mode || "post",
        }),
      }).then(function () { delete _draftsByLoc[opts.location_id]; }).catch(function () {});
      fetch("/api/analytics/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: "draft_saved", location_id: opts.location_id, action_key: "draft", channel: apiChannel(channel), affected_date: opts.affected_date || null }) }).catch(function () {});
    });

    var regenBtn = mount.querySelector('[data-ws-regen="' + idx + '"]');
    if (regenBtn) regenBtn.addEventListener("click", function () { generate(mount, idx, channel, opts, null, null); });

    var adjustInput = mount.querySelector('[data-ws-adjust="' + idx + '"]');
    var adjustBtn = mount.querySelector('[data-ws-adjust-submit="' + idx + '"]');
    function submitAdjust() {
      if (!adjustInput || !adjustInput.value.trim()) return;
      var instruction = adjustInput.value.trim();
      adjustInput.value = "";
      generate(mount, idx, channel, opts, instruction, null);
    }
    if (adjustBtn) adjustBtn.addEventListener("click", submitAdjust);
    if (adjustInput) adjustInput.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); submitAdjust(); } });

    var recipInput = mount.querySelector('[data-ws-recipient="' + idx + '"]');
    var recipDd = mount.querySelector('[data-ws-recipient-dd="' + idx + '"]');
    if (recipInput && recipDd) {
      var recipLabel = document.createElement('div');
      recipLabel.setAttribute('data-ws-recipient-label', idx);
      recipLabel.style.cssText = 'font-size:12px;font-weight:500;color:#1D3BB3;margin-bottom:2px;display:none;cursor:pointer;';
      recipInput.parentNode.insertBefore(recipLabel, recipInput);
      if (recipInput.getAttribute('data-display-name')) {
        recipLabel.textContent = recipInput.getAttribute('data-display-name');
        recipLabel.style.display = 'block';
      }
      recipLabel.addEventListener('click', function () { recipLabel.style.display = 'none'; recipInput.value = ''; recipInput.focus(); });
      recipInput.addEventListener('focus', function () { recipDd.style.display = 'block'; });
      recipInput.addEventListener('input', function () { recipDd.style.display = 'block'; recipLabel.style.display = 'none'; });
      recipDd.querySelectorAll('[data-ws-pick-member]').forEach(function (opt) {
        opt.addEventListener('click', function () {
          var channelVal = opt.getAttribute('data-ws-pick-member');
          var nameSpan = opt.querySelector('span');
          var displayName = nameSpan ? nameSpan.textContent : '';
          recipInput.value = channelVal;
          recipLabel.textContent = displayName + ' · ' + channelVal;
          recipLabel.style.display = 'block';
          recipDd.style.display = 'none';
        });
        opt.addEventListener('mouseenter', function () { opt.style.background = opt.style.background === 'rgb(245, 247, 255)' ? '#EBF0FF' : '#f9fafb'; });
        opt.addEventListener('mouseleave', function () { opt.style.background = ''; });
      });
      document.addEventListener('click', function (ev) { if (!recipInput.contains(ev.target) && !recipDd.contains(ev.target) && !recipLabel.contains(ev.target)) recipDd.style.display = 'none'; });
    }

    var pubBtn = mount.querySelector('[data-ws-publish="' + idx + '"]');
    if (pubBtn && !pubBtn.disabled) pubBtn.addEventListener("click", function () {
      var rEl = mount.querySelector('[data-ws-recipient="' + idx + '"]');
      var dCh = displayChannel(channel);
      var isPub = (CHANNEL_DEFS[dCh] || CHANNEL_DEFS.gbp).cat === "pub";
      var idle = isPub ? "Publier →" : "Envoyer →";
      var doing = isPub ? "Publication…" : "Envoi…";
      var done = isPub ? "Publié ✓" : "Envoyé ✓";
      var errEl = mount.querySelector('[data-ws-pub-err="' + idx + '"]');
      if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
      if ((dCh === "email" || dCh === "whatsapp" || dCh === "sms") && !(rEl && rEl.value.trim())) {
        if (errEl) { errEl.textContent = "Choisissez un destinataire avant l'envoi."; errEl.style.display = "block"; }
        return;
      }
      pubBtn.textContent = doing; pubBtn.style.opacity = "0.6"; pubBtn.disabled = true;
      fetch("/api/channels/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: apiChannel(channel),
          location_id: opts.location_id,
          title: titleEl ? titleEl.value : "",
          body: [bodyEl ? bodyEl.value : "", offerSuffix()].filter(Boolean).join("\n\n"),
          hashtags: hashEl ? hashEl.value : "",
          recipient: rEl ? rEl.value : "",
          signal_type: opts.signal_type || "",
          affected_date: opts.affected_date || "",
        }),
      }).then(function (res) { return res.json(); }).then(function (json) {
        if (json && json.ok) {
          pubBtn.textContent = done;
          pubBtn.style.background = "#f0fdf4"; pubBtn.style.color = "#166534"; pubBtn.style.borderColor = "#bbf7d0"; pubBtn.style.opacity = "1";
          if (opts.onStatus) opts.onStatus("published");
          showRecipientSavePrompt(mount, idx, dCh, opts.location_id, rEl ? rEl.value.trim() : "");
        } else {
          pubBtn.textContent = "Erreur"; pubBtn.style.color = "#B91C1C"; pubBtn.style.opacity = "1"; pubBtn.disabled = false;
          if (errEl) { errEl.textContent = (json && json.error) ? String(json.error) : "Erreur inconnue — réessayez."; errEl.style.display = "block"; }
          setTimeout(function () { pubBtn.textContent = idle; pubBtn.style.color = "#1D3BB3"; pubBtn.style.borderColor = "#1D3BB3"; }, 2500);
        }
      }).catch(function () {
        pubBtn.textContent = idle; pubBtn.style.opacity = "1"; pubBtn.disabled = false;
        if (errEl) { errEl.textContent = "Erreur réseau — réessayez."; errEl.style.display = "block"; }
      });
    });

    var libBtn = mount.querySelector('[data-ws-library="' + idx + '"]');
    if (libBtn) libBtn.addEventListener("click", function () {
      openBrouillonLibrary({
        drafts: _draftsByLoc[opts.location_id] || [],
        activeSignalType: opts.signal_type,
        activeChannel: apiChannel(channel),
        showAdapt: true,
        onRaw: function (picked) {
          render(mount, idx, channel, { title: picked.title || null, body: picked.body || "", hashtags: picked.hashtags || null, full_text: picked.body || "" }, false, opts);
        },
        onAdapt: function (picked) { generate(mount, idx, channel, opts, null, picked.body); },
      });
    });

    var autoBtn = mount.querySelector('[data-ws-automate="' + idx + '"]');
    var autoPromptEl = mount.querySelector('[data-ws-auto-prompt="' + idx + '"]');
    if (autoBtn && autoPromptEl) autoBtn.addEventListener("click", function () {
      showAutoPrompt(autoPromptEl, mount, idx, channel, opts);
    });
  }

  function render(mount, idx, channel, draft, isStyled, opts) {
    // Tout re-render invalide la génération en vol : ses éléments n'existent plus.
    _genSeq[idx] = (_genSeq[idx] || 0) + 1;
    _draftByIdx[idx] = draft || null;
    mount.innerHTML = buildWorkspaceHtml(idx, channel, draft, isStyled, opts);
    wire(mount, idx, channel, draft, opts);
  }

  function generate(mount, idx, channel, opts, userInstruction, styleReference) {
    mount.style.display = "block";
    // Owner 19/07 : l'éditeur s'affiche IMMÉDIATEMENT — la génération remplit les champs
    // en place ensuite. Un panneau réduit à un spinner pendant les secondes de l'appel LLM
    // lisait comme un bug. Premier passage : rendre le shell (brouillon vide) ; Ajuster /
    // Réécrire / Adapter : l'éditeur existant reste en place, texte figé le temps du call.
    if (!mount.querySelector('[data-ws-body="' + idx + '"]')) {
      render(mount, idx, channel, _draftByIdx[idx] || null, false, opts);
    }
    if (_twByIdx[idx]) { _twByIdx[idx].finish(); _twByIdx[idx] = null; }
    setGenerating(mount, idx, true, userInstruction ? "Ajustement en cours…" : styleReference ? "Adaptation en cours…" : "Rédaction en cours…");
    var errEl0 = mount.querySelector('[data-ws-pub-err="' + idx + '"]');
    if (errEl0) { errEl0.style.display = "none"; errEl0.textContent = ""; }
    _genSeq[idx] = (_genSeq[idx] || 0) + 1;
    var token = _genSeq[idx];
    var payload = buildDraftPayload(opts, channel, userInstruction, styleReference);
    fetch("/api/insight/generate-action-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).then(function (res) { return res.json(); }).then(function (json) {
      // Réponse en retard (canal changé, panneau fermé, nouvelle génération) : ignorer.
      if (_genSeq[idx] !== token || !mount.querySelector('[data-ws-body="' + idx + '"]')) return;
      if (!json || !json.ok || !json.draft) throw new Error(json?.error || "Draft vide");
      _draftByIdx[idx] = json.draft;
      var bodyEl = mount.querySelector('[data-ws-body="' + idx + '"]');
      var titleEl = mount.querySelector('[data-ws-title="' + idx + '"]');
      var hashEl = mount.querySelector('[data-ws-hashtags="' + idx + '"]');
      // Titre/hashtags d'un coup ; le CORPS se révèle mot à mot (MSTypewrite, ms-loader).
      // Interruption portée par mount en phase capture : un clic sur Copier/Envoyer/le champ
      // complète le texte AVANT que le handler ne lise sa valeur — l'effet ne coûte jamais
      // de temps ni de texte. Repli : sans MSTypewrite (page au loader périmé), pose directe.
      if (titleEl) titleEl.value = json.draft.title || "";
      if (hashEl) hashEl.value = json.draft.hashtags || "";
      var banner = mount.querySelector('[data-ws-style-banner="' + idx + '"]');
      if (banner) banner.style.display = (!!json.is_styled || !!styleReference) ? "flex" : "none";
      setGenerating(mount, idx, false, null);
      if (bodyEl) {
        var fullBody = draftBodyText(channel, json.draft, opts);
        if (window.MSTypewrite) {
          _twByIdx[idx] = window.MSTypewrite(bodyEl, fullBody, {
            duration: 1000,
            container: mount,
            onTick: function (el2) { autoResizeTextarea(el2); updateCharCount(mount, idx, channel); },
          });
        } else {
          bodyEl.value = fullBody;
          autoResizeTextarea(bodyEl);
        }
      }
      updateCharCount(mount, idx, channel);
      if (opts.onStatus && !userInstruction && !styleReference) opts.onStatus("drafted");
    }).catch(function (err) {
      if (_genSeq[idx] !== token) return;
      setGenerating(mount, idx, false, null);
      // Erreur VISIBLE dans l'éditeur (règle owner) — le panneau reste ouvert, le user
      // peut écrire son message lui-même ou réessayer via Ajuster.
      var errEl = mount.querySelector('[data-ws-pub-err="' + idx + '"]');
      if (errEl) { errEl.textContent = "Rédaction impossible : " + (err && err.message ? err.message : "réessayez") + ". Vous pouvez écrire votre message ci-dessus."; errEl.style.display = "block"; }
    });
  }

  var _seq = 0;
  async function open(mount, opts) {
    opts = opts || {};
    var idx = "dw" + (++_seq);
    mount.style.display = "block";
    // Bref (fetch config/roster, sub-seconde) — l'éditeur complet arrive via generate().
    mount.innerHTML = spinnerHtml("Ouverture…");
    // Caches nécessaires au rendu (config → gating Publier/Envoyer + canal initial ;
    // roster → destinataires ; brouillons → « Mes brouillons »).
    await Promise.all([
      fetchChannelConfigs(opts.location_id),
      fetchTeamMembers(opts.location_id),
      fetchSavedDrafts(opts.location_id),
    ]).catch(function () {});
    // Owner 18/07 : le canal initial est TOUJOURS résolu sur la config réelle (plus de canal
    // imposé par l'appelant — c'est ce qui ouvrait des workspaces morts). "offer" vient de
    // Pulse (Proposer une offre) via artifact_mode ; tout le reste est Communiquer ("comm").
    var mode = opts.mode || (opts.artifact_mode === "offer" ? "offer" : "comm");
    var cfg = _cfgByLoc[opts.location_id] || {};
    var channel = pickChannel(mode, cfg);
    // Instrumentation (verify-by-behavior) : ce que CETTE page a réellement résolu.
    try {
      var _dbg = { location_id: opts.location_id || null, canaux_configures: Object.keys(cfg).sort(), mode: mode, canal_choisi: channel };
      window.__msDbg = window.__msDbg || {};
      window.__msDbg.draftWorkspace = _dbg;
      console.log("[MSDraftWorkspace] " + JSON.stringify(_dbg));
    } catch (e) {}
    if (!channel) {
      // Config par SITE : la carte peut appartenir à un établissement sans canal du bon type.
      var noChTitle = mode === "offer" ? "Aucun canal public configuré" : "Aucun canal d’envoi configuré";
      var noChBody = mode === "offer"
        ? "Une offre se publie sur un canal public (Google, Facebook, Instagram). Connectez-en un pour cet établissement."
        : "Le brief s’envoie à votre équipe par email, Slack, SMS ou WhatsApp. Configurez un canal d’envoi pour cet établissement.";
      mount.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#374151;line-height:1.6;"><div style="font-weight:600;margin-bottom:4px;">' + noChTitle + '</div>' + noChBody + '<div style="margin-top:10px;"><a href="/profile" style="display:inline-block;font-size:12px;font-weight:600;color:#1D3BB3;text-decoration:none;border:1px solid #1D3BB3;border-radius:6px;padding:6px 12px;">Configurer mes canaux →</a></div></div>';
      return idx;
    }
    generate(mount, idx, channel, opts, null, null);
    return idx;
  }

  window.MSDraftWorkspace = {
    open: open,
    openLibrary: openBrouillonLibrary,
    pickChannel: pickChannel,
    fetchChannelConfigs: fetchChannelConfigs,
    fetchTeamMembers: fetchTeamMembers,
    fetchSavedDrafts: fetchSavedDrafts,
    invalidateDrafts: function (locationId) { delete _draftsByLoc[locationId]; },
    invalidateTeam: function (locationId) { delete _teamByLoc[locationId]; },
    CHANNEL_DEFS: CHANNEL_DEFS,
  };
})();
