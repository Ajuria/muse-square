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

  // ----------------------------
  // SAFE MARKDOWN RENDERER (Phase 3)
  // The model formats despite the prompts telling it not to (**gras**, "- " lists). Rendering that as
  // literal asterisks is the formatting inconsistency; so we render a WHITELIST instead of fighting it.
  //
  // SAFETY MODEL — the ORDERING is the entire guarantee:
  //   1. escapeHtml() FIRST  → every byte the model emitted becomes inert text (any <script>, <img
  //      onerror>, quote or bracket is already neutralized)
  //   2. re-introduce ONLY whitelisted tags on the already-escaped string
  // NEVER the reverse. No raw HTML passthrough, no sanitizer dependency (CDN-free rule).
  //
  // Whitelist: **gras** → <strong>, *italique* → <em>.
  // Deliberately OUT: links (nothing validates a model-emitted URL — a clickable hallucinated source is
  // worse than an ugly one), #titres, tables, code, images. Anything off-list stays plain text.
  //
  // INLINE-ONLY on purpose: every render branch below already does its own block layout (it splits the
  // prose on \n\n and wraps each part in .ie-why-intro / .ie-ai-p / .ie-competitor-row …). Emitting <p>
  // here would double-wrap and restyle branches that work today. Blocks stay the caller's job.
  // ----------------------------
  function mdInline(t) {
    return t
      .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")        // **gras** — before *italique*
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");   // *italique*
  }

  // The one call sites use: escape FIRST (inert), then re-introduce ONLY the whitelist.
  // Drop-in for escapeHtml() on any model-authored prose.
  function mdInlineToSafeHtml(text) {
    return mdInline(escapeHtml(text));
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

    // Family-led answer → render the FULL family card INLINE (the report content, in the chat), via the
    // shared MSCardKit. The card IS the detailed answer — no LLM summarizer, no click-through report.
    if (out && out.family_card && window.MSCardKit && typeof window.MSCardKit[out.family_card.render] === "function") {
      const fc = out.family_card;
      const lead = (typeof n.headline === "string" && n.headline.trim() && n.headline.trim() !== "Résumé")
        ? `<div class="ie-why-headline">${mdInlineToSafeHtml(n.headline.trim())}</div>` : "";
      // renderX expects the endpoint shape { ok, found, ... }; provider data has `found` but not `ok`.
      const card = window.MSCardKit[fc.render](Object.assign({ ok: true }, fc.data));
      return `${lead}<div class="ie-family-card">${card}</div>`;
    }

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
          <div class="ie-lookup-name">${mdInlineToSafeHtml(eventName)}</div>
          ${dateStr ? `<div class="ie-lookup-date">${escapeHtml(dateStr)}</div>` : ""}
          ${desc ? `<div class="ie-lookup-desc">${mdInlineToSafeHtml(desc)}</div>` : ""}
        </div>`;
      });
      const hdl = headline && headline !== "Résumé" ? `<div class="ie-lookup-headline">${mdInlineToSafeHtml(headline)}</div>` : "";
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
        .map(line => `<div class="ie-competitor-row">${mdInlineToSafeHtml(line.trim())}</div>`)
        .join("");

      return `
        <div class="ie-why-headline">${mdInlineToSafeHtml(headline)}</div>
        ${competitorRows ? `<div class="ie-competitor-list">${competitorRows}</div>` : ""}
        ${analysisPart ? `<div class="ie-competitor-analysis">${mdInlineToSafeHtml(analysisPart)}</div>` : ""}
        ${recommendationPart ? `<div class="ie-competitor-recommendation">${mdInlineToSafeHtml(recommendationPart)}</div>` : ""}
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
        <div class="ie-why-headline">${mdInlineToSafeHtml(headline)}</div>
        ${chiffreCle ? `<div class="${pillClass}">${escapeHtml(chiffreCle)}</div>` : ""}
        ${intro ? `<div class="ie-why-intro">${mdInlineToSafeHtml(intro)}</div>` : ""}
        ${rows.map(r => `<div class="ie-why-row">${mdInlineToSafeHtml(r).replace(/^(Disponibilité (de votre )?audience\s*:)/, '<strong>$1</strong>').replace(/^(Pression concurrentielle\s*:)/, '<strong>$1</strong>').replace(/^(Accessibilité du site\s*:)/, '<strong>$1</strong>').replace(/^(Conditions d&#039;exploitation\s*:)/, '<strong>$1</strong>')}</div>`).join("")}
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

      const verdictHtml = verdict ? `<div class="ie-verdict-plain">${mdInlineToSafeHtml(verdict)}</div>` : "";
      const headlineHtml = headline ? `<div class="ie-section-h">${mdInlineToSafeHtml(headline)}</div>` : "";

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
              ${d.c2 ? `<div class="${pc}">${mdInlineToSafeHtml(d.c2.replace(/^Pression concurrentielle\s*:\s*/, ""))}</div>` : ""}
              ${d.c1 ? `<div class="ie-card-row"><strong>Disponibilité audience :</strong> ${mdInlineToSafeHtml(d.c1.replace(/^Disponibilité audience\s*:\s*/, ""))}</div>` : ""}
              ${d.c3 ? `<div class="ie-card-row"><strong>Accessibilité :</strong> ${mdInlineToSafeHtml(d.c3.replace(/^Accessibilité du site\s*:\s*/, ""))}</div>` : ""}
              ${d.c4 ? `<div class="ie-card-row"><strong>Conditions :</strong> ${mdInlineToSafeHtml(d.c4.replace(/^Conditions d'exploitation\s*:\s*/, ""))}</div>` : ""}
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
      ${headline ? `<div class="ie-ai-h">${mdInlineToSafeHtml(headline)}</div>` : ""}
      ${answer ? answer.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<div class="ie-ai-p">${mdInlineToSafeHtml(p).replace(/\n/g, "<br/>")}</div>`).join("") : ""}
      ${keyFacts.length ? `<ul class="ie-ai-list">${keyFacts.map(x => `<li>${mdInlineToSafeHtml(x)}</li>`).join("")}</ul>` : ""}
      ${caveats.length ? `<div class="ie-ai-caveats">${caveats.map(c => `<div class="ie-ai-cv">${mdInlineToSafeHtml(c)}</div>`).join("")}</div>` : ""}
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

  // ── On-demand report detection ("génère le rapport de juin", "rapport semaine dernière") ──
  function repIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function repMonthRange(year, m0) { return [repIso(new Date(year, m0, 1)), repIso(new Date(year, m0 + 1, 0))]; }
  var REP_MONTHS = ["janvier", "fevrier|février", "mars", "avril", "mai", "juin", "juillet", "aout|août", "septembre", "octobre", "novembre", "decembre|décembre"];
  function parseFrPeriod(q) {
    var s = q.toLowerCase(), now = new Date(), m;
    if ((m = s.match(/du\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+au\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/)))
      return [m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"), m[6] + "-" + m[5].padStart(2, "0") + "-" + m[4].padStart(2, "0")];
    if ((m = s.match(/du\s+(\d{4}-\d{2}-\d{2})\s+au\s+(\d{4}-\d{2}-\d{2})/))) return [m[1], m[2]];
    if ((m = s.match(/(\d{1,3})\s+derniers?\s+jours/))) { var e = new Date(now); e.setDate(e.getDate() - 1); var st = new Date(e); st.setDate(st.getDate() - (parseInt(m[1], 10) - 1)); return [repIso(st), repIso(e)]; }
    if (/semaine\s+(derni[eè]re|pass[eé]e)/.test(s)) { var e2 = new Date(now); e2.setDate(e2.getDate() - 1); var s2 = new Date(e2); s2.setDate(s2.getDate() - 6); return [repIso(s2), repIso(e2)]; }
    if (/mois\s+(derni[eè]r|pass[eé])/.test(s)) return repMonthRange(now.getFullYear(), now.getMonth() - 1);
    if (/ce\s+mois|mois\s+en\s+cours|mois-ci/.test(s)) return [repIso(new Date(now.getFullYear(), now.getMonth(), 1)), repIso(now)];
    for (var i = 0; i < 12; i++) { if (new RegExp("\\b(" + REP_MONTHS[i] + ")\\b").test(s)) { var ym = s.match(/\b(20\d{2})\b/); return repMonthRange(ym ? parseInt(ym[1], 10) : now.getFullYear(), i); } }
    return null;
  }
  function reportPeriodFromText(q) {
    var s = q.toLowerCase();
    if (!/\brapports?\b|\breports?\b/.test(s)) return null;
    var genVerb = /\b(g[eéè]n[eéè]r|cr[eé]e|produi|t[eéè]l[eéè]charg|export|sor[st]\b)/.test(s);
    var r = parseFrPeriod(q);
    if (!r && !genVerb) return null; // "quel rapport entre X et Y" → not a report request
    if (!r) { var e = new Date(); e.setDate(e.getDate() - 1); var st = new Date(e); st.setDate(st.getDate() - 29); r = [repIso(st), repIso(e)]; }
    return r;
  }
  function navReport(period, loc) {
    window.location.href = "/app/insightevent/rapport?start=" + encodeURIComponent(period[0]) + "&end=" + encodeURIComponent(period[1]) + (loc ? "&loc=" + encodeURIComponent(loc) : "");
  }
  async function startReport(period, originalText) {
    qs("ie-prompt-empty")?.setAttribute("hidden", "true");
    qs("ie-thread")?.removeAttribute("hidden");
    appendMsg("user", originalText);
    var locs = [];
    try { var res = await fetch("/api/import/locations"); var j = await res.json().catch(function () { return null; }); if (j && j.ok && Array.isArray(j.locations)) locs = j.locations; } catch (e) {}
    if (locs.length > 1) {
      var rows = locs.map(function (l) {
        return '<label class="ie-report-loc-opt" data-loc="' + escapeHtml(l.location_id) + '" data-start="' + escapeHtml(period[0]) + '" data-end="' + escapeHtml(period[1]) + '" style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer;"><span class="ie-import-radio" style="width:16px;height:16px;border-radius:50%;border:1.5px solid #9ca3af;flex-shrink:0;box-sizing:border-box;"></span><span style="font-size:14px;color:#111827;">' + escapeHtml(l.label) + '</span></label>';
      }).join("");
      var b = appendMsg("ai", "");
      if (b) setBubbleHtml(b, '<div class="ie-confirm-block"><div class="ie-confirm-msg">Pour quel établissement ?</div><div style="display:flex;flex-direction:column;gap:2px;">' + rows + '</div></div>');
    } else {
      navReport(period, locs.length === 1 ? locs[0].location_id : null);
    }
  }
  document.addEventListener("click", function (e) {
    var opt = e.target.closest(".ie-report-loc-opt");
    if (!opt) return;
    e.preventDefault();
    var block = opt.closest(".ie-confirm-block");
    if (block) {
      block.style.pointerEvents = "none";
      var rr = block.querySelectorAll(".ie-import-radio");
      for (var i = 0; i < rr.length; i++) rr[i].style.border = "1.5px solid #9ca3af";
      var rad = opt.querySelector(".ie-import-radio");
      if (rad) rad.style.border = "5px solid #1D3BB3";
    }
    navReport([opt.getAttribute("data-start"), opt.getAttribute("data-end")], opt.getAttribute("data-loc"));
  });

  async function submitQuestion(overrideQ, confirmedParams) {
    const ta = qs("ie-prompt-input");
    const q = overrideQ || (ta && ta.value ? ta.value : "").trim();
    if (!q) return;

    var __rp = reportPeriodFromText(q);
    if (__rp) { startReport(__rp, q); return; }

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
    setBubbleHtml(aiBubble, `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;min-width:0;box-sizing:border-box;"><img src="/icons/load/ms_load_icon.gif" alt="Analyse en cours" style="height:140px;width:auto;" /><div class="ie-load-msg" style="font-size:13px;color:#6b7280;">Analyse en cours…</div></div>`);

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

      // A correction may have been captured from this turn (Phase 2.3) — reflect it in the panel.
      refreshMemoryPanel();

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
      // Provenance register (Phase 0): show the answer's source on EVERY path — previously grounded_day /
      // family_* / v3_fallback fell through to no pill at all. Prefer the server-authoritative
      // meta.register; derive from producer as a fallback while the server rolls out.
      const _regFromProducer = (p) =>
        p === 'web_search' ? 'web'
        : p === 'llm_only' ? 'model'
        : (!p || p === 'no_data' || p === 'deterministic_missing_dates_v1') ? null
        : 'vetted';
      const _reg = (out && out.meta && (out.meta.register === 'vetted' || out.meta.register === 'web' || out.meta.register === 'model'))
        ? out.meta.register
        : _regFromProducer(out && out.meta ? out.meta.producer : null);
      const sourcePillHtml = (() => {
        if (!_reg) return '';
        let label, bg, color;
        if (_reg === 'vetted') {
          label = 'Vérifié'; bg = 'var(--color-pill-safe-bg)'; color = 'var(--color-pill-safe-text)';
        } else if (_reg === 'web') {
          label = 'Web — non vérifié'; bg = 'var(--color-pill-source-low-bg)'; color = 'var(--color-pill-source-low-text)';
        } else {
          label = 'Non vérifié'; bg = 'var(--color-pill-source-mid-bg)'; color = 'var(--color-pill-source-mid-text)';
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

      // Read ISO for the API: flatpickr keeps Y-m-d in .value; the CDN-fallback keeps it in
      // data-iso (while .value shows JJ/MM/AAAA). Prefer an ISO-shaped .value, else data-iso.
      const _dsEl = document.getElementById("ie-finder-date-start");
      const _deEl = document.getElementById("ie-finder-date-end");
      const start = _dsEl ? (/^\d{4}-\d{2}-\d{2}$/.test(_dsEl.value) ? _dsEl.value : (_dsEl.dataset.iso || _dsEl.value)) : "";
      const end = _deEl ? (/^\d{4}-\d{2}-\d{2}$/.test(_deEl.value) ? _deEl.value : (_deEl.dataset.iso || _deEl.value)) : "";
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
    // French display (JJ/MM/AAAA) with ISO kept in data-iso for the API. This is the fallback
    // when the flatpickr CDN fails to load (VPN/CSP) — when flatpickr IS active it owns .value
    // (Y-m-d) and these branches skip because .value is already set.
    if (dsEl && !dsEl.value) { dsEl.value = todayStr.split('-').reverse().join('/'); dsEl.dataset.iso = todayStr; }
    if (deEl && !deEl.value) { deEl.value = in30Str.split('-').reverse().join('/'); deEl.dataset.iso = in30Str; }

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

    // ---- Import ventes (CSV / Excel) via dépôt de fichier ----
    (function setupCsvImport() {
      var fileInput = document.getElementById("ie-import-file-input");
      var attachBtn = document.getElementById("ie-import-attach");
      var wrap = document.getElementById("ie-prompt-input-wrap");
      var bar = document.getElementById("ie-prompt-input-bar");
      var ta = document.getElementById("ie-prompt-input");
      if (!fileInput) return;

      var SOURCES = [
        { id: "isavigne", label: "ISAVIGNE" },
        { id: "tpvin", label: "TP'vin" },
        { id: "sumup", label: "SumUp" },
        { id: "generic", label: "Autre" }
      ];
      var attachedFile = null; // staged, waiting for send
      var chipEl = null;
      var pending = null; // flow in progress after send

      function fileSvg() {
        return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:18px;height:18px;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:-3px;flex-shrink:0;"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>';
      }

      function showChip(file) {
        if (!chipEl) {
          chipEl = document.createElement("div");
          chipEl.id = "ie-import-chip";
          chipEl.style.cssText = "margin:0 0 8px 4px;";
          if (wrap && bar) wrap.insertBefore(chipEl, bar);
          else if (wrap) wrap.appendChild(chipEl);
        }
        chipEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:8px;max-width:100%;background:#eef1f6;border-radius:10px;padding:7px 12px;font-size:13px;color:#111827;">'
          + '<span style="color:#1D3BB3;display:inline-flex;">' + fileSvg() + '</span>'
          + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(file.name || "fichier") + '</span>'
          + '<button type="button" id="ie-import-chip-x" aria-label="Retirer le fichier" style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;">&times;</button></span>';
        chipEl.style.display = "block";
        var x = document.getElementById("ie-import-chip-x");
        if (x) x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); removeAttachment(); });
      }
      function removeAttachment() {
        attachedFile = null;
        if (chipEl) { chipEl.innerHTML = ""; chipEl.style.display = "none"; }
      }
      function showChipError(msg) {
        if (!chipEl) {
          chipEl = document.createElement("div");
          chipEl.id = "ie-import-chip";
          chipEl.style.cssText = "margin:0 0 8px 4px;";
          if (wrap && bar) wrap.insertBefore(chipEl, bar);
          else if (wrap) wrap.appendChild(chipEl);
        }
        chipEl.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;background:#fef2f2;color:#b91c1c;border-radius:10px;padding:7px 12px;font-size:13px;">' + escapeHtml(msg) + '</span>';
        chipEl.style.display = "block";
      }
      function attachFile(file) {
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { showChipError("Fichier trop volumineux (max 4 Mo)."); attachedFile = null; return; }
        attachedFile = file;
        showChip(file);
        if (ta) ta.focus();
      }

      function revealThread() {
        qs("ie-prompt-empty")?.setAttribute("hidden", "true");
        qs("ie-thread")?.removeAttribute("hidden");
      }
      function aiBlock(html) {
        var b = appendMsg("ai", "");
        if (b) setBubbleHtml(b, html);
        return b;
      }
      function radioRows(kind, items) {
        var rows = "";
        for (var i = 0; i < items.length; i++) {
          rows += '<label class="ie-import-opt" data-kind="' + kind + '" data-id="' + escapeHtml(items[i].id) + '" style="display:flex;align-items:center;gap:10px;padding:7px 0;cursor:pointer;">'
            + '<span class="ie-import-radio" style="width:16px;height:16px;border-radius:50%;border:1.5px solid #9ca3af;flex-shrink:0;box-sizing:border-box;"></span>'
            + '<span style="font-size:14px;color:#111827;">' + escapeHtml(items[i].label) + '</span></label>';
        }
        return '<div style="display:flex;flex-direction:column;gap:2px;">' + rows + '</div>';
      }
      function confirmBlock(msg, kind, items) {
        return '<div class="ie-confirm-block"><div class="ie-confirm-msg">' + escapeHtml(msg) + '</div>' + radioRows(kind, items) + '</div>';
      }

      function beginImport() {
        if (!attachedFile || pending) return;
        var file = attachedFile;
        var note = (ta && ta.value ? ta.value : "").trim();
        removeAttachment();
        if (ta) {
          ta.value = "";
          if (typeof autoResizeTextarea === "function") autoResizeTextarea(ta);
          if (typeof syncInputWrapHeight === "function") syncInputWrapHeight();
        }
        pending = { file: file, location_id: null, source: null };
        revealThread();
        var ub = appendMsg("user", "");
        if (ub) {
          var html = '<span style="display:inline-flex;align-items:center;gap:8px;">' + fileSvg() + escapeHtml(file.name || "fichier") + '</span>';
          if (note) html += '<div style="margin-top:6px;">' + escapeHtml(note) + '</div>';
          setBubbleHtml(ub, html);
        }
        askLocationOrSource();
      }

      async function askLocationOrSource() {
        var locs = [];
        try {
          var res = await fetch("/api/import/locations");
          var j = await res.json().catch(function () { return null; });
          if (j && j.ok && Array.isArray(j.locations)) locs = j.locations;
        } catch (e) {}
        if (locs.length > 1) {
          aiBlock(confirmBlock("Pour quel établissement ?", "loc", locs.map(function (l) { return { id: l.location_id, label: l.label }; })));
        } else {
          if (locs.length === 1) pending.location_id = locs[0].location_id;
          askSource();
        }
      }
      function askSource() {
        aiBlock(confirmBlock("De quel logiciel provient l'export ?", "src", SOURCES));
      }

      function mapError(code) {
        var m = {
          FILE_TOO_LARGE: "Fichier trop volumineux (max 5 Mo).",
          NO_FILE: "Aucun fichier reçu.",
          EMPTY_FILE: "Le fichier est vide.",
          UNREADABLE_FILE: "Fichier illisible ou corrompu.",
          LOCATION_FORBIDDEN: "Cet établissement n'est pas rattaché à votre compte.",
          NO_LOCATION: "Aucun établissement rattaché à votre compte.",
          INVALID_FORM: "Fichier illisible.",
          UNAUTHORIZED: "Session expirée. Reconnectez-vous."
        };
        return m[code] || ("Erreur : " + code);
      }
      function summaryHtml(out, locId) {
        if (!out) return '<p style="color:#b91c1c;">Erreur réseau lors de l\'import. Réessayez.</p>';
        var st = out.status;
        var accent = st === "ok" ? "#059669" : st === "partial" ? "#B45309" : "#b91c1c";
        var title = st === "ok" ? "Import réussi" : st === "partial" ? "Import partiel" : "Import impossible";
        var h = '<div style="font-weight:600;color:' + accent + ';margin-bottom:6px;">' + title + '</div>';
        if (typeof out.rows_total === "number") {
          var acc = out.rows_accepted || 0, rej = out.rows_rejected || 0;
          h += '<div style="font-size:15px;line-height:1.6;">' + acc + ' ligne' + (acc > 1 ? 's' : '') + ' importée' + (acc > 1 ? 's' : '') + ' · ' + rej + ' rejetée' + (rej > 1 ? 's' : '') + ' sur ' + (out.rows_total || 0) + '.';
          if (out.date_range && out.date_range[0]) h += '<br>Période : ' + escapeHtml(out.date_range[0]) + ' → ' + escapeHtml(out.date_range[1]) + '.';
          h += '</div>';
        } else if (out.error) {
          h += '<div style="font-size:15px;">' + escapeHtml(mapError(out.error)) + '</div>';
        }
        if (Array.isArray(out.errors) && out.errors.length) {
          var shown = out.errors.slice(0, 10);
          h += '<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#6b7280;line-height:1.6;">';
          for (var i = 0; i < shown.length; i++) h += '<li>Ligne ' + escapeHtml(shown[i].row) + ' — ' + escapeHtml(shown[i].reason) + '</li>';
          h += '</ul>';
          if (out.errors.length > shown.length) h += '<div style="font-size:13px;color:#9ca3af;margin-top:4px;">… et ' + (out.errors.length - shown.length) + ' autre(s).</div>';
        }
        if (out.refresh_requested) h += '<div style="font-size:12px;color:#6b7280;margin-top:8px;">Vos indicateurs et cartes seront actualisés sous peu.</div>';
        if ((st === "ok" || st === "partial") && out.date_range && out.date_range[0]) {
          var url = "/app/insightevent/rapport?start=" + encodeURIComponent(out.date_range[0]) + "&end=" + encodeURIComponent(out.date_range[1]) + (locId ? "&loc=" + encodeURIComponent(locId) : "");
          h += '<a href="' + url + '" style="display:inline-block;margin-top:14px;background:#1D3BB3;color:#fff;text-decoration:none;border-radius:6px;padding:9px 16px;font-size:14px;font-weight:600;">Générer le rapport pour cette période →</a>';
        }
        return h;
      }

      async function doImport() {
        var loading = aiBlock('<div style="font-size:13px;color:#6b7280;">Import en cours…</div>');
        var fd = new FormData();
        fd.append("file", pending.file);
        fd.append("source", pending.source || "generic");
        if (pending.location_id) fd.append("location_id", pending.location_id);
        var out = null;
        try {
          var res = await fetch("/api/import/sales-csv", { method: "POST", body: fd });
          out = await res.json().catch(function () { return null; });
        } catch (e) {}
        if (loading && loading.parentElement) loading.parentElement.remove();
        aiBlock(summaryHtml(out, pending && pending.location_id));
        pending = null;
      }

      document.addEventListener("click", function (e) {
        var opt = e.target.closest(".ie-import-opt");
        if (!opt || !pending) return;
        var block = opt.closest(".ie-confirm-block");
        if (!block || block.getAttribute("data-done") === "1") return;
        block.setAttribute("data-done", "1");
        block.style.pointerEvents = "none";
        var radios = block.querySelectorAll(".ie-import-radio");
        for (var i = 0; i < radios.length; i++) radios[i].style.border = "1.5px solid #9ca3af";
        var r = opt.querySelector(".ie-import-radio");
        if (r) r.style.border = "5px solid #1D3BB3";
        var kind = opt.getAttribute("data-kind");
        if (kind === "loc") { pending.location_id = opt.getAttribute("data-id"); askSource(); }
        else if (kind === "src") { pending.source = opt.getAttribute("data-id"); doImport(); }
      });

      // Attach only — drop / paperclip stage the file; the flow starts on send.
      function handleFiles(files) { if (files && files[0]) attachFile(files[0]); }
      if (attachBtn) attachBtn.addEventListener("click", function (e) { e.preventDefault(); fileInput.click(); });
      fileInput.addEventListener("change", function () { handleFiles(fileInput.files); fileInput.value = ""; });

      var dropZone = document.getElementById("ie-prompt-root") || wrap;
      function hasFiles(e) {
        return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1;
      }
      if (dropZone) {
        ["dragenter", "dragover"].forEach(function (ev) {
          dropZone.addEventListener(ev, function (e) { if (hasFiles(e)) { e.preventDefault(); if (wrap) { wrap.style.outline = "2px dashed #1D3BB3"; wrap.style.outlineOffset = "4px"; } } });
        });
        ["dragleave", "drop"].forEach(function (ev) {
          dropZone.addEventListener(ev, function (e) { e.preventDefault(); if (wrap) wrap.style.outline = ""; });
        });
        dropZone.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
      }

      // Send with a staged file → start the import instead of the AI prompt.
      // Capture phase + stopImmediatePropagation pre-empts the existing submit handlers.
      var sendBtn = document.getElementById("ie-prompt-submit-btn");
      if (sendBtn) sendBtn.addEventListener("click", function (e) {
        if (attachedFile) { e.preventDefault(); e.stopImmediatePropagation(); beginImport(); }
      }, true);
      if (ta) ta.addEventListener("keydown", function (e) {
        if (attachedFile && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); beginImport(); }
      }, true);
    })();

  // ----------------------------
  // PERSISTENT MEMORY PANEL (Phase 2.3) — "what I retain about you".
  // Lists the venue's ACTIVE identity corrections and lets the owner forget one (appends a `clear`
  // event server-side; never a delete). Non-critical: any failure leaves the panel hidden silently.
  // ----------------------------
  const MEMORY_LABELS = {
    activity: "Activité",
    zone: "Zone",
    nouveau_meaning: "« Nouveau » signifie",
    other: "Précision",
  };

  async function refreshMemoryPanel() {
    const panel = document.getElementById("ie-memory");
    const items = document.getElementById("ie-memory-items");
    if (!panel || !items || !LOCATION_ID) return;
    try {
      const res = await fetch("/api/insight/corrections?location_id=" + encodeURIComponent(LOCATION_ID));
      const j = await res.json();
      const list = (j && j.ok && Array.isArray(j.corrections)) ? j.corrections : [];
      if (!list.length) { panel.hidden = true; items.innerHTML = ""; return; }
      items.innerHTML = list.map(function (c) {
        const label = MEMORY_LABELS[c.correction_type] || MEMORY_LABELS.other;
        return '<div class="ie-memory-item">'
          + '<span>' + escapeHtml(label) + ' : ' + escapeHtml(c.correction_text) + '</span>'
          + '<button type="button" class="ie-memory-clear" data-mem-clear="' + escapeHtml(c.correction_type) + '">Oublier</button>'
          + '</div>';
      }).join("");
      panel.hidden = false;
    } catch (e) { /* memory panel is never critical */ }
  }

  document.addEventListener("click", async function (e) {
    const btn = (e.target && e.target.closest) ? e.target.closest("[data-mem-clear]") : null;
    if (!btn) return;
    e.preventDefault();
    btn.disabled = true;
    try {
      await fetch("/api/insight/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location_id: LOCATION_ID, correction_type: btn.getAttribute("data-mem-clear") }),
      });
    } catch (e2) { /* fall through to refresh */ }
    await refreshMemoryPanel();
  });

  refreshMemoryPanel();
  }
