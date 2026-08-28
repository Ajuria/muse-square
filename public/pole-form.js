// MSPoleForm — LE formulaire de création de pôle, module PARTAGÉ (vue équipe inc 9c).
// Extrait VERBATIM du panneau « Pôle — dispositif permanent » d'event-form.js (owner
// 27/08) pour être servi par DEUX surfaces sans copie : la bascule de Nouvelle opération
// (event-form.js) et l'onglet Pôles du Compte (profile.astro). Toute évolution du
// formulaire se fait ICI, jamais dans un appelant.
// Libellé 28/08 (owner) : « Familles de produits & services ». Garde 28/08 : une famille
// vit dans UN SEUL pôle (opts.takenFamilies = {famille: nom du pôle qui la porte}).
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
    mount.innerHTML = ''
      + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Nom du pôle</label><input data-ef="polename" style="' + inp + '" maxlength="120"></div>'
      + '<div style="flex:1;"><label style="' + lbl + '">Responsable(s)</label>'
      + (owners.length ? '<select data-ef="poleowner" style="' + inp + 'cursor:pointer;">' + owners.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>' : '<input data-ef="poleowner" style="' + inp + '" placeholder="Une personne de l’équipe">')
      + '</div></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Familles de produits &amp; services — depuis vos ventes</label>'
      + (fams.length ? '<div data-ef-polefams style="display:flex;gap:6px;flex-wrap:wrap;">' + fams.map(function (f) { return famChip(f.category, f.avg_day_eur); }).join('') + '</div>'
        : '<div style="font-size:12px;color:#9CA3AF;">Aucune famille dans vos ventes pour l’instant — le pôle a besoin d’un périmètre mesurable.</div>')
      + '<div style="font-size:11px;color:#9CA3AF;margin-top:5px;">Sans terme : lecture continue de ses familles vs votre résultat habituel — pas de verdict.</div></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Description du dispositif</label><textarea data-ef="polelever" style="' + poleTa + '" placeholder="Ce que le pôle fait au quotidien"></textarea></div>'
      + '<div style="margin-top:10px;"><label style="' + lbl + '">Ressource(s)</label><input data-ef="poleres" style="' + inp + '"></div>'
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
      });
    });
    var pbtn = q('[data-ef-pole-submit]');
    if (pbtn) pbtn.addEventListener('click', function () {
      var perr = q('[data-ef-pole-err]');
      var showErr = function (m) { if (perr) { perr.textContent = m; perr.style.display = ''; } };
      var name = val('polename');
      var famsSel = Object.keys(poleSel).filter(function (k) { return poleSel[k]; });
      if (!name) { showErr('Il manque le nom du pôle.'); return; }
      if (!famsSel.length) { showErr('Choisissez au moins une famille — le périmètre du pôle.'); return; }
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
