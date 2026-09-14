// Ajouter une section à un Rapport (owner 14/09 : à la fin, AVANT Sources) et le correctif d'« Actualiser »
// qui effaçait une Synthèse écrite à la main. Ce qui se garde : Synthèse et Sources ne sont JAMAIS
// proposées (l'une n'est pas une section, l'autre se construit), une section déjà là ne se propose pas
// deux fois, la place est prévisible, et la Synthèse de l'exploitant survit à une actualisation.
import { describe, expect, it } from "vitest";
import { sectionsAjoutables, insererSection, actualiserAvec } from "./gestes";

const sec = (cle: string, titre = cle) => ({ cle, titre, blocs: [{ type: "prose", md: "…" }], provenance: { outil: "x", params: {} } }) as any;
const doc = (cles: string[], synthese: any = null): any => ({
  type: "rapport", titre: "Rapport", periode: { du: "2026-08-01", au: "2026-08-31", relative: null, libelle_fr: "août 2026" },
  sections: cles.map((c) => sec(c)), synthese, non_reconnu: [],
});

describe("sectionsAjoutables", () => {
  it("ne propose JAMAIS Synthèse ni Sources — l'une n'est pas une section, l'autre se construit", () => {
    const cles = sectionsAjoutables(doc([])).map((d) => d.cle);
    expect(cles).not.toContain("synthese");
    expect(cles).not.toContain("sources");
    expect(cles).toHaveLength(13);
  });

  it("ne propose pas ce qui est déjà dans le document", () => {
    const cles = sectionsAjoutables(doc(["chiffre_affaires", "panier", "sources"])).map((d) => d.cle);
    expect(cles).not.toContain("chiffre_affaires");
    expect(cles).not.toContain("panier");
    expect(cles).toContain("marge_brute");
    expect(cles).toHaveLength(11);
  });

  it("chaque choix porte son titre ET sa définition — on choisit en sachant ce qu'on ajoute", () => {
    const d = sectionsAjoutables(doc([])).find((x) => x.cle === "seuil_rentabilite")!;
    expect(d.titre).toBe("Seuil de rentabilité");
    expect(d.definition).toContain("CA net HT");
  });

  it("l'ordre est celui du lexique, pas celui du document — une liste de choix ne change pas d'ordre", () => {
    const a = sectionsAjoutables(doc([])).map((d) => d.cle);
    const b = sectionsAjoutables(doc(["mix"])).map((d) => d.cle).concat();
    expect(a.filter((c) => c !== "mix")).toEqual(b);
  });
});

describe("insererSection — à la fin, AVANT Sources", () => {
  it("se place juste avant Sources", () => {
    const out = insererSection(doc(["chiffre_affaires", "sources"]), sec("marge_brute")) as any;
    expect(out.sections.map((s: any) => s.cle)).toEqual(["chiffre_affaires", "marge_brute", "sources"]);
  });

  it("sans section Sources, elle va en dernier", () => {
    const out = insererSection(doc(["chiffre_affaires"]), sec("marge_brute")) as any;
    expect(out.sections.map((s: any) => s.cle)).toEqual(["chiffre_affaires", "marge_brute"]);
  });

  it("une section déjà présente est REFUSÉE — jamais deux fois la même", () => {
    expect(insererSection(doc(["marge_brute", "sources"]), sec("marge_brute"))).toEqual({ erreur: "section déjà présente" });
  });

  it("le document d'origine n'est pas modifié (composition pure)", () => {
    const d = doc(["chiffre_affaires", "sources"]);
    insererSection(d, sec("marge_brute"));
    expect(d.sections.map((s: any) => s.cle)).toEqual(["chiffre_affaires", "sources"]);
  });
});

describe("actualiserAvec — la Synthèse de l'exploitant SURVIT", () => {
  const ancien = (syn: any) => doc(["chiffre_affaires"], syn);
  const nouveau = () => doc(["chiffre_affaires"]);

  it("une Synthèse ÉCRITE PAR L'EXPLOITANT (registre « note ») est gardée", () => {
    const out = actualiserAvec(ancien({ text: "Août a été porté par les épices.", register: "note", auteur: "Julen" }), nouveau());
    expect(out.synthese).toEqual({ text: "Août a été porté par les épices.", register: "note", auteur: "Julen" });
  });

  it("une Synthèse GÉNÉRÉE tombe — elle décrivait les anciens chiffres", () => {
    const out = actualiserAvec(ancien({ text: "Le CA progresse de 12 %.", register: "vetted" }), nouveau());
    expect(out.synthese).toBeNull();
  });

  it("sans Synthèse, rien n'apparaît", () => {
    expect(actualiserAvec(ancien(null), nouveau()).synthese).toBeNull();
  });
});
