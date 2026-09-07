// Porte de merge (06/09, build 2 owner) : la carte heure NOMME les familles qui manquent (ou portent)
// à cette heure — calculées au mart (hour_family_gaps), plus rien à demander à l'exploitant. Les deux
// payloads sont ceux que le CTE candidat a PRODUITS sur BigQuery (06/09, preuve 3 build 2) pour le
// compte owner f10c3e58 : 09/08 14 h (retrait) et 28/08 16 h (hausse).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: Record<string, unknown>, date: string) {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  const src = readFileSync(resolve("public/js/action-cards.js"), "utf8");
  new Function("window", "document", src)(win, win.document);
  const row = { date, action_type: "hour_share_move", action_priority: 2, action_category: "performance",
    location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, null, date, "pulse", null, date) || [];
  expect(out.length).toBe(1);
  return out[0].tmpl as { what: string; sowhat: string; action: string };
}

const COLLAPSE_0809 = { transaction_hour: 14, hour_revenue: 33, expected_hour_revenue: 158, delta_eur: -125, delta_z: -3.1,
  direction: "collapse", day_revenue: 1823, expected_day_revenue: 1985, day_gap_eur: -162, typical_share: 0.0795,
  hour_transactions: 9, n_occurrences_60d: 1, first_occurrence_date: "2026-08-09", expected_hour_transactions: 29.9,
  typ_n: 8, baseline_same_regime_n: 5, is_school_holiday_flag: true, regime_mismatch_flag: false, is_day_stopped: false,
  hour_family_gaps: [{ delta: -48, expected: 70, family: "Coffee", revenue: 22 }, { delta: -41, expected: 52, family: "Tea", revenue: 11 },
    { delta: -23, expected: 23, family: "Bakery", revenue: 0 }] };
const SURGE_0828 = { transaction_hour: 16, hour_revenue: 186, expected_hour_revenue: 83, delta_eur: 103, delta_z: 2.85,
  direction: "surge", day_revenue: 1461, expected_day_revenue: 1630, day_gap_eur: -169, typical_share: 0.0511,
  hour_transactions: 39, n_occurrences_60d: 1, first_occurrence_date: "2026-08-28", expected_hour_transactions: 18.4,
  typ_n: 7, baseline_same_regime_n: 6, is_school_holiday_flag: true, regime_mismatch_flag: false, is_day_stopped: false,
  hour_family_gaps: [{ delta: 56, expected: 41, family: "Coffee", revenue: 97 }, { delta: 28, expected: 25, family: "Tea", revenue: 53 },
    { delta: 15, expected: 4, family: "Drinking Chocolate", revenue: 19 }] };

describe("hour_share_move — familles de l'heure nommées (build 2, owner 06/09)", () => {
  it("retrait : les familles qui manquent, forme « X contre Y d'habitude à cette heure »", () => {
    const t = render(COLLAPSE_0809, "2026-08-09");
    expect(t.what).toBe("Le créneau 14 h–15 h sous-performe");
    expect(t.sowhat).toContain("Familles : Coffee 22 € contre 70 € d’habitude à cette heure, Tea 11 € contre 52 €, Bakery 0 € contre 23 €.");
    // 07/09 (owner) : la ligne d'action TRANCHE — moteur + familles nommées, aucune question.
    expect(t.action).toBe("Il est venu moins de monde à 14 h (9 tickets contre 30) et ils ont moins acheté : c’est Coffee (22 € contre 70 €) et Tea (11 € contre 52 €) qui ont manqué, pas votre offre ; la journée est à −162 €.");
  });
  it("hausse : les familles qui portent", () => {
    const t = render(SURGE_0828, "2026-08-28");
    expect(t.sowhat).toContain("Familles : Coffee 97 € contre 41 € d’habitude à cette heure, Tea 53 € contre 25 €, Drinking Chocolate 19 € contre 4 €.");
    // Le reste de la journée a perdu plus que le créneau n'a gagné (−272 € pour +103 €) : déplacement, rien à changer.
    expect(t.action).toBe("Ce créneau n’a pas gagné de clients, il en a pris au reste de la journée : −272 € ailleurs pour +103 € à 16 h. Rien à changer à 16 h ; la journée est à −169 €.");
    expect(t.action).not.toMatch(/regardez si|même monde/);
  });
  it("hausse non compensée : prévoir les familles qui ont porté, moteur nommé", () => {
    const t = render({ ...SURGE_0828, day_gap_eur: 300 }, "2026-08-28");
    expect(t.action).toBe("Action conseillée : vendredi prochain, prévoyez Coffee (97 € contre 41 €) et Tea (53 € contre 25 €) dès 16 h : le monde en plus est réel (39 tickets contre 18).");
  });
  it("retrait compensé ailleurs : déplacement, rien à changer", () => {
    const t = render({ ...COLLAPSE_0809, day_gap_eur: 200 }, "2026-08-09");
    expect(t.action).toBe("Les clients de 14 h sont venus à une autre heure : +325 € ailleurs pour −125 € à 14 h. Rien à changer à 14 h ; la journée est à +200 €.");
  });
  it("une famille du signe opposé ne s'écrit pas ; sans payload, rien", () => {
    const t = render({ ...COLLAPSE_0809, hour_family_gaps: [{ delta: 30, expected: 10, family: "Tea", revenue: 40 }, { delta: -48, expected: 70, family: "Coffee", revenue: 22 }] }, "2026-08-09");
    expect(t.sowhat).toContain("Familles : Coffee 22 € contre 70 € d’habitude à cette heure.");
    expect(t.sowhat).not.toMatch(/Tea/);
    const { hour_family_gaps: _g, ...none } = COLLAPSE_0809;
    expect(render(none, "2026-08-09").sowhat).not.toMatch(/Familles/);
  });
});
