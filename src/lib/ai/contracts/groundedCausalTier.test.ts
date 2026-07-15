// Tiered causal register (Phase 1 change #5) — the lie-bait regression cases for the causal relaxation.
// The spec's acceptance tests, verbatim: "'écart mesuré, préliminaire' on a cited decomposition passes;
// the same phrasing on a competitor/driver fact is rejected; a bare 'a fait baisser' is rejected."
import { describe, it, expect } from "vitest";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";
import { splitSentences, CAUSAL_PATTERNS, CAUSAL_ATTRIBUTION_PATTERNS, PREDICTED_OUTCOME_PATTERNS } from "./groundingChecks";

// f0 = measured (tier preliminaire) · f1 = observed_difference (tier emergent) · f2 = competitor, NO tier
const payload = () => ({
  horizon: "day", question: "q", date: "2026-07-15", display_date: "15/07/2026",
  citable_facts: [
    { id: "f0", fact_fr: "Les jours de forte chaleur comme aujourd'hui, votre CA a été ~12 % plus bas que d'habitude — 19 jours sur 27.", claim_type: "measured", tier: "preliminaire" },
    { id: "f1", fact_fr: "Les jours de forte chaleur où vous avez agi, vous étiez +14 pts au-dessus de vos journées sans action — sur 9 engagements, à confirmer.", claim_type: "observed_difference", tier: "emergent" },
    { id: "f2", fact_fr: "Concurrent à 300 m · Café Guimet", claim_type: "observed_proximity" },
  ],
  signals: { changes: [], cards: [] },
  driver: { value: "weather", claim_type: "observed_ranking" },
  engines: { sensitivities: [], decomposition: [], track_record: {} },
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

const out = (answer: string, cited: string[]) => ({
  headline: "Verdict du jour.", answer, key_facts: [], caveats: [], cited_fact_ids: cited,
});

describe("pattern groups stay coherent", () => {
  it("CAUSAL_PATTERNS is still the exact union (draft validator must not shift)", () => {
    expect(CAUSAL_PATTERNS).toEqual([...CAUSAL_ATTRIBUTION_PATTERNS, ...PREDICTED_OUTCOME_PATTERNS]);
  });
  it("splitSentences does not split French decimals", () => {
    expect(splitSentences("Le CA vaut 1.5 M€. Il baisse.")).toEqual(["Le CA vaut 1.5 M€.", "Il baisse."]);
  });
});

describe("tiered causal register", () => {
  it("spec: bare causal verb, no tier token -> rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("La forte chaleur a fait baisser votre CA.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("tier token");
  });
  it("spec: causal verb + the cited measured fact's tier token -> passes", () => {
    const [ok, errs, warns] = validate_packager_output_grounded_day(
      out("La forte chaleur a fait baisser votre CA — effet mesuré, préliminaire.", ["f0"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
    expect((warns ?? []).some((w) => w.includes("tiered causal claim accepted"))).toBe(true);
  });
  it("observed_difference's own tier (émergent) unlocks its causal claim", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Votre action a fait grimper le résultat — écart mesuré, émergent.", ["f1"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
  it("spec: same phrasing on a competitor fact (no tier) -> rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Le concurrent a fait baisser votre CA — effet mesuré, préliminaire.", ["f2"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("without any cited measured/observed_difference fact");
  });
  it("WRONG tier: citing the préliminaire fact but labelling it émergent -> rejected (no tier upgrade)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("La forte chaleur a fait baisser votre CA — effet mesuré, émergent.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("tier token");
  });
  it("tier token parked in a DIFFERENT sentence does not license the causal one", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("La forte chaleur a fait baisser votre CA. C'est un signal préliminaire.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("tier token");
  });
  it("predicted outcome is NEVER unlocked, even fully tier-labelled on a cited measured fact", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Une offre augmentera vos ventes — effet mesuré, préliminaire.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("predicted outcome");
  });
  it("the pre-#5 phrasing (observed gap, no causal verb) still passes untouched", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      out("Les jours de forte chaleur comme aujourd'hui, votre CA a été ~12 % plus bas que d'habitude.", ["f0"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
});
