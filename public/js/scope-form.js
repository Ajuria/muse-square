// public/js/scope-form.js — « Ce que le dispositif vend » (owner 07/09, docs/dispositif-perimetre-mesure-spec.md).
// Module PARTAGÉ par « M'engager » (commit-form.js) et « Créer opération » (event-form.js), comme
// pole-form.js : jamais deux copies. Rend le bloc, lit le périmètre { kind, familles, pole_id,
// pole_nom, item_codes } — la lib serveur measuredScope.ts le valide.
//   MSScopeForm.render(mount, { families: [{category, avg_day_eur}], pole?: {id, nom, families}, photoItems?: [{item_code, item_description}], selected?: scope })
//   MSScopeForm.read(mount) → scope | null (rien de coché = pas de périmètre : le CA du lieu, comme avant)
//   MSScopeForm.setPole(mount, pole | null) → « les familles du pôle » pré-choisies (modifiables : D-03/09 + D6)
// Mots : « Ce que le dispositif vend » · « des familles » · « les familles du pôle » · « les articles de la
// photo » · « Ajouter famille de produits » (lexique, owner 07/09). Styles en ligne : HTML injecté.
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function frInt(n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString('fr-FR'); }
  var lbl = 'display:block;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#6B7280;margin-bottom:6px;';
  var kindStyle = 'display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#111827;cursor:pointer;margin-right:12px;';
  function chipStyle(on) {
    return 'font-size:12px;padding:5px 11px;border:1px solid ' + (on ? '#1D3BB3' : '#e5e7eb') + ';border-radius:999px;cursor:pointer;background:' + (on ? '#EEF2FF' : '#fff') + ';color:' + (on ? '#1D3BB3' : '#374151') + ';display:inline-flex;align-items:center;gap:5px;';
  }
  function famChip(nom, avg, on, nouvelle) {
    return '<span data-sc-fam="' + esc(nom) + '"' + (nouvelle ? ' data-sc-nouvelle="1"' : '') + ' data-sc-on="' + (on ? '1' : '0') + '" style="' + chipStyle(on) + '">' + esc(nom)
      + (avg != null ? '<span style="color:#6b7280;font-weight:400;">' + frInt(avg) + ' €/j</span>' : '') + '</span>';
  }
  function itemChip(code, desc, on) {
    return '<span data-sc-item="' + esc(code) + '" data-sc-on="' + (on ? '1' : '0') + '" style="' + chipStyle(on) + '">' + esc(desc || code) + '</span>';
  }
  function render(mount, opts) {
    opts = opts || {};
    var fams = Array.isArray(opts.families) ? opts.families : [];
    var sel = opts.selected || null;
    var selNames = {}; var selNew = {};
    (sel && sel.familles ? sel.familles : []).forEach(function (f) { var n = typeof f === 'string' ? f : f.nom; if (n) { selNames[n] = 1; if (f && f.nouvelle) selNew[n] = 1; } });
    var known = {}; fams.forEach(function (f) { known[f.category] = 1; });
    var extra = Object.keys(selNames).filter(function (n) { return !known[n]; });
    var items = Array.isArray(opts.photoItems) ? opts.photoItems : [];
    var selItems = {}; (sel && sel.item_codes ? sel.item_codes : []).forEach(function (c) { selItems[c] = 1; });
    var kind = sel ? sel.kind : 'familles';
    mount.innerHTML = ''
      + '<div data-sc-root data-sc-kind="' + esc(kind) + '" data-sc-pole-id="' + esc(opts.pole && opts.pole.id || (sel && sel.pole_id) || '') + '" data-sc-pole-nom="' + esc(opts.pole && opts.pole.nom || (sel && sel.pole_nom) || '') + '">'
      + '<label style="' + lbl + '">Ce que le dispositif vend</label>'
      + '<div data-sc-kinds style="margin-bottom:8px;">'
        + '<label style="' + kindStyle + '"><input type="radio" name="sc-kind" value="familles" data-sc-kind-opt' + (kind === 'familles' ? ' checked' : '') + '> des familles</label>'
        + '<label data-sc-kind-pole style="' + kindStyle + (opts.pole || kind === 'pole' ? '' : 'display:none;') + '"><input type="radio" name="sc-kind" value="pole" data-sc-kind-opt' + (kind === 'pole' ? ' checked' : '') + '> les familles du pôle</label>'
        + (items.length ? '<label style="' + kindStyle + '"><input type="radio" name="sc-kind" value="articles" data-sc-kind-opt' + (kind === 'articles' ? ' checked' : '') + '> les articles de la photo</label>' : '')
      + '</div>'
      + '<div data-sc-fams style="display:flex;gap:6px;flex-wrap:wrap;' + (kind === 'articles' ? 'display:none;' : '') + '">'
        + fams.map(function (f) { return famChip(f.category, f.avg_day_eur, !!selNames[f.category], false); }).join('')
        + extra.map(function (n) { return famChip(n, null, true, !!selNew[n]); }).join('')
      + '</div>'
      + '<div data-sc-add style="display:flex;gap:6px;align-items:center;margin-top:8px;' + (kind === 'articles' ? 'display:none;' : '') + '">'
        + '<input data-sc-new aria-label="Ajouter famille de produits" maxlength="120" style="flex:1;min-width:0;font:inherit;font-size:12.5px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;">'
        + '<button type="button" data-sc-add-btn style="font:inherit;font-size:12px;font-weight:600;color:#1D3BB3;background:#fff;border:1px solid #1D3BB3;border-radius:8px;padding:6px 10px;cursor:pointer;white-space:nowrap;">Ajouter famille de produits</button>'
      + '</div>'
      + (items.length ? '<div data-sc-items style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;' + (kind === 'articles' ? '' : 'display:none;') + '">'
        + items.map(function (it) { return itemChip(it.item_code, it.item_description, sel && sel.kind === 'articles' ? !!selItems[it.item_code] : true); }).join('') + '</div>' : '')
      + '</div>';
    wire(mount);
    if (opts.pole) setPole(mount, opts.pole, !!(sel && sel.kind !== 'pole'));
  }
  function root(mount) { return mount.querySelector('[data-sc-root]'); }
  function paint(el, on) { el.setAttribute('data-sc-on', on ? '1' : '0'); el.setAttribute('style', chipStyle(on)); }
  function showKind(mount, kind) {
    var r = root(mount); if (!r) return;
    r.setAttribute('data-sc-kind', kind);
    var fams = r.querySelector('[data-sc-fams]'), add = r.querySelector('[data-sc-add]'), items = r.querySelector('[data-sc-items]');
    if (fams) fams.style.display = kind === 'articles' ? 'none' : 'flex';
    if (add) add.style.display = kind === 'articles' ? 'none' : 'flex';
    if (items) items.style.display = kind === 'articles' ? 'flex' : 'none';
    r.querySelectorAll('[data-sc-kind-opt]').forEach(function (i) { i.checked = i.value === kind; });
  }
  function addFamily(mount, nom) {
    var r = root(mount); var fams = r && r.querySelector('[data-sc-fams]'); if (!fams) return;
    nom = String(nom || '').replace(/\s+/g, ' ').trim().slice(0, 120); if (!nom) return;
    var existing = fams.querySelector('[data-sc-fam="' + nom.replace(/"/g, '&quot;') + '"]');
    if (existing) { paint(existing, true); return; }
    fams.insertAdjacentHTML('beforeend', famChip(nom, null, true, true));
    var chip = fams.lastElementChild; chip.addEventListener('click', function () { paint(chip, chip.getAttribute('data-sc-on') !== '1'); });
  }
  function wire(mount) {
    var r = root(mount); if (!r) return;
    r.querySelectorAll('[data-sc-fam],[data-sc-item]').forEach(function (chip) {
      chip.addEventListener('click', function () { paint(chip, chip.getAttribute('data-sc-on') !== '1'); if (chip.hasAttribute('data-sc-fam') && r.getAttribute('data-sc-kind') === 'pole') showKind(mount, 'familles'); });
    });
    r.querySelectorAll('[data-sc-kind-opt]').forEach(function (i) { i.addEventListener('change', function () { if (i.checked) showKind(mount, i.value); }); });
    var inp = r.querySelector('[data-sc-new]'), btn = r.querySelector('[data-sc-add-btn]');
    var add = function () { addFamily(mount, inp.value); inp.value = ''; if (r.getAttribute('data-sc-kind') === 'pole') showKind(mount, 'familles'); };
    if (btn) btn.addEventListener('click', add);
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  }
  // Un pôle rattaché propose ses familles (pré-choisies, modifiables) ; « Aucun » rend la main.
  function setPole(mount, pole, keepKind) {
    var r = root(mount); if (!r) return;
    var lab = r.querySelector('[data-sc-kind-pole]');
    if (!pole || !pole.families || !pole.families.length) {
      // « Aucun » rend la main : les familles que le pôle avait cochées se décochent.
      if (r.getAttribute('data-sc-kind') === 'pole') r.querySelectorAll('[data-sc-fam]').forEach(function (chip) { paint(chip, false); });
      r.setAttribute('data-sc-pole-id', ''); r.setAttribute('data-sc-pole-nom', '');
      if (lab) lab.style.display = 'none';
      if (r.getAttribute('data-sc-kind') === 'pole') showKind(mount, 'familles');
      return;
    }
    r.setAttribute('data-sc-pole-id', pole.id || ''); r.setAttribute('data-sc-pole-nom', pole.nom || '');
    if (lab) lab.style.display = '';
    r.querySelectorAll('[data-sc-fam]').forEach(function (chip) { paint(chip, pole.families.indexOf(chip.getAttribute('data-sc-fam')) >= 0); });
    pole.families.forEach(function (n) { if (!r.querySelector('[data-sc-fam="' + String(n).replace(/"/g, '&quot;') + '"]')) addFamily(mount, n); });
    if (!keepKind) showKind(mount, 'pole');
  }
  function read(mount) {
    var r = root(mount); if (!r) return null;
    var kind = r.getAttribute('data-sc-kind') || 'familles';
    if (kind === 'articles') {
      var codes = Array.prototype.map.call(r.querySelectorAll('[data-sc-item][data-sc-on="1"]'), function (c) { return c.getAttribute('data-sc-item'); });
      return codes.length ? { kind: 'articles', item_codes: codes } : null;
    }
    var fams = Array.prototype.map.call(r.querySelectorAll('[data-sc-fam][data-sc-on="1"]'), function (c) {
      var o = { nom: c.getAttribute('data-sc-fam') }; if (c.getAttribute('data-sc-nouvelle') === '1') o.nouvelle = true; return o;
    });
    if (!fams.length) return null;
    if (kind === 'pole' && r.getAttribute('data-sc-pole-id')) return { kind: 'pole', familles: fams, pole_id: r.getAttribute('data-sc-pole-id'), pole_nom: r.getAttribute('data-sc-pole-nom') || null };
    return { kind: 'familles', familles: fams };
  }
  window.MSScopeForm = { render: render, read: read, setPole: setPole, addFamily: addFamily };
})();
