import { describe, expect, it } from "vitest";
import { composePontDeMarge, periodeLue, type FamillePeriode } from "./pontDeMarge";

const f = (family: string, units: number, net: number, cost: number, costedShare = 1): FamillePeriode => ({ family, units, revenue: net * 1.2, discount: 0, revenue_net_ht: net, revenue_costed: net * 1.2 * costedShare, revenue_net_ht_costed: net * costedShare, cost_ht: cost, gross_margin_ht: net * costedShare - cost, units_costed: units * costedShare });
const a = periodeLue("2026-07-01", "2026-07-31", "juillet"), b = periodeLue("2026-08-01", "2026-08-31", "août");

describe("pont de marge — la somme des quatre effets est l'écart, exactement", () => {
  it("volume + mix + prix de vente + prix d'achat = marge B − marge A, sur des familles costées ; une famille non costée sort du pont", () => {
    const A = [f("Épices", 100, 1000, 400), f("Thés", 50, 500, 250), f("Branded", 10, 80, 0, 0)];
    const B = [f("Épices", 120, 1320, 540), f("Thés", 40, 400, 180), f("Branded", 12, 100, 0, 0)];
    const r = composePontDeMarge(A, B, a, b);
    expect(r.found).toBe(true);
    expect(Math.round(r.marge_a)).toBe(850); expect(Math.round(r.marge_b)).toBe(1000);
    const somme = r.effets.reduce((s, e) => s + e.montant, 0);
    expect(Math.abs(somme - r.ecart)).toBeLessThan(1e-6);
    expect(r.hors_pont).toEqual([{ family: "Branded", revenue_a: 96, revenue_b: 120 }]);
    expect(r.effets.map((e) => e.cle)).toEqual(["volume", "mix", "prix_vente", "prix_achat"]);
    // Volume : (160/150 − 1) × 850 = +56,67 ; le reste se répartit, la somme tient.
    expect(Math.round(r.effets[0].montant * 100) / 100).toBe(56.67);
    expect(r.familles[0].family).toBe("Épices");
  });
  it("sans famille costée sur les deux périodes : l'absence avec le geste d'import", () => {
    const r = composePontDeMarge([f("X", 10, 100, 0, 0)], [f("X", 12, 120, 0, 0)], a, b);
    expect(r.found).toBe(false);
    expect(r.blocks[0]).toMatchObject({ type: "absence", geste: { label_fr: "Importer vos prix d'achat" } });
  });
});
