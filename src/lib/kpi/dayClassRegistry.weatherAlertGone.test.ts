// 06/09 (audit N2) — une carte d'alerte météo émise sur une prévision révisée à la baisse n'a
// plus d'objet. Cas réel du 06/09 (compte owner) : candidates 'heat:2' / alert_level 2, contexte
// du jour alert_level_max 1.
import { describe, expect, it } from "vitest";
import { weatherAlertGone } from "./dayClassRegistry";

const result = (alert: number | null): any => ({
  impacts: new Map(), conditionByDate: new Map(), calendarByDate: new Map(),
  alertByDate: alert == null ? new Map() : new Map([["2026-09-06", alert]]),
});

describe("weatherAlertGone", () => {
  it("onset heat:2 avec alerte du jour retombée à 1 → la carte tombe", () => {
    expect(weatherAlertGone(result(1), { action_type: "weather_hazard_onset", date: "2026-09-06", data_payload: { new_value: "heat:2" } })).toBe(true);
  });
  it("extended_bad_weather alert_level 2, jour à 1 → tombe ; jour à 2 → reste", () => {
    const c = { action_type: "extended_bad_weather", date: { value: "2026-09-06" }, data_payload: JSON.stringify({ alert_level: 2, consecutive_bad_days: 1 }) };
    expect(weatherAlertGone(result(1), c)).toBe(true);
    expect(weatherAlertGone(result(2), c)).toBe(false);
  });
  it("sans lecture du jour → on garde ; type hors périmètre → on garde", () => {
    expect(weatherAlertGone(result(null), { action_type: "weather_hazard_onset", date: "2026-09-06", data_payload: { new_value: "heat:2" } })).toBe(false);
    expect(weatherAlertGone(result(0), { action_type: "sales_surge", date: "2026-09-06", data_payload: {} })).toBe(false);
  });
  it("onset de niveau 1 ne tombe que sans aucune alerte", () => {
    const c = { action_type: "weather_hazard_onset", date: "2026-09-06", data_payload: { new_value: "wind:1" } };
    expect(weatherAlertGone(result(1), c)).toBe(false);
    expect(weatherAlertGone(result(0), c)).toBe(true);
  });
});
