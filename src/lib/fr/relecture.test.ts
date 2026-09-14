import { describe, expect, it } from "vitest";
import { fautesDe, phrasesDe, relireTexte } from "./relecture";
import { MOTS_BANNIS } from "./evenement.fr";
import { TOURNURES_LLM } from "./tournures.fr";

describe("relecture — les gardes du lexique appliqués aux phrases du modèle", () => {
  const banni = Object.keys(MOTS_BANNIS)[0];
  const tournure = TOURNURES_LLM.find((t) => t.refusee)!;
  it("une phrase saine passe ; une phrase avec un mot banni ou une tournure de machine est signalée", () => {
    expect(fautesDe("Vous avez généré 11 015 € de chiffre d'affaires.")).toEqual([]);
    const f = fautesDe(`Cette semaine, ${banni} pour vos ventes.`);
    expect(f.length).toBeGreaterThan(0); expect(f[0].motif).toBe(`« ${banni} »`); expect(f[0].faute).toBe(MOTS_BANNIS[banni]);
    expect(fautesDe(tournure.refusee).some((x) => x.faute === tournure.faute)).toBe(true);
  });
  it("le mot banni se cherche en mot entier, accents et casse compris", () => {
    // « animer » est banni (owner 24/08) ; « réanimer » ou « animation » n'en sont pas la faute mécanique.
    if (MOTS_BANNIS["animer"]) {
      expect(fautesDe("Nous voulons animer la boutique.").some((f) => f.motif === "« animer »")).toBe(true);
      expect(fautesDe("L'animation de la place attire du monde.").some((f) => f.motif === "« animer »")).toBe(false);
    }
  });
  it("relireTexte retire la phrase fautive, garde les autres et les paragraphes, compte ce qu'il retire", () => {
    const texte = `Vous avez généré 51 700 € de chiffre d'affaires en août. ${tournure.refusee}\n\nLe panier moyen reste à 4,81 € par vente.`;
    const r = relireTexte(texte);
    expect(r.texte).toBe("Vous avez généré 51 700 € de chiffre d'affaires en août.\n\nLe panier moyen reste à 4,81 € par vente.");
    expect(r.phrases_retirees).toBe(phrasesDe(tournure.refusee).length);
    expect(r.fautes[0].phrase.length).toBeGreaterThan(0);
    expect(relireTexte("").texte).toBe("");
    expect(relireTexte("Rien à redire ici.").fautes).toEqual([]);
  });
});
