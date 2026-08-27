// Blocs de réponse entité×période (C4, 27/08) — le constructeur PUR : verdicts l.21, effet par
// occurrence dans SON KPI, sommes € sur le seul référentiel CA, « Données insuffisantes ».
import { describe, it, expect } from "vitest";
import { buildEntityPeriodBlocks, type EntityPeriodReading } from "./entityReading";

const pole = (totals: any): EntityPeriodReading => ({
  entity: { kind: "pole", id: "p1", name: "Pôle périssables", families: ["Coffee", "Bakery"] },
  start: "2026-06-01", end: "2026-08-27",
  pole: { totals, families: [
    { family: "Coffee", avg30_eur_day: 500, n30: 88, base_eur_day: 330, n_base: 88, delta_pct: 52 },
    { family: "Bakery", avg30_eur_day: 100, n30: 3, base_eur_day: null, n_base: 0, delta_pct: null },
  ], operations: [] },
});

describe("buildEntityPeriodBlocks", () => {
  it("pôle mesurable : la carte porte € (j vendus) · poids · écart vs la même durée précédente", () => {
    const b = buildEntityPeriodBlocks(pole({ rev30_eur: 59703, share_pct: 50.7, avg30_eur_day: 678, base_eur_day: 447, delta_pct: 51.7, n30: 88 }));
    expect(b.headline).toBe("Pôle périssables — du 01/06/2026 au 27/08/2026");
    expect(b.card.pill).toMatch(/59[\s  ]703 € \(88 j vendus\) · 50,7 % du CA · \+51,7 % vs la même durée précédente/);
    expect(b.card.rows[0].v).toBe("Coffee +52 % · Bakery");
  });
  it("sous les planchers : « Données insuffisantes » + le détail en infobulle, jamais un %", () => {
    const b = buildEntityPeriodBlocks(pole({ rev30_eur: null, share_pct: null, avg30_eur_day: null, base_eur_day: null, delta_pct: null, n30: 3 }));
    expect(b.card.pill).toBe("Données insuffisantes ⓘ");
    expect(b.card.tip).toContain("3 jours vendus sur la période");
  });
  it("série/personne : verdicts l.21 par occurrence dans SON KPI, totaux sans moyenne de %", () => {
    const b = buildEntityPeriodBlocks({
      entity: { kind: "personne", id: null, name: "Julen", families: [] },
      start: "2026-08-01", end: "2026-08-31",
      serie: {
        occurrences: [
          { commitment_id: "a", name: "Corner", status: "resolved", verdict: "missed", window_start: "2026-08-22", window_end: "2026-08-22", effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA famille", gap_eur: -400 },
          { commitment_id: "b", name: "Vacances", status: "open", verdict: null, window_start: "2026-08-27", window_end: "2026-09-02", effect_pct: null, effect_proven: false, kpi_mention_fr: "", gap_eur: null },
        ],
        judged: 1, kept: 0, open_count: 1, gap_eur_sum: -400,
      },
    });
    expect(b.prose).toContain("Le 22/08/2026 : « Corner » — objectif manqué. −78,3 % sur le CA famille (effet prouvé).");
    expect(b.prose).toContain("Du 27/08/2026 au 02/09/2026 : « Vacances » — en cours.");
    expect(b.prose).toContain("Sur la période : 1 verdict rendu, 0 objectif atteint, 1 en cours · écart CA cumulé des fenêtres mesurées : −400 €.");
    expect(b.prose).not.toMatch(/moyenne/i);
  });
});
