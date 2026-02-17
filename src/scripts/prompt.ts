function escapeHtml(s: unknown) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAI(mount: HTMLElement, data: any) {
  const ai = data?.ai;
  const meta = data?.meta;
  const actions = data?.actions;
  const top_dates = data?.top_dates;
  const ui_packaging_v3 = data?.ui_packaging_v3;
  const debug = data?.debug;

  // month/day path: ai.output exists
  if (ai?.ok && ai?.output) {
    const debugFlag = typeof window !== "undefined" && window.location?.search?.includes("debug=1");
    const lookupHit = debug?.lookup_hit ?? null;
    const hasLookup = meta?.horizon === "lookup_event";
    const lookupHtml = hasLookup
      ? (lookupHit && lookupHit.event_name
          ? `
            <div class="rounded-2xl border p-4 mb-3">
              <div class="text-base font-semibold">Résultat événement</div>
              <div class="mt-2 text-sm leading-5">${escapeHtml(lookupHit.event_name ?? "ND")}</div>
              <div class="mt-2 text-sm leading-5">${escapeHtml(lookupHit.event_start_date ?? "ND")} → ${escapeHtml(lookupHit.event_end_date ?? "ND")}</div>
              <div class="mt-2 text-sm leading-5">${escapeHtml(lookupHit.city_name ?? "ND")}</div>
              ${lookupHit.source_url ? `<div class="mt-2 text-sm"><a href="${escapeHtml(lookupHit.source_url)}" target="_blank" rel="noopener noreferrer">Source</a></div>` : ""}
            </div>
          `
          : `
            <div class="rounded-2xl border p-4 mb-3">
              <div class="text-base font-semibold">Résultat événement</div>
              <div class="mt-2 text-sm leading-5">Aucun résultat (SQL)</div>
            </div>
          `
        )
      : "";
    const topDatesHtml =
      Array.isArray(top_dates) && top_dates.length
        ? `
          <div class="rounded-2xl border p-4 mb-3">
            <div class="text-base font-semibold">Top dates</div>
            <ul class="mt-2 space-y-1 text-sm">
              ${top_dates.map((d: any) => `<li class="list-disc ml-5">${escapeHtml(d?.date ?? "")} — ${escapeHtml(d?.regime ?? "ND")} — ${escapeHtml(d?.score ?? "ND")}</li>`).join("")}
            </ul>
          </div>
        `
        : "";
    const uiPackagingHtml =
      Array.isArray(ui_packaging_v3?.dates) && ui_packaging_v3.dates.length
        ? `
          <div class="rounded-2xl border p-4 mb-3">
            <div class="text-base font-semibold">Dates sélectionnées</div>
            <ul class="mt-2 space-y-1 text-sm">
              ${ui_packaging_v3.dates.slice(0, 5).map((d: any) => `<li class="list-disc ml-5">${escapeHtml(d?.date ?? "")}${Array.isArray(d?.bullets) && d.bullets.length ? ` — ${escapeHtml(d.bullets.join(" | "))}` : ""}</li>`).join("")}
            </ul>
          </div>
        `
        : "";
    const actionPrimary = actions?.primary;
    const actionHtml =
      actionPrimary && actionPrimary.url
        ? `
          <div class="mb-3">
            <a class="rounded-2xl border p-3 inline-block text-sm font-semibold" href="${escapeHtml(actionPrimary.url)}">${escapeHtml(actionPrimary.label ?? "Ouvrir")}</a>
          </div>
        `
        : "";
    const debugHtml =
      debugFlag
        ? `
          <details class="rounded-2xl border p-4 mt-3">
            <summary class="text-sm font-semibold">Debug JSON</summary>
            <pre class="mt-2 text-xs whitespace-pre-wrap">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
          </details>
        `
        : "";
    const bodyText =
      (typeof ai?.answer === "string" && ai.answer.trim())
        ? ai.answer
        : (typeof ai?.output?.text === "string" && ai.output.text.trim())
          ? ai.output.text
          : (ai?.output?.summary ?? "");

    const bodyHtml = escapeHtml(bodyText).replace(/\n/g, "<br/>");

    mount.innerHTML = `
      ${lookupHtml}
      ${ui_packaging_v3 || (Array.isArray(top_dates) && top_dates.length) ? `${uiPackagingHtml}${topDatesHtml}` : ""}
      ${actionHtml}
      <div class="rounded-2xl border p-4">
        <div class="text-base font-semibold">${escapeHtml(ai?.output?.headline ?? "")}</div>
        <div class="mt-2 text-sm leading-5">${bodyHtml}</div>
        <ul class="mt-3 space-y-1 text-sm">
          ${(ai?.output?.key_facts ?? [])
            .map((f: string) => `<li class="list-disc ml-5">${escapeHtml(f)}</li>`)
            .join("")}
        </ul>
      </div>
      ${debugHtml}
    `;
    return;
  }

  // selected_days path: ai.outputs[] exists
  if (ai?.ok && Array.isArray(ai.outputs)) {
    mount.innerHTML = ai.outputs
      .map((x: any) => {
        const o = x?.output;
        if (!x?.ok || !o) return "";
        return `
          <div class="rounded-2xl border p-4 mb-3">
            <div class="text-base font-semibold">${escapeHtml(o.headline ?? "")}</div>
            <div class="mt-2 text-sm leading-5">${escapeHtml(o.summary ?? "")}</div>
            <ul class="mt-3 space-y-1 text-sm">
              ${(o.key_facts ?? [])
                .map((f: string) => `<li class="list-disc ml-5">${escapeHtml(f)}</li>`)
                .join("")}
            </ul>
            ${o.caveat ? `<div class="mt-3 text-sm opacity-80">${escapeHtml(o.caveat)}</div>` : ""}
          </div>
        `;
      })
      .join("");
    return;
  }

  mount.innerHTML = "";
}

async function postPrompt(payload: any) {
  const res = await fetch("/api/insight/prompt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

function getValue(id: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el?.value?.trim() ? el.value.trim() : null;
}

document.addEventListener("DOMContentLoaded", () => {
  const mount = document.getElementById("ai_output_mount");
  if (!mount) return;

  // You must have a form or button to trigger the call.
  // Expected IDs (adjust in your .astro markup to match):
  // - form id="prompt_form"
  // - textarea/input id="prompt_q"
  // Optional:
  // - input id="selected_date"
  // - input id="date"
  // - input id="dates"  (comma-separated YYYY-MM-DD)
  const form = document.getElementById("prompt_form") as HTMLFormElement | null;
  const qEl = document.getElementById("prompt_q") as HTMLInputElement | HTMLTextAreaElement | null;

  if (!form || !qEl) {
    mount.innerHTML = `<div class="rounded-2xl border p-4 text-sm">Missing UI elements: #prompt_form and/or #prompt_q</div>`;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const q = qEl.value.trim();
    if (!q) return;

    // Optional fields if you expose them in the UI
    const selected_date = getValue("selected_date");
    const date = getValue("date");

    const datesRaw = getValue("dates"); // comma-separated
    const dates =
      datesRaw?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];

    mount.innerHTML = `<div class="rounded-2xl border p-4 text-sm">Chargement…</div>`;

    try {
      const data = await postPrompt({ q, selected_date, date, dates });
      renderAI(mount, data);
    } catch (err: any) {
      mount.innerHTML = `<div class="rounded-2xl border p-4 text-sm">Erreur: ${escapeHtml(err?.message ?? "Unknown error")}</div>`;
    }
  });
});
