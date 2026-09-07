// Verdict par KPI (chantier 15/08) — la règle PURE, testée sur les formes réelles du compte
// owner. Structure miroir de K1 : portes asymétriques sur les « met » seulement.
import { describe, it, expect } from "vitest";
import { kpiVerdict } from "./kpiRegistry";

describe("kpiVerdict — règle pure", () => {
  it("sous l'objectif → missed, même dans la bande de bruit (asymétrie : un raté n'est jamais requalifié)", () => {
    // Corner producteur 08/08 : famille 28 €/j, habituel 56,2, objectif 62,4.
    expect(kpiVerdict({ realized: 28, baseline: 56.211, goal: 62.4, se: 40, materialConfound: false })).toBe("missed");
    // À 1 centime sous l'objectif, toujours missed — la bande ne sauve pas un raté.
    expect(kpiVerdict({ realized: 62.39, baseline: 56.211, goal: 62.4, se: 40, materialConfound: true })).toBe("missed");
  });

  it("objectif dépassé + hausse nette au-dessus du bruit → met", () => {
    expect(kpiVerdict({ realized: 320, baseline: 273.6, goal: 300.9, se: 10, materialConfound: false })).toBe("met");
  });

  it("objectif dépassé mais hausse vs habituel dans le bruit → confounded (la forme des 302 tickets)", () => {
    // 302 >= 300,9 mais 302 − 273,6 = 28,4 : si la SE dépasse 28,4, indistinguable du bruit.
    expect(kpiVerdict({ realized: 302, baseline: 273.567, goal: 300.9, se: 30, materialConfound: false })).toBe("confounded");
  });

  it("objectif dépassé, hausse nette, mais part vacances matérielle → confounded (même porte que K1)", () => {
    expect(kpiVerdict({ realized: 320, baseline: 273.6, goal: 300.9, se: 10, materialConfound: true })).toBe("confounded");
  });

  it("bande de bruit inconnue (se null) → la porte bruit s'efface, la porte vacances reste", () => {
    expect(kpiVerdict({ realized: 320, baseline: 273.6, goal: 300.9, se: null, materialConfound: false })).toBe("met");
    expect(kpiVerdict({ realized: 320, baseline: 273.6, goal: 300.9, se: null, materialConfound: true })).toBe("confounded");
  });

  it("égalité exacte à l'objectif compte comme atteint (>=)", () => {
    expect(kpiVerdict({ realized: 300.9, baseline: 273.6, goal: 300.9, se: 5, materialConfound: false })).toBe("met");
  });
});
