console.log("[ie-prompt] ie-prompt.js loaded");
window.__IE_PROMPT_OK__ = true;

window.addEventListener("error", (e) => {
  console.error("[ie-prompt] window.error", e?.message, e?.filename, e?.lineno, e?.colno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[ie-prompt] unhandledrejection", e?.reason);
});

const root = document.getElementById("ie-prompt-root");
if (!root) {
  console.warn("[ie-prompt] root not found");
} else {
  const LOCATION_ID = root.dataset.locationId || "";

  // ----------------------------
  // CONVERSATION STATE (V1) — deterministic thread_context
  // Persisted in-memory for the session; no storage side effects.
  // ----------------------------
  let THREAD_CONTEXT = {
    v: 1,
    location_id: LOCATION_ID,
    turn: 0,
    last: null, // { horizon, intent, used_dates[], top_dates[], month_redirect_url, selected_date }
  };

  // Conversation history for multi-turn memory
  // Each entry: { role: "user" | "assistant", content: string }
  let CONVERSATION_HISTORY = [];

  function pickTopDatesMinimal(top_dates) {
    if (!Array.isArray(top_dates)) return [];
    return top_dates
      .map((d) => ({
        date: typeof d?.date === "string" ? d.date.slice(0, 10) : null,
        regime: typeof d?.regime === "string" ? d.regime : null,
        score: (typeof d?.score === "number" ? d.score : (Number.isFinite(Number(d?.score)) ? Number(d.score) : null)),
      }))
      .filter((x) => typeof x.date === "string" && x.date.length === 10)
      .slice(0, 7);
  }

  function updateThreadContextFromResponse(out) {
    if (!out || out.ok !== true) return;

    const meta = out?.meta ?? {};
    const dp = out?.decision_payload ?? {};
    const primary = out?.actions?.primary;
    const used = Array.isArray(dp?.used_dates) ? dp.used_dates : [];

    THREAD_CONTEXT.turn += 1;
    THREAD_CONTEXT.last = {
      horizon: typeof meta?.resolved_horizon === "string" ? meta.resolved_horizon : null,
      intent: typeof meta?.resolved_intent === "string" ? meta.resolved_intent : null,
      used_dates: used.map((x) => String(x).slice(0, 10)).filter(Boolean).slice(0, 7),
      top_dates: pickTopDatesMinimal(out?.top_dates),
      month_redirect_url: typeof primary?.url === "string" ? primary.url : null,
      // keep selected_date if server returned one later (we’ll add in prompt.ts thread_context_out)
      selected_date: typeof out?.debug?.thread_context_out?.selected_date === "string"
        ? out.debug.thread_context_out.selected_date
        : null,
    };
  }

  const SUGGESTION_CHIPS = [];
  let _monitorData = null;

  async function fetchMonitorForSuggestions() {
    try {
      var today = new Date();
      var dates = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'));
      }
      var qs = new URLSearchParams();
      qs.set('location_id', LOCATION_ID);
      qs.set('selected_dates', dates.join(','));
      var res = await fetch('/api/insight/monitor?' + qs.toString(), { cache: 'no-store' });
      var json = await res.json().catch(function() { return null; });
      if (!json || !json.ok) return null;
      _monitorData = json;
      return json;
    } catch(e) { return null; }
  }

  async function fetchCompetitorSignalsForSuggestions() {
    try {
      var today = new Date();
      var todayYmd = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
      var res = await fetch('/api/competitive/competitor-signals?selected_date=' + encodeURIComponent(todayYmd));
      var json = await res.json().catch(function() { return null; });
      if (!json || !json.ok) return { signals: [], followed_count: 0 };
      return { signals: Array.isArray(json.signals) ? json.signals : [], followed_count: json.followed_count || 0 };
    } catch(e) { return { signals: [], followed_count: 0 }; }
  }

  var SVG_ICON_STAR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  var SVG_ICON_CLOUD = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';
  var SVG_ICON_USERS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  var SVG_ICON_TARGET = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';

  function buildDynamicSuggestions(data, compData) {
    if (!data || !Array.isArray(data.days) || !data.days.length) return [];
    var today = new Date();
    var todayYmd = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    var days = data.days;
    var dayMap = {};
    for (var i = 0; i < days.length; i++) {
      var ymd = String(days[i].date || '').slice(0, 10);
      dayMap[ymd] = days[i];
    }
    var todayDay = dayMap[todayYmd] || days[0] || {};
    var DOW_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

    var suggestions = [];

    // 1. Best day of the week (always)
    var bestDay = null;
    var bestScore = -1;
    for (var i = 0; i < days.length; i++) {
      var s = Number(days[i].opportunity_score || 0);
      if (s > bestScore) { bestScore = s; bestDay = days[i]; }
    }
    if (bestDay && bestScore > 0) {
      var bd = new Date(String(bestDay.date).slice(0,10) + 'T00:00:00');
      var bdLabel = DOW_FR[bd.getDay()];
      var bdScore = Number(bestScore).toFixed(1);
      suggestions.push({
        svg: SVG_ICON_STAR,
        iconBg: '#E1F5EE',
        iconColor: '#0F6E56',
        text: 'Meilleur jour : ' + bdLabel + ' (' + bdScore + '/10)',
        sub: 'Pourquoi cette date est-elle la plus favorable ?',
        q: 'Pourquoi ' + bdLabel + ' est le meilleur jour de la semaine ?',
      });
    }

    // 2. Weather or competition alert (only if exists)
    var weatherDay = null;
    for (var i = 0; i < days.length; i++) {
      if (Number(days[i].alert_level_max || 0) >= 2) { weatherDay = days[i]; break; }
    }
    var compDay = null;
    for (var i = 0; i < days.length; i++) {
      if (Number(days[i].events_within_5km_count || 0) > 2) { compDay = days[i]; break; }
    }

    if (weatherDay) {
      var wd = new Date(String(weatherDay.date).slice(0,10) + 'T00:00:00');
      var wdLabel = DOW_FR[wd.getDay()];
      var tempMax = Number(weatherDay.temperature_2m_max || 0);
      var windMax = Number(weatherDay.wind_speed_10m_max || 0);
      var precipMax = Number(weatherDay.precipitation_probability_max_pct || 0);
      var wLabel = tempMax >= 33 ? 'Forte chaleur (' + Math.round(tempMax) + '\u00b0C)'
        : tempMax >= 30 ? 'Chaleur (' + Math.round(tempMax) + '\u00b0C)'
        : precipMax >= 60 ? 'Risque pluie (' + Math.round(precipMax) + '%)'
        : windMax >= 30 ? 'Vent fort (' + Math.round(windMax) + ' km/h)'
        : weatherDay.weather_label_fr || 'Alerte m\u00e9t\u00e9o';
      suggestions.push({
        svg: SVG_ICON_CLOUD,
        iconBg: '#FAEEDA',
        iconColor: '#854F0B',
        text: wLabel + ' ' + wdLabel,
        sub: 'Quel impact sur mon activit\u00e9 ?',
        q: (function() {
          var l = wLabel.toLowerCase();
          var article = l.startsWith('risque') ? 'du ' : l.startsWith('vent') ? 'du ' : l.startsWith('forte') ? 'de la ' : l.startsWith('chaleur') ? 'de la ' : 'de la ';
          return 'Quel est l\u2019impact ' + article + l + ' ' + wdLabel + ' sur mon activit\u00e9 ?';
        })(),
      });
    } else if (compDay) {
      var cd = new Date(String(compDay.date).slice(0,10) + 'T00:00:00');
      var cdLabel = DOW_FR[cd.getDay()];
      var evCount = Number(compDay.events_within_5km_count || 0);
      suggestions.push({
        svg: SVG_ICON_USERS,
        iconBg: '#FCEBEB',
        iconColor: '#A32D2D',
        text: evCount + ' \u00e9v\u00e9nements \u00e0 5 km ' + cdLabel,
        sub: 'Quel risque pour ma fr\u00e9quentation ?',
        q: 'Quels \u00e9v\u00e9nements concurrents sont pr\u00e9vus ' + cdLabel + ' et quel est leur impact ?',
      });
    }

    // 3. Followed competitor activity (only if signals exist)
    var compSignals = compData && Array.isArray(compData.signals) ? compData.signals : [];
    var activeSignal = null;
    for (var i = 0; i < compSignals.length; i++) {
      if (compSignals[i].is_active || compSignals[i].is_launch) { activeSignal = compSignals[i]; break; }
    }
    if (activeSignal) {
      var compName = activeSignal.competitor_name || 'Concurrent';
      var evName = activeSignal.event_name || '';
      var distKm = activeSignal.distance_from_location_m ? (Number(activeSignal.distance_from_location_m) / 1000).toFixed(1) : null;
      var chipText = compName + (evName ? ' \u2014 ' + evName : '');
      if (distKm) chipText += ' (' + distKm + ' km)';
      suggestions.push({
        svg: SVG_ICON_TARGET,
        iconBg: '#FCEBEB',
        iconColor: '#A32D2D',
        text: chipText,
        sub: activeSignal.is_launch ? 'Lancement d\u00e9tect\u00e9 \u2014 quel impact ?' : '\u00c9v\u00e9nement actif \u2014 quel impact ?',
        q: 'Quel est l\u2019impact de ' + compName + (evName ? ' (' + evName + ')' : '') + ' sur mon activit\u00e9 ?',
      });
    } else if (compData && compData.followed_count > 0 && compSignals.length > 0) {
      var firstComp = compSignals[0];
      var compName = firstComp.competitor_name || 'Concurrent';
      suggestions.push({
        svg: SVG_ICON_TARGET,
        iconBg: '#E6F1FB',
        iconColor: '#185FA5',
        text: compName + ' \u2014 activit\u00e9 cette semaine',
        sub: 'Que pr\u00e9parent vos concurrents ?',
        q: 'Que pr\u00e9pare ' + compName + ' cette semaine et quel est l\u2019impact ?',
      });
    }

    return suggestions.slice(0, 3);
  }

  function renderDynamicSuggestions(suggestions) {
    var container = document.getElementById('ie-prompt-suggestions-label');
    if (!container) return;

    // Remove old static cards (but not finder)
    var oldCards = document.querySelectorAll('.ie-prompt-card:not(#ie-finder-card)');
    for (var i = 0; i < oldCards.length; i++) { oldCards[i].remove(); }

    if (!suggestions.length) {
      container.style.display = 'none';
      return;
    }

    container.textContent = 'Explorez vos donn\u00e9es';

    var html = '';
    for (var i = 0; i < suggestions.length; i++) {
      var s = suggestions[i];
      html += '<a href="#" class="ie-prompt-card ie-dynamic-suggestion" data-dynamic-q="' + escapeHtml(s.q) + '" style="margin-bottom:6px;border-radius:10px;">'
        + '<div class="ie-prompt-card-icon" style="background:' + s.iconBg + ';color:' + s.iconColor + ';">' + s.svg + '</div>'
        + '<div class="ie-prompt-card-content">'
          + '<p class="ie-prompt-card-text" style="font-size:13px;font-weight:500;margin:0 0 2px;">' + escapeHtml(s.text) + '</p>'
          + '<p style="font-size:11px;color:#6b7280;margin:0;">' + escapeHtml(s.sub) + '</p>'
        + '</div>'
        + '<div class="ie-prompt-card-arrow"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></div>'
      + '</a>';
    }

    container.insertAdjacentHTML('afterend', html);

    document.querySelectorAll('.ie-dynamic-suggestion').forEach(function(card) {
      card.addEventListener('click', function(e) {
        e.preventDefault();
        var q = card.getAttribute('data-dynamic-q') || '';
        setTextareaValue(q);
        submitQuestion(q);
      });
    });
  }

  const qs = (id) => document.getElementById(id);

  function autoResizeTextarea(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }

  function syncInputWrapHeight() {
    const wrap = qs("ie-prompt-input-wrap");
    if (!wrap) return;
    document.documentElement.style.setProperty(
      "--ie-input-wrap-h",
      wrap.offsetHeight + "px"
    );
  }

  function setTextareaValue(text) {
    const ta = qs("ie-prompt-input");
    if (!ta) return;
    ta.value = text;
    autoResizeTextarea(ta);
    syncInputWrapHeight();
    ta.focus();
  }

  function appendMsg(role, text, extraClass) {
    const thread = qs("ie-thread");
    if (!thread) return null;

    const row = document.createElement("div");
    row.className = "ie-msg " + (role === "user" ? "ie-msg-user" : "ie-msg-ai");

    const bubble = document.createElement("div");
    bubble.className = "ie-bubble" + (extraClass ? " " + extraClass : "");
    // default safe text
    bubble.textContent = text || "";

    row.appendChild(bubble);
    thread.appendChild(row);

    row.scrollIntoView({ block: "end" });

    return bubble;
  }
  
  function setBubbleHtml(bubble, html) {
    if (!bubble) return;
    bubble.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderConfirmationHtml(out) {
    const msg = escapeHtml(out.confirmation_message || "Voici comment j'ai compris votre demande :");
    const params = out.params || {};
    const confirmed_q = escapeHtml(JSON.stringify(out.confirmed_q || ""));

    const paramLines = Object.entries(params)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `<div class="ie-confirm-param"><span class="ie-confirm-key">${escapeHtml(k)}</span><span class="ie-confirm-val">${escapeHtml(String(v))}</span></div>`)
      .join("");

    return `
      <div class="ie-confirm-block">
        <div class="ie-confirm-msg">${msg}</div>
        <div class="ie-confirm-params">${paramLines}</div>
        <div class="ie-confirm-actions">
          <button class="ie-confirm-yes" data-confirmed-q='${JSON.stringify(out.confirmed_q || "")}' data-confirmed-params='${JSON.stringify(params)}'>Confirmer →</button>
          <button class="ie-confirm-no">Modifier</button>
        </div>
      </div>
    `;
  }

  function renderAiOutputHtml(out) {
    const n =
      (out?.ai && typeof out.ai === "object")
        ? (out.ai.output && typeof out.ai.output === "object" ? out.ai.output : out.ai)
        : null;
    if (!n || typeof n !== "object") return "";

    const intent = typeof out?.meta?.resolved_intent === "string" ? out.meta.resolved_intent : "";
    const horizon = typeof out?.meta?.resolved_horizon === "string" ? out.meta.resolved_horizon : "";
    const isLookup = horizon === "lookup_event" || intent === "LOOKUP_EVENT";
    const isTopDays = intent === "WINDOW_TOP_DAYS";
    const isWorstDays = intent === "WINDOW_WORST_DAYS";
    const isCompare = intent === "COMPARE_DATES";
    const isDayWhy = intent === "DAY_WHY";
    const isDayDimension = intent === "DAY_DIMENSION_DETAIL";

    const headline =
      (typeof n.headline === "string" && n.headline.trim()) ? n.headline.trim() :
      (typeof out?.ai?.headline === "string" && out.ai.headline.trim()) ? out.ai.headline.trim() : "";

    const verdict =
      typeof out?.ai?.verdict === "string" && out.ai.verdict.trim() ? out.ai.verdict.trim() :
      typeof out?.ai?.output?.verdict === "string" && out.ai.output.verdict.trim() ? out.ai.output.verdict.trim() : "";

    const answerRaw =
      Array.isArray(n.answer) && n.answer.length ? n.answer :
      Array.isArray(out?.ai?.answer) && out.ai.answer.length ? out.ai.answer :
      (typeof n.answer === "string" && n.answer.trim()) ? n.answer.trim() :
      (typeof n.summary === "string" && n.summary.trim()) ? n.summary.trim() :
      (typeof out?.ai?.answer === "string" && out.ai.answer.trim()) ? out.ai.answer.trim() : "";

    const answer = Array.isArray(answerRaw) ? "" : answerRaw;
    const answerDates = Array.isArray(answerRaw) ? answerRaw : [];

    console.log("[render] intent:", intent, "horizon:", horizon, "answerDates:", answerDates.length, "answer:", typeof answer === "string" ? answer.slice(0, 50) : answer);

    const keyFacts = Array.isArray(n.key_facts) ? n.key_facts : [];
    const caveats =
      Array.isArray(n.caveats) ? n.caveats :
      (typeof n.caveat === "string" && n.caveat.trim()) ? [n.caveat.trim()] : [];

    const primary = out?.actions?.primary;
    const primaryLink =
      primary && typeof primary === "object" &&
      primary.type === "redirect" &&
      typeof primary.url === "string" && primary.url.startsWith("/") &&
      typeof primary.label === "string" && primary.label.trim()
        ? { url: primary.url, label: primary.label.trim() } : null;

    const cta = primaryLink
      ? `<div class="ie-ai-cta" style="display:flex;justify-content:flex-end;"><a href="${escapeHtml(primaryLink.url)}" class="ie-inline-cta">${escapeHtml(primaryLink.label)} →</a></div>`
      : "";

    // ── LOOKUP ──────────────────────────────────────────────────
    if (isLookup) {
      if (!answer && !keyFacts.length) {
        return `<div class="ie-lookup-notfound">Cet événement n&#039;est pas référencé dans notre base de données. Essayez avec le nom exact de l&#039;événement ou une autre formulation.</div>`;
      }
      const items = answer.split("\n").filter(Boolean).map(line => {
        const sepIdx = line.indexOf("||");
        const raw = sepIdx > -1 ? line.slice(0, sepIdx) : line;
        const desc = sepIdx > -1 ? line.slice(sepIdx + 2) : "";
        const colonIdx = raw.indexOf(": ");
        const dateStr = colonIdx > -1 ? raw.slice(0, colonIdx) : "";
        const eventName = colonIdx > -1 ? raw.slice(colonIdx + 2) : raw;
        return `<div class="ie-lookup-item">
          <div class="ie-lookup-name">${escapeHtml(eventName)}</div>
          ${dateStr ? `<div class="ie-lookup-date">${escapeHtml(dateStr)}</div>` : ""}
          ${desc ? `<div class="ie-lookup-desc">${escapeHtml(desc)}</div>` : ""}
        </div>`;
      });
      const hdl = headline && headline !== "Résumé" ? `<div class="ie-lookup-headline">${escapeHtml(headline)}</div>` : "";
      return `${hdl}${items.join("")}`;
    }

    // ── DAY_DIMENSION_DETAIL ─────────────────────────────────────
    if (isDayDimension) {
      const raw = typeof answer === "string" ? answer : "";
      const parts = raw.split("\n\n").filter(Boolean);

      const listPart = parts[0] ?? "";
      const analysisPart = parts[1] ?? "";
      const recommendationPart = parts[2] ?? "";

      const listLines = listPart.split("\n").filter(Boolean);
      const densityLine = listLines[0] ?? "";
      let competitorLines = listLines.slice(1);
      if (competitorLines.length === 0 && listLines.length === 1) {
        // Claude didn't use \n — split on pattern "[Name] — [distance] m"
        competitorLines = listPart
          .split(/(?=\S[^—]+—\s*\d+\s*m)/)
          .map(s => s.trim())
          .filter(s => s.includes(" — ") && s.match(/\d+\s*m/))
          .filter(Boolean);
      }

      const competitorRows = competitorLines
        .map(line => `<div class="ie-competitor-row">${escapeHtml(line.trim())}</div>`)
        .join("");

      return `
        <div class="ie-why-headline">${escapeHtml(headline)}</div>
        ${competitorRows ? `<div class="ie-competitor-list">${competitorRows}</div>` : ""}
        ${analysisPart ? `<div class="ie-competitor-analysis">${escapeHtml(analysisPart)}</div>` : ""}
        ${recommendationPart ? `<div class="ie-competitor-recommendation">${escapeHtml(recommendationPart)}</div>` : ""}
        ${cta}
      `;
    }
    
    if (isDayWhy) {
      const isGood = answer.toLowerCase().includes("bien noté") || !answer.toLowerCase().includes("mal noté");
      const pillClass = isGood ? "ie-pill-blue" : "ie-pill-amber";
      const chiffreCle = "";
      const prose = answer.split("\n\n").filter(Boolean);
      const intro = prose[0] ?? "";
      const rows = prose.slice(1);
      return `
        <div class="ie-why-headline">${escapeHtml(headline)}</div>
        ${chiffreCle ? `<div class="${pillClass}">${escapeHtml(chiffreCle)}</div>` : ""}
        ${intro ? `<div class="ie-why-intro">${escapeHtml(intro)}</div>` : ""}
        ${rows.map(r => `<div class="ie-why-row">${escapeHtml(r).replace(/^(Disponibilité (de votre )?audience\s*:)/, '<strong>$1</strong>').replace(/^(Pression concurrentielle\s*:)/, '<strong>$1</strong>').replace(/^(Accessibilité du site\s*:)/, '<strong>$1</strong>').replace(/^(Conditions d&#039;exploitation\s*:)/, '<strong>$1</strong>')}</div>`).join("")}
        ${cta}
      `;
    }

    // ── WINDOW_TOP_DAYS / WINDOW_WORST_DAYS / COMPARE_DATES ─────
    if (isTopDays || isWorstDays || isCompare) {
      const isV3 =
        out?.ui_packaging_v3?.v === 3 &&
        Array.isArray(out.ui_packaging_v3.dates);

      const cardClass = isWorstDays ? "ie-card-amber" : "ie-card-blue";
      const pillClass = isWorstDays ? "ie-pill-amber" : "ie-pill-blue";
      const verdictClass = isWorstDays ? "ie-verdict-amber" : "ie-verdict-blue";

      const verdictHtml = verdict ? `<div class="ie-verdict-plain">${escapeHtml(verdict)}</div>` : "";
      const headlineHtml = headline ? `<div class="ie-section-h">${escapeHtml(headline)}</div>` : "";

      let cardsHtml = "";

      if (answerDates.length) {
        cardsHtml = answerDates.map((d, idx) => {
          let cc = cardClass;
          let pc = pillClass;
          if (isCompare) {
            const isWinner = d.label && d.label.includes("recommandé");
            cc = isWinner ? "ie-card-blue" : "ie-card-amber";
            pc = isWinner ? "ie-pill-blue" : "ie-pill-amber";
          }
          const rankPrefix = (isTopDays || isWorstDays) ? `#${idx + 1} — ` : "";
          return `
            <div class="${cc}">
              <div class="ie-card-label">${escapeHtml(rankPrefix + (d.label ?? d.date ?? ""))}</div>
              ${d.c2 ? `<div class="${pc}">${escapeHtml(d.c2.replace(/^Pression concurrentielle\s*:\s*/, ""))}</div>` : ""}
              ${d.c1 ? `<div class="ie-card-row"><strong>Disponibilité audience :</strong> ${escapeHtml(d.c1.replace(/^Disponibilité audience\s*:\s*/, ""))}</div>` : ""}
              ${d.c3 ? `<div class="ie-card-row"><strong>Accessibilité :</strong> ${escapeHtml(d.c3.replace(/^Accessibilité du site\s*:\s*/, ""))}</div>` : ""}
              ${d.c4 ? `<div class="ie-card-row"><strong>Conditions :</strong> ${escapeHtml(d.c4.replace(/^Conditions d'exploitation\s*:\s*/, ""))}</div>` : ""}
            </div>`;
        }).join("");
      } else if (isV3) {
        cardsHtml = out.ui_packaging_v3.dates.map((d, idx) => {
          const label = typeof d?.date_label === "string" ? d.date_label : d?.date ?? "";
          const regime = d?.score?.regime ?? d?.regime ?? "";
          const score = d?.score?.score ?? d?.score ?? null;
          const sub = [regime ? `classé ${regime}` : "", score !== null ? `soit ${Number(score).toFixed(1)}/10` : ""].filter(Boolean).join(", ");
          return `
            <div class="${cardClass}">
              <div class="ie-card-label">#${idx + 1} — ${escapeHtml(label)}${sub ? `, ${sub}` : ""}</div>
            </div>`;
        }).join("");
      }

      const v3Primary = out?.ui_packaging_v3 ? (out?.actions?.primary ?? null) : null;
      const v3Link = v3Primary && typeof v3Primary.url === "string" && v3Primary.url.startsWith("/")
        ? `<div class="ie-ai-cta"><a href="${escapeHtml(v3Primary.url)}" class="ie-inline-cta">Consulter →</a></div>`
        : cta;

      return `${verdictHtml}${headlineHtml}${cardsHtml}${v3Link}`;
    }

    // ── FALLBACK (generic prose) ─────────────────────────────────
    return `
      ${headline ? `<div class="ie-ai-h">${escapeHtml(headline)}</div>` : ""}
      ${answer ? answer.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<div class="ie-ai-p">${escapeHtml(p).replace(/\n/g, "<br/>")}</div>`).join("") : ""}
      ${keyFacts.length ? `<ul class="ie-ai-list">${keyFacts.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
      ${caveats.length ? `<div class="ie-ai-caveats">${caveats.map(c => `<div class="ie-ai-cv">${escapeHtml(c)}</div>`).join("")}</div>` : ""}
      ${cta}
    `;
  }

  function isQuestion(q) {
    var s = q.trim().toLowerCase();
    if (s.length > 50) return true;
    if (s.endsWith('?')) return true;
    var starters = ['quel','quelle','quels','quelles','quand','pourquoi','comment','combien','est-ce','compare','explique','analyse','montre','donne','liste','trouve'];
    var first = s.split(/\s+/)[0] || '';
    for (var i = 0; i < starters.length; i++) { if (first === starters[i]) return true; }
    var contains = ['impact','risque','meilleur','pire','score','opportunit','pourquoi','comment','difference','differencier','comparer','conseill','recommand','menace','audience','frequentation'];
    for (var i = 0; i < contains.length; i++) { if (s.indexOf(contains[i]) >= 0) return true; }
    return false;
  }

  async function submitQuestion(overrideQ, confirmedParams) {
    const ta = qs("ie-prompt-input");
    const q = overrideQ || (ta && ta.value ? ta.value : "").trim();
    if (!q) return;

    // Smart routing: questions → AI prompt, keywords → competitor search
    const activeMode = document.querySelector('.ie-mode-btn.active')?.dataset?.mode ?? 'planning';
    if (!isQuestion(q) && typeof window.__ieRunConcSearch === 'function') {
      // Short keyword → competitor search regardless of mode
      // If in planning mode, setMode to concurrence temporarily for search UI
      if (activeMode === 'planning') {
        window.__ieSetMode('concurrence');
      }
      window.__ieRunConcSearch();
      return;
    }
    // Questions always go to AI prompt, even in concurrence mode

    const btn = qs("ie-prompt-submit-btn");
    btn?.setAttribute("disabled", "true");

    // IMPORTANT: append first, then hide empty → prevents "blank screen" on any JS error
    const userBubble = appendMsg("user", q);
    if (!userBubble) {
      btn?.removeAttribute("disabled");
      return;
    }

    qs("ie-prompt-empty")?.setAttribute("hidden", "true");
    qs("ie-thread")?.removeAttribute("hidden");

    // Clear input immediately after sending (ChatGPT behavior)
    ta.value = "";
    autoResizeTextarea(ta);
    syncInputWrapHeight();

    // Append user turn to history before sending
    CONVERSATION_HISTORY.push({ role: "user", content: q });

    const aiBubble = appendMsg("ai", "", "is-loading");
    setBubbleHtml(aiBubble, `<div style="display:flex;justify-content:center;width:100%;min-width:0;box-sizing:border-box;"><img src="/icons/load/ms_load_icon.gif" alt="Analyse en cours" style="height:140px;width:auto;" /></div>`);

    try {
      const currentMode = typeof window.__ieSetMode === 'function'
        ? (document.querySelector('.ie-mode-btn.active')?.dataset?.mode ?? 'planning')
        : 'planning';

      const res = await fetch("/api/insight/prompt", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          q,
          mode: currentMode,
          thread_context: THREAD_CONTEXT,
          conversation_history: CONVERSATION_HISTORY.slice(-12),
          confirmed_params: confirmedParams || null
        })
      });

      const out = await res.json().catch(() => null);

      console.log("[ie-prompt] API out", out);

      updateThreadContextFromResponse(out);

      // Append assistant turn to history
      const assistantText = (typeof out?.ai?.output?.answer === "string" && out.ai.output.answer.trim())
        ? out.ai.output.answer.trim()
        : (typeof out?.ai?.output?.headline === "string" ? out.ai.output.headline.trim() : "");
      if (assistantText) {
        CONVERSATION_HISTORY.push({ role: "assistant", content: assistantText });
      }

      if (out?.ai && out.ai.ok === false && !out?.ai?.output) {
        const errText =
          Array.isArray(out.ai.errors) && out.ai.errors.length
            ? out.ai.errors.join("\n")
            : "AI packager failed (no errors array).";

        if (aiBubble) {
          aiBubble.className = "ie-bubble is-error";
          aiBubble.textContent = errText;
        }
        return;
      }

      if (!res.ok || !out) {
        if (aiBubble) {
          aiBubble.className = "ie-bubble is-error";
          aiBubble.textContent = `Erreur lors de l’analyse (HTTP ${res.status}).`;
        }
        return;
      }

      // Handle parameter confirmation flow
      if (out.type === "confirmation") {
        if (aiBubble) {
          aiBubble.className = "ie-bubble-none";
          setBubbleHtml(aiBubble, renderConfirmationHtml(out));
        }
        return;
      }

      const ok = out.ok === true || out.ok === "true";
      if (!ok) {
        if (aiBubble) {
          aiBubble.className = "ie-bubble is-error";
          aiBubble.textContent = out.error || "Erreur lors de l'analyse.";
        }
        return;
      }

      const html = renderAiOutputHtml(out);
      const producer = out?.meta?.producer ?? null;
      const sourcePillHtml = (() => {
        if (!producer) return '';
        let label, bg, color;
        if (producer === 'v3_claude' || producer === 'deterministic' || producer === 'v3_fallback_deterministic') {
          label = 'Muse Square'; bg = 'var(--color-pill-safe-bg)'; color = 'var(--color-pill-safe-text)';
        } else if (producer === 'web_search') {
          label = 'Web'; bg = 'var(--color-pill-source-low-bg)'; color = 'var(--color-pill-source-low-text)';
        } else if (producer === 'llm_only') {
          label = 'Claude — non vérifiée'; bg = 'var(--color-pill-source-mid-bg)'; color = 'var(--color-pill-source-mid-text)';
        } else {
          return '';
        }
        return `<div style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;background:${bg};color:${color};margin-bottom:10px;letter-spacing:.04em;">${label}</div>`;
      })();

      if (aiBubble) {
        aiBubble.className = "ie-bubble-none";
        if (html) {
          setBubbleHtml(aiBubble, sourcePillHtml + html);
        } else {
          const fallbackText =
            (typeof out?.ai?.output?.answer === "string" && out.ai.output.answer.trim()) ? out.ai.output.answer :
            (typeof out?.answer_text === "string" && out.answer_text.trim()) ? out.answer_text :
            (typeof out?.error === "string" && out.error.trim()) ? out.error :
            "Réponse reçue, mais aucun contenu affichable n'a été détecté.";

          aiBubble.textContent = fallbackText || "";
        }
      }

      console.log("[ie-prompt] bubble.innerHTML length", aiBubble?.innerHTML?.length);
      console.log("[ie-prompt] bubble.textContent length", aiBubble?.textContent?.length);

    } catch (e) {
      console.error("[ie-prompt] catch error:", e);
      if (aiBubble) {
        aiBubble.className = "ie-bubble is-error";
        aiBubble.textContent = "Erreur réseau. Veuillez réessayer.";
      }
    } finally {
      btn?.removeAttribute("disabled");
    }
  }

  // Delegate confirmation button clicks
  document.addEventListener("click", (e) => {
    const yes = e.target.closest(".ie-confirm-yes");
    const no = e.target.closest(".ie-confirm-no");
    if (yes) {
      const confirmedQ = yes.dataset.confirmedQ || "";
      const confirmedParams = JSON.parse(yes.dataset.confirmedParams || "{}");
      // Re-submit with confirmed params bypassing extraction
      submitQuestion(confirmedQ, confirmedParams);
    } else if (no) {
      qs("ie-prompt-input")?.focus();
    }
  });

  // Bind suggestion cards (exclude finder card)
  document.querySelectorAll(".ie-prompt-card:not(#ie-finder-card)").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const idx = Number(card.getAttribute("data-suggestion-idx") || "0");
      setTextareaValue(SUGGESTION_CHIPS[idx] || "");
    });
  });

  // Bind submit button
  qs("ie-prompt-submit-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    submitQuestion();
  });

  // Bind enter key
  qs("ie-prompt-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitQuestion();
    }
  });

    qs("ie-prompt-input")?.addEventListener("input", () => {
      const ta = qs("ie-prompt-input");
      if (!ta) return;
      autoResizeTextarea(ta);
      syncInputWrapHeight();
    });

  // ---- Finder form ----
    const finderCard = document.getElementById("ie-finder-card");
    const finderChip = document.getElementById("ie-finder-chip");
    const finderForm = document.getElementById("ie-finder-form");
    const finderChevron = document.getElementById("ie-finder-chevron");
    const finderError = document.getElementById("ie-finder-error");
    const finderSubmit = document.getElementById("ie-finder-submit");

    let finderOpen = false;

    function toggleFinderForm() {
      finderOpen = !finderOpen;
      if (finderForm) finderForm.style.display = finderOpen ? "block" : "none";
      if (finderChevron) finderChevron.style.transform = finderOpen ? "rotate(180deg)" : "rotate(0deg)";
      const inputBar = document.getElementById('ie-prompt-input-bar');
      if (inputBar) inputBar.style.display = finderOpen ? 'none' : '';
    }

    if (finderCard) {
      finderCard.addEventListener("click", (e) => {
        e.preventDefault();
        toggleFinderForm();
      });
    }

    if (finderChip) {
      finderChip.addEventListener("click", (e) => {
        e.preventDefault();
        toggleFinderForm();
        if (finderOpen && finderForm) {
          finderForm.scrollIntoView({ block: "nearest" });
        }
      });
    }

    function setFinderError(msg) {
      if (!finderError) return;
      finderError.textContent = msg;
      finderError.style.display = msg ? "block" : "none";
    }

    async function submitFinder() {
      setFinderError("");

      const start = document.getElementById("ie-finder-date-start")?.value ?? "";
      const end = document.getElementById("ie-finder-date-end")?.value ?? "";
      const weekday = document.getElementById("ie-finder-weekday")?.checked ?? true;
      const weekend = document.getElementById("ie-finder-weekend")?.checked ?? true;
      const exclSchool = document.getElementById("ie-finder-excl-school")?.checked ?? false;
      const exclHolidays = document.getElementById("ie-finder-excl-holidays")?.checked ?? false;

      if (!weekday && !weekend) { setFinderError("Sélectionnez au moins un type de jour."); return; }
      if (!start || !end) { setFinderError("Renseignez la fenêtre de dates."); return; }
      if (start > end) { setFinderError("La date de début doit être avant la date de fin."); return; }

      if (finderSubmit) { finderSubmit.disabled = true; finderSubmit.textContent = "Recherche en cours…"; }

      console.log("[finder] payload:", JSON.stringify({ date_start: start, date_end: end, allow_weekday: weekday, allow_weekend: weekend, exclude_school_holidays: exclSchool, exclude_public_holidays: exclHolidays }));
      try {
        const res = await fetch("/api/insight/find-dates", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            date_start: start,
            date_end: end,
            allow_weekday: weekday,
            allow_weekend: weekend,
            exclude_school_holidays: exclSchool,
            exclude_public_holidays: exclHolidays,
          }),
        });

        const out = await res.json().catch(() => null);

        if (!res.ok || !out?.ok) {
          setFinderError(out?.error ?? `Erreur (${res.status})`);
          return;
        }

        if (!out.dates_csv) {
          setFinderError("Aucune date disponible pour ces critères.");
          return;
        }

        sessionStorage.setItem("ms_finder_narrative", out.narrative ?? "");
        sessionStorage.setItem("ms_finder_is_least_worst", out.is_least_worst ? "1" : "0");

        window.location.href = `/app/insightevent/days?selected_dates=${encodeURIComponent(out.dates_csv)}&source=finder`;

      } catch (e) {
        setFinderError("Erreur réseau. Veuillez réessayer.");
      } finally {
        if (finderSubmit) { finderSubmit.disabled = false; finderSubmit.textContent = "Trouver les meilleures dates →"; }
      }
    }

    if (finderSubmit) finderSubmit.addEventListener("click", submitFinder);

    // Default dates
    const todayStr = new Date().toISOString().slice(0, 10);
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    const dsEl = document.getElementById("ie-finder-date-start");
    const deEl = document.getElementById("ie-finder-date-end");
    if (dsEl && !dsEl.value) dsEl.value = todayStr;
    if (deEl && !deEl.value) deEl.value = in30Str;

    syncInputWrapHeight();

    // Load dynamic suggestions + competitor signals
    Promise.all([
      fetchMonitorForSuggestions(),
      fetchCompetitorSignalsForSuggestions()
    ]).then(function(results) {
      var data = results[0];
      var compData = results[1];
      if (!data) return;
      var suggestions = buildDynamicSuggestions(data, compData);
      if (suggestions.length) {
        renderDynamicSuggestions(suggestions);
        for (var i = 0; i < suggestions.length; i++) {
          SUGGESTION_CHIPS[i] = suggestions[i].q;
        }
      }
      // Status chips
      var chipsEl = document.getElementById('ie-prompt-status-chips');
      if (chipsEl && Array.isArray(data.days) && data.days.length) {
        var todayYmd = (function() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); })();
        var todayDay = null;
        for (var i = 0; i < data.days.length; i++) {
          if (String(data.days[i].date || '').slice(0,10) === todayYmd) { todayDay = data.days[i]; break; }
        }
        if (!todayDay) todayDay = data.days[0];
        var chips = [];
        var score = Number(todayDay.opportunity_score || 0);
        if (score > 0) chips.push('<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;background:#E6F1FB;color:#0C447C;">' + score.toFixed(1) + '/10 score</span>');
        var alerts = Number(todayDay.alert_level_max || 0);
        if (alerts >= 2) chips.push('<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;background:#FAEEDA;color:#633806;">' + alerts + ' alerte' + (alerts > 1 ? 's' : '') + '</span>');
        var compCount = compData ? compData.followed_count : 0;
        chips.push('<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:500;background:#f3f4f6;color:#6b7280;">' + compCount + ' concurrent' + (compCount > 1 ? 's' : '') + ' suivi' + (compCount > 1 ? 's' : '') + '</span>');
        chipsEl.innerHTML = chips.join('');
      }
    });
  }
