// @vitest-environment happy-dom
// Résolution à la lecture (06/09, audit N5) : renderEngagements (pulse.astro) demande UNE fois
// par chargement la résolution des engagements open/pending dont la fenêtre est close, APRÈS le
// premier rendu, et re-rend le bloc quand l'état a changé. Vérifié en exécutant le VRAI script
// inline de pulse.astro (le harnais est la page), fetch stubbé.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";

const astro = readFileSync(resolve("src/pages/app/insightevent/pulse.astro"), "utf8");
let h: any;
const calls: Array<{ url: string; body: any }> = [];
let listCalls = 0;
let resolveChanged = true;
let resolvedItem: any = null;

beforeAll(() => {
  document.body.innerHTML = '<div id="pls-engagement-cards"></div><div id="pls-eng-head"></div><span id="pls-eng-count"></span><div id="pls-past-actions"></div>';
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/);
  if (!m) throw new Error("script inline introuvable");
  const body = m[1];
  const tail = body.lastIndexOf("})();");
  const src = "var location_id = 'loc-test';\n" + body.slice(0, tail)
    + "\n;window.__h = { renderEngagements: typeof renderEngagements !== 'undefined' ? renderEngagements : null };\n" + body.slice(tail);
  (globalThis as any).fetch = (url: any, opts: any) => {
    const u = String(url);
    if (u.startsWith("/api/commitments/resolve")) {
      calls.push({ url: u, body: JSON.parse(String(opts.body)) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, changed: resolveChanged, outcome: "resolved", verdict: "met" }) });
    }
    if (u.startsWith("/api/commitments?location_id=")) {
      listCalls++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [
        // fenêtre close hier, encore pending → à résoudre
        { commitment_id: "c-close", status: "pending", location_id: "loc-test", window_kind: "day_of", window_start: "2026-09-05", window_end: { value: "2026-09-05" }, window_days_expected: 1, window_days_resolved: 0, committed_action_text: "Corner producteur", updated_at: "2026-09-06T02:00:00Z" },
        // fenêtre encore ouverte → jamais demandée
        ...(resolvedItem ? [resolvedItem] : []),
        { commitment_id: "c-open", status: "open", location_id: "loc-test", window_kind: "7d", window_start: "2099-01-01", window_end: "2099-01-07", window_days_expected: 7, committed_action_text: "Offre rentrée", updated_at: "2026-09-06T01:00:00Z" },
      ] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [] }), text: () => Promise.resolve("{}") });
  };
  try { new Function("window", "document", "localStorage", src)(window, document, window.localStorage); } catch (e) { /* boot bénin */ }
  h = (window as any).__h;
  if (!h || !h.renderEngagements) throw new Error("renderEngagements non exporté");
});

const tick = () => new Promise((r) => setTimeout(r, 30));

it("demande la résolution de la fenêtre close seulement, une fois, et re-rend quand l'état change", async () => {
  h.renderEngagements(["loc-test"]);
  await tick(); await tick(); await tick();
  expect(calls.map((c) => c.body.commitment_id)).toEqual(["c-close"]);
  expect(calls[0].body.location_id).toBe("loc-test");
  // changed:true → second GET de la liste (re-rendu) ; la résolution n'est pas redemandée.
  expect(listCalls).toBe(2);
  expect(calls.length).toBe(1);
});

it("un nouveau rendu sans changement ne redemande rien", async () => {
  resolveChanged = false;
  const before = calls.length, lists = listCalls;
  h.renderEngagements(["loc-test"]);
  await tick(); await tick();
  expect(calls.length).toBe(before);       // déjà tentée ce chargement
  expect(listCalls).toBe(lists + 1);       // le rendu demandé, pas de re-rendu
});

it("06/09 (audit N6) — un engagement résolu dit ventes et panier à côté du CA, même référentiel", async () => {
  resolvedItem = { commitment_id: "c-res", status: "resolved", verdict: "met", location_id: "loc-test", window_kind: "day_of", window_start: "2026-09-05", window_end: "2026-09-05",
    window_days_expected: 1, window_days_resolved: 1, window_residual_pct: 66.16, window_expected_revenue: 925, window_transactions_delta_pct: 75.76, window_basket_delta_pct: -5.63,
    threshold_basis: "pct", threshold_value: 11, committed_action_text: "Corner de vente producteur", updated_at: "2026-09-06T09:31:57Z" };
  h.renderEngagements(["loc-test"]);
  await tick(); await tick();
  const txt = String(document.body.textContent || "").replace(/\s+/g, " ");
  expect(txt).toContain("CA +66.16 % vs votre résultat habituel (ventes +76 %, panier −6 %) · habituel 925 €");
});

it("06/09 (trois couches) — les termes en € de la fenêtre remplacent les % quand ils existent", async () => {
  resolvedItem = { commitment_id: "c-res2", status: "resolved", verdict: "met", location_id: "loc-test", window_kind: "day_of", window_start: "2026-09-05", window_end: "2026-09-05",
    window_days_expected: 1, window_days_resolved: 1, window_residual_pct: 66.16, window_expected_revenue: 925, window_transactions_delta_pct: 75.76, window_basket_delta_pct: -5.63,
    window_volume_term_eur: 751.68, window_basket_term_eur: -33.33, window_transactions: 351, window_expected_transactions: 189, window_avg_basket: 4.55, window_expected_basket: 4.64, window_top_families: JSON.stringify([{ family: "Coffee", revenue: 672, expected_revenue: 362, revenue_share: 0.437, baseline_share: 0.386 }, { family: "Tea", revenue: 496, expected_revenue: 263, revenue_share: 0.323, baseline_share: 0.281 }]), threshold_basis: "pct", threshold_value: 11, committed_action_text: "Corner de vente producteur", updated_at: "2026-09-06T09:31:57Z" };
  h.renderEngagements(["loc-test"]);
  await tick(); await tick();
  const txt = String(document.body.textContent || "").replace(/\s+/g, " ");
  expect(txt).toContain("CA +66.16 % vs votre résultat habituel (351 ventes contre 189, panier 4,55 € contre 4,64 €) · habituel 925 €");
  expect(txt).toContain("Familles : Coffee 44 % du CA (672 €) contre 39 % d’habitude (362 €), Tea 32 % (496 €) contre 28 % (263 €).");
});
