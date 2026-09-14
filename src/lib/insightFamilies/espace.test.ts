// Provider espace — composition PURE (docs/espace-et-pole.md E4-E6) sur la forme que listPoleSpace rend.
import { describe, expect, it } from "vitest";
import { composeEspaceFamily } from "./espace";
import type { PoleSpaceRow } from "../dispositifs/poleReading";

const row = (o: Partial<PoleSpaceRow>): PoleSpaceRow => ({
  grain: "pole", pole_id: null, pole_label: null, family: null, window_start: null, window_end: null,
  linear_m: null, linear_share: null, surface_m2: null, n_components: null, revenue: null, revenue_net_ht: null, revenue_share: null, margin_share: null,
  coverage_pct: null, revenue_per_m: null, revenue_net_ht_per_m: null, margin_per_m: null, revenue_per_m2: null, revenue_net_ht_per_m2: null, margin_per_m2: null, ...o,
});
const poles = [{ dispositif_id: "cave", name: "Cave" }, { dispositif_id: "cuisine", name: "Cuisine" }, { dispositif_id: "maison", name: "Maison" }];
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("composeEspaceFamily", () => {
  it("sans vente : mètres et Part de linéaire, aucune vente dite, aucun € par mètre inventé", () => {
    const r = composeEspaceFamily(poles, [
      row({ grain: "site", linear_m: 202.21, linear_share: 1 }),
      row({ pole_id: "cave", pole_label: "Cave", linear_m: 23.62, linear_share: 0.117 }),
      row({ pole_id: "cuisine", pole_label: "Cuisine", linear_m: 42.89, linear_share: 0.212 }),
    ], "2026-09-11");
    expect(r.found).toBe(true);
    expect(plain(String(r.data.lead))).toBe("202,2 m de linéaire mesurés sur 2 pôles");
    expect(r.facts.map((f) => plain(f.fact_fr))).toEqual([
      "Votre linéaire mesuré fait 202,2 m sur 2 pôles.",
      "Cuisine : 42,9 m de linéaire (Part de linéaire 21,2 %) · aucune vente rapportée à ce pôle sur 30 jours.",
      "Cave : 23,6 m de linéaire (Part de linéaire 11,7 %) · aucune vente rapportée à ce pôle sur 30 jours.",
    ]);
    expect((r.data.poles as any[]).map((p) => p.name)).toEqual(["Cuisine", "Cave"]);   // Maison sans mesure n'apparaît pas
  });
  it("avec ventes : € par mètre, part de marge contre Part de linéaire, pôle lourd en linéaire léger en CA", () => {
    const r = composeEspaceFamily(poles, [
      row({ grain: "site", linear_m: 100, surface_m2: 120, revenue_per_m: 300, margin_per_m: 110, window_start: "2026-08-13", window_end: "2026-09-11" }),
      row({ pole_id: "cave", pole_label: "Cave", linear_m: 40, linear_share: 0.4, revenue_share: 0.2, margin_share: 0.25, revenue_per_m: 150 }),
      row({ pole_id: "cuisine", pole_label: "Cuisine", linear_m: 60, linear_share: 0.6, revenue_share: 0.8, margin_share: 0.75, revenue_per_m: 400 }),
    ], "2026-09-11");
    expect(plain(String(r.data.lead))).toBe("100 m de linéaire mesurés sur 2 pôles · 120 m² de surface de vente · Cuisine génère le plus de CA par mètre (400 €)");
    const facts = r.facts.map((f) => plain(f.fact_fr));
    expect(facts).toContain("Cave : 40 m de linéaire (Part de linéaire 40 %) · 150 € de CA par mètre sur 30 jours · 20 % du CA · part de marge 25 % contre Part de linéaire 40 %.");
    expect(facts).toContain("Cave occupe 40 % de votre linéaire pour 20 % de votre CA.");
    expect(r.data.heavy).toBe("Cave");
  });
  it("aucun pôle mesuré : absence", () => {
    expect(composeEspaceFamily(poles, [], "2026-09-11")).toMatchObject({ found: false, facts: [] });
  });
});
