import { describe, it, expect } from "vitest";
import { matchSiteInQuestion } from "./siteFromQuestion";

const SITES = [
  { location_id: "occ", label: "Muse Square Occitanie" },
  { location_id: "ms", label: "Muse Square" },
  { location_id: "sev", label: "Maison Sèvres" },
];

describe("matchSiteInQuestion — le site nommé dans la question (09/09)", () => {
  it("« pour Sèvres » désigne Maison Sèvres, accent et casse ignorés", () => {
    expect(matchSiteInQuestion("Génère un rapport de vente pour Sèvres le mois dernier", SITES)).toBe("sev");
    expect(matchSiteInQuestion("rapport SEVRES août", SITES)).toBe("sev");
  });
  it("« Occitanie » désigne le site Occitanie", () => {
    expect(matchSiteInQuestion("le rapport d'août pour Occitanie", SITES)).toBe("occ");
  });
  it("« Muse Square » seul ne départage pas deux sites qui le portent → null (site de la session)", () => {
    expect(matchSiteInQuestion("rapport pour Muse Square", SITES)).toBeNull();
  });
  it("aucun site nommé → null ; un seul site → null (rien à résoudre)", () => {
    expect(matchSiteInQuestion("génère le rapport d'août", SITES)).toBeNull();
    expect(matchSiteInQuestion("rapport pour Sèvres", [SITES[2]])).toBeNull();
  });
  it("un mot générique ne désigne pas un site (« maison » seul)", () => {
    expect(matchSiteInQuestion("le rapport de la maison", SITES)).toBeNull();
  });
});
