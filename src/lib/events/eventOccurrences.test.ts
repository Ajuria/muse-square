import { describe, it, expect } from "vitest";
import { generateOccurrences } from "./eventOccurrences";

describe("generateOccurrences — récurrence d'événement (owner 03/08)", () => {
  it("hebdo samedi, du 08/08 au 26/09 : les 8 samedis, bornes incluses", () => {
    const r = generateOccurrences({ recurrence: "weekly", dow: 6, start: "2026-08-08", end: "2026-09-26" });
    expect(r).toEqual(["2026-08-08", "2026-08-15", "2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"]);
  });

  it("hebdo : le départ avance jusqu'au premier bon jour de semaine", () => {
    const r = generateOccurrences({ recurrence: "weekly", dow: 6, start: "2026-08-05", end: "2026-08-20" });
    expect(r).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("plafond 52 : un an d'hebdo ne déborde jamais", () => {
    const r = generateOccurrences({ recurrence: "weekly", dow: 1, start: "2026-01-05", end: "2027-12-31" });
    expect(r.length).toBe(52);
  });

  it("mensuel au 31 : les mois sans 31 sont SAUTÉS, jamais approximés", () => {
    const r = generateOccurrences({ recurrence: "monthly", start: "2026-01-31", end: "2026-05-31" });
    expect(r).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("entrées invalides → [] (fin avant début, dow manquant, date malformée)", () => {
    expect(generateOccurrences({ recurrence: "weekly", dow: 6, start: "2026-08-08", end: "2026-08-01" })).toEqual([]);
    expect(generateOccurrences({ recurrence: "weekly", start: "2026-08-08", end: "2026-09-01" })).toEqual([]);
    expect(generateOccurrences({ recurrence: "monthly", start: "08/08/2026", end: "2026-09-01" })).toEqual([]);
  });
});
