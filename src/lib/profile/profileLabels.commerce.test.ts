// Garde des deux axes déclarés (owner 10/09 — docs/type-et-gamme-de-commerce-spec.md).
// Ce que le test attrape : une valeur gardée hors du commerce (un musée « généraliste »), une valeur hors
// liste stockée telle quelle (« premium »), un libellé qui s'écarte des mots du lexique.
import { describe, it, expect } from "vitest";
import {
  normalizeCommerceAxes, commerceTypeOrNull, commerceGammeOrNull,
  COMMERCE_TYPE_OPTIONS, COMMERCE_GAMME_OPTIONS, COMMERCE_AXIS_SECTORS,
} from "./profileLabels";

describe("normalizeCommerceAxes", () => {
  it("garde les deux valeurs dans Commerce & Retail", () => {
    expect(normalizeCommerceAxes("commercial", "generaliste", "haut")).toEqual({ commerce_type: "generaliste", commerce_gamme: "haut" });
  });
  it("garde les deux valeurs dans Marchés & Halles", () => {
    expect(normalizeCommerceAxes("market_hall", "specialiste", "luxe")).toEqual({ commerce_type: "specialiste", commerce_gamme: "luxe" });
  });
  it("vide les deux hors du commerce : un musée ne garde pas un type de commerce", () => {
    expect(normalizeCommerceAxes("culture", "generaliste", "haut")).toEqual({ commerce_type: null, commerce_gamme: null });
    expect(normalizeCommerceAxes(null, "generaliste", "haut")).toEqual({ commerce_type: null, commerce_gamme: null });
  });
  it("une valeur hors liste tombe à NULL, jamais stockée telle quelle", () => {
    expect(normalizeCommerceAxes("commercial", "premium", "mass_market")).toEqual({ commerce_type: null, commerce_gamme: null });
  });
  it("espaces, vide, absent", () => {
    expect(commerceTypeOrNull("  generaliste ")).toBe("generaliste");
    expect(commerceGammeOrNull("")).toBeNull();
    expect(commerceGammeOrNull(undefined)).toBeNull();
  });
});

describe("les mots sont ceux du lexique (owner 10/09)", () => {
  it("valeurs, libellés et secteurs", () => {
    expect(COMMERCE_TYPE_OPTIONS.map((o) => o.label)).toEqual(["Spécialiste", "Généraliste"]);
    expect(COMMERCE_GAMME_OPTIONS.map((o) => o.label)).toEqual(["Entrée de gamme", "Milieu de gamme", "Haut de gamme", "Luxe"]);
    expect([...COMMERCE_AXIS_SECTORS]).toEqual(["commercial", "market_hall"]);
  });
});
