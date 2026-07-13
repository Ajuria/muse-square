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

  var WX_DOW_FR = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function wxDayLabel(iso) {
    try { var p = String(iso).split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      return WX_DOW_FR[d.getUTCDay()] + ' ' + p[2] + '/' + p[1]; } catch (e) { return String(iso); }
  }
  function msPct(n) { return n == null ? '' : ((n >= 0 ? '+' : '−') + String(Math.abs(n)).replace('.', ',') + ' %'); }
  function msRate(n) { return n == null ? '—' : ((Number(n) * 100).toFixed(1).replace('.', ',') + ' %'); }
  function msEur2(n) { return n == null ? '—' : (Number(n).toFixed(2).replace('.', ',') + ' €'); }
  function msDateFr(iso) { try { var pp = String(iso).split('-'); return pp[2] + '/' + pp[1] + '/' + pp[0]; } catch (e) { return String(iso); } }
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
        h += '<td style="padding:7px 0' + (k === 0 ? '' : ' 7px 14px') + ';text-align:' + align + ';color:' + color + ';' + (cell.bold ? 'font-weight:600;' : '') + '">'
          + esc(cell.v == null ? '' : String(cell.v))
          + (cell.sub ? '<div style="font-size:10.5px;color:#9CA3AF;font-weight:400;">' + esc(cell.sub) + '</div>' : '')
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
    var inner = '';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i] || {};
      inner += '<div style="' + (i > 0 ? 'margin-top:7px;' : '') + '">'
        + (l.head ? '<span style="font-weight:700;">' + esc(l.head) + ' — </span>' : '')
        + esc(l.body || '') + '</div>';
    }
    var head = title ? '<div style="font-weight:700;margin-bottom:6px;">' + esc(title) + '</div>' : '';
    return '<div style="margin-top:14px;background:#F5F7FF;border:1px solid #DBEAFE;border-radius:9px;padding:11px 13px;font-size:13px;line-height:1.5;color:#1D3BB3;">' + head + inner + '</div>';
  }
  var WS_DOW_FR = { 0: 'dimanches', 1: 'lundis', 2: 'mardis', 3: 'mercredis', 4: 'jeudis', 5: 'vendredis', 6: 'samedis' };
  function salesLevier(movers, isDown, jour) {
    var neg = movers.filter(function (m) { return m.delta_eur < 0; }).sort(function (a, b) { return a.delta_eur - b.delta_eur; });
    var pos = movers.filter(function (m) { return m.delta_eur > 0; }).sort(function (a, b) { return b.delta_eur - a.delta_eur; });
    function eur(n) { return frInt(Math.abs(n)) + ' €'; }
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
    return s2 + '. Sécurisez le réassort de ' + pos[0].category + ' et mettez-la en avant sur vos prochains ' + jour + '.';
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
      html += '<div style="font-size:13px;font-weight:700;color:#111827;margin-top:18px;">Fenêtres de calendrier</div>'
        + '<div style="font-size:11px;color:#9CA3AF;margin:4px 0 8px;line-height:1.5;">Densité d\'événements concurrents — visez les fenêtres calmes pour capter l\'attention.</div>'
        + msStrip(j.calendar.map(function (w) { return { top: w.label, mid: (w.count != null ? w.count : ''), highlight: (w.state === 'quiet' || w.state === 'busy'), tone: (w.state === 'quiet' ? 'ok' : (w.state === 'busy' ? 'warn' : 'default')) }; }));
    }
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    return html;
  }

  // Competitor (Bucket B) — "what are my competitors DOING that impacts me, and what do I do".
  // Truth-first: no meaningful overlap -> say it plainly (honest empty state), never fabricate rivalry.
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

  // ── USER-GENERATED card family: the commitment's "Consulter l'évolution" page.
  //    PURE render (chart + decision headline + advice + capture markup + sources).
  //    Self-contained helpers — the page's exact esc/fr semantics (0 -> "0"), NOT the
  //    kit globals (whose esc nulls 0). The page keeps the wiring (wireCapture/wireAdvice,
  //    fetch, MSCommitForm); this returns ONLY the document HTML. COPY = EVOL_COPY.
  function renderEvolution(data, COPY) {
    var WIN_FR = { day_of: 'Jour même', '7d': '7 jours', '14d': '14 jours' };
    var LVL_FR = { modeste: 'modeste', net: 'net' };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fr(n) { var r = Math.round((Number(n) || 0) * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ','); }
    function intfr(n) { return (Number(n) || 0).toLocaleString('fr-FR'); }
    function dnum(iso) { return parseInt(String(iso).slice(8, 10), 10); }
    function t(key, vars) { var s = COPY[key] || ''; if (vars) for (var k in vars) if (vars.hasOwnProperty(k)) s = s.split('{' + k + '}').join(vars[k]); return s; }

    // dual-line chart: CA réalisé (solid+area) vs CA habituel (dashed)
    function chart(series) {
      var pts = series.filter(function (d) { return d.has_data; });
      if (pts.length < 2) return '<div style="font-size:13px;color:#9ca3af;padding:8px 0;">Pas encore assez de journées reçues pour tracer la courbe.</div>';
      var W = 760, H = 200, padL = 46, padT = 10, padB = 26, plotW = W - padL - 8, plotH = H - padT - padB;
      var all = []; pts.forEach(function (d) { all.push(d.daily_revenue, d.expected_revenue); });
      var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
      var span = (mx - mn) || 1; mn = Math.max(0, mn - span * 0.12); mx = mx + span * 0.12;
      var n = series.length;
      var xOf = function (i) { return padL + (n === 1 ? plotW / 2 : i * plotW / (n - 1)); };
      var yOf = function (v) { return padT + plotH - (v - mn) / ((mx - mn) || 1) * plotH; };
      var grid = '', ticks = 4;
      for (var g = 0; g <= ticks; g++) { var val = mn + (mx - mn) * g / ticks, y = yOf(val); grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - 8) + '" y2="' + y.toFixed(1) + '" stroke="#eef1f6" stroke-width="1"/><text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="#9ca3af" text-anchor="end">' + Math.round(val).toLocaleString('fr-FR') + '</text>'; }
      var expSeg = [], realSeg = [];
      series.forEach(function (d, i) { if (d.has_data) { expSeg.push(xOf(i).toFixed(1) + ',' + yOf(d.expected_revenue).toFixed(1)); realSeg.push(xOf(i).toFixed(1) + ',' + yOf(d.daily_revenue).toFixed(1)); } });
      var realLine = realSeg.join(' ');
      var area = 'M' + realSeg[0].split(',')[0] + ',' + (padT + plotH) + ' L' + realSeg.join(' L') + ' L' + realSeg[realSeg.length - 1].split(',')[0] + ',' + (padT + plotH) + ' Z';
      var bi = -1, wi = -1;
      series.forEach(function (d, i) { if (!d.has_data) return; if (bi < 0 || d.residual_pct > series[bi].residual_pct) bi = i; if (wi < 0 || d.residual_pct < series[wi].residual_pct) wi = i; });
      var lbl = '', step = Math.ceil(n / 8);
      for (var i = 0; i < n; i += step) lbl += '<text x="' + xOf(i).toFixed(1) + '" y="' + (H - 8) + '" font-size="9" fill="#9ca3af" text-anchor="middle">' + dnum(series[i].date) + '</text>';
      var gaps = '';
      series.forEach(function (d, i) { if (!d.has_data) gaps += '<line x1="' + xOf(i).toFixed(1) + '" y1="' + padT + '" x2="' + xOf(i).toFixed(1) + '" y2="' + (padT + plotH) + '" stroke="#f0f2f5" stroke-width="1" stroke-dasharray="2,3"/>'; });
      var dots = '';
      if (bi >= 0) dots += '<circle cx="' + xOf(bi).toFixed(1) + '" cy="' + yOf(series[bi].daily_revenue).toFixed(1) + '" r="3.5" fill="#059669"/>';
      if (wi >= 0 && wi !== bi) dots += '<circle cx="' + xOf(wi).toFixed(1) + '" cy="' + yOf(series[wi].daily_revenue).toFixed(1) + '" r="3.5" fill="#b91c1c"/>';
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;">' + grid + gaps
        + '<path d="' + area + '" fill="#1D3BB3" fill-opacity="0.07"/>'
        + '<polyline points="' + expSeg.join(' ') + '" fill="none" stroke="#9ca3af" stroke-width="1.6" stroke-dasharray="5,4"/>'
        + '<polyline points="' + realLine + '" fill="none" stroke="#1D3BB3" stroke-width="2.2"/>' + dots + lbl + '</svg>';
      var legend = '<div style="display:flex;gap:16px;margin-top:6px;font-size:12px;color:#374151;">'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#1D3BB3" stroke-width="2.2"/></svg>' + esc(t('chart_realized')) + '</span>'
        + '<span style="display:inline-flex;align-items:center;gap:6px;"><svg width="18" height="8"><line x1="0" y1="4" x2="18" y2="4" stroke="#9ca3af" stroke-width="1.6" stroke-dasharray="5,4"/></svg>' + esc(t('chart_habituel')) + '</span></div>'
        + '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + esc(t('chart_note')) + '</div>';
      return svg + legend;
    }

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
    function captureHtml(cm, open) {
      var inner;
      if (open) {
        var st = cm.action_done_status;
        inner = '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">' + esc(t('done_question')) + '</div>'
          + '<div style="display:flex;gap:8px;margin-bottom:12px;">'
          + '<button type="button" data-done="fait" style="' + doneBtnStyle(st === 'fait') + '">' + esc(t('done_yes')) + '</button>'
          + '<button type="button" data-done="pas_encore" style="' + doneBtnStyle(st === 'pas_encore') + '">' + esc(t('done_no')) + '</button></div>'
          + '<div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">' + esc(t('dispositif_label')) + '</div>'
          + '<textarea data-dispositif placeholder="' + esc(t('dispositif_ph')) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:56px;box-sizing:border-box;">' + esc(cm.dispositif_note || '') + '</textarea>';
      } else {
        var confirmed = cm.action_done_status === 'fait' ? '<div style="font-size:12.5px;color:#166534;margin-bottom:12px;">' + esc(t('done_confirmed', { name: cm.owner_person_name || '—' })) + '</div>' : '';
        inner = confirmed
          + '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">' + esc(t('retro_question')) + '</div>'
          + '<textarea data-retro placeholder="' + esc(t('retro_ph')) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:64px;box-sizing:border-box;">' + esc(cm.retro_note || '') + '</textarea>';
      }
      return '<div class="eg-sec"><div class="eg-uc">' + esc(t('q4_title')) + '</div>' + inner
        + '<div style="margin-top:10px;display:flex;align-items:center;gap:10px;"><button type="button" data-cap-save style="background:#1D3BB3;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + esc(t('save')) + '</button><span data-cap-msg style="font-size:12px;color:#166534;"></span></div></div>';
    }

    var cm = data.commitment, series = data.series || [], ctx = data.context || {};
    var hn = data.holiday_norm, prov = data.provenance || {}, advice = data.advice || [];
    var open = cm.status === 'open';
    var received = series.filter(function (d) { return d.has_data; });
    var windowHoliday = ctx.school_days > 0 || series.some(function (d) { return d.is_school_holiday; });

    var aggPct;
    if (cm.window_residual_pct != null) aggPct = Number(cm.window_residual_pct);
    else if (received.length) aggPct = received.reduce(function (s, d) { return s + d.residual_pct; }, 0) / received.length;
    else aggPct = null;
    var daysUp = received.filter(function (d) { return d.residual_pct >= 0; }).length;

    var winLbl = WIN_FR[cm.window_kind] || cm.window_kind;
    var sub = t('subtitle', { level: LVL_FR[cm.threshold_level] || cm.threshold_level, window: winLbl, owner: esc(cm.owner_person_name || '—') });
    var head = '<div style="border-bottom:2px solid #1D3BB3;padding-bottom:14px;margin-bottom:22px;">'
      + '<div style="font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:#1D3BB3;font-weight:600;">Engagement</div>'
      + '<div style="font-size:21px;font-weight:600;margin-top:5px;line-height:1.3;">' + esc(cm.committed_action_text || '—') + '</div>'
      + '<div style="font-size:13px;color:#6b7280;margin-top:6px;">' + sub + '</div></div>';

    var headline, big;
    if (!received.length) {
      var _z = cm.threshold_level === 'net' ? 1.5 : 1.0;
      var _odays = cm.window_days_expected || 7;
      var _ytgt = Math.max(1, Math.round(_z * 0.19 / Math.sqrt(_odays) * 100));
      var _obase = cm.window_expected_revenue != null ? Number(cm.window_expected_revenue) : null;
      var _ouplift = _obase != null ? Math.round((_obase / _odays) * _ytgt / 100 / 10) * 10 : null;
      var _obj = _ouplift != null
        ? t('q1_objective_eur', { uplift: intfr(_ouplift), pct: _ytgt })
        : t('q1_objective_pct', { pct: _ytgt });
      headline = '<div style="font-size:17px;font-weight:600;color:#111827;line-height:1.4;">' + esc(_obj) + '</div>'
        + '<div style="font-size:13px;color:#6b7280;margin-top:6px;">' + esc(t('q1_window_started')) + '</div>';
    } else {
      var _basePct = open ? received[received.length - 1].residual_pct : (aggPct != null ? aggPct : 0);
      var _ctxPct = (windowHoliday && hn && hn.pct != null) ? hn.pct : 0;
      var _actionPct = _basePct - _ctxPct;
      big = _actionPct >= 0 ? '#059669' : '#b91c1c';
      var _lead = t(_ctxPct !== 0 ? 'q1_lead_holiday' : 'q1_lead_plain', { pct: (_actionPct >= 0 ? '+' : '') + fr(_actionPct) });
      var _verdict = (_actionPct >= 2) ? t('q1_verdict_pays') : (_actionPct <= -2) ? t('q1_verdict_down') : t('q1_verdict_flat');
      if (Math.abs(_actionPct) >= 2 && received.length < 5) _verdict += ', ' + t('q1_verdict_confirm');
      headline = '<div style="font-size:20px;font-weight:600;color:' + big + ';">' + esc(_lead) + '</div>'
        + '<div style="font-size:13px;color:#6b7280;margin-top:4px;">' + esc(t('q1_days_measured', { up: daysUp, n: received.length })) + ' — ' + esc(_verdict) + '</div>';
    }
    var holidayNote = '';
    if (windowHoliday && hn && hn.pct != null) {
      var _sitPct = open ? received[received.length - 1].residual_pct : (aggPct != null ? aggPct : 0);
      holidayNote = '<div style="margin-top:10px;font-size:12.5px;color:#92610a;background:#FFF8EC;border:1px solid #FBE8C3;border-radius:8px;padding:9px 12px;">'
        + esc(t('q1_split_inputs', { sit: (_sitPct >= 0 ? '+' : '') + fr(_sitPct), hol: (hn.pct >= 0 ? '+' : '') + fr(hn.pct) }));
      if (cm.ctx_material_confound) holidayNote += '<div style="margin-top:6px;"><strong>' + esc(t('to_confirm_label')) + '.</strong> ' + esc(t('to_confirm_holiday')) + '</div>';
      holidayNote += '</div>';
    }
    var q1 = '<div class="eg-sec"><div class="eg-uc">' + esc(t('q1_title_decision')) + '</div>' + headline + holidayNote
      + '<div style="margin-top:16px;">' + chart(series) + '</div></div>';

    var q3 = advice.length ? '<div class="eg-sec"><div class="eg-uc">' + esc(t('q3_title')) + '</div>' + adviceHtml(advice) + '</div>' : '';
    var q4 = captureHtml(cm, open);

    var srcRows = [t('src_caisse'), t('src_learning', { days: prov.history_days || 0 }), t('src_weather'), t('src_events'), t('src_tourism')];
    srcRows.push(prov.track_record ? t('src_track_record', { beat: prov.track_record.beat, done: prov.track_record.done }) : t('src_track_pending'));
    var sources = '<div class="eg-sec" style="margin-bottom:0;"><div class="eg-uc">' + esc(t('sources_title')) + '</div>'
      + '<div style="font-size:12.5px;color:#6b7280;line-height:1.9;">' + srcRows.map(function (s) { return '<div>· ' + esc(s) + '</div>'; }).join('') + '</div></div>';

    return head + q1 + q3 + q4 + sources;
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
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    return html;
  }

  // Shared "Ampleur" block — is this a pattern (recurrence) and is it worth acting on (€/an at stake)?
  // The € is DESCRIPTIVE (what you spend / what these days represent), never a causal "acting earns +X".
  function msScale(s) {
    if (!s || (s.annual_eur == null && !s.headline && !s.enjeu && !s.recurrence)) return '';
    var out = '<div style="margin:14px 0 0;padding:12px 14px;background:#F8FAFC;border:0.5px solid #E5E7EB;border-radius:10px;">'
      + '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B7280;margin-bottom:8px;">Ampleur</div>';
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
    if (j.decision_lines && j.decision_lines.length) html += msDecision('Prochaines étapes', j.decision_lines);
    if (j.caveat) html += '<div style="font-size:11px;color:#9CA3AF;margin-top:8px;font-style:italic;line-height:1.5;">' + esc(j.caveat) + '</div>';
    return html;
  }

  // extended_bad_weather — the extended weather WINDOW as a planning frame: the run of days, the venue's
  // OWN measured CA response to that condition (heat can be an OPPORTUNITY, not a threat), + next steps.
  function renderWeatherWindow(j) {
    if (!j || !j.ok || !j.found) return '<div style="font-size:12.5px;color:#6B7280;line-height:1.5;">Pas de fenêtre météo prolongée à venir.</div>';
    var html = '';
    if (j.lead) html += '<div style="font-size:14px;font-weight:600;color:#111827;line-height:1.45;margin-bottom:6px;">' + esc(j.lead) + '</div>';
    if (j.window && j.window.strip && j.window.strip.length) {
      html += '<div style="font-size:12px;color:#6B7280;margin:8px 0 0;">La fenêtre :</div>'
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

  window.MSCardKit = {
    esc: esc, frInt: frInt, msPct: msPct, msRate: msRate, msEur2: msEur2, msDeltaCell: msDeltaCell,
    msTable: msTable, msMovers: msMovers, msStrip: msStrip, msScale: msScale, msDateFr: msDateFr, msSortTable: msSortTable, msDecision: msDecision,
    salesLevier: salesLevier, wxDayLabel: wxDayLabel,
    renderWeather: renderWeather, renderSales: renderSales, renderAudience: renderAudience, renderTrackRecord: renderTrackRecord,
    renderEvents: renderEvents, renderCompetitor: renderCompetitor, renderTourism: renderTourism, renderFootfall: renderFootfall, renderEvolution: renderEvolution, renderSalesDecomp: renderSalesDecomp, renderSalesDiscount: renderSalesDiscount, renderWeatherWindow: renderWeatherWindow
  };
})();
