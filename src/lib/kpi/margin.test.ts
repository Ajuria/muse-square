import { describe, it, expect } from "vitest";
import { marginDisplayMode, pctInt, MARGIN_COVERAGE_MIN } from "./margin";
describe("marge mesurée — mode d'affichage selon la couverture (M8)", () => {
  it("mesuré à 90 %, mixte entre 50 et 90, estimé sous 50, aucune sans prix", () => {
    expect(MARGIN_COVERAGE_MIN).toBe(0.9);
    expect(marginDisplayMode(0.95)).toBe("mesure"); expect(marginDisplayMode(0.9)).toBe("mesure");
    expect(marginDisplayMode(0.7)).toBe("mixte"); expect(marginDisplayMode(0.5)).toBe("mixte");
    expect(marginDisplayMode(0.49)).toBe("estime"); expect(marginDisplayMode(0.058)).toBe("estime");
    expect(marginDisplayMode(0)).toBe("aucune"); expect(marginDisplayMode(null)).toBe("aucune");
  });
  it("part entière plafonnée à 100", () => { expect(pctInt(2984, 51851)).toBe(6); expect(pctInt(120, 100)).toBe(100); expect(pctInt(1, 0)).toBeNull(); });
});
