import { describe, expect, it } from "vitest";
import { journalPlan } from "./journalPlan";

// Le parc réel ne porte AUCUN effet positif prouvé (mesuré 27/08 : un seul effet au-delà de
// |z| >= 1 dans toute la base, et il est négatif). La branche « rejouez-le » est donc invérifiable
// en production — mais parfaitement testable sur fixture, ce que fait ce fichier. C'est la seule
// façon de ne pas la découvrir le jour où elle s'allume.
function bqStub(commitments: any[], days: any[]) {
  return {
    query: async ({ query }: { query: string }) =>
      query.includes("action_commitments") ? [commitments] : [days],
  };
}

const jourJ = new Date().toISOString().slice(0, 10);

describe("journalPlan — la branche REJEU (effet positif prouvé)", () => {
  const positif = {
    commitment_id: "c1",
    committed_action_text: "Coupon café glacé — offert dès 2 boissons",
    window_active_factors: "heat",
    window_residual_pct: 18.4,
    window_residual_z: 2.1,          // au-delà du seuil de preuve
    window_start: "2026-07-04",
    window_end: "2026-07-04",
    status: "resolved",
  };
  const jourChaud = { date: jourJ, f_heat: true, f_school_holiday: false };

  it("propose le rejeu quand le jour à venir réunit les conditions du test prouvé", async () => {
    const p = await journalPlan(bqStub([positif], [jourChaud]) as any, "loc", 14);
    expect(p).toHaveLength(1);
    expect(p[0].direction).toBe("positive");
    expect(p[0].say_fr).toContain("Coupon café glacé");
    expect(p[0].say_fr).toContain("effet positif");
    expect(p[0].say_fr).toContain("+18,4 %");
    expect(p[0].say_fr).toContain("C'est le jour pour le rejouer.");
  });

  it("porte un prefill d'engagement — action et fenêtre du test prouvé, PAS de cible inventée", async () => {
    const p = await journalPlan(bqStub([positif], [jourChaud]) as any, "loc", 14);
    expect(p[0].prefill).toEqual({
      committed_action_text: "Coupon café glacé",
      window_kind: "day_of",           // le test prouvé durait un jour
    });
    expect(Object.keys(p[0].prefill!)).not.toContain("thr");
  });

  it("la fenêtre du rejeu suit celle du test prouvé", async () => {
    const surSeptJours = { ...positif, window_end: "2026-07-10" };
    const p = await journalPlan(bqStub([surSeptJours], [jourChaud]) as any, "loc", 14);
    expect(p[0].prefill!.window_kind).toBe("7d");
  });

  it("un effet NÉGATIF ne propose jamais de rejeu — il contre-indique, sans prefill", async () => {
    const negatif = { ...positif, window_residual_pct: -23.2, window_residual_z: -1.26 };
    const p = await journalPlan(bqStub([negatif], [jourChaud]) as any, "loc", 14);
    expect(p[0].direction).toBe("negative");
    expect(p[0].prefill).toBeNull();
    expect(p[0].say_fr).toContain("Ne pas le rejouer");
  });
});

describe("journalPlan — les portes", () => {
  const base = {
    commitment_id: "c1", committed_action_text: "Coupon café glacé — X", window_active_factors: "heat",
    window_residual_pct: 18.4, window_start: "2026-07-04", window_end: "2026-07-04", status: "resolved",
  };

  it("sous le seuil de preuve, RIEN n'est proposé (l'effet est dans le bruit)", async () => {
    const p = await journalPlan(bqStub([{ ...base, window_residual_z: 0.6 }], [{ date: jourJ, f_heat: true }]) as any, "loc", 14);
    expect(p).toHaveLength(0);
  });

  it("le jour doit réunir TOUTES les conditions du test, pas une seule", async () => {
    const deuxConditions = { ...base, window_residual_z: 2.1, window_active_factors: "heat,school_holiday" };
    const jourPartiel = { date: jourJ, f_heat: true, f_school_holiday: false };
    expect(await journalPlan(bqStub([deuxConditions], [jourPartiel]) as any, "loc", 14)).toHaveLength(0);
    const jourComplet = { date: jourJ, f_heat: true, f_school_holiday: true };
    expect(await journalPlan(bqStub([deuxConditions], [jourComplet]) as any, "loc", 14)).toHaveLength(1);
  });

  it("un engagement OUVERT n'est jamais une preuve", async () => {
    const p = await journalPlan(bqStub([{ ...base, window_residual_z: 2.1, status: "open" }], [{ date: jourJ, f_heat: true }]) as any, "loc", 14);
    expect(p).toHaveLength(0);
  });

  it("un test sans condition enregistrée ne se croise avec rien", async () => {
    const p = await journalPlan(bqStub([{ ...base, window_residual_z: 2.1, window_active_factors: null }], [{ date: jourJ, f_heat: true }]) as any, "loc", 14);
    expect(p).toHaveLength(0);
  });
});

describe("journalPlan — l'effet se lit sur le KPI choisi (correctif 27/08)", () => {
  const jourChaud = { date: jourJ, f_heat: true };
  // Le cas RÉEL du corner : résidu CA sous le seuil (−0,58) mais KPI choisi AU-DELÀ (−1,07).
  // Avant le correctif, ce test n'était pas une preuve — la contre-indication le ratait.
  const kpiProuve = {
    commitment_id: "k1", committed_action_text: "Corner de vente producteur — X",
    window_active_factors: "heat", status: "resolved",
    window_residual_pct: -11.9, window_residual_z: -0.58,
    measured_metric: "family_revenue",
    kpi_delta_pct: -78.3, kpi_baseline: 64.5, kpi_window_value: 14.0, kpi_noise_se: 47.3,
    window_start: "2026-08-22", window_end: "2026-08-22",
  };

  it("un effet prouvé sur le KPI choisi contre-indique, même si le CA est dans le bruit", async () => {
    const p = await journalPlan(bqStub([kpiProuve], [jourChaud]) as any, "loc", 14);
    expect(p).toHaveLength(1);
    expect(p[0].direction).toBe("negative");
    expect(p[0].say_fr).toContain("−78,3 % sur le CA famille");
    expect(p[0].say_fr).not.toContain("11,9");
  });

  it("l'inverse : CA au-delà du seuil mais KPI choisi dans le bruit → PAS une preuve", async () => {
    const caFortKpiBruit = { ...kpiProuve, window_residual_z: -1.5, kpi_delta_pct: -50.2, kpi_baseline: 56.2, kpi_window_value: 28.0, kpi_noise_se: 47.04 };
    expect(await journalPlan(bqStub([caFortKpiBruit], [jourChaud]) as any, "loc", 14)).toHaveLength(0);
  });
});
