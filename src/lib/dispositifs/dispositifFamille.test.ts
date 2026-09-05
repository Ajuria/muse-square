// I8 — les blocs « dispositif × famille » (pur, fixture) : libellés owner 04/09, écart relatif
// aussi pour la part (jamais « pp »), planchers en « — », phrase de tête sur le KPI demandé,
// mix trié et familles nommées en gras. Chaque assertion vue tomber par mutation.
import { describe, it, expect } from "vitest";
import { buildDispositifFamilleBlocks, type DispositifFamilleReading } from "./dispositifFamille";

const op = { kind: "operation" as const, id: "sid-1", name: "Corner de vente producteur", families: [] };
const coffee = { kind: "famille" as const, id: null, name: "Coffee", families: ["Coffee"] };

function reading(kpi: DispositifFamilleReading["kpi_demande"]): DispositifFamilleReading {
  return {
    operation: op, familles: [coffee], start: "2026-08-01", end: "2026-08-31", kpi_demande: kpi,
    operation_blocks: { headline: "x", prose: "Sur la période : 3 verdicts rendus, 0 objectif atteint.\n\nCe qui bouge…", table: { cols: [], rows: [{ cells: [] }] }, funnel_table: { cols: [], rows: [{ cells: [] }] }, sources: ["Vos engagements (verdicts et mesures)"] },
    familles_reading: [{ famille: "Coffee", steps: [
      { step: "ventes", occ_value: 140, base_value: 100, delta_pct: 40, occ_days: 4, base_days: 13 },
      { step: "panier", occ_value: 4.7, base_value: 4.87, delta_pct: -3.5, occ_days: 4, base_days: 13 },
      { step: "ca", occ_value: 658, base_value: 487, delta_pct: 35.1, occ_days: 4, base_days: 13 },
      { step: "part", occ_value: 0.421, base_value: 0.385, delta_pct: 9.4, occ_days: 4, base_days: 13 },
    ] }],
    mix: [
      // Tea AVANT Coffee : le tri par écart doit remettre Coffee en tête (mutation du tri vue rouge).
      { famille: "Tea", occ_share: 0.25, base_share: 0.30, delta_pct: -16.7, occ_days: 4, base_days: 13 },
      { famille: "Coffee", occ_share: 0.421, base_share: 0.385, delta_pct: 9.4, occ_days: 4, base_days: 13 },
      { famille: "Branded", occ_share: 0.005, base_share: 0.004, delta_pct: null, occ_days: 4, base_days: 13 },
    ],
  };
}

describe("buildDispositifFamilleBlocks", () => {
  it("titre × famille, période ; libellés owner ; part en % et écart relatif", () => {
    const b = buildDispositifFamilleBlocks(reading("mix"));
    expect(b.headline).toBe("Corner de vente producteur × famille Coffee — du 01/08/2026 au 31/08/2026");
    const fam = b.sections.find((s) => s.title === "Famille Coffee pendant l'opération");
    expect(fam.table.rows.map((r: any) => r.cells[0].v)).toEqual(["Ventes/jour avec Coffee", "Panier moyen avec Coffee", "CA/jour Coffee", "Part de Coffee dans le CA"]);
    expect(fam.table.rows[3].cells[1].v).toBe("42,1 %");
    expect(fam.table.rows[3].cells[3].v).toBe("+9,4 %");
    expect(fam.table.rows[1].cells[1].v).toBe("4,70 €");
    expect(JSON.stringify(b)).not.toMatch(/\bpp\b/);
  });
  it("le KPI demandé ouvre la phrase (« au lieu de »), puis ce qui bouge / ce qui ne suit pas", () => {
    const b = buildDispositifFamilleBlocks(reading("basket"));
    const fam = b.sections.find((s) => s.title === "Famille Coffee pendant l'opération");
    expect(fam.facts[0]).toBe("Panier moyen avec Coffee pendant l'opération : 4,70 € au lieu de 4,87 € (−3,5 %).");
    expect(fam.facts[1]).toBe("Ce qui bouge pendant l'opération pour la famille Coffee : Ventes/jour avec Coffee +40 %, CA/jour Coffee +35,1 %, Part de Coffee dans le CA +9,4 % · ce qui ne suit pas : Panier moyen avec Coffee −3,5 %.");
  });
  it("mix : tournure owner, tri par écart, famille nommée en gras, petites familles regroupées", () => {
    const b = buildDispositifFamilleBlocks(reading(null));
    const mix = b.sections.find((s) => /^Vos 3 familles, de la plus forte hausse à la plus forte baisse$/.test(s.title));
    expect(mix.table.rows.map((r: any) => r.cells[0].v)).toEqual(["Coffee", "Tea", "Autres familles (1, sous 1 % du CA)"]);
    expect(mix.table.rows[0].cells[0].bold).toBe(true);
    expect(mix.table.rows[1].cells[0].bold).toBe(false);
    const fam = b.sections.find((s) => s.title === "Famille Coffee pendant l'opération");
    expect(fam.facts[0].startsWith("Ce qui bouge")).toBe(true);   // aucun KPI demandé : pas de phrase de tête
  });
  it("sous les planchers : « — » avec le compte de jours en sub", () => {
    const r = reading(null);
    r.familles_reading[0].steps[0] = { step: "ventes", occ_value: 140, base_value: 100, delta_pct: null, occ_days: 1, base_days: 13 };
    const b = buildDispositifFamilleBlocks(r);
    const fam = b.sections.find((s) => s.title === "Famille Coffee pendant l'opération");
    expect(fam.table.rows[0].cells[3]).toEqual({ v: "—", color: "#9CA3AF", sub: "1 jour d'opération" });
  });
  it("sources : verdicts, base famille (ticket entier), mix", () => {
    const b = buildDispositifFamilleBlocks(reading(null));
    expect(b.sources[0]).toBe("Vos engagements (verdicts et mesures)");
    expect(b.sources[1]).toContain("4 jours d'opération vs 13 jours comparables");
    expect(b.sources[1]).toContain("panier moyen = le ticket entier");
    expect(b.sources[2].startsWith("Mix :")).toBe(true);
  });
});
