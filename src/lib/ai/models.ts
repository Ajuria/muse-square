// Central model registry — the SINGLE source of truth for Claude model IDs.
// Kills hardcoded literals and scattered `process.env.CLAUDE_MODEL*` reads: change a model in ONE place.
//
// Roles are SEMANTIC (what the call does), not tied to today's model — so a future per-role swap is a
// one-line edit here. Each role's default equals the ID it replaced, so this migration is behavior-neutral.
//
// FOLLOW-ON (flagged, not done here): Sonnet 5 (`claude-sonnet-5`) for the `packager` role makes the
// citable-facts validation schema-native (structured outputs) instead of parse-based. Once it lands it's a
// one-line change to PACKAGER below — NOT a migration bundled into Phase 2.

export type ModelRole =
  | "packager"     // narrative packaging (day/month) — the grounded prompt output
  | "classifier"   // fast intent classification
  | "enrichment"   // context/event enrichment, search, sowhat (cheap/fast)
  | "web_search"   // web-search-tool-backed lookups
  | "drafting";    // channel copy / profile generation / crawl reasoning

const REGISTRY: Record<ModelRole, string> = {
  packager: "claude-sonnet-4-5-20250929",
  classifier: "claude-haiku-4-5-20251001",
  enrichment: "claude-haiku-4-5-20251001",
  web_search: "claude-sonnet-4-6",
  drafting: "claude-sonnet-4-6",
};

// The one accessor. Callers pass a role, never a literal.
export function modelFor(role: ModelRole): string {
  return REGISTRY[role];
}
