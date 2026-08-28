// Porte de concordance (owner go 28/08, « Signal à confirmer ») — LE foyer de la règle.
// Seuils modélisés sur le parc du 28/08 : 4/25 cartes touchées, 0 supprimée.
import { describe, it, expect } from "vitest";
import { signalAConfirmer } from "./dayClassRegistry";

describe("signalAConfirmer", () => {
  it("discordance de signe (|r| >= 0,05, |t| < 3) → à confirmer", () => {
    expect(signalAConfirmer(-154, 0.07, 2.8)).toBe(true);    // ff2aeb35 pluie (cas réel)
    expect(signalAConfirmer(1132, -0.14, 1.3)).toBe(true);   // 2dc69ea6 competition_low
  });
  it("concordance → jamais rétrogradé", () => {
    expect(signalAConfirmer(-220, -0.2, 4.49)).toBe(false);  // f10c3e58 pluie
    expect(signalAConfirmer(155, 0.24, 3.05)).toBe(false);
  });
  it("r trop faible pour affirmer un signe (|r| < 0,05) → pas de verdict de discordance", () => {
    expect(signalAConfirmer(-902, 0.0, 1.66)).toBe(false);   // 14379e18 competition_high
    expect(signalAConfirmer(-1955, -0.09, 2.49)).toBe(false);
  });
  it("|t| >= 3 : un effet massif n'est pas rétrogradé par un r dilué", () => {
    expect(signalAConfirmer(-154, 0.07, 3.2)).toBe(false);
  });
  it("r absent → jamais rétrogradé (on ne juge pas un lien non mesuré)", () => {
    expect(signalAConfirmer(-100, null, 1.5)).toBe(false);
  });
});
