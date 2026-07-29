// Couverture du mapping levier — étape 2 « méthodes pertinentes » (27/07).
// GARANTIE : chaque origin d'engagement du registre (commitmentOrigins) route vers un levier
// EXPLICITE ou une règle de préfixe/driver assumée — jamais vers le fallback « conversion »
// par accident (avant l'étape 2, ~75 des 80+ sous-types y retombaient en silence).
import { describe, it, expect } from "vitest";
import { leverForActionType } from "./bestInClassStore";
import { COMMITMENT_ORIGIN_ACTION_TYPES } from "./commitmentOrigins";

// Types dont le levier dépend du DRIVER de la carte (cartes ventes K1) — le type seul n'a
// volontairement PAS d'entrée explicite ; sans driver ils retombent sur « conversion » (assumé).
const DRIVER_DECIDED = new Set([
  "sales_surge",
  "sales_revenue_down_wow",
  "footfall_vs_basket_decomposition",
  "chat_decision_salesdecomp",
  "weekly_briefing", // digest hebdo — pas un levier propre, conversion assumé
]);

describe("leverForActionType — couverture du registre des origins", () => {
  it("chaque origin du registre a un levier assumé (explicite, driver ou préfixe) — pas de fallback accidentel", () => {
    const accidental: string[] = [];
    for (const t of COMMITMENT_ORIGIN_ACTION_TYPES) {
      if (DRIVER_DECIDED.has(t)) continue;
      // Un type au fallback accidentel renverrait « conversion » SANS entrée explicite : on le
      // détecte en vérifiant qu'un driver contradictoire ne change pas le résultat (une entrée
      // explicite gagne sur le driver ; un fallback perdrait contre lui).
      const noDriver = leverForActionType(t);
      const withDriver = leverForActionType(t, "basket");
      if (noDriver === "conversion" && withDriver === "panier") accidental.push(t);
    }
    expect(accidental, `types au fallback accidentel : ${accidental.join(", ")}`).toEqual([]);
  });

  it("familles → leviers attendus", () => {
    expect(leverForActionType("weather_worsened")).toBe("frequentation");
    expect(leverForActionType("tourist_high_season")).toBe("frequentation");
    expect(leverForActionType("mobility_disruption")).toBe("frequentation");
    expect(leverForActionType("competitor_price_drop")).toBe("yield");
    expect(leverForActionType("sales_discount_no_lift")).toBe("yield");
    expect(leverForActionType("competitor_review_surge")).toBe("fidelisation");
    expect(leverForActionType("review_solicitation")).toBe("fidelisation");
    expect(leverForActionType("sales_competition_cannibalization")).toBe("fidelisation");
    expect(leverForActionType("sales_traffic_not_converting")).toBe("conversion");
    expect(leverForActionType("competitor_positioning_gap")).toBe("conversion");
  });

  it("cartes ventes : le driver décide", () => {
    expect(leverForActionType("sales_revenue_down_wow", "basket")).toBe("panier");
    expect(leverForActionType("sales_revenue_down_wow", "footfall")).toBe("frequentation");
    expect(leverForActionType("sales_revenue_down_wow", "transactions")).toBe("frequentation");
    expect(leverForActionType("sales_surge", "conversion")).toBe("conversion");
    expect(leverForActionType("sales_revenue_down_wow")).toBe("conversion"); // sans driver : inchangé
    // ... mais jamais sur un type à levier propre :
    expect(leverForActionType("sales_discount_no_lift", "basket")).toBe("yield");
  });

  it("chantiers structurels : préfixe → frequentation, sauf leviers propres", () => {
    expect(leverForActionType("structural_school_holiday")).toBe("frequentation");
    expect(leverForActionType("structural_heat")).toBe("frequentation");
    expect(leverForActionType("structural_discount_no_lift")).toBe("yield");
    expect(leverForActionType("structural_traffic_high")).toBe("conversion");
  });
});
