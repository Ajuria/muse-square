// @vitest-environment happy-dom
// 06/09 (audit P4) — UNE UNITÉ PAR CARTE, vérifié sur le VRAI script inline de pulse.astro + le VRAI
// public/js/action-cards.js (le harnais est la page). Une carte de fait rend l'écart du jour de
// l'objet au coin, sa population au ⓘ, sans la promesse « passera en €/an ».
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";

let h: any;
beforeAll(() => {
  document.body.innerHTML = '<div id="ms-brief-root"></div><div id="pls-engagement-cards"></div>';
  (globalThis as any).fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [] }), text: () => Promise.resolve("{}") });
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(window, document);
  const astro = readFileSync(resolve("src/pages/app/insightevent/pulse.astro"), "utf8");
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/)!;
  const body = m[1], tail = body.lastIndexOf("})();");
  const src = "var location_id = 'f10c3e58-326e-4e38-947c-d59fcbe51df5';\n" + body.slice(0, tail)
    + "\n;window.__h = { renderDailyBrief: typeof renderDailyBrief !== 'undefined' ? renderDailyBrief : null, applySowhatClamp: typeof applySowhatClamp !== 'undefined' ? applySowhatClamp : null };\n" + body.slice(tail);
  try { new Function("window", "document", "localStorage", src)(window, document, window.localStorage); } catch (e) { /* boot bénin */ }
  h = (window as any).__h;
  if (!h?.renderDailyBrief) throw new Error("renderDailyBrief non exporté");
});

// 07/09 : la page rend les cartes de performance sur le jour RÉEL (todayYmd) — une constante figée
// a fait tomber deux tests au changement de date. TODAY suit l'horloge locale de la machine.
const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
function renderOne(candidate: any): string {
  (window as any)._lastActionCandidates = [candidate];
  (window as any)._lastDayClassImpacts = [];
  const root = document.getElementById("ms-brief-root")!;
  root.innerHTML = h.renderDailyBrief([], {}, { date: TODAY }, TODAY, "f10c3e58-326e-4e38-947c-d59fcbe51df5", [{ date: TODAY }], 0, null);
  return root.innerHTML;
}

