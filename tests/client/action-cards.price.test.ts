// Porte de merge (06/09) : la carte « Prix réalisé par famille » (family_price_move, grain FACTURE —
// mart fct_client_family_price_daily, bloc candidat ms_database). Payloads PRODUITS par le bloc sur
// BigQuery (06/09) pour le compte owner (STARTS_WITH(location_id,"f10c3e58")) : 30/08 baisse, 09/08 hausse.
// Le sujet est public/js/action-cards.js → tests/ (CLAUDE.md § Tests).
// 08/09 (5caff6e6, owner) : « N articles vendus » → « N ventes » — « articles » se lisait comme des références produit.
//
// 10/09 — deux corrections dans le même passage.
// (a) Deux assertions étaient ROUGES depuis le 08/09 : la carte dit « 43 ventes » depuis que
//     « articles » a été retiré (owner 08/09, lexique § le compte de ventes d'un jour), le test
//     disait encore « 43 articles vendus ». Un test rouge qu'on laisse rouge n'est pas un test.
// (b) L'UNITÉ : realized_price = CA / unités, unités = Σ quantity_decimal. Sur une famille vendue
//     au poids, c'est un prix au kilo et « ventes » compte des kilos — « par article » ment.
//     Le mart porte le fait mesuré has_fractional_units ; sans le drapeau, rien ne change.
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
    expect(t.sowhat).toBe("Drinking Chocolate : 3,87 € par article le 30/08, contre 4,13 € d’habitude (−6 %). 43 ventes.");
    expect(t.action).toBe("Action conseillée : vérifiez les tickets du 30/08 sur Drinking Chocolate : remises, poids ou produits moins chers.");
  });
  it("hausse : « vendu plus cher », geste d'observation du mix", () => {
    const t = render(UP_0809, "2026-08-09");
    expect(t.what).toBe("Prix moyen en hausse sur Bakery");
    expect(t.sowhat).toBe("Bakery : 4,19 € par article le 09/08, contre 3,51 € d’habitude (+20 %). 48 ventes.");
    expect(t.action).toBe("Action conseillée : notez ce qui s’est vendu dans Bakery le 09/08.");
  });
  it("la remise n'entre que si le mart l'a vue bouger (is_discount_move)", () => {
    const t = render({ ...DOWN_0830, is_discount_move: true, discount_rate: 0.095, discount_rate_baseline: 0.019 }, "2026-08-30");
    expect(t.sowhat).toMatch(/ Remise 9,5 % contre 1,9 % d’habitude\.$/);
    expect(render(DOWN_0830, "2026-08-30").sowhat).not.toMatch(/Remise/);
  });
});

// ── 10/09 — l'unité ne s'affirme que si elle est prouvée ─────────────────────────────────────
// Famille vendue au poids : le ticket Crisalid d'Épices et Tout du 09/09 porte « kg » et « €/kg »
// (0,740 · 0,170 · 0,745 kg). units est alors une somme de kilos, realized_price un prix au kilo.
const POIDS_0830 = { ...DOWN_0830, item_category: "Fruits et légumes", units: 246.4, revenue: 954,
  realized_price: 3.87, price_baseline: 4.13, price_delta_pct: -6.3, has_fractional_units: true };

describe("family_price_move — l'unité de quantité", () => {
  it("famille au poids : ni « par article », ni un compte de ventes qui compterait des kilos", () => {
    const t = render(POIDS_0830, "2026-08-30");
    expect(t.sowhat).not.toMatch(/par article/);
    expect(t.sowhat).not.toMatch(/\b\d[\d\s\u202f]* ventes\b/); // un COMPTE de ventes ; « 954 € de ventes » (CA) reste permis
    expect(t.sowhat).not.toMatch(/246/);          // ni les kilos pris pour des articles
    expect(t.sowhat).not.toMatch(/3,87|4,13/);    // ni un prix dont l'unité n'est pas nommable
    expect(t.sowhat).toBe("Fruits et légumes : prix moyen −6 % le 30/08 par rapport à votre prix habituel, sur 954 € de ventes.");
    expect(t.what).toBe("Prix moyen en baisse sur Fruits et légumes");
  });

  it("hausse au poids : même forme, signe inversé", () => {
    const t = render({ ...POIDS_0830, price_delta_pct: 19.5, direction: "surge" }, "2026-08-09");
    expect(t.sowhat).toBe("Fruits et légumes : prix moyen +20 % le 09/08 par rapport à votre prix habituel, sur 954 € de ventes.");
  });

  it("« d’habitude » ne suit jamais « par rapport à » (faute relevée à l’audit 10/09 : locution adverbiale, pas un nom)", () => {
    expect(render(POIDS_0830, "2026-08-30").sowhat).not.toMatch(/par rapport à d.habitude/);
  });

  it("écart absent au poids : la phrase de repli déjà en prod, mot à mot", () => {
    expect(render({ ...POIDS_0830, price_delta_pct: null }, "2026-08-30").sowhat).toBe("Fruits et légumes : prix moyen inhabituel ce jour-là.");
  });

  it("la remise reste dite au poids : son unité à elle (% du CA) est connue", () => {
    const t = render({ ...POIDS_0830, is_discount_move: true, discount_rate: 0.095, discount_rate_baseline: 0.019 }, "2026-08-30");
    expect(t.sowhat).toMatch(/ Remise 9,5 % contre 1,9 % d’habitude\.$/);
  });

  it("DRAPEAU ABSENT = comportement d'avant, mot à mot (aucune régression sur les 4 sites réels)", () => {
    const avant = "Drinking Chocolate : 3,87 € par article le 30/08, contre 4,13 € d’habitude (−6 %). 43 ventes.";
    expect(render(DOWN_0830, "2026-08-30").sowhat).toBe(avant);
    expect(render({ ...DOWN_0830, has_fractional_units: false }, "2026-08-30").sowhat).toBe(avant);
    // Un drapeau qui n'est pas exactement true ne déclenche rien : pas de coercition.
    expect(render({ ...DOWN_0830, has_fractional_units: null }, "2026-08-30").sowhat).toBe(avant);
  });
});
