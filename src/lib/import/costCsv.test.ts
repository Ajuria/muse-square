import { describe, it, expect } from "vitest";
import { parseCostCsv, validateCostGrid, parseCostUnit, mapCostHeaders } from "./costCsv";

const enc = (s: string) => new TextEncoder().encode(s);

describe("costCsv — fichier de prix d'achat aux standards français", () => {
  it("lit un fichier ; virgule décimale, JJ/MM/AAAA, sans date = date d'import", () => {
    const r = parseCostCsv(enc("Code article;Libellé;Prix d'achat HT;Date d'effet;Fournisseur\nA1;Zaatar 40 g;2,35;01/03/2026;Maison X\nA2;Huile;7 500,5;;\n"), { today: "2026-09-11" });
    expect(r.missing_required).toEqual([]);
    expect(r.accepted).toHaveLength(2);
    expect(r.accepted[0]).toMatchObject({ item_code: "A1", unit_cost_ht: 2.35, effective_from: "2026-03-01", supplier: "Maison X", cost_unit: "piece" });
    expect(r.accepted[1]).toMatchObject({ item_code: "A2", unit_cost_ht: 7500.5, effective_from: "2026-09-11", supplier: null });
  });
  it("refuse le fichier sans code article ou sans prix ; rejette les lignes fausses avec un motif français", () => {
    expect(validateCostGrid([["Libellé", "Prix d'achat"], ["x", "1"]]).missing_required).toEqual(["item_code"]);
    const r = validateCostGrid([["code", "PA HT", "date"], ["", "1", ""], ["B", "abc", ""], ["C", "0", ""], ["D", "1,5", "31/02/2026"], ["E", "2", "01/03/2026"], ["E", "3", "01/03/2026"]], { today: "2026-09-11" });
    expect(r.accepted.map((a) => a.item_code)).toEqual(["E"]);
    expect(r.rejected.map((x) => x.code)).toEqual(["ITEM_CODE_MISSING", "COST_INVALID", "COST_NOT_POSITIVE", "DATE_INVALID", "DUPLICATE"]);
    expect(r.rejected[3].reason).toMatch(/JJ\/MM\/AAAA/);
  });
  it("reconnaît l'unité kg et les en-têtes accentués", () => {
    expect(parseCostUnit("au kg")).toBe("kg"); expect(parseCostUnit("pièce")).toBe("piece"); expect(parseCostUnit(undefined)).toBe("piece");
    const m = mapCostHeaders(["Référence", "Désignation", "Coût d'achat", "Unité"]);
    expect(m.columnsDetected.sort()).toEqual(["cost_unit", "item_code", "item_description", "unit_cost_ht"]);
  });
});
