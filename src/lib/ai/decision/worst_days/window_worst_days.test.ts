import { describe, it, expect } from "vitest";
import { windowWorstDaysDeterministic } from "./window_worst_days";

// NOTE MÉTHODE (31/07/2026) — pourquoi ces deux tests ont changé de cible, pas d'intention.
// Ils étaient rouges depuis le 26/05 (7b206e6, commit fourre-tout de 26 fichiers). Rejoué : le
// couple module+test du 17/02 passait 10/10 ; c'est le module qui a bougé, pas le test qui a
// vieilli. Deux changements y avaient été faits :
//   · la concurrence est passée de events_within_10km_count à 500m/1km/5km — le test alimentait
//     donc un champ que le module ne lit plus, d'où « signal indisponible » ;
//   · le fait « Calendrier : … » a quitté key_facts pour l'IR v1 (facts_by_date + coverage).
//     Il n'a PAS été supprimé : il est devenu PAR DATE et plus riche. C'est son consommateur qui
//     manque — prompt.ts ne lit que headline/summary/key_facts/caveat, jamais v1.
// On vise donc la couche où le calendrier vit RÉELLEMENT. Chaînes et statuts ci-dessous relevés
// en exécutant le module, jamais recopiés de mémoire.
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

  it("competition tri-state: unknown when the 500m/1km/5km counts are all missing", () => {
    const rows = [{ date: "2026-01-10" }, { date: "2026-01-11" }, { date: "2026-01-12" }];

    const out = windowWorstDaysDeterministic({ rows });

    expect(out.key_facts.some((s) => s.includes("Concurrence : signal indisponible"))).toBe(true);
  });

  it("competition tri-state: none when known and all are 0", () => {
    const rows = [
      { date: "2026-01-10", events_within_5km_count: 0 },
      { date: "2026-01-11", events_within_5km_count: 0 },
      { date: "2026-01-12", events_within_5km_count: 0 },
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

  it("calendar (dans l'IR v1 depuis 7b206e6) : unknown when all flags are missing; some when at least one flag is true", () => {
    const unknownRows = [
      { date: "2026-01-10" },
      { date: "2026-01-11" },
      { date: "2026-01-12" },
    ];
    const outUnknown = windowWorstDaysDeterministic({ rows: unknownRows });
    expect(outUnknown.v1).toBeDefined();
    const covUnknown = outUnknown.v1!.coverage.by_dimension.find((d) => d.dimension === "calendar");
    expect(covUnknown?.status).toBe("none");
    expect(
      Object.values(outUnknown.v1!.facts_by_date).flat().some((f) => f.dimension === "calendar")
    ).toBe(false);

    const someRows = [
      { date: "2026-01-10", is_weekend: false },
      { date: "2026-01-11", is_weekend: true },
      { date: "2026-01-12", is_weekend: false },
    ];
    const outSome = windowWorstDaysDeterministic({ rows: someRows });
    expect(outSome.v1).toBeDefined();
    const covSome = outSome.v1!.coverage.by_dimension.find((d) => d.dimension === "calendar");
    expect(covSome?.status).toBe("partial");
    expect(covSome?.present_fields).toContain("is_weekend");
    const calSome = outSome.v1!.facts_by_date["2026-01-11"].filter((f) => f.dimension === "calendar");
    expect(calSome.map((f) => f.label_fr)).toContain("week-end");
    const calPlain = outSome.v1!.facts_by_date["2026-01-10"].filter((f) => f.dimension === "calendar");
    expect(calPlain.map((f) => f.label_fr)).toContain("calendrier standard");
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
