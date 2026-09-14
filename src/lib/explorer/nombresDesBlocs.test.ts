// Les nombres qu'un OUTIL a rendus dans ses blocs comptent pour la porte (owner 14/09 : « je ne comprends
// pas la pilule Non vérifié ! C'est donc inutilisable ? »). Ce qui se garde : un tableau d'outil fonde le
// texte qui le commente — et l'invention reste prise.
import { describe, expect, it } from "vitest";
import { nombresDesBlocs, groundAgentText } from "./blocks";

const tableJours = (): any => ({
  type: "table", cols: [{ label: "Jour" }, { label: "CA" }],
  rows: [{ cells: [{ v: "samedi 15/08/2026" }, { v: "1 611 €" }] },
         { cells: [{ v: "dimanche 13/09/2026" }, { v: "2 215 €" }] }],
});

describe("nombresDesBlocs", () => {
  it("ramasse les cellules d'un tableau", () => {
    expect(nombresDesBlocs([tableJours()])).toContain("1 611 €");
  });
  it("ramasse les valeurs d'un graphique (ce qui est ÉCRIT sur la barre)", () => {
    const g: any = { type: "barres_h", items: [{ label: "Coffee", value: 4753, value_fr: "4 753 €", part_fr: "39,4 %" }] };
    expect(nombresDesBlocs([g])).toEqual(expect.arrayContaining(["4 753 €", "39,4 %"]));
  });
  it("descend dans les sections d'un Rapport", () => {
    const r: any = { type: "rapport", sections: [{ cle: "ca", titre: "CA", blocs: [tableJours()] }] };
    expect(nombresDesBlocs([r])).toContain("2 215 €");
  });
  it("aucun bloc : aucun nombre, jamais une exception", () => {
    expect(nombresDesBlocs([])).toEqual([]);
    expect(nombresDesBlocs(undefined as any)).toEqual([]);
  });
});

describe("groundAgentText avec les blocs des outils", () => {
  it("LE DÉFAUT DE L'OWNER : commenter un tableau d'outil ne fait plus tomber le registre", () => {
    const texte = "Votre plus faible journée est le samedi 29/08 ; la plus forte, 2 215 € le 13/09.";
    // Sans les blocs — l'état d'avant : « Non vérifié » alors que le chiffre vient de la caisse.
    expect(groundAgentText(texte, []).register).toBe("model");
    // Avec le tableau que l'outil a rendu : vérifié.
    expect(groundAgentText(texte, [], [tableJours()]).register).toBe("vetted");
  });

  it("CE N'EST PAS UN ASSOUPLISSEMENT : un nombre absent des faits ET des blocs reste pris", () => {
    const g = groundAgentText("Vous avez perdu 4 200 € ce mois-ci.", [], [tableJours()]);
    expect(g.register).toBe("model");
    expect(g.ungrounded_numbers).toContain("4200");
  });

  it("un texte sans nombre reste vérifié par construction", () => {
    expect(groundAgentText("La période n'est pas une progression régulière.", [], []).register).toBe("vetted");
  });
});

// ── 14/09 (mesuré sur la capture de l'owner) — LA DATE SANS SON ANNÉE ──
// « le samedi 22/08 », « le creux du 07/09 » : la forme la plus naturelle en français quand l'année est
// déjà dite en tête de section. Elle n'était pas filtrée, donc ses deux nombres passaient pour inventés et
// faisaient tomber le registre sur une phrase entièrement fondée.
describe("une date sans année n'est pas un fait", () => {
  it("« le 22/08 » ne fait plus tomber le registre", () => {
    expect(groundAgentText("Le pic est le samedi 22/08, le creux le 07/09.", [], []).register).toBe("vetted");
  });
  it("la date complète reste filtrée, comme avant", () => {
    expect(groundAgentText("Le 22/08/2026 a été la meilleure journée.", [], []).register).toBe("vetted");
  });
  it("un RATIO n'est pas une date : « 20/80 » reste un nombre à fonder", () => {
    expect(groundAgentText("La règle des 20/80 s'applique.", [], []).register).toBe("model");
  });
  it("un vrai montant reste pris, même à côté d'une date sans année", () => {
    const g = groundAgentText("Le 22/08, vous avez généré 9 999 €.", [], []);
    expect(g.register).toBe("model");
    expect(g.ungrounded_numbers).toContain("9999");
  });
});
