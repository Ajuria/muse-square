// Provider marge — composition PURE (docs/catalogue-de-couts-et-marge.md M7-M9) : absence sous le seuil,
// faits avec la couverture, famille lourde en CA et légère en marge.
import { describe, expect, it } from "vitest";
import { composeMargeFamily } from "./marge";
import type { MeasuredMargin30d } from "../kpi/margin";

const base: MeasuredMargin30d = {
  window: { start: "2026-08-13", end: "2026-09-11", days: 28 },
  revenue: 53461, revenue_costed: 49184, revenue_net_ht_costed: 41000, gross_margin_ht: 19845.4, margin_rate_pct: 48,
  coverage: 0.92, coverage_pct: 92, mode: "mesure", below_cost_lines: 3,
  families: [
    { family: "Coffee", revenue: 20000, revenue_net_ht: 16700, revenue_costed: 19000, gross_margin_ht: 9000, margin_rate_pct: 57, coverage_pct: 95, below_cost_lines: 1, below_cost_revenue_ht: 12 },
    { family: "Branded", revenue: 12000, revenue_net_ht: 10000, revenue_costed: 12000, gross_margin_ht: 2000, margin_rate_pct: 20, coverage_pct: 100, below_cost_lines: 2, below_cost_revenue_ht: 40 },
    { family: "Tea", revenue: 8000, revenue_net_ht: 6700, revenue_costed: 8000, gross_margin_ht: 4000, margin_rate_pct: 60, coverage_pct: 100, below_cost_lines: 0, below_cost_revenue_ht: null },
  ],
};
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("composeMargeFamily", () => {
  it("mesure : lead, couverture comme fait à part, familles, famille lourde en CA légère en marge, ventes sous le prix d'achat", () => {
    const r = composeMargeFamily(base, "2026-09-11");
    expect(r.found).toBe(true);
    expect(plain(String(r.data.lead))).toBe("Marge brute : 19 845 € sur vos 30 derniers jours · taux de marge brute 48 % · calculée sur 92 % de votre CA");
    const facts = r.facts.map((f) => plain(f.fact_fr));
    expect(facts[0]).toBe("Sur vos 30 derniers jours (du 13/08/2026 au 11/09/2026), votre marge brute est de 19 845 €, soit un taux de marge brute de 48 %.");
    expect(facts[1]).toBe("Cette marge brute est calculée sur 92 % de votre CA · prix d'achat manquants sur 8 %.");
    expect(facts).toContain("Coffee : 9 000 € de marge brute sur vos 30 derniers jours (taux 57 %), calculée sur 95 % de son CA.");
    // Branded : 22,4 % du CA, 10,1 % de la marge → lourde en CA, légère en marge.
    expect(facts).toContain("Branded pèse 22,4 % de votre CA mais 10,1 % de votre marge brute.");
    expect(r.data.heavy_light).toBe("Branded");
    expect(facts).toContain("3 lignes de vente vendues sous son prix d'achat sur vos 30 derniers jours.");
    expect((r.data.families as any[]).map((f) => f.family)).toEqual(["Coffee", "Branded", "Tea"]);
  });
  it("sans prix d'achat ou sous 50 % : absence, aucun fait, aucun chiffre", () => {
    expect(composeMargeFamily({ ...base, mode: "aucune", gross_margin_ht: null, coverage_pct: null }, "2026-09-11")).toMatchObject({ found: false, facts: [] });
    expect(composeMargeFamily({ ...base, mode: "estime", coverage_pct: 40 }, "2026-09-11").found).toBe(false);
  });
});
