// Les blocs d'Explorer (docs/explorer-outil-spec.md § 5) et LA porte sur le texte de l'agent.
import { describe, expect, it } from "vitest";
import { blocksFromFamilyResult, factsToText, groundAgentText, assembleAnswerBlocks } from "./blocks";

const found = { found: true, data: { found: true, lead: "x" }, facts: [{ fact_fr: "Votre marge brute est de 19 845 €.", claim_type: "observed" as const }], sources: ["Votre caisse"] };
const absent = { found: false, data: { found: false }, facts: [], sources: [] };

describe("blocksFromFamilyResult / factsToText", () => {
  it("avec matière : la carte du kit puis les sources ; sans : l'absence avec son geste", () => {
    expect(blocksFromFamilyResult("marge", "renderMarge", found)).toEqual([{ type: "card", render: "renderMarge", data: found.data }, { type: "sources", items: ["Votre caisse"] }]);
    expect(blocksFromFamilyResult("marge", "renderMarge", absent)[0]).toMatchObject({ type: "absence", geste: { label_fr: "Importer vos prix d'achat" } });
    expect(factsToText(found, "rien")).toBe("• Votre marge brute est de 19 845 €.");
    expect(factsToText(absent, "rien")).toBe("rien");
  });
});

describe("groundAgentText — chaque nombre du texte vient d'un fait d'outil", () => {
  const facts = ["Sur vos 30 derniers jours, votre marge brute est de 19 845 €, soit un taux de marge brute de 40 %.", "Coffee : 15 097 € de marge brute (taux 77 %)."];
  it("vérifié quand tous les nombres sont dans les faits (espaces de milliers, virgules, dates et heures ignorées)", () => {
    const g = groundAgentText("Sur 30 jours votre marge brute est de 19 845 € (40 %) ; Coffee en porte 15 097 €. Le 12/09/2026 à 10 h, vous étiez au-dessus.", facts);
    expect(g).toEqual({ register: "vetted", ungrounded_numbers: [], facts_cited: 2 });
  });
  it("non vérifié dès qu'un nombre n'existe dans aucun fait — le nombre fautif est nommé", () => {
    const g = groundAgentText("Votre marge brute est de 19 845 €, soit environ 660 € par jour.", facts);
    expect(g.register).toBe("model"); expect(g.ungrounded_numbers).toEqual(["660"]);
  });
  it("un texte sans nombre est vérifié par construction ; sans fait, tout nombre est fautif", () => {
    expect(groundAgentText("Aucune mesure d’espace pour l’instant.", []).register).toBe("vetted");
    expect(groundAgentText("Vous faites 12 % de marge.", []).ungrounded_numbers).toEqual(["12"]);
  });
  it("assembleAnswerBlocks : la pastille de registre d'abord, puis les blocs des outils dans l'ordre", () => {
    const g = groundAgentText("ok", []);
    expect(assembleAnswerBlocks([[{ type: "absence", manque: "a" }], [{ type: "sources", items: ["s"] }]], g).map((b) => b.type)).toEqual(["register", "absence", "sources"]);
  });
});

it("groundAgentText ignore les numéros de liste (mesuré 12/09 : « 1. Cuisine… 7. Caisse » rendait le tour non vérifié)", () => {
  const facts = ["Cuisine génère 15 430 € de marge brute.", "Maison génère 11 473 €."];
  expect(groundAgentText("Vos pôles :\n1. Cuisine génère 15 430 € de marge brute.\n2. Maison génère 11 473 €.\n3) rien", facts).register).toBe("vetted");
  expect(groundAgentText("3 pôles génèrent 15 430 €", facts).register).toBe("model"); // un « 3 » dans la phrase reste un chiffre
});
