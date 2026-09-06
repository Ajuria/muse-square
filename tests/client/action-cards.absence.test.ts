// Porte de merge (06/09) : la carte « Produit régulier absent » (item_absent_regular, grain FACTURE —
// mart fct_client_item_absence_daily, bloc candidat ms_database). Les payloads sont ceux que le bloc
// candidat a PRODUITS sur BigQuery (06/09) pour le compte owner (STARTS_WITH(location_id,"f10c3e58")) :
// 30/08 un produit, 07/08 deux produits. Le sujet est public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "item_absent_regular", action_priority: 2, action_category: "performance",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

const ONE_0830 = { n_items: 1, item_description: "Scottish Cream Scone", item_category: "Bakery", days_sold_60: 58, open_days_60: 60,
  expected_item_revenue: 18.39, items: [{ item_description: "Scottish Cream Scone", item_category: "Bakery", days_sold_60: 58, open_days_60: 60 }],
  items_expected_revenue: [18.39], delta_eur: -18 };
const TWO_0807 = { n_items: 2, item_description: "Scottish Cream Scone", item_category: "Bakery", days_sold_60: 57, open_days_60: 60,
  expected_item_revenue: 16.46, items: [{ item_description: "Scottish Cream Scone", item_category: "Bakery", days_sold_60: 57, open_days_60: 60 },
  { item_description: "Croissant", item_category: "Bakery", days_sold_60: 58, open_days_60: 60 }], items_expected_revenue: [16.46, 14.41], delta_eur: -31 };

describe("item_absent_regular — le produit nommé, la cause tue (règle 4)", () => {
  it("un produit : titre nommé, corps jours + CA habituel, geste stock + linéaire", () => {
    const t = render(ONE_0830, "2026-08-30");
    expect(t.what).toBe("Scottish Cream Scone absent de vos ventes");
    expect(t.sowhat).toBe("Scottish Cream Scone absent de vos ventes le 30/08 : vendu 58 jours sur 60 ces deux mois, 18 € par jour d’habitude.");
    expect(t.action).toBe("Action conseillée : vérifiez le stock de Scottish Cream Scone et sa place sur le linéaire — rupture, retrait ou oubli, la caisse ne dit pas lequel.");
    expect(t.action).not.toMatch(/rupture de stock|probablement/);
  });
  it("deux produits : compte au titre, les deux nommés au corps, CA entre parenthèses", () => {
    const t = render(TWO_0807, "2026-08-07");
    expect(t.what).toBe("2 produits réguliers absents de vos ventes");
    expect(t.sowhat).toBe("Scottish Cream Scone et Croissant absents de vos ventes le 07/08 : vendus 57 et 58 jours sur 60 ces deux mois (16 € et 14 € par jour d’habitude).");
    expect(t.action).toMatch(/^Action conseillée : vérifiez le stock de ces produits et leur place sur le linéaire/);
  });
  it("membre (clés « revenue » retirées) : la phrase se ferme sur les jours, sans €", () => {
    const { expected_item_revenue: _a, items_expected_revenue: _b, ...member } = ONE_0830;
    const t = render(member, "2026-08-30");
    expect(t.sowhat).toBe("Scottish Cream Scone absent de vos ventes le 30/08 : vendu 58 jours sur 60 ces deux mois.");
    expect(t.sowhat).not.toMatch(/€/);
  });
});
