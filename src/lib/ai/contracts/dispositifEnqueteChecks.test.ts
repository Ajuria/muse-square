// Lie-bait du mode enquête : chaque fabrication plantée doit tomber, chaque usage légitime passer.
import { describe, it, expect } from "vitest";
import { validateEnqueteOutput } from "./dispositifEnqueteChecks";

const FACTS = [
  "Motif affluence : 40 jours de pointe mesurés sur votre historique, dont 38 arrivés avec la chaleur, les vacances ou le week-end (chaleur 85 %, vacances 55 %, week-end 25 % — co-occurrences mesurées, pas des causes).",
  "Poids du motif : +33 402 €/an (annualisé, mesuré sur 40 jours / 4 mois). Une journée de ce type vaut +272 € vs votre normale (médiane mesurée).",
  "Journée de pointe sans facteur connu : vendredi 10/04 — 980 visiteurs, 873 € de CA, écart au CA attendu du jour -2 €.",
].join("\n");

const USER = "Les jours chauds on double l'équipe du matin et on sort la terrasse dès 9 h.";

describe("validateEnqueteOutput — porte chiffrée du mode enquête", () => {
  it("rejette un montant € inventé (absent des faits et des mots de l'exploitant)", () => {
    const r = validateEnqueteOutput({ say_fr: "Ces journées vous rapportent 4 500 € en moyenne.", fiche: null }, FACTS, USER);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("4500");
  });

  it("rejette un pourcentage inventé même petit (l'unité interdit l'exemption)", () => {
    const r = validateEnqueteOutput({ say_fr: "Une remise de 5 % suffirait sans doute.", fiche: null }, FACTS, USER);
    expect(r.ok).toBe(false);
  });

  it("rejette une arithmétique dérivée (multiplication non présente dans les faits)", () => {
    const r = validateEnqueteOutput({ say_fr: "4 pics par mois, cela ferait 1 088 € de plus.", fiche: null }, FACTS, USER);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("1088");
  });

  it("accepte les nombres des faits, au formatage français (espaces de milliers)", () => {
    const r = validateEnqueteOutput({ say_fr: "Vos jours de pointe valent +33 402 €/an ; une journée de ce type vaut +272 €.", fiche: null }, FACTS, USER);
    expect(r.ok).toBe(true);
  });

  it("accepte les nombres écrits par l'exploitant (ses 9 h) et les petits comptes nus", () => {
    const r = validateEnqueteOutput(
      { say_fr: "Terrasse dès 9 h, donc — je propose un test sur les 3 prochains pics annoncés.", fiche: null },
      FACTS,
      USER,
    );
    expect(r.ok).toBe(true);
  });

  it("scanne aussi la fiche proposée, pas seulement le message", () => {
    const r = validateEnqueteOutput(
      {
        say_fr: "Je résume.",
        fiche: { fact_fr: "Équipe doublée dès 9 h.", evidence_fr: "Vendredi 10/04 — 980 visiteurs.", test_fr: "Sur les 3 prochains pics, CA au-dessus de l'attendu, soit au moins 2 150 €." },
      },
      FACTS,
      USER,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("2150");
  });
});
