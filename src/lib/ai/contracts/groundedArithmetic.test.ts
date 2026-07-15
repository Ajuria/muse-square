// Bounded arithmetic (Phase 1 change #4) — the lie-bait regression cases for the ONE relaxation of the
// number gate. The Phase 1 spec's acceptance tests, verbatim: "5 (=3+2) from two cited counts passes;
// 6 from the same two is rejected; an ungrounded operand is rejected." Plus the live case that motivated
// the change (Haiku's 1500−1240=260 reject) and the unit/citation guards.
import { describe, it, expect } from "vitest";
import { extractNumbersWithUnits, reproducibleSumDiff } from "./groundingChecks";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";

// Minimal GroundedDayPayload — two euro amounts in one fact, a % in another, a °C in a third.
const payload = () => ({
  horizon: "day", question: "q", date: "2026-07-15", display_date: "15/07/2026",
  citable_facts: [
    { id: "f0", fact_fr: "CA réalisé 1 240 € contre 1 500 € habituel un mercredi.", claim_type: "measured" },
    { id: "f1", fact_fr: "Forte chaleur aujourd'hui — 34 °C ressenti.", claim_type: "observed_acute" },
    { id: "f2", fact_fr: "Vos jours de forte chaleur font −12 % de CA à jour comparable.", claim_type: "observed_difference" },
    { id: "f3", fact_fr: "3 événements payants et 2 événements gratuits à proximité.", claim_type: "observed_presence" },
  ],
  signals: { changes: [], cards: [] },
  driver: { value: null, claim_type: "observed_ranking" },
  engines: { sensitivities: [], decomposition: [], track_record: {} },
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

const output = (answer: string, cited: string[]) => ({
  headline: "Verdict du jour.",
  answer,
  key_facts: [],
  caveats: [],
  cited_fact_ids: cited,
});

describe("reproducibleSumDiff (the recompute primitive)", () => {
  it("extracts units", () => {
    expect(extractNumbersWithUnits("un écart de 260 € et 34 °C, rafales 80 km/h")).toEqual([
      { v: 260, unit: "€" }, { v: 34, unit: "°c" }, { v: 80, unit: "km/h" },
    ]);
  });
  it("spec case: 5 (=3+2) from two cited counts passes", () => {
    expect(reproducibleSumDiff({ v: 5, unit: "" }, "3 événements payants et 2 événements gratuits").ok).toBe(true);
  });
  it("spec case: 6 from the same two is rejected", () => {
    expect(reproducibleSumDiff({ v: 6, unit: "" }, "3 événements payants et 2 événements gratuits").ok).toBe(false);
  });
  it("cross-unit operands never pair (34 °C + 1 240 € is not 1274)", () => {
    expect(reproducibleSumDiff({ v: 1274, unit: "" }, "34 °C ressenti. CA 1 240 €").ok).toBe(false);
  });
  it("stated unit must match the operands' unit", () => {
    expect(reproducibleSumDiff({ v: 260, unit: "%" }, "1 240 € contre 1 500 €").ok).toBe(false);
    expect(reproducibleSumDiff({ v: 260, unit: "€" }, "1 240 € contre 1 500 €").ok).toBe(true);
  });
});

describe("validate_packager_output_grounded_day — bounded arithmetic", () => {
  it("the motivating case: 260 € derived from cited f0 passes (with an observability warning)", () => {
    const [ok, errs, warns] = validate_packager_output_grounded_day(
      output("Le CA affiche 1 240 € contre 1 500 € habituel, soit un écart de 260 €.", ["f0"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
    expect((warns ?? []).some((w) => w.includes("derived number 260"))).toBe(true);
  });
  it("lie-bait: invented total (300 €) from the same cited fact is rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output("Le CA affiche un écart de 300 € par rapport à l'habituel.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("300");
  });
  it("lie-bait: uncited operand — 260 € while citing only f1 (weather) is rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output("Un écart de 260 € aujourd'hui, sous forte chaleur (34 °C ressenti).", ["f1"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("260");
  });
  it("derived percentage stays rejected (out of interim scope): 17,33 %", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output("Le CA de 1 240 € contre 1 500 € habituel, soit −17,33 %.", ["f0"]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("17.33");
  });
  it("directly grounded numbers still pass untouched (no arithmetic involved)", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output("Forte chaleur (34 °C ressenti) ; vos jours de chaleur font −12 % de CA.", ["f1", "f2"]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
});
