// I1 — la garde déterministe et la réponse hors périmètre (option A, owner 03/09). Pur.
// Chaque assertion a été vue tomber (mutation : détecteur inversé, famille retirée, question vide).
import { describe, it, expect } from "vitest";
import { signalMetier, motMetierDans, horsPerimetreReponse, HORS_PERIMETRE_TITRE, type GardeDetecteurs } from "./horsPerimetre";

const aucun: GardeDetecteurs = {
  familles: () => 0, dateToken: () => false, periode: () => false, lookupEvenement: () => false,
  entites: () => 0, journal: () => false, plan: () => false,
};

describe("signalMetier — un seul signal interdit le refus", () => {
  it("aucun signal → null (le refus est permis)", () => {
    expect(signalMetier("qui est Jésus ?", aucun)).toBeNull();
    expect(signalMetier("quelle est la capitale de l'Australie ?", aucun)).toBeNull();
    expect(signalMetier("bonjour", aucun)).toBeNull();
  });
  it("chaque détecteur, seul, bloque le refus et se nomme", () => {
    expect(signalMetier("x", { ...aucun, familles: () => 1 })).toBe("famille");
    expect(signalMetier("x", { ...aucun, entites: () => 2 })).toBe("entite");
    expect(signalMetier("x", { ...aucun, dateToken: () => true })).toBe("date");
    expect(signalMetier("x", { ...aucun, periode: () => true })).toBe("periode");
    expect(signalMetier("x", { ...aucun, lookupEvenement: () => true })).toBe("lookup");
    expect(signalMetier("x", { ...aucun, journal: () => true })).toBe("journal");
    expect(signalMetier("x", { ...aucun, plan: () => true })).toBe("plan");
  });
  it("un mot de KPI ou de métier suffit — « ça va mes ventes ? » n'est JAMAIS refusée", () => {
    expect(signalMetier("ça va mes ventes ?", aucun)).toBe("mot:ventes");
    expect(signalMetier("combien j'ai vendu hier ?", aucun)).toBe("mot:vendu");
    expect(signalMetier("mon panier moyen", aucun)).toBe("mot:panier moyen");
    expect(motMetierDans("Quelle heure est-il ?")).toBeNull();
  });
});

describe("horsPerimetreReponse — option A", () => {
  const site = { entities: [
    { kind: "famille" as const, id: null, name: "Coffee", families: ["Coffee"] },
    { kind: "famille" as const, id: null, name: "Tea", families: ["Tea"] },
    { kind: "famille" as const, id: null, name: "Bakery", families: ["Bakery"] },
    { kind: "famille" as const, id: null, name: "Branded", families: ["Branded"] },
  ] };
  it("titre approuvé, familles réelles (3 max), question verbatim, exemple daté", () => {
    const r = horsPerimetreReponse({ qRaw: "qui est Jésus ?", site, dernierJourMesure: "02/09" });
    expect(r.headline).toBe(HORS_PERIMETRE_TITRE);
    expect(r.answer).toBe("Je réponds sur vos ventes par jour, vos familles de produits (Coffee, Tea, Bakery…), vos pôles, vos opérations et vos suivis. Rien ici ne répond à « qui est Jésus ? ». Par exemple : « Pourquoi le 02/09 ? »");
  });
  it("sans famille → pas de parenthèse ; sans jour mesuré → l'exemple météo (état C approuvé)", () => {
    const r = horsPerimetreReponse({ qRaw: "  raconte-moi   une blague ", site: null, dernierJourMesure: null });
    expect(r.answer).toContain("vos familles de produits, vos pôles");
    expect(r.answer).toContain("« raconte-moi une blague »");
    expect(r.answer.endsWith("« Quel est l’effet de la météo sur mes ventes ? »")).toBe(true);
  });
});
