// Porte de merge (06/09) : la carte « Prix réalisé par famille » (family_price_move, grain FACTURE —
// mart fct_client_family_price_daily, bloc candidat ms_database). Payloads PRODUITS par le bloc sur
// BigQuery (06/09) pour le compte owner (STARTS_WITH(location_id,"f10c3e58")) : 30/08 baisse, 09/08 hausse.
// Le sujet est public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "family_price_move", action_priority: 2, action_category: "performance",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

const DOWN_0830 = { item_category: "Drinking Chocolate", units: 43, revenue: 167, realized_price: 3.87, price_baseline: 4.13, price_delta_pct: -6.3,
  price_z: -2.21, discount_rate: 0.035, discount_rate_baseline: 0.025, discount_delta_points: 0.9, is_discount_move: false, baseline_n: 28,
  direction: "collapse", delta_eur: -11 };
const UP_0809 = { item_category: "Bakery", units: 48, revenue: 201, realized_price: 4.19, price_baseline: 3.51, price_delta_pct: 19.5,
  price_z: 7.23, discount_rate: 0.018, discount_rate_baseline: 0.02, discount_delta_points: -0.2, is_discount_move: false, baseline_n: 28,
  direction: "surge", delta_eur: 33 };

describe("family_price_move — le prix dans son unité (€ par unité), la cause tue", () => {
  it("baisse : titre au sens, corps prix contre prix, geste tickets sans cause nommée", () => {
    const t = render(DOWN_0830, "2026-08-30");
    expect(t.what).toBe("Prix moyen en baisse sur Drinking Chocolate");
    expect(t.sowhat).toBe("Drinking Chocolate : 3,87 € par article le 30/08, contre 4,13 € d’habitude (−6 %). 43 articles vendus.");
    expect(t.action).toBe("Action conseillée : vérifiez les tickets du 30/08 sur Drinking Chocolate : remises, poids ou produits moins chers.");
  });
  it("hausse : « vendu plus cher », geste d'observation du mix", () => {
    const t = render(UP_0809, "2026-08-09");
    expect(t.what).toBe("Prix moyen en hausse sur Bakery");
    expect(t.sowhat).toBe("Bakery : 4,19 € par article le 09/08, contre 3,51 € d’habitude (+20 %). 48 articles vendus.");
    expect(t.action).toBe("Action conseillée : notez ce qui s’est vendu dans Bakery le 09/08.");
  });
  it("la remise n'entre que si le mart l'a vue bouger (is_discount_move)", () => {
    const t = render({ ...DOWN_0830, is_discount_move: true, discount_rate: 0.095, discount_rate_baseline: 0.019 }, "2026-08-30");
    expect(t.sowhat).toMatch(/ Remise 9,5 % contre 1,9 % d’habitude\.$/);
    expect(render(DOWN_0830, "2026-08-30").sowhat).not.toMatch(/Remise/);
  });
});
