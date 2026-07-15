// Honest-absence floor (Phase 1 change #3) — spec acceptance: "a day with genuinely no measured facts
// yields the honest-absence line, not a generic template; still zero LLM text."
import { describe, it, expect } from "vitest";
import { composeHonestAbsenceFr, type GroundedDayPayload } from "./groundedPayload";

const base = (facts: GroundedDayPayload["citable_facts"]): GroundedDayPayload => ({
  horizon: "day", question: "q", date: "2026-07-15", display_date: "15/07/2026",
  citable_facts: facts,
  signals: { changes: [], cards: [] },
  driver: { value: null, claim_type: "observed_ranking" } as any,
  engines: { sensitivities: [], decomposition: [], track_record: {} } as any,
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

describe("composeHonestAbsenceFr", () => {
  it("zero citable facts -> the honest-absence line, French date, names the absent categories", () => {
    const r = composeHonestAbsenceFr(base([]));
    expect(r).not.toBeNull();
    expect(r!.headline).toContain("15/07/2026");
    expect(r!.answer).toContain("réaction mesurée");
    expect(r!.answer).toContain("alerte météo");
  });
  it("any fact present -> null (the gap is not the story; existing floor stays)", () => {
    const r = composeHonestAbsenceFr(base([
      { id: "f0", fact_fr: "Forte chaleur aujourd'hui — 34 °C ressenti.", claim_type: "observed_acute" },
    ]));
    expect(r).toBeNull();
  });
});
