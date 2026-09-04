// J2.4 (27/08) — lie-bait de la FAMILLE ENGAGEMENTS : la mémoire opérationnelle des dispositifs
// est LA valeur de l'app ; une fabrication qui la singe (effet inventé, verdict upgradé, chiffre
// dérivé) tue la confiance dans toutes les vraies mesures. Faits calqués sur la sortie RÉELLE
// du provider (f10c3e58, 27/08) ; chaque piège doit tomber, chaque usage légitime passer.
import { describe, it, expect } from "vitest";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";
import { verdictRegisterViolations } from "./groundingChecks";

const payload = () => ({
  horizon: "day", question: "q", date: "2026-08-27", display_date: "27/08/2026",
  citable_facts: [
    { id: "e0", fact_fr: "Dispositif « Corner de vente producteur » — 2 tests sur le CA famille produits & services : −50,2 % le 08/08/2026 et −78,3 % le 22/08/2026 (effet prouvé), vs votre résultat habituel. Effet mesuré : il a prouvé ne pas être adapté.", claim_type: "observed_difference", tier: "preliminaire" },
    { id: "e1", fact_fr: "Objectif de +11 % manqué.", claim_type: "measured", tier: "preliminaire" },
    { id: "e2", fact_fr: "Dispositif « Vacances scolaires » — version 2 en cours, verdict d'ici le 02/09/2026.", claim_type: "observed" },
  ],
  signals: { changes: [], cards: [] },
  driver: { value: null, claim_type: "observed_ranking" },
  engines: { sensitivities: [], decomposition: [], track_record: {} },
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

const out = (answer: string, cited: string[]) => ({
  headline: "Vos dispositifs.", answer, key_facts: [], caveats: [], cited_fact_ids: cited,
});

describe("lie-bait engagements — chiffres", () => {
  it("rejette un effet % inventé (+18 % absent des faits)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Votre dispositif a amélioré le CA famille produits & services de +18 %.", ["e0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("18");
  });
  it("rejette un montant € inventé (2 300 € absent des faits)", () => {
    const [ok] = validate_packager_output_grounded_day(
      out("Le corner vous a coûté 2 300 €.", ["e0"]), payload());
    expect(ok).toBe(false);
  });
  it("rejette la moyenne dérivée des deux tests (−64 % n'est écrit nulle part)", () => {
    const [ok] = validate_packager_output_grounded_day(
      out("En moyenne l'effet est de −64 % sur les deux tests.", ["e0"]), payload());
    expect(ok).toBe(false);
  });
});

describe("lie-bait engagements — registre de verdict", () => {
  it("rejette « effet prouvé » sur une version EN COURS (aucun fait cité ne porte « prouvé »)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le dispositif « Vacances scolaires » a un effet prouvé.", ["e2"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("prouvé");
  });
  it("rejette « objectif atteint » quand le fait cité dit MANQUÉ", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Votre objectif de +11 % est atteint.", ["e1"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("atteint");
  });
  it("rejette « écarté » et « non concluant » non portés par les faits cités", () => {
    expect(verdictRegisterViolations(["le dispositif est ecarte"], "aucun verdict ici")).toContain("écarté");
    expect(verdictRegisterViolations(["resultat non concluant"], "aucun verdict ici")).toContain("non concluant");
  });
  it("ne rejette PAS « il manque 3 jours » (manque hors contexte objectif/cible)", () => {
    expect(verdictRegisterViolations(["il manque 3 jours de donnees"], "rien")).toEqual([]);
  });
  it("ne rejette PAS « écart de 5 % » (écart n'est pas écarté)", () => {
    expect(verdictRegisterViolations(["un ecart de 5 % vs habituel"], "rien")).toEqual([]);
  });
});

describe("usages légitimes — passent", () => {
  it("citer l'effet réel avec son registre passe (chiffres et « prouvé » portés par e0)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le dispositif « Corner de vente producteur » a un effet prouvé : −50,2 % puis −78,3 % sur le CA famille produits & services vs votre résultat habituel.", ["e0"]), payload());
    expect(ok, errs.join(" | ")).toBe(true);
  });
  it("dire l'objectif manqué en citant e1 passe", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Votre objectif de +11 % est manqué.", ["e1"]), payload());
    expect(ok, errs.join(" | ")).toBe(true);
  });
});
