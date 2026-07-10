// src/lib/ai/decision/day_why/day_why_v1.test.ts
import { describe, it, expect } from "vitest";
import { renderDayWhyV1 } from "./day_why_v1";

describe("renderDayWhyV1 — v1 stub", () => {
  it("returns null when date is invalid", () => {
    const out = renderDayWhyV1({
      date: "21-01-2026",
      day_row: {},
      location_context: {},
    });
    expect(out).toBeNull();
  });

  it("returns a stable object when date is valid", () => {
    const out = renderDayWhyV1({
      date: "2026-01-21",
      day_row: {},
      location_context: {},
    });

    expect(out).not.toBeNull();
    // Current IR shape: headline_fr + facts[] + line_items[] (was headline/bullets).
    expect(out!.headline_fr).toContain("2026-01-21");
    expect(Array.isArray(out!.line_items)).toBe(true);
    expect(Array.isArray(out!.facts)).toBe(true);
  });
});
