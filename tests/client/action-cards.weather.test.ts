// 06/09 (owner, N8) — « canicule » est un critère officiel (IBM 3 jours et 3 nuits, seuils
// départementaux) que lvl_heat (Tmax seule) ne vérifie pas : le mot ne sort plus d'une carte.
// Payload RÉEL du 06/09 (compte owner, weather_hazard_onset 'heat:2', 2 jours), jour résolu 15–29 °C.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Window } from "happy-dom";

function render(payload: any, day: any, type = "weather_hazard_onset") {
  const win: any = new Window({ url: "https://app.local/app/insightevent/pulse" });
  new Function("window", "document", readFileSync(resolve("public/js/action-cards.js"), "utf8"))(win, win.document);
  const row = { date: "2026-09-06", action_type: type, action_priority: 3, action_category: "weather", location_id: "f10c3e58-326e-4e38-947c-d59fcbe51df5", data_payload: payload };
  const out = win.renderActionCandidates([row], {}, day, "2026-09-06", "veille", {}, "2026-09-06") || [];
  expect(out.length).toBe(1);
  return String(out[0].tmpl.sowhat || "");
}
const DAY = { weather_label_fr: "Nuageux", temperature_2m_min: 14.8, temperature_2m_max: 29.2, lvl_heat: 2, lvl_rain: 0, lvl_wind: 0, lvl_snow: 0, lvl_cold: 0, wind_speed_10m_max: 9.7 };

describe("chaleur sans le mot « canicule »", () => {
  it("onset 'heat:2' → « Alerte météo (niveau sévère) … 15°C–29°C », jamais « canicule »", () => {
    const s = render({ signal_type: "weather_hazard_onset", old_value: "0", new_value: "heat:2", hazard_days: 2, direction: "worsened" }, DAY);
    expect(s).toMatch(/^Alerte météo \(niveau sévère\), 2 jours d’affilée\. Nuageux, 15°C–29°C\./);
    expect(s).not.toMatch(/canicule/i);
  });
  it("07/09 owner : niveau 3 et plus → « Alerte forte chaleur », le mot de la classe structurelle", () => {
    const s = render({ signal_type: "weather_hazard_onset", old_value: "0", new_value: "heat:3", hazard_days: 2, direction: "worsened" }, { ...DAY, lvl_heat: 3, temperature_2m_max: 33.1 });
    expect(s).toMatch(/^Alerte forte chaleur \(niveau/);
    expect(s).not.toMatch(/canicule/i);
  });
  it("un autre aléa garde son nom : 'wind:2' → « Alerte vent fort »", () => {
    const s = render({ signal_type: "weather_hazard_onset", old_value: "0", new_value: "wind:2", hazard_days: 1, direction: "worsened" }, { ...DAY, lvl_wind: 2, lvl_heat: 0 });
    expect(s).toMatch(/^Alerte vent fort \(niveau sévère\)/);
  });
});
