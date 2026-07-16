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
      // Phase 2 #1 — the conversation frame's family key (set when a provider led the answer). Routing
      // metadata only; the server inherits it on a follow-up ("et le dimanche ?") to keep the dimension.
      family: typeof meta?.resolved_family === "string" ? meta.resolved_family : null,
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

  // ----------------------------
  // "SUIVRE" on a discovered competitor.
  // The discovery answer names real competitors (out.follow_candidates); each gets a one-click follow so
  // the operator puts it under surveillance without retyping it. Same endpoint + body + visual states as
  // the existing web-results follow (ieWebFollow in prompt.astro): #1D3BB3 text button → "Suivi" #0F6E56.
  // Not reusing that function directly — it is bound to prompt.astro's ie-web-card DOM.
  // ----------------------------
  // French thousands ("1 487 avis"). Defined LOCALLY on purpose: card-kit.js exposes an frInt, but
  // ie-prompt.js must not depend on that script being loaded to render an answer.
  function frInt(n) {
    try { return Number(n).toLocaleString("fr-FR"); } catch (e) { return String(n); }
  }

  // Distance in the operator's terms: "à 450 m" / "à 1,2 km" (French decimal, never a raw toString).
  function followDist(m) {
    if (typeof m !== "number" || !isFinite(m)) return "";
    return m < 1000 ? ("à " + Math.round(m) + " m") : ("à " + String(Math.round(m / 100) / 10).replace(".", ",") + " km");
  }
  // GBP signal: a rating means little without the count behind it, so they always travel together.
  function followRating(c) {
    if (typeof c.rating !== "number" || !isFinite(c.rating)) return "";
    const stars = String(Math.round(c.rating * 10) / 10).replace(".", ",");
    const n = (typeof c.rating_count === "number" && isFinite(c.rating_count)) ? c.rating_count : null;
    return "★ " + stars + (n !== null ? " (" + frInt(n) + " avis)" : "");
  }

  function followRowsHtml(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return "";
    const rows = candidates.map(function (c, i) {
      const name = String(c && c.name || "").trim();
      if (!name) return "";
      const city = String(c && c.city || "").trim();
      // Priority signals: real distance (computed from Places coords) + real GBP standing.
      const meta = [followDist(c.distance_m), followRating(c), city].filter(Boolean).join(" · ");
      const overlap = String(c && c.overlap || "").trim();
      const difference = String(c && c.difference || "").trim();
      return '<div class="ie-follow-row" id="ie-follow-row-' + i + '">'
        + '<div class="ie-follow-main">'
        // Literal spaces after each label/name: the visual gaps are CSS (flex gap / margin), which
        // disappear when the answer is copied out — "Manie Caféà 2 km", "Recoupecafé…". Cheap to fix.
        +   '<div class="ie-follow-top">'
        +     '<span class="ie-follow-name">' + escapeHtml(name) + '</span> '
        +     (meta ? '<span class="ie-follow-meta">' + escapeHtml(meta) + '</span>' : "")
        +   '</div>'
        +   (overlap ? '<div class="ie-follow-line"><span class="ie-follow-tag ie-follow-tag-ov">Recoupe</span> ' + mdInlineToSafeHtml(overlap) + '</div>' : "")
        +   (difference ? '<div class="ie-follow-line"><span class="ie-follow-tag ie-follow-tag-df">Diffère</span> ' + mdInlineToSafeHtml(difference) + '</div>' : "")
        + '</div>'
        + '<span class="ie-follow-action" id="ie-follow-action-' + i + '">'
        +   '<button type="button" class="ie-follow-btn" data-follow-idx="' + i + '"'
        +     ' data-follow-name="' + escapeHtml(name) + '" data-follow-city="' + escapeHtml(city) + '">Suivre</button>'
        + '</span>'
        + '</div>';
    }).filter(Boolean).join("");
    if (!rows) return "";
    // Ordered closest-first by the server — say so, so the order reads as a judgement, not a list.
    return '<div class="ie-follow-block">'
      + '<div class="ie-follow-h">Mettre sous surveillance <span class="ie-follow-hint">· le plus proche d\'abord</span></div>'
      + rows + '</div>';
  }

  document.addEventListener("click", async function (e) {
    const btn = (e.target && e.target.closest) ? e.target.closest("[data-follow-idx]") : null;
    if (!btn) return;
    e.preventDefault();
    const idx = btn.getAttribute("data-follow-idx");
    const name = btn.getAttribute("data-follow-name") || "";
    const city = btn.getAttribute("data-follow-city") || "";
    if (!name) return;
    btn.disabled = true;
    btn.textContent = "…";
    try {
      const res = await fetch("/api/competitive/add-competitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competitor_name: name, city: city, source_system: "user_confirmed" }),
      });
      const j = await res.json();
      if (!j || j.ok !== true) throw new Error(j && j.error || "follow failed");
      const area = document.getElementById("ie-follow-action-" + idx);
      if (area) area.innerHTML = '<span class="ie-follow-done">Suivi</span>';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Suivre";
    }
  });

  // ----------------------------
  // SSE READER (Phase 5 increment ①). POST + SSE means no EventSource (it can't POST): fetch →
  // res.body.getReader() → TextDecoder → frame parser (split on \n\n, `event:`/`data:` lines, keep-alive
  // comments tolerated) → `stage` events drive the loader rows → ONE `result` event carries
  // {status, body}: the ERROR CONTRACT. Once the stream opens HTTP is 200 forever, so the caller
  // reconstructs resLike = {ok: status in 2xx, status} from `result` and runs the VERBATIM existing
  // branching. A stream that closes/errors before `result` throws → the existing catch path.
  // ----------------------------
  async function readPromptStream(res, onStage) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let result = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        let ev = "", data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
          // lines starting with ":" are keep-alive comments — ignored
        }
        if (!ev || !data) continue;
        let payload = null;
        try { payload = JSON.parse(data); } catch (e) { continue; }
        if (ev === "stage" && typeof onStage === "function") onStage(payload);
        else if (ev === "result") result = payload;
      }
    }
    if (!result || typeof result.status !== "number") {
      throw new Error("stream ended without result");
    }
    return result; // { status, body }
  }

  // Server-driven stage rows: on the FIRST stage event the loader switches from the timer fallback to
  // event mode — timers cleared, rows rebuilt from events (upsert by stage key, arrival order). Same
  // visuals, same CSS classes; the row list is now the pipeline's truth (and increment ②'s regen row
  // can simply APPEAR). label_fr arrives on `start` from the server's owner-authored STAGE_FR.
  function makeStageEventHandler(aiBubble, clearTimers) {
    let eventMode = false;
    return function onStage(s) {
      if (!s || typeof s.k !== "string") return;
      const box = aiBubble && aiBubble.querySelector(".ie-load-stages");
      if (!box) return; // answer already rendered — late events are harmless
      if (!eventMode) {
        eventMode = true;
        clearTimers();
        box.innerHTML = ""; // rows are server-driven from here on
      }
      let row = box.querySelector('[data-k="' + s.k + '"]');
      if (!row && s.state === "start") {
        // inc ②: the "regen" row (Correction en cours) is the amber one — the validator caught something.
        const dotColor = s.k === "regen" ? "#BA7517" : "var(--color-brand-blue,#0b37e5)";
        box.insertAdjacentHTML("beforeend",
          '<div class="ie-load-stage" data-k="' + escapeHtml(s.k) + '" style="display:flex;align-items:center;gap:9px;opacity:0;transition:opacity .35s;font-size:13.5px;color:#6b7280;">'
          + '<span class="ie-load-dot" style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';flex:none;"></span>'
          + '<span class="ie-load-lbl">' + escapeHtml(typeof s.label_fr === "string" ? s.label_fr : s.k) + '</span></div>');
        row = box.lastElementChild;
      }
      if (!row) return;
      // inc ②: a done event may carry an updated label ("Vérification des faits — validée · 5 faits cités").
      if (typeof s.label_fr === "string" && s.label_fr) {
        const lbl = row.querySelector(".ie-load-lbl");
        if (lbl) lbl.textContent = s.label_fr;
      }
      if (s.state === "start") { row.classList.remove("done"); row.classList.add("on"); }
      else if (s.state === "done") { row.classList.remove("on"); row.classList.add("done"); }
    };
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

  // ----------------------------
  // ANSWER RENDER (Phase 3) — ONE renderer over typed blocks.
  // renderAiOutputHtml is now an ADAPTER: it maps the existing response envelope
  // {meta, ai.output, family_card, clarification, actions, ui_packaging_v3} to an ordered blocks[]
  // and hands them to MSCardKit.renderAnswerBlocks (card-kit.js) — the same kit that draws the family
  // cards, so every answer shares one type scale and the card-harness renders exactly what ships.
  // The server is UNCHANGED (adapter-first per the Phase 3 spec); when the packager emits native
  // blocks later, this adapter retires path by path.
  //
  // The register (provenance) is a BLOCK, not a bolt-on: the kit REQUIRES it — a block set without
  // one renders the least-trusted pill. Derivation kept from Phase 0 (meta.register, producer fallback).
  // ----------------------------
  function _regFromProducer(p) {
    return p === 'web_search' ? 'web'
      : p === 'llm_only' ? 'model'
      : (!p || p === 'no_data' || p === 'deterministic_missing_dates_v1' || p === 'deterministic_offering_elicit_v1' || p === 'deterministic_missing_dimension_elicit_v1' || p === 'deterministic_declared_capture_v1' || p === 'deterministic_declared_margin_v1') ? null
      : 'vetted';
  }
  function resolveRegister(out) {
    const m = out && out.meta ? out.meta : {};
    return (m.register === 'vetted' || m.register === 'web' || m.register === 'model')
      ? m.register
      : _regFromProducer(m.producer);
  }

  function renderAiOutputHtml(out) {
    const kit = window.MSCardKit;
    if (!kit || typeof kit.renderAnswerBlocks !== "function") return "";   // card-kit.js not loaded — nothing renders without it
    const blocks = blocksFromResponse(out);
    if (!blocks.length) return "";
    return kit.renderAnswerBlocks(blocks) + followRowsHtml(out && out.follow_candidates);
  }

  // inc ② + polish (16/07) — staggered block reveal with a HEADLINE TYPE-OUT. The answer is ALREADY
  // fully validated when it renders (the gate ran server-side); everything here only paces its
  // arrival — no unvalidated text is ever shown. The register pill lands instantly, the verdict
  // headline TYPES OUT word-by-word (~26 ms/word — the honest cousin of token streaming: real
  // streaming would show text the validator hasn't passed), and the remaining blocks fade in
  // ~120 ms apart. No-op under prefers-reduced-motion; the DOM content is complete either way.
  const TYPE_OUT_MS_PER_WORD = 26;
  function typeOutHeadline(el) {
    // Plain-text elements only: a headline with inline markup (children) keeps the instant reveal —
    // re-typing HTML risks broken tags, and the safe renderer's output is not ours to re-split.
    if (!el || el.children.length > 0) return false;
    const full = el.textContent || "";
    const words = full.split(/(\s+)/);
    if (full.length < 20 || full.length > 240 || words.length < 6) return false;
    el.style.minHeight = el.offsetHeight + "px";   // reserve the height — no layout jump while typing
    el.textContent = "";
    let i = 0;
    (function step() {
      if (i >= words.length) { el.style.minHeight = ""; return; }
      el.textContent += words[i++];
      setTimeout(step, TYPE_OUT_MS_PER_WORD);
    })();
    return true;
  }
  function revealAnswerBlocks(bubble) {
    if (!bubble || !bubble.children || bubble.children.length < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const kids = Array.prototype.slice.call(bubble.children);
    typeOutHeadline(kids[1]);   // pill is kids[0]; the verdict headline types out when plain text
    kids.forEach(function (el, i) {
      if (i < 2) return; // pill + headline: immediate slot (headline animates via type-out above)
      el.style.opacity = "0";
      el.style.transform = "translateY(3px)";
      el.style.transition = "opacity .28s ease, transform .28s ease";
      setTimeout(function () { el.style.opacity = "1"; el.style.transform = "none"; }, 120 * (i - 1));
    });
  }
  // ── Day 2 (16/07) — clickable décisions → commitment cards ──────────────────
  // A « Prochaines étapes » line inside an inline FAMILY CARD answer gets an « M'engager » button;
  // click opens the SHARED MSCommitForm (same form, same POST as pulse/évolution — one commit flow)
  // prefilled with the décision text. Origin = chat_decision_<family> (own origin types — never a
  // real card's action_type), affected date = the card's day. No-ops when commit-form.js is absent.
  const CHAT_COMMIT_FAMILIES = {
    footfall: 1, offering: 1, events: 1, competitor: 1, tourism: 1,
    weather: 1, audience: 1, salesdiscount: 1, salesdecomp: 1, calendar: 1,
  };
  function decorateCommitableDecisions(bubble, out) {
    try {
      if (!window.MSCommitForm || !bubble) return;
      const fam = out && out.meta && out.meta.resolved_family;
      if (!fam || !CHAT_COMMIT_FAMILIES[fam] || !out.family_card) return;
      const lines = bubble.querySelectorAll(".ie-family-card .ms-decision-line");
      if (!lines.length) return;
      const date = (out.family_card.data && out.family_card.data.date) || null;
      lines.forEach(function (line) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ie-dl-commit";
        btn.textContent = "M'engager";
        btn.setAttribute("style", "margin-left:8px;font-size:11px;font-weight:600;color:#1D3BB3;background:#fff;border:1px solid #DBEAFE;border-radius:999px;padding:2px 10px;cursor:pointer;font-family:inherit;");
        btn.addEventListener("click", function () { openInlineCommitForm(line, fam, date); });
        line.appendChild(btn);
      });
    } catch (e) { console.warn("[chat-commit] decorate failed:", e); }
  }
  function openInlineCommitForm(line, fam, date) {
    const card = line.closest(".ie-family-card") || line.parentElement;
    const existing = card ? card.querySelector(".ie-dl-commit-form") : null;
    if (existing) existing.remove();
    const head = line.getAttribute("data-dl-head") || "";
    const body = line.getAttribute("data-dl-body") || "";
    const wrap = document.createElement("div");
    wrap.className = "ie-dl-commit-form";
    wrap.setAttribute("style", "margin-top:8px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;");
    wrap.innerHTML = window.MSCommitForm.buildHtml({ prefill: { committed_action_text: (head ? head + " — " : "") + body } });
    line.insertAdjacentElement("afterend", wrap);
    window.MSCommitForm.wire(wrap, {
      location_id: LOCATION_ID,
      prefill: {},
      origin: { origin_action_type: "chat_decision_" + fam, origin_affected_date: date },
      onDone: function (j) {
        wrap.innerHTML = j && j.ok
          ? '<div style="padding:10px 14px;font-size:12.5px;color:#0F6E56;font-weight:600;">Engagement enregistré — suivi dans votre page Engagement.</div>'
          : '<div style="padding:10px 14px;font-size:12.5px;color:#B91C1C;">' + window.MSCommitForm.escapeHtml((j && j.error) || "Erreur — réessayez.") + '</div>';
      },
      onCancel: function () { wrap.remove(); },
    });
  }

  // Instrumentation hooks — let card-harness.html drive the REAL adapter / stage handler with captured
  // payloads and synthetic stage events (verify-by-behavior). Not a public API.
  window.__ieBlocksFromResponse = (out) => blocksFromResponse(out);
  window.__ieStageHandler = makeStageEventHandler;
  window.__ieReveal = revealAnswerBlocks;
  window.__ieDecorateCommits = decorateCommitableDecisions;

  function blocksFromResponse(out) {
    const n =
      (out?.ai && typeof out.ai === "object")
        ? (out.ai.output && typeof out.ai.output === "object" ? out.ai.output : out.ai)
        : null;
    if (!n || typeof n !== "object") return [];

    const blocks = [];
    const register = resolveRegister(out);
    // inc ② (C1, owner-approved): the vetted pill extends with the cited-fact count when the grounded
    // answer carries one — « Vérifié · 5 faits cités ». No new wire data: cited_fact_ids is already in
    // the envelope; absent (non-grounded paths) → the plain pill, never a padded count.
    const _factsCited = Array.isArray(n?.cited_fact_ids) ? n.cited_fact_ids.length : null;
    if (register) blocks.push({ type: "register", register, ...(typeof _factsCited === "number" && _factsCited > 0 ? { facts_cited: _factsCited } : {}) });

    const clarChips = out?.clarification && Array.isArray(out.clarification.chips) ? out.clarification.chips : null;

    // NATIVE BLOCKS (16/07) — when the server authored typed blocks (lookup path first), render them
    // verbatim: no string re-parsing, the Phase 3 adapter retires path by path. The register pill
    // stays client-derived (one derivation), and any server-sent register block is dropped to avoid
    // a double pill. Unknown block types are skipped by the kit (console.warn), never fatal.
    const nativeBlocks = Array.isArray(n.blocks) && n.blocks.length ? n.blocks : null;
    if (nativeBlocks) {
      return [...blocks, ...nativeBlocks.filter(function (b) { return b && b.type !== "register"; })];
    }

    // Family-led answer → the FULL family card inline (the detailed answer IS the card, no click-through).
    if (out && out.family_card && window.MSCardKit && typeof window.MSCardKit[out.family_card.render] === "function") {
      const lead = (typeof n.headline === "string" && n.headline.trim() && n.headline.trim() !== "Résumé") ? n.headline.trim() : "";
      // Dedupe: the card renders its own `lead` line — when the packager headline IS that line,
      // showing both prints it twice (owner bug report 16/07, footfall « pic à 10h » doubled).
      const cardLead = (out.family_card.data && typeof out.family_card.data.lead === "string") ? out.family_card.data.lead.trim() : "";
      if (lead && lead !== cardLead) blocks.push({ type: "headline", text: lead });
      blocks.push({ type: "card", render: out.family_card.render, data: out.family_card.data });
      return blocks;
    }

    const intent = typeof out?.meta?.resolved_intent === "string" ? out.meta.resolved_intent : "";
    const horizon = typeof out?.meta?.resolved_horizon === "string" ? out.meta.resolved_horizon : "";
    const producer = typeof out?.meta?.producer === "string" ? out.meta.producer : "";
    // ── ELICIT (the system asks the user for missing data) ── same class as clarifications: it
    // asserts nothing about the world, so no trust pill (asserts_nothing exempts the kit's forced
    // register). Handled BEFORE the intent branches — the DAY_DIMENSION_DETAIL branch parses the
    // competitor-lines format and silently DROPS single-paragraph prose, which lost the elicit
    // instruction entirely (found while verifying batch 2; also fixes the offering elicit).
    const isElicit = producer === "deterministic_offering_elicit_v1" || producer === "deterministic_missing_dimension_elicit_v1"
      // Item 4 — same system-dialogue class: the capture confirmation asserts nothing (it echoes the
      // user's own declaration back); the declared estimate is attributed in-copy (« déclarée par
      // vous », « estimation ») rather than wearing a trust pill it hasn't earned.
      || producer === "deterministic_declared_capture_v1" || producer === "deterministic_declared_margin_v1";
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
    // An honest-absence answer must not end on « Ouvrir le mois » — a CTA under "I can't answer that"
    // reads as a shrug with a door slam (owner bug report 16/07). Suppress it on the absence floor.
    const _isAbsence = out?.ai?.mode === "deterministic_honest_absence_v1";
    const ctaBlock =
      !_isAbsence &&
      primary && typeof primary === "object" &&
      primary.type === "redirect" &&
      typeof primary.url === "string" && primary.url.startsWith("/") &&
      typeof primary.label === "string" && primary.label.trim()
        ? { type: "cta", url: primary.url, label: primary.label.trim() } : null;

    // ── LOOKUP ──────────────────────────────────────────────────
    // "date: nom || desc" is a SERVER line format the adapter still parses (content parity; this
    // client parse retires when the packager emits native blocks).
    if (isElicit) {
      if (headline) blocks.push({ type: "headline", text: headline, variant: "lead" });
      if (answer) blocks.push({ type: "prose", md: answer, asserts_nothing: true });
      // The ask carries its ACTION when the server attached one (type "upload_csv" → the chat's own
      // file picker via data-ab-cta-action; a CTA only ships where a real surface exists).
      if (primary && typeof primary === "object" && primary.type === "upload_csv" && typeof primary.label === "string" && primary.label.trim()) {
        blocks.push({ type: "cta", action: "upload", label: primary.label.trim() });
      }
      return blocks;
    }

    if (isLookup) {
      if (!answer && !keyFacts.length) {
        blocks.push({ type: "lookup", empty: "Cet événement n'est pas référencé dans notre base de données. Essayez avec le nom exact de l'événement ou une autre formulation." });
        return blocks;
      }
      const lookupItems = answer.split("\n").filter(Boolean);
      // Dedupe: when the headline IS the single found event's name, showing both prints the title twice
      // (owner bug report 16/07 — « Festival "La Route des Imaginaires" » duplicated).
      const firstName = (() => {
        const raw = lookupItems[0] ? (lookupItems[0].split("||")[0] || "") : "";
        const ci = raw.indexOf(": ");
        return (ci > -1 ? raw.slice(ci + 2) : raw).trim();
      })();
      if (headline && headline !== "Résumé" && headline.trim() !== firstName) blocks.push({ type: "headline", text: headline });
      blocks.push({
        type: "lookup",
        items: lookupItems.map(line => {
          const sepIdx = line.indexOf("||");
          const raw = sepIdx > -1 ? line.slice(0, sepIdx) : line;
          const desc = sepIdx > -1 ? line.slice(sepIdx + 2) : "";
          const colonIdx = raw.indexOf(": ");
          return {
            name: colonIdx > -1 ? raw.slice(colonIdx + 2) : raw,
            date: colonIdx > -1 ? raw.slice(0, colonIdx) : "",
            desc,
          };
        }),
      });
      return blocks;
    }

    // ── DAY_DIMENSION_DETAIL ─────────────────────────────────────
    if (isDayDimension) {
      const parts = (typeof answer === "string" ? answer : "").split("\n\n").filter(Boolean);
      const listLines = (parts[0] ?? "").split("\n").filter(Boolean);
      let competitorLines = listLines.slice(1);
      if (competitorLines.length === 0 && listLines.length === 1) {
        // Claude didn't use \n — split on pattern "[Name] — [distance] m"
        competitorLines = (parts[0] ?? "")
          .split(/(?=\S[^—]+—\s*\d+\s*m)/)
          .map(s => s.trim())
          .filter(s => s.includes(" — ") && s.match(/\d+\s*m/))
          .filter(Boolean);
      }
      if (headline) blocks.push({ type: "headline", text: headline });
      if (competitorLines.length) blocks.push({ type: "rows", items: competitorLines.map(s => s.trim()) });
      if (parts[1]) blocks.push({ type: "prose", md: parts[1] });
      if (parts[2]) blocks.push({ type: "prose", md: parts[2] });
      if (ctaBlock) blocks.push(ctaBlock);
      return blocks;
    }

    if (isDayWhy) {
      const prose = answer.split("\n\n").filter(Boolean);
      // The four canonical dimension labels stay bold — previously hardcoded <strong> regexes at this
      // seam; now expressed as markdown the prose primitive renders. Same visible result.
      const boldLabels = (r) => r
        .replace(/^(Disponibilité (de votre )?audience\s*:)/, "**$1**")
        .replace(/^(Pression concurrentielle\s*:)/, "**$1**")
        .replace(/^(Accessibilité du site\s*:)/, "**$1**")
        .replace(/^(Conditions d'exploitation\s*:)/, "**$1**");
      if (headline) blocks.push({ type: "headline", text: headline });
      if (prose[0]) blocks.push({ type: "prose", md: prose[0] });
      const rows = prose.slice(1).map(boldLabels);
      if (rows.length) blocks.push({ type: "prose", md: rows.join("\n") });
      if (ctaBlock) blocks.push(ctaBlock);
      if (clarChips) blocks.push({ type: "clarification", chips: clarChips });
      return blocks;
    }

    // ── WINDOW_TOP_DAYS / WINDOW_WORST_DAYS / COMPARE_DATES ─────
    if (isTopDays || isWorstDays || isCompare) {
      const isV3 =
        out?.ui_packaging_v3?.v === 3 &&
        Array.isArray(out.ui_packaging_v3.dates);
      const baseTone = isWorstDays ? "amber" : "blue";

      if (verdict) blocks.push({ type: "verdict", text: verdict });
      if (headline) blocks.push({ type: "headline", text: headline });

      let items = [];
      if (answerDates.length) {
        items = answerDates.map((d, idx) => {
          const tone = isCompare ? ((d.label && d.label.includes("recommandé")) ? "blue" : "amber") : baseTone;
          const rankPrefix = (isTopDays || isWorstDays) ? `#${idx + 1} — ` : "";
          const rows = [];
          if (d.c1) rows.push({ k: "Disponibilité audience :", v: d.c1.replace(/^Disponibilité audience\s*:\s*/, "") });
          if (d.c3) rows.push({ k: "Accessibilité :", v: d.c3.replace(/^Accessibilité du site\s*:\s*/, "") });
          if (d.c4) rows.push({ k: "Conditions :", v: d.c4.replace(/^Conditions d'exploitation\s*:\s*/, "") });
          return {
            label: rankPrefix + (d.label ?? d.date ?? ""),
            pill: d.c2 ? d.c2.replace(/^Pression concurrentielle\s*:\s*/, "") : "",
            rows, tone,
          };
        });
      } else if (isV3) {
        items = out.ui_packaging_v3.dates.map((d, idx) => {
          const label = typeof d?.date_label === "string" ? d.date_label : d?.date ?? "";
          const regime = d?.score?.regime ?? d?.regime ?? "";
          const score = d?.score?.score ?? d?.score ?? null;
          const sub = [regime ? `classé ${regime}` : "", score !== null ? `soit ${Number(score).toFixed(1)}/10` : ""].filter(Boolean).join(", ");
          return { label: `#${idx + 1} — ${label}${sub ? `, ${sub}` : ""}`, rows: [], tone: baseTone };
        });
      }
      if (items.length) blocks.push({ type: "datecards", items });

      const v3Primary = out?.ui_packaging_v3 ? (out?.actions?.primary ?? null) : null;
      if (v3Primary && typeof v3Primary.url === "string" && v3Primary.url.startsWith("/")) {
        blocks.push({ type: "cta", url: v3Primary.url, label: "Consulter" });
      } else if (ctaBlock) blocks.push(ctaBlock);
      if (clarChips) blocks.push({ type: "clarification", chips: clarChips });
      return blocks;
    }

    // ── FALLBACK (generic prose: discovery / entity / web / clarifications) ──
    if (headline) blocks.push({ type: "headline", text: headline, variant: "lead" });
    if (answer) blocks.push({ type: "prose", md: answer });
    if (keyFacts.length) blocks.push({ type: "facts", items: keyFacts });
    if (caveats.length) blocks.push({ type: "caveats", items: caveats });
    if (ctaBlock) blocks.push(ctaBlock);
    if (clarChips) blocks.push({ type: "clarification", chips: clarChips });
    return blocks;
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

    // ── Staged inline loader (owner-approved prototype 2026-07-15) ─────────────────────────────
    // Replaces the 140px centered GIF: a text-height indicator at the exact spot the first answer
    // line will appear, stepping through the pipeline's REAL phases. HONESTY RULES: the stage lines
    // describe what the server genuinely does (route → BQ reads → generation → validator); the
    // intermediate steps advance on timers calibrated to the measured profile (interim — Phase 5
    // increment 0 swaps the timers for real SSE stage events with no visual change), and the FINAL
    // stage ("Vérification des faits") is only ever completed by the actual arrival of the response —
    // nothing is claimed done before it is.
    const LOAD_STAGES = [
      { t: 0,    label: "Routage de votre question" },
      { t: 700,  label: "Lecture de vos ventes" },
      { t: 2100, label: "Contexte du jour — météo, événements, concurrence" },
      { t: 3600, label: "Rédaction de la réponse" },          // the long phase — holds until arrival
      { t: -1,   label: "Vérification des faits" },                // -1 = completed only by the real response
    ];
    const aiBubble = appendMsg("ai", "", "is-loading");
    const _stageRow = (s, i) =>
      `<div class="ie-load-stage" data-stage="${i}" style="display:flex;align-items:center;gap:9px;opacity:0;transition:opacity .35s;font-size:13.5px;color:#6b7280;">`
      + `<span class="ie-load-dot" style="width:8px;height:8px;border-radius:50%;background:var(--color-brand-blue,#0b37e5);flex:none;"></span>`
      + `<span>${escapeHtml(s.label)}</span></div>`;
    setBubbleHtml(aiBubble,
      `<style>@keyframes iePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.45}}`
      + `.ie-load-stage.on{opacity:1 !important;color:var(--color-text-primary,#111827);}`
      + `.ie-load-stage.on .ie-load-dot{animation:iePulse 1.1s ease-in-out infinite;}`
      + `.ie-load-stage.done{opacity:.55 !important;}`
      + `.ie-load-stage.done .ie-load-dot{animation:none;background:transparent;position:relative;}`
      + `.ie-load-stage.done .ie-load-dot::after{content:"✓";position:absolute;top:-6px;left:-1px;font-size:11px;color:#0F6E56;}`
      + `@media (prefers-reduced-motion:reduce){.ie-load-stage.on .ie-load-dot{animation:none;}}</style>`
      + `<div class="ie-load-stages" style="display:flex;flex-direction:column;gap:7px;" role="status" aria-label="Analyse en cours">`
      + LOAD_STAGES.map(_stageRow).join("") + `</div>`);
    const _stageTimers = [];
    LOAD_STAGES.forEach((s, i) => {
      if (s.t < 0) return; // arrival-gated stage — never timer-advanced
      _stageTimers.push(setTimeout(() => {
        const rows = aiBubble.querySelectorAll(".ie-load-stage");
        if (!rows.length) return; // bubble already replaced by the answer
        if (i > 0 && rows[i - 1]) { rows[i - 1].classList.remove("on"); rows[i - 1].classList.add("done"); }
        rows[i].classList.add("on");
      }, s.t));
    });
    const clearLoadStages = () => { _stageTimers.forEach(clearTimeout); };

    try {
      const currentMode = typeof window.__ieSetMode === 'function'
        ? (document.querySelector('.ie-mode-btn.active')?.dataset?.mode ?? 'planning')
        : 'planning';

      // Phase 5 increment ① — streaming opt-in. A new submit aborts the in-flight one; 90 s hard timeout.
      if (window.__iePromptCtrl) { try { window.__iePromptCtrl.abort(); } catch (e) {} }
      const ctrl = new AbortController();
      window.__iePromptCtrl = ctrl;
      const killTimer = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 90000);

      const res = await fetch("/api/insight/prompt", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream, application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          q,
          mode: currentMode,
          stream: true,
          thread_context: THREAD_CONTEXT,
          conversation_history: CONVERSATION_HISTORY.slice(-12),
          confirmed_params: confirmedParams || null,
          // WHO is speaking, from the Destinataires roster (owner decision 16/07): the last-used
          // responsable per location (commit-form memory). Server uses it ONLY to stamp declarations
          // (declared_by on the corrections log); null when nobody was ever picked.
          declared_by: (function () { try { return localStorage.getItem("ms_last_owner_" + LOCATION_ID) || null; } catch (e) { return null; } })()
        })
      });

      // ERROR CONTRACT: in stream mode the transport is 200 forever — `result` carries {status, body} and
      // resLike reconstructs what the verbatim branching below expects. If anything stripped streaming
      // (middleware/proxy → not event-stream), fall back to parsing the response as today's plain JSON.
      let out, resLike;
      const ctype = res.headers.get("content-type") || "";
      if (res.ok && ctype.indexOf("text/event-stream") !== -1 && res.body) {
        const r = await readPromptStream(res, makeStageEventHandler(aiBubble, clearLoadStages));
        resLike = { ok: r.status >= 200 && r.status < 300, status: r.status };
        out = r.body;
      } else {
        resLike = res;
        out = await res.json().catch(() => null);
      }
      clearTimeout(killTimer);

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

      if (!resLike.ok || !out) {
        if (aiBubble) {
          aiBubble.className = "ie-bubble is-error";
          aiBubble.textContent = `Erreur lors de l’analyse (HTTP ${resLike.status}).`;
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

      // Phase 3: the register pill and the clarification chips are BLOCKS inside the one renderer now
      // (the kit enforces the register; the adapter folds clarification chips in) — no bubble bolt-ons.
      const html = renderAiOutputHtml(out);

      if (aiBubble) {
        aiBubble.className = "ie-bubble-none";
        if (html) {
          setBubbleHtml(aiBubble, html);
          revealAnswerBlocks(aiBubble);   // inc ② — staggered arrival of the already-validated blocks
          decorateCommitableDecisions(aiBubble, out);   // Day 2 — décision lines become « M'engager »
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
      clearLoadStages();   // response (or error) arrived — stop the stage timers; content replacement clears the UI
      btn?.removeAttribute("disabled");
    }
  }

  // Phase 2 #4 — delegate clarification-chip clicks: re-submit the chip's text as a user message.
  document.addEventListener("click", (e) => {
    const chip = e.target.closest(".ie-clar-chip");
    if (!chip) return;
    e.preventDefault();
    const send = chip.getAttribute("data-send") || "";
    if (send) submitQuestion(send);
  });

  // Elicit CTA — "upload" opens the chat's OWN file picker (the composer's attach flow, staged chip →
  // send). No navigation, no duplicate import path: one picker, one flow.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-ab-cta-action="upload"]');
    if (!btn) return;
    e.preventDefault();
    const input = document.getElementById("ie-import-file-input");
    if (input) input.click();
  });

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
    declared_margin_pct: "Marge déclarée",
    declared_client_count: "Clientèle déclarée",
  };
  // Declared metrics store bare values — display each with its unit.
  const MEMORY_VALUE_SUFFIX = { declared_margin_pct: " %", declared_client_count: " clients" };

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
        const value = c.correction_text + (MEMORY_VALUE_SUFFIX[c.correction_type] || '');
        // WHO + WHEN, when recorded (declarant from the Destinataires roster; date from the event log).
        const meta = (c.declarant_name ? ' — par ' + c.declarant_name : '')
          + (c.corrected_at ? ' (' + c.corrected_at.slice(8, 10) + '/' + c.corrected_at.slice(5, 7) + ')' : '');
        return '<div class="ie-memory-item">'
          + '<span>' + escapeHtml(label) + ' : ' + escapeHtml(value) + escapeHtml(meta) + '</span>'
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
