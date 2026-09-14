import { describe, expect, it } from "vitest";
import { SECTIONS, SECTION_BY_CLE, MODELE_VENTES, resolveSections } from "./rapport.fr";
import { TOURNURES_LLM } from "./tournures.fr";
import { MOTS_BANNIS } from "./evenement.fr";

describe("rapport.fr — le registre des sections (spec § 6.5)", () => {
  it("porte les quinze sections actées, chacune avec titre, définition, référentiel, unité et alias", () => {
    expect(SECTIONS.map((s) => s.cle)).toEqual(["synthese", "chiffre_affaires", "volume", "panier", "mix", "marge_brute", "resultat_net", "seuil_rentabilite", "poles", "familles", "espace", "jours", "contexte", "actions", "sources"]);
    for (const s of SECTIONS) { expect(s.titre.length, s.cle).toBeGreaterThan(2); expect(s.definition.length, s.cle).toBeGreaterThan(10); expect(s.alias.length, s.cle).toBeGreaterThan(0); }
    expect(SECTION_BY_CLE.poles.titre).toBe("Vos pôles · du plus au moins performant");
    expect(SECTION_BY_CLE.synthese.titre).toBe("Synthèse");
    expect(MODELE_VENTES[0]).toBe("synthese");
  });
  it("résout la demande de l'owner (§ 9) par alias, dans l'ordre, sans doublon", () => {
    const r = resolveSections("volume, panier, mix, et les pôles les plus et les moins performants en nombre de ventes");
    expect(r.cles).toEqual(["volume", "panier", "mix", "poles"]);
    expect(r.inconnues).toEqual([]);
  });
  it("accepte une liste, ignore accents et casse, et signale ce qu'aucun alias ne couvre", () => {
    expect(resolveSections(["Chiffre d’affaires", "MARGE", "resultat net", "la couleur des murs"])).toEqual({ cles: ["chiffre_affaires", "marge_brute", "resultat_net"], inconnues: ["la couleur des murs"] });
    expect(resolveSections("au m²").cles).toEqual(["espace"]);
    expect(resolveSections("les vacances")).toEqual({ cles: [], inconnues: ["les vacances"] }); // « ca » en mot entier seulement
    expect(resolveSections("les pôles en nombre de ventes").cles).toEqual(["poles", "volume"]);
    // Le titre d'une section est toujours reconnu (mesuré 12/09 : la section jours se perdait quand le modèle reprenait son titre).
    expect(resolveSections("CA moyen par jour de la semaine").cles).toEqual(["chiffre_affaires", "jours"]); // « CA » puis le titre entier
    expect(resolveSections("Vos pôles · du plus au moins performant").cles).toEqual(["poles"]);
    expect(resolveSections("").cles).toEqual([]);
  });
  it("les titres et définitions passent les gardes du français", () => {
    const visibles = SECTIONS.flatMap((s) => [s.titre, s.definition, s.referentiel]);
    for (const s of visibles) {
      for (const t of TOURNURES_LLM) expect(t.motif.test(s.toLowerCase()), `${s} — ${t.faute}`).toBe(false);
      for (const mot of Object.keys(MOTS_BANNIS)) {
        const re = new RegExp(`(^|[^\\p{L}])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu");
        expect(re.test(s), `${s} — « ${mot} » : ${MOTS_BANNIS[mot]}`).toBe(false);
      }
    }
  });
});
