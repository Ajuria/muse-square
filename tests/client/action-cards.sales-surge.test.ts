// Porte de merge (06/09, audit N7) : le corps de la carte sales_surge et sa ligne d'action
// lisent la MÊME porte de signe (surgeDriverPick). Payloads RÉELS du compte owner
// (semantic.vw_insight_event_action_candidates, STARTS_WITH(location_id,"f10c3e58"),
// action_type = 'sales_surge', 01-04/09/2026) — dominant_factor 'basket' avec un panier
// NÉGATIF sur les quatre : avant la porte, le corps écrivait « la hausse vient du panier
// moyen (−6 %) » sous une ligne d'action qui disait « sans que le volume ni le panier ne
// montent ». Le sujet est public/js/action-cards.js → le test vit dans tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string, extra: Record<string, unknown> = {}, type = "sales_surge") {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: type, action_priority: 3, action_category: "sales", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload, ...extra };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { sowhat: string; action: string };
}

// 04/09 : payload réel — ventes −0,3 %, panier −6,1 %, dominant_factor 'basket'.
const P_0409 = { daily_revenue: 1595.35, expected_revenue: 856, residual_pct: 86.3, residual_z: 2.6, transactions_delta_pct: -0.3, basket_delta_pct: -6.1, dominant_factor: "basket", pressure_ratio: 0.78, weather_alert: 0, is_holiday: false, is_vacation: false, avg_30d: 1692, revenue_vs_avg_pct: -5.7, revenue_robust_z: 0.7, confidence_tier: "probable" };
// 03/09 : payload réel — ventes +2,8 %, panier −8,4 %, dominant_factor 'basket' (magnitude) : seul le volume monte.
const P_0309 = { daily_revenue: 1600.35, expected_revenue: 891, residual_pct: 79.7, residual_z: 2.44, transactions_delta_pct: 2.8, basket_delta_pct: -8.4, dominant_factor: "basket", pressure_ratio: 0.77, weather_alert: 0, is_holiday: false, is_vacation: false, avg_30d: 1686, revenue_vs_avg_pct: -5.1, revenue_robust_z: -0.16, confidence_tier: "possible" };

describe("sales_surge — corps et ligne d'action, une seule porte de signe", () => {
  it("aucun facteur ne monte → le corps ne nomme pas de cause, la ligne d'action le dit", () => {
    const t = render(P_0409, "2026-09-04");
    expect(t.sowhat).not.toMatch(/vient du panier moyen/);
    expect(t.sowhat).not.toMatch(/vient de l'affluence/);
    expect(t.action).toMatch(/sans que le volume ni le panier ne montent/);
  });
  it("seul le volume monte → corps et ligne d'action nomment le volume, pas le panier", () => {
    const t = render(P_0309, "2026-09-03");
    expect(t.sowhat).toMatch(/vient de l'affluence : \+3 % de ventes/);
    expect(t.sowhat).not.toMatch(/vient du panier moyen/);
    expect(t.action).toMatch(/la hausse vient du volume/);
  });
  it("le référentiel se lit à côté du jour habituel : « vendredi habituel (856 €) : +739 € »", () => {
    const t = render(P_0409, "2026-09-04");
    expect(t.sowhat).toMatch(/votre vendredi habituel \(856 €\) : \+739 €\./);
    expect(t.sowhat).not.toMatch(/\+739 € \(856 €\)/);
  });
});

// 06/09 — LES TROIS COUCHES (lot dbt ms_database#112) : valeurs RÉELLES du 04/09 (owner) lues dans
// fct_client_day_decomposition (_audit_scratch) : gap +718 € = volume +752 € + panier −33 € ; Tea +334, Coffee +295.
const DECOMP_0409 = { date: "2026-09-04", gap_eur: 718.35, volume_term_eur: 751.68, basket_term_eur: -33.33, dominant_factor: "transactions",
  top_families: [{ family: "Tea", revenue: 579.1, expected_revenue: 244.99, delta_eur: 334.11, revenue_share: 0.363, baseline_share: 0.2793 }, { family: "Coffee", revenue: 634.25, expected_revenue: 339.45, delta_eur: 294.8, revenue_share: 0.3976, baseline_share: 0.3871 }],
  families_delta_eur: 718.3, families_unexplained_eur: 0 };

describe("sales_surge — les trois couches quand la décomposition du jour est servie", () => {
  it("corps et ligne d'action en euros sur le référentiel du jour, familles nommées", () => {
    const t = render(P_0409, "2026-09-04", { decomposition: DECOMP_0409 });
    expect(t.sowhat).toContain("La hausse vient du volume (+752 €), pas du panier (−33 €). Familles : Tea +334 €, Coffee +295 €.");
    expect(t.action).toContain("la hausse vient du volume (volume +752 €, panier −33 € vs votre résultat habituel du jour)");
    expect(t.action).not.toMatch(/28 derniers jours/);
  });
  it("recul : le terme au signe du recul explique, l'autre est dit", () => {
    const t = render({ ...P_0409, daily_revenue: 640, expected_revenue: 877, residual_pct: -27, transactions_delta_pct: -20, basket_delta_pct: 2, primary_revenue_driver: null, revenue_robust_z: -2.2 }, "2026-09-04",
      { decomposition: { ...DECOMP_0409, gap_eur: -237, volume_term_eur: -260, basket_term_eur: 23, dominant_factor: "transactions", top_families: [{ family: "Coffee", delta_eur: -180 }, { family: "non classe", delta_eur: -40 }] } }, "sales_revenue_down_wow");
    expect(t.sowhat).toContain("Le recul vient du volume (−260 €), pas du panier (+23 €). Familles : Coffee −180 €.");
  });
});
