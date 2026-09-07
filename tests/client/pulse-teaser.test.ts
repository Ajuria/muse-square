// @vitest-environment happy-dom
// 07/09 — LE FIL COMME UN TEASER (proto tools/proto/agir-fil-proto.html, arbitré owner 07/09), vérifié sur
// le VRAI script inline de pulse.astro + le VRAI public/js/action-cards.js (le harnais est la page).
// Chaque carte : nature + urgence en pastilles, le titre, UNE phrase (jamais les familles), un média,
// le geste sans préfixe, « Pas pour moi » à côté de « M'engager » ; « À noter » = une ligne ; les
// hausses de CA d'un même site = UNE carte ; le coin d'une carte CA = les € du jour, jamais l'€/an.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";

let h: any;
beforeAll(() => {
  document.body.innerHTML = '<div id="ms-brief-root"></div><div id="pls-engagement-cards"></div>';
  (globalThis as any).fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, items: [] }), text: () => Promise.resolve("{}") });
  new Function("window", "document", readFileSync(resolve("public/js/reco-library.js"), "utf8"))(window, document);
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(window, document);
  const astro = readFileSync(resolve("src/pages/app/insightevent/pulse.astro"), "utf8");
  const m = astro.match(/<script is:inline(?:\s[^>]*)?>\n([\s\S]*?)\n\s*<\/script>/)!;
  const body = m[1], tail = body.lastIndexOf("})();");
  const src = "var location_id = 'f10c3e58-326e-4e38-947c-d59fcbe51df5';\n" + body.slice(0, tail)
    + "\n;window.__h = { renderDailyBrief: typeof renderDailyBrief !== 'undefined' ? renderDailyBrief : null };\n" + body.slice(tail);
  try { new Function("window", "document", "localStorage", src)(window, document, window.localStorage); } catch (e) { /* boot bénin */ }
  h = (window as any).__h;
  if (!h?.renderDailyBrief) throw new Error("renderDailyBrief non exporté");
});
const TODAY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";
function render(cands: any[]): string {
  (window as any)._lastActionCandidates = cands; (window as any)._lastDayClassImpacts = [];
  const root = document.getElementById("ms-brief-root")!;
  root.innerHTML = h.renderDailyBrief([], {}, { date: TODAY }, TODAY, LOC, [{ date: TODAY }], 0, null);
  return root.innerHTML;
}
const surge = (date: string, daily: number, expected: number, id: string) => ({
  date, action_type: "sales_surge", action_priority: 3, action_category: "performance", location_id: LOC, location_label: "Muse Square", card_instance_id: id,
  enjeu: { eur_year: 8826, tier: "mesuré", tier_label_fr: "mesuré", label_fr: "jours comme celui-ci", n_days: 12, span_months: 5, class_key: "pop_revenue_surge" },
  data_payload: { daily_revenue: daily, expected_revenue: expected, residual_pct: 80, residual_z: 2.5, transactions_delta_pct: 90, basket_delta_pct: -7, dominant_factor: "transactions", weather_alert: 0 },
  // décomposition du jour (kit : « … Familles : Coffee 45 % du CA … ») — la page la COUPE du teaser.
  decomposition: { date, gap_eur: daily - expected, volume_term_eur: 700, basket_term_eur: 8, dominant_factor: "transactions", daily_transactions: 366, expected_transactions: 188, daily_avg_basket: 4.35, expected_basket: 4.69,
    top_families: [{ family: "Coffee", revenue: 722, expected_revenue: 341, delta_eur: 381, revenue_share: 0.45, baseline_share: 0.39 }], families_delta_eur: 381, families_unexplained_eur: 0 },
});

