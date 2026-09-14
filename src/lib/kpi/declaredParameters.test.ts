import { describe, it, expect } from "vitest";
import { parseFrNumber, parseEffectiveFrom, validateValue, currentByKey, parameterSpec, PARAMETER_KEYS, type DeclaredParameterRow } from "./declaredParameters";

const row = (p: Partial<DeclaredParameterRow>): DeclaredParameterRow => ({
  parameter_id: "x", location_id: "loc", param_key: "fixed_costs_month_eur", value_num: 1, value_text: null, unit: "€ par mois",
  effective_from: "2026-01-01", declarant_user_id: null, source: "test", created_at: "2026-01-01T00:00:00Z", ...p,
});

describe("declaredParameters — lecture des valeurs françaises", () => {
  it("lit un nombre français avec espaces, virgule et unité", () => {
    expect(parseFrNumber("8 500")).toBe(8500);
    expect(parseFrNumber("8500,50 €")).toBe(8500.5);
    expect(parseFrNumber("120 m²")).toBe(120);
    expect(parseFrNumber("abc")).toBeNull();
  });
  it("lit une date JJ/MM/AAAA et la forme interne, refuse une date fausse", () => {
    expect(parseEffectiveFrom("01/03/2026")).toBe("2026-03-01");
    expect(parseEffectiveFrom("2026-03-01")).toBe("2026-03-01");
    expect(parseEffectiveFrom("31/02/2026")).toBeNull();
    expect(parseEffectiveFrom("mars 2026")).toBeNull();
  });
  it("borne les montants et n'admet que HT ou TTC pour la base", () => {
    expect(validateValue(parameterSpec("fixed_costs_month_eur")!, "8 500")).toEqual({ value_num: 8500, value_text: null });
    expect(() => validateValue(parameterSpec("sales_area_m2")!, "0")).toThrow(/surface de vente/);
    expect(validateValue(parameterSpec("revenue_basis")!, "ht")).toEqual({ value_num: null, value_text: "HT" });
    expect(() => validateValue(parameterSpec("revenue_basis")!, "net")).toThrow(/HT ou TTC/);
  });
  it("expose la liste fermée de dbt", () => {
    expect(PARAMETER_KEYS).toEqual(["fixed_costs_month_eur", "payroll_month_eur", "sales_area_m2", "revenue_basis"]);
  });
});

describe("currentByKey — la règle de dbt à l'identique", () => {
  it("prend la dernière date d'effet <= la date, départage created_at", () => {
    const rows = [
      row({ parameter_id: "a", value_num: 8000, effective_from: "2026-01-01", created_at: "2026-01-01T10:00:00Z" }),
      row({ parameter_id: "b", value_num: 8500, effective_from: "2026-03-01", created_at: "2026-02-20T10:00:00Z" }),
      row({ parameter_id: "c", value_num: 8600, effective_from: "2026-03-01", created_at: "2026-02-25T10:00:00Z" }),
      row({ parameter_id: "d", value_num: 9000, effective_from: "2026-10-01", created_at: "2026-09-11T10:00:00Z" }),
    ];
    expect(currentByKey(rows, "2026-02-15").fixed_costs_month_eur?.parameter_id).toBe("a");
    expect(currentByKey(rows, "2026-03-01").fixed_costs_month_eur?.parameter_id).toBe("c");
    expect(currentByKey(rows, "2026-09-11").fixed_costs_month_eur?.parameter_id).toBe("c");
    expect(currentByKey(rows, "2026-10-01").fixed_costs_month_eur?.parameter_id).toBe("d");
  });
  it("ignore une déclaration à effet futur", () => {
    expect(currentByKey([row({ effective_from: "2099-01-01" })], "2026-09-11").fixed_costs_month_eur).toBeUndefined();
  });
});
