// Porte de merge (06/09, build 1 owner) : la carte heure sait dire la JOURNÉE ARRÊTÉE au lieu
// d'appeler « heure qui a manqué » la première heure d'une caisse fermée. Le payload est celui que
// le CTE candidat a PRODUIT sur BigQuery (06/09, preuve 3) pour le compte owner f10c3e58, vendredi
// 07/08/2026 : dernière vente 12 h, 13 h–18 h à zéro, 4e journée arrêtée en 90 jours.
// Le sujet est public/js/action-cards.js → le test vit dans tests/ (CLAUDE.md § Tests).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "hour_share_move", action_priority: 3, action_category: "performance",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

// Preuve 3 (BQ, 06/09) — data_payload du CTE hour_share_move, 07/08, verbatim.
const STOPPED_0708 = { transaction_hour: 13, hour_revenue: 0, expected_hour_revenue: 589, delta_eur: -589, delta_z: -2.93,
  direction: "collapse", day_revenue: 1169, expected_day_revenue: 2028, day_gap_eur: -859, typical_share: 0.05,
  hour_transactions: 0, n_occurrences_60d: null, first_occurrence_date: null, expected_hour_transactions: 125.8,
  typ_n: 8, baseline_same_regime_n: 4, is_school_holiday_flag: true, regime_mismatch_flag: false,
  is_day_stopped: true, last_sale_hour: 12, last_sale_time: "12:53", stop_hour: 13, typical_last_hour: 18, stopped_hours: 6,
  stopped_expected_revenue: 589, stopped_expected_transactions: 125.8, expected_revenue_until_stop: 1439,
  n_stopped_days_90d: 3, stopped_dates_90d: "10/05, 07/06, 08/07" };

describe("hour_share_move — journée arrêtée (build 1, owner 06/09)", () => {
  it("titre = la fin de journée, corps = dernière vente + queue à zéro + niveau à l'arrêt + récurrence", () => {
    const t = render(STOPPED_0708, "2026-08-07");
    expect(t.what).toBe("Aucune vente de 13 h à 19 h");
    expect(t.sowhat).toBe("Dernière vente à 12 h 53 ce vendredi. De 13 h à 19 h : 0 ticket contre 126 tickets et 589 € votre vendredi habituel sur ces heures. La journée faisait 1 169 € à 13 h contre 1 439 € d’habitude à cette heure, −859 € sur la journée. 4e journée arrêtée en 90 jours (10/05, 07/06, 08/07).");
    expect(t.sowhat).not.toMatch(/heure qui a manqué|15 h|entre 12 h/);
    expect(t.action).toBe("Actions conseillées : aucune vente enregistrée à partir de 13 h — fermeture, panne de caisse ou export incomplet ? Notez-le · sinon, laissez.");
  });
  it("sans la minute au payload, repli sur l'heure pleine", () => {
    const { last_sale_time: _m, ...noMin } = STOPPED_0708;
    expect(render(noMin, "2026-08-07").sowhat).toMatch(/^Dernière vente entre 12 h et 13 h ce vendredi\./);
  });
  it("sans le drapeau du mart, la carte heure ordinaire est inchangée", () => {
    const { is_day_stopped: _s, ...plain } = STOPPED_0708;
    const t = render({ ...plain, transaction_hour: 15, hour_revenue: 0, expected_hour_revenue: 137, delta_eur: -137 }, "2026-08-07");
    expect(t.what).toBe("Le créneau 15 h–16 h sous-performe");
    expect(t.sowhat).toMatch(/^Ce vendredi, ce créneau a fait 0 €/);
    expect(t.action).not.toMatch(/journée arrêtée|export incomplet/);
  });
});
