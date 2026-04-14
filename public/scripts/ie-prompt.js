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

  const SUGGESTION_CHIPS = [
    "Quels sont les 3 jours les plus favorables pour organiser un événement en juin ?",
    "Quels week-ends de mars présentent les conditions les plus favorables pour un événement en extérieur ?",
    "Quelle est la probabilité d'une forte affluence pour une inauguration ce vendredi ?"
  ];

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
      ${answer ? `<div class="ie-ai-p">${escapeHtml(answer).replace(/\n/g, "<br/>")}</div>` : ""}
      ${keyFacts.length ? `<ul class="ie-ai-list">${keyFacts.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}
      ${caveats.length ? `<div class="ie-ai-caveats">${caveats.map(c => `<div class="ie-ai-cv">${escapeHtml(c)}</div>`).join("")}</div>` : ""}
      ${cta}
    `;
  }

  async function submitQuestion(overrideQ, confirmedParams) {
    const ta = qs("ie-prompt-input");
    const q = overrideQ || (ta && ta.value ? ta.value : "").trim();
    if (!q) return;

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
  }
