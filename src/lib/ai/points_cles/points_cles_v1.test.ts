// src/lib/ai/points_cles_v1.test.ts
import { describe, it, expect } from "vitest";
import { renderPointsClesV1 } from "./points_cles_v1";
import type { DeterministicRenderInput } from "./points_cles_v1";

function baseInput(
  overrides: Partial<DeterministicRenderInput> = {}
): DeterministicRenderInput {
  return {
    mode: "selected_day",

    // ✅ must be a real object with a valid YYYY-MM-DD date, otherwise renderPointsClesV1 returns null
    current_day: {
      date: "2026-01-21",
      opportunity_score_final_local: 50,
    },

    selection_days: [],
    current_special_labels: [],

    // ✅ must be an object if you want to spread/override it in tests
    location_context: {},

    ...overrides,
  };
}

describe("renderPointsClesV1 — fixtures v1", () => {
  it("Outdoor vs Indoor: same weather risk -> different weather sentence", () => {
    const riskyDay = {
      ...baseInput().current_day,
      precipitation_probability_max_pct: 70, // triggers risk
    };

    const outdoor = renderPointsClesV1(
      baseInput({
        current_day: riskyDay,
        location_context: { ...baseInput().location_context, is_outdoor_event: true },
      })
    );

    const indoor = renderPointsClesV1(
      baseInput({
        current_day: riskyDay,
        location_context: { ...baseInput().location_context, is_outdoor_event: false },
      })
    );

    expect(outdoor).not.toBeNull();
    expect(indoor).not.toBeNull();

    expect(outdoor!).toContain("Risque météo à intégrer");
    expect(indoor!).toContain("Risque météo surtout logistique");
  });

  it("Vacances: calendar label triggers the vacances sentence", () => {
    const out = renderPointsClesV1(
      baseInput({
        current_special_labels: ["Vacances scolaires (Zone C)"],
      })
    );

    expect(out).not.toBeNull();
    expect(out!).toContain("Période de vacances");
    expect(out!).toContain("audience locale possiblement réduite");
  });

  it("Competition 50km-only: uses 'peu susceptible d’impacter directement' and does NOT list the event details", () => {
    const out = renderPointsClesV1(
      baseInput({
        current_day: {
          ...baseInput().current_day,
          events_within_50km_count: 1,
          top_events_50km: [
            {
              event_label: 'Exposition "Dentelles de papier"',
              city_name: "Alès",
              distance_m: 36400,
              industry_code: "exposition",
              description: "Longue description à ne PAS répéter dans À noter.",
              event_uid: "evt_1",
            },
          ],
        },
      })
    );

    expect(out).not.toBeNull();

    // Synthèse concurrence (ton dernier wording)
    expect(out!).toContain("peu susceptible d’impacter directement votre événement");

    // À noter: should mention nearest competitor in a single sentence
    expect(out!).toMatch(/L’événement concurrent le plus proche est/i);

    // Should NOT dump the description or the full event label (avoid repeating raw data)
    expect(out!).not.toContain("Longue description à ne PAS répéter");
    expect(out!).not.toContain("Dentelles de papier");
  });
});
