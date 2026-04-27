import { describe, it, expect } from "vitest";
import { compareDatesDeterministicV1 } from "./compare_dates";

describe("compareDatesDeterministicV1", () => {
  it("chooses the best date based on regime then score", () => {
    const rows = [
      {
        date: "2026-01-21",
        opportunity_regime: "B",
        opportunity_score_final_local: 72,
        alert_level_max: 0,
        events_within_10km_count: 3,
      },
      {
        date: "2026-01-18",
        opportunity_regime: "A",
        opportunity_score_final_local: 65,
        alert_level_max: 0,
        events_within_10km_count: 5,
      },
    ];
    const out = compareDatesDeterministicV1({ rows });
    expect(out.ok).toBe(true);
    expect(out.winner_date).toBe("2026-01-18");
  });

  it("prefers lower weather risk when regime and score are equal", () => {
    const rows = [
      {
        date: "2026-01-20",
        opportunity_regime: "A",
        opportunity_score_final_local: 80,
        alert_level_max: 2,
        events_within_10km_count: 1,
      },
      {
        date: "2026-01-22",
        opportunity_regime: "A",
        opportunity_score_final_local: 80,
        alert_level_max: 0,
        events_within_10km_count: 2,
      },
    ];
    const out = compareDatesDeterministicV1({ rows });
    expect(out.winner_date).toBe("2026-01-22");
  });

  it("returns a graceful result when fewer than 2 dates are provided", () => {
    const rows = [
      {
        date: "2026-01-25",
        opportunity_regime: "A",
        opportunity_score_final_local: 90,
      },
    ];
    const out = compareDatesDeterministicV1({ rows });
    expect(out.ok).toBe(true);
    expect(out.winner_date).toBeNull();
    expect(out.line_items[0].params?.mode).toBe("missing_dates");
  });
});