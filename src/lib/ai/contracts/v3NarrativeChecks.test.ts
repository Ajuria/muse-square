// Lie-bait — étape 2 (v3_narrative grounding, R4-4 08/08). Chaque fabrication plantée doit REJETER ;
// chaque usage légitime (nombre du payload, somme/écart exact, entité présente) doit PASSER.
// Fait partie de la porte de merge : npx vitest run src/lib/ai/contracts/ (CLAUDE.md).

import { describe, it, expect } from "vitest";
import { validate_v3_grounding, v3SurfacedStrings } from "./v3NarrativeChecks";

const ROW = {
  month_days: [
    { date: "2026-08-11", score: 7.4, events_5km: 142, label: "Mardi 11 août 2026" },
    { date: "2026-08-10", score: 7.4, events_5km: 157, label: "Lundi 10 août 2026" },
  ],
  venue: { site_name: "Muse Square" },
  competitor: "Musée du quai Branly - Jacques Chirac",
};

const okOut = (over: any = {}) => ({
  headline: "3 dates en août", verdict: "", answer: "", key_facts: [], reasons: [], caveats: [], ...over,
});

describe("v3 grounding (étape 2)", () => {
  it("passe : nombres du payload, entité présente", () => {
    const [ok] = validate_v3_grounding(okOut({
      answer: "Le mardi 11 août 2026 compte 142 événements à 5 km, score 7,4/10, près du Musée du quai Branly - Jacques Chirac.",
    }), ROW);
    expect(ok).toBe(true);
  });

  it("rejette : nombre inventé", () => {
    const [ok, errs] = validate_v3_grounding(okOut({ answer: "Ce jour compte 389 événements concurrents." }), ROW);
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("389");
  });

  it("passe : écart exact de deux nombres de même unité du payload (157 − 142 = 15)", () => {
    const [ok] = validate_v3_grounding(okOut({ verdict: "15 événements concurrents de moins dans un rayon de 5 km." }), ROW);
    expect(ok).toBe(true);
  });

  it("rejette : écart FAUX (157 − 142 ≠ 20)", () => {
    const [ok] = validate_v3_grounding(okOut({ verdict: "20 événements concurrents de moins." }), ROW);
    expect(ok).toBe(false);
  });

  it("rejette : entité inventée", () => {
    const [ok, errs] = validate_v3_grounding(okOut({ answer: "À proximité du Palais De Tokyo, la journée reste calme." }), ROW);
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("Palais De Tokyo");
  });

  it("scanne l'answer POLYMORPHE (tableau de datecards) — nombre inventé dans c2 rejeté", () => {
    const [ok] = validate_v3_grounding(okOut({
      answer: [{ date: "2026-08-11", label: "Mardi 11 août 2026", c2: "Pression : 9 999 événements concurrents." }],
    }), ROW);
    expect(ok).toBe(false);
  });

  it("scanne les caveats — nombre inventé rejeté", () => {
    const [ok] = validate_v3_grounding(okOut({ caveats: ["Fiabilité limitée au-delà de 45 jours."] }), ROW);
    expect(ok).toBe(false);
  });

  it("v3SurfacedStrings couvre headline/verdict/answer-objet/key_facts/caveats", () => {
    const segs = v3SurfacedStrings({ headline: "h", verdict: "v", answer: { a: "x", b: "y" }, key_facts: ["k"], reasons: [], caveats: ["c"] });
    expect(segs.sort()).toEqual(["c", "h", "k", "v", "x", "y"]);
  });
});
