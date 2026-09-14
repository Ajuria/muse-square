// Comparer des journées, en outil (§ 7, dernière couche). Ce qui se garde : le texte du pipeline v3 part
// TEL QUEL — le reformuler lui ferait perdre son ancre de fait — l'absence se dit, et sous deux dates la
// question ne propose que des dates déjà vues ou le week-end qui vient, jamais une date inventée.
import { describe, expect, it } from "vitest";
import { composeJourneesComparees, composeJourneesElicitation, prochainJourDeSemaine, journeesToText, frJour } from "./journeesComparees";

const L = (kind: any, text_fr: string, ids: string[] = ["F.x.1"]) => ({ kind, text_fr, fact_ids: ids });

describe("composeJourneesComparees — le v3 traduit en blocs, jamais recalculé", () => {
  const base = {
    dates: ["2026-09-05", "2026-09-12"],
    render_lines: [
      L("headline", "Le 12/09 a généré 1 240 € contre 980 € le 05/09."),
      L("fact", "Il a plu le 05/09 ; le 12/09 était sec."),
      L("implication", "L’écart tient surtout à l’après-midi."),
    ] as any,
    facts_by_date: { "2026-09-05": [{ fact_id: "F.x.1" }], "2026-09-12": [{ fact_id: "F.x.2" }] } as any,
  };

  it("chaque ligne du v3 devient un fait CITABLE, mot pour mot", () => {
    const l = composeJourneesComparees(base);
    expect(l.found).toBe(true);
    expect(l.facts).toEqual([
      "Le 12/09 a généré 1 240 € contre 980 € le 05/09.",
      "Il a plu le 05/09 ; le 12/09 était sec.",
      "L’écart tient surtout à l’après-midi.",
    ]);
  });

  it("la tête va au bloc headline, le reste aux faits, et les sources comptent les journées MESURÉES", () => {
    const l = composeJourneesComparees(base);
    expect(l.blocks[0]).toEqual({ type: "headline", text: "Le 12/09 a généré 1 240 € contre 980 € le 05/09." });
    expect((l.blocks[1] as any).items).toHaveLength(2);
    expect(JSON.stringify(l.blocks[2])).toContain("2 journées sur 2 demandées");
  });

  it("une date demandée SANS mesure ne se compte pas comme une journée lue", () => {
    const l = composeJourneesComparees({ ...base, dates: ["2026-09-05", "2026-09-12", "2026-09-19"] });
    expect(JSON.stringify(l.blocks[2])).toContain("2 journées sur 3 demandées");
  });

  it("aucune ligne rendue : l'absence se DIT, aucun bloc fabriqué", () => {
    const l = composeJourneesComparees({ ...base, render_lines: [] as any });
    expect(l.found).toBe(false);
    expect(l.blocks).toHaveLength(1);
    expect((l.blocks[0] as any).type).toBe("absence");
    expect(journeesToText(l)).toContain("rien à comparer");
  });
});

describe("composeJourneesElicitation — la question, sans une date inventée", () => {
  it("les jours DÉJÀ VUS dans le fil font la première pastille", () => {
    const l = composeJourneesElicitation({ jours_du_fil: ["2026-08-14", "2026-08-21"], aujourdhui: "2026-09-14" });
    expect(l.found).toBe(false);
    const chips = (l.blocks[1] as any).chips;
    expect(chips[0].label_fr).toBe("Comparer le 14/08/2026 et le 21/08/2026");
    expect(chips[0].send).toBe("Compare le 14/08/2026 et le 21/08/2026");
  });

  it("sans jour dans le fil, il reste le week-end qui VIENT — jamais une date tirée au hasard", () => {
    const l = composeJourneesElicitation({ aujourdhui: "2026-09-14" });   // lundi
    const chips = (l.blocks[1] as any).chips;
    expect(chips).toHaveLength(1);
    expect(chips[0].label_fr).toBe("Comparer samedi 19/09/2026 et dimanche 20/09/2026");
  });

  it("la question ne porte AUCUN chiffre ni aucune entité (elle n'affirme rien)", () => {
    const l = composeJourneesElicitation({ aujourdhui: "2026-09-14" });
    expect((l.blocks[0] as any).md).toMatch(/^Quelles journées voulez-vous comparer \?/);
    expect((l.blocks[0] as any).md).not.toMatch(/\d+\s*€|\d+\s*%/);
    expect(l.facts).toEqual([]);
  });
});

describe("prochainJourDeSemaine — STRICTEMENT après, jamais le jour même", () => {
  it("un samedi demandé depuis un samedi rend le samedi SUIVANT", () => {
    expect(prochainJourDeSemaine("2026-09-19", 6)).toBe("2026-09-26");   // 19/09/2026 = samedi
  });
  it("depuis un lundi, le samedi de la même semaine", () => {
    expect(prochainJourDeSemaine("2026-09-14", 6)).toBe("2026-09-19");
  });
  it("le dimanche qui suit un samedi est le lendemain", () => {
    expect(prochainJourDeSemaine("2026-09-19", 0)).toBe("2026-09-20");
  });
});

it("frJour rend la date en français, jamais en ISO (CLAUDE.md § Localization)", () => {
  expect(frJour("2026-09-14")).toBe("14/09/2026");
  expect(frJour("")).toBe("");
});
