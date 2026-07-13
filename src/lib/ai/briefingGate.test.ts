import { describe, it, expect } from "vitest";
import { isMaterialBriefing, type BriefingGateInput } from "./briefingGate";

// A genuinely QUIET location: no acute weather, alert below threshold, no commercial moment,
// no competitor change, |Δscore| < 0.3, no saved-event milestone.
const quiet: BriefingGateInput = {
  dc: { day_surface: { opportunity: { alert_level_max: 1 } }, weather_alert: null, commercial_events: [] },
  competitorChanges: [],
  scoreDelta: 0.1,
  savedEvents: [{ days_until: 12 }],
};

describe("Point du jour material-signal gate", () => {
  it("SUPPRESSES a genuinely quiet day (the previously-untested path)", () => {
    expect(isMaterialBriefing(quiet)).toBe(false);
  });

  it("suppresses when the score barely moved (|Δ| < 0.3)", () => {
    expect(isMaterialBriefing({ ...quiet, scoreDelta: -0.2 })).toBe(false);
  });

  it("suppresses when yesterday's score is unknown (Δ null)", () => {
    expect(isMaterialBriefing({ ...quiet, scoreDelta: null })).toBe(false);
  });

  // Each trigger flips it to material, in isolation:
  it("sends on an acute weather alert", () => {
    expect(isMaterialBriefing({ ...quiet, dc: { ...quiet.dc, weather_alert: { level: 3 } } })).toBe(true);
  });
  it("sends on a high alert_level (>= 2)", () => {
    expect(isMaterialBriefing({ ...quiet, dc: { day_surface: { opportunity: { alert_level_max: 2 } }, weather_alert: null, commercial_events: [] } })).toBe(true);
  });
  it("sends on a commercial moment", () => {
    expect(isMaterialBriefing({ ...quiet, dc: { ...quiet.dc, commercial_events: ["Soldes d'été"] } })).toBe(true);
  });
  it("sends on a competitor change", () => {
    expect(isMaterialBriefing({ ...quiet, competitorChanges: [{ event_label: "Festival X" }] })).toBe(true);
  });
  it("sends on a >= 0.3 score move", () => {
    expect(isMaterialBriefing({ ...quiet, scoreDelta: -0.4 })).toBe(true);
  });
  it("sends on a saved-event milestone (J-3)", () => {
    expect(isMaterialBriefing({ ...quiet, savedEvents: [{ days_until: 3 }] })).toBe(true);
  });
});
