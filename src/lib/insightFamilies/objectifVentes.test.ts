import { describe, it, expect } from "vitest";
import { objectifVentes } from "./objectifVentes";

// Données RÉELLES du payload monitor f10c3e58 (08/09) — sales_surge du 06/09 (extrait) et item_share_move.
const surge = { action_type: "sales_surge", decomposition: { gap_eur: 702.4, top_families: [
  { family: "Coffee", revenue: 685.9, expected_revenue: 358.66, delta_eur: 327.24, units: 228, baseline_units_per_day: 214.1 },
  { family: "Tea", revenue: 450, expected_revenue: 261, delta_eur: 189, units: 161 },
  { family: "Drinking Chocolate", revenue: 211, expected_revenue: 92, delta_eur: 119, units: 49 },
  { family: "Bakery", revenue: 192, expected_revenue: 113, delta_eur: 79, units: 55 },
  { family: "Packaged Chocolate", revenue: 0, expected_revenue: 7, delta_eur: -7, units: 0 },
] } };

describe("objectifVentes — l'objectif en ventes d'une carte ventes (owner 08/09)", () => {
  it("carte jour en hausse : écart € ÷ prix réalisé par famille, dans le sens du jour, trois lignes, total = ces trois", () => {
    const o = objectifVentes(surge)!;
    expect(o.estime).toBe(true); expect(o.sens).toBe("hausse");
    // Coffee 327,24 ÷ (685,9 ÷ 228 = 3,01) = 109 ; Tea 189 ÷ 2,80 = 68 ; DC 119 ÷ 4,31 = 28 ; Bakery 79 ÷ 3,49 = 23.
    expect(o.lignes).toEqual([{ label: "Coffee", ventes: 109 }, { label: "Tea", ventes: 68 }, { label: "Drinking Chocolate", ventes: 28 }]);
    expect(o.total).toBe(109 + 68 + 28);
  });
  it("le référent est l'attendu de la carte, jamais baseline_units_per_day (228 − 214 = 14 serait un autre référent)", () => {
    expect(objectifVentes(surge)!.lignes[0].ventes).not.toBe(14);
  });
  it("carte jour en baisse : ce qui a manqué, en positif", () => {
    const down = { decomposition: { gap_eur: -300, top_families: [
      { family: "Tea", revenue: 263, expected_revenue: 559, delta_eur: -296, units: 94 },
      { family: "Coffee", revenue: 700, expected_revenue: 650, delta_eur: 50, units: 230 },
    ] } };
    const o = objectifVentes(down)!;
    expect(o.sens).toBe("baisse"); expect(o.lignes).toEqual([{ label: "Tea", ventes: 106 }]); expect(o.total).toBe(106);
  });
  it("carte produit : une ligne, prix unitaire du payload", () => {
    const item = { action_type: "item_share_move", data_payload: { item_description: "Our Old Time Diner Blend Lg", item_revenue: 78, expected_item_revenue: 30, unit_price: 3, units: 26 } };
    expect(objectifVentes(item)).toEqual({ estime: true, sens: "hausse", total: 16, lignes: [{ label: "Our Old Time Diner Blend Lg", ventes: 16 }] });
  });
  it("sans unités ni prix (offering_mix_shift, item_absent_regular, cartes non ventes) → null, jamais un nombre inventé", () => {
    expect(objectifVentes({ action_type: "offering_mix_shift", data_payload: { item_category: "Tea", family_revenue: 263, expected_family_revenue: 559, delta_eur: -296 } })).toBeNull();
    expect(objectifVentes({ action_type: "item_absent_regular", data_payload: { item_description: "Ginger Scone", expected_item_revenue: 17.92, delta_eur: -18 } })).toBeNull();
    expect(objectifVentes({ action_type: "weather_hazard_onset", data_payload: {} })).toBeNull();
    expect(objectifVentes(null)).toBeNull();
  });
});
