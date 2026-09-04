// I9 (owner 04/09) — le fait d'un jour PASSÉ non mesuré. Pur ; chaque assertion vue tomber par mutation.
import { describe, it, expect } from "vitest";
import { unmeasuredPastDayFacts, nextDailyRunFr } from "./buildDayPerformanceFacts";
// toLocaleString("fr-FR") écrit les milliers en U+202F : on compare sur l'espace simple.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, " ");

describe("unmeasuredPastDayFacts", () => {
  it("la phrase owner : le jour n'est pas encore dans les ventes, le traitement de nuit, le dernier jour mesuré avec son jour de semaine", () => {
    // Vendredi 04/09/2026 10:00 Paris (08:00 UTC) : le run de 05:00 UTC est passé → demain (samedi) 7 h 10.
    const f = unmeasuredPastDayFacts("2026-09-03", { date: "2026-09-02", ca: 1439, res_pct: 70 }, new Date("2026-09-04T08:00:00Z"));
    expect(f).toHaveLength(1);
    expect(plain(f[0].fact_fr)).toBe("Le 03/09/2026 n'est pas encore dans vos ventes : il sera dans la base de données demain matin, à partir de 7 h 10. Dernier jour mesuré : mercredi 02/09/2026, 1 439 €, +70 % vs votre CA habituel.");
    expect(f[0].claim_type).toBe("observed_difference");
  });
  it("aucun jour mesuré → la première phrase seule, jamais un habituel inventé", () => {
    const f = unmeasuredPastDayFacts("2026-09-03", null, new Date("2026-09-04T08:00:00Z"));
    expect(f).toHaveLength(1);
    expect(f[0].fact_fr).toBe("Le 03/09/2026 n'est pas encore dans vos ventes : il sera dans la base de données demain matin, à partir de 7 h 10.");
    expect(f[0].fact_fr).not.toMatch(/habituel/);
  });
  it("jamais « CA habituel pour un jeudi » (le fait qui invitait le référentiel croisé)", () => {
    const f = unmeasuredPastDayFacts("2026-09-03", { date: "2026-09-02", ca: 1439, res_pct: 70 });
    expect(f.map((x) => x.fact_fr).join(" ")).not.toMatch(/habituel pour un/);
  });
});

describe("nextDailyRunFr — l'heure du job dbt (05:10 UTC, lundi-samedi), en heure de Paris", () => {
  it("avant le run du jour → « ce matin » ; après → « demain matin » ; samedi après le run → « lundi matin »", () => {
    expect(nextDailyRunFr(new Date("2026-09-04T04:00:00Z"))).toBe("ce matin, à partir de 7 h 10");      // vendredi 06:00 Paris
    expect(nextDailyRunFr(new Date("2026-09-04T08:00:00Z"))).toBe("demain matin, à partir de 7 h 10");   // vendredi 10:00 Paris
    expect(nextDailyRunFr(new Date("2026-09-05T08:00:00Z"))).toBe("lundi matin, à partir de 7 h 10");    // samedi 10:00 Paris — pas de run le dimanche
    expect(nextDailyRunFr(new Date("2026-09-06T08:00:00Z"))).toBe("demain matin, à partir de 7 h 10");   // dimanche → lundi
  });
  it("l'hiver, le même run UTC tombe à 6 h 10 à Paris — l'heure est calculée, jamais écrite en dur", () => {
    expect(nextDailyRunFr(new Date("2026-12-03T10:00:00Z"))).toBe("demain matin, à partir de 6 h 10");
  });
});
