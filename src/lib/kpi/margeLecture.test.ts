import { describe, expect, it } from "vitest";
import { composeMargeLecture, joursDeLaQuestion, joursFilter } from "./margeLecture";
import type { MeasuredMargin30d } from "./margin";

const nb = (s: string) => s.replace(/[  ]/g, " ");
const mesure = (over: Partial<MeasuredMargin30d> = {}): MeasuredMargin30d => ({
  window: { start: "2026-08-14", end: "2026-09-12", days: 30 },
  revenue: 50000, revenue_costed: 46000, revenue_net_ht_costed: 41800,
  gross_margin_ht: 30000, margin_rate_pct: 72, coverage: 0.92, coverage_pct: 92, mode: "mesure", below_cost_lines: 3,
  families: [
    { family: "Épices", revenue: 30000, revenue_net_ht: 27000, revenue_costed: 29000, gross_margin_ht: 20000, margin_rate_pct: 74, coverage_pct: 96.7, below_cost_lines: 1, below_cost_revenue_ht: 10 },
    { family: "Thés", revenue: 20000, revenue_net_ht: 18000, revenue_costed: 17000, gross_margin_ht: 10000, margin_rate_pct: 60, coverage_pct: 85, below_cost_lines: 2, below_cost_revenue_ht: 20 },
  ],
  ...over,
});
const aucune = (): MeasuredMargin30d => mesure({ revenue_costed: 0, revenue_net_ht_costed: null, gross_margin_ht: null, margin_rate_pct: null, coverage: 0, coverage_pct: 0, mode: "aucune", families: mesure().families.map((f) => ({ ...f, gross_margin_ht: null, margin_rate_pct: null, coverage_pct: 0 })) });

describe("margeLecture — les jours", () => {
  it("joursFilter : le SQL de la lecture et la fenêtre nommée", () => {
    expect(joursFilter(null)).toEqual({ sql: "", fr: "vos 30 derniers jours" });
    expect(joursFilter("week_end")).toEqual({ sql: " AND EXTRACT(DAYOFWEEK FROM date) IN (1, 7)", fr: "vos jours de week-end des 30 derniers jours" });
    expect(joursFilter("samedi")).toEqual({ sql: " AND EXTRACT(DAYOFWEEK FROM date) = 7", fr: "vos samedis des 30 derniers jours" });
  });
  it("joursDeLaQuestion : « le week-end », « les samedis », rien", () => {
    expect(joursDeLaQuestion("Quelle est ma marge le week-end ?")).toBe("week_end");
    expect(joursDeLaQuestion("ma marge les samedis")).toBe("samedi");
    expect(joursDeLaQuestion("Quelle est ma marge ?")).toBeNull();
  });
});

describe("margeLecture — la mesure d'abord, sinon l'estimation déclarée, sinon l'absence", () => {
  it("mode mesure : la carte renderMarge et les faits de composeMargeFamily, la fenêtre nommée", () => {
    const l = composeMargeLecture(mesure(), { familles: [], globale: null }, "2026-09-12", "week_end");
    expect(l.mode).toBe("mesure");
    expect(l.blocks[0]).toMatchObject({ type: "card", render: "renderMarge" });
    expect(nb(l.result.facts[0].fact_fr)).toBe("Sur vos jours de week-end des 30 derniers jours (du 14/08/2026 au 12/09/2026), votre marge brute est de 30 000 €, soit un taux de marge brute de 72 %.");
  });
  it("sans prix d'achat mais des marges déclarées par famille : l'estimation famille par famille, sur le CA de la même lecture, couverture dite", () => {
    const l = composeMargeLecture(aucune(), { familles: [{ slug: "epices", pct: 60, famille: "Épices" }], globale: { pct: 50, declarant_name: "Nadia", corrected_at: "2026-09-01" } }, "2026-09-12", null);
    expect(l.mode).toBe("declaree_familles");
    expect(nb(l.result.facts[0].fact_fr)).toBe("Marge estimée : ≈ 18 000 € sur vos 30 derniers jours — calculée sur 60 % de votre CA");
    expect(nb(l.result.facts.map((f) => f.fact_fr).join("\n"))).toContain("Épices : 30 000 € × 60 % = ≈ 18 000 €");
    expect(nb(l.result.facts.map((f) => f.fact_fr).join("\n"))).toContain("Le CA restant (20 000 €) n'est pas compté");
    expect(l.blocks.map((b) => b.type)).toEqual(["prose", "facts", "sources"]);
    expect(l.blocks.some((b) => b.type === "card")).toBe(false);
  });
  it("sans famille déclarée, la marge moyenne déclarée : CA × %, attribuée", () => {
    const l = composeMargeLecture(aucune(), { familles: [], globale: { pct: 50, declarant_name: "Nadia", corrected_at: "2026-09-01" } }, "2026-09-12", null);
    expect(l.mode).toBe("declaree_globale");
    expect(nb(l.result.facts[0].fact_fr)).toBe("Marge estimée : ≈ 25 000 € sur vos 30 derniers jours");
    expect(nb(l.result.facts[1].fact_fr)).toContain("déclarée par Nadia le 01/09/2026");
  });
  it("rien : l'absence, avec le geste d'import", () => {
    const l = composeMargeLecture(aucune(), { familles: [], globale: null }, "2026-09-12", null);
    expect(l.mode).toBe("aucune");
    expect(l.result.found).toBe(false);
    expect(l.blocks[0]).toMatchObject({ type: "absence", geste: { label_fr: "Importer vos prix d'achat" } });
  });
});
