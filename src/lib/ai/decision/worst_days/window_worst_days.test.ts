import { describe, it, expect } from "vitest";
import { windowWorstDaysDeterministic } from "./window_worst_days";

describe("windowWorstDaysDeterministic", () => {
  it("returns a truth-safe empty message when rows is empty", () => {
    const out = windowWorstDaysDeterministic({ rows: [] });

    expect(out.ok).toBe(true);
    expect(out.headline).toContain("Aucun jour");
    expect(out.caveat).toContain("Worstlist vide");
    expect(out.key_facts.length).toBeGreaterThan(0);
  });

  it("uses worst = first 3 rows (no rerank) and lists dates in decision line", () => {
    const rows = [
      { date: "2026-01-10" }, // worst #1
      { date: "2026-01-11" }, // worst #2
      { date: "2026-01-12" }, // worst #3
      { date: "2026-01-13" }, // less bad
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.ok).toBe(true);
    expect(out.key_facts[0]).toContain("2026-01-10");
    expect(out.key_facts[0]).toContain("2026-01-11");
    expect(out.key_facts[0]).toContain("2026-01-12");
    expect(out.key_facts[0]).not.toContain("2026-01-13");
  });

  it("weather tri-state: unknown when all weather_alert_level are missing", () => {
    const rows = [{ date: "2026-01-10" }, { date: "2026-01-11" }, { date: "2026-01-12" }];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Météo : signal indisponible"))).toBe(true);
  });

  it("weather tri-state: none when known and all are 0", () => {
    const rows = [
      { date: "2026-01-10", weather_alert_level: 0 },
      { date: "2026-01-11", weather_alert_level: 0 },
      { date: "2026-01-12", weather_alert_level: 0 },
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Météo : aucune alerte météo signalée"))).toBe(true);
  });

  it("weather tri-state: some when at least one weather_alert_level > 0", () => {
    const rows = [
      { date: "2026-01-10", weather_alert_level: 0 },
      { date: "2026-01-11", weather_alert_level: 1 },
      { date: "2026-01-12", weather_alert_level: 0 },
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Météo : signaux météo présents"))).toBe(true);
  });

  it("competition tri-state: unknown when both 5km and 10km counts are missing", () => {
    const rows = [{ date: "2026-01-10" }, { date: "2026-01-11" }, { date: "2026-01-12" }];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Concurrence : signal indisponible"))).toBe(true);
  });

  it("competition tri-state: none when known and all are 0", () => {
    const rows = [
      { date: "2026-01-10", events_within_10km_count: 0 },
      { date: "2026-01-11", events_within_10km_count: 0 },
      { date: "2026-01-12", events_within_10km_count: 0 },
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Concurrence : aucune concurrence directe"))).toBe(true);
  });

  it("competition tri-state: some when at least one direct competition count > 0", () => {
    const rows = [
      { date: "2026-01-10", events_within_10km_count: 0 },
      { date: "2026-01-11", events_within_5km_count: 1 },
      { date: "2026-01-12", events_within_10km_count: 0 },
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Concurrence : concurrence présente"))).toBe(true);
  });

  it("calendar: unknown when all flags are missing; some when at least one flag is true", () => {
    const unknownRows = [
      { date: "2026-01-10" },
      { date: "2026-01-11" },
      { date: "2026-01-12" },
    ];
    const outUnknown = windowWorstDaysDeterministic({ rows: unknownRows });
    expect(outUnknown.key_facts.some((s) => s.includes("Calendrier : signal indisponible"))).toBe(true);

    const someRows = [
      { date: "2026-01-10", is_weekend: false },
      { date: "2026-01-11", is_weekend: true },
      { date: "2026-01-12", is_weekend: false },
    ];
    const outSome = windowWorstDaysDeterministic({ rows: someRows });
    expect(outSome.key_facts.some((s) => s.includes("Calendrier : contexte particulier"))).toBe(true);
  });

  it("keeps key_facts capped at 4 lines", () => {
    const rows = [
      { date: "2026-01-10", weather_alert_level: 1, events_within_10km_count: 1, is_weekend: true },
      { date: "2026-01-11", weather_alert_level: 0, events_within_10km_count: 0, is_weekend: false },
      { date: "2026-01-12", weather_alert_level: 0, events_within_10km_count: 0, is_weekend: false },
    ];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.length).toBeLessThanOrEqual(4);
  });
});
