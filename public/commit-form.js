// Shared "M'engager" commitment-creation form. Static /public asset (browser-cached
// by ?v=), loaded via <script is:inline src="/commit-form.js?v=N">. Exposes a global
// window.MSCommitForm so BOTH the pulse feed cards and the évolution page's advice CTAs
// render the SAME form and POST the same shape to /api/commitments.
//
// Container-scoped (no cardIdx) and prefill-driven — the évolution page seeds it from an
// advice item; the feed seeds it from a card. Markup/styles mirror the pulse inline form.
(function () {
  "use strict";
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function chipStyle(sel) {
    return sel
      ? "font-size:12px;padding:5px 11px;background:#F5F7FF;color:#1D3BB3;border:1px solid #DBEAFE;font-weight:600;cursor:pointer;border-radius:6px;"
      : "font-size:12px;padding:5px 11px;background:#F3F4F6;color:#6b7280;border:1px solid transparent;cursor:pointer;border-radius:6px;";
  }
  function chip(group, val, label, sel) {
    return '<span data-cm-chip="' + group + '" data-cm-val="' + val + '" style="' + chipStyle(sel) + '">' + label + "</span>";
  }

  // Up to 3 recommended actions as clickable rows (Pulse migration 16/07 — was pulse's own
  // cmSuggestionsHtml). Click fills « Mon action » (still editable). Opt-in via opts.suggestions.
  function suggestionsHtml(suggestions) {
    var acts = Array.isArray(suggestions) ? suggestions.filter(Boolean) : [];
    if (!acts.length) return "";
    var rows = acts.map(function (a) {
      return '<div data-cm-sugg data-cm-sugg-text="' + escapeHtml(a) + '" style="font-size:12px;color:#374151;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:6px;padding:7px 10px;margin-bottom:5px;cursor:pointer;line-height:1.4;">' + escapeHtml(a) + "</div>";
    }).join("");
    return '<div style="margin-bottom:8px;"><div style="font-size:10.5px;color:#9ca3af;margin-bottom:6px;">Suggestions — cliquez pour utiliser, puis ajustez :</div>' + rows + "</div>";
  }

  // opts.prefill = { committed_action_text, window_kind ('day_of'|'7d'|'14d'|'30d'), thr ('modeste'|'net') }
  // opts.suggestions = string[] (optional reco rows above the textarea)
  // Objectif libre (18/07, proto validé) : l'utilisateur fixe SON chiffre (% 1–100 ⇄ €, curseur),
  // traduit dans le CA habituel + bruit réels du lieu (GET /api/commitments?goal_context=1) ;
  // les presets Modeste/Net restent des raccourcis étiquetés avec leur valeur réelle.
  var _inputStyle = "border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px;font-weight:600;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;text-align:right;";
  function buildHtml(opts) {
    opts = opts || {};
    var pre = opts.prefill || {};
    var win = pre.window_kind || "7d";
    var action = pre.committed_action_text != null ? String(pre.committed_action_text) : "";
    return '<div style="padding:12px 16px 14px;border-top:1px solid #F3F4F6;">'
      + '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:14px;">M\'engager sur une action</div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Indicateur</div>'
        + '<span style="' + chipStyle(true) + 'cursor:default;">CA vs attendu</span></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Fenêtre — quand je serai évalué</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + chip("window", "day_of", "Jour même", win === "day_of") + chip("window", "7d", "7 jours", win === "7d") + chip("window", "14d", "14 jours", win === "14d") + chip("window", "30d", "30 jours", win === "30d") + "</div></div>"
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Objectif</div>'
        + '<div data-cm-goal-anchor style="background:#F8FAFF;border:1px solid #E3E9FA;border-radius:6px;padding:8px 10px;font-size:11.5px;color:#374151;line-height:1.5;margin-bottom:9px;">Calcul de votre CA habituel…</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
          + '<span style="display:inline-flex;align-items:center;gap:5px;"><input data-cm-goal-pct type="number" min="1" max="100" step="1" style="width:64px;' + _inputStyle + '" /><span style="font-size:12px;color:#6b7280;">%</span></span>'
          + '<span data-cm-goal-eur-wrap style="display:none;align-items:center;gap:5px;"><span style="font-size:12px;color:#9CA3AF;">&#8644;</span><input data-cm-goal-eur type="number" min="0" step="10" style="width:88px;' + _inputStyle + '" /><span data-cm-goal-eur-lab style="font-size:12px;color:#6b7280;">€</span></span>'
          + '<span data-cm-goal-perday style="font-size:11px;color:#9CA3AF;"></span>'
        + '</div>'
        + '<input data-cm-goal-slider type="range" min="1" max="100" step="1" style="width:100%;accent-color:#1D3BB3;margin-top:9px;display:block;" />'
        + '<div data-cm-goal-floor style="display:none;justify-content:space-between;font-size:10.5px;color:#9ca3af;margin-top:2px;"><span style="color:#B45309;" data-cm-goal-floor-lab></span><span>+100 %</span></div>'
        + '<div data-cm-goal-subnoise style="display:none;gap:7px;background:#FEF9EC;border:1px solid #F3E3BB;border-radius:6px;padding:8px 10px;font-size:11px;color:#6B5518;line-height:1.5;margin-top:8px;"><span>&#9888;</span><span>Sous le bruit habituel de votre lieu : un écart de cette taille risque un verdict « Non concluant ». Vous pouvez confirmer quand même.</span></div>'
        + '<div data-cm-goal-presets style="display:none;gap:6px;margin-top:9px;align-items:center;flex-wrap:wrap;"></div>'
        + '<div data-cm-goal-recap style="background:#F5F7FF;border:1px solid #DBEAFE;border-radius:6px;padding:8px 10px;font-size:12px;color:#1D3BB3;font-weight:600;line-height:1.5;margin-top:10px;"></div>'
      + '</div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Responsable</div>'
        + '<input data-cm-owner placeholder="Une personne de l\'équipe" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;" />'
        + '<div data-cm-owner-sugg style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;"></div></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Mon action</div>'
        + suggestionsHtml(opts.suggestions)
        + '<textarea data-cm-action placeholder="' + (Array.isArray(opts.suggestions) && opts.suggestions.length ? "Choisissez une suggestion ci-dessus ou décrivez votre action" : "Ce que vous allez faire") + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:52px;box-sizing:border-box;">' + escapeHtml(action) + "</textarea></div>"
      + '<div style="display:flex;gap:8px;"><button type="button" data-cm-submit style="padding:7px 14px;border-radius:6px;background:#1D3BB3;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">M\'engager →</button>'
        + '<button type="button" data-cm-cancel style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Annuler</button></div>'
      + "</div>";
  }

  // Responsable streamlining (16/07): the pool comes from the ONE team roster
  // (/api/channels/team -> analytics.team_members, the profile's team). Self-fetched here when the
  // caller passes only location_id — so every MSCommitForm surface (chat, insight, évolution) gets
  // the same chips without wiring anything. Last-used responsable is remembered per location
  // (localStorage) and PREFILLED when it still belongs to the roster; a lone-member roster prefills
  // that member. Chip click + successful submit both update the memory.
  var _teamCache = {};
  function fetchTeamDefault(locationId) {
    if (!locationId) return Promise.resolve([]);
    if (_teamCache[locationId]) return Promise.resolve(_teamCache[locationId]);
    return fetch("/api/channels/team?location_id=" + encodeURIComponent(locationId))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var items = (j && j.ok && Array.isArray(j.items)) ? j.items : [];
        _teamCache[locationId] = items;
        return items;
      })
      .catch(function () { return []; });
  }
  function lastOwnerKey(locationId) { return "ms_last_owner_" + String(locationId || ""); }
  function rememberOwner(locationId, name) {
    try { if (name) localStorage.setItem(lastOwnerKey(locationId), name); } catch (e) {}
  }
  function recallOwner(locationId) {
    try { return localStorage.getItem(lastOwnerKey(locationId)) || ""; } catch (e) { return ""; }
  }

  function renderOwnerPool(container, pool, locationId) {
    var sugg = container.querySelector("[data-cm-owner-sugg]");
    if (!sugg) return;
    if (!pool || !pool.length) { sugg.innerHTML = ""; return; }
    var names = pool.map(function (m) {
      return (String(m.first_name || "") + (m.last_name ? " " + m.last_name : "")).trim();
    });
    sugg.innerHTML = pool.map(function (m, i) {
      var nm = names[i];
      return '<span data-cm-owner-pick="' + escapeHtml(nm) + '" style="font-size:12px;padding:4px 10px;background:#F3F4F6;color:#374151;border:1px solid #e5e7eb;border-radius:999px;cursor:pointer;">' + escapeHtml(nm) + (m.role ? " · " + escapeHtml(m.role) : "") + "</span>";
    }).join("");
    sugg.querySelectorAll("[data-cm-owner-pick]").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var inp = container.querySelector("[data-cm-owner]");
        if (inp) inp.value = opt.getAttribute("data-cm-owner-pick");
        rememberOwner(locationId, opt.getAttribute("data-cm-owner-pick"));
      });
    });
    // Prefill: last-used responsable if still on the roster; a single-member roster prefills itself.
    var inp = container.querySelector("[data-cm-owner]");
    if (inp && !inp.value.trim()) {
      var last = recallOwner(locationId);
      if (last && names.indexOf(last) >= 0) inp.value = last;
      else if (names.length === 1) inp.value = names[0];
    }
  }

  // opts = { location_id, prefill, origin, ownerPool?, fetchOwners?() , onDone?(json), onCancel?() }
  // origin = { origin_action_type, origin_suppression_key?, origin_card_instance_id?,
  //            origin_affected_date?, creation_residual_pct?, creation_residual_z?, creation_confidence_tier? }
  function wire(container, opts) {
    opts = opts || {};
    var pre = opts.prefill || {};
    var origin = opts.origin || {};
    var state = { window: pre.window_kind || "7d", goalPct: null };

    // ── Objectif libre : traduction % ⇄ € dans le vrai bruit du lieu ──
    var WIN_DAYS = { day_of: 1, "7d": 7, "14d": 14, "30d": 30 };
    var WIN_EUR_LAB = { day_of: "€ le jour même", "7d": "€ sur 7 jours", "14d": "€ sur 14 jours", "30d": "€ sur 30 jours" };
    var goalCtx = null;                               // contexte de la fenêtre courante (ou null)
    var pendingPreset = pre.thr === "net" ? "net" : (pre.thr === "modeste" ? "modeste" : null);
    function frInt(n) { return Math.round(n).toLocaleString("fr-FR"); }
    function gEl(sel) { return container.querySelector(sel); }
    function verdictDateFr() {
      var d = new Date();
      d.setDate(d.getDate() + (WIN_DAYS[state.window] || 7) - 1);
      return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
    }
    function applyGoal(p, from) {
      p = Math.max(1, Math.min(100, Math.round(Number(p) || 0)));
      state.goalPct = p;
      if (from !== "init") state.goalTouched = true;   // une valeur non touchée peut être remplacée par le preset réel à l'arrivée du contexte
      var days = WIN_DAYS[state.window] || 7;
      var base = goalCtx && goalCtx.baseline_window ? Number(goalCtx.baseline_window) : null;
      var pctInp = gEl("[data-cm-goal-pct]"), eurInp = gEl("[data-cm-goal-eur]"), slider = gEl("[data-cm-goal-slider]");
      if (pctInp && from !== "pct") pctInp.value = p;
      if (slider) slider.value = p;
      var eur = base != null ? Math.round(base * p / 100 / 10) * 10 : null;
      if (eurInp && from !== "eur" && eur != null) eurInp.value = eur;
      var perday = gEl("[data-cm-goal-perday]");
      if (perday) perday.textContent = (eur != null && days > 1) ? "soit ≈ +" + frInt(eur / days) + " €/jour" : "";
      var sub = gEl("[data-cm-goal-subnoise]");
      if (sub) sub.style.display = (goalCtx && goalCtx.floor_pct != null && p < Number(goalCtx.floor_pct)) ? "flex" : "none";
      var recap = gEl("[data-cm-goal-recap]");
      if (recap) recap.textContent = eur != null
        ? "Objectif : +" + p + " %, soit +" + frInt(eur) + " € sur " + (days === 1 ? "la journée" : days + " jours") + " — verdict le " + verdictDateFr() + "."
        : "Objectif : +" + p + " % vs votre CA habituel — verdict le " + verdictDateFr() + ".";
      var submitBtn = gEl("[data-cm-submit]");
      if (submitBtn && !submitBtn.disabled) submitBtn.textContent = "M'engager sur +" + p + " % →";
    }
    function fillGoalUi() {
      var days = WIN_DAYS[state.window] || 7;
      var anchor = gEl("[data-cm-goal-anchor]"), eurWrap = gEl("[data-cm-goal-eur-wrap]"),
          eurLab = gEl("[data-cm-goal-eur-lab]"), floor = gEl("[data-cm-goal-floor]"),
          floorLab = gEl("[data-cm-goal-floor-lab]"), presets = gEl("[data-cm-goal-presets]");
      if (goalCtx && goalCtx.baseline_window) {
        if (anchor) anchor.innerHTML = "Votre CA habituel sur cette fenêtre : <b>" + frInt(goalCtx.baseline_window) + " €</b>"
          + (days > 1 ? ' <span style="color:#9CA3AF;">(≈ ' + frInt(goalCtx.baseline_daily) + " €/jour — calculé sur vos ventes réelles)</span>" : ' <span style="color:#9CA3AF;">(calculé sur vos ventes réelles)</span>');
        if (eurWrap) eurWrap.style.display = "inline-flex";
        if (eurLab) eurLab.textContent = WIN_EUR_LAB[state.window] || "€";
        if (floor && goalCtx.floor_pct != null) {
          floor.style.display = "flex";
          if (floorLab) floorLab.textContent = "◂ sous +" + goalCtx.floor_pct + " % : dans le bruit de votre lieu";
        } else if (floor) floor.style.display = "none";
        if (presets) {
          var pm = goalCtx.preset_modeste_pct, pn = goalCtx.preset_net_pct;
          if (pm != null && pn != null) {
            var em = Math.round(goalCtx.baseline_window * pm / 100 / 10) * 10;
            var en = Math.round(goalCtx.baseline_window * pn / 100 / 10) * 10;
            presets.style.display = "flex";
            presets.innerHTML = '<span style="font-size:10.5px;color:#9ca3af;">Raccourcis :</span>'
              + '<span data-cm-goal-preset="' + pm + '" style="' + chipStyle(false) + '">Modeste — +' + pm + " % (+" + frInt(em) + " €)</span>"
              + '<span data-cm-goal-preset="' + pn + '" style="' + chipStyle(false) + '">Net — +' + pn + " % (+" + frInt(en) + " €)</span>";
            presets.querySelectorAll("[data-cm-goal-preset]").forEach(function (b) {
              b.addEventListener("click", function () { applyGoal(Number(b.getAttribute("data-cm-goal-preset")), "preset"); });
            });
          } else presets.style.display = "none";
        }
      } else {
        // Pas d'historique de ventes : % seul, honnête — pas de traduction € inventée.
        if (anchor) anchor.textContent = "Pas encore d'historique de ventes : fixez votre % — la traduction en € apparaîtra après vos premiers imports.";
        if (eurWrap) eurWrap.style.display = "none";
        if (floor) floor.style.display = "none";
        if (presets) presets.style.display = "none";
      }
      // Point de départ : preset hérité (prefill legacy), sinon Modeste réel, sinon 5 %.
      // Le contexte arrive APRÈS le premier rendu : tant que l'utilisateur n'a pas touché la
      // valeur, le preset réel remplace le défaut provisoire (course fetch/render).
      var start = state.goalPct;
      if (start == null || (!state.goalTouched && goalCtx)) {
        if (pendingPreset === "net" && goalCtx && goalCtx.preset_net_pct != null) start = goalCtx.preset_net_pct;
        else if (goalCtx && goalCtx.preset_modeste_pct != null) start = goalCtx.preset_modeste_pct;
        else if (start == null) start = 5;
        if (goalCtx) pendingPreset = null;
      }
      applyGoal(start, "init");
    }
    function refreshGoalCtx() {
      goalCtx = null;
      fillGoalUi();
      if (!opts.location_id) return;
      fetch("/api/commitments?goal_context=1&location_id=" + encodeURIComponent(opts.location_id) + "&window_kind=" + encodeURIComponent(state.window))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.ok && j.window_kind === state.window) {
            goalCtx = j;
            // Fallback : la carte porte déjà un habituel/jour — on ne perd pas la traduction €.
            if (!goalCtx.baseline_window && origin.creation_baseline_daily != null) {
              goalCtx.baseline_daily = Math.round(Number(origin.creation_baseline_daily));
              goalCtx.baseline_window = Math.round(Number(origin.creation_baseline_daily) * (WIN_DAYS[state.window] || 7));
            }
            fillGoalUi();
          }
        })
        .catch(function () {});
    }
    var _pctInp = gEl("[data-cm-goal-pct]"), _eurInp = gEl("[data-cm-goal-eur]"), _slider = gEl("[data-cm-goal-slider]");
    if (_pctInp) _pctInp.addEventListener("input", function () { applyGoal(_pctInp.value, "pct"); });
    if (_slider) _slider.addEventListener("input", function () { applyGoal(_slider.value, "slider"); });
    if (_eurInp) _eurInp.addEventListener("input", function () {
      var base = goalCtx && goalCtx.baseline_window ? Number(goalCtx.baseline_window) : null;
      if (base) applyGoal((Number(_eurInp.value) || 0) / base * 100, "eur");
    });
    refreshGoalCtx();

    if (opts.ownerPool) renderOwnerPool(container, opts.ownerPool, opts.location_id);
    else if (typeof opts.fetchOwners === "function") {
      try { opts.fetchOwners().then(function (pool) { renderOwnerPool(container, pool, opts.location_id); }).catch(function () {}); } catch (e) {}
    } else {
      // Default: the team roster (profile) — no caller wiring needed beyond location_id.
      fetchTeamDefault(opts.location_id).then(function (pool) { renderOwnerPool(container, pool, opts.location_id); }).catch(function () {});
    }

    container.querySelectorAll("[data-cm-chip]").forEach(function (c) {
      c.addEventListener("click", function () {
        var group = c.getAttribute("data-cm-chip");
        state[group] = c.getAttribute("data-cm-val");
        container.querySelectorAll('[data-cm-chip="' + group + '"]').forEach(function (x) { x.setAttribute("style", chipStyle(x === c)); });
        // La fenêtre change la traduction €/% ET le plancher de bruit → re-fetch du contexte.
        if (group === "window") refreshGoalCtx();
      });
    });

    // Suggestion rows: click -> fill « Mon action » (still editable) + highlight the picked one.
    container.querySelectorAll("[data-cm-sugg]").forEach(function (sg) {
      sg.addEventListener("click", function () {
        var ta = container.querySelector("[data-cm-action]");
        if (ta) { ta.value = sg.getAttribute("data-cm-sugg-text"); ta.focus(); }
        container.querySelectorAll("[data-cm-sugg]").forEach(function (x) { x.style.borderColor = "#DBEAFE"; x.style.background = "#F5F7FF"; });
        sg.style.borderColor = "#1D3BB3"; sg.style.background = "#EEF2FF";
      });
    });

    var cancel = container.querySelector("[data-cm-cancel]");
    if (cancel) cancel.addEventListener("click", function () { if (typeof opts.onCancel === "function") opts.onCancel(); });

    var submit = container.querySelector("[data-cm-submit]");
    if (submit) submit.addEventListener("click", function () {
      var owner = ((container.querySelector("[data-cm-owner]") || {}).value || "").trim();
      var action = ((container.querySelector("[data-cm-action]") || {}).value || "").trim();
      var goalPct = Number(state.goalPct);
      if (!owner || !action || !Number.isFinite(goalPct) || goalPct < 1 || goalPct > 100) return;
      rememberOwner(opts.location_id, owner);   // a typed name counts too — it prefills next time
      submit.disabled = true; submit.textContent = "Envoi…";
      fetch("/api/commitments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location_id: opts.location_id,
          origin_action_type: origin.origin_action_type || null,
          origin_driver: origin.origin_driver || null,
          origin_suppression_key: origin.origin_suppression_key || null,
          origin_card_instance_id: origin.origin_card_instance_id || null,
          origin_affected_date: origin.origin_affected_date || null,
          // Objectif libre : base 'pct' — le verdict comparera le % réalisé à CE chiffre.
          window_kind: state.window, threshold_basis: "pct", threshold_pct: goalPct,
          committed_action_text: action, owner_person_name: owner,
          creation_residual_pct: origin.creation_residual_pct != null ? Number(origin.creation_residual_pct) : null,
          creation_residual_z: origin.creation_residual_z != null ? Number(origin.creation_residual_z) : null,
          creation_confidence_tier: origin.creation_confidence_tier || null,
          // the card's own past-performance baseline (daily) -> the measurable goal reference
          // (window_expected_revenue server-side). Pulse migration 16/07 — was pulse-only.
          creation_baseline_daily: origin.creation_baseline_daily != null ? Number(origin.creation_baseline_daily) : null
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (typeof opts.onDone === "function") opts.onDone(j);
      }).catch(function () {
        if (typeof opts.onDone === "function") opts.onDone({ ok: false, error: "réseau" });
      });
    });
  }

  window.MSCommitForm = { buildHtml: buildHtml, wire: wire, escapeHtml: escapeHtml };
})();
