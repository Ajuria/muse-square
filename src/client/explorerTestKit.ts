// Socle des suites CLIENT Explorer (08/08) — exécute les VRAIS public/card-kit.js +
// public/scripts/ie-prompt.js dans happy-dom, fetch stubbé. RÈGLE : UN SEUL eval par FICHIER de
// test — le module n'a pas de ré-init, deux copies vivantes se disputent le DOM (mesuré : cartes
// mélangées) ; chaque état de données vit donc dans son propre fichier (page happy-dom fraîche).

import { readFileSync } from "node:fs";

export const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
export const THREAD_KEY = "ms_ie_thread_" + LOC;

// Enveloppe grounded minimale — provenance sous la forme RÉELLE (écho headline inclus, à sauter).
export const OUT = {
  ok: true,
  meta: { location_id: LOC, resolved_horizon: "day", resolved_intent: "DAY_WHY", producer: "grounded_day_claude", register: "vetted" },
  ai: { output: {
    headline: "Jour ordinaire.",
    answer: "Le CA atteint 1 150 €. La concurrence reste un repère.",
    key_facts: [], reasons: [], caveats: [],
    cited_fact_ids: ["f0", "f1"],
    sentence_provenance: [
      { text: "Jour ordinaire.", fact_ids: ["f0"] },
      { text: "Le CA atteint 1 150 €.", fact_ids: ["f0"] },
      { text: "La concurrence reste un repère.", fact_ids: ["f1"] },
    ],
    facts_catalog: [{ id: "f0", label: "Vos ventes" }, { id: "f1", label: "Veille concurrence" }],
  } },
  actions: {}, decision_payload: { used_dates: ["2026-07-18"] },
};

export function stubDom(): void {
  document.body.innerHTML =
    '<div id="ie-prompt-root" data-location-id="' + LOC + '"></div>' +
    '<div id="ie-prompt-empty"><div id="ie-prompt-suggestions-label"></div>' +
    '<a id="ie-finder-card" class="ie-prompt-card"></a><div id="ie-finder-form"></div></div>' +
    '<div id="ie-new-thread-row" hidden><button data-ie-new-thread>Nouvelle conversation</button></div>' +
    '<div id="ie-thread" hidden></div><textarea id="ie-prompt-input"></textarea>';
}

// J1.6 — état « consulté » des suggestions : marques servies au GET, POST capturés.
// Un fichier de test pose ACTION_LOG.marks AVANT bootOnce ; les autres suites voient
// simplement un compte sans marque ({ok:true, marks:[]}).
export const ACTION_LOG = { marks: [] as any[], posts: [] as any[] };

export function stubFetch(days: any[]): void {
  (globalThis as any).fetch = (url: any, init?: any) => {
    const u = String(url);
    const json = (o: any) => Promise.resolve({ ok: true, headers: { get: () => "application/json" }, json: () => Promise.resolve(o) });
    if (u.includes("/api/insight/monitor")) return json({ ok: true, days });
    if (u.includes("competitor-signals")) return json({ ok: true, signals: [], followed_count: 0 });
    if (u.includes("/api/insight/corrections")) return json({ ok: true, corrections: [] });
    if (u.includes("/api/insight/action-log")) {
      if (init && init.method === "POST") {
        try { ACTION_LOG.posts.push(JSON.parse(String(init.body))); } catch { ACTION_LOG.posts.push(null); }
        return json({ ok: true });
      }
      return json({ ok: true, marks: ACTION_LOG.marks });
    }
    return json({ ok: false });
  };
}

// UN eval des vrais fichiers — appeler UNE fois par fichier de test, jamais deux.
export async function bootOnce(days: any[]): Promise<void> {
  stubDom(); stubFetch(days);
  (0, eval)(readFileSync("public/card-kit.js", "utf8"));
  (0, eval)(readFileSync("public/scripts/ie-prompt.js", "utf8"));
  await new Promise((r) => setTimeout(r, 100));
}

export const slotCards = () => Array.from(document.querySelectorAll(".ie-dynamic-suggestion"));
