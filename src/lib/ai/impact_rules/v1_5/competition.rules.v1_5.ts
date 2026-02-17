import type { ImpactRuleAssetV1_5 } from "./impact_rule_asset.v1_5";

export const COMPETITION_RULES_V1_5: ImpactRuleAssetV1_5[] = [
  // Regime 1 — Substitution directe (offres similaires)
  {
    id: "C1",
    dimension: "competitive_proximity",
    regime: "Regime 1 — Substitution directe (offres similaires)",
    if: "IF an event of similar nature is located very close",
    then:
      "THEN treat it as a direct substitute for attendance, not as additive demand.",
  },
  {
    id: "C2",
    dimension: "competitive_proximity",
    regime: "Regime 1 — Substitution directe (offres similaires)",
    if: "IF multiple similar offers are accessible within the same visitor choice set",
    then:
      "THEN do not model expected attendance as independent across events.",
  },
  {
    id: "C3",
    dimension: "competitive_proximity",
    regime: "Regime 1 — Substitution directe (offres similaires)",
    if: "IF a new competing offer opens nearby",
    then:
      "THEN assume redistribution of existing demand rather than net demand creation.",
  },
  {
    id: "C4",
    dimension: "competitive_proximity",
    regime: "Regime 1 — Substitution directe (offres similaires)",
    if: "IF competing offers are geographically close",
    then:
      "THEN do not rely on secondary differentiators to neutralize competition.",
  },

  // Regime 2 — Zones de chalandise et chevauchement
  {
    id: "C5",
    dimension: "competitive_proximity",
    regime: "Regime 2 — Zones de chalandise et chevauchement",
    if: "IF catchment areas overlap",
    then:
      "THEN competitive pressure exists regardless of administrative or theoretical market boundaries.",
  },
  {
    id: "C6",
    dimension: "competitive_proximity",
    regime: "Regime 2 — Zones de chalandise et chevauchement",
    if: "IF an event sits in a zone of strong catchment overlap",
    then:
      "THEN expect the highest competitive pressure from nearby offers, not distant ones.",
  },
  {
    id: "C7",
    dimension: "competitive_proximity",
    regime: "Regime 2 — Zones de chalandise et chevauchement",
    if: "IF visitors can reasonably choose between multiple nearby offers",
    then:
      "THEN all those offers belong to the same competitive set.",
  },
  {
    id: "C8",
    dimension: "competitive_proximity",
    regime: "Regime 2 — Zones de chalandise et chevauchement",
    if: "IF the number of nearby offers increases but spatial overlap does not",
    then:
      "THEN do not assume competition intensity increases proportionally.",
  },

  // Regime 3 — Complémentarité vs cannibalisation
  {
    id: "C9",
    dimension: "competitive_proximity",
    regime: "Regime 3 — Complémentarité vs cannibalisation",
    if: "IF two offers are of the same nature",
    then:
      "THEN treat the relationship as cannibalistic, not complementary.",
  },
  {
    id: "C10",
    dimension: "competitive_proximity",
    regime: "Regime 3 — Complémentarité vs cannibalisation",
    if: "IF offers are of different nature and can be chained in one trip",
    then:
      "THEN treat them as potentially complementary, not substitutive.",
  },
  {
    id: "C11",
    dimension: "competitive_proximity",
    regime: "Regime 3 — Complémentarité vs cannibalisation",
    if: "IF complementary offers are co-located",
    then:
      "THEN do not assume automatic attendance increase for each individual offer.",
  },
  {
    id: "C12",
    dimension: "competitive_proximity",
    regime: "Regime 3 — Complémentarité vs cannibalisation",
    if: "IF visitor flows are shared across nearby offers",
    then:
      "THEN do not equate shared flows with net demand growth.",
  },

  // Regime 4 — Dense offer ecosystems
  {
    id: "C13",
    dimension: "competitive_proximity",
    regime: "Regime 4 — Dense offer ecosystems",
    if: "IF an event is located in a dense offer ecosystem",
    then:
      "THEN expect faster redistribution of attendance between offers.",
  },
  {
    id: "C14",
    dimension: "competitive_proximity",
    regime: "Regime 4 — Dense offer ecosystems",
    if: "IF multiple offers coexist in a tight area",
    then:
      "THEN treat attendance outcomes as ecosystem-dependent rather than event-specific.",
  },
  {
    id: "C15",
    dimension: "competitive_proximity",
    regime: "Regime 4 — Dense offer ecosystems",
    if: "IF local configuration differs from past reference cases",
    then:
      "THEN do not extrapolate competitive impact from other locations.",
  },
];

export const COMPETITION_RULES_BY_ID_V1_5: Record<string, ImpactRuleAssetV1_5> =
  Object.fromEntries(COMPETITION_RULES_V1_5.map((r) => [r.id, r]));
