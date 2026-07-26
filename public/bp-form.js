// MSBpForm — « Enrichir vos bonnes pratiques » (validé 26/07, proto public/methode-proto.html).
// The POSITIVE branch of « M'engager » : on an opportunity card the menu entry opens THIS form
// instead of the objective form. Same visual grammar as MSCommitForm (commit-form.js) — labels,
// chips, suggestion rows, buttons — nothing new to learn.
//
// Honesty rules (owner 26/07) :
//   - NO field is required except the text to SAVE — never force a story.
//   - Two first-class exits that write NOTHING to the base : « Rien de spécial — c'était le
//     contexte » and « Je ne peux pas l'expliquer » (logged via /api/analytics/track only, so
//     we learn how often good days are unexplained).
//   - A saved practice is a DECLARED hypothesis ; it reads « prouvée » only when a replay
//     commitment resolves 'met' (computed server-side at read).
//
// wire(container, opts) :
//   opts.location_id  (required)
//   opts.origin       ({ origin_action_type, origin_driver, origin_card_instance_id,
//                        origin_affected_date, day_class_key }) — POST provenance
//   opts.anchorHtml   (card facts line, built by the caller from the card object)
//   opts.pistes       (string[] — hypothesis starters derived from the card, max 3)
//   opts.onSaved(j)   (after plain save)
//   opts.onChain(practice_id, text)  (after save via « Ajouter + m'engager à la rejouer »)
//   opts.onCancel()   (Annuler + the two exits)
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

  // The ONLY user-chosen taxonomy (validated chips) — everything else is derived server-side.
  var MEANS = [
    ["offre", "Offre"], ["staffing", "Staffing"], ["communication", "Communication"],
    ["prix", "Prix"], ["accueil", "Accueil / expérience"], ["autre", "Autre"]
  ];

  function buildHtml(opts) {
    opts = opts || {};
    var pistes = Array.isArray(opts.pistes) ? opts.pistes.filter(Boolean).slice(0, 3) : [];
    var pisteRows = pistes.map(function (p) {
      return '<div data-bp-sugg data-bp-sugg-text="' + escapeHtml(p) + '" style="font-size:12px;color:#374151;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:6px;padding:7px 10px;margin-bottom:5px;cursor:pointer;line-height:1.4;">' + escapeHtml(p) + "</div>";
    }).join("");
    return '<div style="padding:12px 16px 14px;border-top:1px solid #F3F4F6;">'
      + '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:14px;">Enrichir vos bonnes pratiques</div>'
      + (opts.anchorHtml ? '<div style="background:#F8FAFF;border:1px solid #E3E9FA;border-radius:6px;padding:8px 10px;font-size:11.5px;color:#374151;line-height:1.5;margin-bottom:12px;">' + opts.anchorHtml + "</div>" : "")
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Qu’avez-vous fait de différent ce jour-là ?</div>'
        + (pisteRows ? '<div style="margin-bottom:8px;"><div style="font-size:10.5px;color:#9ca3af;margin-bottom:6px;">Pistes tirées de la carte — cliquez pour utiliser, puis précisez :</div>' + pisteRows + "</div>" : "")
        + '<textarea data-bp-text placeholder="Décrivez précisément : quoi, à quel moment, par qui" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:52px;box-sizing:border-box;"></textarea></div>'
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Levier</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
        + MEANS.map(function (m) { return '<span data-bp-lever="' + m[0] + '" style="' + chipStyle(false) + '">' + m[1] + "</span>"; }).join("")
        + "</div></div>"
      + '<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:7px;">Qui l’a fait ?</div>'
        + '<input data-bp-author placeholder="Une personne de l’équipe" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12px;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;" />'
        + '<div data-bp-author-sugg style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;"></div></div>'
      + '<div style="background:#F5F7FF;border:1px solid #DBEAFE;border-radius:6px;padding:8px 10px;font-size:12px;color:#1D3BB3;font-weight:600;line-height:1.5;">Ajoutée comme « déclarée » — elle passera « prouvée » quand une réplication engagée sera mesurée positive sur sa fenêtre.</div>'
      + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">'
        + '<button type="button" data-bp-save style="padding:7px 14px;border-radius:6px;background:#1D3BB3;color:#fff;border:none;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Ajouter aux bonnes pratiques</button>'
        + '<button type="button" data-bp-chain style="padding:7px 14px;border-radius:6px;background:#F5F7FF;color:#1D3BB3;border:1px solid #DBEAFE;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Ajouter + m’engager à la rejouer →</button>'
        + '<button type="button" data-bp-cancel style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">Annuler</button>'
      + "</div>"
      + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #F3F4F6;">'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
          + '<button type="button" data-bp-exit="bp_context_exit" style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;">Rien de spécial — c’était le contexte</button>'
          + '<button type="button" data-bp-exit="bp_unexplained_exit" style="padding:7px 14px;border-radius:6px;background:#f9fafb;color:#374151;border:1px solid #e5e7eb;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;">Je ne peux pas l’expliquer</button>'
        + "</div>"
        + '<div style="font-size:10.5px;color:#9ca3af;margin-top:6px;line-height:1.5;">Deux réponses honnêtes, aussi valables l’une que l’autre : rien n’entre dans vos bonnes pratiques. Aucun champ n’est obligatoire.</div>'
      + "</div>"
    + "</div>";
  }

  function wire(container, opts) {
    opts = opts || {};
    var origin = opts.origin || {};
    var state = { lever: null };

    container.querySelectorAll("[data-bp-sugg]").forEach(function (sg) {
      sg.addEventListener("click", function () {
        var ta = container.querySelector("[data-bp-text]");
        if (ta) {
          var t = sg.getAttribute("data-bp-sugg-text");
          if (window.MSTypewrite) window.MSTypewrite(ta, t, { duration: 700, container: container });
          else ta.value = t;
          ta.focus();
        }
        container.querySelectorAll("[data-bp-sugg]").forEach(function (x) { x.style.borderColor = "#DBEAFE"; x.style.background = "#F5F7FF"; });
        sg.style.borderColor = "#1D3BB3"; sg.style.background = "#EEF2FF";
      });
    });

    container.querySelectorAll("[data-bp-lever]").forEach(function (c) {
      c.addEventListener("click", function () {
        state.lever = state.lever === c.getAttribute("data-bp-lever") ? null : c.getAttribute("data-bp-lever");
        container.querySelectorAll("[data-bp-lever]").forEach(function (x) {
          x.setAttribute("style", chipStyle(x.getAttribute("data-bp-lever") === state.lever));
        });
      });
    });

    // Roster « Qui l'a fait ? » — same source as MSCommitForm (/api/channels/team). Optional.
    if (opts.location_id) {
      fetch("/api/channels/team?location_id=" + encodeURIComponent(opts.location_id))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          // Same roster + shape as MSCommitForm (/api/channels/team → j.items, first/last/role).
          var pool = (j && j.ok && Array.isArray(j.items)) ? j.items : [];
          var sugg = container.querySelector("[data-bp-author-sugg]");
          if (!sugg || !pool.length) return;
          sugg.innerHTML = pool.map(function (m) {
            var nm = (String(m.first_name || "") + (m.last_name ? " " + m.last_name : "")).trim();
            return '<span data-bp-author-pick="' + escapeHtml(nm) + '" style="' + chipStyle(false) + '">' + escapeHtml(nm + (m.role ? " · " + m.role : "")) + "</span>";
          }).join("");
          sugg.querySelectorAll("[data-bp-author-pick]").forEach(function (optEl) {
            optEl.addEventListener("click", function () {
              var inp = container.querySelector("[data-bp-author]");
              if (inp) inp.value = optEl.getAttribute("data-bp-author-pick");
              sugg.querySelectorAll("[data-bp-author-pick]").forEach(function (x) { x.setAttribute("style", chipStyle(x === optEl)); });
            });
          });
        })
        .catch(function () {});
    }

    function post(thenChain) {
      var ta = container.querySelector("[data-bp-text]");
      var text = ((ta || {}).value || "").trim();
      if (!text) { if (ta) { ta.style.borderColor = "#B45309"; ta.focus(); } return; }
      var author = ((container.querySelector("[data-bp-author]") || {}).value || "").trim();
      var btnSave = container.querySelector("[data-bp-save]");
      var btnChain = container.querySelector("[data-bp-chain]");
      if (btnSave) btnSave.disabled = true;
      if (btnChain) btnChain.disabled = true;
      fetch("/api/best-practices", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location_id: opts.location_id,
          practice_text: text,
          means_lever: state.lever,
          author_person_name: author || null,
          origin: {
            origin_action_type: origin.origin_action_type || null,
            origin_driver: origin.origin_driver || null,
            origin_card_instance_id: origin.origin_card_instance_id || null,
            origin_affected_date: origin.origin_affected_date || null,
            day_class_key: origin.day_class_key || null
          }
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) {
          if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Réessayer"; }
          if (btnChain) btnChain.disabled = false;
          return;
        }
        if (thenChain && typeof opts.onChain === "function") opts.onChain(j.practice_id, text);
        else if (typeof opts.onSaved === "function") opts.onSaved(j);
      }).catch(function () {
        if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Réessayer"; }
        if (btnChain) btnChain.disabled = false;
      });
    }
    var save = container.querySelector("[data-bp-save]");
    if (save) save.addEventListener("click", function () { post(false); });
    var chain = container.querySelector("[data-bp-chain]");
    if (chain) chain.addEventListener("click", function () { post(true); });

    var cancel = container.querySelector("[data-bp-cancel]");
    if (cancel) cancel.addEventListener("click", function () { if (typeof opts.onCancel === "function") opts.onCancel(); });

    // First-class honest exits — write nothing, log the signal (how often days are unexplained
    // is itself knowledge), close the form.
    container.querySelectorAll("[data-bp-exit]").forEach(function (b) {
      b.addEventListener("click", function () {
        fetch("/api/analytics/track", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event: b.getAttribute("data-bp-exit"),
            location_id: opts.location_id || null,
            action_type: origin.origin_action_type || null,
            change_subtype: origin.origin_action_type || null,
            card_instance_id: origin.origin_card_instance_id || null,
            affected_date: origin.origin_affected_date || null
          })
        }).catch(function () {});
        if (typeof opts.onCancel === "function") opts.onCancel();
      });
    });
  }

  window.MSBpForm = { buildHtml: buildHtml, wire: wire, escapeHtml: escapeHtml };
})();
