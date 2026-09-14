// 14/09 (owner : « trimestre, 12 mois, ou une date précise »). Ce qui se garde : « trimestre dernier » est
// CIVIL (T1…T4 entier, jamais 90 jours glissants), « 12 derniers mois » est GLISSANT et finit hier (jamais
// 12 mois civils, sinon la fenêtre change de longueur le 1er et deux rapports voisins ne se comparent plus),
// et les dates précises passent telles quelles avec leur libellé.
import { describe, expect, it } from "vitest";
import { resolvePeriode } from "./ventes";

describe("resolvePeriode — trimestre CIVIL, 12 mois GLISSANTS, dates précises", () => {
  it("« le trimestre dernier » depuis septembre = T2 entier (avril à juin)", () => {
    expect(resolvePeriode({ periode: "trimestre_dernier" }, "2026-09-14")).toEqual({
      start: "2026-04-01", end: "2026-06-30", libelle_fr: "le trimestre dernier, du 01/04/2026 au 30/06/2026",
    });
  });

  it("depuis février, c'est le T4 de l'ANNÉE précédente — le passage d'année ne le casse pas", () => {
    expect(resolvePeriode({ periode: "trimestre_dernier" }, "2026-02-03")).toEqual({
      start: "2025-10-01", end: "2025-12-31", libelle_fr: "le trimestre dernier, du 01/10/2025 au 31/12/2025",
    });
  });

  it("le trimestre est CIVIL, jamais 90 jours glissants", () => {
    const t = resolvePeriode({ periode: "trimestre_dernier" }, "2026-09-14")!;
    expect(t.end).toBe("2026-06-30");            // pas hier
    expect(t.start.slice(8)).toBe("01");         // toujours un 1er
  });

  it("« les 12 derniers mois » finissent HIER et couvrent un an jour pour jour", () => {
    expect(resolvePeriode({ periode: "douze_derniers_mois" }, "2026-09-14")).toEqual({
      start: "2025-09-14", end: "2026-09-13", libelle_fr: "vos 12 derniers mois, du 14/09/2025 au 13/09/2026",
    });
  });

  it("les 12 derniers mois GLISSENT : deux jours consécutifs donnent deux fenêtres décalées d'un jour", () => {
    const a = resolvePeriode({ periode: "douze_derniers_mois" }, "2026-09-14")!;
    const b = resolvePeriode({ periode: "douze_derniers_mois" }, "2026-09-15")!;
    expect(a.start).not.toBe(b.start);
    expect(b.start).toBe("2025-09-15");
  });

  it("des dates précises passent telles quelles, avec leur libellé français", () => {
    expect(resolvePeriode({ du: "2026-03-01", au: "2026-03-31" }, "2026-09-14")).toEqual({
      start: "2026-03-01", end: "2026-03-31", libelle_fr: "du 01/03/2026 au 31/03/2026",
    });
  });

  it("une plage à l'envers ou mal formée est REFUSÉE — jamais une fenêtre inventée", () => {
    expect(resolvePeriode({ du: "2026-03-31", au: "2026-03-01" }, "2026-09-14")).toBeNull();
    expect(resolvePeriode({ du: "31/03/2026" }, "2026-09-14")).toBeNull();
  });
});
