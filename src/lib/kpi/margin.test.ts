// Marge brute mesurée — composition PURE (docs/catalogue-de-couts-et-marge.md M7-M9) et phrase du chat.
import { describe, expect, it } from "vitest";
import { composeMeasuredMargin, marginDisplayMode, MARGIN_COVERAGE_MIN } from "./margin";
import { measuredMarginAnswerFr } from "../context/contextCopy";
// Intl fr-FR sépare les milliers par une espace fine insécable : on compare sur les chiffres, pas sur l'espace.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

const site = [
  { date: "2026-09-01", revenue: 1000, revenue_costed: 950, revenue_net_ht_costed: 790, gross_margin_ht: 320, below_cost_lines: 1 },
  { date: "2026-09-02", revenue: 800, revenue_costed: 700, revenue_net_ht_costed: 580, gross_margin_ht: 240, below_cost_lines: 0 },
];
const fam = [
  { family: "Thé", revenue: 1200, revenue_net_ht: 1000, revenue_costed: 1150, revenue_net_ht_costed: 958, gross_margin_ht: 400, below_cost_lines: 1, below_cost_revenue_ht: 12 },
  { family: "Gâteaux", revenue: 600, revenue_net_ht: 500, revenue_costed: 500, revenue_net_ht_costed: 412, gross_margin_ht: 160, below_cost_lines: 0, below_cost_revenue_ht: null },
];

describe("composeMeasuredMargin", () => {
  it("somme le site, décide le mode par la couverture, trie les familles par CA", () => {
    const m = composeMeasuredMargin(site, fam, { start: "2026-08-04", end: "2026-09-02" });
    expect(m.revenue).toBe(1800); expect(m.revenue_costed).toBe(1650);
    expect(m.coverage_pct).toBe(91.7); expect(m.mode).toBe("mesure");
    expect(m.gross_margin_ht).toBe(560); expect(m.margin_rate_pct).toBe(41);   // 560 / 1370
    expect(m.below_cost_lines).toBe(1);
    expect(m.families.map((f) => f.family)).toEqual(["Thé", "Gâteaux"]);
    expect(m.families[0]).toMatchObject({ margin_rate_pct: 42, coverage_pct: 95.8, below_cost_lines: 1 });
  });
  it("sans prix d'achat : mode aucune, aucune marge inventée", () => {
    const m = composeMeasuredMargin([{ date: "2026-09-01", revenue: 500, revenue_costed: 0, revenue_net_ht_costed: 0, gross_margin_ht: 0, below_cost_lines: 0 }], [], { start: "a", end: "b" });
    expect(m.mode).toBe("aucune"); expect(m.gross_margin_ht).toBeNull(); expect(m.margin_rate_pct).toBeNull();
  });
  it("le seuil est celui de dbt (0,9) : 0,89 → mixte", () => {
    expect(MARGIN_COVERAGE_MIN).toBe(0.9);
    expect(marginDisplayMode(0.89)).toBe("mixte");
  });
});

describe("measuredMarginAnswerFr", () => {
  it("la couverture est dans la phrase, les familles listées, les ventes sous leur prix d'achat comptées", () => {
    const a = measuredMarginAnswerFr({
      gross_margin_ht: 19845.4, margin_rate_pct: 40, coverage_pct: 92, mode: "mesure", window_fr: "vos 30 derniers jours",
      families: [{ family: "Coffee", gross_margin_ht: 8120, margin_rate_pct: 42, coverage_pct: 95 }, { family: "Tea", gross_margin_ht: 3010, margin_rate_pct: 38, coverage_pct: 100 }],
      below_cost_lines: 3,
    });
    expect(plain(a.headline)).toBe("Marge brute : 19 845 € sur vos 30 derniers jours · calculée sur 92 % de votre CA");
    expect(a.answer).toContain("soit un taux de marge brute de 40 %");
    expect(a.answer).toContain("Calculée sur 92 % de votre CA · prix d'achat manquants sur 8 %.");
    expect(plain(a.answer)).toContain("- Coffee : 8 120 € de marge brute (taux 42 %), calculée sur 95 % de son CA");
    expect(plain(a.answer)).toContain("- Tea : 3 010 € de marge brute (taux 38 %)");
    expect(a.answer).toContain("3 lignes de vente vendues sous son prix d'achat sur la période.");
    expect(a.answer).not.toContain("marge déclarée");
  });
  it("mode mixte : la phrase dit que Piloter garde la marge déclarée à côté", () => {
    const a = measuredMarginAnswerFr({ gross_margin_ht: 500, margin_rate_pct: null, coverage_pct: 61.4, mode: "mixte", window_fr: "vos jours de week-end des 30 derniers jours", families: [], below_cost_lines: 0 });
    expect(a.answer).toContain("Calculée sur 61 % de votre CA · prix d'achat manquants sur 39 %.");
    expect(a.answer).toContain("Piloter garde aussi votre marge déclarée");
  });
});
