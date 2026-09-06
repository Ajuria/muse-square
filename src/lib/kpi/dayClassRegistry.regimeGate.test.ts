// 06/09 (audit P1) — une carte de fait à régime contredit (regime_mismatch_flag) ne reçoit jamais
// le €/an de sa population au coin : enjeu null, corner_day_mode (écart du jour de l'objet).
import { describe, expect, it } from "vitest";
import { enjeuWithReasonForCandidate, motifContextForCandidate } from "./dayClassRegistry";

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

describe("06/09 (audit P4) — cartes à classe de contexte", () => {
  it("competitor_event_launch : plus de €/an de classe au coin, la classe est le contexte", () => {
    const res: any = { impacts: new Map([["events_high", { class_key: "events_high", eur_year: 13513, tier: "mesuré", tier_label_fr: "mesuré", entangled: false, n_days: 66, span_months: 5, avg_gap_eur: 205, t_stat: 2, label_fr: "jours à forte densité d'événements" }]]), conditionByDate: new Map(), calendarByDate: new Map() };
    const r = enjeuWithReasonForCandidate(res, { action_type: "competitor_event_launch", date: "2026-09-06", data_payload: {} });
    expect(r.enjeu).toBeNull();
    expect(r.context_motif?.class_key).toBe("events_high");
    expect(r.context_motif?.inherited).not.toBe(true);
  });
});

describe("06/09 (audit P7) — l'héritage du motif suit la nature de la carte", () => {
  const heat = { class_key: "heat_25_27", eur_year: -8056, tier: "mesuré", tier_label_fr: "mesuré", entangled: false, n_days: 40, span_months: 5, avg_gap_eur: -104, t_stat: -2, label_fr: "jours à 25–27 °C" };
  const res: any = { impacts: new Map([["heat_25_27", heat]]), conditionByDate: new Map([["2026-09-06", "heat_25_27"]]), calendarByDate: new Map([["2026-09-06", { school: false, holiday: false }]]) };
  it("rentrée (commercial_event_match) hors vacances → aucun motif, jamais la météo", () => {
    expect(motifContextForCandidate(res, { action_type: "commercial_event_match", date: "2026-09-06" })).toBeNull();
  });
  it("une anomalie ventes le même jour hérite toujours du motif météo", () => {
    expect(motifContextForCandidate(res, { action_type: "sales_surge", date: "2026-09-06" })?.class_key).toBe("heat_25_27");
  });
});
