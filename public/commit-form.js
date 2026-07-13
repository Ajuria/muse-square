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

  // opts.prefill = { committed_action_text, window_kind ('day_of'|'7d'|'14d'), thr ('modeste'|'net') }
  function buildHtml(opts) {
    opts = opts || {};
    var pre = opts.prefill || {};
    var win = pre.window_kind || "7d";
    var thr = pre.thr || "modeste";
    var action = pre.committed_action_text != null ? String(pre.committed_action_text) : "";
    return '<div style="padding:12px 16px 14px;border-top:1px solid #F3F4F6;">'
      + '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:14px;">M\'engager sur une action</div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Indicateur</div>'
        + '<span style="' + chipStyle(true) + 'cursor:default;">CA vs attendu</span></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Fenêtre — quand je serai évalué</div>'
        + '<div style="display:flex;gap:6px;">' + chip("window", "day_of", "Jour même", win === "day_of") + chip("window", "7d", "7 jours", win === "7d") + chip("window", "14d", "14 jours", win === "14d") + "</div></div>"
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Objectif</div>'
        + '<div style="display:flex;gap:6px;">' + chip("thr", "modeste", "Modeste ↑", thr === "modeste") + chip("thr", "net", "Net ↑↑", thr === "net") + "</div>"
        + '<div style="font-size:10.5px;color:#9ca3af;margin-top:6px;">Le seuil s\'ajuste au bruit habituel de votre lieu — pas un % fixe.</div></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Responsable</div>'
        + '<input data-cm-owner placeholder="Une personne de l\'équipe" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;" />'
        + '<div data-cm-owner-sugg style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;"></div></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Mon action</div>'
        + '<textarea data-cm-action placeholder="Ce que vous allez faire" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:52px;box-sizing:border-box;">' + escapeHtml(action) + "</textarea></div>"
      + '<div style="display:flex;gap:8px;"><button type="button" data-cm-submit style="padding:7px 14px;border-radius:6px;background:#1D3BB3;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">M\'engager →</button>'
        + '<button type="button" data-cm-cancel style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Annuler</button></div>'
      + "</div>";
  }

  function renderOwnerPool(container, pool) {
    var sugg = container.querySelector("[data-cm-owner-sugg]");
    if (!sugg) return;
    if (!pool || !pool.length) { sugg.innerHTML = ""; return; }
    sugg.innerHTML = pool.map(function (m) {
      var nm = (String(m.first_name || "") + (m.last_name ? " " + m.last_name : "")).trim();
      return '<span data-cm-owner-pick="' + escapeHtml(nm) + '" style="font-size:12px;padding:4px 10px;background:#F3F4F6;color:#374151;border:1px solid #e5e7eb;border-radius:999px;cursor:pointer;">' + escapeHtml(nm) + (m.role ? " · " + escapeHtml(m.role) : "") + "</span>";
    }).join("");
    sugg.querySelectorAll("[data-cm-owner-pick]").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var inp = container.querySelector("[data-cm-owner]");
        if (inp) inp.value = opt.getAttribute("data-cm-owner-pick");
      });
    });
  }

  // opts = { location_id, prefill, origin, ownerPool?, fetchOwners?() , onDone?(json), onCancel?() }
  // origin = { origin_action_type, origin_suppression_key?, origin_card_instance_id?,
  //            origin_affected_date?, creation_residual_pct?, creation_residual_z?, creation_confidence_tier? }
  function wire(container, opts) {
    opts = opts || {};
    var pre = opts.prefill || {};
    var origin = opts.origin || {};
    var state = { window: pre.window_kind || "7d", thr: pre.thr || "modeste" };

    if (opts.ownerPool) renderOwnerPool(container, opts.ownerPool);
    else if (typeof opts.fetchOwners === "function") {
      try { opts.fetchOwners().then(function (pool) { renderOwnerPool(container, pool); }).catch(function () {}); } catch (e) {}
    }

    container.querySelectorAll("[data-cm-chip]").forEach(function (c) {
      c.addEventListener("click", function () {
        var group = c.getAttribute("data-cm-chip");
        state[group] = c.getAttribute("data-cm-val");
        container.querySelectorAll('[data-cm-chip="' + group + '"]').forEach(function (x) { x.setAttribute("style", chipStyle(x === c)); });
      });
    });

    var cancel = container.querySelector("[data-cm-cancel]");
    if (cancel) cancel.addEventListener("click", function () { if (typeof opts.onCancel === "function") opts.onCancel(); });

    var submit = container.querySelector("[data-cm-submit]");
    if (submit) submit.addEventListener("click", function () {
      var owner = ((container.querySelector("[data-cm-owner]") || {}).value || "").trim();
      var action = ((container.querySelector("[data-cm-action]") || {}).value || "").trim();
      if (!owner || !action) return;
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
          window_kind: state.window, threshold_level: state.thr,
          committed_action_text: action, owner_person_name: owner,
          creation_residual_pct: origin.creation_residual_pct != null ? Number(origin.creation_residual_pct) : null,
          creation_residual_z: origin.creation_residual_z != null ? Number(origin.creation_residual_z) : null,
          creation_confidence_tier: origin.creation_confidence_tier || null
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
