import { describe, expect, it } from "vitest";
import { commitmentEffect } from "./commitmentEffect";

describe("commitmentEffect — l'effet se lit sur le KPI choisi", () => {
  it("K1 (revenue_residual) : le résidu de CA, comme avant", () => {
    const e = commitmentEffect({ measured_metric: "revenue_residual", window_residual_pct: -23.2, window_residual_z: -1.26 });
    expect(e).toMatchObject({ pct: -23.2, z: -1.26, kpi: "revenue_residual", kpi_mention_fr: "" });
  });

  it("metric absent (historique pré-colonne) : K1 aussi", () => {
    const e = commitmentEffect({ measured_metric: null, window_residual_pct: 5, window_residual_z: 0.4 });
    expect(e.kpi).toBe("revenue_residual");
    expect(e.pct).toBe(5);
  });

  it("KPI non-K1 : kpi_delta_pct + z = (val − base) / SE, et la mention du référentiel", () => {
    // Le cas RÉEL du corner (22/08) : le CA disait −11,9 % « dans le bruit », le KPI choisi
    // dit −78,3 % et FRANCHIT le seuil de preuve.
    const e = commitmentEffect({
      measured_metric: "family_revenue",
      window_residual_pct: -11.9, window_residual_z: -0.58,
      kpi_delta_pct: -78.3, kpi_baseline: 64.5, kpi_window_value: 14.0, kpi_noise_se: 47.3,
    });
    expect(e.pct).toBe(-78.3);
    expect(e.z).toBeCloseTo(-1.07, 2);
    expect(e.kpi_mention_fr).toBe("sur le CA famille");
  });

  it("SE nul ou absent : z null — on n'affirme rien, jamais un z inventé", () => {
    const e = commitmentEffect({ measured_metric: "basket", kpi_delta_pct: 12, kpi_baseline: 4.5, kpi_window_value: 5.1, kpi_noise_se: null });
    expect(e.pct).toBe(12);
    expect(e.z).toBeNull();
  });

  it("valeurs BigQuery encapsulées ({value}) : aplaties", () => {
    const e = commitmentEffect({
      measured_metric: { value: "transactions" },
      kpi_delta_pct: { value: 9.1 }, kpi_baseline: { value: 100 }, kpi_window_value: { value: 120 }, kpi_noise_se: { value: 10 },
    });
    expect(e.z).toBeCloseTo(2, 5);
    expect(e.kpi_mention_fr).toBe("sur les ventes");
  });
});
