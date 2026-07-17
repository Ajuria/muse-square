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
        lines.push({ head: w.category, body: (w.heavier === 'weekend' ? 'plus vendu le week-end' : 'plus vendu en semaine') + ' (' + d(Math.abs(w.gap_pp)) + ' pp d\'écart).' });
      });
      (t.seasonal || []).forEach(function (s) {
        lines.push({ head: s.category, body: 'sa part varie de ' + d(s.range_pp) + ' pp selon les mois.' });
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
    // read-only summary row (view mode)
    function roRow(label, value) {
      return '<div style="padding:8px 0;border-top:0.5px solid #F3F4F6;"><div style="font-size:12px;font-weight:600;color:#6b7280;">' + esc(label) + '</div><div style="font-size:13px;color:#111827;line-height:1.5;margin-top:3px;white-space:pre-wrap;">' + esc(value) + '</div></div>';
    }
    // Read/edit mode (remark #2): once saved, render read-only with an "Éditer" toggle. Editing RIGHTS
    // are deferred — this is the view-mode UI only. hasData default = read; empty = edit.
    function captureHtml(cm, open) {
      var inner, title, hasData, readInner;
      if (open) {
        title = t('q4_title');
        var st = cm.action_done_status;
        hasData = (st != null);
        inner = '<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">' + esc(t('done_question')) + '</div>'
          + '<div style="display:flex;gap:8px;margin-bottom:12px;">'
          + '<button type="button" data-done="fait" style="' + doneBtnStyle(st === 'fait') + '">' + esc(t('done_yes')) + '</button>'
          + '<button type="button" data-done="pas_encore" style="' + doneBtnStyle(st === 'pas_encore') + '">' + esc(t('done_no')) + '</button></div>'
          + '<div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">' + esc(t('dispositif_label')) + '</div>'
          + '<textarea data-dispositif placeholder="' + esc(t('dispositif_ph')) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:56px;box-sizing:border-box;">' + esc(cm.dispositif_note || '') + '</textarea>';
        readInner = roRow(t('done_question'), st === 'fait' ? t('done_yes') : st === 'pas_encore' ? t('done_no') : '—')
          + roRow(t('dispositif_label'), cm.dispositif_note || t('not_dispositioned'));
      } else {
        // Documenter — structured retro (Spec 2): worked / would-change / repeat oui-non. The
        // reusable knowledge-base entry that seeds Spec 1's "Plan à reprendre".
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
    // Objectif = the KPI target (uplift %) + the timeframe to reach it — not the "net/brut" jargon.
    // Base 'pct' (objectif libre 18/07) : le % est celui fixé par l'utilisateur, pas une traduction.
    var _subGoal = (cm.threshold_basis === 'pct' && cm.threshold_value != null)
      ? Math.round(Number(cm.threshold_value))
      : Math.max(1, Math.round((cm.threshold_level === 'net' ? 1.5 : 1.0) * 0.19 / Math.sqrt(cm.window_days_expected || 7) * 100));
    var sub = t('subtitle', { pct: _subGoal, window: winLbl });
    // Owner + when (remark #1): who committed and when, + when the action was marked done.
    var _ownerDate = '';
    if (cm.owner_person_name || cm.created_at) {
      var _cd = cm.created_at ? msDateFr(String(cm.created_at).slice(0, 10)) : '—';
      _ownerDate = t('owner_line', { name: esc(cm.owner_person_name || '—'), date: esc(_cd) });
      if (cm.action_done_at) _ownerDate += t('done_suffix', { date: esc(msDateFr(String(cm.action_done_at).slice(0, 10))) });
    }
    var head = '<div style="border-bottom:2px solid #1D3BB3;padding-bottom:14px;margin-bottom:22px;">'
      + '<div style="font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:#1D3BB3;font-weight:600;">Engagement</div>'
      + '<div style="font-size:21px;font-weight:600;margin-top:5px;line-height:1.3;">' + esc(cm.committed_action_text || '—') + '</div>'
      + '<div style="font-size:13px;color:#6b7280;margin-top:6px;">' + sub + '</div>'
      + (_ownerDate ? '<div style="font-size:12px;color:#9ca3af;margin-top:4px;">' + _ownerDate + '</div>' : '')
      + '</div>';

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
          + '<span><strong style="color:#111827;font-weight:600;">' + (_basePct >= 0 ? '+' : '') + fr(_basePct) + ' %</strong> vs habituel</span>'
        + '</div></div>';
      // SECONDARY attribution — split when a holiday effect is present (causal-safe: never counts vacances as the action).
      var _attrib = (_ctxPct !== 0)
        ? t('q1_attrib_split', { action: (_actionPct >= 0 ? '+' : '') + fr(_actionPct), ctx: (_ctxPct >= 0 ? '+' : '') + fr(_ctxPct) })
        : t('q1_attrib_solo', { action: (_actionPct >= 0 ? '+' : '') + fr(_actionPct) });
      headline = '<div style="font-size:16px;font-weight:600;color:' + _stCol + ';">' + esc(_stTxt) + '</div>'
        + _bar
        + '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:14px;">' + esc(_attrib) + '</div>'
        + '<div style="font-size:12px;color:#9ca3af;margin-top:6px;">' + esc(t('q1_days_measured', { up: daysUp, n: received.length })) + '</div>';
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
    var _mc = function (m, title, desc) {
      var st = _mh[m];
      var track = (st && st.attempts >= 2) ? '<div style="font-size:11.5px;color:#1D3BB3;margin-top:5px;">' + esc(t('move_track', { hits: st.hits, attempts: st.attempts })) + '</div>' : '';
      var rec = (m === _recMove) ? ' <span style="font-size:11px;font-weight:600;color:#1D3BB3;background:#E6ECFF;padding:2px 8px;margin-left:4px;">' + esc(t('diag_recommended')) + '</span>' : '';
      return '<button type="button" data-move="' + m + '" style="display:block;width:100%;text-align:left;box-sizing:border-box;background:#fff;border:1px solid #e5e7eb;padding:12px 14px;margin-bottom:8px;cursor:pointer;font-family:inherit;"><div style="font-size:14px;font-weight:500;color:#111827;">' + esc(title) + rec + '</div><div style="font-size:12.5px;color:#6b7280;line-height:1.5;margin-top:2px;">' + esc(desc) + '</div>' + track + '</button>';
    };

    // ── Diagnosis "pourquoi" — ONLY when under objectif (explains the shortfall) ──
    var _cs = 'background:#fff;border:1px solid #e5e7eb;padding:14px 16px;margin-bottom:10px;';
    var _hd = function (n, txt, chip) { return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><span style="font-size:14px;font-weight:500;color:#111827;">' + n + ' · ' + esc(txt) + '</span>' + (chip ? '<span style="font-size:11px;color:#5f5e5a;background:#f1efe8;padding:2px 8px;">' + esc(chip) + '</span>' : '') + '</div>'; };
    var diagWhy = '';
    if (_under) {
      var _wa = ctx && ctx.weather_assoc;
      var _wm = _wa && _wa.cool_n >= 5 && _wa.mild_n >= 5 && _wa.cool_avg != null && _wa.mild_avg != null;
      diagWhy = '<div class="eg-sec">'
        + '<div class="eg-uc">' + esc(t('diag_title')) + '</div>'
        + '<div style="font-size:13px;color:#6b7280;line-height:1.55;margin-bottom:16px;">' + esc(t('diag_intro', { action: (_dAction >= 0 ? '+' : '') + fr(_dAction), goal: _dGoal })) + '</div>'
        + '<div style="border-left:3px solid #1D3BB3;' + _cs + '">'
          + _hd('1', t('diag_ext_title'), t('diag_ext_chip_obs'))
          + '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:6px;">' + (_notable ? esc(_bits.join(' · ') + '.') : esc(t('diag_ext_none'))) + '</div>'
          + (_wm ? '<div style="font-size:12.5px;color:#374151;line-height:1.5;margin-top:6px;">' + esc(t('diag_ext_weather_meas', { cool: intfr(Math.round(_wa.cool_avg)), mild: intfr(Math.round(_wa.mild_avg)) })) + ' <span style="font-size:11px;color:#1D3BB3;">' + esc(t('diag_ext_chip_meas')) + '</span></div>' : '')
          + '<div style="font-size:12.5px;line-height:1.5;margin-top:6px;color:' + (_notable ? '#92610a' : '#059669') + ';">' + esc(_notable ? t('diag_ext_partial') : t('diag_ext_calm')) + '</div>'
        + '</div>'
        + '<div style="border-left:3px solid #92610a;' + _cs + '">'
          + _hd('2', t('diag_exec_title'), '')
          + '<div style="font-size:13px;color:#374151;line-height:1.55;margin:8px 0 10px;">' + esc(t('diag_exec_q')) + '</div>'
          + '<div style="display:flex;gap:8px;">'
            + '<button type="button" data-exec="complete" style="' + doneBtnStyle(_execQ === 'complete') + '">' + esc(t('diag_exec_yes')) + '</button>'
            + '<button type="button" data-exec="partial" style="' + doneBtnStyle(_execQ === 'partial') + '">' + esc(t('diag_exec_partial')) + '</button>'
            + '<button type="button" data-exec="none" style="' + doneBtnStyle(_execQ === 'none') + '">' + esc(t('diag_exec_no')) + '</button>'
          + '</div>'
        + '</div>'
        + '<div style="border-left:3px solid #6B7280;' + _cs + 'margin-bottom:0;">'
          + _hd('3', t('diag_lever_title'), '')
          + '<div style="font-size:13px;color:#374151;line-height:1.55;margin-top:6px;">' + esc(t('diag_lever_body')) + '</div>'
        + '</div>'
      + '</div>';
    }

    // ── Your next move — UNIVERSAL for open commitments: the owner authors their OWN strategy in every
    // state (below/aligned/above), never only consuming best-practices. Diagnosis explains, this decides.
    var moveForm = '';
    if (open) {
      moveForm = '<div class="eg-sec">'
        + '<div class="eg-uc">' + esc(t('move_title')) + '</div>'
        + '<div style="font-size:13px;color:#6b7280;line-height:1.55;margin-bottom:12px;">' + esc(_under ? t('diag_move_intro') : t('move_intro_ontrack')) + '</div>'
        + _mc('poursuivre', t('move_poursuivre'), t('move_poursuivre_d'))
        + _mc('doubler', t('move_doubler'), t('move_doubler_d'))
        + _mc('pivoter', t('move_pivoter'), t('move_pivoter_d'))
        + _mc('stop', t('move_stop'), t('move_stop_d'))
        + '<div style="font-size:13px;font-weight:500;color:#374151;margin:14px 0 6px;" data-adjust-noteq>' + esc(t('diag_move_note_q')) + '</div>'
        + '<textarea data-adjust-note placeholder="' + esc(_moveHint(cm.origin_action_type)) + '" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;padding:9px 11px;font-size:13px;color:#111827;background:#f9fafb;font-family:inherit;resize:none;min-height:60px;box-sizing:border-box;"></textarea>'
        + '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + esc(t('diag_move_hint_caption')) + '</div>'
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
    return head + q1 + diagWhy + (_under ? '' : q3) + moveForm + bicRef + q4 + sources;
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
        if (d.pill) h += '<div style="display:inline-block;background:' + pillBg + ';color:' + pillFg + ';font-size:14px;font-weight:500;padding:4px 10px;border-radius:8px;margin-bottom:6px;">' + mdInlineKit(esc(d.pill)) + '</div>';
        h += (d.rows || []).map(function (r) {
          return '<div style="font-size:13px;color:#111827;margin-bottom:3px;">' + (r.k ? '<strong style="font-weight:500;">' + esc(r.k) + '</strong> ' : '') + mdInlineKit(esc(r.v || '')) + '</div>';
        }).join('');
        return h + '</div>';
      }).join('');
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
    renderEvents: renderEvents, renderCompetitor: renderCompetitor, renderTourism: renderTourism, renderFootfall: renderFootfall, renderOffering: renderOffering, renderEvolution: renderEvolution, renderSalesDecomp: renderSalesDecomp, renderSalesDiscount: renderSalesDiscount, renderWeatherWindow: renderWeatherWindow
  };
})();
