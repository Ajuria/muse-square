// Single source of truth for the v1 internal-alert allowlist (Barrier 2).
//
// Exactly the 5 performance RULE cards that emit rows and carry first-party-only payloads
// (no external/competitor content). Deliberately NOT action-cards.js RULE_ONLY (9 cards,
// incl. the dropped competitor_positioning_gap + 3 zero-row cards). A card joins this rail
// only by editing this list — never by category, never by reusing RULE_ONLY.
//
// Both the arm endpoint (channels/internal-alert.ts, write-time) and the sweep
// (cron/internal-alert-sweep.ts, read-time) import from here, so the allowlist can never
// drift between the two rails.

export const V1_ALERT_ACTION_TYPES: string[] = [
  "sales_surge",
  "sales_traffic_not_converting",
  "sales_discount_no_lift",
  "sales_revenue_down_wow",
  "footfall_vs_basket_decomposition",
];

export const V1_ALERT_ACTION_TYPE_SET: ReadonlySet<string> = new Set(V1_ALERT_ACTION_TYPES);