it("carte de fait avec témoins : « +169 € le 04/09 » au coin, population au ⓘ, pas de promesse", () => {
  const html = renderOne({
    date: "2026-09-04", action_type: "hour_share_move", action_priority: 2, action_category: "performance", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
    enjeu: null, corner_day_mode: true, funnel_corner: null, context_motif: null,
    population_enjeu: { class_key: "pop_hour_carry", family: "card", label_fr: "créneaux qui ont surperformé", eur_year: 2597, tier: "mesuré", tier_label_fr: "mesuré", entangled: false, n_days: 8, span_months: 5, avg_gap_eur: 136, t_stat: 2 },
    data_payload: { transaction_hour: 15, revenue: 216, expected_hour_revenue: 48, delta_eur: 169, direction: "surge", day_gap_eur: 739, expected_hour_transactions: 11, transactions: 47, typ_n: 8, baseline_same_regime_n: 6, is_school_holiday_flag: false, regime_mismatch_flag: false },
  });
  expect(html).toMatch(/amt-val[^>]*>\+169 €</);
  // toLocaleString('fr-FR') sépare les milliers par une espace fine insécable (U+202F).
  expect(html).toMatch(/Vos créneaux qui ont surperformé : \+2[\s\u202f\u00a0]597 €\/an, mesuré sur 8 j \/ 5 mois\./);
  expect(html).toMatch(/amt-sub">le 04\/09</);
  expect(html).not.toContain("passera en €/an");
  expect(html).not.toMatch(/597 €\/an<\/div>/);
});

it("carte à motif de contexte propre : « +203 € · par jour · ces jours-là » au coin, le % funnel au ⓘ, jamais le €/an", () => {
  const html = renderOne({
    date: TODAY, action_type: "low_competition_window", action_priority: 3, action_category: "competition", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
    enjeu: null, corner_day_mode: true,
    context_motif: { class_key: "competition_low", label_fr: "jours à faible activité dans votre périmètre", eur_year: 19131, tier: "mesuré", tier_label_fr: "mesuré", entangled: false, n_days: 23, span_months: 5, avg_gap_eur: 203, t_stat: 2 },
    funnel_corner: { kpi: "footfall", pct: 0.13, abs_per_day: 41, n_days: 23, class_key: "competition_low", class_label_fr: "jours à faible activité dans votre périmètre" },
    data_payload: { window_start: TODAY, window_end: "2026-09-09", window_days: 4, pressure_ratio: 0.8, events_5km: 257, baseline_avg: 3461, score: 61 },
  });
  expect(html).toMatch(/amt-val[^>]*>\+203 €</);
  expect(html).toContain('<div class="amt-sub">par jour · ces jours-là</div>');
  expect(html).toContain("Mesuré sur 23 jours de jours à faible activité dans votre périmètre : +203 € par jour vs vos jours comparables. Vos visiteurs +13 % sur ces jours.");
  expect(html).not.toContain("€/an");
  expect(html).not.toMatch(/amt-val[^>]*>\+13 %</);
});

it("06/09 (audit P6) — la réserve hors du clamp, le geste avant « Voir plus »", () => {
  const html = renderOne({
    date: "2026-09-04", action_type: "item_share_move", action_priority: 3, action_category: "performance", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
    enjeu: null, corner_day_mode: true, funnel_corner: null, context_motif: null, population_enjeu: null,
    data_payload: { item_description: "Traditional Blend Chai Rg", revenue: 58, expected_item_revenue: 13, delta_eur: 44, direction_eur: "surge", day_gap_eur: 739, typ_n: 30, baseline_same_regime_n: 4, is_school_holiday_flag: false, regime_mismatch_flag: true },
  });
  const root = document.getElementById("ms-brief-root")!;
  const sowhat = root.querySelector(".ab-sowhat")!, reserve = root.querySelector(".ab-reserve")!, aline = root.querySelector(".aline");
  expect(reserve.textContent).toMatch(/^Comparé surtout à des jours en vacances scolaires \(26 sur 30\)/);
  expect(sowhat.textContent).not.toContain("Comparé surtout");
  expect(sowhat.nextElementSibling).toBe(reserve);
  // happy-dom n'a pas de mise en page : on simule un corps qui déborde, puis on applique le clamp.
  Object.defineProperty(sowhat, "scrollHeight", { get: () => 120 });
  Object.defineProperty(sowhat, "clientHeight", { get: () => 60 });
  h.applySowhatClamp(root);
  const more = root.querySelector(".pls-more")!;
  expect(more.textContent).toBe("Voir plus");
  const last = aline || reserve;
  expect(last.nextElementSibling).toBe(more);           // le lien vient APRÈS la réserve et le geste
  expect(sowhat.classList.contains("pls-clamp")).toBe(true);
  expect(reserve.classList.contains("pls-clamp")).toBe(false);
});

it("06/09 (owner, P7) — une carte de calendrier sans classe mesurée dit « Motif du jour : saisonnalité — rentrée scolaire. »", () => {
  const html = renderOne({
    date: TODAY, action_type: "commercial_event_match", action_priority: 3, action_category: "opportunity", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5",
    enjeu: null, corner_day_mode: true, funnel_corner: null, context_motif: null, population_enjeu: null,
    data_payload: { window_start: TODAY, window_end: "2026-09-09", window_days: 4, is_commercial: true, commercial_event_name: "Rentrée scolaire", commercial_event_code: "back-to-school", score: 59, events_5km: 265, pressure_ratio: 0.84 },
  });
  expect(html).toContain("Motif du jour : saisonnalité — rentrée scolaire.");
});
