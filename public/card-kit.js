// public/card-kit.js — SHARED render kit for the card-specific deep pages ("Consulter la source").
// SINGLE SOURCE of the card-detail components + renderers, loaded BOTH by insight.astro AND by the
// offline render harness (scratchpad/card-harness.html) — so what I verify is exactly what ships.
// Each render*(json) is PURE: returns an HTML string, no fetch, no DOM writes. The page loaders do
// the fetch and set container.innerHTML = MSCardKit.render*(json). Numbers arrive pre-rounded from the
// endpoints; the kit only formats (fr locale) and lays out.
(function () {
  "use strict";
  function esc(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function frInt(n) { try { return Number(n).toLocaleString('fr-FR'); } catch (e) { return String(n); } }

  /* Lexique regle 6 : jours en toutes lettres - jamais d'abreviation. */
  var WX_DOW_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function wxDayLabel(iso) {
    try { var p = String(iso).split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      return WX_DOW_FR[d.getUTCDay()] + ' ' + p[2] + '/' + p[1]; } catch (e) { return String(iso); }
  }
  function msPct(n) { return n == null ? '' : ((n >= 0 ? '+' : '−') + String(Math.abs(n)).replace('.', ',') + ' %'); }
  function msRate(n) { return n == null ? '—' : ((Number(n) * 100).toFixed(1).replace('.', ',') + ' %'); }
  function msEur2(n) { return n == null ? '—' : (Number(n).toFixed(2).replace('.', ',') + ' €'); }
  function msDateFr(iso) { try { var pp = String(iso).split('-'); return pp[2] + '/' + pp[1] + '/' + pp[0]; } catch (e) { return String(iso); } }
  // Family-aware "what changed" placeholder for the Ajuster move-note (structure universal, hint bespoke).
  function _moveHint(at) {
    var s = String(at || '');
    if (/^(sales_|footfall_vs_basket|offering_)/.test(s)) return 'ex. offre, créneau, prix, mise en avant en caisse…';
    if (/^(competit|competition|same_bucket)/.test(s)) return 'ex. canal de visibilité, différenciateur, cible…';
    if (/^(weather|extended_bad)/.test(s)) return 'ex. stock, staffing, mise en avant…';
    if (/^(tourist|tourism|foreign)/.test(s)) return 'ex. offre, langues, canaux touristiques…';
    if (/^(commercial_event|mega_event)/.test(s)) return 'ex. activation, offre, communication…';
    if (/^(ft_|best_day)/.test(s)) return 'ex. staffing, offre, communication…';
    return 'ex. offre, canal, timing…';
  }
  function msDeltaCell(pct, eurDelta) {
    if (pct == null && eurDelta == null) return { v: 'stable', color: '#9CA3AF' };
    var up = (eurDelta != null ? eurDelta : pct) >= 0;
    var v = eurDelta != null ? ((up ? '+' : '−') + frInt(Math.abs(eurDelta)) + ' €/j') : msPct(pct);
    return { v: v, color: up ? '#0F6E56' : '#B91C1C', bold: true };
  }
  function msTable(cols, rows) {
    var h = '<thead><tr style="font-size:11px;color:#9CA3AF;">';
    for (var c = 0; c < cols.length; c++) h += '<th style="text-align:' + (cols[c].align || (c === 0 ? 'left' : 'right')) + ';font-weight:400;padding:0 0 2px' + (c === 0 ? '' : ' 0 14px') + ';">' + esc(cols[c].label || '') + '</th>';
    h += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      var cells = (rows[r] && rows[r].cells) || [];
      h += '<tr style="border-top:0.5px solid #F3F4F6;">';
      for (var k = 0; k < cells.length; k++) {
        var cell = cells[k] || {};
        var align = cols[k] ? (cols[k].align || (k === 0 ? 'left' : 'right')) : 'left';
        var color = cell.color || (cell.bold ? '#111827' : (k === 0 ? '#111827' : '#6B7280'));
        // tip (27/08, plan de période) : le détail « kitchen » (mélanges, comptes) vit au
        // SURVOL — la cellule reste nue (règle owner), le ⓘ signale sa présence.
        h += '<td' + (cell.tip ? ' title="' + esc(cell.tip) + '"' : '') + ' style="padding:7px 0' + (k === 0 ? '' : ' 7px 14px') + ';text-align:' + align + ';color:' + color + ';' + (cell.bold ? 'font-weight:600;' : '') + (cell.tip ? 'cursor:help;' : '') + '">'
          + esc(cell.v == null ? '' : String(cell.v))
          + (cell.sub ? '<div style="font-size:10.5px;color:#9CA3AF;font-weight:400;">' + esc(cell.sub) + (cell.tip ? ' \u24d8' : '') + '</div>' : (cell.tip ? '<div style="font-size:10.5px;color:#9CA3AF;font-weight:400;">\u24d8</div>' : ''))
          + '</td>';
      }
      h += '</tr>';
    }
    return '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:10px;">' + h + '</tbody></table>';
  }
  function msMovers(up, down, upLabel, downLabel) {
    function col(items, label, bg, lc, tc) {
      if (!items || !items.length) return '';
      var t = items.map(function (p) { return esc(p.category) + ' ' + msPct(p.pct); }).join(' · ');
      return '<div style="flex:1;min-width:150px;background:' + bg + ';border-radius:8px;padding:9px 11px;"><div style="font-size:11px;color:' + lc + ';">' + esc(label) + '</div><div style="font-size:12.5px;color:' + tc + ';margin-top:3px;line-height:1.6;">' + t + '</div></div>';
    }
    if ((!up || !up.length) && (!down || !down.length)) return '';
    return '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
      + col(up, upLabel || 'Portent la hausse', '#ECFDF5', '#0F6E56', '#065F46')
      + col(down, downLabel || 'Ne suit pas', '#FEF2F2', '#B91C1C', '#7F1D1D')
      + '</div>';
  }
  // Shared dated timeline strip (weather forecast, event calendar). cells:[{top,mid,highlight,tone}]
  // tone: 'danger'|'ok'|'warn'|'default'. Horizontal, scrolls on overflow.
  function msStrip(cells) {
    if (!cells || !cells.length) return '';
    var TONE = { danger:{bg:'#FEF2F2',bd:'#FECACA',top:'#B91C1C',mid:'#B91C1C'}, ok:{bg:'#ECFDF5',bd:'#A7F3D0',top:'#0F6E56',mid:'#0F6E56'}, warn:{bg:'#FFFBEB',bd:'#FDE68A',top:'#B45309',mid:'#B45309'}, default:{bg:'',bd:'',top:'#9CA3AF',mid:'#B45309'} };
    var out = '<div style="display:flex;gap:5px;margin-bottom:16px;overflow-x:auto;">';
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i] || {}, t = TONE[c.tone] || TONE.default;
      var box = c.highlight ? ('background:' + t.bg + ';border:0.5px solid ' + t.bd + ';') : '';
      out += '<div style="flex:1;min-width:54px;text-align:center;padding:8px 2px;border-radius:8px;' + box + '">'
        + '<div style="font-size:10.5px;color:' + (c.highlight ? t.top : '#9CA3AF') + ';">' + esc(c.top || '') + '</div>'
        + '<div style="font-size:13px;font-weight:600;color:' + (c.highlight ? t.mid : '#B45309') + ';margin-top:5px;">' + esc(c.mid == null ? '' : String(c.mid)) + '</div>'
      + '</div>';
    }
    return out + '</div>';
  }
  var _msSortSeq = 0, _msSortReg = {};
  function msSortTable(cols, rows, defaultKey) {
    var id = 'mss' + (++_msSortSeq);
    _msSortReg[id] = { cols: cols, rows: rows || [], sortKey: defaultKey || null, dir: -1 };
    return '<div data-mss="' + id + '">' + _msSortRender(id) + '</div>';
  }
  function _msSortRender(id) {
    var st = _msSortReg[id]; if (!st) return '';
    var cols = st.cols, rows = st.rows.slice();
    if (st.sortKey) rows.sort(function (x, y) { var a = x[st.sortKey], b = y[st.sortKey]; a = (a == null ? -Infinity : a); b = (b == null ? -Infinity : b); return (a < b ? -1 : (a > b ? 1 : 0)) * st.dir; });
    var h = '<table style="width:100%;font-size:13px;border-collapse:collapse;margin-top:10px;"><thead><tr style="font-size:11px;color:#9CA3AF;">';
    for (var c = 0; c < cols.length; c++) {
      var col = cols[c], al = col.align || (c === 0 ? 'left' : 'right'), sortable = !!col.key;
      var arrow = (sortable && st.sortKey === col.key) ? (st.dir < 0 ? ' ▾' : ' ▴') : (sortable ? ' ⇅' : '');
      h += '<th style="text-align:' + al + ';font-weight:400;padding:0 0 4px' + (c === 0 ? '' : ' 0 14px') + ';' + (sortable ? 'cursor:pointer;user-select:none;' : '') + '"' + (sortable ? (' data-mss-sort="' + id + '" data-mss-key="' + col.key + '"') : '') + '>' + esc(col.label || '') + arrow + '</th>';
    }
    h += '</tr></thead><tbody>';
    for (var r = 0; r < rows.length; r++) {
      h += '<tr style="border-top:0.5px solid #F3F4F6;">';
      for (var k = 0; k < cols.length; k++) {
        var cc = cols[k], al2 = cc.align || (k === 0 ? 'left' : 'right');
        var cell = cc.render ? cc.render(rows[r]) : { v: rows[r][cc.key] };
        var color = cell.color || (cell.bold ? '#111827' : (k === 0 ? '#111827' : '#6B7280'));
        h += '<td style="padding:7px 0' + (k === 0 ? '' : ' 7px 14px') + ';text-align:' + al2 + ';color:' + color + ';' + (cell.bold ? 'font-weight:600;' : '') + '">' + esc(cell.v == null ? '' : String(cell.v)) + (cell.sub ? '<div style="font-size:10.5px;color:#9CA3AF;font-weight:400;">' + esc(cell.sub) + '</div>' : '') + '</td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table>';
  }
  if (typeof document !== 'undefined') document.addEventListener('click', function (e) {
    var th = (e.target && e.target.closest) ? e.target.closest('[data-mss-sort]') : null;
    if (!th) return;
    var id = th.getAttribute('data-mss-sort'), key = th.getAttribute('data-mss-key'), st = _msSortReg[id];
    if (!st) return;
    if (st.sortKey === key) st.dir = -st.dir; else { st.sortKey = key; st.dir = -1; }
    var wrap = document.querySelector('[data-mss="' + id + '"]');
    if (wrap) wrap.innerHTML = _msSortRender(id);
  });
  function msDecision(title, lines) {
    // Each line carries class + data attrs (Day-2 chat commit, 16/07): purely additive markers so the
    // CHAT surface can decorate décision lines with an « M'engager » affordance by delegation. No
    // visual change anywhere; other surfaces ignore the attributes.
    var inner = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i] || {};
      inner += '<div class="ms-decision-line" data-dl-head="' + esc(l.head || '') + '" data-dl-body="' + esc(l.body || '') + '" style="' + (i > 0 ? 'margin-top:7px;' : '') + '">'
        + (l.head ? '<span style="font-weight:700;">' + esc(l.head) + ' — </span>' : '')
        + esc(l.body || '') + '</div>';
    }
    var head = title ? '<div style="font-weight:700;margin-bottom:6px;">' + esc(title) + '</div>' : '';
    return '<div class="ms-decision" style="margin-top:14px;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:9px;padding:11px 13px;font-size:13px;line-height:1.5;color:#1D3BB3;">' + head + inner + '</div>';
  }
  var WS_DOW_FR = { 0: 'dimanches', 1: 'lundis', 2: 'mardis', 3: 'mercredis', 4: 'jeudis', 5: 'vendredis', 6: 'samedis' };
  function salesLevier(movers, isDown, jour) {
    var neg = movers.filter(function (m) { return m.delta_eur < 0; }).sort(function (a, b) { return a.delta_eur - b.delta_eur; });
    var pos = movers.filter(function (m) { return m.delta_eur > 0; }).sort(function (a, b) { return b.delta_eur - a.delta_eur; });
    function eur(n) { return frInt(Math.abs(n)) + ' €'; }
    // NEUTRE (journée dédiée 18/08) : sans signal tiré ce jour-là, aucune direction n'est
    // affirmée — le plus gros écart est DÉCRIT, jamais prescrit.
    if (isDown == null) {
      var big = movers.slice().sort(function (a, b) { return Math.abs(b.delta_eur) - Math.abs(a.delta_eur); })[0];
      if (!big) return '';
      var s0 = 'Plus gros écart du jour : ' + big.category + ' (' + (big.delta_eur >= 0 ? '+' : '\u2212') + eur(big.delta_eur) + ' vs la médiane de vos ' + jour + 's)';
      var other = movers.slice().sort(function (a, b) { return Math.abs(b.delta_eur) - Math.abs(a.delta_eur); })[1];
      if (other) s0 += ' · puis ' + other.category + ' (' + (other.delta_eur >= 0 ? '+' : '\u2212') + eur(other.delta_eur) + ')';
      return s0 + '. Aucun signal CA tir\u00e9 ce jour-l\u00e0 \u2014 lecture descriptive.';
    }
    if (isDown) {
      if (!neg.length) return '';
      var s = 'La baisse vient surtout de ' + neg[0].category + ' (-' + eur(neg[0].delta_eur) + ')';
      if (neg[1]) s += ' et de ' + neg[1].category + ' (-' + eur(neg[1].delta_eur) + ')';
      if (pos.length) s += ' — ' + pos[0].category + ' a tenu';
      return s + '. Vérifiez la disponibilité et la mise en avant de ' + neg[0].category + '.';
    }
    if (!pos.length) return '';
    var s2 = 'La hausse est portée par ' + pos[0].category + ' (+' + eur(pos[0].delta_eur) + ')';
    if (pos[1]) s2 += ' et ' + pos[1].category + ' (+' + eur(pos[1].delta_eur) + ')';
    return s2 + '. Vérifiez le stock de ' + pos[0].category + ' — elle ne doit pas manquer — et mettez-la en avant sur vos prochains ' + jour + '.';
  }

  // ---- Renderers (pure: json -> HTML) ----
  function renderWeather(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de condition météo marquée ce jour.</div>';
    var condFr = (j.condition && j.condition.label_fr) ? j.condition.label_fr : 'cette météo';
    var html = '';
    if (j.forecast && j.forecast.length) {
      var _feat = (j.condition && j.condition.feature) || 'heat';
      var wxStripVal = function (f) {
        if (_feat === 'wind') return f.wind != null ? Math.round(f.wind) + ' km/h' : '';
        if (_feat === 'rain' || _feat === 'snow') return f.rain_prob != null ? Math.round(f.rain_prob) + ' %' : '';
        return f.tmax != null ? Math.round(f.tmax) + '°' : '';
      };
      html += msStrip(j.forecast.map(function (f) { return { top: wxDayLabel(f.date), mid: wxStripVal(f), highlight: !!f.is_extreme, tone: 'danger' }; }));
    }
    if (j.chain) {
      var ch = j.chain;
      html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;">Vos journées de ' + esc(condFr) + ' (niveau 2+, ' + ch.n_cond + ' j) vs votre jour type :</div>'
        + msTable(
            [{ label: '' }, { label: 'jours ' + condFr }, { label: 'jour type' }, { label: 'écart' }],
            [
              { cells: [{ v: 'Fréquentation', bold: true }, { v: frInt(ch.visitors.cond), bold: true }, { v: frInt(ch.visitors.typical), color: '#9CA3AF' }, msDeltaCell(ch.visitors.pct, null)] },
              { cells: [{ v: 'Conversion' }, { v: msRate(ch.conversion.cond) }, { v: msRate(ch.conversion.typical), color: '#9CA3AF' }, msDeltaCell(null, null)] },
              { cells: [{ v: 'Panier moyen' }, { v: msEur2(ch.basket.cond) }, { v: msEur2(ch.basket.typical), color: '#9CA3AF' }, msDeltaCell(null, null)] },
              { cells: [{ v: 'CA', bold: true }, { v: frInt(ch.revenue.cond) + ' €', bold: true }, { v: frInt(ch.revenue.typical) + ' €', color: '#9CA3AF' }, msDeltaCell(ch.revenue.pct, ch.revenue.eur_per_day)] }
            ]
          )
        + '<div style="font-size:11px;color:#9CA3AF;margin-top:7px;line-height:1.5;">L\'effet passe par la fréquentation, pas le panier. ' + ch.n_cond + ' jours mesurés' + (ch.n_extreme < 5 ? ' · palier extrême quasi sans historique (' + ch.n_extreme + ' j)' : '') + '.</div>';
    } else {
      html += '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Historique trop court pour chiffrer l\'effet de ' + esc(condFr) + ' — prévisions seules ci-dessus.</div>';
    }
    var up = (j.products && j.products.up) ? j.products.up.slice(0, 3) : [];
    var down = (j.products && j.products.down) ? j.products.down.slice(0, 2) : [];
    if (up.length || down.length) {
      var _cav = (j.cond_days != null && j.cond_days < 5) ? ' (sur ' + j.cond_days + ' jours ' + esc(condFr) + ' — indicatif)' : '';
      html += '<div style="font-size:12px;color:#6B7280;margin:18px 0 8px;">Ce qui bouge dans la vente' + _cav + ' :</div>' + msMovers(up, down);
    }
    var peakExtreme = j.peak && j.peak.lvl >= 3;
    var decLines = [];
    if (j.condition && j.condition.feature === 'heat') decLines.push({ head: 'Testez une offre froide', body: 'Une boisson fraîche capte une demande que votre carte chaude ignore — quasi pas d\'historique, à tester.' });
    if (down.length) decLines.push({ head: 'Activez ' + down[0].category, body: 'Ne profite pas de ' + condFr + ' (' + msPct(down[0].pct) + ') : remise ou mise en avant plutôt que stagnation.' });
    if (peakExtreme && j.chain && j.chain.n_extreme < 5) decLines.push({ head: 'Le ' + wxDayLabel(j.peak.date) + ' (' + (j.peak.tmax != null ? Math.round(j.peak.tmax) + '°' : '') + ')', body: 'Votre palier le plus chaud, quasi sans historique (' + j.chain.n_extreme + ' j) — n\'extrapolez pas.' });
    if (decLines.length) html += msDecision('La décision', decLines);
    return html;
  }
  function renderSales(j, isDown, date) {
    // Repli (famille sales, 18/08) : sans isDown explicite (consommateur par question), la
    // direction vient du SIGNAL TIRÉ résolu par le provider (j.is_down) — jamais re-dérivée.
    if (isDown === undefined || isDown === null) isDown = (j && j.is_down === true) ? true : (j && j.is_down === false) ? false : null;
    if (!j || !j.ok || !j.found || !j.movers || !j.movers.length) {
      return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Mix produit indisponible pour ce jour — lecture au volume et au panier ci-dessous.</div>';
    }
    var jour = WS_DOW_FR[new Date(String(date) + 'T00:00:00Z').getUTCDay()] || 'jours comparables';
    var out = '<div style="font-size:11.5px;color:#9CA3AF;margin-bottom:10px;">Chaque catégorie ce jour vs la médiane de vos ' + esc(jour) + ' (n=' + (j.n_comparable_days || 0) + ').</div>';
    var scols = [
      { label: 'Catégorie', render: function (mv) { return { v: mv.category, bold: true, sub: (mv.share_pct != null ? ('n°' + mv.rank + ' · ' + mv.share_pct + ' % du CA') : null) }; } },
      { label: 'CA (€)', key: 'day_eur', render: function (mv) { return { v: frInt(mv.day_eur) + ' €', bold: true }; } },
      { label: 'Habituel', render: function (mv) { return { v: frInt(mv.median_eur) + ' €', color: '#9CA3AF' }; } },
      { label: 'Évolution', key: 'delta_pct', render: function (mv) { var up = (mv.delta_eur >= 0); return { v: (mv.delta_pct == null ? '—' : msPct(mv.delta_pct)), color: up ? '#0F6E56' : '#B91C1C', bold: true }; } }
    ];
    out += msSortTable(scols, j.movers, 'day_eur');
    var lev = salesLevier(j.movers, isDown, jour);
    if (lev) out += msDecision('', [{ head: 'Le levier', body: lev }]);
    return out;
  }
  function renderAudience(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#9CA3AF;">Profil audience indisponible.</div>';
    var a = j.audience, rows = [];
    if (a.who && a.who.length) rows.push(['Qui', a.who.join(', ')]);
    if (a.catchment) rows.push(['Zone de chalandise', a.catchment]);
    // "Pic d'affluence" (foot traffic / BestTime) — deliberately NOT "Heure de pointe": this is when the
    // most PEOPLE are around, not when you SELL. For many venues the two diverge (e.g. café: sales peak
    // in the morning, affluence in the evening), so the label must never imply a selling peak.
    if (a.peak_hour != null) rows.push(['Pic d’affluence', a.peak_hour + 'h' + (a.avg_busyness_pct != null ? ' · fréquentation moy. ' + a.avg_busyness_pct + ' %' : '')]);
    if (a.dwell_max != null) rows.push(['Durée de visite', (a.dwell_min != null ? a.dwell_min + '–' : '') + a.dwell_max + ' min']);
    if (a.availability_label) rows.push(['Disponibilité du jour', a.availability_label]);
    if (!rows.length) return '<div style="font-size:12.5px;color:#9CA3AF;">Profil audience indisponible.</div>';
    var out = '';
    for (var i = 0; i < rows.length; i++) out += '<div style="display:flex;gap:12px;padding:7px 0;' + (i ? 'border-top:0.5px solid #F3F4F6;' : '') + '"><div style="font-size:12px;color:#6B7280;min-width:130px;">' + esc(rows[i][0]) + '</div><div style="font-size:13px;color:#111827;">' + esc(rows[i][1]) + '</div></div>';
    return out;
  }
  function renderTrackRecord(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Aucune action passée mesurée sur ce type — votre premier engagement nourrira ce suivi.</div>';
    var beat = j.beat || 0, done = j.done || 0;
    var effTxt = (j.avg_effect_pct != null) ? (', effet moyen ' + (j.avg_effect_pct >= 0 ? '+' : '−') + String(Math.abs(j.avg_effect_pct)).replace('.', ',') + ' %') : '';
    var col = (beat >= (done - beat)) ? '#0F6E56' : '#B91C1C';
    var out = '<div style="font-size:13px;line-height:1.55;color:#111827;">Sur ce type d’action, vous avez tenu ' + done + ' engagement' + (done > 1 ? 's' : '') + ' — <span style="font-weight:700;color:' + col + ';">' + beat + '/' + done + '</span> ont battu la référence' + effTxt + '.</div>';
    if (j.last_resolved) out += '<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">Dernière mesure : ' + esc(msDateFr(j.last_resolved)) + '.</div>';
    return out;
  }

  function eventDist(m) {
    if (m == null) return '—';
    return m >= 1000 ? ((Math.round(m / 100) / 10).toString().replace('.', ',') + ' km') : (Math.round(m) + ' m');
  }
  function renderEvents(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de signal événementiel à proximité.</div>';
    var TAG = { cannibalise: { label: 'cannibalise', color: '#B91C1C' }, capitaliser: { label: 'à capitaliser', color: '#0F6E56' }, neutre: { label: 'neutre', color: '#9CA3AF' } };
    var html = '';
    if (j.commercial_event) {
      html += '<div style="font-size:13px;color:#374151;margin-bottom:10px;line-height:1.55;"><span style="font-weight:600;color:#0F6E56;">Temps fort « ' + esc(j.commercial_event.name) + ' » en cours</span> — le flux est là. Autour de vous :</div>';
      if (j.contest_lead) html += '<div style="font-size:12.5px;color:#6B7280;margin-bottom:6px;line-height:1.5;">' + esc(j.contest_lead) + '</div>';
    } else if (j.contest_lead) {
      html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.contest_lead) + '</div>';
    }
    if (j.competitors && j.competitors.length) {
      var rows = j.competitors.map(function (e) {
        var tg = TAG[e.tag] || TAG.neutre;
        return { cells: [
          { v: e.name, bold: true, sub: e.venue || null },
          { v: e.date ? msDateFr(e.date) : '—', color: '#6B7280' },
          { v: eventDist(e.distance_m), color: '#6B7280' },
          { v: tg.label, color: tg.color, bold: true, sub: e.overlap_pct != null ? ('aud. ' + e.overlap_pct + ' %') : null }
        ] };
      });
      html += msTable([{ label: 'Événement' }, { label: 'Date' }, { label: 'Distance' }, { label: 'Statut' }], rows);
    }
    html += '<div style="font-size:13px;font-weight:700;color:#111827;margin-top:18px;">Comme les vôtres</div>';
    var lm = j.like_mine || {};
    if (lm.found && lm.events && lm.events.length) {
      var lrows = lm.events.map(function (e) { return { cells: [{ v: e.name, bold: true, sub: e.venue || null }, { v: e.date ? msDateFr(e.date) : '—', color: '#6B7280' }, { v: e.scale || '—', color: '#6B7280' }] }; });
      html += msTable([{ label: 'Événement comparable' }, { label: 'Date' }, { label: 'Ampleur' }], lrows);
    } else {
      html += '<div style="font-size:12.5px;color:#6B7280;margin-top:4px;line-height:1.5;">' + esc(lm.note || 'Aucun événement comparable détecté à proximité.') + '</div>';
    }
    if (lm.my_types && lm.my_types.length) html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' + lm.my_types.map(function (t) { return '<span style="font-size:11px;background:#F3F4F6;color:#374151;padding:3px 9px;border-radius:999px;">' + esc(t) + '</span>'; }).join('') + '</div>';
    if (lm.benchmark_note) html += '<div style="font-size:11px;color:#9CA3AF;margin-top:8px;line-height:1.5;">' + esc(lm.benchmark_note) + '</div>';
    if (j.calendar && j.calendar.length) {
      html += '<div style="font-size:13px;font-weight:700;color:#111827;margin-top:18px;">' + esc(j.calendar_title || 'Programmez une opération') + '</div>'
        + (j.calendar_note ? '<div style="font-size:12.5px;color:#374151;margin:4px 0 8px;line-height:1.55;">' + esc(j.calendar_note) + '</div>' : '')
        + msStrip(j.calendar.map(function (w) { return { top: w.label, mid: (w.count != null ? w.count : ''), highlight: (w.state === 'quiet' || w.state === 'busy'), tone: (w.state === 'quiet' ? 'ok' : (w.state === 'busy' ? 'warn' : 'default')) }; }));
    }
    if (j.impact) html += msImpactBlock(j.impact);
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    return html;
  }

  // Competitor (Bucket B) — "what are my competitors DOING that impacts me, and what do I do".
  // Truth-first: no meaningful overlap -> say it plainly (honest empty state), never fabricate rivalry.
  // Measured-impact section (engine v1, 16/07) — SHARED by renderEvents + renderCompetitor:
  // the density/activity-contrast verdicts measured on the venue's OWN days. Renders only when the
  // provider sent the block; absence-with-reason is shown honestly (cold start sees WHY).
  function msImpactBlock(impact) {
    var html = '<div style="font-size:13px;font-weight:700;color:#111827;margin-top:18px;">Impact mesuré sur votre CA</div>';
    if (impact.available && impact.rows && impact.rows.length) {
      html += impact.rows.map(function (r) {
        var col = r.measurable ? '#111827' : '#6B7280';
        return '<div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:6px 0;border-bottom:1px solid #F3F4F6;">'
          + '<span style="font-size:12.5px;color:#374151;">' + esc(r.label) + '</span>'
          + '<span style="text-align:right;"><span style="font-size:12.5px;font-weight:600;color:' + col + ';">' + esc(r.verdict_fr) + '</span>'
          + (r.detail_fr ? '<span style="display:block;font-size:11px;color:#9CA3AF;">' + esc(r.detail_fr) + '</span>' : '')
          + '</span></div>';
      }).join('');
      if (impact.note) html += '<div style="font-size:11px;color:#9CA3AF;margin-top:6px;line-height:1.5;">' + esc(impact.note) + '</div>';
    } else if (impact.reason_fr) {
      html += '<div style="font-size:12.5px;color:#6B7280;margin-top:4px;line-height:1.5;">' + esc(impact.reason_fr) + '</div>';
    }
    return html;
  }

  function renderCompetitor(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Aucune donnée concurrentielle.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:8px;">' + esc(j.lead) + '</div>';
    if (j.positioning) {
      var pg = j.positioning, inner = '';
      function _pl(label, val, col) { return '<div style="font-size:12.5px;line-height:1.6;color:#374151;"><span style="font-weight:600;color:' + col + ';">' + esc(label) + ' — </span>' + esc(val) + '</div>'; }
      if (pg.common_ground) inner += _pl('Terrain commun', pg.common_ground, '#111827');
      if (pg.my_edge) inner += _pl('Votre atout', pg.my_edge, '#0F6E56');
      if (pg.their_strength) inner += _pl('Le leur', pg.their_strength, '#B45309');
      if (inner) html += '<div style="background:#F9FAFB;border:0.5px solid #F3F4F6;border-radius:10px;padding:11px 13px;margin-bottom:8px;">' + inner + '</div>';
    }
    var moves = j.moves || [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i] || {};
      html += '<div style="padding:11px 0;border-top:0.5px solid #F3F4F6;">'
        + '<div style="font-size:13px;"><span style="font-weight:600;color:#111827;">' + esc(m.competitor) + '</span><span style="color:#9CA3AF;">'
          + (m.overlap_pct != null ? ' · aud. ' + m.overlap_pct + ' %' : '') + (m.date ? ' · ' + esc(msDateFr(m.date)) : '') + '</span></div>'
        + '<div style="font-size:13px;color:#374151;margin-top:3px;line-height:1.5;">' + esc(m.what) + '</div>'
        + (m.response ? '<div style="font-size:13px;color:#1D3BB3;margin-top:4px;line-height:1.5;"><span style="font-weight:700;">→ </span>' + esc(m.response) + '</div>' : '')
      + '</div>';
    }
    if (j.note) html += '<div style="font-size:12.5px;color:#6B7280;margin-top:' + (moves.length ? '14px' : '4px') + ';line-height:1.5;">' + esc(j.note) + '</div>';
    if (j.impact) html += msImpactBlock(j.impact);
    if (j.next_step) html += '<div style="font-size:13px;color:#1D3BB3;margin-top:10px;line-height:1.5;"><span style="font-weight:700;">Prochaine étape — </span>' + esc(j.next_step) + '</div>';
    return html;
  }

  // Tourism (Bucket B) — "who visits my region, who's surging, how do I capture them". Regional
  // foreign-nationality profile (volume + YoY) + in-season signal. Frames as "votre région", not "vos visiteurs".
  function tourNights(k) {
    if (k == null) return '—';
    return k >= 1000 ? ((Math.round(k / 100) / 10).toString().replace('.', ',') + ' M nuitées') : (frInt(Math.round(k)) + ' k nuitées');
  }
  function renderTourism(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de données touristiques pour votre région.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.countries_intro) html += '<div style="font-size:12px;color:#6B7280;margin:8px 0 0;line-height:1.5;">' + esc(j.countries_intro) + '</div>';
    if (j.countries && j.countries.length) {
      var rows = j.countries.map(function (c) {
        var hot = c.yoy_pct != null && c.yoy_pct >= 20;
        var yoyStr = c.yoy_pct != null ? ((c.yoy_pct >= 0 ? '+' : '−') + Math.abs(Math.round(c.yoy_pct)) + ' %') : '—';
        var yoyCol = c.yoy_pct == null ? '#6B7280' : (c.yoy_pct < 0 ? '#B91C1C' : (hot ? '#0F6E56' : '#6B7280'));
        return { cells: [
          { v: c.name, bold: true },
          { v: tourNights(c.nights_k), color: '#6B7280' },
          { v: yoyStr, color: yoyCol, bold: hot }
        ] };
      });
      html += msTable([{ label: 'Pays' }, { label: 'Nuitées (saison)' }, { label: 'Tendance (an.)' }], rows);
    }
    if (j.growing && j.growing.length) {
      var g = j.growing.map(function (c) { return esc(c.name) + ' +' + Math.round(c.yoy_pct) + ' %'; }).join(' · ');
      html += '<div style="font-size:12.5px;color:#0F6E56;margin-top:10px;line-height:1.5;"><span style="font-weight:600;">En forte croissance — </span>' + g + '</div>';
    }
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    return html;
  }

  // Footfall (Bucket A) — the "when" of your business, SALES-ANCHORED. Leads on hourly revenue (your
  // money-clock), with BestTime as a secondary cross-check that gets flagged when it diverges.

  // ── CHANNELS — « Vos canaux » (R1, spec docs/rapport-canaux-spec.md ; proto v5 validé owner).
  // Données du provider channels (channelsData) : hiérarchie Groupe → Site → Canal, 4 questions,
  // semaines (états du détecteur des cartes), mois + top comptes, listes de comptes + totaux.
  // Une couleur par graphique + mise en avant sélective ; jamais de ~ ; fr-FR partout.
  function msChanPie(pct) { return '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:6px;background:conic-gradient(#1D3BB3 ' + Math.max(0, Math.min(100, pct)) + '%, #E5E7EB 0);"></span>'; }
  function msChanEtat(etat, label) {
    if (!label || etat === 'stable') return '';
    var st = etat === 'down' ? 'background:#FEE2E2;color:#991B1B;' : 'background:#E6F6F0;color:#059669;';
    return '<span style="display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:20px;text-transform:uppercase;letter-spacing:.03em;' + st + '">' + esc(label) + '</span>';
  }
  function msChanUc(t) { return '<div style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:600;margin:18px 0 10px;">' + esc(t) + '</div>'; }
  var MSCHAN_TD = 'padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:13.5px;';
  var MSCHAN_TDN = MSCHAN_TD + 'text-align:right;font-variant-numeric:tabular-nums;';
  var MSCHAN_TH = 'text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;font-weight:600;padding:6px 10px;border-bottom:1px solid #e5e7eb;';
  function msChanEvol(p) {
    if (p == null) return '<td style="' + MSCHAN_TDN + '"></td>';
    var c = p <= -15 ? '#B45309' : (p >= 15 ? '#059669' : '#374151');
    return '<td style="' + MSCHAN_TDN + 'color:' + c + ';font-weight:600;">' + msPct(p) + '</td>';
  }
  function msMoisFr(iso) { var d = String(iso || '').slice(0, 10); return d ? d.slice(5, 7) + '/' + d.slice(0, 4) : ''; }
  function msJJMM(iso) { var d = String(iso || '').slice(0, 10); return d ? d.slice(8, 10) + '/' + d.slice(5, 7) : ''; }

  function renderChannels(j) {
    if (!j || !j.found) return '';
    var html = '';
    var per = 'du ' + msJJMM(j.period.start) + ' au ' + msJJMM(j.period.end);

    // ── Les 4 questions ──
    var qq = j.quatre_questions || {};
    html += '<div style="background:#F8F9FB;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;line-height:1.6;">'
      + (qq.argent ? '<b>D\u2019o\u00f9 vient l\u2019argent :</b> ' + esc(qq.argent) + '<br>' : '')
      + (qq.marche ? '<b>Ce qui marche :</b> ' + esc(qq.marche) + '<br>' : '')
      + (qq.marche_pas ? '<b>Ce qui ne marche pas :</b> ' + esc(qq.marche_pas) + '<br>' : '')
      + (qq.a_faire ? '<b>\u00c0 faire :</b> ' + esc(qq.a_faire) : '')
      + '</div>';

    // ── Tableau Groupe → Site → Canal ──
    html += '<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">'
      + '<tr><th style="' + MSCHAN_TH + '">Site / canal</th><th style="' + MSCHAN_TH + 'text-align:right;">CA</th><th style="' + MSCHAN_TH + 'text-align:right;">Part</th><th style="' + MSCHAN_TH + 'text-align:right;">vs p\u00e9riode pr\u00e9c.</th><th style="' + MSCHAN_TH + 'text-align:right;">Factures</th><th style="' + MSCHAN_TH + '">\u00c9tat</th></tr>';
    var multiSite = j.sites.length > 1;
    for (var si = 0; si < j.sites.length; si++) {
      var st = j.sites[si];
      if (multiSite || !st.single_flow) {
        var bold = multiSite ? 'font-weight:700;' : '';
        html += '<tr style="' + (multiSite ? 'background:#F8F9FB;' : '') + '">'
          + '<td style="' + MSCHAN_TD + bold + '">' + esc(st.site_name) + '</td>'
          + '<td style="' + MSCHAN_TDN + bold + '">' + frInt(Math.round(st.ca)) + ' \u20ac</td>'
          + '<td style="' + MSCHAN_TDN + '">' + msChanPie(st.share_pct) + st.share_pct + ' %</td>'
          + msChanEvol(st.evol_pct)
          + '<td style="' + MSCHAN_TDN + '">' + st.invoices + '</td>'
          + '<td style="' + MSCHAN_TD + '">' + (st.single_flow ? msChanEtat(st.etat, st.etat_label) : '') + '</td></tr>';
      }
      for (var ci = 0; ci < st.channels.length; ci++) {
        var c = st.channels[ci];
        html += '<tr>'
          + '<td style="' + MSCHAN_TD + 'padding-left:26px;">' + esc(c.label) + '</td>'
          + '<td style="' + MSCHAN_TDN + '">' + frInt(Math.round(c.ca)) + ' \u20ac</td>'
          + '<td style="' + MSCHAN_TDN + '">' + msChanPie(c.share_pct) + c.share_pct + ' %</td>'
          + msChanEvol(c.evol_pct)
          + '<td style="' + MSCHAN_TDN + '">' + c.invoices + '</td>'
          + '<td style="' + MSCHAN_TD + '">' + msChanEtat(c.etat, c.etat_label) + '</td></tr>';
      }
    }
    if (multiSite) {
      html += '<tr style="border-top:2px solid #e5e7eb;">'
        + '<td style="' + MSCHAN_TD + 'font-weight:700;">Total</td>'
        + '<td style="' + MSCHAN_TDN + 'font-weight:700;">' + frInt(Math.round(j.total.ca)) + ' \u20ac</td>'
        + '<td style="' + MSCHAN_TDN + '">100 %</td>'
        + msChanEvol(j.total.evol_pct)
        + '<td style="' + MSCHAN_TDN + '">' + j.total.invoices + '</td><td style="' + MSCHAN_TD + '"></td></tr>';
    }
    html += '</table>';
    html += '<div style="font-size:12px;color:#9ca3af;line-height:1.5;margin-bottom:6px;">P\u00e9riode ' + esc(per) + '. Pas de colonne \u00ab objectif \u00bb tant qu\u2019aucun engagement par canal n\u2019en d\u00e9clare.</div>';

    // ── Semaines par canal hebdo (une couleur + mise en avant sélective) ──
    for (var wi = 0; wi < (j.weekly || []).length; wi++) {
      var wk = j.weekly[wi];
      html += msChanUc(wk.label + ' \u2014 les ' + wk.weeks.length + ' semaines de la p\u00e9riode');
      html += '<div data-chan-wkwrap="' + wi + '">'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">'
        + ['bestworst|Meilleure et pire', 'top3|3 meilleures', 'worst3|3 pires', 'remarq|Semaines remarquables'].map(function (o, oi) {
            var p2 = o.split('|');
            return '<button type="button" data-chan-wkmode="' + p2[0] + '" style="font-size:12px;padding:4px 12px;border-radius:20px;border:1px solid ' + (oi === 0 ? '#1D3BB3' : '#e5e7eb') + ';background:' + (oi === 0 ? '#EEF2FF' : '#fff') + ';color:' + (oi === 0 ? '#1D3BB3' : '#374151') + ';font-family:inherit;cursor:pointer;' + (oi === 0 ? 'font-weight:600;' : '') + '">' + p2[1] + '</button>';
          }).join('')
        + '</div>';
      var maxCa = 1;
      for (var x = 0; x < wk.weeks.length; x++) maxCa = Math.max(maxCa, wk.weeks[x].ca);
      html += '<div style="display:flex;align-items:flex-end;gap:4px;height:96px;">';
      for (var x2 = 0; x2 < wk.weeks.length; x2++) {
        var w = wk.weeks[x2];
        var h = Math.max(6, Math.round((w.ca / maxCa) * 66));
        html += '<div data-chan-wk data-ca="' + w.ca + '" data-state="' + esc(w.state) + '" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;">'
          + '<div data-chan-val style="font-size:9px;color:#1D3BB3;font-weight:700;white-space:nowrap;visibility:hidden;">' + frInt(Math.round(w.ca)) + ' \u20ac</div>'
          + '<div data-chan-bar style="width:100%;background:#1D3BB3;border-radius:3px 3px 0 0;opacity:.25;height:' + h + 'px;"></div>'
          + '<div style="font-size:9px;color:#9ca3af;white-space:nowrap;">' + msJJMM(w.week_start) + '</div>'
          + '</div>';
      }
      html += '</div>';
      if (wk.typical != null) html += '<div style="font-size:12px;color:#6B7280;margin-top:6px;">Semaine type : ' + frInt(wk.typical) + ' \u20ac (m\u00e9diane des 6 derni\u00e8res).</div>';
      html += '</div>';
    }

    // ── Mois par canal mensuel (+ top comptes du mois) ──
    for (var mi = 0; mi < (j.monthly || []).length; mi++) {
      var mo = j.monthly[mi];
      html += msChanUc(mo.label + ' \u2014 les mois, et qui les porte');
      html += '<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">'
        + '<tr><th style="' + MSCHAN_TH + '">Mois</th><th style="' + MSCHAN_TH + 'text-align:right;">CA</th><th style="' + MSCHAN_TH + 'text-align:right;">Factures</th><th style="' + MSCHAN_TH + '">Principaux comptes</th></tr>';
      for (var mx = 0; mx < mo.months.length; mx++) {
        var m = mo.months[mx];
        html += '<tr><td style="' + MSCHAN_TD + '">' + msMoisFr(m.month_start) + '</td>'
          + '<td style="' + MSCHAN_TDN + '">' + frInt(Math.round(m.ca)) + ' \u20ac</td>'
          + '<td style="' + MSCHAN_TDN + '">' + m.invoices + '</td>'
          + '<td style="' + MSCHAN_TD + 'font-size:12px;color:#6B7280;">' + esc(m.top_parties || '') + '</td></tr>';
      }
      html += '<tr style="border-top:2px solid #e5e7eb;"><td style="' + MSCHAN_TD + 'font-weight:700;">Total</td>'
        + '<td style="' + MSCHAN_TDN + 'font-weight:700;">' + frInt(Math.round(mo.total.ca)) + ' \u20ac</td>'
        + '<td style="' + MSCHAN_TDN + 'font-weight:700;">' + mo.total.invoices + '</td><td style="' + MSCHAN_TD + '"></td></tr>'
        + '</table>';
    }

    // ── Comptes de la période ──
    for (var ai = 0; ai < (j.accounts || []).length; ai++) {
      var ac = j.accounts[ai];
      html += msChanUc(ac.label + ' \u2014 les comptes de la p\u00e9riode (' + ac.total.count + ')');
      html += '<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">'
        + '<tr><th style="' + MSCHAN_TH + '">Compte</th><th style="' + MSCHAN_TH + 'text-align:right;">CA</th><th style="' + MSCHAN_TH + 'text-align:right;">Part du canal</th><th style="' + MSCHAN_TH + 'text-align:right;">Commandes</th></tr>';
      for (var ax = 0; ax < ac.rows.length; ax++) {
        var arow = ac.rows[ax];
        html += '<tr><td style="' + MSCHAN_TD + '">' + esc(arow.label) + '</td>'
          + '<td style="' + MSCHAN_TDN + '">' + frInt(Math.round(arow.ca)) + ' \u20ac</td>'
          + '<td style="' + MSCHAN_TDN + '">' + msChanPie(arow.share_pct) + (arow.share_pct < 1 ? '&lt;1' : arow.share_pct) + ' %</td>'
          + '<td style="' + MSCHAN_TDN + '">' + arow.invoices + '</td></tr>';
      }
      if (ac.others) {
        html += '<tr><td style="' + MSCHAN_TD + 'color:#6b7280;">Autres \u2014 ' + ac.others.count + ' comptes</td>'
          + '<td style="' + MSCHAN_TDN + '">' + frInt(Math.round(ac.others.ca)) + ' \u20ac</td>'
          + '<td style="' + MSCHAN_TDN + '">' + msChanPie(ac.others.share_pct) + ac.others.share_pct + ' %</td>'
          + '<td style="' + MSCHAN_TDN + '"></td></tr>';
      }
      html += '<tr style="border-top:2px solid #e5e7eb;"><td style="' + MSCHAN_TD + 'font-weight:700;">Total \u2014 ' + ac.total.count + ' comptes</td>'
        + '<td style="' + MSCHAN_TDN + 'font-weight:700;">' + frInt(Math.round(ac.total.ca)) + ' \u20ac</td>'
        + '<td style="' + MSCHAN_TDN + '">100 %</td>'
        + '<td style="' + MSCHAN_TDN + 'font-weight:700;">' + ac.total.invoices + '</td></tr>'
        + '</table>';
    }

    html += '<div style="font-size:12px;color:#6B7280;border-top:1px solid #f3f4f6;padding-top:12px;margin-top:8px;">' + esc(j.pied || '') + '</div>';
    return html;
  }

  // Mise en avant sélective des semaines — une couleur, un critère (proto v5). Délégué une fois.
  function msChanApplyWkMode(wrap, mode) {
    var bars = Array.prototype.slice.call(wrap.querySelectorAll('[data-chan-wk]'));
    if (!bars.length) return;
    var cas = bars.map(function (b) { return Number(b.getAttribute('data-ca')); });
    var sorted = cas.slice().sort(function (a, b) { return a - b; });
    var on = bars.map(function () { return false; });
    if (mode === 'bestworst') {
      var mx = Math.max.apply(null, cas), mn = Math.min.apply(null, cas);
      on = cas.map(function (v) { return v === mx || v === mn; });
    } else if (mode === 'top3') {
      var t3 = sorted.slice(-3);
      on = cas.map(function (v) { return t3.indexOf(v) >= 0; });
    } else if (mode === 'worst3') {
      var w3 = sorted.slice(0, 3);
      on = cas.map(function (v) { return w3.indexOf(v) >= 0; });
    } else if (mode === 'remarq') {
      on = bars.map(function (b) { var st2 = b.getAttribute('data-state'); return st2 === 'hole' || st2 === 'spike' || st2 === 'low' || st2 === 'high'; });
    }
    bars.forEach(function (b, i) {
      b.querySelector('[data-chan-bar]').style.opacity = on[i] ? '1' : '.25';
      b.querySelector('[data-chan-val]').style.visibility = on[i] ? 'visible' : 'hidden';
    });
    wrap.querySelectorAll('[data-chan-wkmode]').forEach(function (btn) {
      var act = btn.getAttribute('data-chan-wkmode') === mode;
      btn.style.borderColor = act ? '#1D3BB3' : '#e5e7eb';
      btn.style.background = act ? '#EEF2FF' : '#fff';
      btn.style.color = act ? '#1D3BB3' : '#374151';
      btn.style.fontWeight = act ? '600' : '400';
    });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-chan-wkmode]') : null;
      if (!btn) return;
      var wrap = btn.closest('[data-chan-wkwrap]');
      if (wrap) msChanApplyWkMode(wrap, btn.getAttribute('data-chan-wkmode'));
    });
    document.addEventListener('ms-cardkit-rendered', function () {
      document.querySelectorAll('[data-chan-wkwrap]').forEach(function (w) { msChanApplyWkMode(w, 'bestworst'); });
    });
  }

  function renderFootfall(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de données de ventes horaires pour ce lieu.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.hourly && j.hourly.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:10px 0 0;">Votre CA par heure (semaine) :</div>'
        + msStrip(j.hourly.map(function (h) {
          var pk = (j.peak_hour != null && h.hour === j.peak_hour);
          return { top: h.hour + 'h', mid: (h.revenue != null ? frInt(Math.round(h.revenue)) + ' €' : ''), highlight: pk, tone: 'warn' };
        }));
    }
    if (j.besttime_note) html += '<div style="font-size:12px;color:#9CA3AF;margin-top:6px;line-height:1.5;">' + esc(j.besttime_note) + '</div>';
    if (j.weekly && j.weekly.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:10px 0 0;">CA par jour :</div>'
        + msStrip(j.weekly.map(function (d) {
          return { top: d.day, mid: (d.revenue != null ? frInt(Math.round(d.revenue)) + ' €' : ''), highlight: (d.state === 'busy' || d.state === 'quiet'), tone: (d.state === 'quiet' ? 'ok' : (d.state === 'busy' ? 'warn' : 'default')) };
        }));
    }
    if (j.scale) html += msScale(j.scale);
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    return html;
  }

  // OFFERING / sales-MIX card ("Ce que vous vendez · votre mix produit"). Pure: json -> HTML.
  // Numbers arrive pre-rounded from the provider (share_pct, concentration, gap_pp); the kit only
  // formats (fr comma) + lays out via the shared helpers. Temporal block is honest-absent when flat.
  function renderOffering(j) {
    if (!j || !j.ok || !j.found || !j.categories || !j.categories.length) {
      return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de données de ventes par catégorie pour ce lieu.</div>';
    }
    function d(n) { return n == null ? '—' : String(n).replace('.', ','); }
    var out = '';
    var top = j.categories[0];
    if (top) out += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">'
      + esc(top.category) + ' domine vos ventes (' + d(top.share_pct) + ' % du CA) — '
      + (j.n_categories || j.categories.length) + ' catégories, ' + frInt(j.total_units) + ' unités mesurées.</div>';

    // Category mix — sortable by share (default) / units.
    out += '<div style="font-size:12px;color:#6B7280;margin:10px 0 0;">Votre mix par catégorie :</div>';
    out += msSortTable([
      { label: 'Catégorie', render: function (c) { return { v: c.category, bold: true }; } },
      { label: 'Part du CA', key: 'share_pct', render: function (c) { return { v: d(c.share_pct) + ' %', bold: true }; } },
      { label: 'Unités', key: 'units', render: function (c) { return { v: frInt(c.units), color: '#6B7280' }; } }
    ], j.categories, 'share_pct');

    if (j.concentration) {
      var k = j.concentration;
      out += '<div style="font-size:12px;color:#6B7280;margin-top:8px;line-height:1.5;">Vos ' + k.core_count
        + ' catégories principales concentrent ' + d(k.core_pct) + ' % du CA ; ' + k.tail_count
        + ' marginales font ' + d(k.tail_pct) + ' %.</div>';
    }

    if (j.top_items && j.top_items.length) {
      out += '<div style="font-size:12px;color:#6B7280;margin:12px 0 0;">Vos meilleures ventes (unités) :</div>';
      out += msSortTable([
        { label: 'Article', render: function (i) { return { v: i.item, bold: true }; } },
        { label: 'Unités', key: 'units', render: function (i) { return { v: frInt(i.units), bold: true }; } },
        { label: 'Prix moyen', render: function (i) { return { v: (i.avg_price != null ? msEur2(i.avg_price) : '—'), color: '#6B7280' }; } }
      ], j.top_items, 'units');
    }

    // Temporal — the mix's non-obvious movement, honest-absent when flat.
    var t = j.temporal;
    if (t && t.any_signal) {
      var lines = [];
      (t.weekday_weekend || []).forEach(function (w) {
        lines.push({ head: w.category, body: (w.heavier === 'weekend' ? 'plus vendu le week-end' : 'plus vendu en semaine') + ' (part supérieure de ' + d(Math.abs(w.gap_pp)) + ' %).' });
      });
      (t.seasonal || []).forEach(function (s) {
        lines.push({ head: s.category, body: 'sa part varie de ' + d(s.range_pp) + ' % selon les mois.' });
      });
      if (lines.length) out += msDecision('Le mix bouge', lines);
    } else {
      out += '<div style="font-size:12px;color:#9CA3AF;margin-top:10px;line-height:1.5;">Mix stable — aucune variation marquée par jour de semaine ni par saison sur l\'historique disponible.</div>';
    }

    if (j.basket != null || j.mean_daily_rev != null) {
      out += msScale({
        headline: (j.basket != null ? msEur2(j.basket) + ' de panier moyen' : ''),
        enjeu: (j.mean_daily_rev != null ? ('CA journalier moyen ~' + frInt(Math.round(j.mean_daily_rev)) + ' € sur ' + (j.history_days != null ? j.history_days : '—') + ' j d\'historique.') : ''),
      });
    }
    return out;
  }

  // ── USER-GENERATED card family: the commitment's "Consulter l'évolution" page.
  //    PURE render (chart + decision headline + advice + capture markup + sources).
  //    Self-contained helpers — the page's exact esc/fr semantics (0 -> "0"), NOT the
  //    kit globals (whose esc nulls 0). The page keeps the wiring (wireCapture/wireAdvice,
  //    fetch, MSCommitForm); this returns ONLY the document HTML. COPY = EVOL_COPY.
  function renderEvolution(data, COPY) {
    var WIN_FR = { day_of: 'Jour même', '7d': '7 jours', '14d': '14 jours', '30d': '30 jours' };
    var LVL_FR = { modeste: 'modeste', net: 'net' };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fr(n) { var r = Math.round((Number(n) || 0) * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); }
    function intfr(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }
    function dnum(iso) { return parseInt(String(iso).slice(8, 10), 10); }
    // Étiquette d'axe : jour de semaine EN TOUTES LETTRES + JJ/MM (lexique règle 6, contrat
    // déjà porté par le kit — aucune abréviation). WX_DOW_FR = le foyer des jours.
    function msDayAxisFr(iso) {
      var d = new Date(String(iso) + 'T00:00:00Z');
      return (WX_DOW_FR[d.getUTCDay()] || '') + ' ' + String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7);
    }
    function t(key, vars) { var s = COPY[key] || ''; if (vars) for (var k in vars) if (vars.hasOwnProperty(k)) s = s.split('{' + k + '}').join(vars[k]); return s; }


    // advice -> items with optional M'engager CTA (wiring attached page-side)
    var ADVICE = {
      advice_replay_offseason: { text: function () { return t('advice_replay_offseason'); }, cta: true },
      advice_aim_higher: { text: function (a) { return t('advice_aim_higher', { pct: fr(a.arg) }); }, cta: true },
      advice_met_hold: { text: function () { return t('advice_met_hold'); }, cta: true },
      advice_missed_descriptive: { text: function () { return t('advice_missed_descriptive'); }, cta: false },
      advice_replay_retest: { text: function () { return t('advice_replay_retest'); }, cta: true },
      advice_track_reconduire: { text: function (a) { return t('advice_track_reconduire', { beat: a.track.beat, done: a.track.done }); }, cta: true },
      advice_track_mitige: { text: function (a) { return t('advice_track_mitige', { beat: a.track.beat, done: a.track.done }); }, cta: false },
      advice_track_ne_pas: { text: function (a) { return t('advice_track_ne_pas', { beat: a.track.beat, done: a.track.done }); }, cta: false }
    };
    function adviceHtml(advice) {
      return advice.map(function (a, i) {
        var spec = ADVICE[a.key]; if (!spec) return '';
        var body = spec.text(a);
        return '<div data-adv="' + i + '" style="padding:12px 0;border-top:' + (i ? '1px solid #f0f0f0' : 'none') + ';">'
          + '<div style="display:flex;gap:11px;align-items:flex-start;">'
          + '<span style="width:20px;height:20px;border-radius:50%;background:#1D3BB3;color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">' + (i + 1) + '</span>'
          + '<div style="flex:1;"><div style="font-size:14px;color:#111827;line-height:1.45;">' + esc(body) + '</div>'
          + (spec.cta ? '<button type="button" data-adv-cta="' + i + '" style="margin-top:8px;font-size:12px;font-weight:600;color:#1D3BB3;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:6px;padding:6px 12px;cursor:pointer;font-family:inherit;">' + esc(t('advice_cta')) + ' →</button>' : '')
          + '<div data-adv-form="' + i + '" style="display:none;margin-top:8px;border:1px solid #eef2f7;border-radius:8px;"></div>'
          + '</div></div></div>';
      }).join('');
    }

    // capture markup (done/dispositif when open, retro when resolved)
    function doneBtnStyle(sel) { return 'font-size:12px;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:600;' + (sel ? 'background:#1D3BB3;color:#fff;border:1px solid #1D3BB3;' : 'background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;'); }
    // read-only summary row (view mode)
    function roRow(label, value) {
      return '<div style="padding:8px 0;border-top:0.5px solid #F3F4F6;"><div style="font-size:12px;font-weight:600;color:#6b7280;">' + esc(label) + '</div><div style="font-size:13px;color:#111827;line-height:1.5;margin-top:3px;white-space:pre-wrap;">' + esc(value) + '</div></div>';
    }
    // Read/edit mode (remark #2): once saved, render read-only with an "Éditer" toggle. Editing RIGHTS
    // are deferred — this is the view-mode UI only. hasData default = read; empty = edit.
    // Documenter — le retour structuré. N'EXISTE QUE SUR UNE OPÉRATION TERMINÉE (owner
    // 28/08) : c'était déjà la règle du rail (le rétro est refusé avant résolution), la page
    // la reflète enfin. L'ancienne branche « Action menée ? » a disparu de la page — le geste
    // vit dans le message Slack, et la Description du dispositif dans le bloc Votre dispositif.
    function captureHtml(cm) {
      var inner, title, hasData, readInner;
      {
        title = t('q4_title_doc');
        hasData = (cm.retro_worked != null || cm.retro_change != null || cm.retro_repeat != null);
        var taStyle = 'width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:56px;box-sizing:border-box;margin-bottom:14px;';
        var qStyle = 'font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;';
        var rep = cm.retro_repeat;
        inner = '<div style="font-size:12px;color:#9ca3af;margin-bottom:14px;line-height:1.5;">' + esc(t('doc_hint')) + '</div>'
          + '<div style="' + qStyle + '">' + esc(t('retro_worked_q')) + '</div>'
          + '<textarea data-retro-worked placeholder="' + esc(t('retro_worked_ph')) + '" style="' + taStyle + '">' + esc(cm.retro_worked || '') + '</textarea>'
          + '<div style="' + qStyle + '">' + esc(t('retro_change_q')) + '</div>'
          + '<textarea data-retro-change placeholder="' + esc(t('retro_change_ph')) + '" style="' + taStyle + '">' + esc(cm.retro_change || '') + '</textarea>'
          + '<div style="' + qStyle + '">' + esc(t('retro_repeat_q')) + '</div>'
          + '<div style="display:flex;gap:8px;margin-bottom:4px;">'
          + '<button type="button" data-retro-repeat="oui" style="' + doneBtnStyle(rep === true) + '">' + esc(t('repeat_yes')) + '</button>'
          + '<button type="button" data-retro-repeat="non" style="' + doneBtnStyle(rep === false) + '">' + esc(t('repeat_no')) + '</button></div>';
        readInner = (cm.retro_worked ? roRow(t('retro_worked_q'), cm.retro_worked) : '')
          + (cm.retro_change ? roRow(t('retro_change_q'), cm.retro_change) : '')
          + roRow(t('retro_repeat_q'), rep === true ? t('repeat_yes') : rep === false ? t('repeat_no') : '—');
      }
      var editBtn = 'margin-top:12px;padding:7px 14px;font-size:12.5px;font-weight:600;color:#1D3BB3;background:#fff;border:1px solid #1D3BB3;border-radius:6px;cursor:pointer;font-family:inherit;';
      var cancelBtn = 'background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;';
      var readView = '<div data-cap-read style="display:' + (hasData ? 'block' : 'none') + ';">' + readInner
        + '<button type="button" data-cap-edit-btn style="' + editBtn + '">' + esc(t('edit')) + '</button></div>';
      var editView = '<div data-cap-edit style="display:' + (hasData ? 'none' : 'block') + ';">' + inner
        + '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;">'
        + '<button type="button" data-cap-save style="background:#1D3BB3;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + esc(t('save')) + '</button>'
        + (hasData ? '<button type="button" data-cap-cancel style="' + cancelBtn + '">' + esc(t('cancel')) + '</button>' : '')
        + '<span data-cap-msg style="font-size:12px;color:#166534;"></span></div></div>';
      return '<div class="eg-sec"><div class="eg-uc">' + esc(title) + '</div>' + readView + editView + '</div>';
    }

    // ── LES DEUX ÉTATS (owner 28/08) ────────────────────────────────────────────────────
    // Le jour par jour en BARRES : l'écart au CA habituel se lit AU-DESSUS de chaque barre
    // (le % signé, demandé par l'owner), le contexte se lit SOUS le jour concerné, en toutes
    // lettres. Remplace la double courbe : sur 7 points, deux polylignes se lisaient mal et
    // n'écrivaient l'écart nulle part.
    function dayBars(series, goalPct) {
      var W = 760, H = 232, padL = 8, padT = 40, padB = 50, plotW = W - padL - 8, plotH = H - padT - padB;
      var n = series.length, slot = plotW / n, bw = Math.min(54, slot * 0.52);
      var mx = 0;
      series.forEach(function (d) { if (d.has_data) { mx = Math.max(mx, d.daily_revenue, d.expected_revenue, d.expected_revenue * (1 + (goalPct || 0) / 100)); } });
      if (!(mx > 0)) return '';
      mx = mx * 1.12;
      var y = function (v) { return padT + plotH - (v / mx) * plotH; };
      var s = '';
      series.forEach(function (d, i) {
        var cx = padL + slot * i + slot / 2;
        if (d.has_data) {
          var yv = y(d.daily_revenue), yh = y(d.expected_revenue);
          var dp = d.residual_pct != null ? d.residual_pct : (d.expected_revenue ? (d.daily_revenue - d.expected_revenue) / d.expected_revenue * 100 : 0);
          s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + yv.toFixed(1) + '" width="' + bw + '" height="' + (padT + plotH - yv).toFixed(1) + '" rx="4" fill="#1D3BB3" fill-opacity="0.85"/>'
            + '<line x1="' + (cx - bw / 2 - 5).toFixed(1) + '" y1="' + yh.toFixed(1) + '" x2="' + (cx + bw / 2 + 5).toFixed(1) + '" y2="' + yh.toFixed(1) + '" stroke="#111827" stroke-width="2"/>';
          if (goalPct != null) {
            var yg = y(d.expected_revenue * (1 + goalPct / 100));
            s += '<line x1="' + (cx - bw / 2 - 5).toFixed(1) + '" y1="' + yg.toFixed(1) + '" x2="' + (cx + bw / 2 + 5).toFixed(1) + '" y2="' + yg.toFixed(1) + '" stroke="#1D3BB3" stroke-width="1.6" stroke-dasharray="4,3"/>';
          }
          s += '<text x="' + cx.toFixed(1) + '" y="' + (yv - 20).toFixed(1) + '" font-size="13" font-weight="700" fill="' + (dp >= 0 ? '#0F6E56' : '#B45309') + '" text-anchor="middle">' + (dp >= 0 ? '+' : '−') + fr(Math.abs(dp)) + ' %</text>'
            + '<text x="' + cx.toFixed(1) + '" y="' + (yv - 6).toFixed(1) + '" font-size="10" fill="#6b7280" text-anchor="middle">' + intfr(Math.round(d.daily_revenue)) + ' €</text>';
        } else {
          s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(mx * 0.55).toFixed(1) + '" width="' + bw + '" height="' + (padT + plotH - y(mx * 0.55)).toFixed(1) + '" rx="4" fill="none" stroke="#e5e7eb" stroke-width="1.4" stroke-dasharray="4,4"/>';
        }
        s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 30) + '" font-size="10.5" fill="' + (d.has_data ? '#374151' : '#c2c7cf') + '" text-anchor="middle">' + esc(msDayAxisFr(d.date)) + '</text>';
        var marks = [];
        if (d.is_school_holiday) marks.push('vacances');
        if (d.impact_weather_pct != null && d.impact_weather_pct <= -5) marks.push('météo');
        if (marks.length) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 12) + '" font-size="11" font-weight="600" fill="#92610a" text-anchor="middle">' + marks.join(' · ') + '</text>';
      });
      var legend = '<div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:#374151;flex-wrap:wrap;">'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="14" height="10"><rect width="14" height="10" rx="2" fill="#1D3BB3" fill-opacity="0.85"/></svg>' + esc(t('chart_realized')) + '</span>'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#111827" stroke-width="2"/></svg>' + esc(t('chart_habituel')) + '</span>'
        + (goalPct != null ? '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#1D3BB3" stroke-width="1.6" stroke-dasharray="4,3"/></svg>objectif +' + fr(goalPct) + ' %</span>' : '')
        + '</div>';
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;">' + s + '</svg>' + legend
        + '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + esc(t('chart_note')) + '</div>';
    }

    // Le DISPOSITIF — ce que l'opération est, avant ce qu'elle donne. Les champs existaient
    // en base (dispositif_note/plus/why/resources) sans surface : la page ne les montrait pas.
    function dispoBlock(cm, open) {
      var row = function (lab, val) {
        return '<div><div style="font-size:12px;font-weight:600;color:#6b7280;">' + esc(lab) + '</div>'
          + '<div style="font-size:13px;line-height:1.5;margin-top:3px;white-space:pre-wrap;color:' + (val ? '#111827' : '#9ca3af') + ';">' + esc(val || t('dispo_none')) + '</div></div>';
      };
      var pairs = [];
      if (cm.dispositif_plus) pairs.push(row(t('vform_plus'), cm.dispositif_plus));
      if (cm.dispositif_why) pairs.push(row(t('vform_why'), cm.dispositif_why));
      if (cm.owner_person_name) pairs.push(row(t('vform_resp'), cm.owner_person_name));
      if (cm.dispositif_resources) pairs.push(row(t('vform_res'), cm.dispositif_resources));
      // La description est ÉDITABLE tant que l'opération court (POST /disposition, note seule).
      var note = cm.dispositif_note || '';
      var noteBlock = '<div style="margin-bottom:14px;"><div style="font-size:12px;font-weight:600;color:#6b7280;">' + esc(t('dispo_note_label')) + '</div>'
        + '<div data-dispo-read style="font-size:13px;line-height:1.5;margin-top:3px;white-space:pre-wrap;color:' + (note ? '#111827' : '#9ca3af') + ';">' + esc(note || t('dispo_none'))
        + (open ? ' <button type="button" data-dispo-edit style="font-size:11.5px;font-weight:600;color:#1D3BB3;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;">' + esc(t('edit')) + '</button>' : '') + '</div>'
        + (open ? '<div data-dispo-form style="display:none;margin-top:6px;">'
            + '<textarea data-dispo-note placeholder="' + esc(t('dispo_note_ph')) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:56px;box-sizing:border-box;">' + esc(note) + '</textarea>'
            + '<div style="margin-top:8px;display:flex;align-items:center;gap:10px;">'
            + '<button type="button" data-dispo-save style="background:#1D3BB3;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;">' + esc(t('save')) + '</button>'
            + '<button type="button" data-dispo-cancel style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;border-radius:6px;padding:7px 14px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;">' + esc(t('cancel')) + '</button>'
            + '<span data-dispo-msg style="font-size:12px;color:#166534;"></span></div></div>' : '')
        + '</div>';
      return '<div class="eg-sec"><div class="eg-uc">' + esc(t('dispo_title')) + '</div>' + noteBlock
        + (pairs.length ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;">' + pairs.join('') + '</div>' : '')
        + '</div>';
    }

    // « COMPRENDRE LE RÉSULTAT » — d'où vient l'écart. UN SEUL référentiel de niveau : celui
    // de l'en-tête. Heures et familles se lisent en PART de la journée (les écarts se
    // compensent) ; achats/panier se décompose CONTRE le résultat habituel et somme
    // exactement à son écart (server: commitmentShape). Aucun chiffre n'est recalculé ici.
    function shapeBlock(shape, ctxHtml, received, total) {
      if (!shape) return ctxHtml ? '<div class="eg-sec"><div class="eg-uc">' + esc(t('shape_title')) + '</div>' + ctxHtml + '</div>' : '';
      var card = 'background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:13px 15px;margin-bottom:10px;';
      var cardTitle = function (txt) { return '<div style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">' + esc(txt) + '</div>'; };
      var lead = function (txt) { return '<div style="font-size:13.5px;font-weight:600;color:#111827;line-height:1.5;">' + esc(txt) + '</div>'; };
      var body = function (txt) { return '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:4px;">' + esc(txt) + '</div>'; };
      var note = function (txt) { return '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + esc(txt) + '</div>'; };
      var h = '<div class="eg-sec"><div class="eg-uc">' + esc(t('shape_title')) + '</div>'
        + '<div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:12px;">'
        + esc(t('shape_intro', { n: received, total: total })) + ' ' + esc(t('shape_ref_note', { n: shape.ref_days })) + '</div>';

      // ① Quels moments — la tranche vient des données (aucune heure en dur côté serveur).
      if (shape.best_run && shape.hours && shape.hours.length > 1) {
        var r = shape.best_run;
        h += '<div style="' + card + '">' + cardTitle(t('shape_hours_title'))
          + lead(t('shape_hours_lead', { from: r.from_hour, to: r.to_hour, share: fr(r.share_pct), ref: fr(r.ref_share_pct) }))
          + body(t('shape_hours_shift', { eur: intfr(Math.abs(r.shift_eur)) }))
          + '<div style="margin-top:10px;">' + hourBars(shape.hours) + '</div>'
          + note(t('shape_hours_note')) + '</div>';
      }
      // ② Performance des produits vendus — toutes les familles, triées par écart.
      if (shape.families && shape.families.length) {
        h += '<div style="' + card + '">' + cardTitle(t('shape_fams_title'))
          + note(t('shape_fams_note', { n: shape.families.length })).replace('margin-top:5px', 'margin:0 0 8px')
          + shape.families.map(function (f) {
              var col = f.delta > 0 ? '#0F6E56' : (f.delta < 0 ? '#B45309' : '#9ca3af');
              return '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #f5f6f8;font-size:13px;">'
                + '<span style="min-width:0;"><span style="font-weight:600;color:#111827;">' + esc(f.family) + '</span>'
                + '<span style="display:block;color:#9ca3af;font-size:11.5px;margin-top:1px;">' + esc(t('shape_fams_ref', { eur: intfr(f.rev), ref: intfr(f.ref) })) + '</span></span>'
                + '<span style="font-weight:600;white-space:nowrap;color:' + col + ';">' + (f.delta > 0 ? '+' : (f.delta < 0 ? '−' : '')) + intfr(Math.abs(f.delta)) + ' €</span></div>';
            }).join('') + '</div>';
      }
      // ③ Achats ou panier — la décomposition de l'écart de l'en-tête.
      h += '<div style="' + card + '">' + cardTitle(t('shape_vol_title'));
      var v = shape.volume;
      if (v && shape.actual_eur != null && shape.expected_eur != null) {
        var gapEur = shape.actual_eur - shape.expected_eur;
        var txTxt = t('shape_vol_tx', { tx: intfr(v.tx), ref: intfr(v.ref_tx) });
        var fr2 = function (n) { return (Math.round(Number(n) * 100) / 100).toFixed(2).replace('.', ','); };
        var bkTxt = t('shape_vol_basket', { b: fr2(v.basket_eur), ref: fr2(v.ref_basket_eur) });
        var up = v.contrib_tx_eur >= 0 ? txTxt : bkTxt;
        var down = v.contrib_tx_eur >= 0 ? bkTxt : txTxt;
        var gapTxt = (gapEur >= 0 ? '+' : '−') + intfr(Math.abs(gapEur)) + ' €';
        h += lead(v.opposed
          ? t('shape_vol_opposed', { up: up.charAt(0).toUpperCase() + up.slice(1), down: down, gap: gapTxt })
          : t('shape_vol_same', { first: txTxt.charAt(0).toUpperCase() + txTxt.slice(1), second: bkTxt }));
        h += body(v.driver === 'tx'
          ? t('shape_vol_driver_tx', { eur: (v.contrib_tx_eur >= 0 ? '+' : '−') + intfr(Math.abs(v.contrib_tx_eur)) })
          : t('shape_vol_driver_basket', { eur: (v.contrib_basket_eur >= 0 ? '+' : '−') + intfr(Math.abs(v.contrib_basket_eur)) }));
      } else {
        h += body(t('shape_vol_none'));
      }
      h += '</div>';
      // ④ Contexte externe — le même bloc qu'avant, rapatrié ici (il répond à la même question).
      if (ctxHtml) h += '<div style="' + card + 'margin-bottom:0;">' + cardTitle(t('shape_ctx_title')) + ctxHtml + '</div>';
      return h + '</div>';
    }

    // Mini-barres horaires — le trait est la MÊME journée répartie comme les jours comparables
    // (le serveur l'a déjà remise à l'échelle) : les écarts se compensent, jamais un niveau
    // qui contredirait l'en-tête.
    function hourBars(hours) {
      var W = 760, H = 132, padT = 8, padB = 26, plotH = H - padT - padB, slot = W / hours.length, bw = Math.min(30, slot * 0.45);
      var mx = 0; hours.forEach(function (x) { mx = Math.max(mx, x.rev, x.ref); });
      if (!(mx > 0)) return '';
      mx = mx * 1.1;
      var y = function (v) { return padT + plotH - (v / mx) * plotH; };
      var s = '';
      hours.forEach(function (x, i) {
        var cx = slot * i + slot / 2;
        s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(x.rev).toFixed(1) + '" width="' + bw + '" height="' + (padT + plotH - y(x.rev)).toFixed(1) + '" rx="3" fill="' + (x.rev >= x.ref ? '#1D3BB3' : '#E0873A') + '" fill-opacity="0.8"/>'
          + '<line x1="' + (cx - bw / 2 - 4).toFixed(1) + '" y1="' + y(x.ref).toFixed(1) + '" x2="' + (cx + bw / 2 + 4).toFixed(1) + '" y2="' + y(x.ref).toFixed(1) + '" stroke="#111827" stroke-width="1.6"/>'
          + '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#6b7280" text-anchor="middle">' + x.h + ' h</text>';
      });
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;">' + s + '</svg>';
    }

    var cm = data.commitment, series = data.series || [], ctx = data.context || {};
    var hn = data.holiday_norm, prov = data.provenance || {}, advice = data.advice || [];
    var open = cm.status === 'open';

    // ── POLE / DISPOSITIF PERMANENT (P3, spec 27/08) — un document propre : lecture continue
    // (familles vs habituel), memoire, operations rattachees. AUCUN mot de verdict : un
    // permanent n'a pas de terme, sa mesure ne se juge pas, elle se lit.
    if (cm.dispositif_nature === 'permanent') {
      var t2 = function (key, vars) { var s2 = (COPY && COPY[key]) || ''; if (vars) for (var kk in vars) if (vars.hasOwnProperty(kk)) s2 = s2.split('{' + kk + '}').join(vars[kk]); return s2; };
      var pEurJ = function (v) { return v == null ? '—' : Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €/j'; };
      var pPct = function (v) { return (v >= 0 ? '+' : '−') + String(Math.abs(v)).replace('.', ',') + ' %'; };
      var pFams = []; try { pFams = JSON.parse(cm.pole_families || '[]'); } catch (e2) { pFams = []; }
      var pr = data.pole || { families: [], operations: [] };
      var nameParts = String(cm.committed_action_text || '').split(' — ');
      var pName = nameParts[0] || 'Pôle';
      var pLever = nameParts.slice(1).join(' — ');
      var h = '<div style="border-bottom:2px solid #111827;padding-bottom:14px;margin-bottom:20px;">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span style="font-size:19px;font-weight:700;color:#111827;">' + esc(pName) + '</span>'
        + '<span style="font-size:11px;font-weight:600;color:#0F6E56;background:#E6F6F0;padding:3px 10px;border-radius:999px;">' + esc(t2('pole_chip')) + '</span>'
        + (cm.status !== 'open' ? '<span style="font-size:11px;color:#6b7280;background:#F3F4F6;padding:3px 10px;border-radius:999px;">fermé</span>' : '') + '</div>'
        + (pLever ? '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:6px;">' + esc(pLever) + '</div>' : '')
        + (cm.owner_person_name ? '<div style="font-size:12px;color:#6b7280;margin-top:4px;">' + esc(t2('pole_resp')) + ' : ' + esc(cm.owner_person_name) + '</div>' : '')
        + '</div>';
      h += '<div class="eg-sec"><div class="eg-uc">' + esc(t2('pole_fams_title')) + '</div>'
        + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + pFams.map(function (f) { return '<span style="font-size:12px;background:#F3F4F6;color:#374151;padding:4px 11px;border-radius:999px;">' + esc(f) + '</span>'; }).join('') + '</div></div>';
      var pt = pr.totals || {};
      var ptLine = '';
      if (pt.rev30_eur != null) {
        ptLine = '<div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:8px;">'
          + esc(t2('pole_totals_row', { rev: Number(pt.rev30_eur).toLocaleString('fr-FR'), share: pt.share_pct != null ? String(pt.share_pct).replace('.', ',') : '\u2014' }))
          + (pt.delta_pct != null ? ' \u00b7 <span style="color:' + (pt.delta_pct >= 0 ? '#0F6E56' : '#B45309') + ';">' + pPct(pt.delta_pct) + ' vs les 90 jours pr\u00e9c\u00e9dents</span>' : '')
          + '</div>';
      }
      h += '<div class="eg-sec"><div class="eg-uc">' + esc(t2('pole_reading_title')) + '</div>'
        + ptLine
        + '<div style="font-size:11px;color:#9CA3AF;margin-bottom:8px;">' + esc(t2('pole_reading_caption')) + '</div>'
        + (pr.families || []).map(function (fr2) {
            var right = fr2.delta_pct != null
              ? '<span style="font-size:13px;font-weight:600;color:' + (fr2.delta_pct >= 0 ? '#0F6E56' : '#B45309') + ';">' + pPct(fr2.delta_pct) + '</span>'
              : '<span title="' + esc(t2('pole_reading_thin_tip', { n30: fr2.n30 })) + '" style="font-size:11px;color:#9CA3AF;cursor:help;">' + esc(t2('pole_reading_thin')) + ' \u24d8</span>';
            return '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:#fff;border:1px solid #e5e7eb;padding:10px 14px;margin-bottom:6px;">'
              + '<span style="font-size:13px;font-weight:600;color:#111827;">' + esc(fr2.family) + '</span>'
              + '<span style="font-size:12px;color:#6b7280;">' + pEurJ(fr2.avg30_eur_day) + (fr2.base_eur_day != null ? ' · ' + esc(t2('pole_reading_row', { n30: fr2.n30, base: Number(fr2.base_eur_day).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) })) : '') + '</span>'
              + right + '</div>';
          }).join('')
        + '</div>';
      var mem = '';
      if (cm.dispositif_plus) mem += '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:600;color:#374151;">' + esc(t2('vform_plus')) + '</div><div style="font-size:13px;color:#374151;line-height:1.55;">' + esc(cm.dispositif_plus) + '</div></div>';
      if (cm.dispositif_why) mem += '<div style="margin-bottom:8px;"><div style="font-size:12px;font-weight:600;color:#374151;">' + esc(t2('vform_why')) + '</div><div style="font-size:13px;color:#374151;line-height:1.55;">' + esc(cm.dispositif_why) + '</div></div>';
      if (cm.dispositif_resources) mem += '<div><div style="font-size:12px;font-weight:600;color:#374151;">' + esc(t2('vform_res')) + '</div><div style="font-size:13px;color:#374151;line-height:1.55;">' + esc(cm.dispositif_resources) + '</div></div>';
      if (mem) h += '<div class="eg-sec">' + mem + '</div>';
      h += '<div class="eg-sec"><div class="eg-uc">' + esc(t2('pole_ops_title')) + '</div>'
        + ((pr.operations || []).length
          ? pr.operations.map(function (o) {
              var when = (o.window_start ? msDateFr(o.window_start) : '') + (o.window_end && o.window_end !== o.window_start ? ' → ' + msDateFr(o.window_end) : '');
              var st = o.status === 'open' ? t2('pole_op_open') : t2('pole_op_done');
              return '<a href="/app/insightevent/engagement?id=' + encodeURIComponent(o.commitment_id) + '" style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;background:#fff;border:1px solid #e5e7eb;padding:10px 14px;margin-bottom:6px;text-decoration:none;">'
                + '<span style="font-size:13px;color:#111827;">' + esc(o.committed_action_text || '') + '</span>'
                + '<span style="font-size:11.5px;color:#6b7280;white-space:nowrap;">' + esc(when) + ' · ' + esc(st) + '</span></a>';
            }).join('')
          : '<div style="font-size:12.5px;color:#9CA3AF;">' + esc(t2('pole_ops_none')) + '</div>')
        + '</div>';
      return h;
    }

    var received = series.filter(function (d) { return d.has_data; });
    var windowHoliday = ctx.school_days > 0 || series.some(function (d) { return d.is_school_holiday; });

    // Cout de l'operation (ROI, 27/08) : ligne factuelle sous l'en-tete ; le net ne se dit que
    // quand la fenetre est MESUREE (actual + expected presents) — jamais un net sur du vide.
    var costLine = '';
    if (cm.operation_cost_eur != null) {
      var _cAct = cm.window_actual_revenue != null ? Number(cm.window_actual_revenue) : null;
      var _cExp = cm.window_expected_revenue != null ? Number(cm.window_expected_revenue) : null;
      var _net = (_cAct != null && _cExp != null) ? Math.round(_cAct - _cExp - Number(cm.operation_cost_eur)) : null;
      costLine = '<div style="font-size:12px;color:#6b7280;margin-top:4px;">Co\u00fbt de l\u2019op\u00e9ration : ' + Number(cm.operation_cost_eur).toLocaleString('fr-FR') + ' \u20ac'
        + (_net != null ? ' \u00b7 net apr\u00e8s co\u00fbt : ' + (_net >= 0 ? '+' : '\u2212') + Math.abs(_net).toLocaleString('fr-FR') + ' \u20ac' : '') + '</div>';
    }
    var aggPct;
    if (cm.window_residual_pct != null) aggPct = Number(cm.window_residual_pct);
    else if (received.length) aggPct = received.reduce(function (s, d) { return s + d.residual_pct; }, 0) / received.length;
    else aggPct = null;
    var daysUp = received.filter(function (d) { return d.residual_pct >= 0; }).length;

    var winLbl = WIN_FR[cm.window_kind] || cm.window_kind;
    // Objectif = the KPI target (uplift %) + the timeframe to reach it — not the "net/brut" jargon.
    // Base 'pct' (objectif libre 18/07) : le % est celui fixé par l'utilisateur, pas une traduction.
    var _subGoal = (cm.threshold_basis === 'pct' && cm.threshold_value != null)
      ? Math.round(Number(cm.threshold_value))
      : Math.max(1, Math.round((cm.threshold_level === 'net' ? 1.5 : 1.0) * 0.19 / Math.sqrt(cm.window_days_expected || 7) * 100));
    // K déjà résolu plus bas ; ici on ne lit que data.kpi (même valeur) pour nommer le référentiel.
    var _kSub = data.kpi || null;
    var sub = (_kSub && _kSub.metric !== 'revenue_residual' && _kSub.goal_pct != null)
      ? t('subtitle_kpi', { pct: Math.round(Number(_kSub.goal_pct)), window: winLbl, kpi: (_kSub.metric === 'family_revenue' && _kSub.family ? 'CA famille \u00ab ' + _kSub.family + ' \u00bb' : _kSub.label_fr) })
      : t('subtitle', { pct: _subGoal, window: winLbl });
    // Owner + when (remark #1): who committed and when, + when the action was marked done.
    var _ownerDate = '';
    if (cm.owner_person_name || cm.created_at) {
      var _cd = cm.created_at ? msDateFr(String(cm.created_at).slice(0, 10)) : '—';
      _ownerDate = t('owner_line', { name: esc(cm.owner_person_name || '—'), date: esc(_cd) });
      // « action menée le … » suit le STATUT, pas l'horodatage : action_done_at est écrit à
      // CHAQUE bascule du geste, « Pas encore » compris — l'en-tête annonçait donc une action
      // menée sur une action qui ne l'était pas (relevé au harnais 28/08, compte réel).
      if (cm.action_done_at && cm.action_done_status === 'fait') _ownerDate += t('done_suffix', { date: esc(msDateFr(String(cm.action_done_at).slice(0, 10))) });
    }
    // Nom de l'établissement (owner 19/07, proto v3) : à droite du kicker « Engagement »,
    // première ligne du HEADER du document (13px gris) — pas sur une ligne-label de section.
    var _siteNmHd = String(data.site_name || '');
    var _siteNmHdSpan = _siteNmHd ? '<span style="margin-left:auto;font-size:13px;font-weight:500;letter-spacing:normal;text-transform:none;color:#6b7280;white-space:nowrap;">' + esc(_siteNmHd) + '</span>' : '';
    var head = '<div style="border-bottom:2px solid #1D3BB3;padding-bottom:14px;margin-bottom:22px;">'
      + '<div style="' + (_siteNmHdSpan ? 'display:flex;align-items:baseline;' : '') + 'font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:#1D3BB3;font-weight:600;">Engagement' + _siteNmHdSpan + '</div>'
      + '<div style="font-size:21px;font-weight:600;margin-top:5px;line-height:1.3;">' + esc(cm.committed_action_text || '—') + '</div>'
      + '<div style="font-size:13px;color:#6b7280;margin-top:6px;">' + sub + '</div>'
      + costLine
      + (_ownerDate ? '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">' + _ownerDate + '</div>' : '')
      + '</div>';

    // Bloc KPI-vrai : décidé AVANT le headline — la barre % ne s'émet pas quand la jauge est là.
    var K = data.kpi || null;
    var _kpiActive = !!(K && (K.realized != null || K.goal != null || K.baseline != null));
    var headline, big;
    if (!received.length) {
      var _z = cm.threshold_level === 'net' ? 1.5 : 1.0;
      var _odays = cm.window_days_expected || 7;
      // Objectif libre (base 'pct') : l'objectif affiché est LE % fixé par l'utilisateur —
      // la formule 0,19 ne sert plus que de repli pour les vieux engagements modeste/net.
      // (Bug attrapé par la harness J1 26/07 : +10 % affiché « +7 % ».)
      var _ytgt = (cm.threshold_basis === 'pct' && cm.threshold_value != null)
        ? Math.max(1, Math.round(Number(cm.threshold_value)))
        : Math.max(1, Math.round(_z * 0.19 / Math.sqrt(_odays) * 100));
      var _obase = cm.window_expected_revenue != null ? Number(cm.window_expected_revenue) : null;
      var _ouplift = _obase != null ? Math.round((_obase / _odays) * _ytgt / 100 / 10) * 10 : null;
      var _obj = _ouplift != null
        ? t('q1_objective_eur', { uplift: intfr(_ouplift), pct: _ytgt })
        : t('q1_objective_pct', { pct: _ytgt });
      if (_kpiActive && K.metric !== 'revenue_residual') {
        // KPI non-CA : la phrase d'objectif en € de CA total serait le MAUVAIS référentiel —
        // la cible exacte vit dans la jauge (kFmt + famille), le texte reste neutre.
        headline = '<div style="font-size:13px;color:#6b7280;">' + esc(t('q1_window_started')) + '</div>';
      } else {
        headline = '<div style="font-size:17px;font-weight:600;color:#111827;line-height:1.4;">' + esc(_obj) + '</div>'
          + '<div style="font-size:13px;color:#6b7280;margin-top:6px;">' + esc(t('q1_window_started')) + '</div>';
      }
    } else {
      var _basePct = open ? received[received.length - 1].residual_pct : (aggPct != null ? aggPct : 0); // situation (total residual)
      var _ctxPct = (windowHoliday && hn && hn.pct != null) ? hn.pct : 0;                                // holiday/context portion
      var _actionPct = _basePct - _ctxPct;                                                               // action-attributed
      var _gz = cm.threshold_level === 'net' ? 1.5 : 1.0;
      var _goalPct = Math.max(1, Math.round(_gz * 0.19 / Math.sqrt(cm.window_days_expected || 7) * 100)); // goal as % uplift
      // PRIMARY status — resolved: authoritative verdict; open: SITUATION vs goal (threshold is on the total residual).
      var _stTxt, _stCol;
      if (!open && cm.verdict === 'met') { _stTxt = t('q1_objectif_met'); _stCol = '#059669'; }
      else if (!open && cm.verdict === 'missed') { _stTxt = t('q1_objectif_missed'); _stCol = '#b91c1c'; }
      else if (!open && cm.verdict === 'confounded') { _stTxt = t('q1_objectif_confounded'); _stCol = '#92610a'; }
      else if (_basePct >= _goalPct) { _stTxt = t('q1_ontrack'); _stCol = '#059669'; }
      else { _stTxt = t('q1_below'); _stCol = '#92610a'; }
      // Goal bar — length + colour carry the verdict (attribution stays in the text line below).
      // BELOW goal: scale = goal (goal marker at the END); fill = result in ORANGE, the rest is the gap
      //   still to close. ON/ABOVE: scale = result; goal marker sits partway; up-to-goal = green
      //   (objectif atteint), the surplus beyond = a deeper green (au-delà). On target → all one green.
      var _isBelow = _basePct < _goalPct;
      var _scaleMax = _isBelow ? _goalPct : (_basePct || _goalPct);
      var _resW = _scaleMax > 0 ? Math.max(0, Math.min(_basePct / _scaleMax, 1)) * 100 : 0;   // result fill %
      var _goalM = _scaleMax > 0 ? Math.max(0, Math.min(_goalPct / _scaleMax, 1)) * 100 : 100; // goal marker position %
      var _segs = _isBelow
        ? '<div style="position:absolute;left:0;top:0;height:10px;width:' + _resW.toFixed(1) + '%;background:#E0873A;"></div>'
        : '<div style="position:absolute;left:0;top:0;height:10px;width:' + _goalM.toFixed(1) + '%;background:#10B981;"></div>'
          + '<div style="position:absolute;left:' + _goalM.toFixed(1) + '%;top:0;height:10px;width:' + (100 - _goalM).toFixed(1) + '%;background:#065F46;"></div>';
      // Labels track the geometry: "objectif" sits ABOVE its marker, the result reads BELOW the bar
      // from the "habituel" baseline (0) — so each number is where it is on the bar, no left/right mixup.
      var _labM = Math.max(10, Math.min(90, _goalM)); // keep the goal label inside the bounds
      var _bar = '<div style="margin-top:14px;">'
        + '<div style="position:relative;height:15px;font-size:11.5px;color:#6b7280;"><span style="position:absolute;left:' + _labM.toFixed(1) + '%;transform:translateX(-50%);bottom:0;white-space:nowrap;">' + esc(t('q1_bar_goal', { pct: _goalPct })) + '</span></div>'
        + '<div style="position:relative;height:10px;background:#f0f2f5;">' + _segs
          + '<div style="position:absolute;left:' + _goalM.toFixed(1) + '%;top:-3px;height:16px;width:2px;background:#111827;transform:translateX(-1px);"></div>'
        + '</div>'
        + '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;color:#9ca3af;">'
          + '<span>habituel</span>'
          + '<span><strong style="color:#111827;font-weight:600;">' + (_basePct >= 0 ? '+' : '') + fr(_basePct) + ' %</strong> vs votre résultat habituel</span>'
        + '</div></div>';
      // SECONDARY attribution — split when a holiday effect is present (causal-safe: never counts vacances as the action).
      var _attrib = (_ctxPct !== 0)
        ? t('q1_attrib_split', { action: (_actionPct >= 0 ? '+' : '') + fr(_actionPct), ctx: (_ctxPct >= 0 ? '+' : '') + fr(_ctxPct) })
        : t('q1_attrib_solo', { action: (_actionPct >= 0 ? '+' : '') + fr(_actionPct) });
      // Référentiel du verdict (15/08) : jugé sur le KPI déclaré (bande de bruit incluse) ou
      // sur le CA-résiduel historique — l'infobulle le dit, jamais un verdict muet.
      var _vbTip = '';
      if (!open && cm.verdict) {
        _vbTip = cm.verdict_basis === 'kpi'
          ? ' title="' + esc('Verdict rendu sur votre KPI d\u00e9clar\u00e9 (' + ((K && K.label_fr) || 'KPI') + ')' + (cm.kpi_noise_se != null ? ', bande de bruit \u00b1' + cm.kpi_noise_se : '') + '. Un objectif d\u00e9pass\u00e9 de moins que le bruit du lieu reste \u00ab non concluant \u00bb.') + '"'
          : ' title="' + esc('Verdict rendu sur le CA vs normale (machinerie historique).') + '"';
      }
      headline = '<div' + _vbTip + ' style="font-size:16px;font-weight:600;color:' + _stCol + ';' + (_vbTip ? 'cursor:help;' : '') + '">' + esc(_stTxt) + '</div>'
        + (_kpiActive ? '' : _bar)
        + '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:14px;">' + esc(_attrib) + '</div>'
        + '<div style="font-size:12px;color:#9ca3af;margin-top:6px;">' + esc(t('q1_days_measured', { up: daysUp, n: received.length })) + '</div>';
    }
    var holidayNote = '';
    // Jour 0 (03/08) : fenêtre ouverte SANS aucun jour mesuré → pas de note de partage vacances
    // (elle lirait received[-1] — le crash « Consulter l'évolution » du jour de création).
    if (windowHoliday && hn && hn.pct != null && (received.length || !open)) {
      var _sitPct = open ? received[received.length - 1].residual_pct : (aggPct != null ? aggPct : 0);
      holidayNote = '<div style="margin-top:10px;font-size:12.5px;color:#92610a;background:#FFF8EC;border:1px solid #FBE8C3;border-radius:8px;padding:9px 12px;">'
        + esc(t('q1_split_inputs', { sit: (_sitPct >= 0 ? '+' : '') + fr(_sitPct), hol: (hn.pct >= 0 ? '+' : '') + fr(hn.pct) }));
      if (cm.ctx_material_confound) holidayNote += '<div style="margin-top:6px;"><strong>' + esc(t('to_confirm_label')) + '.</strong> ' + esc(t('to_confirm_holiday')) + '</div>';
      holidayNote += '</div>';
    }
    // ── Bloc Enjeu (proto evolution-j1-proto.html, validé 26/07) ─────────────────────────
    // L'enjeu de la carte d'ORIGINE, gelé à la création (creation_enjeu_*) et rendu VERBATIM :
    // le suffixe du chiffre est le tier_label_fr exact de la pill — page et carte ne peuvent
    // pas diverger. Deux étages : hérité → « Facteur principal de cette journée » (fait calculé,
    // sélection max |€/an| par dayClassRegistry) ; classe directe → coûtent/rapportent selon le
    // signe. Pas d'enjeu gelé → pas de bloc (absence honnête).
    function enjeuBlock() {
      if (cm.creation_enjeu_eur_year == null) return '';
      var eur = Math.abs(Math.round(Number(cm.creation_enjeu_eur_year)));
      var pos = Number(cm.creation_enjeu_eur_year) > 0;
      var tierLbl = cm.creation_enjeu_tier_label_fr ? ' <span style="font-size:12px;font-weight:500;color:#6B7280;">· ' + esc(cm.creation_enjeu_tier_label_fr) + '</span>' : '';
      var cls = String(cm.creation_enjeu_label_fr || '');
      var clsShort = cls.replace(/^jours (de |d’|à )/, '');
      var line = cm.creation_enjeu_inherited
        ? 'Facteur principal de cette journée : ' + esc(clsShort || 'ce motif') + ' — le plus lourd des motifs mesurés ce jour-là chez vous.'
        : 'Ce que ' + (cls ? 'les ' + esc(cls) : 'ces journées') + (pos ? ' vous rapportent en plus' : ' vous coûtent') + ' à l’année, d’après vos ventes.';
      return '<div style="margin:14px 0 0;padding:12px 14px;background:#F8FAFC;border:0.5px solid #E5E7EB;border-radius:10px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;margin-bottom:8px;">Enjeu</div>'
        + '<div style="font-size:21px;font-weight:700;color:#1D3BB3;line-height:1.1;">' + intfr(eur) + ' €/an' + tierLbl + '</div>'
        + '<div style="font-size:12.5px;color:#374151;line-height:1.5;margin-top:6px;">' + line + '</div>'
      + '</div>';
    }
    // ── État J1 (< 2 journées reçues) : frise de fenêtre + consigne de retour ───────────
    // Remplace la courbe tant qu'elle n'est pas traçable. Zéro donnée inventée : dates réelles
    // de la fenêtre, habituel = window_expected_revenue/jours (déjà stocké), objectif = le %
    // fixé par l'utilisateur. Dès la première journée reçue, dayBars(series) prend le relais.
    function j1Block() {
      function addDays(iso, n) { var d = new Date(String(iso) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
      var days = Number(cm.window_days_expected) || 7;
      var startIso = String(cm.window_start || '').slice(0, 10);
      if (!startIso) return '<div style="font-size:13px;color:#9ca3af;padding:8px 0;">Pas encore assez de journées reçues pour tracer la courbe.</div>';
      var dates = []; for (var di = 0; di < days; di++) dates.push(addDays(startIso, di));
      var got = {}; received.forEach(function (d) { got[String(d.date).slice(0, 10)] = true; });
      var n = dates.length, padL = 46, plotW = 706;
      var xOf = function (i) { return n === 1 ? padL + plotW / 2 : padL + i * plotW / (n - 1); };
      var svg = '<svg viewBox="0 0 760 56" style="width:100%;height:auto;margin-top:12px;">'
        + '<line x1="' + padL + '" y1="22" x2="752" y2="22" stroke="#eef1f6" stroke-width="2"/>';
      for (var i = 0; i < n; i++) {
        var x = xOf(i).toFixed(1), last = i === n - 1;
        if (got[dates[i]]) svg += '<circle cx="' + x + '" cy="22" r="' + (last ? 5 : 4) + '" fill="#1D3BB3"/>';
        else if (last) svg += '<circle cx="' + x + '" cy="22" r="5" fill="#fff" stroke="#1D3BB3" stroke-width="1.8"/>';
        else svg += '<circle cx="' + x + '" cy="22" r="4" fill="#fff" stroke="#e5e7eb" stroke-width="1.5"/>';
        var lbl = (i === 0 || last) ? dates[i].slice(8, 10) + '/' + dates[i].slice(5, 7) : String(parseInt(dates[i].slice(8, 10), 10));
        svg += '<text x="' + x + '" y="48" font-size="9" fill="#9ca3af" text-anchor="' + (last ? 'end' : (i === 0 ? 'start' : 'middle')) + '">' + lbl + '</text>';
      }
      svg += '<text x="' + xOf(0).toFixed(1) + '" y="10" font-size="9" fill="#1D3BB3" font-weight="600" text-anchor="start">J1</text>'
        + '<text x="748" y="10" font-size="9" fill="#1D3BB3" font-weight="600" text-anchor="end">verdict</text></svg>';
      var baseDaily = (cm.window_expected_revenue != null && days) ? Math.round(Number(cm.window_expected_revenue) / days) : null;
      var goalPct = (cm.threshold_basis === 'pct' && cm.threshold_value != null) ? Math.round(Number(cm.threshold_value)) : null;
      var consigne = 'Revenez ici pour consulter l’impact de votre action par rapport à '
        + (baseDaily != null ? 'votre CA habituel (' + intfr(baseDaily) + ' €/jour) et à ' : '')
        + 'votre objectif' + (goalPct != null ? ' (+' + goalPct + ' %)' : '') + '. Verdict le ' + msDateFr(String(cm.window_end || '').slice(0, 10)) + '.';
      return svg
        + '<div style="margin-top:10px;padding:12px 14px;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:10px;font-size:13px;color:#1D3BB3;font-weight:600;line-height:1.5;">' + consigne + '</div>'
        + '<div style="font-size:11px;color:#9ca3af;margin-top:6px;">Suivi aussi depuis la carte engagement de votre page Pulse → « Consulter l’évolution ».</div>';
    }
    // ── Mesure KPI-vrai (owner 15/08, proto engagement-kpi-proto validé) : jauge demi-cercle
    // tricolore (< habituel rouge · [habituel, objectif[ orange · >= objectif vert) + points
    // pairs réels. data.kpi absent → rendu historique inchangé (repli honnête).
    function kFmt(v, m) {
      if (v == null) return '\u2014';
      if (m === 'conversion') return (Number(v) * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
      if (m === 'transactions' || m === 'footfall') return Math.round(Number(v)).toLocaleString('fr-FR');
      return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: v < 100 ? 1 : 0, maximumFractionDigits: v < 100 ? 1 : 0 }) + ' \u20ac';
    }
    function kBand(k) {
      if (k.realized == null) return '#9CA3AF';
      if (k.baseline != null && k.realized < k.baseline) return '#b91c1c';
      if (k.goal != null) return k.realized >= k.goal ? '#059669' : '#B45309';
      return '#059669';
    }
    function kGauge(k) {
      var col = kBand(k);
      var mx = Math.max(k.goal || 0, k.realized || 0, k.baseline || 0) * 1.12 || 1;
      function ang(v) { return Math.PI * (1 - Math.max(0, Math.min(1, v / mx))); }
      function gx(a2, r) { return (160 + r * Math.cos(a2)).toFixed(1); }
      function gy(a2, r) { return (150 - r * Math.sin(a2)).toFixed(1); }
      var R = 106, g = '<path d="M 54 150 A 106 106 0 0 1 266 150" fill="none" stroke="#F3F4F6" stroke-width="20" stroke-linecap="round"/>';
      if (k.realized != null && k.realized > 0) g += '<path d="M 54 150 A 106 106 0 0 1 ' + gx(ang(k.realized), R) + ' ' + gy(ang(k.realized), R) + '" fill="none" stroke="' + col + '" stroke-width="20" stroke-linecap="round"/>';
      if (k.baseline != null) {
        var aB = ang(k.baseline);
        g += '<line x1="' + gx(aB, R - 13) + '" y1="' + gy(aB, R - 13) + '" x2="' + gx(aB, R + 13) + '" y2="' + gy(aB, R + 13) + '" stroke="#9CA3AF" stroke-width="2"/>'
          + '<text x="' + gx(aB, R + 24) + '" y="' + gy(aB, R + 24) + '" font-size="9" fill="#9CA3AF" text-anchor="middle">habituel</text>';
      }
      if (k.goal != null) {
        var aG = ang(k.goal);
        g += '<line x1="' + gx(aG, R - 14) + '" y1="' + gy(aG, R - 14) + '" x2="' + gx(aG, R + 14) + '" y2="' + gy(aG, R + 14) + '" stroke="#1D3BB3" stroke-width="3"/>'
          + '<text x="' + gx(aG, R + 26) + '" y="' + gy(aG, R + 26) + '" font-size="9.5" font-weight="650" fill="#1D3BB3" text-anchor="middle">objectif</text>';
      }
      var center, subCtr;
      if (k.realized == null) {
        center = '<text x="160" y="116" font-size="21" font-weight="700" fill="#9CA3AF" text-anchor="middle">\u2014</text>';
        subCtr = k.goal != null ? 'cible ' + kFmt(k.goal, k.metric) : 'mesure \u00e0 venir';
      } else {
        center = '<text x="160" y="116" font-size="22" font-weight="700" fill="' + col + '" text-anchor="middle" style="font-variant-numeric:tabular-nums;">' + esc(kFmt(k.realized, k.metric)) + '</text>';
        if (k.goal != null) {
          var dlt = k.realized - k.goal;
          var dv = Math.abs(k.metric === 'conversion' ? dlt * 100 : dlt);
          subCtr = (dlt >= 0 ? '+' : '\u2212') + dv.toLocaleString('fr-FR', { maximumFractionDigits: dv < 10 ? 1 : 0 })
            + (k.metric === 'conversion' ? ' pt' : (k.metric === 'transactions' || k.metric === 'footfall') ? '' : ' \u20ac')
            + (dlt >= 0 ? ' au-dessus de' : ' sous') + ' l\u2019objectif';
        } else { subCtr = 'sans objectif d\u00e9clar\u00e9 (ancien format)'; }
      }
      var famLbl = k.metric === 'family_revenue' && k.family ? 'CA famille \u00ab ' + k.family + ' \u00bb \u00b7 \u20ac par jour' : k.label_fr;
      return '<svg viewBox="0 0 320 160" style="width:290px;height:auto;flex:none;">' + g + center
        + '<text x="160" y="134" font-size="10.5" fill="#374151" text-anchor="middle">' + esc(subCtr) + '</text>'
        + '<text x="160" y="150" font-size="9.5" fill="#9ca3af" text-anchor="middle">' + esc(famLbl) + '</text></svg>';
    }
    function kDots(k) {
      var col = kBand(k);
      var pts = k.day_of ? (k.peers || []) : (k.daily || []);
      if (!pts.length) return '';
      function jourFr2(iso) { return ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(iso + 'T00:00:00Z').getUTCDay()]; }
      var cap = k.day_of
        ? 'vos ' + pts.length + ' derniers ' + jourFr2(k.daily && k.daily.length ? k.daily[0].date : (k.peers[k.peers.length - 1] || {}).date || '') + 's \u00b7 gros point = le jour mesur\u00e9'
        : 'les ' + pts.length + ' journ\u00e9es de l\u2019op\u00e9ration \u00b7 la jauge = leur moyenne';
      var vals = pts.map(function (p2) { return p2.v; });
      if (k.realized != null && k.day_of) vals.push(k.realized);
      if (k.goal != null) vals.push(k.goal);
      if (k.baseline != null) vals.push(k.baseline);
      var mn = Math.min.apply(null, vals), mxv = Math.max.apply(null, vals);
      var span = (mxv - mn) || 1; mn -= span * 0.07; mxv += span * 0.07; span = mxv - mn;
      function X(v) { return (16 + (v - mn) / span * 388).toFixed(1); }
      var g = '<line x1="12" y1="26" x2="408" y2="26" stroke="#E5E7EB" stroke-width="2"/>';
      pts.forEach(function (p2) { g += '<circle cx="' + X(p2.v) + '" cy="26" r="3.4" fill="#D1D5DB"><title>' + esc(msDateFr(p2.date) + ' \u00b7 ' + kFmt(p2.v, k.metric)) + '</title></circle>'; });
      if (k.baseline != null) g += '<line x1="' + X(k.baseline) + '" y1="16" x2="' + X(k.baseline) + '" y2="36" stroke="#9CA3AF" stroke-width="1.6"/><text x="' + X(k.baseline) + '" y="10" font-size="8.5" fill="#9CA3AF" text-anchor="middle">habituel</text>';
      if (k.goal != null) g += '<line x1="' + X(k.goal) + '" y1="14" x2="' + X(k.goal) + '" y2="38" stroke="#1D3BB3" stroke-width="2.4"/><text x="' + X(k.goal) + '" y="50" font-size="9" font-weight="650" fill="#1D3BB3" text-anchor="middle">objectif</text>';
      if (k.realized != null && k.day_of) g += '<circle cx="' + X(k.realized) + '" cy="26" r="6.5" fill="' + col + '"><title>' + esc('le jour mesur\u00e9 \u00b7 ' + kFmt(k.realized, k.metric)) + '</title></circle>';
      return '<div style="flex:1;min-width:280px;"><svg viewBox="0 0 420 54" style="width:100%;height:auto;">' + g + '</svg><div style="font-size:10.5px;color:#9CA3AF;margin-top:4px;">' + esc(cap) + '</div></div>';
    }
    function kpiChart(k) {
      var pts = k.daily || [];
      if (pts.length < 2) return '';
      var W = 760, H = 200, padL = 46, padT = 10, padB = 26, plotW = W - padL - 8, plotH = H - padT - padB;
      var all = pts.map(function (p2) { return p2.v; });
      if (k.baseline != null) all.push(k.baseline);
      if (k.goal != null) all.push(k.goal);
      var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
      var span = (mx - mn) || 1; mn = Math.max(0, mn - span * 0.12); mx = mx + span * 0.12;
      var n = pts.length;
      var xOf = function (i) { return padL + (n === 1 ? plotW / 2 : i * plotW / (n - 1)); };
      var yOf = function (v) { return padT + plotH - (v - mn) / ((mx - mn) || 1) * plotH; };
      var isPct = k.metric === 'conversion';
      var grid = '', ticks = 4;
      for (var g2 = 0; g2 <= ticks; g2++) {
        var val = mn + (mx - mn) * g2 / ticks, y = yOf(val);
        var tick = isPct ? (val * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %' : Math.round(val).toLocaleString('fr-FR');
        grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - 8) + '" y2="' + y.toFixed(1) + '" stroke="#eef1f6" stroke-width="1"/><text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="#9ca3af" text-anchor="end">' + tick + '</text>';
      }
      var seg = pts.map(function (p2, i) { return xOf(i).toFixed(1) + ',' + yOf(p2.v).toFixed(1); });
      var lbl = '', step = Math.ceil(n / 8);
      for (var i2 = 0; i2 < n; i2 += step) lbl += '<text x="' + xOf(i2).toFixed(1) + '" y="' + (H - 8) + '" font-size="9" fill="#9ca3af" text-anchor="middle">' + parseInt(String(pts[i2].date).slice(8, 10), 10) + '</text>';
      function flat2(v, colr, dash, o) { var y2 = yOf(v).toFixed(1); return '<line x1="' + padL + '" y1="' + y2 + '" x2="' + (W - 8) + '" y2="' + y2 + '" stroke="' + colr + '" stroke-width="1.6" stroke-dasharray="' + dash + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;">' + grid
        + (k.baseline != null ? flat2(k.baseline, '#9ca3af', '5,4') : '')
        + (k.goal != null ? flat2(k.goal, '#1D3BB3', '3,4', '0.85') : '')
        + '<polyline points="' + seg.join(' ') + '" fill="none" stroke="#1D3BB3" stroke-width="2.2"/>' + lbl + '</svg>';
      var famLbl2 = k.metric === 'family_revenue' && k.family ? 'CA famille \u00ab ' + k.family + ' \u00bb' : k.label_fr;
      return svg + '<div style="display:flex;gap:16px;margin-top:6px;font-size:12px;color:#374151;flex-wrap:wrap;">'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#1D3BB3" stroke-width="2.2"/></svg>' + esc(famLbl2) + '</span>'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#9ca3af" stroke-width="1.6" stroke-dasharray="5,4"/></svg>habituel</span>'
        + (k.goal != null ? '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#1D3BB3" stroke-width="1.6" stroke-dasharray="3,4"/></svg>objectif</span>' : '') + '</div>';
    }
    var kBlock = _kpiActive
      ? '<div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap;margin-top:14px;">' + kGauge(K) + kDots(K) + '</div>'
      : '';

    // La jauge remplace la barre % (même travail, bon référentiel) — la barre reste le repli
    // quand le bloc KPI est absent. Courbe : non-K1 multi-jours → unité KPI ; K1 → courbe CA
    // historique + ligne d'objectif ; jour-m\u00eame → jauge + pairs (une courbe d'1 point ment).
    var chartArea;
    if (K && K.day_of) chartArea = (open && !received.length) ? j1Block() : '';
    else if (K && K.metric !== 'revenue_residual' && (K.daily || []).length >= 2) chartArea = kpiChart(K);
    else chartArea = (received.length ? dayBars(series, K && K.goal_pct != null ? K.goal_pct : null) : j1Block());
    var q1 = '<div class="eg-sec"><div class="eg-uc">' + esc(t('q1_title_decision')) + '</div>' + headline + kBlock + holidayNote + enjeuBlock()
      + (chartArea ? '<div style="margin-top:16px;">' + chartArea + '</div>' : '') + '</div>';

    var q3 = advice.length ? '<div class="eg-sec"><div class="eg-uc">' + esc(t('q3_title')) + '</div>' + adviceHtml(advice) + '</div>' : '';
    var q4 = captureHtml(cm);

    // ── Diagnostic + advice — shown only when UNDER-performing (open below goal, or resolved missed).
    // Contexte externe = surfaced from the per-day series + measured weather assoc (confidence via n);
    // Exécution = an ephemeral self-check (routes advice client-side, no new column); Le levier last.
    var _dBase = received.length ? (open ? received[received.length - 1].residual_pct : (aggPct != null ? aggPct : 0)) : null;
    var _dCtx = (windowHoliday && hn && hn.pct != null) ? hn.pct : 0;
    var _dAction = _dBase != null ? _dBase - _dCtx : 0;
    var _dGoal = Math.max(1, Math.round((cm.threshold_level === 'net' ? 1.5 : 1.0) * 0.19 / Math.sqrt(cm.window_days_expected || 7) * 100));
    var _under = !!received.length && ((open && _dBase < _dGoal) || (!open && cm.verdict === 'missed'));
    // State -> intent — ties the analog to the "Votre action paie-t-elle ?" verdict (same status as the
    // headline): below -> pivot (what else to try) · aligned/confounded -> reinforce (push it) · above ->
    // scale (make it last). The block shows in ALL three states, with the analog that fits.
    var _state = null;
    if (received.length) {
      if (!open) _state = (cm.verdict === 'met') ? 'above' : (cm.verdict === 'missed') ? 'below' : 'aligned';
      else _state = (_dBase >= _dGoal) ? 'above' : 'below';
    }
    var _intent = _state ? ({ below: 'pivot', aligned: 'reinforce', above: 'scale' })[_state] : null;
    // Reusable "lieux comparables" renderer — intent-filtered plays (data.best_in_class), intent-specific
    // framing. An analog to try, never a promised result: outcome shown as the source reported it, cited.
    function _bicBlock(intent) {
      var plays = (data.best_in_class || []).filter(function (p) { return p.intent === intent; }).slice(0, 2);
      if (!plays.length) return '';
      return '<div style="margin-top:16px;">'
        + '<div class="eg-uc">' + esc(t('diag_bic_title')) + '</div>'
        + '<div style="font-size:11.5px;color:#9ca3af;margin-bottom:10px;">' + esc(t('diag_bic_caption_' + intent) || t('diag_bic_caption')) + '</div>'
        + plays.map(function (p) {
            var conf = t('diag_bic_conf_' + (p.confidence || 'faible')) || '';
            var steps = (p.steps || []).filter(Boolean);
            var stepsHtml = steps.length ? '<details style="margin-top:8px;"><summary style="font-size:12.5px;color:#1D3BB3;cursor:pointer;">' + esc(t('diag_bic_howto')) + '</summary><ol style="margin:8px 0 0;padding-left:18px;font-size:12.5px;color:#374151;line-height:1.6;">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></details>' : '';
            var src = p.source_url ? '<a href="' + esc(p.source_url) + '" target="_blank" rel="noopener" style="font-size:11.5px;color:#6b7280;text-decoration:underline;">' + esc(t('diag_bic_source')) + ' : ' + esc(p.source_name) + (p.published_at ? ' (' + esc(p.published_at) + ')' : '') + '</a>' : '';
            return '<div style="background:#fff;border:1px solid #e5e7eb;padding:13px 15px;margin-bottom:10px;">'
              + '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;"><span style="font-size:13.5px;font-weight:600;color:#111827;">' + esc(p.title) + '</span>' + (conf ? '<span style="font-size:10.5px;color:#5f5e5a;background:#f1efe8;padding:2px 7px;white-space:nowrap;">' + esc(conf) + '</span>' : '') + '</div>'
              + (p.context ? '<div style="font-size:12px;color:#9ca3af;line-height:1.5;margin-top:3px;">' + esc(p.context) + '</div>' : '')
              + '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:8px;">' + esc(p.move) + '</div>'
              + '<div style="font-size:13px;color:#0F6E56;line-height:1.55;margin-top:6px;"><strong>' + esc(t('diag_bic_result')) + '</strong> : ' + esc(p.outcome) + '</div>'
              + stepsHtml
              + (src ? '<div style="margin-top:8px;">' + src + '</div>' : '')
            + '</div>';
          }).join('')
        + '</div>';
    }
    // ── Move-decision inputs — computed whenever OPEN (the user ALWAYS authors the next move) ──
    var _execQ = cm.execution_quality || null;                                       // persisted self-check
    var _mh = {}; (data.move_stats || []).forEach(function (s) { _mh[s.move] = s; }); // local move hit-rates
    var _pW = series.filter(function (d) { return d.has_data && d.impact_weather_pct != null && d.impact_weather_pct < 0; }).length;
    var _pE = series.filter(function (d) { return d.has_data && d.event_count != null && d.event_count > 0; }).length;
    var _pH = (ctx && ctx.school_days) ? ctx.school_days : series.filter(function (d) { return d.is_school_holiday; }).length;
    var _bits = [];
    if (_pW) _bits.push(t('diag_ext_weather', { n: _pW }));
    if (_pE) _bits.push(t('diag_ext_events', { n: _pE }));
    if (_pH) _bits.push(t('diag_ext_holiday', { n: _pH }));
    var _notable = _bits.length > 0;
    // Recommended move by state: above → Doubler (it's working, push it); below run-clean+calm → Pivoter
    // (the plan is the suspect); below not-fully-run → Poursuivre (run it); aligned → Poursuivre.
    var _recMove = null;
    if (open) {
      if (_state === 'above') _recMove = 'doubler';
      else if (_under) _recMove = _execQ ? (_execQ === 'complete' ? (_notable ? 'poursuivre' : 'pivoter') : 'poursuivre') : null;
      else _recMove = 'poursuivre';
    }
    // Contexte de la version (etape 3, 27/08) — la calibration lit la derniere version RESOLUE
    // de la chaine (jamais l'effet partiel de la version ouverte : ce serait la lecture
    // intermediaire, etape 4). Dispositif ecarte (effet negatif prouve) => pivoter recommande.
    var _lastRes = (data.lineage || []).filter(function (v) { return v.status === 'resolved' && v.effect_pct != null; }).pop() || null;
    if (open && _lastRes && _lastRes.effect_proven && _lastRes.effect_pct < 0) _recMove = 'pivoter';
    // Lecture du jour (etape 4, 27/08) — l'etat DATE de la version ouverte, sur LE KPI choisi
    // quand il est actif (K.daily), sinon sur le residu CA (received). Le routage passe par le
    // badge « recommande » des puces EXISTANTES — jamais un bouton de plus — et seulement apres
    // au moins 3 bilans jour ; la route negative exige au moins 3 journees negatives (owner
    // 27/08 : jamais sur 1 signal). Les jours recus de la version courante priment l'ecarte.
    var _lect = null;
    if (open) {
      var _lPts = (_kpiActive && K.daily && K.daily.length) ? K.daily.filter(function (p) { return p.v != null; }) : null;
      if (_lPts && _lPts.length) {
        var _lAvg = _lPts.reduce(function (s, p) { return s + p.v; }, 0) / _lPts.length;
        var _lNeg = K.baseline != null ? _lPts.filter(function (p) { return p.v < K.baseline; }).length : 0;
        var _lMet = K.goal != null ? _lAvg >= K.goal : (K.baseline != null ? _lAvg >= K.baseline : false);
        var _lSig = (cm.kpi_noise_se != null && K.baseline != null) ? Math.abs(_lAvg - K.baseline) >= Number(cm.kpi_noise_se) : false;
        _lect = { date: _lPts[_lPts.length - 1].date, n: _lPts.length, met: _lMet, nNeg: _lNeg, sigUp: _lMet && _lSig && _lAvg > K.baseline };
      } else if (received.length) {
        var _lNegR = received.filter(function (d) { return d.residual_pct != null && d.residual_pct < 0; }).length;
        _lect = { date: received[received.length - 1].date, n: received.length, met: _dBase >= _dGoal, nNeg: _lNegR, sigUp: _dBase >= _dGoal };
      }
    }
    if (_lect && _lect.n >= 3) {
      if (!_lect.met && _lect.nNeg >= 3) _recMove = 'pivoter';
      else if (_lect.sigUp) _recMove = 'doubler';
    }
    var _lectHtml = '';
    if (_lect) {
      _lectHtml = '<div style="margin-bottom:12px;"><div style="font-size:12.5px;font-weight:600;color:#111827;">'
        + esc(t('lecture_line', { date: msDateFr(_lect.date), n: _lect.n, jours: _lect.n > 1 ? 'jours reçus' : 'jour reçu', etat: _lect.met ? 'atteint' : 'pas atteint' })) + '</div>'
        + (_lect.n >= 3 && !_lect.met && _lect.nNeg >= 3
          ? '<div style="font-size:12.5px;color:#B45309;margin-top:3px;">' + esc(t('lecture_down', { n: _lect.nNeg })) + '</div>'
          : (_lect.n >= 3 && _lect.sigUp ? '<div style="font-size:12.5px;color:#0F6E56;margin-top:3px;">' + esc(t('lecture_up')) + '</div>' : ''))
        + '</div>';
    }
    
    var _mc = function (m, title, desc) {
      var st = _mh[m];
      var track = (st && st.attempts >= 2) ? '<div style="font-size:11.5px;color:#1D3BB3;margin-top:5px;">' + esc(t('move_track', { hits: st.hits, attempts: st.attempts })) + '</div>' : '';
      var rec = (m === _recMove) ? ' <span style="font-size:11px;font-weight:600;color:#1D3BB3;background:#E6ECFF;padding:2px 8px;margin-left:4px;">' + esc(t('diag_recommended')) + '</span>' : '';
      return '<button type="button" data-move="' + m + '" style="display:block;width:100%;text-align:left;box-sizing:border-box;background:#fff;border:1px solid #e5e7eb;padding:12px 14px;margin-bottom:8px;cursor:pointer;font-family:inherit;"><div style="font-size:14px;font-weight:500;color:#111827;">' + esc(title) + rec + '</div><div style="font-size:12.5px;color:#6b7280;line-height:1.5;margin-top:2px;">' + esc(desc) + '</div>' + track + '</button>';
    };

    // ── Contexte externe — le MÊME contenu que l'ancienne carte « 1 · Contexte externe » du
    // panneau « Pourquoi en-dessous ? », désormais rendu dans « Comprendre le résultat » (il
    // répond à la même question) et dans LES DEUX états : le contexte explique un bon jour
    // autant qu'un mauvais. Rien n'est perdu — seule sa place change (owner 28/08).
    var ctxCard = '';
    if (received.length) {
      var _wa = ctx && ctx.weather_assoc;
      var _wm = _wa && _wa.cool_n >= 5 && _wa.mild_n >= 5 && _wa.cool_avg != null && _wa.mild_avg != null;
      ctxCard = '<div style="font-size:13px;color:#374151;line-height:1.55;">' + (_notable ? esc(_bits.join(' · ') + '.') : esc(t('diag_ext_none'))) + '</div>'
        + (_wm ? '<div style="font-size:12.5px;color:#374151;line-height:1.5;margin-top:6px;">' + esc(t('diag_ext_weather_meas', { cool: intfr(Math.round(_wa.cool_avg)), mild: intfr(Math.round(_wa.mild_avg)) })) + ' <span style="font-size:11px;color:#1D3BB3;">' + esc(t('diag_ext_chip_meas')) + '</span></div>' : '')
        + '<div style="font-size:12.5px;line-height:1.5;margin-top:6px;color:' + (_notable ? '#92610a' : '#059669') + ';">' + esc(_notable ? t('diag_ext_partial') : t('diag_ext_calm')) + '</div>';
    }
    // Exécution — le même auto-diagnostic (data-exec, câblage inchangé), rapatrié DANS
    // « Ajuster le dispositif » : il ne décrit pas le résultat, il route le move recommandé.
    var execCard = '';
    if (open && _under) {
      execCard = '<div style="background:#fff;border:1px solid #e5e7eb;border-left:3px solid #92610a;padding:14px 16px;margin-bottom:12px;">'
        + '<div style="font-size:14px;font-weight:500;color:#111827;">' + esc(t('diag_exec_title')) + '</div>'
        + '<div style="font-size:13px;color:#374151;line-height:1.55;margin:8px 0 10px;">' + esc(t('diag_exec_q')) + '</div>'
        + '<div style="display:flex;gap:8px;">'
          + '<button type="button" data-exec="complete" style="' + doneBtnStyle(_execQ === 'complete') + '">' + esc(t('diag_exec_yes')) + '</button>'
          + '<button type="button" data-exec="partial" style="' + doneBtnStyle(_execQ === 'partial') + '">' + esc(t('diag_exec_partial')) + '</button>'
          + '<button type="button" data-exec="none" style="' + doneBtnStyle(_execQ === 'none') + '">' + esc(t('diag_exec_no')) + '</button>'
        + '</div></div>';
    }

    // ── « La version suivante » (etape 3, 27/08) — le sous-formulaire du re-commit : la V(n+1)
    // n'herite plus en silence. Objectif recalibre depuis la derniere version RESOLUE ; champs
    // owner : Levier, Etape de la vente (derivee du KPI), Ressource(s), Responsable(s),
    // Le plus du dispositif, Pourquoi ca va marcher. Masque quand le move choisi est stop.
    var _vformHtml = function () {
      var stage = ({ visitors: 'Flux', conversion: 'Conversion', transactions: 'Transaction', avg_basket: 'Panier' })[String(cm.measured_metric || '').split(':')[0]] || null;
      var curGoal = (cm.threshold_basis === 'pct' && cm.threshold_value != null) ? Number(cm.threshold_value) : null;
      var propGoal = curGoal, calib = '';
      if (_lastRes && _lastRes.effect_pct > 0) {
        propGoal = Math.max(1, Math.ceil(_lastRes.effect_pct));
        calib = t('vform_goal_calib', { n: _lastRes.version_no, pct: '+' + String(Math.round(_lastRes.effect_pct * 10) / 10).replace('.', ',') + ' %', goal: propGoal });
      }
      var inp = 'width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:12.5px;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;';
      var lab = function (txt) { return '<div style="font-size:12.5px;font-weight:500;color:#374151;margin:12px 0 4px;">' + esc(txt) + '</div>'; };
      // REPLIÉ tant qu'aucun move n'est choisi (owner 28/08) : déplié, ce formulaire de dix
      // champs occupait la moitié de la page avant même qu'on ait décidé quoi que ce soit.
      // La page le montre au clic sur un move (wireDiag) — le formulaire lui-même est intact.
      return '<div data-vform style="display:none;margin-top:16px;border-top:1px solid #eef1f6;padding-top:14px;">'
        + '<div style="font-size:13px;font-weight:600;color:#111827;">' + esc(t('vform_title'))
        + (stage ? ' <span style="font-size:11px;color:#374151;background:#f1efe8;padding:2px 8px;margin-left:6px;">' + esc(t('vform_stage')) + ' : ' + stage + '</span>' : '') + '</div>'
        + lab(t('vform_goal'))
        + '<div style="display:flex;align-items:center;gap:6px;"><input data-vform-goal type="number" min="1" max="100" step="1" value="' + (propGoal != null ? propGoal : '') + '" style="width:72px;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px;font-weight:600;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;text-align:right;" /><span style="font-size:12px;color:#6b7280;">%</span></div>'
        + (calib ? '<div style="font-size:11.5px;color:#1D3BB3;margin-top:4px;">' + esc(calib) + '</div>' : '')
        + lab(t('vform_lever')) + '<textarea data-vform-lever style="' + inp + 'resize:none;min-height:48px;">' + esc(cm.committed_action_text || '') + '</textarea>'
        + lab(t('vform_resp')) + '<input data-vform-resp data-cm-owner value="' + esc(cm.owner_person_name || '') + '" style="' + inp + '" />'
        + '<div data-cm-owner-sugg style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;"></div>'
        + lab(t('vform_res')) + '<input data-vform-res value="' + esc(cm.dispositif_resources || '') + '" style="' + inp + '" />'
        + lab(t('vform_cost')) + '<div style="display:flex;align-items:center;gap:6px;"><input data-vform-cost type="number" min="0" step="10" value="' + (cm.operation_cost_eur != null ? esc(String(cm.operation_cost_eur)) : '') + '" style="width:120px;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;box-sizing:border-box;text-align:right;" /><span style="font-size:12px;color:#6b7280;">\u20ac</span></div>'
        + lab(t('vform_plus')) + '<textarea data-vform-plus style="' + inp + 'resize:none;min-height:48px;">' + esc(cm.dispositif_plus || '') + '</textarea>'
        + lab(t('vform_why')) + '<textarea data-vform-why style="' + inp + 'resize:none;min-height:48px;">' + esc(cm.dispositif_why || '') + '</textarea>'
        + '</div>';
    };

    // ── Your next move — UNIVERSAL for open commitments: the owner authors their OWN strategy in every
    // state (below/aligned/above), never only consuming best-practices. Diagnosis explains, this decides.
    var moveForm = '';
    if (open) {
      moveForm = '<div class="eg-sec">'
        + '<div class="eg-uc">' + esc(t('move_title')) + '</div>'
        + _lectHtml
        // « Ça marche » ne se dit qu'avec des journées reçues — à J1 (zéro donnée), intro
        // neutre (bug attrapé par la harness J1 26/07 : verdict fabriqué sans données).
        + '<div style="font-size:13px;color:#6b7280;line-height:1.55;margin-bottom:12px;">' + esc((_under || !received.length) ? t('diag_move_intro') : t('move_intro_ontrack')) + '</div>'
        + execCard
        + _mc('poursuivre', t('move_poursuivre'), t('move_poursuivre_d'))
        + _mc('doubler', t('move_doubler'), t('move_doubler_d'))
        + _mc('pivoter', t('move_pivoter'), t('move_pivoter_d'))
        + _mc('stop', t('move_stop'), t('move_stop_d'))
        + '<div style="font-size:13px;font-weight:500;color:#374151;margin:14px 0 6px;" data-adjust-noteq>' + esc(t('diag_move_note_q')) + '</div>'
        + '<textarea data-adjust-note placeholder="' + esc(_moveHint(cm.origin_action_type)) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:9px 11px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:60px;box-sizing:border-box;"></textarea>'
        + '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + esc(t('diag_move_hint_caption')) + '</div>'
        + _vformHtml()
        + '<div style="display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:14px;"><span data-adjust-msg style="font-size:12px;color:#b91c1c;"></span><button type="button" data-adjust-submit style="font-size:13px;font-weight:600;color:#fff;background:#1D3BB3;border:none;padding:9px 16px;cursor:pointer;font-family:inherit;">' + esc(t('diag_move_cta')) + '</button></div>'
        + '<div data-diag-form style="margin-top:10px;"></div>'
        + '<div style="background:#fafbfd;border:1px solid #eef1f6;padding:12px 16px;margin-top:16px;"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:500;margin-bottom:4px;">' + esc(t('diag_capitalise_title')) + '</div><div style="font-size:12.5px;color:#6b7280;line-height:1.55;">' + esc(t('diag_capitalise_body')) + '</div></div>'
      + '</div>';
    }

    // ── Best-in-class — a REFERENCE beneath the owner's own decision (intent = the verdict) ──
    var _refIntent = _under ? 'pivot' : _intent;
    var bicRef = '';
    if (_refIntent) {
      var _bicBody = _bicBlock(_refIntent);
      if (_bicBody) bicRef = '<div class="eg-sec">' + _bicBody + '</div>';
      else if (_under) bicRef = '<div class="eg-sec"><div style="background:#fff;border:1px dashed #d7ddea;padding:12px 16px;opacity:.85;font-size:13px;color:#6b7280;">' + esc(t('diag_bic_title')) + ' <span style="font-size:11px;color:#9ca3af;">— ' + esc(t('diag_soon')) + '</span></div></div>';
    }

    var srcRows = [t('src_caisse'), t('src_learning', { days: prov.history_days || 0 }), t('src_weather'), t('src_events'), t('src_tourism')];
    srcRows.push(prov.track_record ? t('src_track_record', { beat: prov.track_record.beat, done: prov.track_record.done }) : t('src_track_pending'));
    // The case studies actually shown (same intent + slice as _bicBlock) are cited here too, not just inline.
    var _bicSrc = (data.best_in_class || []).filter(function (p) { return p.intent === _refIntent && p.source_name; }).slice(0, 2).map(function (p) { return p.source_name; });
    if (_bicSrc.length) srcRows.push(t('src_bestinclass', { list: _bicSrc.join(', ') }));
    var sources = '<div class="eg-sec" style="margin-bottom:0;"><div class="eg-uc">' + esc(t('sources_title')) + '</div>'
      + '<div style="font-size:12.5px;color:#6b7280;line-height:1.9;">' + srcRows.map(function (s) { return '<div>· ' + esc(s) + '</div>'; }).join('') + '</div></div>';

    // Diagnosis explains (under only) → the owner DECIDES (moveForm, universal for open) → best-in-class
    // is the reference beneath. Resolved commitments skip moveForm (q4 = Documenter is the mechanism).
    // LA CHAINE LUE (27/08, chantier versionning) : l'historique du dispositif, une ligne par
    // version, chacune avec SON verdict (mots arbitres : objectif atteint / manque / non
    // concluant) et SON effet sur SON KPI. Rendu seulement si la chaine compte >1 version.
    var lineageB = '';
    var _lin = Array.isArray(data.lineage) ? data.lineage : [];
    if (_lin.length > 1) {
      var _linVerdict = { met: 'objectif atteint', missed: 'objectif manqu\u00e9', confounded: 'objectif non concluant' };
      var _linFrD = function (iso) { var d = String(iso || '').slice(0, 10); return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : ''; };
      var _linPct = function (n) { if (n == null) return ''; var v = Math.round(Math.abs(Number(n)) * 10) / 10; return (Number(n) >= 0 ? '+' : '\u2212') + String(v).replace('.', ',') + ' %'; };
      lineageB = '<div style="background:#fafbfd;border:1px solid #eef1f6;padding:12px 16px;margin-top:16px;">'
        + '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;margin-bottom:8px;">Historique du dispositif</div>'
        + _lin.map(function (v) {
            var line = 'Version ' + v.version_no + ' \u2014 du ' + _linFrD(v.window_start) + ' au ' + _linFrD(v.window_end);
            if (v.status === 'open') { line += ' : en cours, verdict d\u2019ici le ' + _linFrD(v.window_end) + '.'; }
            else {
              var vd = _linVerdict[v.verdict] || 'sans verdict';
              var eff = v.effect_pct != null ? ' \u2014 ' + _linPct(v.effect_pct) + (v.kpi_mention_fr ? ' ' + v.kpi_mention_fr : '') + ' vs votre r\u00e9sultat habituel' + (v.effect_proven ? ' (effet prouv\u00e9)' : '') : '';
              line += ' : ' + vd + eff + '.';
            }
            return '<div style="font-size:13px;color:#374151;line-height:1.7;' + (v.is_current ? 'font-weight:600;' : '') + '">' + esc(line) + (v.is_current ? ' <span style="color:#6B7280;font-weight:500;">(ce test)</span>' : '') + '</div>';
          }).join('')
        + '</div>';
    }
    // ── LES DEUX ÉTATS (owner 28/08) ────────────────────────────────────────────────────
    // EN COURS — la page PILOTE : ce que le dispositif est → où il en est → d'où vient
    //   l'écart → quoi ajuster. Aucun feedback ici (le rail refuse déjà le rétro avant
    //   résolution : la page dit enfin la même chose que la mécanique).
    // TERMINÉE — la page CONCLUT : le verdict → d'où il vient → ce qui a été fait →
    //   Documenter → la suite (conseils, historique, dispositifs comparables).
    var shapeB = shapeBlock(data.shape || null, ctxCard, received.length, series.length);
    if (open) return head + dispoBlock(cm, true) + q1 + shapeB + moveForm + bicRef + lineageB + sources;
    return head + q1 + shapeB + dispoBlock(cm, false) + q4 + q3 + lineageB + bicRef + sources;
  }


  // footfall_vs_basket_decomposition — "d'où vient le mouvement" : trafic (ventes) vs panier moyen,
  // the dominant driver highlighted, + the persistent trend and the next steps.
  function renderSalesDecomp(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Décomposition ventes / panier indisponible pour ce jour.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.point && j.point.rev != null) {
      html += '<div style="font-size:12px;color:#9CA3AF;margin-bottom:10px;">CA du jour ' + frInt(j.point.rev) + ' €'
        + (j.point.avg30 != null ? ' · habituel (30 j) ' + frInt(j.point.avg30) + ' €' : '')
        + (j.point.rev_vs_pct != null ? ' (' + msPct(j.point.rev_vs_pct) + ')' : '') + '</div>';
    }
    if (j.split && j.split.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:6px 0 0;">D’où vient le mouvement :</div>'
        + msStrip(j.split.map(function (s) {
          var mid = (s.delta_pct != null ? msPct(s.delta_pct) : '—') + (s.value ? ' · ' + s.value : '');
          return { top: s.label, mid: mid, highlight: !!s.dominant, tone: (s.dominant ? 'warn' : 'default') };
        }));
    }
    if (j.trend && j.trend.note) html += '<div style="font-size:12px;color:#9CA3AF;margin-top:8px;line-height:1.5;">' + esc(j.trend.note) + '</div>';
    if (j.scale) html += msScale(j.scale);
    return html;
  }

  // Shared stake block — is this a pattern (recurrence) and is it worth acting on (€/an at stake)?
  // The € is DESCRIPTIVE (what you spend / what these days represent), never a causal "acting earns +X".
  // Kicker « Ampleur » → « Enjeu » PARTOUT (owner 26/07) : même concept que les pills des cartes,
  // donc même mot — un concept = un mot.
  function msScale(s) {
    if (!s || (s.annual_eur == null && !s.headline && !s.enjeu && !s.recurrence)) return '';
    var out = '<div style="margin:14px 0 0;padding:12px 14px;background:#F8FAFC;border:0.5px solid #E5E7EB;border-radius:10px;">'
      + '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;margin-bottom:8px;">Enjeu</div>';
    if (s.annual_eur != null) out += '<div style="font-size:21px;font-weight:700;color:#1D3BB3;line-height:1.1;">≈ ' + frInt(Math.round(s.annual_eur)) + ' €'
      + (s.annual_label ? ' <span style="font-size:12px;font-weight:500;color:#6B7280;">' + esc(s.annual_label) + '</span>' : '') + '</div>';
    else if (s.headline) out += '<div style="font-size:21px;font-weight:700;color:#1D3BB3;line-height:1.1;">' + esc(s.headline) + '</div>';
    if (s.enjeu) out += '<div style="font-size:12.5px;color:#374151;line-height:1.5;margin-top:6px;">' + esc(s.enjeu) + '</div>';
    if (s.recurrence) out += '<div style="font-size:12px;color:#9CA3AF;line-height:1.5;margin-top:6px;">' + esc(s.recurrence) + '</div>';
    return out + '</div>';
  }

  // sales_discount_no_lift — "Remises sans effet" : do discount days actually earn more? Compares CA on
  // high- vs low-discount days; when they don't outperform, the promos are wasted margin.
  function renderSalesDiscount(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Analyse des remises indisponible pour ce lieu.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.point && j.point.disc_pct != null) {
      html += '<div style="font-size:12px;color:#9CA3AF;margin-bottom:10px;">Remise ce jour ' + String(j.point.disc_pct).replace('.', ',') + ' %'
        + (j.point.base_pct != null ? ' · habituel ' + String(j.point.base_pct).replace('.', ',') + ' %' : '') + '</div>';
    }
    if (j.compare && j.compare.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:6px 0 0;">La remise fait-elle vendre plus ?</div>'
        + msStrip(j.compare.map(function (c) {
          return { top: c.label, mid: (c.value || ''), highlight: !!c.dominant, tone: (c.dominant ? 'ok' : (c.bad ? 'danger' : 'default')) };
        }));
    }
    if (j.window && j.window.n) html += '<div style="font-size:12px;color:#9CA3AF;margin-top:8px;line-height:1.5;">Sur ' + j.window.n + ' jours — remise moyenne ' + String(j.window.avg_disc_pct).replace('.', ',') + ' %.</div>';
    if (j.scale) html += msScale(j.scale);
    if (j.caveat) html += '<div style="font-size:11px;color:#9CA3AF;margin-top:8px;font-style:italic;line-height:1.5;">' + esc(j.caveat) + '</div>';
    return html;
  }

  // extended_bad_weather — the extended weather WINDOW as a planning frame: the run of days, the venue's
  // OWN measured CA response to that condition (heat can be an OPPORTUNITY, not a threat), + next steps.
  function renderWeatherWindow(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de pr\u00e9vision m\u00e9t\u00e9o prolongée à venir.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.window && j.window.strip && j.window.strip.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:8px 0 0;">Les jours :</div>'
        + msStrip(j.window.strip.map(function (s) {
          return { top: s.day, mid: (s.temp || ('niv. ' + s.level)), highlight: !!s.peak, tone: 'warn' };
        }));
    }
    if (j.measured && j.impact) {
      html += '<div style="font-size:12px;color:#6B7280;margin:12px 0 0;">Votre CA sur ces conditions (mesuré, n=' + j.impact.n + ') :</div>'
        + msStrip([
          { top: 'CA', mid: msPct(j.impact.ca_delta), highlight: true, tone: (j.impact.ca_delta >= 0 ? 'ok' : 'danger') },
          { top: 'Fréquentation', mid: (j.impact.txns_delta != null ? msPct(j.impact.txns_delta) : '—'), tone: 'default' },
          { top: 'Panier', mid: (j.impact.basket_delta != null ? msPct(j.impact.basket_delta) : '—'), tone: 'default' }
        ]);
    }
    if (j.scale) html += msScale(j.scale);
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    if (j.caveat) html += '<div style="font-size:11px;color:#9CA3AF;margin-top:8px;font-style:italic;line-height:1.5;">' + esc(j.caveat) + '</div>';
    return html;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ANSWER BLOCKS (Phase 3) — the ONE renderer for the Consulter chat answer.
  // ie-prompt.js adapts the response envelope into an ordered blocks[] and calls
  // renderAnswerBlocks; every block type maps to ONE primitive below. This kills the six divergent
  // per-intent HTML builders — layout decisions live here, in the same kit as the family cards, so
  // prose and cards share one type scale and the harness renders exactly what the page ships.
  //
  // Every style value below is COPIED from the prompt.astro class it replaces (quoted in comments) —
  // no invented colors, no new control shapes (pulse-ui rule). Inline styles per kit convention
  // (injected HTML; the harness has no page CSS).
  //
  // TRUTH RULES the renderer enforces:
  //   • register is REQUIRED: a blocks[] without one renders the LEAST-trusted pill ("Non vérifié")
  //     and logs — provenance can be omitted only downward, never silently upgraded (plan R1/R5).
  //     Exception: a set whose only content is a clarification/confirmation asserts nothing → no pill.
  //   • prose is model-authored → mdBlockToSafeHtml (escape FIRST, then whitelist: **gras**, *italique*,
  //     "- " bullets, \n\n paragraphs). Never raw HTML from a payload string.
  // ────────────────────────────────────────────────────────────────────────────

  function mdInlineKit(t) {
    return t
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  }
  // Block-level safe markdown: escape → paragraphs (\n\n) → "- " bullet runs → inline bold/italic.
  // Whitelist only; #titres / tables / links / raw HTML stay inert text.
  function mdBlockToSafeHtml(text) {
    var parts = String(text == null ? '' : text).split(/\n{2,}/);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var lines = p.split('\n');
      var buf = [], list = [];
      var flushList = function () {
        if (!list.length) return;
        // .ie-ai-list ul { margin:0 0 14px 18px; }  li { margin:6px 0; }
        out += '<ul style="margin:0 0 14px 18px;padding:0;">'
          + list.map(function (li) { return '<li style="margin:6px 0;">' + mdInlineKit(esc(li)) + '</li>'; }).join('')
          + '</ul>';
        list = [];
      };
      var flushBuf = function () {
        if (!buf.length) return;
        // .ie-ai-p { font-size:17px; line-height:1.7; margin:0 0 14px; } (inherits bubble size on page)
        out += '<div style="margin:0 0 14px 0;">' + mdInlineKit(esc(buf.join('\n'))).replace(/\n/g, '<br/>') + '</div>';
        buf = [];
      };
      for (var l = 0; l < lines.length; l++) {
        var m = lines[l].match(/^\s*[-•]\s+(.+)$/);
        if (m) { flushBuf(); list.push(m[1]); } else { flushList(); buf.push(lines[l]); }
      }
      flushList(); flushBuf();
    }
    return out;
  }

  // Register pill — values identical to the Phase 0 pill in ie-prompt.js (design-tokens pill-safe /
  // source-low / source-mid). vetted #0b37e5/#fff · web #F3F4F6/#6b7280 · model #FDE8D8/#C2410C.
  // inc ② (C1, owner-approved): on a VETTED answer carrying a cited-fact count, the pill extends —
  // « Vérifié · 5 faits cités » — zero new UI, and only when the count is real (never padded).
  function abRegister(reg, factsCited) {
    var label, bg, color;
    if (reg === 'vetted') {
      label = 'Vérifié';
      if (typeof factsCited === 'number' && isFinite(factsCited) && factsCited > 0) {
        label += ' · ' + factsCited + ' fait' + (factsCited > 1 ? 's' : '') + ' cité' + (factsCited > 1 ? 's' : '');
      }
      bg = '#0b37e5'; color = '#ffffff';
    }
    else if (reg === 'web') { label = 'Web — non vérifié'; bg = '#F3F4F6'; color = '#6b7280'; }
    else { label = 'Non vérifié'; bg = '#FDE8D8'; color = '#C2410C'; }
    return '<div style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:' + bg + ';color:' + color + ';margin-bottom:10px;letter-spacing:.04em;">' + label + '</div>';
  }

  // Segments of a `sourced` block: validated answer text through the SAME safe pipeline as `prose`
  // (identical typography — the chip is the only addition); the chip row pulls up against the
  // paragraph's own 14px bottom margin. A segment with no chips renders as plain prose.
  function sourcedSegmentsHtml(segs) {
    return segs.map(function (s) {
      if (!s || !s.md) return '';
      var chips = (Array.isArray(s.chips) ? s.chips : []).filter(function (c) { return c && typeof c === 'string'; })
        .map(function (c) {
          return '<span style="display:inline-block;font-size:10px;font-weight:600;padding:1px 8px;border-radius:20px;background:#F3F4F6;color:#6b7280;letter-spacing:.03em;margin-right:4px;">' + esc(c) + '</span>';
        }).join('');
      return '<div>'
        + mdBlockToSafeHtml(s.md)
        + (chips ? '<div style="margin:-9px 0 12px 0;">' + chips + '</div>' : '')
        + '</div>';
    }).join('');
  }

  var AB_PRIMITIVES = {
    register: function (b) { return abRegister(b.register, b.facts_cited); },
    // 'lead' = .ie-ai-h (18px/650) — generic/discovery; 'section' = .ie-why-headline/.ie-section-h/.ie-lookup-headline (15px/500)
    headline: function (b) {
      var lead = b.variant === 'lead';
      return '<div style="font-size:' + (lead ? '18px' : '15px') + ';font-weight:' + (lead ? '650' : '500') + ';line-height:1.35;margin:0 0 10px 0;color:#111827;">' + mdInlineKit(esc(b.text)) + '</div>';
    },
    // .ie-verdict-plain { font-size:13px; margin-bottom:10px; line-height:1.6; }
    verdict: function (b) {
      return '<div style="font-size:13px;color:#111827;margin-bottom:10px;line-height:1.6;">' + mdInlineKit(esc(b.text)) + '</div>';
    },
    prose: function (b) { return mdBlockToSafeHtml(b.md); },
    // Attribution par section (Étape 1, docs/explorer-attribution-spec.md — owner 07/08 : chip en fin
    // de section). Each segment = validated answer text + the origin chips of the facts ITS OWN
    // sentence_provenance entry cites (labels resolved server-side from the owner fr file). A segment
    // with no chips renders as plain prose — no chip beats a wrong chip. Chips are display-only and
    // NEVER upgrade the answer-level register pill.
    sourced: function (b) {
      var segs = Array.isArray(b.segments) ? b.segments : [];
      var inner = sourcedSegmentsHtml(segs);
      // R2-5 (owner direction 07/08 : « everything upgraded to the block/card look ») — card:true wraps
      // the chipped sections in the quiet card container (values from the existing card family: 0.5px
      // #e5e7eb border, 10px radius). Content unchanged — the container is the only addition.
      if (b.card && inner) {
        return '<div style="border:0.5px solid #e5e7eb;border-radius:10px;padding:12px 14px 4px 14px;background:#fff;margin:0 0 10px 0;">' + inner + '</div>';
      }
      return inner;
    },
    // R2-5 — the REAL fired action card's line (ai.output.suggested_action — server-attached, never
    // model-authored), as the action row of the day-answer anatomy. Blue rail values copied from the
    // datecards primitive (#B5D4F4 / #378ADD / #0C447C) — no invented colors.
    action: function (b) {
      if (!b.text) return '';
      return '<div style="border:0.5px solid #B5D4F4;border-left:3px solid #378ADD;border-radius:0 8px 8px 0;padding:9px 12px;margin:0 0 10px 0;background:#fff;">'
        + '<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#0C447C;margin-bottom:3px;">Action du jour</div>'
        + '<div style="font-size:14px;line-height:1.5;color:#111827;">' + mdInlineKit(esc(b.text)) + '</div>'
        + '</div>';
    },
    // .ie-ai-list
    facts: function (b) {
      if (!b.items || !b.items.length) return '';
      return '<ul style="margin:0 0 14px 18px;padding:0;">' + b.items.map(function (x) { return '<li style="margin:6px 0;">' + mdInlineKit(esc(x)) + '</li>'; }).join('') + '</ul>';
    },
    // .ie-card-blue/-amber + .ie-card-label + .ie-pill-* + .ie-card-row (values verbatim)
    datecards: function (b) {
      return (b.items || []).map(function (d) {
        var amber = d.tone === 'amber';
        var border = amber ? '#FAC775' : '#B5D4F4', rail = amber ? '#BA7517' : '#378ADD';
        var pillBg = amber ? '#FAEEDA' : '#E6F1FB', pillFg = amber ? '#633806' : '#0C447C';
        var h = '<div style="border:0.5px solid ' + border + ';border-left:3px solid ' + rail + ';border-radius:0 8px 8px 0;padding:10px 12px;margin-bottom:8px;background:#fff;">'
          + '<div style="font-size:15px;font-weight:500;margin-bottom:6px;color:#111827;">' + esc(d.label || '') + '</div>';
        // tip (27/08, journal pôles) : le détail « kitchen » vit en infobulle, jamais dans la pill
        // (« Données insuffisantes ⓘ » + title porte le compte de jours — règle owner).
        if (d.pill) h += '<div' + (d.tip ? ' title="' + esc(d.tip) + '"' : '') + ' style="display:inline-block;background:' + pillBg + ';color:' + pillFg + ';font-size:14px;font-weight:500;padding:4px 10px;border-radius:8px;margin-bottom:6px;' + (d.tip ? 'cursor:help;' : '') + '">' + mdInlineKit(esc(d.pill)) + '</div>';
        h += (d.rows || []).map(function (r) {
          return '<div style="font-size:13px;color:#111827;margin-bottom:3px;">' + (r.k ? '<strong style="font-weight:500;">' + esc(r.k) + '</strong> ' : '') + mdInlineKit(esc(r.v || '')) + '</div>';
        }).join('');
        return h + '</div>';
      }).join('');
    },
    // Bloc TABLE (27/08, entité×période — « montre la donnée », owner) : LE tableau du kit
    // (msTable), jamais un second rendu de table. items = { cols, rows } au format msTable.
    table: function (b) {
      if (!b.cols || !b.rows || !b.rows.length) return '';
      return '<div style="overflow-x:auto;margin:8px 0 12px;"><table style="border-collapse:collapse;font-size:13px;color:#111827;width:100%;">' + msTable(b.cols, b.rows) + '</table></div>';
    },
    // Bloc SOURCES dépliable (patron details du kit, comme les étapes best-in-class).
    sources: function (b) {
      if (!b.items || !b.items.length) return '';
      return '<details style="margin-top:10px;"><summary style="font-size:12px;color:#6b7280;cursor:pointer;">Sources</summary>'
        + '<ul style="margin:6px 0 0 18px;padding:0;font-size:12px;color:#6b7280;">'
        + b.items.map(function (x) { return '<li style="margin:3px 0;">' + esc(x) + '</li>'; }).join('')
        + '</ul></details>';
    },
    // .ie-lookup-item/-name/-date/-desc/-notfound
    lookup: function (b) {
      if (b.empty) return '<div style="font-size:15px;color:#6b7280;">' + esc(b.empty) + '</div>';
      return (b.items || []).map(function (it) {
        return '<div style="padding:10px 0;border-bottom:0.5px solid #e5e7eb;">'
          + '<div style="font-size:15px;font-weight:500;margin-bottom:3px;color:#111827;">' + mdInlineKit(esc(it.name || '')) + '</div>'
          + (it.date ? '<div style="font-size:13px;color:#0b37e5;margin-bottom:3px;">' + esc(it.date) + '</div>' : '')
          + (it.desc ? '<div style="font-size:13px;color:#111827;">' + mdInlineKit(esc(it.desc)) + '</div>' : '')
          + '</div>';
      }).join('');
    },
    // .ie-competitor-list/-row/-analysis/-recommendation
    rows: function (b) {
      var items = (b.items || []).map(function (r, i, arr) {
        return '<div style="color:#111827;font-size:15px;line-height:1.5;padding:7px 0;' + (i < arr.length - 1 ? 'border-bottom:1px solid #e5e7eb;' : '') + '">' + mdInlineKit(esc(r)) + '</div>';
      }).join('');
      return items ? '<div style="margin:8px 0 12px 0;">' + items + '</div>' : '';
    },
    // .ie-ai-caveats + .ie-ai-cv
    caveats: function (b) {
      if (!b.items || !b.items.length) return '';
      return '<div style="margin-top:14px;padding:10px 14px;border-left:3px solid #e5e7eb;background:#f9fafb;border-radius:0 8px 8px 0;font-size:15px;line-height:1.6;opacity:.8;">'
        + b.items.map(function (c) { return '<div style="margin:6px 0;">' + mdInlineKit(esc(c)) + '</div>'; }).join('') + '</div>';
    },
    // .ie-inline-cta (right-aligned, as today's .ie-ai-cta wrapper)
    cta: function (b) {
      // Action variant (in-page, no navigation): renders a button carrying data-ab-cta-action; the
      // consuming surface wires the behavior by delegation (ie-prompt.js: "upload" → the chat's own
      // file picker). Same visual voice as the link variant.
      if (b.action) {
        return '<div style="display:flex;justify-content:flex-end;"><button type="button" data-ab-cta-action="' + esc(b.action) + '" style="border:none;background:transparent;cursor:pointer;padding:0;font-size:13px;font-weight:500;color:#0b37e5;margin-top:12px;font-family:inherit;">' + esc(b.label || 'Continuer') + ' →</button></div>';
      }
      if (!b.url || String(b.url).charAt(0) !== '/') return '';
      return '<div style="display:flex;justify-content:flex-end;"><a href="' + esc(b.url) + '" style="display:inline-block;font-size:13px;font-weight:500;color:#0b37e5;text-decoration:none;margin-top:12px;">' + esc(b.label || 'Consulter') + ' →</a></div>';
    },
    // Per-block provenance SEGMENT (R2, 17/07): a labelled box for the part of a MIXED answer whose
    // register differs from the answer-level pill — e.g. the premise verdict computed from the
    // operator's own sales inside an otherwise web/model entity answer. The top pill stays the
    // CONSERVATIVE register; a segment only ever labels a sub-part MORE precisely, in plain sight
    // (R4: provenance never silently improves — this is the explicit form).
    segment: function (b) {
      var reg = ({
        vetted: { c: '#0F6E56', bg: '#E7F5EF', bd: '#BFE6D6', lbl: 'Vérifié · vos données' },
        web:    { c: '#A65A00', bg: '#FBF0DF', bd: '#EFD5A8', lbl: 'Web — non vérifié' },
        model:  { c: '#C2410C', bg: '#FDE8D8', bd: '#F5C8A8', lbl: 'Non vérifié' },
      })[b.register];
      if (!reg || !b.md) return '';
      return '<div style="border:1px solid ' + reg.bd + ';background:' + reg.bg + ';border-radius:10px;padding:10px 12px;margin:0 0 10px;">'
        + '<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + reg.c + ';margin-bottom:5px;">' + reg.lbl + '</div>'
        + '<div style="font-size:15px;line-height:1.55;color:#111827;">' + mdBlockToSafeHtml(b.md) + '</div>'
        + '</div>';
    },
    // ÉTAPE 5 — le contexte WEB du jour : boîte ambre « Web — non vérifié » (valeurs du segment web),
    // takeaway + facteurs nommés + SOURCES CLIQUABLES (https uniquement, hostname en libellé,
    // rel=noopener — seule place du chat où un lien externe existe). Ne monte JAMAIS la pilule.
    websources: function (b) {
      var d = b.data || {};
      var factors = (Array.isArray(d.key_factors) ? d.key_factors : []).filter(Boolean);
      var links = (Array.isArray(d.sources) ? d.sources : [])
        .filter(function (u) { return typeof u === 'string' && u.indexOf('https://') === 0; })
        .map(function (u) {
          var label = u; try { label = new URL(u).hostname.replace(/^www\./, ''); } catch (e) {}
          return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:2px 8px 0 0;font-size:11px;color:#A65A00;text-decoration:underline;">' + esc(label) + '</a>';
        }).join('');
      if (!d.takeaway && !factors.length) return '';
      return '<div style="border:1px solid #EFD5A8;background:#FBF0DF;border-radius:10px;padding:10px 12px;margin:0 0 10px;">'
        + '<div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#A65A00;margin-bottom:5px;">Web — non vérifié</div>'
        + (d.takeaway ? '<div style="font-size:14px;line-height:1.55;color:#111827;margin-bottom:4px;">' + mdInlineKit(esc(d.takeaway)) + '</div>' : '')
        + (factors.length ? '<ul style="margin:0 0 4px 16px;padding:0;">' + factors.map(function (f) { return '<li style="font-size:13px;margin:3px 0;">' + mdInlineKit(esc(f)) + '</li>'; }).join('') + '</ul>' : '')
        + (links ? '<div>' + links + '</div>' : '')
        + '</div>';
    },
    // family card — delegates to the existing renderers, unchanged
    card: function (b) {
      var fn = window.MSCardKit && window.MSCardKit[b.render];
      if (typeof fn !== 'function') return '';
      return '<div class="ie-family-card">' + fn(Object.assign({ ok: true }, b.data)) + '</div>';
    },
    // Phase 2 clarification chips (same inline styles as the ie-prompt.js originals)
    clarification: function (b) {
      var chips = (b.chips || []).filter(function (c) { return c && typeof c.label_fr === 'string' && typeof c.send === 'string'; })
        .map(function (c) {
          return '<button type="button" class="ie-clar-chip" data-send="' + esc(c.send) + '" style="display:inline-block;margin:4px 6px 0 0;padding:6px 12px;border-radius:18px;border:1px solid #0b37e5;background:transparent;color:#0b37e5;font-size:12.5px;font-weight:500;cursor:pointer;">' + esc(c.label_fr) + '</button>';
        }).join('');
      return chips ? '<div class="ie-clar-chips" style="margin-top:10px;">' + chips + '</div>' : '';
    }
  };

  // blocks[] → HTML. Enforces the register rule; unknown block types are skipped loudly (a typo must
  // not silently drop content in dev — but must not break the answer either).
  function renderAnswerBlocks(blocks) {
    var list = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
    var hasRegister = list.some(function (b) { return b && b.type === 'register'; });
    // A clarification asserts no facts (Phase 2: the question/chips carry no claims) → no pill required.
    // Same for any block flagged asserts_nothing (elicit answers: the system ASKS for missing data).
    var assertsNothing = list.some(function (b) { return b && (b.type === 'clarification' || b.asserts_nothing === true); });
    var html = '';
    if (!hasRegister && !assertsNothing && list.length) {
      try { console.error('[MSCardKit] blocks[] without register — rendering least-trusted pill'); } catch (e) {}
      html += abRegister('model');
    }
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var fn = AB_PRIMITIVES[b && b.type];
      if (!fn) { try { console.warn('[MSCardKit] unknown block type:', b && b.type); } catch (e) {} continue; }
      html += fn(b);
    }
    return html;
  }

  window.MSCardKit = {
    esc: esc, frInt: frInt, msPct: msPct, msRate: msRate, msEur2: msEur2, msDeltaCell: msDeltaCell,
    msTable: msTable, msMovers: msMovers, msStrip: msStrip, msScale: msScale, msDateFr: msDateFr, msSortTable: msSortTable, msDecision: msDecision,
    salesLevier: salesLevier, wxDayLabel: wxDayLabel,
    mdBlockToSafeHtml: mdBlockToSafeHtml, renderAnswerBlocks: renderAnswerBlocks,
    renderWeather: renderWeather, renderSales: renderSales, renderAudience: renderAudience, renderTrackRecord: renderTrackRecord,
    renderEvents: renderEvents, renderCompetitor: renderCompetitor, renderTourism: renderTourism, renderFootfall: renderFootfall, renderOffering: renderOffering, renderEvolution: renderEvolution, renderSalesDecomp: renderSalesDecomp, renderSalesDiscount: renderSalesDiscount, renderWeatherWindow: renderWeatherWindow, renderChannels: renderChannels
  };
})();