it("carte CA : pastilles Opportunité + Cette semaine, coin = les € du jour (l'€/an au ⓘ), graphique, geste sans préfixe ni parenthèses, corps sans les familles", () => {
  const html = render([surge(daysAgo(1), 1590, 882, "i1")]);
  expect(html).toMatch(/ab-chip opp">Opportunité<\/span><span class="ab-chip urg">Cette semaine</);
  expect(html).toMatch(/amt-val[^>]*>\+708 €</);
  expect(html).toMatch(/amt-sub">le \d\d\/\d\d</);
  expect(html).not.toMatch(/amt-val[^>]*>\+8[\s  ]826 €\/an/);
  expect(html).toMatch(/title="[^"]*Vos jours comme celui-ci : \+8[\s  ]826 €\/an, mesuré sur 12 j \/ 5 mois\./);
  expect(html).toContain('<div class="ab-media chart">');
  expect(html).toMatch(/<div class="aline">La hausse vient du volume/);
  expect(html).not.toMatch(/aline">[^<]*\(/);
  expect(html).not.toMatch(/aline">Action conseillée/);
  expect(html).toMatch(/ab-sowhat[^>]*>[^<]*366 ventes contre 188/);
  expect(html).not.toMatch(/ab-sowhat[^>]*>[^<]*Familles :/);
});

it("deux hausses de CA du même site = UNE carte : « 2 jours au-dessus de votre CA habituel cette semaine », Σ des écarts, deux paires au graphique, les deux instances sous « Pas pour moi » — et le produit du jour garde sa place au pli", () => {
  const prod = { date: daysAgo(1), action_type: "item_share_move", action_priority: 2, action_category: "performance", location_id: LOC, location_label: "Muse Square", card_instance_id: "p1", corner_day_mode: true,
    data_payload: { item_description: "Columbian Medium Roast Rg", item_revenue: 60, expected_item_revenue: 14, delta_eur: 46, direction: "surge", day_gap_eur: 708, baseline_same_regime_n: 8, typ_n: 8 } };
  const html = render([surge(daysAgo(1), 1590, 882, "i1"), surge(daysAgo(2), 1600, 900, "i3"), surge(daysAgo(3), 1842, 1090, "i2"), surge(daysAgo(4), 1500, 880, "i4"), surge(daysAgo(5), 1520, 890, "i5"), prod]);
  expect((html.match(/class="ab-card"/g) || []).length).toBe(1);
  expect(html).toMatch(/class="ab-card ab-row"[^>]*data-t-type="item_share_move"/);
  expect(html).toContain("5 jours au-dessus de votre CA habituel cette semaine");
});
it("deux hausses : Σ des écarts et deux paires au graphique", () => {
  const html = render([surge(daysAgo(1), 1590, 882, "i1"), surge(daysAgo(3), 1842, 1090, "i2")]);
  expect(html).toContain("2 jours au-dessus de votre CA habituel cette semaine");
  expect(html).toMatch(/amt-val[^>]*>\+1[\s  ]460 €</);
  expect(html).toContain('<div class="amt-sub">sur 2 jours</div>');
  expect((html.match(/class="grp"/g) || []).length).toBe(2);
  expect(html).toMatch(/data-ab-dispo-group="i1,i2"/);
  expect(html).toMatch(/ab-sowhat[^>]*>\+708 € \w+ \d\d\/\d\d, \+752 € \w+ \d\d\/\d\d\. La hausse vient du volume les 2 fois\./);
});

it("« À noter » (nature info, priorité 2) = une ligne : classe ab-row, gestes conservés", () => {
  const html = render([{ date: daysAgo(1), action_type: "item_share_move", action_priority: 2, action_category: "performance", location_id: LOC, location_label: "Muse Square", card_instance_id: "p1",
    corner_day_mode: true, data_payload: { item_description: "Columbian Medium Roast Rg", item_revenue: 60, expected_item_revenue: 14, delta_eur: 46, direction: "surge", day_gap_eur: 708, baseline_same_regime_n: 8, typ_n: 8 } }]);
  expect(html).toMatch(/class="ab-card ab-row"/);
  expect(html).not.toMatch(/ab-chip/);
  expect(html).toContain("Pas pour moi");
  expect(html).toContain("M’engager");
});

it("résultat d'hier : pastille « Résultat » (jamais Menace), tuile du dispositif", () => {
  const html = render([{ date: TODAY, action_type: "event_measure", action_priority: 90, action_category: "event", location_id: LOC, location_label: "Muse Square", card_instance_id: "e1",
    data_payload: { event_title: "Corner de vente producteur", occurrence_date: daysAgo(1), daily_revenue: 1537, expected_revenue: 948, gap_eur: 589, revenue: 1537, expected: 948, kpi: "revenue", kpi_family: "Branded", saved_item_id: "s1" } }]);
  expect(html).toMatch(/ab-chip res">Résultat</);
  expect(html).not.toMatch(/ab-chip thr">Menace/);
  expect(html).toMatch(/ab-media tile"><span class="ic">.*<b>Corner de vente producteur<\/b><br>résultat mesuré le \d\d\/\d\d/);
});

it("carte calendrier : tuile de dates « 07 → 10 sept. » + nom du temps fort", () => {
  const html = render([{ date: TODAY, action_type: "commercial_event_match", action_priority: 3, action_category: "calendar", location_id: LOC, location_label: "Muse Square", card_instance_id: "c1",
    data_payload: { commercial_event_name: "rentrée scolaire", commercial_event_code: "back_to_school", is_commercial: true, window_start: "2026-09-07", window_end: "2026-09-10", window_days: 4, score: 70, events_5km: 12, pressure_ratio: 1 } }]);
  expect(html).toMatch(/ab-media tile"><span class="d">07 → 10<small>sept\.<\/small><\/span><span class="lbl">Rentrée scolaire<\/span>/);
});

it("carte concurrent avec photo servie par monitor : média photo avec la légende", () => {
  const html = render([{ date: TODAY, action_type: "competitor_reputation_strength", action_priority: 2, action_category: "competition", location_id: LOC, location_label: "Muse Square", card_instance_id: "r1",
    data_payload: { competitor_name: "Centre Pompidou", google_rating: 4.5, google_rating_count: 134, competitor_photo: "https://lh3.googleusercontent.com/place-photos/x=s4800-w800", audience_overlap_pct: 50, distance_m: 4200 } }]);
  expect(html).toMatch(/<div class="ab-media photo"><img src="https:\/\/lh3\.googleusercontent\.com\/place-photos\/x=s4800-w800"/);
  expect(html).toMatch(/<b>Centre Pompidou<\/b> · 4,5 ★ · 134 avis/);
});

it("pied : « Pas pour moi » juste avant « M’engager »", () => {
  const html = render([surge(daysAgo(1), 1590, 882, "i1")]);
  const foot = html.slice(html.indexOf('class="ab-rfoot"'));
  const btns = [...foot.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  expect(btns.slice(-2)).toEqual(["Pas pour moi", "Enrichir"]);
});
