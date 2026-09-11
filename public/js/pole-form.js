// MSPoleForm — LE formulaire de création de pôle, module PARTAGÉ (vue équipe inc 9c).
// Extrait VERBATIM du panneau « Pôle — dispositif permanent » d'event-form.js (owner
// 27/08) pour être servi par DEUX surfaces sans copie : la bascule de Nouvelle opération
// (event-form.js) et l'onglet Pôles du Compte (profile.astro). Toute évolution du
// formulaire se fait ICI, jamais dans un appelant.
// Libellé 28/08 (owner) : « Familles de produits & services ». Garde 28/08 : une famille
// vit dans UN SEUL pôle (opts.takenFamilies = {famille: nom du pôle qui la porte}).
// Composants (03/09, spec dispositifs-typologie § 3, owner D1) : les unités physiques du
// dispositif (linéaire, gondole, vitrine…). opts.componentTypes = [{value, label_fr, roles:[{value,
// label_fr}]}] servi par create_context (types du métier, libellés owner seulement). Sans cette
// liste, le bloc ne s'affiche pas — le formulaire d'avant reste intact.
// Mesures d'espace (11/09, docs/espace-et-pole.md E3-E5, mots ratifiés 12/09) : par composant, « N° sur le
// plan », « Longueur (m) », « Faces de préhension » (1 ou 2) et, quand le pôle porte plusieurs familles, la
// « Part de linéaire » de chacune (Σ = 100 %) ; au pôle, la « Surface de vente (m²) ». Elles partent dans le
// MÊME POST, sous space_measures — jamais dans components : le serveur les écrit à part
// (analytics.space_measures). Chaque composant reçoit sa clé ICI (data-ef-comp-key) pour que la mesure
// et le composant se retrouvent. « Pôle en projet » (owner 11/09) : sans vente importée, les familles du
// pôle s'écrivent — elles seront à rapprocher de la caisse à la première importation.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function frInt(n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString('fr-FR'); }

  var lbl = 'display:block;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6B7280;margin-bottom:5px;';
  var inp = 'width:100%;box-sizing:border-box;font-size:13px;color:#111827;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 10px;font-family:inherit;';
  var poleTa = 'width:100%;box-sizing:border-box;font-size:12.5px;color:#111827;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:8px;padding:8px 10px;font-family:inherit;resize:none;min-height:48px;';

  function famChip(cat, avg) {
    return '<span data-ef-polefam="' + esc(cat) + '" style="font-size:12px;padding:5px 11px;border:1px solid #e5e7eb;border-radius:999px;cursor:pointer;background:#fff;color:#374151;">' + esc(cat) + ' · ' + frInt(avg) + ' €/j</span>';
  }

  // opts = { location_id, families: [{category, avg_day_eur}], owners: [names],
  //          takenFamilies: {category: poleName}, onCreated(commitment_id) }
  function render(mount, opts) {
    var fams = Array.isArray(opts.families) ? opts.families : [];
    var owners = Array.isArray(opts.owners) ? opts.owners : [];
    var taken = opts.takenFamilies || {};
    var ctypes = Array.isArray(opts.componentTypes) ? opts.componentTypes : [];
    mount.innerHTML = ''
      + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Nom du pôle</label><input data-ef="polename" style="' + inp + '" maxlength="120"></div>'
      + '<div style="flex:1;"><label style="' + lbl + '">Responsable(s)</label>'
      + (owners.length ? '<select data-ef="poleowner" style="' + inp + 'cursor:pointer;">' + owners.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>' : '<input data-ef="poleowner" style="' + inp + '" placeholder="Une personne de l’équipe">')
      + '</div></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Familles de produits &amp; services — depuis vos ventes</label>'
      + (fams.length ? '<div data-ef-polefams style="display:flex;gap:6px;flex-wrap:wrap;">' + fams.map(function (f) { return famChip(f.category, f.avg_day_eur); }).join('') + '</div>'
        : '<div style="font-size:12px;color:#9CA3AF;">Aucune famille dans vos ventes pour l’instant — le pôle a besoin d’un périmètre mesurable.</div>'
          + '<div data-ef-pole-projet style="margin-top:8px;padding:10px 12px;background:#F9FAFB;border:1px solid #e5e7eb;border-radius:8px;">'
          + '<div style="font-size:12px;font-weight:600;color:#374151;">Pôle en projet — Aucune vente importée</div>'
          + '<input data-ef="polefams-projet" style="' + inp + 'margin-top:6px;" maxlength="400" placeholder="Les familles du pôle, séparées par une virgule">'
          + '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">À la première importation de vos ventes, ces familles seront à rapprocher de la caisse.</div></div>')
      + '<div style="font-size:11px;color:#9CA3AF;margin-top:5px;">Sans terme : lecture continue de ses familles vs votre résultat habituel — pas de verdict.</div></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Description du dispositif</label><textarea data-ef="polelever" style="' + poleTa + '" placeholder="Ce que le pôle fait au quotidien"></textarea></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Ressource(s)</label><input data-ef="poleres" style="' + inp + '"></div>'
      + '<div style="margin-top:10px;max-width:220px;"><label style="' + lbl + '">Surface de vente (m²)</label><input data-ef="polesurface" style="' + inp + '" inputmode="decimal" placeholder="24,5"></div>'
      + (ctypes.length
        ? '<div style="margin-top:10px;"><label style="' + lbl + '">Composants</label>'
          + '<div data-ef-comps></div>'
          + '<button type="button" data-ef-comp-add style="font-size:12px;font-weight:500;color:#1D3BB3;background:#fff;border:1px solid #1D3BB3;border-radius:8px;padding:5px 10px;cursor:pointer;font-family:inherit;margin-top:6px;">Ajouter \u2192</button></div>'
        : '')
      + '<div style="display:flex;gap:12px;margin-top:10px;"><div style="flex:1;"><label style="' + lbl + '">Le plus du dispositif</label><textarea data-ef="poleplus" style="' + poleTa + '"></textarea></div>'
      + '<div style="flex:1;"><label style="' + lbl + '">Pourquoi ça va marcher</label><textarea data-ef="polewhy" style="' + poleTa + '"></textarea></div></div>'
      + '<div data-ef-pole-err style="display:none;color:#B91C1C;font-size:12px;margin-top:10px;"></div>'
      + '<div style="display:flex;margin-top:12px;"><span style="margin-left:auto;"><button type="button" data-ef-pole-submit style="display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:500;color:#fff;background:#1D3BB3;border:1px solid #1D3BB3;border-radius:10px;padding:7px 14px;cursor:pointer;font-family:inherit;">Créer le pôle →</button></span></div>';

    var q = function (sel) { return mount.querySelector(sel); };
    var val = function (name) { var el = q('[data-ef="' + name + '"]'); return el ? String(el.value || '').trim() : ''; };
    var poleSel = {};
    mount.querySelectorAll('[data-ef-polefam]').forEach(function (c) {
      c.addEventListener('click', function () {
        var cat = c.getAttribute('data-ef-polefam');
        poleSel[cat] = !poleSel[cat];
        c.style.background = poleSel[cat] ? '#F5F8FF' : '#fff';
        c.style.borderColor = poleSel[cat] ? '#1D3BB3' : '#e5e7eb';
        c.style.color = poleSel[cat] ? '#1D3BB3' : '#374151';
        syncAllShares();
      });
    });
    // Composants : une rangée = type (registre) + rôle (si le type en a) + libellé libre.
    var compsMount = q('[data-ef-comps]');
    var compAdd = q('[data-ef-comp-add]');
    function roleOptions(typeVal) {
      var t = null;
      for (var i = 0; i < ctypes.length; i++) if (ctypes[i].value === typeVal) t = ctypes[i];
      var roles = t && Array.isArray(t.roles) ? t.roles : [];
      return roles;
    }
    function addCompRow() {
      if (!compsMount) return;
      var row = document.createElement('div');
      row.setAttribute('data-ef-comp-row', '');
      row.setAttribute('data-ef-comp-key', 'c' + Math.random().toString(36).slice(2, 10));
      row.style.cssText = 'margin-bottom:10px;padding-bottom:8px;border-bottom:1px dashed #e5e7eb;';
      row.innerHTML = '<div style="display:flex;gap:8px;align-items:center;">'
        + '<select data-ef-comp-type style="' + inp + 'flex:1;cursor:pointer;">'
        + ctypes.map(function (t) { return '<option value="' + esc(t.value) + '">' + esc(t.label_fr) + '</option>'; }).join('') + '</select>'
        + '<select data-ef-comp-role style="' + inp + 'flex:1;cursor:pointer;display:none;"></select>'
        + '<input data-ef-comp-label style="' + inp + 'flex:2;" maxlength="120" placeholder="Nom du composant">'
        + '<button type="button" data-ef-comp-del style="font-size:12px;color:#6B7280;background:none;border:none;cursor:pointer;font-family:inherit;">Retirer</button></div>'
        + '<div style="display:flex;gap:8px;align-items:flex-end;margin-top:6px;">'
        + '<div style="flex:0 0 110px;"><label style="' + lbl + '">N° sur le plan</label><input data-ef-comp-no style="' + inp + '" inputmode="numeric" maxlength="4"></div>'
        + '<div style="flex:0 0 120px;"><label style="' + lbl + '">Longueur (m)</label><input data-ef-comp-len style="' + inp + '" inputmode="decimal" placeholder="2,40"></div>'
        + '<div style="flex:0 0 160px;"><label style="' + lbl + '">Faces de préhension</label><select data-ef-comp-faces style="' + inp + 'cursor:pointer;"><option value="">—</option><option value="1">1</option><option value="2">2</option></select></div></div>'
        + '<div data-ef-comp-shares style="display:none;margin-top:6px;"></div>';
      compsMount.appendChild(row);
      syncShares(row);
      var tSel = row.querySelector('[data-ef-comp-type]');
      var rSel = row.querySelector('[data-ef-comp-role]');
      var syncRoles = function () {
        var roles = roleOptions(tSel.value);
        rSel.innerHTML = '<option value="">R\u00f4le</option>' + roles.map(function (r) { return '<option value="' + esc(r.value) + '">' + esc(r.label_fr) + '</option>'; }).join('');
        rSel.style.display = roles.length ? '' : 'none';
      };
      tSel.addEventListener('change', syncRoles);
      syncRoles();
      row.querySelector('[data-ef-comp-del]').addEventListener('click', function () { row.parentNode.removeChild(row); });
    }
    if (compAdd) compAdd.addEventListener('click', addCompRow);
    // Familles choisies (chips) ou écrites (pôle en projet) — la liste que les parts de linéaire suivent.
    function selectedFamilies() {
      if (fams.length) return Object.keys(poleSel).filter(function (k) { return poleSel[k]; });
      return val('polefams-projet').split(',').map(function (s) { return s.trim(); }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    }
    // Part de linéaire : une entrée en % par famille du pôle, seulement quand il en porte plusieurs
    // (E5 : une seule famille = 100 %, rien à saisir). Les valeurs déjà tapées survivent à un re-rendu.
    function syncShares(row) {
      var box = row.querySelector('[data-ef-comp-shares]');
      if (!box) return;
      var famsNow = selectedFamilies();
      var kept = {};
      box.querySelectorAll('[data-ef-comp-share]').forEach(function (i) { kept[i.getAttribute('data-ef-comp-share')] = i.value; });
      // Une seule famille : le bloc se cache mais garde ses entrées — une part tapée survit à un aller-retour de chip.
      if (famsNow.length < 2) { box.style.display = 'none'; return; }
      box.style.display = '';
      box.innerHTML = '<label style="' + lbl + '">Part de linéaire</label><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">'
        + famsNow.map(function (f) {
          return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#374151;">' + esc(f)
            + '<input data-ef-comp-share="' + esc(f) + '" value="' + esc(kept[f] || '') + '" inputmode="numeric" maxlength="3" style="' + inp + 'width:56px;padding:5px 6px;"> %</span>';
        }).join('') + '</div>';
    }
    function syncAllShares() { mount.querySelectorAll('[data-ef-comp-row]').forEach(syncShares); }
    var projetInput = q('[data-ef="polefams-projet"]');
    if (projetInput) projetInput.addEventListener('change', syncAllShares);
    function readComps() {
      var out = [];
      mount.querySelectorAll('[data-ef-comp-row]').forEach(function (row) {
        var t = row.querySelector('[data-ef-comp-type]'); var r = row.querySelector('[data-ef-comp-role]'); var l = row.querySelector('[data-ef-comp-label]');
        out.push({ key: row.getAttribute('data-ef-comp-key'), type: t ? t.value : '', role: r && r.value ? r.value : null, label: l ? String(l.value || '').trim() : '' });
      });
      return out;
    }
    // Les mesures de chaque composant — une rangée sans rien de saisi n'en produit pas. Les nombres
    // partent tels que tapés (virgule) : le serveur les lit en français et refuse ce qui n'en est pas.
    function readMeasures() {
      var comps = [];
      var err = null;
      mount.querySelectorAll('[data-ef-comp-row]').forEach(function (row) {
        if (err) return;
        var no = String((row.querySelector('[data-ef-comp-no]') || {}).value || '').trim();
        var len = String((row.querySelector('[data-ef-comp-len]') || {}).value || '').trim();
        var faces = String((row.querySelector('[data-ef-comp-faces]') || {}).value || '').trim();
        var name = String((row.querySelector('[data-ef-comp-label]') || {}).value || '').trim() || 'ce composant';
        var sharesBox = row.querySelector('[data-ef-comp-shares]');
        var shareInputs = sharesBox && sharesBox.style.display !== 'none' ? row.querySelectorAll('[data-ef-comp-share]') : [];
        var shares = null;
        if (shareInputs.length) {
          var filled = 0, sum = 0, list = [];
          shareInputs.forEach(function (i) {
            var v = String(i.value || '').trim();
            if (!v) return;
            filled++;
            var pct = Number(v.replace(',', '.'));
            sum += pct;
            list.push({ family: i.getAttribute('data-ef-comp-share'), share: Math.round(pct * 100) / 10000 });
          });
          if (filled && filled < shareInputs.length) { err = 'Part de linéaire de ' + name + ' : une part par famille, ou aucune.'; return; }
          if (filled && Math.abs(sum - 100) > 1) { err = 'Les parts de linéaire de ' + name + ' font ' + Math.round(sum) + ' % — elles doivent faire 100 %.'; return; }
          if (filled) shares = list;
        }
        if (!no && !len && !faces && !shares) return;
        var m = { component_key: row.getAttribute('data-ef-comp-key') };
        if (no) m.fixture_no = no;
        if (len) m.length_m = len;
        if (faces) m.faces = faces;
        if (shares) m.families_share = shares;
        comps.push(m);
      });
      return { ok: !err, error: err, components: comps };
    }
    var pbtn = q('[data-ef-pole-submit]');
    if (pbtn) pbtn.addEventListener('click', function () {
      var perr = q('[data-ef-pole-err]');
      var showErr = function (m) { if (perr) { perr.textContent = m; perr.style.display = ''; } };
      var name = val('polename');
      var famsSel = selectedFamilies();
      if (!name) { showErr('Il manque le nom du pôle.'); return; }
      if (!famsSel.length) { showErr(fams.length ? 'Choisissez au moins une famille — le périmètre du pôle.' : 'Écrivez au moins une famille — le périmètre du pôle.'); return; }
      var measures = ctypes.length ? readMeasures() : { ok: true, components: [] };
      if (!measures.ok) { showErr(measures.error); return; }
      var surface = val('polesurface');
      var spaceMeasures = (measures.components.length || surface)
        ? { components: measures.components, surface_m2: surface || undefined, source: 'saisie' } : undefined;
      // Une famille = un pôle (owner 28/08) — le formulaire refuse une famille déjà portée.
      for (var i = 0; i < famsSel.length; i++) {
        if (taken[famsSel[i]]) { showErr(famsSel[i] + ' appartient déjà au pôle « ' + taken[famsSel[i]] + ' » — une famille vit dans un seul pôle.'); return; }
      }
      if (perr) perr.style.display = 'none';
      pbtn.disabled = true; pbtn.textContent = 'Création…';
      var lever = val('polelever');
      fetch('/api/commitments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          location_id: opts.location_id, dispositif_nature: 'permanent',
          committed_action_text: name + (lever ? ' — ' + lever : ''),
          pole_families: famsSel,
          owner_person_name: val('poleowner') || null,
          dispositif_plus: val('poleplus') || null,
          dispositif_why: val('polewhy') || null,
          dispositif_resources: val('poleres') || null,
          components: ctypes.length ? readComps() : undefined,
          space_measures: spaceMeasures,
        }),
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) { pbtn.disabled = false; pbtn.textContent = 'Créer le pôle →'; showErr('Erreur : ' + ((j && j.error) || 'réessayez')); return; }
        mount.innerHTML = '<div style="font-size:13px;color:#166534;background:#E6F6F0;border-radius:8px;padding:12px 14px;line-height:1.6;">Pôle créé — lecture continue de ses familles dès vos prochaines ventes. <a href="/app/insightevent/engagement?id=' + encodeURIComponent(j.commitment_id) + '" style="color:#1D3BB3;font-weight:600;">Ouvrir le pôle →</a></div>';
        if (typeof opts.onCreated === 'function') opts.onCreated(j.commitment_id);
      }).catch(function () { pbtn.disabled = false; pbtn.textContent = 'Créer le pôle →'; showErr('Erreur, réessayez.'); });
    });
  }

  window.MSPoleForm = { render: render };
})();
