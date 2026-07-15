// Caveats are part of the scanned surface (closed alongside Phase 1 #2). Before this, `caveats` was the
// ONE surfaced field no fabrication guard read — and feedback-driven regeneration made the hole reachable:
// a model told "entity X was rejected" relocates X into a caveat and passes. These cases pin the closure.
import { describe, it, expect } from "vitest";
import { validate_packager_output_grounded_day } from "./packagerGroundedDayValidator";

const payload = () => ({
  horizon: "day", question: "q", date: "2026-07-15", display_date: "15/07/2026",
  citable_facts: [
    { id: "f0", fact_fr: "CA réalisé 1 240 € contre 1 500 € habituel un mercredi.", claim_type: "measured" },
  ],
  signals: { changes: [], cards: [] },
  driver: { value: null, claim_type: "observed_ranking" },
  engines: { sensitivities: [], decomposition: [], track_record: {} },
  forbidden: [],
  venue: { site_name: null, location_type: null, business_description: null },
});

const output = (caveats: string[]) => ({
  headline: "Verdict du jour.",
  answer: "Le CA réalisé s'établit à 1 240 € contre 1 500 € habituel.",
  key_facts: [],
  caveats,
  cited_fact_ids: ["f0"],
});

describe("caveats are scanned like every other surfaced field", () => {
  it("planted entity in a caveat is rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output(["Aucune donnée ne relie le Festival Imaginaire de Nîmes à votre CA."]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("Festival Imaginaire");
  });
  it("ungrounded number in a caveat is rejected", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output(["Une chute de 47 % ne peut pas être confirmée."]), payload());
    expect(ok).toBe(false);
    expect(errs.join(" ")).toContain("47");
  });
  it("a generic honest denial passes", () => {
    const [ok, errs] = validate_packager_output_grounded_day(
      output(["Aucune donnée sur l'événement et le concurrent que vous mentionnez."]), payload());
    expect(errs).toEqual([]);
    expect(ok).toBe(true);
  });
});
