// 06/09 (audit P9) — copie bannie retirée des corps de cartes (lexique ligne 26 : la référence se
// nomme « votre vendredi habituel », jamais « l'attendu ») ; niveau de menace en français ; « ~ »
// → « ≈ » (le signe déjà rendu sur les chantiers structurels). Rendu par le VRAI kit.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

const TODAY = "2026-09-06";
function render(row: any) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(win, win.document);
  const out = win.renderActionCandidates([row], {}, null, TODAY, "veille", {}, TODAY) || [];
  expect(out.length).toBe(1);
  return { body: String(out[0].tmpl.sowhat || ""), action: String(out[0].tmpl.action || "") };
}
const LOC = "f10c3e58-326e-4e38-947c-d59fcbe51df5";

describe("copie P9", () => {
  it("créneau : « 47 contre 11 votre vendredi habituel », jamais « attendues »", () => {
    const r = render({ date: "2026-09-04", action_type: "hour_share_move", action_priority: 2, action_category: "performance", location_id: LOC,
      data_payload: { transaction_hour: 15, hour_revenue: 216, expected_hour_revenue: 48, delta_eur: 169, direction: "surge", day_gap_eur: 739, expected_hour_transactions: 11, hour_transactions: 47, typ_n: 8, baseline_same_regime_n: 6, is_school_holiday_flag: false, regime_mismatch_flag: false } });
    expect(r.body).toContain("Le gain vient des ventes (47 contre 11 votre vendredi habituel).");
    expect(r.body + r.action).not.toMatch(/attendu/);
  });
  it("conflit d'audience : « 50 % » avec espace insécable, niveau 'moderate' en français", () => {
    const r = render({ date: TODAY, action_type: "competitor_audience_conflict", action_priority: 3, action_category: "competition", location_id: LOC,
      data_payload: { competitor_name: "Musée de l'Orangerie", audience_overlap_pct: 50, entity_threat_level: "moderate" } });
    expect(r.body).toContain("Chevauchement : 50 %.");
    expect(r.body + r.action).not.toMatch(/moderate/);
  });
  it("trafic sans conversion : la fréquentation nomme sa référence (28 derniers jours), « ≈ 49 % d'ordinaire »", () => {
    const r = render({ date: "2026-09-02", action_type: "sales_traffic_not_converting", action_priority: 3, action_category: "performance", location_id: LOC,
      data_payload: { footfall_delta_pct: 120.6, conversion_delta_pct: -58.2, conversion_robust_z: -2.04, conversion_rate: 0.2, daily_visitors: 1810, daily_transactions: 362, score: 56, regime: "B", primary_revenue_driver: "footfall", confidence_tier: "possible" } });
    expect(r.body).toContain("fréquentation +121 % sur sa moyenne des 28 derniers jours");
    expect(r.body).toContain("contre ≈ 48 % d'ordinaire");
    expect(r.body).not.toMatch(/vs habitude|~/);
  });
  it("client régulier : « une tous les ≈ 12 j », plus de tilde", () => {
    const r = render({ date: TODAY, action_type: "client_dormant", action_priority: 3, action_category: "performance", location_id: LOC,
      data_payload: { party_label: "Épicerie du Port", order_count: 9, median_interval_days: 12, silence_days: 31, total_revenue: 4200 } });
    expect(r.body).toContain("une tous les ≈ 12 j");
    expect(r.body).not.toContain("~");
  });
});
