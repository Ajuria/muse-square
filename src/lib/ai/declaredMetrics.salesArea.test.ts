// Surface de vente déclarée en chat (11/09, docs/espace-et-pole.md E4) — parseur à haute précision, store
// declared_parameters (jamais le journal des corrections), formes mixtes déclare-et-demande.
import { describe, expect, it } from "vitest";
import { parseAnyDeclaration, DECLARED_METRICS, metricForMissingDim } from "./declaredMetrics";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const parse = (s: string) => parseAnyDeclaration(norm(s));

describe("surface de vente déclarée", () => {
  it("déclarations acceptées, en m² ou m2, virgule décimale", () => {
    expect(parse("ma surface de vente est de 120 m²")).toMatchObject({ value: 120, with_question: false });
    expect(parse("Mon magasin fait 85 m2")).toMatchObject({ value: 85 });
    expect(parse("la surface du magasin : 62,5 m²")).toMatchObject({ value: 62.5 });
    const d = parse("notre surface commerciale fait environ 200 mètres carrés");
    expect(d?.spec.store).toBe("declared_parameters"); expect(d?.spec.param_key).toBe("sales_area_m2"); expect(d?.spec.correction_type).toBeNull();
    expect(d?.spec.formatValue(String(d.value))).toBe("200 m²");
  });
  it("jamais sur un autre espace ni sur une question seule", () => {
    expect(parse("j'ai 120 m² de linéaire")).toBeNull();
    expect(parse("ma réserve fait 30 m²")).toBeNull();
    expect(parse("quelle est ma surface de vente ?")).toBeNull();
    expect(parse("ma marge de manœuvre est de 3 m²")).toBeNull();
  });
  it("mixte déclare-et-demande : capture ET question", () => {
    expect(parse("ma surface de vente est de 120 m² : quelle est ma marge par m² ?")).toMatchObject({ value: 120, with_question: true });
  });
  it("la surface n'ouvre aucune dimension manquante ; les autres entrées gardent la leur", () => {
    expect(metricForMissingDim("marge")?.correction_type).toBe("declared_margin_pct");
    expect(DECLARED_METRICS.find((s) => s.param_key === "sales_area_m2")?.missing_dim).toBeNull();
  });
});
