// Single source of truth for which action-card types may SEED a commitment.
//
// DELIBERATELY NOT V1_ALERT_ACTION_TYPES (the internal-alert rail's 5 cards).
// A commitment can be seeded from any real action card (design constraint §4:
// v1 origin = action cards, broadly). This set must be the action-card SPECS
// universe, not the alert subset.
//
// AUTHORITATIVE LIST = the SPECS/ACTION_CARDS keys in public/action-cards.js.
// Complete this set from those keys before the endpoint accepts non-sales cards.
// Seeded below ONLY with action_types verified present in the repo; the
// opportunity / threat / weather / tourism / footfall families still need adding
// (copy the exact strings from the SPECS registry — never hand-type from memory).
export const COMMITMENT_ORIGIN_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
  // Sales / performance — verified in src/lib/internalAlertCards.ts
  "sales_surge",
  "sales_revenue_down_wow",
  "sales_traffic_not_converting",
  "sales_discount_no_lift",
  "footfall_vs_basket_decomposition",

  // TODO(complete from public/action-cards.js SPECS keys): opportunity/threat/
  // weather/tourism/footfall families (verify each string against the registry).
]);

export function isCommitmentOrigin(actionType: unknown): boolean {
  return COMMITMENT_ORIGIN_ACTION_TYPES.has(String(actionType ?? "").trim());
}
