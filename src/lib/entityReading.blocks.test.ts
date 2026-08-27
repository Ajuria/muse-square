// Blocs entité×période (27/08, « montre la donnée ») — le constructeur PUR rend un TABLEAU
// (Produit/Opération · Période · Résultat · Variation), les totaux en prose, les sources ;
// verdicts l.21, effet par occurrence dans SON KPI NOMMÉ, « — » + compte de jours sous les planchers.
import { describe, it, expect } from "vitest";
import { buildEntityPeriodBlocks, type EntityPeriodReading } from "./entityReading";

const pole = (totals: any): EntityPeriodReading => ({
  entity: { kind: "pole", id: "p1", name: "Pôle périssables", families: ["Coffee", "Bakery"] },
  start: "2026-06-01", end: "2026-08-27",
  pole: { totals, families: [
    { family: "Coffee", rev_eur: 45248, avg30_eur_day: 500, n30: 88, base_eur_day: 330, n_base: 88, delta_pct: 52 },
    { family: "Bakery", rev_eur: 300, avg30_eur_day: 100, n30: 3, base_eur_day: null, n_base: 0, delta_pct: null },
  ], operations: [
    { commitment_id: "op1", status: "open", verdict: null, committed_action_text: "Producteur invité — fromages", window_start: "2026-09-14", window_end: "2026-09-14", version_no: 1 },
  ] },
});

describe("buildEntityPeriodBlocks — tableau", () => {
  it("pôle : une ligne par famille + Ensemble du pôle ; variation sous plancher = « — » avec le compte de jours", () => {
    const b = buildEntityPeriodBlocks(pole({ rev30_eur: 59703, share_pct: 50.7, avg30_eur_day: 678, base_eur_day: 447, delta_pct: 51.7, n30: 88 }));
    expect(b.headline).toBe("Pôle périssables — du 01/06/2026 au 27/08/2026");
    expect(b.table!.cols.map((c: any) => c.label)).toEqual(["Produit", "Période", "Résultat", "Variation"]);
    const [coffee, bakery, total] = b.table!.rows;
    expect(coffee.cells[0].v).toBe("Coffee");
    expect(coffee.cells[2].v).toMatch(/45[\s  ]248 €/);
    expect(coffee.cells[3].v).toBe("+52 %");
    expect(bakery.cells[3].v).toBe("—");
    expect(bakery.cells[3].sub).toContain("3 j vendus");
    expect(total.cells[0].v).toBe("Ensemble du pôle");
    expect(total.cells[3].v).toBe("+51,7 %");
    expect(b.prose).toContain("50,7 % du CA du site sur la période");
    expect(b.prose).toContain("Producteur invité (14/09/2026)");
    expect(b.sources).toEqual(["Vos ventes par famille (lignes de caisse)"]);
  });
  it("série/personne : Opération · Dates · Verdict · Effet dans SON KPI nommé ; totaux sans moyenne de %", () => {
    const b = buildEntityPeriodBlocks({
      entity: { kind: "personne", id: null, name: "Julen", families: [] },
      start: "2026-08-01", end: "2026-08-31",
      serie: {
        occurrences: [
          { commitment_id: "a", name: "Corner de vente producteur", status: "resolved", verdict: "missed", window_start: "2026-08-22", window_end: "2026-08-22", effect_pct: -78.3, effect_proven: true, kpi_mention_fr: "sur le CA de la famille Coffee", gap_eur: -400 },
          { commitment_id: "b", name: "Vacances scolaires", status: "open", verdict: null, window_start: "2026-08-27", window_end: "2026-09-02", effect_pct: null, effect_proven: false, kpi_mention_fr: "", gap_eur: null },
        ],
        judged: 1, kept: 0, open_count: 1, gap_eur_sum: -400,
      },
    });
    const [r1, r2] = b.table!.rows;
    expect(r1.cells[2].v).toBe("objectif manqué");
    expect(r1.cells[3].v).toBe("−78,3 %");
    expect(r1.cells[3].sub).toBe("sur le CA de la famille Coffee — effet prouvé");
    expect(r2.cells[2].v).toBe("en cours");
    expect(b.prose).toBe("Sur la période : 1 verdict rendu, 0 objectif atteint, 1 en cours · écart CA cumulé des fenêtres mesurées : −400 €.");
    expect(b.prose).not.toMatch(/moyenne|manqué pour/i);
  });
});
