// 06/09 (audit P1) — une carte de fait à régime contredit (regime_mismatch_flag) ne reçoit jamais
// le €/an de sa population au coin : enjeu null, corner_day_mode (écart du jour de l'objet).
import { describe, expect, it } from "vitest";
import { enjeuWithReasonForCandidate } from "./dayClassRegistry";

const impact = (key: string) => ({ class_key: key, eur_year: 2597, tier: "measured", n_days: 8, span_months: 5, label_fr: "créneaux qui ont surperformé" });
const result: any = { impacts: new Map([["pop_hour_carry", impact("pop_hour_carry")]]), conditionByDate: new Map(), calendarByDate: new Map() };

describe("porte de régime — coin", () => {
  it("regime_mismatch_flag → enjeu null, corner_day_mode ; sans le drapeau → €/an de population", () => {
    const flagged = enjeuWithReasonForCandidate(result, { action_type: "hour_share_move", date: "2026-09-04", data_payload: { delta_eur: 169, direction: "surge", regime_mismatch_flag: true, baseline_same_regime_n: 4, typ_n: 30 } });
    expect(flagged.enjeu).toBeNull();
    expect(flagged.corner_day_mode).toBe(true);
    const clean = enjeuWithReasonForCandidate(result, { action_type: "hour_share_move", date: "2026-09-04", data_payload: JSON.stringify({ delta_eur: 169, direction: "surge", regime_mismatch_flag: false, baseline_same_regime_n: 6, typ_n: 8 }) });
    // 06/09 (audit P4) : la population ne prend plus le coin (enjeu null, corner_day_mode), elle est
    // servie à côté pour le ⓘ ; absente sur une carte à régime contredit.
    expect(clean.enjeu).toBeNull();
    expect(clean.corner_day_mode).toBe(true);
    expect(clean.population_enjeu?.eur_year).toBe(2597);
    expect(flagged.population_enjeu ?? null).toBeNull();
  });
});
