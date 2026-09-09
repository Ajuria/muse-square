// Garde de la règle « une famille vit dans un seul pôle » (owner 27/08, ratifié 09/09).
// Ce que le test attrape : une famille déjà prise laissée passer, l'auto-exclusion de la chaîne de
// versions perdue (une V2 refusée par elle-même), et la phrase de refus qui divergerait de celle du
// formulaire. Les trois ont été introduits volontairement et vus rougir avant d'être remis.
import { describe, it, expect } from "vitest";
import { familyTakenByAnotherPole, familyClashMessageFr } from "./poleReading";

const POLES = [
  { dispositif_id: "d-peri", name: "Périssables", families: ["FRUITS ET LEGUMES", "FRAIS"] },
  { dispositif_id: "d-art", name: "Art de vivre", families: ["ARTS DE LA TABLE", "DROGUERIE"] },
];

describe("familyTakenByAnotherPole", () => {
  it("rend la première famille déjà prise et le pôle qui la porte", () => {
    expect(familyTakenByAnotherPole(POLES, ["SUCRE", "FRAIS"], null)).toEqual({ famille: "FRAIS", pole: "Périssables" });
  });
  it("null quand aucune famille n'est prise", () => {
    expect(familyTakenByAnotherPole(POLES, ["SUCRE", "APERITIF"], null)).toBeNull();
  });
  it("une V2 n'est jamais bloquée par ses PROPRES familles", () => {
    expect(familyTakenByAnotherPole(POLES, ["FRUITS ET LEGUMES", "FRAIS"], "d-peri")).toBeNull();
  });
  it("mais une V2 reste bloquée par la famille d'un AUTRE pôle", () => {
    expect(familyTakenByAnotherPole(POLES, ["FRAIS", "DROGUERIE"], "d-peri")).toEqual({ famille: "DROGUERIE", pole: "Art de vivre" });
  });
  it("aucun pôle, aucune famille : rien à refuser", () => {
    expect(familyTakenByAnotherPole([], ["FRAIS"], null)).toBeNull();
    expect(familyTakenByAnotherPole(POLES, [], null)).toBeNull();
  });
  it("la phrase de refus est celle du formulaire, mot pour mot", () => {
    expect(familyClashMessageFr({ famille: "FRAIS", pole: "Périssables" }))
      .toBe("FRAIS appartient déjà au pôle « Périssables » — une famille vit dans un seul pôle.");
  });
});
