// Approfondir ne redit pas ce que la section MONTRE déjà (owner 14/09 : « un dupliqué de ce qui était déjà
// dans le bloc […] il faut éviter ce comportement, qui va se reproduire partout »). Ce qui se garde :
// le tableau déjà à l'écran ne revient pas, un tableau NOUVEAU reste (c'est la réponse), et le raisonnement
// n'est jamais filtré.
import { describe, expect, it } from "vitest";
import { sansCeQueLaSectionMontreDeja, empreinteBloc, approfondirPrompt } from "./gestes";

const tableCA = (): any => ({
  type: "table",
  cols: [{ label: "" }, { label: "Du 15/08/2026 au 13/09/2026" }, { label: "Période précédente" }, { label: "Écart" }],
  rows: [{ cells: [{ v: "Chiffre d'affaires" }, { v: "52 554 €" }, { v: "43 666 €" }, { v: "+20,4 %" }] }],
});
const tableParJour = (): any => ({
  type: "table", cols: [{ label: "Jour" }, { label: "CA" }],
  rows: [{ cells: [{ v: "lundi" }, { v: "1 200 €" }] }],
});

describe("sansCeQueLaSectionMontreDeja", () => {
  it("le tableau DÉJÀ à l'écran ne revient pas", () => {
    const out = sansCeQueLaSectionMontreDeja([tableCA()], [tableCA(), { type: "prose", md: "La hausse tient au volume." } as any]);
    expect(out).toHaveLength(1);
    expect((out[0] as any).type).toBe("prose");
  });

  it("un tableau NOUVEAU reste — c'est lui, la réponse", () => {
    const out = sansCeQueLaSectionMontreDeja([tableCA()], [tableCA(), tableParJour()]);
    expect(out).toHaveLength(1);
    expect((out[0] as any).cols[0].label).toBe("Jour");
  });

  it("le raisonnement n'est JAMAIS filtré, même long", () => {
    const prose = { type: "prose", md: "La hausse tient surtout à un volume plus important…" } as any;
    expect(sansCeQueLaSectionMontreDeja([tableCA()], [prose])).toEqual([prose]);
  });

  it("un doublon INTERNE à la réponse ne se rend qu'une fois", () => {
    const out = sansCeQueLaSectionMontreDeja([], [tableParJour(), tableParJour()]);
    expect(out).toHaveLength(1);
  });

  it("les mêmes faits, déjà dits par la section, ne se redisent pas", () => {
    const faits = { type: "facts", items: ["Vous avez généré 52 554 €.", "Soit +20,4 %."] } as any;
    expect(sansCeQueLaSectionMontreDeja([faits], [faits])).toEqual([]);
  });

  it("les Sources de la réponse tombent quand la section en a les mêmes", () => {
    const src = { type: "sources", items: ["Vos ventes par jour (caisse)"] } as any;
    expect(sansCeQueLaSectionMontreDeja([src], [src])).toEqual([]);
  });

  it("l'empreinte ignore l'habillage : gras et couleur ne font pas un tableau différent", () => {
    const a = tableCA();
    const b = tableCA(); b.rows[0].cells[1].bold = true; b.rows[0].cells[3].color = "#B45309";
    expect(empreinteBloc(a)).toBe(empreinteBloc(b));
  });
});

describe("approfondirPrompt — le modèle sait ce que la section MONTRE", () => {
  const doc = (): any => ({
    type: "rapport", titre: "Rapport", periode: { du: "2026-08-15", au: "2026-09-13", relative: null, libelle_fr: "x" },
    sections: [{ cle: "chiffre_affaires", titre: "Chiffre d'affaires", blocs: [tableCA(), { type: "facts", items: ["Vous avez généré 52 554 €."] }], provenance: { outil: "v", params: {}, periode: { du: "2026-08-15", au: "2026-09-13" } } }],
    synthese: null, non_reconnu: [],
  });

  it("les colonnes des tableaux présents sont ANNONCÉES au modèle", () => {
    const p = approfondirPrompt(doc(), 0, "à quoi est-ce dû ?") as string;
    expect(p).toContain("Ce que la section MONTRE déjà");
    expect(p).toContain("Période précédente");
  });

  it("la consigne de ne pas redire est EXPLICITE", () => {
    const p = approfondirPrompt(doc(), 0, "à quoi est-ce dû ?") as string;
    expect(p).toContain("N'AFFICHE PAS CE QUI EST DÉJÀ LÀ.");
    expect(p).toContain("un tableau seulement s'il montre autre chose");
  });

  it("la question de l'exploitant reste la dernière chose lue", () => {
    const p = approfondirPrompt(doc(), 0, "à quoi est-ce dû ?") as string;
    expect(p.trim().endsWith("Question de l'exploitant : à quoi est-ce dû ?")).toBe(true);
  });
});
