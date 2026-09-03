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
    var today = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetchJson("/api/insight/evenement?location_id=" + encodeURIComponent(loc) + "&create_context=1"),
      fetchJson("/api/channels/team?location_id=" + encodeURIComponent(loc)),
      // La grille de dates lit la MÊME surface que le Calendrier (proto v4 validé 04/08) —
      // en parallèle du contexte : coût wall-clock nul. Mois suivants chargés au ‹ › (cache).
      fetchJson("/api/insight/month?location_id=" + encodeURIComponent(loc) + "&window_start_date=" + encodeURIComponent(today)),
    ]).then(function (rs) {
      var ctx = rs[0];
      if (!ctx || !ctx.ok) { mount.innerHTML = '<div style="padding:20px;color:#B91C1C;font-size:13px;">Erreur de chargement — rechargez la page.</div>'; return; }
      var team = (rs[1] && rs[1].ok && Array.isArray(rs[1].items)) ? rs[1].items : [];
      ctx._month0 = rs[2] && rs[2].ok ? rs[2] : null;
      render(mount, loc, ctx, team, opts);
    });
  }

  // ── Grille de dates (proto v4) : jours normalisés depuis /api/insight/month ──
  function normalizeMonthDays(payload) {
    var out = {};
    var days = payload && Array.isArray(payload.days) ? payload.days : [];
    days.forEach(function (d) {
      var flat = function (v) { return v && typeof v === "object" && "value" in v ? v.value : v; };
      var iso = String(flat(d.date) || "").slice(0, 10);
      if (!iso) return;
      out[iso] = {
        ferie: !!flat(d.is_public_holiday_fr_flag), ferie_name: flat(d.public_holiday_name_fr) || null,
        vac: !!flat(d.is_school_holiday_flag), vac_name: flat(d.school_holiday_name) || null,
        com: Array.isArray(flat(d.commercial_event_names_region)) ? flat(d.commercial_event_names_region) : [],
        lvl: Math.max(Number(flat(d.lvl_rain)) || 0, Number(flat(d.lvl_heat)) || 0, Number(flat(d.lvl_wind)) || 0, Number(flat(d.lvl_snow)) || 0, Number(flat(d.lvl_cold)) || 0),
      };
    });
    return out;
  }

  function render(mount, loc, ctx, team, opts) {
    var types = Array.isArray(ctx.event_types) ? ctx.event_types : [];
    var fams = Array.isArray(ctx.families) ? ctx.families : [];
    var kav = ctx.kpi_available || {};
    var baseline = Array.isArray(ctx.dow_baseline) ? ctx.dow_baseline : [];
    // K9 (24/08) : le KPI profit estimé se débloque quand des marges sont déclarées
    // (par famille, ou globale en repli) — l'endpoint init porte la vérité + le référentiel €/j.
    var profitCtx = ctx.profit_estimated || {};
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
      + '<option value="revenue_residual">CA du jour vs votre résultat habituel — mesuré, verdict fort</option>'
      + (fams.length ? '<option value="family_revenue">CA d’une famille produits & services vs sa moyenne — mesuré</option>' : '')
      + '<option value="tickets">Tickets vs votre résultat habituel (base 30 j) — verdict plus faible</option>'
      + '<option value="basket">Panier moyen vs votre résultat habituel (base 30 j) — verdict plus faible</option>'
      // 27/08 (audit menu KPI) : flux et conversion n'apparaissent que si le SITE porte la donnée
      // (ctx.kpi_available, >= 30 j couverts sur 90) — même mécanisme que le KPI famille. Le
      // mapping (visitors -> footfall, conversion -> conversion) et la mesure existaient déjà.
      + (kav.visitors ? '<option value="visitors">Visiteurs vs votre résultat habituel (base 30 j) — verdict plus faible</option>' : '')
      + (kav.conversion ? '<option value="conversion">Taux de conversion vs votre résultat habituel (base 30 j) — verdict plus faible</option>' : '')
      + (profitCtx.available
        ? '<option value="profit_estimated">Profit estimé vs votre résultat habituel (base 30 j) — sur vos marges déclarées</option>'
        : '<option value="profit_estimated" disabled>Profit estimé — indisponible : marge non déclarée</option>')
      + '</select></div></div>'
      + '<div data-ef-famwrap style="display:none;margin-top:10px;"><label style="' + lbl + '">Famille produits & services</label><select data-ef="family" style="' + inp + 'cursor:pointer;">'
      + fams.map(function (f) { return '<option value="' + esc(f.category) + '" data-avg="' + Number(f.avg_day_eur) + '">' + esc(f.category) + ' — ' + frInt(f.avg_day_eur) + ' €/j en moyenne</option>'; }).join("") + '</select></div>'
      + ((Array.isArray(ctx.poles) && ctx.poles.length)
        ? '<div style="margin-top:10px;"><label style="' + lbl + '">Rattacher \u00e0 un p\u00f4le \u2014 l\u2019op\u00e9ration se mesure sur ses familles</label><select data-ef="pole" style="' + inp + 'cursor:pointer;">'
          + '<option value="">Aucun</option>'
          + ctx.poles.map(function (pp) { return '<option value="' + esc(pp.dispositif_id) + '" data-fams="' + esc(JSON.stringify(pp.families || [])) + '">' + esc(pp.name) + (pp.families && pp.families.length ? ' \u2014 ' + esc(pp.families.join(', ')) : '') + '</option>'; }).join('')
          + '</select></div>'
        : '')
      + '<div style="border:1px solid rgba(29,59,179,0.25);border-radius:8px;padding:10px 12px;background:#FAFBFF;margin-top:10px;">'
      + '<div style="' + lbl + '">Cible — l’objectif porte sur l’ÉVÉNEMENT ; le total du jour en est la conséquence</div>'
      + '<div style="display:flex;gap:8px;align-items:center;font-size:12.5px;color:#111827;flex-wrap:wrap;">'
      + '<span data-ef-tglabel>Cible :</span><input data-ef="target" value="15" style="' + inp + 'width:80px;display:inline-block;text-align:right;padding:6px;"><span data-ef-tgunit>%</span></div>'
      + '<div data-ef-cible style="font-size:12.5px;color:#374151;margin-top:6px;line-height:1.5;"></div>'
      + '<div style="margin-top:8px;font-size:12.5px;color:#374151;">Co\u00fbt de l\u2019op\u00e9ration : <input data-ef="cost" type="number" min="0" step="10" style="' + inp + 'width:90px;display:inline-block;text-align:right;padding:6px;"> \u20ac <span style="color:#9CA3AF;">(optionnel \u2014 le bilan rendra le net)</span></div></div>'
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
      // ── Le shopping de dates DANS le formulaire (proto v4 validé 04/08) : la grille remplace
      //    le détour Calendrier → comparaison. Jours de LANCEMENT candidats ; « Durée » couvre
      //    les événements multi-jours (fenêtre de mesure calée au Choisir). ──
      + '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px;">'
      + '<div style="max-width:440px;"><label style="' + lbl + 'margin-bottom:2px;">Options de dates</label>'
      + '<div style="font-size:11px;color:#6B7280;line-height:1.5;">Chaque clic = un jour de LANCEMENT candidat (jusqu’à 7). La durée s’applique à chacun — à 3 jours, cliquer le 08 couvre 08→10. Le dossier comparera vos candidats, vous en choisirez un.</div></div>'
      + '<span style="font-size:12.5px;color:#374151;white-space:nowrap;">Durée : <input data-ef="duree" value="1" style="' + inp + 'width:52px;display:inline-block;text-align:center;padding:6px;"> jour(s)</span></div>'
      + '<div data-ef-chips style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;"></div>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">'
      + '<button type="button" data-ef-mprev style="font-size:13px;font-family:inherit;border:1px solid rgba(0,0,0,0.12);border-radius:8px;background:#fff;color:#1D3BB3;padding:3px 10px;cursor:pointer;">‹</button>'
      + '<span data-ef-mois style="font-size:12.5px;font-weight:600;color:#111827;min-width:130px;text-align:center;"></span>'
      + '<button type="button" data-ef-mnext style="font-size:13px;font-family:inherit;border:1px solid rgba(0,0,0,0.12);border-radius:8px;background:#fff;color:#1D3BB3;padding:3px 10px;cursor:pointer;">›</button></div>'
      + '<div data-ef-mctx style="font-size:11px;color:#6B7280;margin-bottom:6px;"></div>'
      + '<div data-ef-grid style="min-height:60px;"></div>'
      + '<div style="font-size:10.5px;color:#9CA3AF;margin-top:6px;line-height:1.6;">Teinte = votre CA habituel selon le jour de semaine (modèle 90 j). Pastille = risque météo niveau ≥ 2 (rouge = 4) — au-delà de ~10 jours, tendance. ★ férié · vacances et périodes : ligne sous le mois + survol d’un jour.</div>'
      + '<div style="margin-top:8px;"><label style="' + lbl + '">Vos candidates <span data-ef-count style="color:#1D3BB3;"></span> <span style="font-weight:400;color:#9CA3AF;text-transform:none;letter-spacing:0;">— conservées d’un mois à l’autre</span></label>'
      + '<div data-ef-picked style="display:flex;gap:8px;flex-wrap:wrap;min-height:26px;"></div></div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#374151;cursor:pointer;margin-top:8px;"><input data-ef="ddlcheck" type="checkbox" style="width:auto;"> Fixer une date limite de choix</label>'
      + '<div data-ef-ddlwrap style="display:none;margin-top:6px;max-width:170px;"><label style="' + lbl + '">Date limite</label><input data-ef="ddl" type="date" style="' + inp + '"></div></div>'
      + '<div data-ef-err style="display:none;color:#B91C1C;font-size:12px;margin-top:10px;"></div>'
      + '<div style="display:flex;margin-top:12px;"><span style="margin-left:auto;"><button type="button" data-ef-submit style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500;color:#fff;background:#1D3BB3;border:1px solid #1D3BB3;border-radius:10px;padding:7px 14px;cursor:pointer;font-family:inherit;">Créer l’événement — l’engagement de mesure se crée avec</button></span></div>';

    // ── Pôle / dispositif permanent (spec poles-dispositifs-permanents, owner 27/08) ──
    // Un commutateur de nature en tête : « Opération datée » = TOUT l'existant, intact ;
    // « Pôle — dispositif permanent » = panneau propre (familles réelles en chips, responsable,
    // levier + mémoire), POST direct /api/commitments — sans terme, jamais jugé par le cron.
    // Le panneau pôle est rendu par le MODULE PARTAGÉ MSPoleForm (public/pole-form.js,
    // inc 9c) — même formulaire que l'onglet Pôles du Compte, jamais deux copies.
    var polePanel = '<div data-ef-pole-panel style="display:none;"></div>';
    var natureSwitch = '<div style="margin-bottom:12px;"><label style="' + lbl + '">Nature</label>'
      + '<span style="display:inline-flex;border:1px solid #1D3BB3;border-radius:8px;overflow:hidden;">'
      + '<button type="button" data-ef-mode="dated" style="' + segB + 'background:#1D3BB3;color:#fff;">Op\u00e9ration dat\u00e9e</button>'
      + '<button type="button" data-ef-mode="pole" style="' + segB + '">P\u00f4le \u2014 dispositif permanent</button></span></div>';
    html = natureSwitch + '<div data-ef-dated-panel>' + html + '</div>' + polePanel;

    mount.innerHTML = html;
    var q = function (sel) { return mount.querySelector(sel); };
    // Préremplissage depuis une fiche dispositif (CTA « Automatiser » du tableau, 05/08) :
    // titre + dispositif posés, l'utilisateur choisit sa récurrence et ses dates.
    if (opts.titre) { var _t = q('[data-ef="title"]'); if (_t && !_t.value) _t.value = String(opts.titre).slice(0, 120); }
    if (opts.dispositif) { var _d = q('[data-ef="dispositif"]'); if (_d && !_d.value) _d.value = String(opts.dispositif).slice(0, 240); }
    var val = function (name) { var el = q('[data-ef="' + name + '"]'); return el ? String(el.value || "").trim() : ""; };
    // Bascule de nature ; le panneau pôle se rend au premier passage via MSPoleForm
    // (familles/responsables/pôles du ctx ; une famille déjà portée par un pôle est refusée).
    (function () {
      var poleRendered = false;
      var modeBtns = mount.querySelectorAll('[data-ef-mode]');
      modeBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          var mode = b.getAttribute('data-ef-mode');
          modeBtns.forEach(function (x) {
            var on = x === b;
            x.style.background = on ? '#1D3BB3' : '#fff';
            x.style.color = on ? '#fff' : '#1D3BB3';
          });
          q('[data-ef-dated-panel]').style.display = mode === 'pole' ? 'none' : '';
          q('[data-ef-pole-panel]').style.display = mode === 'pole' ? '' : 'none';
          if (mode === 'pole' && !poleRendered && window.MSPoleForm) {
            poleRendered = true;
            var taken = {};
            (Array.isArray(ctx.poles) ? ctx.poles : []).forEach(function (pp) {
              (pp.families || []).forEach(function (f) { taken[f] = pp.name; });
            });
            window.MSPoleForm.render(q('[data-ef-pole-panel]'), {
              location_id: loc, families: fams,
              owners: owners, takenFamilies: taken,
              componentTypes: Array.isArray(ctx.component_types) ? ctx.component_types : [],
            });
          }
        });
      });
    })();
    var todayIso = new Date().toISOString().slice(0, 10);
    var state = {
      nature: "outdoor", recurrence: "none",
      picked: (Array.isArray(opts.dates) ? opts.dates.filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= todayIso; }).slice(0, 7) : []),
      months: {}, curY: 0, curM: 0,
    };
    if (ctx._month0) state.months[todayIso.slice(0, 7)] = normalizeMonthDays(ctx._month0);
    state.curY = Number(todayIso.slice(0, 4)); state.curM = Number(todayIso.slice(5, 7)) - 1;

    function baselineFor(dow) {
      for (var i = 0; i < baseline.length; i++) if (baseline[i].dow === dow) return baseline[i];
      return null;
    }
    function candidateDates() {
      return state.picked.slice().sort().slice(0, 7);
    }
    function dureeVal() {
      var n = parseInt(val("duree"), 10);
      return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 1;
    }
    function frD(iso) { return iso.slice(8, 10) + "/" + iso.slice(5, 7); }
    var DOW3 = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
    var MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    function dowOf(iso) { return new Date(iso + "T00:00:00Z").getUTCDay(); }
    function tintFor(iso) {
      var b = baselineFor(dowOf(iso));
      var vals = baseline.map(function (x) { return x.expected_eur; }).filter(function (x) { return x > 0; });
      if (!b || !vals.length) return "rgba(29,59,179,0.08)";
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      var a = max > min ? 0.06 + 0.30 * (b.expected_eur - min) / (max - min) : 0.12;
      return "rgba(29,59,179," + a.toFixed(2) + ")";
    }
    function monthKey(y, m) { return y + "-" + String(m + 1).padStart(2, "0"); }
    function ensureMonth(y, m, then) {
      var k = monthKey(y, m);
      if (state.months[k]) { then(); return; }
      var startIso = k === todayIso.slice(0, 7) ? todayIso : k + "-01";
      var grid = q("[data-ef-grid]");
      if (grid) grid.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:12px 0;">Chargement du mois…</div>';
      fetchJson("/api/insight/month?location_id=" + encodeURIComponent(loc) + "&window_start_date=" + encodeURIComponent(startIso)).then(function (p) {
        state.months[k] = p && p.ok ? normalizeMonthDays(p) : {};
        then();
      });
    }
    function renderChips() {
      var el = q("[data-ef-chips]"); if (!el) return;
      var k = monthKey(state.curY, state.curM);
      var mdays = state.months[k] || {};
      var chips = [];
      // Meilleur jour de CA (fait, depuis la baseline — jamais un score plat re-classé).
      var best = null;
      baseline.forEach(function (b) { if (b.n_days > 0 && (!best || b.expected_eur > best.expected_eur)) best = b; });
      if (best) {
        var bestDates = Object.keys(mdays).filter(function (iso) { return dowOf(iso) === best.dow && iso >= todayIso; }).sort();
        chips.push({ label: "Meilleur jour de CA : " + best.label_fr + " (≈ " + frInt(best.expected_eur) + " €/j, vos ventes 90 j) — tout sélectionner", c: "#1D3BB3", bg: "#EEF2FF", dates: bestDates });
      }
      Object.keys(mdays).sort().forEach(function (iso) {
        var d = mdays[iso];
        if (d.ferie && iso >= todayIso) chips.push({ label: DOW3[dowOf(iso)] + " " + frD(iso) + " — férié" + (d.ferie_name ? " (" + d.ferie_name + ")" : ""), c: "#1D3BB3", bg: "#EEF2FF", dates: [iso] });
      });
      // Risques météo niv ≥ 3, groupés par niveau (information, pas cliquable).
      [4, 3].forEach(function (lv) {
        var ds = Object.keys(mdays).filter(function (iso) { return mdays[iso].lvl === lv && iso >= todayIso; }).sort();
        if (ds.length) chips.push({ label: "Risque météo niv. " + lv + " : " + ds.map(frD).join(", "), c: lv >= 4 ? "#e24b4a" : "#B45309", bg: lv >= 4 ? "#FEF2F2" : "#FEF3E2", dates: [] });
      });
      el.innerHTML = chips.map(function (ch, i) {
        return '<span data-ef-chip="' + i + '" style="display:inline-flex;font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;color:' + ch.c + ';background:' + ch.bg + ';cursor:' + (ch.dates.length ? "pointer" : "default") + ';">' + esc(ch.label) + (ch.dates.length ? " +" : "") + "</span>";
      }).join("");
      el.querySelectorAll("[data-ef-chip]").forEach(function (c, i) {
        c.addEventListener("click", function () {
          chips[i].dates.forEach(function (d) { if (state.picked.indexOf(d) < 0 && state.picked.length < 7) state.picked.push(d); });
          renderDatesUI();
        });
      });
    }
    function renderGrid() {
      var el = q("[data-ef-grid]"); if (!el) return;
      var k = monthKey(state.curY, state.curM);
      var mdays = state.months[k] || {};
      q("[data-ef-mois]").textContent = MONTHS_FR[state.curM].charAt(0).toUpperCase() + MONTHS_FR[state.curM].slice(1) + " " + state.curY;
      var first = k + "-01";
      var last = new Date(Date.UTC(state.curY, state.curM + 1, 0)).toISOString().slice(0, 10);
      // Ligne de contexte du mois (vacances nommées + périodes commerciales régionales).
      var inM = Object.keys(mdays).filter(function (iso) { return iso >= first && iso <= last; }).sort();
      var vacs = inM.filter(function (iso) { return mdays[iso].vac; });
      var coms = {};
      inM.forEach(function (iso) { (mdays[iso].com || []).forEach(function (n) { (coms[n] = coms[n] || []).push(iso); }); });
      var parts = [];
      if (vacs.length) parts.push((mdays[vacs[0]].vac_name || "Vacances scolaires") + " du " + frD(vacs[0]) + " au " + frD(vacs[vacs.length - 1]));
      Object.keys(coms).forEach(function (n) { var ds = coms[n]; parts.push("Période « " + n + " » du " + frD(ds[0]) + " au " + frD(ds[ds.length - 1])); });
      q("[data-ef-mctx]").textContent = inM.length ? (parts.length ? parts.join(" · ") : "Ni vacances ni période commerciale sur ce mois.") : "";
      var start = new Date(first + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      var out = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;max-width:430px;">';
      ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].forEach(function (h) {
        out += '<div style="font-size:9.5px;font-weight:600;color:#9CA3AF;text-transform:uppercase;text-align:center;padding:2px 0;">' + h + "</div>";
      });
      // Couverture par la durée : chaque candidat couvre [jour, jour+durée−1] — visible.
      var covered = {};
      var durNow = dureeVal();
      state.picked.forEach(function (p0) {
        for (var di = 1; di < durNow; di++) {
          var cd = new Date(p0 + "T00:00:00Z"); cd.setUTCDate(cd.getUTCDate() + di);
          covered[cd.toISOString().slice(0, 10)] = true;
        }
      });
      var cur = new Date(start);
      while (cur.toISOString().slice(0, 10) <= last) {
        var iso = cur.toISOString().slice(0, 10);
        if (iso < first) { out += '<div style="height:40px;"></div>'; }
        else {
          var d = mdays[iso];
          if (iso < todayIso || !d) {
            out += '<div style="height:40px;border-radius:7px;background:#F3F4F6;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#C4C8CE;"><span style="font-size:12.5px;font-weight:600;">' + Number(iso.slice(8, 10)) + '</span><span style="font-size:8.5px;">' + (iso < todayIso ? "passé" : "—") + "</span></div>";
          } else {
            var sel = state.picked.indexOf(iso) >= 0;
            var cov = !sel && covered[iso];
            var dotc = d.lvl >= 4 ? "#e24b4a" : d.lvl >= 2 ? "#B45309" : null;
            var b2 = baselineFor(dowOf(iso));
            var tip = DOW3[dowOf(iso)] + " " + frD(iso) + (b2 ? " — habituel ≈ " + frInt(b2.expected_eur) + " €" : "");
            if (d.ferie) tip += " · Férié" + (d.ferie_name ? " (" + d.ferie_name + ")" : "");
            if (d.vac) tip += " · " + (d.vac_name || "Vacances scolaires");
            (d.com || []).forEach(function (n) { tip += " · " + n; });
            if (d.lvl >= 2) tip += " · risque météo niv. " + d.lvl;
            out += '<div data-ef-day="' + iso + '" title="' + esc(tip) + '" style="position:relative;height:40px;border-radius:7px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;'
              + "background:" + (sel ? "#1D3BB3" : cov ? "rgba(29,59,179,0.22)" : tintFor(iso)) + ";" + (sel ? "color:#fff;" : "color:#111827;")
              + (d.ferie ? "outline:1.5px solid #1D3BB3;outline-offset:-1.5px;" : "")
              + '">'
              + '<span style="font-size:12.5px;font-weight:600;">' + Number(iso.slice(8, 10)) + (d.ferie ? " ★" : "") + "</span>"
              + '<span style="font-size:8.5px;' + (sel ? "color:rgba(255,255,255,0.8);" : "color:#6B7280;") + '">' + DOW3[dowOf(iso)] + "</span>"
              + (dotc ? '<span style="position:absolute;top:3px;right:4px;width:7px;height:7px;border-radius:50%;background:' + dotc + ';"></span>' : "")
              + "</div>";
          }
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      out += "</div>";
      el.innerHTML = out;
      el.querySelectorAll("[data-ef-day]").forEach(function (c) {
        c.addEventListener("click", function () {
          var iso = c.getAttribute("data-ef-day");
          var i = state.picked.indexOf(iso);
          if (i >= 0) state.picked.splice(i, 1);
          else if (state.picked.length < 7) state.picked.push(iso);
          renderDatesUI();
        });
      });
    }
    function renderPicked() {
      var el = q("[data-ef-picked]"); if (!el) return;
      var cnt = q("[data-ef-count]"); if (cnt) cnt.textContent = state.picked.length ? "(" + state.picked.length + "/7)" : "";
      if (!state.picked.length) { el.innerHTML = '<span style="font-size:12px;color:#9CA3AF;">Cliquez des jours dans la grille.</span>'; return; }
      var dur = dureeVal();
      el.innerHTML = candidateDates().map(function (iso) {
        var b = baselineFor(dowOf(iso));
        var endTxt = "";
        if (dur > 1) {
          var ed = new Date(iso + "T00:00:00Z"); ed.setUTCDate(ed.getUTCDate() + dur - 1);
          endTxt = " → " + frD(ed.toISOString().slice(0, 10));
        }
        return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;border:1px solid #1D3BB3;color:#1D3BB3;border-radius:8px;padding:5px 10px;background:#fff;">'
          + DOW3[dowOf(iso)] + " " + frD(iso) + endTxt
          + (b ? ' <span style="color:#6B7280;">≈ ' + frInt(b.expected_eur) + " € habituel" + (dur > 1 ? " /j · mesure sur " + dur + " j" : "") + "</span>" : "")
          + ' <span data-ef-rm="' + iso + '" style="cursor:pointer;font-weight:700;">×</span></span>';
      }).join("");
      el.querySelectorAll("[data-ef-rm]").forEach(function (x) {
        x.addEventListener("click", function () { state.picked.splice(state.picked.indexOf(x.getAttribute("data-ef-rm")), 1); renderDatesUI(); });
      });
    }
    function renderDatesUI() { renderChips(); renderGrid(); renderPicked(); refreshCible(); }
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
        if (unit) unit.textContent = "% au-dessus de votre résultat habituel du jour";
        if (tlab) tlab.textContent = "Cible :";
        if (exp != null && isFinite(t) && t > 0) {
          var app2 = Math.round(exp * t / 100);
          out = "<strong>L’événement</strong> : +" + frInt(t) + " % vs votre résultat habituel → apport ≈ <strong>+" + frInt(app2) + " €</strong> un " + dayLabel
            + "<br><strong>Au total</strong> : ≈ <strong>" + frInt(exp + app2) + " €</strong> de journée (" + dayLabel + " habituel ≈ " + frInt(exp) + " €, vos ventes réelles)";
        }
      } else if (kpi === "profit_estimated") {
        if (unit) unit.textContent = "% vs votre résultat habituel (base 30 j)";
        if (tlab) tlab.textContent = "Cible :";
        var pAvg = profitCtx.avg_day_eur != null ? Number(profitCtx.avg_day_eur) : null;
        out = "Référentiel : profit estimé ≈ " + (pAvg != null ? frInt(pAvg) + " €/j" : "vos marges déclarées × vos ventes")
          + " — estimation sur vos marges déclarées, jamais présentée comme mesurée.";
        if (pAvg != null && isFinite(t) && t > 0) {
          var app3 = Math.round(pAvg * t / 100);
          out += "<br><strong>L’événement</strong> : +" + frInt(t) + " % → apport ≈ <strong>+" + frInt(app3) + " €</strong> de profit estimé par jour mesuré.";
        }
      } else {
        if (unit) unit.textContent = "% vs votre résultat habituel (base 30 j)";
        if (tlab) tlab.textContent = "Cible :";
        out = "Référentiel : base 30 j — mesuré, verdict plus faible que le CA vs votre résultat habituel.";
      }
      var c = q("[data-ef-cible]"); if (c) c.innerHTML = out;
      var dref = q("[data-ef-dowref]");
      if (dref && state.recurrence !== "none") {
        dref.innerHTML = baseline.filter(function (x) { return x.n_days > 0; }).map(function (x) {
          return x.label_fr + " ≈ " + frInt(x.expected_eur) + " €";
        }).join(" · ") + ' <span style="color:#9CA3AF;">— CA habituel par jour (modèle, 90 j) ; menaces vérifiées occurrence par occurrence (carte J-1)</span>';
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
    // Héritage KPI pôle→opération (spec pôles) : rattacher un pôle bascule le KPI sur le CA
    // famille et RESTREINT la liste aux familles DU pôle (mono-famille = présélectionnée) ;
    // « Aucun » restaure la liste complète. Le KPI reste modifiable — un choix explicite prime.
    var _famAllHtml = (function () { var el = q('[data-ef="family"]'); return el ? el.innerHTML : ''; })();
    var poleEl = q('[data-ef="pole"]');
    if (poleEl) poleEl.addEventListener('change', function () {
      var famEl = q('[data-ef="family"]'); var kpiEl = q('[data-ef="kpi"]');
      if (!famEl || !kpiEl) return;
      var opt = poleEl.selectedOptions && poleEl.selectedOptions[0];
      var famsPole = [];
      try { famsPole = JSON.parse((opt && opt.getAttribute('data-fams')) || '[]'); } catch (e) { famsPole = []; }
      if (poleEl.value && famsPole.length) {
        famEl.innerHTML = '';
        var kept = 0;
        var tmp = document.createElement('select'); tmp.innerHTML = _famAllHtml;
        Array.prototype.forEach.call(tmp.options, function (o) {
          if (famsPole.indexOf(o.value) >= 0) { famEl.appendChild(o.cloneNode(true)); kept++; }
        });
        if (kept) { kpiEl.value = 'family_revenue'; famEl.selectedIndex = 0; }
      } else {
        famEl.innerHTML = _famAllHtml;
      }
      refreshCible();
    });
    ["kpi", "family", "target", "dow"].forEach(function (n) {
      var el = q('[data-ef="' + n + '"]'); if (el) { el.addEventListener("change", refreshCible); el.addEventListener("input", refreshCible); }
    });
    var dureeEl = q('[data-ef="duree"]');
    if (dureeEl) dureeEl.addEventListener("input", function () { renderGrid(); renderPicked(); });
    q("[data-ef-mprev]").addEventListener("click", function () {
      var y = state.curY, m = state.curM - 1; if (m < 0) { m = 11; y--; }
      if (monthKey(y, m) < todayIso.slice(0, 7)) return;
      state.curY = y; state.curM = m;
      ensureMonth(y, m, renderDatesUI);
    });
    q("[data-ef-mnext]").addEventListener("click", function () {
      var y = state.curY, m = state.curM + 1; if (m > 11) { m = 0; y++; }
      state.curY = y; state.curM = m;
      ensureMonth(y, m, renderDatesUI);
    });
    var ddl = q('[data-ef="ddlcheck"]');
    if (ddl) ddl.addEventListener("change", function (e) { q("[data-ef-ddlwrap]").style.display = e.target.checked ? "block" : "none"; });
    renderDatesUI();

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
        // Durée multi-jours (v1 : ponctuel seulement — les occurrences d'une série restent au jour).
        duration_days: state.recurrence === "none" && dureeVal() > 1 ? dureeVal() : null,
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
                attached_pole_id: val("pole") || null,
                operation_cost_eur: (function () { var n = parseFloat(val("cost")); return isFinite(n) && n >= 0 ? n : null; })(),
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
