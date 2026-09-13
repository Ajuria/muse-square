// src/lib/explorer/entitePeriodeOutil.test.ts — une entité sur une période, pour l'agent.
// Ce que ces cas gardent : chaque ligne de table devient un fait CITABLE (sinon la porte refuse les
// nombres que le modèle lit dans la table), et une cellule vide ne devient JAMAIS un fait — une absence
// n'est pas un chiffre.
import { describe, expect, it } from "vitest";
import { composeEntitePeriode, composeEntitesComparees, entiteToText, ligneEnFait } from "./entitePeriodeOutil";
import type { EntityPeriodBlocks, EntityCompareBlocks } from "./entityReading";

const COLS = [{ label: "Famille" }, { label: "Période" }, { label: "CA" }];
const unePeriode = (over: Partial<EntityPeriodBlocks> = {}): EntityPeriodBlocks => ({
  headline: "Cuisine — août 2026",
  prose: "Ce pôle pèse 40,1 % de votre CA sur la période.",
  table: {
    cols: COLS,
    rows: [
      { cells: [{ v: "Coffee", bold: true }, { v: "août" }, { v: "21 064 €", sub: "30 j vendus" }] },
      { cells: [{ v: "Loose Tea", bold: true }, { v: "août" }, { v: "—", sub: "3 j vendus" }] },
    ],
  },
  funnel_table: null,
  sources: ["Vos ventes"],
  ...over,
});

describe("ligneEnFait — une ligne de table redite pour la porte", () => {
  it("la première cellule nomme, les suivantes portent leur libellé et leur précision", () => {
    expect(ligneEnFait(COLS, [{ v: "Coffee" }, { v: "août" }, { v: "21 064 €", sub: "30 j vendus" }]))
      .toBe("Coffee : Période août · CA 21 064 € (30 j vendus).");
  });
  it("une cellule vide ou « — » ne devient JAMAIS un fait — une absence n'est pas un chiffre", () => {
    expect(ligneEnFait(COLS, [{ v: "Loose Tea" }, { v: "—" }, { v: "—", sub: "3 j vendus" }])).toBeNull();
    expect(ligneEnFait(COLS, [{ v: "Loose Tea" }, { v: "" }, { v: "21 064 €" }])).toBe("Loose Tea : CA 21 064 €.");
  });
  // 13/09 — le cas qui a fait rougir la suite, et c'est le CODE qui avait tort : la mesure était absente
  // (« — ») mais le libellé de période restait, et « Loose Tea : Période août. » partait comme un fait
  // citable. Un fait sans NOMBRE n'a rien à faire citer.
  it("une ligne dont il ne reste AUCUN nombre n'est pas un fait, même si un libellé survit", () => {
    expect(ligneEnFait(COLS, [{ v: "Loose Tea" }, { v: "août" }, { v: "—", sub: "3 j vendus" }])).toBeNull();
    expect(ligneEnFait([{ label: "Pôle" }, { label: "État" }], [{ v: "Cave" }, { v: "en projet" }])).toBeNull();
    // Une date EST un nombre citable : la ligne tient.
    expect(ligneEnFait([{ label: "Occurrence" }, { label: "Jour" }], [{ v: "Corner" }, { v: "08/08/2026" }])).toBe("Corner : Jour 08/08/2026.");
  });
  it("une ligne sans tête, ou vide, ne rend rien", () => {
    expect(ligneEnFait(COLS, [{ v: "" }, { v: "août" }])).toBeNull();
    expect(ligneEnFait(COLS, [])).toBeNull();
  });
});

describe("une entité sur une période", () => {
  it("rend l'en-tête, la ligne de contexte, la table — et un fait par ligne CHIFFRÉE", () => {
    const x = composeEntitePeriode(unePeriode());
    expect(x.titre).toBe("Cuisine — août 2026");
    expect(x.blocks.map((b) => b.type)).toEqual(["prose", "facts", "table", "sources"]);
    expect(x.facts).toEqual([
      "Ce pôle pèse 40,1 % de votre CA sur la période.",
      "Coffee : Période août · CA 21 064 € (30 j vendus).",
    ]);
    expect(entiteToText(x)).toContain("• Coffee : Période août · CA 21 064 €");
  });

  it("sans table ni contexte, il reste l'en-tête et les sources — aucun fait inventé", () => {
    const x = composeEntitePeriode(unePeriode({ prose: "", table: null }));
    expect(x.blocks.map((b) => b.type)).toEqual(["prose", "sources"]);
    expect(x.facts).toEqual([]);
  });

  it("l'échelle de la vente, quand elle existe, donne ses propres faits", () => {
    const x = composeEntitePeriode(unePeriode({
      funnel_table: { cols: [{ label: "Étape" }, { label: "Nombre" }], rows: [{ cells: [{ v: "Passage" }, { v: "1 200" }] }] },
    }));
    expect(x.facts).toContain("Passage : Nombre 1 200.");
    expect(x.blocks.filter((b) => b.type === "table")).toHaveLength(2);
  });
});

describe("plusieurs entités, ou deux périodes", () => {
  const compare = (): EntityCompareBlocks => ({
    headline: "Coffee vs Tea — 2 périodes",
    sections: [
      { title: "Chiffre d'affaires", table: { cols: [{ label: "Entité" }, { label: "CA" }], rows: [{ cells: [{ v: "Coffee" }, { v: "21 064 €" }] }] }, facts: ["Coffee : 702 €/jour (août) vs 640 €/jour (juillet)."] },
    ],
    sources: ["Vos ventes"],
  });

  it("chaque section rend son titre, sa table et ses faits — les deux sources de faits se cumulent", () => {
    const x = composeEntitesComparees(compare());
    expect(x.blocks.map((b) => b.type)).toEqual(["prose", "prose", "table", "facts", "sources"]);
    expect(x.facts).toEqual([
      "Coffee : CA 21 064 €.",
      "Coffee : 702 €/jour (août) vs 640 €/jour (juillet).",
    ]);
  });

  it("une section sans table ni fait ne rend que son titre", () => {
    const x = composeEntitesComparees({ headline: "A vs B", sections: [{ title: "Ventes" }], sources: [] });
    expect(x.blocks.map((b) => b.type)).toEqual(["prose", "prose"]);
    expect(x.facts).toEqual([]);
  });
});
