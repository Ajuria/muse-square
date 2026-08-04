// MSEventForm — le formulaire de création d'événement-dispositif (spec docs/evenement-dossier-spec.md § 4,
// protos v2.1/v3 validés). Module PARTAGÉ, hébergé par /app/insightevent/evenement (mode création) —
// days.astro (legacy) n'est pas touché ; la bascule du bouton « Enregistrer ces jours » viendra au
// commit de bascule final.
// Contexte serveur : GET /api/insight/evenement?create_context=1 (types par métier, attendu par jour
// de semaine = le modèle résiduel, familles produits) + /api/channels/team (roster).
// À la création d'un RÉCURRENT : occurrences générées côté serveur, puis l'engagement de mesure de la
// 1re occurrence est chaîné (POST /api/commitments {saved_item_id, window_start_date, origin event_<type>}).
// INTERIM documenté (incrément 4 à venir) : le verdict automatique de l'engagement porte sur le CA vs
// attendu ; la cible du KPI dominant est stockée sur l'événement (kpi/kpi_family/kpi_target_*) et le
// dossier la juge dès l'incrément 4 — le formulaire l'écrit déjà.
(function () {
  "use strict";
  if (window.MSEventForm) return;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function frInt(n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString("fr-FR"); }
  var DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

  function fetchJson(url) { return fetch(url).then(function (r) { return r.json(); }).catch(function () { return null; }); }

  function open(mount, opts) {
    var loc = String(opts.location_id || "");
    if (!mount || !loc) return;
    mount.innerHTML = '<div style="padding:20px;color:#9CA3AF;font-size:13px;">Chargement du formulaire…</div>';
    Promise.all([
      fetchJson("/api/insight/evenement?location_id=" + encodeURIComponent(loc) + "&create_context=1"),
      fetchJson("/api/channels/team?location_id=" + encodeURIComponent(loc)),
    ]).then(function (rs) {
      var ctx = rs[0];
      if (!ctx || !ctx.ok) { mount.innerHTML = '<div style="padding:20px;color:#B91C1C;font-size:13px;">Erreur de chargement — rechargez la page.</div>'; return; }
      var team = (rs[1] && rs[1].ok && Array.isArray(rs[1].items)) ? rs[1].items : [];
      render(mount, loc, ctx, team, opts);
    });
  }

  function render(mount, loc, ctx, team, opts) {
    var types = Array.isArray(ctx.event_types) ? ctx.event_types : [];
    var fams = Array.isArray(ctx.families) ? ctx.families : [];
    var baseline = Array.isArray(ctx.dow_baseline) ? ctx.dow_baseline : [];
    var owners = team.map(function (m) { return (String(m.first_name || "") + (m.last_name ? " " + m.last_name : "")).trim() + (m.role ? " · " + m.role : ""); }).filter(Boolean);

    var lbl = 'display:block;font-size:10.5px;font-weight:600;color:#6B7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;';
    var inp = 'width:100%;box-sizing:border-box;font-size:12.5px;color:#111827;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 10px;font-family:inherit;';
    var segB = 'font-size:12px;font-family:inherit;border:none;padding:6px 12px;cursor:pointer;background:#fff;color:#1D3BB3;';

    var html = ''
      + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Nom de l’événement</label><input data-ef="title" style="' + inp + '" maxlength="120"></div>'
      + '<div style="flex:1;"><label style="' + lbl + '">Type — selon votre métier</label><select data-ef="type" style="' + inp + 'cursor:pointer;">'
      + types.map(function (t) { return '<option value="' + esc(t.value) + '">' + esc(t.label_fr) + '</option>'; }).join("") + '</select></div></div>'
      + '<div style="display:flex;gap:12px;align-items:flex-end;margin-top:10px;"><div><label style="' + lbl + '">Nature — conditionne les menaces</label>'
      + '<span data-ef-natseg style="display:inline-flex;border:1px solid #1D3BB3;border-radius:8px;overflow:hidden;">'
      + '<button type="button" data-ef-nat="outdoor" style="' + segB + 'background:#1D3BB3;color:#fff;">Extérieur</button>'
      + '<button type="button" data-ef-nat="indoor" style="' + segB + '">Intérieur</button>'
      + '<button type="button" data-ef-nat="both" style="' + segB + '">Les deux</button></span></div>'
      + '<div style="font-size:12.5px;color:#374151;padding-bottom:7px;">de <input data-ef="h1" value="10" style="' + inp + 'width:52px;display:inline-block;text-align:center;padding:6px;"> h à <input data-ef="h2" value="13" style="' + inp + 'width:52px;display:inline-block;text-align:center;padding:6px;"> h</div></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Le dispositif — ce que vous allez faire (comparé au mesuré, versé à vos bonnes pratiques)</label><textarea data-ef="dispositif" rows="2" style="' + inp + 'resize:vertical;"></textarea></div>'
      + '<div style="display:flex;gap:12px;margin-top:10px;"><div style="flex:1;"><label style="' + lbl + '">Créateur / responsable</label>'
      + (owners.length
        ? '<select data-ef="owner" style="' + inp + 'cursor:pointer;">' + owners.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join("") + '</select>'
        : '<input data-ef="owner" placeholder="Prénom Nom" style="' + inp + '">')
      + '</div><div style="flex:1;"><label style="' + lbl + '">Objectif — le KPI que le verdict jugera</label><select data-ef="kpi" style="' + inp + 'cursor:pointer;">'
      + '<option value="revenue_residual">CA vs attendu du jour — mesuré, verdict fort</option>'
      + (fams.length ? '<option value="family_revenue">CA d’une famille produit vs sa moyenne — mesuré</option>' : '')
      + '<option value="tickets">Tickets vs habituel (base 30 j) — verdict plus faible</option>'
      + '<option value="basket">Panier moyen vs habituel (base 30 j) — verdict plus faible</option>'
      + '<option value="profit_estimated" disabled>Profit estimé — indisponible : marge non déclarée</option>'
      + '</select></div></div>'
      + '<div data-ef-famwrap style="display:none;margin-top:10px;"><label style="' + lbl + '">Famille produit</label><select data-ef="family" style="' + inp + 'cursor:pointer;">'
      + fams.map(function (f) { return '<option value="' + esc(f.category) + '" data-avg="' + Number(f.avg_day_eur) + '">' + esc(f.category) + ' — ' + frInt(f.avg_day_eur) + ' €/j en moyenne</option>'; }).join("") + '</select></div>'
      + '<div style="border:1px solid rgba(29,59,179,0.25);border-radius:8px;padding:10px 12px;background:#FAFBFF;margin-top:10px;">'
      + '<div style="' + lbl + '">Cible — l’objectif porte sur l’ÉVÉNEMENT ; le total du jour en est la conséquence</div>'
      + '<div style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:#111827;flex-wrap:wrap;">'
      + '<span data-ef-tglabel>Cible :</span><input data-ef="target" value="15" style="' + inp + 'width:80px;display:inline-block;text-align:right;padding:6px;"><span data-ef-tgunit>%</span></div>'
      + '<div data-ef-cible style="font-size:12.5px;color:#374151;margin-top:6px;line-height:1.5;"></div></div>'
      + '<div style="margin-top:12px;"><label style="' + lbl + '">Répéter</label>'
      + '<span data-ef-repseg style="display:inline-flex;border:1px solid #1D3BB3;border-radius:8px;overflow:hidden;">'
      + '<button type="button" data-ef-rep="none" style="' + segB + 'background:#1D3BB3;color:#fff;">Aucune</button>'
      + '<button type="button" data-ef-rep="weekly" style="' + segB + '">Toutes les semaines</button>'
      + '<button type="button" data-ef-rep="monthly" style="' + segB + '">Tous les mois</button></span></div>'
      + '<div data-ef-recblock style="display:none;margin-top:10px;">'
      + '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;">'
      + '<div data-ef-dowwrap><label style="' + lbl + '">Jour</label><select data-ef="dow" style="' + inp + 'cursor:pointer;width:150px;">'
      + [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<option value="' + d + '"' + (d === 6 ? ' selected' : '') + '>' + DOW_FR[d] + '</option>'; }).join("") + '</select></div>'
      + '<div><label style="' + lbl + '">Du</label><input data-ef="rstart" type="date" style="' + inp + 'width:150px;"></div>'
      + '<div><label style="' + lbl + '">Au</label><input data-ef="rend" type="date" style="' + inp + 'width:150px;"></div></div>'
      + '<div data-ef-dowref style="font-size:11.5px;color:#6B7280;margin-top:6px;"></div></div>'
      + '<div data-ef-oneblock style="margin-top:10px;">'
      + '<label style="' + lbl + '">Options de dates — comparées, puis choisies (jusqu’à 7 ; pré-remplies depuis le calendrier)</label>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      // Pré-remplissage depuis la planification (?dates=Y-m-d,...) — la pièce qui rendra la
      // bascule du bouton « Enregistrer ces jours » triviale. Minimum 3 champs, maximum 7.
      + (function () {
          var pre = Array.isArray(opts.dates) ? opts.dates.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).slice(0, 7) : [];
          var n = Math.max(3, pre.length);
          var out = "";
          for (var i = 0; i < n; i++) out += '<input data-ef-date type="date" value="' + esc(pre[i] || "") + '" style="' + inp + 'width:150px;">';
          return out;
        })()
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#374151;cursor:pointer;margin-top:8px;"><input data-ef="ddlcheck" type="checkbox" style="width:auto;"> Fixer une date limite de choix</label>'
      + '<div data-ef-ddlwrap style="display:none;margin-top:6px;max-width:170px;"><label style="' + lbl + '">Date limite</label><input data-ef="ddl" type="date" style="' + inp + '"></div></div>'
      + '<div data-ef-err style="display:none;color:#B91C1C;font-size:12px;margin-top:10px;"></div>'
      + '<div style="display:flex;margin-top:12px;"><span style="margin-left:auto;"><button type="button" data-ef-submit style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500;color:#fff;background:#1D3BB3;border:1px solid #1D3BB3;border-radius:10px;padding:7px 14px;cursor:pointer;font-family:inherit;">Créer l’événement — l’engagement de mesure se crée avec</button></span></div>';

    mount.innerHTML = html;
    var q = function (sel) { return mount.querySelector(sel); };
    var val = function (name) { var el = q('[data-ef="' + name + '"]'); return el ? String(el.value || "").trim() : ""; };
    var state = { nature: "outdoor", recurrence: "none" };

    function baselineFor(dow) {
      for (var i = 0; i < baseline.length; i++) if (baseline[i].dow === dow) return baseline[i];
      return null;
    }
    function candidateDates() {
      var out = [];
      mount.querySelectorAll("[data-ef-date]").forEach(function (el) { var v = String(el.value || "").trim(); if (v) out.push(v); });
      return out.slice(0, 7);
    }
    function refDow() {
      if (state.recurrence !== "none") return Number(val("dow"));
      var d1 = candidateDates()[0];
      if (d1) { var d = new Date(d1 + "T00:00:00Z"); if (!isNaN(d.getTime())) return d.getUTCDay(); }
      return 6;
    }
    function famAvg() {
      var el = q('[data-ef="family"]'); if (!el || !el.selectedOptions || !el.selectedOptions[0]) return null;
      return Number(el.selectedOptions[0].getAttribute("data-avg") || 0);
    }
    function refreshCible() {
      var kpi = val("kpi");
      var famWrap = q("[data-ef-famwrap]"); if (famWrap) famWrap.style.display = kpi === "family_revenue" ? "block" : "none";
      var unit = q("[data-ef-tgunit]"); var tlab = q("[data-ef-tglabel]");
      var dw = refDow(); var b = baselineFor(dw); var exp = b ? b.expected_eur : null;
      var t = Number(val("target"));
      var out = "";
      var dayLabel = DOW_FR[dw] || "jour";
      if (kpi === "family_revenue") {
        if (unit) unit.textContent = "€ (cible de la famille sur la journée)";
        if (tlab) tlab.textContent = "Vous visez :";
        var avg = famAvg();
        if (avg != null && isFinite(t) && t > 0) {
          var apport = Math.round(t - avg);
          out = "<strong>L’événement</strong> : famille " + esc(val("family")) + " — " + frInt(avg) + " € un jour ordinaire → vous visez <strong>" + frInt(t) + " €</strong> (apport " + (apport >= 0 ? "+" : "−") + frInt(apport) + " €)"
            + (exp != null ? "<br><strong>Au total</strong> : " + dayLabel + " habituel ≈ " + frInt(exp) + " € (vos ventes réelles) + l’apport → ≈ <strong>" + frInt(exp + apport) + " €</strong> de journée" : "");
        }
      } else if (kpi === "revenue_residual") {
        if (unit) unit.textContent = "% au-dessus de l’attendu du jour";
        if (tlab) tlab.textContent = "Cible :";
        if (exp != null && isFinite(t) && t > 0) {
          var app2 = Math.round(exp * t / 100);
          out = "<strong>L’événement</strong> : +" + frInt(t) + " % vs l’attendu → apport ≈ <strong>+" + frInt(app2) + " €</strong> un " + dayLabel
            + "<br><strong>Au total</strong> : ≈ <strong>" + frInt(exp + app2) + " €</strong> de journée (" + dayLabel + " habituel ≈ " + frInt(exp) + " €, vos ventes réelles)";
        }
      } else {
        if (unit) unit.textContent = "% vs votre habituel (base 30 j)";
        if (tlab) tlab.textContent = "Cible :";
        out = "Référentiel : base 30 j — mesuré, verdict plus faible que le CA vs attendu.";
      }
      var c = q("[data-ef-cible]"); if (c) c.innerHTML = out;
      var dref = q("[data-ef-dowref]");
      if (dref && state.recurrence !== "none") {
        dref.innerHTML = baseline.filter(function (x) { return x.n_days > 0; }).map(function (x) {
          return x.label_fr + " ≈ " + frInt(x.expected_eur) + " €";
        }).join(" · ") + ' <span style="color:#9CA3AF;">— attendu par jour (modèle, 90 j) ; menaces vérifiées occurrence par occurrence (carte J-1)</span>';
      }
    }

    mount.querySelectorAll("[data-ef-nat]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.nature = b.getAttribute("data-ef-nat");
        mount.querySelectorAll("[data-ef-nat]").forEach(function (x) { var on = x === b; x.style.background = on ? "#1D3BB3" : "#fff"; x.style.color = on ? "#fff" : "#1D3BB3"; });
      });
    });
    mount.querySelectorAll("[data-ef-rep]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.recurrence = b.getAttribute("data-ef-rep");
        mount.querySelectorAll("[data-ef-rep]").forEach(function (x) { var on = x === b; x.style.background = on ? "#1D3BB3" : "#fff"; x.style.color = on ? "#fff" : "#1D3BB3"; });
        q("[data-ef-recblock]").style.display = state.recurrence === "none" ? "none" : "block";
        q("[data-ef-oneblock]").style.display = state.recurrence === "none" ? "block" : "none";
        q("[data-ef-dowwrap]").style.display = state.recurrence === "weekly" ? "block" : "none";
        refreshCible();
      });
    });
    ["kpi", "family", "target", "dow"].forEach(function (n) {
      var el = q('[data-ef="' + n + '"]'); if (el) { el.addEventListener("change", refreshCible); el.addEventListener("input", refreshCible); }
    });
    mount.querySelectorAll("[data-ef-date]").forEach(function (el) { el.addEventListener("change", refreshCible); });
    var ddl = q('[data-ef="ddlcheck"]');
    if (ddl) ddl.addEventListener("change", function (e) { q("[data-ef-ddlwrap]").style.display = e.target.checked ? "block" : "none"; });
    refreshCible();

    q("[data-ef-submit]").addEventListener("click", function () {
      var errEl = q("[data-ef-err]");
      function fail(m) { errEl.style.display = "block"; errEl.textContent = m; }
      errEl.style.display = "none";
      var title = val("title"); var dispositif = val("dispositif"); var owner = val("owner");
      var kpi = val("kpi"); var t = Number(val("target"));
      if (!title) return fail("Nom requis.");
      if (!dispositif) return fail("Décrivez le dispositif — c’est lui qui sera comparé au mesuré.");
      if (!isFinite(t) || t <= 0) return fail("Cible requise (nombre positif).");
      var body = {
        title: title, description: dispositif, event_type: val("type"),
        author_person_name: owner || null, event_nature: state.nature,
        hour_start: parseInt(val("h1"), 10), hour_end: parseInt(val("h2"), 10),
        kpi: kpi, kpi_family: kpi === "family_revenue" ? val("family") : null,
        kpi_target_pct: kpi === "family_revenue" ? null : t,
        kpi_target_eur: kpi === "family_revenue" ? t : null,
        recurrence: state.recurrence,
      };
      if (state.recurrence !== "none") {
        if (!val("rstart") || !val("rend")) return fail("Récurrence : renseignez « Du » et « Au ».");
        body.recurrence_dow = state.recurrence === "weekly" ? Number(val("dow")) : null;
        body.recurrence_start = val("rstart"); body.recurrence_end = val("rend");
      } else {
        var ds = candidateDates();
        if (!ds.length) return fail("Au moins une date candidate.");
        body.dates = ds;
        if (ddl && ddl.checked && val("ddl")) body.decision_date = val("ddl");
      }
      var btn = q("[data-ef-submit]"); btn.disabled = true; btn.textContent = "Création…";
      fetch("/api/saved-items/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || "Erreur");
          if (state.recurrence !== "none" && Array.isArray(j.occurrences) && j.occurrences.length) {
            // Engagement de mesure de la 1re occurrence (fenêtre ancrée sur son jour).
            // INTERIM incrément 4 : le verdict auto porte sur le CA vs attendu ; la cible KPI
            // dominante vit sur l'événement et sera jugée par le dossier.
            var dw = refDow(); var b0 = baselineFor(dw); var exp0 = b0 ? b0.expected_eur : null;
            var pct = kpi === "revenue_residual" ? Math.round(t)
              : (exp0 && famAvg() != null ? Math.max(1, Math.min(100, Math.round(100 * (t - famAvg()) / exp0))) : 10);
            return fetch("/api/commitments", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({
                location_id: loc, origin_action_type: "event_" + val("type"), saved_item_id: j.saved_item_id,
                event_kpi: kpi, kpi_family: kpi === "family_revenue" ? val("family") : null,
                window_kind: "day_of", window_start_date: j.occurrences[0],
                threshold_basis: "pct", threshold_pct: pct,
                committed_action_text: title + " — " + dispositif,
                owner_person_name: owner || "—",
              }),
            }).then(function (r) { return r.json(); }).then(function (c) { return { created: j, commitment: c }; });
          }
          return { created: j, commitment: null };
        })
        .then(function (res) {
          var j = res.created;
          var okC = res.commitment && res.commitment.ok;
          var dossierUrl = "/app/insightevent/evenement?location_id=" + encodeURIComponent(loc) + "&saved_item_id=" + encodeURIComponent(j.saved_item_id);
          var html2 = '<div style="font-size:13px;color:#166534;background:#E6F6F0;border-radius:8px;padding:12px 14px;line-height:1.6;">Événement créé.';
          if (state.recurrence !== "none") {
            html2 += " " + j.occurrences.length + " occurrences générées (" + j.occurrences.slice(0, 4).map(function (d) { return d.slice(8, 10) + "/" + d.slice(5, 7); }).join(" · ") + (j.occurrences.length > 4 ? " …" : "") + ").";
            html2 += okC ? " Engagement de mesure de la 1re occurrence créé — fenêtre ancrée sur son jour." : " <span style=\"color:#B45309;\">Engagement non créé (" + esc((res.commitment && res.commitment.error) || "erreur") + ") — re-tentez depuis le dossier.</span>";
          }
          html2 += ' <a href="' + dossierUrl + '" style="color:#1D3BB3;font-weight:600;">Ouvrir le dossier →</a><br><span style="color:#6b7280;">Ouverture automatique…</span></div>';
          mount.innerHTML = html2;
          // Redirection vers le DOSSIER (remarque owner 04/08 : le bandeau était un cul-de-sac) —
          // récurrent → états Avant/Après ; ponctuel → état Décider (les candidats côte à côte).
          setTimeout(function () { window.location.href = dossierUrl; }, 1400);
          if (opts && typeof opts.onDone === "function") opts.onDone(res);
        })
        .catch(function (e) { btn.disabled = false; btn.textContent = "Créer l’événement — l’engagement de mesure se crée avec"; fail(e && e.message ? e.message : "Erreur, réessayez."); });
    });
  }

  window.MSEventForm = { open: open };
})();
