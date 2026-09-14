// 11/09 — l'importeur porte le type de document, le CA HT et le taux de TVA (docs/catalogue-de-couts-et-marge.md,
// décision owner 2). Le taux s'écrit en FRACTION : dbt divise revenue par (1 + vat_rate).
import { describe, expect, it } from "vitest";
import { validateGrid, parseVatRate } from "./salesCsv";
import { resolveMapping } from "./sourceMappings";

describe("parseVatRate", () => {
  it("pour cent → fraction ; fraction gardée ; hors bornes → null", () => {
    expect(parseVatRate("20")).toBe(0.2);
    expect(parseVatRate("20 %")).toBe(0.2);
    expect(parseVatRate("5,5")).toBe(0.055);
    expect(parseVatRate("0,2")).toBe(0.2);
    expect(parseVatRate("1")).toBe(1);
    expect(parseVatRate("-3")).toBeNull();
    expect(parseVatRate("250")).toBeNull();
    expect(parseVatRate("")).toBeNull();
  });
});

describe("validateGrid : document_type, revenue_ht, vat_rate", () => {
  const mapping = resolveMapping("crisalid");
  it("les trois colonnes sont lues quand l'export les donne, en plus du CA", () => {
    const grid = [
      ["Date", "Type de document", "Montant TTC", "Montant HT", "TVA", "Famille"],
      ["10/09/2026", "TKT", "12,00", "10,00", "20", "Thé"],
      ["10/09/2026", "IVD", "3,50", "2,92", "20 %", "Gâteaux"],
      ["10/09/2026", "", "8,00", "", "", "Épices"],
    ];
    const v = validateGrid(grid, mapping, { today: "2026-09-11" });
    expect(v.missing_required).toEqual([]);
    expect(v.accepted.length).toBe(3);
    expect(v.accepted[0]).toMatchObject({ revenue: 12, document_type: "TKT", revenue_ht: 10, vat_rate: 0.2, item_category: "Thé" });
    expect(v.accepted[1]).toMatchObject({ document_type: "IVD", revenue_ht: 2.92, vat_rate: 0.2 });
    expect(v.accepted[2].document_type).toBeUndefined();
    expect(v.accepted[2].revenue_ht).toBeUndefined();
    expect(v.accepted[2].vat_rate).toBeUndefined();
  });
  it("sans ces colonnes, rien ne change : le CA seul suffit", () => {
    const v = validateGrid([["Date", "CA"], ["10/09/2026", "100"]], mapping, { today: "2026-09-11" });
    expect(v.accepted[0]).toEqual({ row: 2, date: "2026-09-10", revenue: 100 });
  });
});
