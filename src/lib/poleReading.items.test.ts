// Le classement des articles vus sur les photos face à leurs ventes (livrable 2, 03/09) — PUR.
// Ce que le test attrape : un article « en retrait » sans plancher de jours, un article non vu
// compté comme vu, une famille hors pôle dans les « vendus sans être vus », le tri.
import { describe, it, expect } from "vitest";
import { classifyPoleItems, RETRAIT_MIN_DAYS, RETRAIT_PCT } from "./poleReading";

const items = [
  { item_code: "A", item_description: "Ethiopia", item_category: "Coffee", rev30_eur: 700, expected30_eur: 1000, n30: 20, days_since_last_sale: null },   // −30 % : en retrait
  { item_code: "B", item_description: "Latte", item_category: "Coffee", rev30_eur: 1050, expected30_eur: 1000, n30: 25, days_since_last_sale: null },    // +5 % : non
  { item_code: "C", item_description: "Scone", item_category: "Bakery", rev30_eur: 60, expected30_eur: 100, n30: 3, days_since_last_sale: 4 },           // −40 % mais 3 j : sous plancher
  { item_code: "D", item_description: "Croissant", item_category: "Bakery", rev30_eur: 400, expected30_eur: 380, n30: 28, days_since_last_sale: null },  // vendu, jamais vu
  { item_code: "E", item_description: "Tea", item_category: "Tea", rev30_eur: 200, expected30_eur: 150, n30: 10, days_since_last_sale: null },           // hors familles du pôle
];
const photos = [
  { component_key: "c1", items: [{ item_code: "A" }, { item_code: "B" }], confirmed: true },
  { component_key: "c2", items: [{ item_code: "C" }, { item_code: "A" }], confirmed: false },
];

describe("classifyPoleItems", () => {
  it("en retrait = plancher de jours ET attendu > 0 ET écart ≤ seuil ; tri du plus en retrait au moins", () => {
    const r = classifyPoleItems({ photos, items, families: ["Coffee", "Bakery"] });
    expect(r.n_photos).toBe(2);
    expect(r.seen.map((x) => x.item_code)).toEqual(["C", "A", "B"]);
    const a = r.seen.find((x) => x.item_code === "A")!;
    expect(a.delta_pct).toBe(-30); expect(a.en_retrait).toBe(true); expect(a.confirmed).toBe(true); expect(a.component_keys).toEqual(["c1", "c2"]);
    const c = r.seen.find((x) => x.item_code === "C")!;
    expect(c.delta_pct).toBe(-40); expect(c.en_retrait).toBe(false); expect(c.n30).toBeLessThan(RETRAIT_MIN_DAYS);
    expect(r.seen.find((x) => x.item_code === "B")!.en_retrait).toBe(false);
    expect(RETRAIT_PCT).toBe(-10);
  });
  it("vendus sans être vus : les familles du pôle seulement, ventes > 0, du plus gros au plus petit", () => {
    const r = classifyPoleItems({ photos, items, families: ["Coffee", "Bakery"] });
    expect(r.unseen.map((x) => x.item_code)).toEqual(["D"]);
    const all = classifyPoleItems({ photos, items, families: [] });
    expect(all.unseen.map((x) => x.item_code)).toEqual(["D", "E"]);
  });
  it("un article vu sans aucune vente sur la fenêtre : présent, sans variation, jamais en retrait", () => {
    const r = classifyPoleItems({ photos: [{ component_key: "c1", items: [{ item_code: "Z" }], confirmed: false }], items, families: [] });
    expect(r.seen[0]).toMatchObject({ item_code: "Z", delta_pct: null, en_retrait: false, n30: 0 });
  });
});
