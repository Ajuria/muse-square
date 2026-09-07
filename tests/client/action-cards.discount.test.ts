// Porte de merge (06/09) : la carte « Remise par famille » (family_discount_move, grain FACTURE — mart
// fct_client_family_price_daily, plancher 10 unités, bloc candidat ms_database). Le compte owner n'a AUCUN
// tir sur 30 j après le plancher (ses 3 tirs portaient sur 1 à 4 unités) ; le payload est celui que le bloc
// a PRODUIT sur BigQuery (06/09) pour le site Muse Square Occitanie — fixture de rendu, jamais une preuve
// sur la page owner. Le sujet est public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "family_discount_move", action_priority: 2, action_category: "performance",
    location_id: "ff2aeb35-0000-0000-0000-000000000000", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

const UP_0809 = { item_category: "Drinking Chocolate", units: 51, revenue: 211, discount_amount: 12.39, discount_rate: 0.059, discount_rate_baseline: 0.025,
  discount_delta_points: 3.4, discount_z: 2.1, realized_price: 4.14, price_baseline: 4.19, price_delta_pct: -1, is_price_move: false, baseline_n: 28,
  direction: "surge", delta_eur: -7 };

describe("family_discount_move — le taux en % du CA (forme de la carte site), la remise en €", () => {
  it("hausse : titre au sens, corps taux contre taux avec les €, geste tickets remisés", () => {
    const t = render(UP_0809, "2026-08-09");
    expect(t.what).toBe("Plus de remises que d’habitude sur Drinking Chocolate");
    expect(t.sowhat).toBe("Drinking Chocolate : 5,9 % de remise le 09/08, contre 2,5 % d’habitude (12 € sur 211 € de ventes). 51 articles vendus.");
    expect(t.action).toBe("Action conseillée : vérifiez les tickets remisés du 09/08 sur Drinking Chocolate : qui a remisé, sur quoi, et si c’était prévu.");
  });
  it("baisse : « remisé moins », geste d'observation", () => {
    const t = render({ ...UP_0809, discount_rate: 0.004, discount_delta_points: -2.1, direction: "collapse", delta_eur: 4 }, "2026-08-09");
    expect(t.what).toBe("Moins de remises que d’habitude sur Drinking Chocolate");
    expect(t.action).toBe("Action conseillée : notez ce qui s’est vendu sans remise dans Drinking Chocolate le 09/08.");
  });
  it("le prix réalisé n'entre que si le mart l'a vu bouger (is_price_move)", () => {
    expect(render(UP_0809, "2026-08-09").sowhat).not.toMatch(/Prix moyen/);
    expect(render({ ...UP_0809, is_price_move: true, price_delta_pct: -15.4 }, "2026-08-09").sowhat).toMatch(/ Prix moyen −15 %\.$/);
  });
  it("membre (clés « revenue » retirées) : la phrase tient sans les €", () => {
    const { revenue: _r, ...member } = UP_0809;
    expect(render(member, "2026-08-09").sowhat).toBe("Drinking Chocolate : 5,9 % de remise le 09/08, contre 2,5 % d’habitude. 51 articles vendus.");
  });
});
