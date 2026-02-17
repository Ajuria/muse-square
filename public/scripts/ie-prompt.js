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

  function renderAiOutputHtml(out) {
    // Accept BOTH server shapes:
    // A) out.ai.output (older / nested)
    // B) out.ai        (current / flat)
    const n =
      (out?.ai && typeof out.ai === "object")
        ? (
            (out.ai.output && typeof out.ai.output === "object")
              ? out.ai.output
              : out.ai
          )
        : null;

    if (!n || typeof n !== "object") return "";

    // ----------------------------
    // V3 UI packaging renderer (month shortlist / worstlist)
    // ----------------------------
    const isV3 =
      out?.ui_packaging_v3 &&
      typeof out.ui_packaging_v3 === "object" &&
      out.ui_packaging_v3.v === 3 &&
      out.ui_packaging_v3.header &&
      typeof out.ui_packaging_v3.header === "object" &&
      Array.isArray(out.ui_packaging_v3.dates);

    let v3Block = "";

    if (isV3) {
      const title =
        typeof out.ui_packaging_v3.header.title === "string"
          ? out.ui_packaging_v3.header.title
          : "";

      const timeframe =
        typeof out.ui_packaging_v3.header.timeframe_label === "string"
          ? out.ui_packaging_v3.header.timeframe_label
          : "";

      const bullets = Array.isArray(out.ui_packaging_v3.header.summary_bullets)
        ? out.ui_packaging_v3.header.summary_bullets
        : [];

      const primary = out?.actions?.primary;
      const primaryLink =
        primary &&
        typeof primary === "object" &&
        primary.type === "redirect" &&
        typeof primary.url === "string" &&
        primary.url.startsWith("/") &&
        typeof primary.label === "string" &&
        primary.label.trim()
          ? { url: primary.url, label: primary.label.trim() }
          : null;

      const renderBullets = (items) =>
        items.length
          ? `<ul class="mt-2 space-y-1 text-sm">
              ${items.map((x) => `<li class="list-disc ml-5">${escapeHtml(x)}</li>`).join("")}
            </ul>`
          : "";

      const rowsHtml = out.ui_packaging_v3.dates
        .map((d, idx) => {
          const label =
            typeof d?.date_label === "string"
              ? d.date_label
              : typeof d?.date === "string"
              ? d.date
              : "";

          const regime =
            typeof d?.regime === "string"
              ? d.regime
              : typeof d?.score?.regime === "string"
              ? d.score.regime
              : "";

          const value =
            typeof d?.score === "number"
              ? d.score
              : typeof d?.score?.value === "number"
              ? d.score.value
              : null;

          const sub =
            regime || value !== null
              ? `${regime ? `régime ${regime}` : ""}${regime && value !== null ? " · " : ""}${
                  value !== null ? `score ${Math.round(value)}` : ""
                }`
              : "";

          return `
            <div class="ie-v3-row">
              <div class="ie-v3-rank">#${idx + 1}</div>
              <div class="ie-v3-main">
                <div class="ie-v3-label">${escapeHtml(label)}</div>
                ${sub ? `<div class="ie-v3-sub">${escapeHtml(sub)}</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      v3Block = `
        ${title ? `<div class="ie-ai-h">${escapeHtml(title)}</div>` : ""}
        ${timeframe ? `<div class="ie-ai-p">${escapeHtml(timeframe)}</div>` : ""}
        ${bullets.length ? `<div class="ie-ai-list">${renderBullets(bullets)}</div>` : ""}
        <div class="ie-v3-list mt-3">${rowsHtml}</div>
        ${
          primaryLink
            ? `<div class="ie-ai-cta mt-3">
                <a href="${escapeHtml(primaryLink.url)}" class="ie-inline-cta">
                  ${escapeHtml(primaryLink.label)} →
                </a>
              </div>`
            : ""
        }
      `;
    }

    const headline =
      (typeof n.headline === "string" && n.headline.trim()) ? n.headline.trim() :
      (typeof out?.ai?.headline === "string" && out.ai.headline.trim()) ? out.ai.headline.trim() :
      "";

    const answer =
      (typeof n.answer === "string" && n.answer.trim()) ? n.answer.trim() :
      (typeof n.summary === "string" && n.summary.trim()) ? n.summary.trim() :
      (typeof out?.ai?.answer === "string" && out.ai.answer.trim()) ? out.ai.answer.trim() :
      (typeof out?.ai?.summary === "string" && out.ai.summary.trim()) ? out.ai.summary.trim() :
      "";

    const keyFacts = Array.isArray(n.key_facts) ? n.key_facts : [];
    const reasons = Array.isArray(n.reasons) ? n.reasons : [];

    // Support both shapes: caveats[] (your current) OR caveat: string|null (month contracts)
    const caveats =
      Array.isArray(n.caveats) ? n.caveats :
      (typeof n.caveat === "string" && n.caveat.trim()) ? [n.caveat.trim()] :
      [];

    // High-value fields (already produced by Claude in month modes)
    const operationalImpacts = Array.isArray(n.operational_impacts) ? n.operational_impacts : [];
    const recommendedActions = Array.isArray(n.recommended_actions) ? n.recommended_actions : [];
    const perDateNotes = Array.isArray(n.per_date_notes) ? n.per_date_notes : [];

    const intent = typeof out?.meta?.resolved_intent === "string" ? out.meta.resolved_intent : "";
    const horizon = typeof out?.meta?.resolved_horizon === "string" ? out.meta.resolved_horizon : "";

    // Lookup-style questions (e.g., "quand est la feria") should stay simple unless AI returns lists.
    const isLookup = horizon === "lookup_event" || intent === "LOOKUP_EVENT";

    // Render primary action link (truth-based: provided by backend)
    const primary = out?.actions?.primary;

    const primaryLink =
      primary && typeof primary === "object" &&
      primary.type === "redirect" &&
      typeof primary.url === "string" && primary.url.startsWith("/") &&
      typeof primary.label === "string" && primary.label.trim()
        ? { url: primary.url, label: primary.label.trim() }
        : null;

    const list = (items) =>
      items.length
        ? `<ul class="mt-3 space-y-1 text-sm">
            ${items.map((x) => `<li class="list-disc ml-5">${escapeHtml(x)}</li>`).join("")}
          </ul>`
        : "";

    const section = (title, items) =>
      Array.isArray(items) && items.length
        ? `<div class="ie-ai-sec mt-3">
            <div class="ie-ai-sec-h">${escapeHtml(title)}</div>
            ${list(items)}
          </div>`
        : "";

    return `
      ${typeof v3Block === "string" ? v3Block : ""}

      ${headline ? `<div class="ie-ai-h mt-4">${escapeHtml(headline)}</div>` : ""}
      ${answer ? `<div class="ie-ai-p">${escapeHtml(answer)}</div>` : ""}

      ${
        primaryLink
          ? `<div class="ie-ai-cta">
              <a href="${escapeHtml(primaryLink.url)}" class="ie-inline-cta">
                ${escapeHtml(primaryLink.label)} →
              </a>
            </div>`
          : ""
      }

      ${keyFacts.length ? `<div class="ie-ai-list">${list(keyFacts)}</div>` : ""}

      ${operationalImpacts.length ? section("Impacts opérationnels", operationalImpacts) : ""}
      ${recommendedActions.length ? section("Actions recommandées", recommendedActions) : ""}
      ${perDateNotes.length ? section("Notes par date", perDateNotes) : ""}

      ${reasons.length ? `<div class="ie-ai-reasons">${list(reasons)}</div>` : ""}

      ${
        caveats.length
          ? `<div class="ie-ai-caveats">${caveats
              .map((c) => `<div class="ie-ai-cv">${escapeHtml(c)}</div>`)
              .join("")}</div>`
          : ""
      }
    `;
  }

  async function submitQuestion() {
    const ta = qs("ie-prompt-input");
    const q = (ta && ta.value ? ta.value : "").trim();
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

    const aiBubble = appendMsg("ai", "Analyse en cours…", "is-loading");

    try {
      const res = await fetch("/api/insight/prompt", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          q,
          thread_context: THREAD_CONTEXT
        })
      });

      const out = await res.json().catch(() => null);

      console.log("[ie-prompt] API out", out);

      updateThreadContextFromResponse(out);

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

      const ok = out.ok === true || out.ok === "true";
      if (!ok) {
        if (aiBubble) {
          aiBubble.className = "ie-bubble is-error";
          aiBubble.textContent = out.error || "Erreur lors de l’analyse.";
        }
        return;
      }

      // 0) Always show raw payload snippet (dev only)
      if (aiBubble) {
        const raw = escapeHtml(JSON.stringify(out, null, 2));
        aiBubble.className = "ie-bubble";
        aiBubble.innerHTML = `
          <details class="mt-2">
            <summary>Debug: réponse brute API</summary>
            <pre style="white-space:pre-wrap;font-size:12px;line-height:1.3">${raw}</pre>
          </details>
          <div class="mt-2">—</div>
        `;
      }

      const html = renderAiOutputHtml(out);
      if (aiBubble && html) aiBubble.innerHTML += html;

      if (aiBubble) {
        aiBubble.className = "ie-bubble";
        if (html) {
          setBubbleHtml(aiBubble, html);
        } else {
          const fallbackText =
            (typeof out?.ai?.output?.answer === "string" && out.ai.output.answer.trim()) ? out.ai.output.answer :
            (typeof out?.answer_text === "string" && out.answer_text.trim()) ? out.answer_text :
            (typeof out?.error === "string" && out.error.trim()) ? out.error :
            "Réponse reçue, mais aucun contenu affichable n’a été détecté.";

          aiBubble.textContent = fallbackText || "";
        }
      }

      console.log("[ie-prompt] bubble.innerHTML length", aiBubble?.innerHTML?.length);
      console.log("[ie-prompt] bubble.textContent length", aiBubble?.textContent?.length);

    } catch (e) {
      if (aiBubble) {
        aiBubble.className = "ie-bubble is-error";
        aiBubble.textContent = "Erreur réseau. Veuillez réessayer.";
      }
    } finally {
      btn?.removeAttribute("disabled");
    }
  }

  // Bind suggestion cards
  document.querySelectorAll(".ie-prompt-card").forEach((card) => {
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

    syncInputWrapHeight();
  }
