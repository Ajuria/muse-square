// src/lib/ai/impact_narrations/__tests__/impact_determinism.e2e.test.ts

import { describe, it, expect } from "vitest";

import type { DecisionSignalsV1 } from "../../decision/decision_signals.v1";
import { evaluateImpactBlocksV1 } from "../evaluate_impact_blocks_v1";

/**
 * This test proves END-TO-END determinism:
 * - same signals
 * - same fired assertion ids
 * - same routing tags
 * - same rule trace
 *
 * NO natural language involved.
 * NO heuristics.
 * NO randomness.
 */
describe("Impact narration — end-to-end determinism", () => {
  it("fires the exact same impact blocks for identical signals", () => {
    const signals: DecisionSignalsV1 = {
      weather: {
        kind: "weather",
        available: true,
        label: "Météo",
        rule_ids: ["W2", "W5"],
        data: {},
      },
      calendar: {
        kind: "calendar",
        available: true,
        label: "Calendrier",
        rule_ids: ["G3", "C1"],
        data: {},
      },
      competition: {
        kind: "competition",
        available: true,
        label: "Concurrence",
        rule_ids: ["C1", "C4"],
        data: {},
      },
    };

    const ctx = {
      horizon: "day" as const,
      intent: "DRIVER_PRIMARY",
      used_dates: ["2026-02-14"],
      signals,
    };

    const run1 = evaluateImpactBlocksV1(ctx);
    const run2 = evaluateImpactBlocksV1(ctx);

    // 1️⃣ Same number of blocks
    expect(run1.length).toBe(run2.length);

    // 2️⃣ Deep equality (strict determinism)
    expect(run1).toEqual(run2);

    // 3️⃣ Explicit assertion ids (order matters)
    expect(run1.map((b) => b.impact_assertion_id)).toEqual([
      "W2",
      "W5",
      "CAL_G3",
      "CAL_C1",
      "CP_C1",
      "CP_C4",
    ]);

    // 4️⃣ Explicit rule trace integrity
    for (const block of run1) {
      expect(block.rule_ids.length).toBeGreaterThan(0);
      for (const rid of block.rule_ids) {
        expect(typeof rid).toBe("string");
      }
    }

    // 5️⃣ Routing tags are stable (no heuristic drift)
    expect(
      run1.map((b) => ({
        id: b.impact_assertion_id,
        impact: b.impact_level,
        risk: b.risk_level,
        confidence: b.confidence,
      }))
    ).toMatchInlineSnapshot(`
      [
        { "id": "W2", "impact": "structuring", "risk": "medium", "confidence": "medium" },
        { "id": "W5", "impact": "structuring", "risk": "medium", "confidence": "medium" },
        { "id": "CAL_G3", "impact": "structuring", "risk": "medium", "confidence": "medium" },
        { "id": "CAL_C1", "impact": "structuring", "risk": "medium", "confidence": "medium" },
        { "id": "CP_C1", "impact": "structuring", "risk": "medium", "confidence": "medium" },
        { "id": "CP_C4", "impact": "secondary", "risk": "medium", "confidence": "medium" },
      ]
    `);
  });
});
