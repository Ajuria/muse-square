// Central model registry — the SINGLE source of truth for Claude model IDs.
// Kills hardcoded literals and scattered `process.env.CLAUDE_MODEL*` reads: change a model in ONE place.
//
// Roles are SEMANTIC (what the call does), not tied to today's model — so a future per-role swap is a
// one-line edit here. Each role's default equals the ID it replaced, so this migration is behavior-neutral.
//
export type ModelRole =
  | "packager"     // narrative packaging (day/month) — the grounded prompt output
  | "briefing"     // grounded daily Point du jour (cron over every user) — cheap tier, validator is the net
  | "classifier"   // fast intent classification
  | "enrichment"   // context/event enrichment, search, sowhat (cheap/fast)
  | "web_search"   // web-search-tool-backed lookups
  | "drafting";    // channel copy / profile generation / crawl reasoning

const REGISTRY: Record<ModelRole, string> = {
  packager: "claude-sonnet-5",             // Sonnet 5: structured outputs make the JSON shape schema-native
  briefing: "claude-haiku-4-5-20251001",   // Haiku: runs daily per user; grounding validator is the safety net
  classifier: "claude-haiku-4-5-20251001",
  enrichment: "claude-haiku-4-5-20251001",
  web_search: "claude-sonnet-4-6",
  drafting: "claude-sonnet-4-6",
};

// The one accessor. Callers pass a role, never a literal.
export function modelFor(role: ModelRole): string {
  return REGISTRY[role];
}

// ── Per-model API capabilities ────────────────────────────────────────────────
// Models do NOT share one request surface, so the transport cannot send one body shape to all of them.
// This map is the SST for "what shape do we send this model" — the same role models.ts already plays for
// IDs. Every row below was PROVEN against the live API on 2026-07-15, not read off a changelog:
//
//   model              temperature:0   output_config.format   `thinking` omitted
//   sonnet-5           HTTP 400 ✗      HTTP 200 ✓             adaptive thinking FIRES (134 thinking tokens)
//   sonnet-4-6         HTTP 200 ✓      HTTP 200 ✓             no thinking
//   sonnet-4-5         HTTP 200 ✓      HTTP 200 ✓             no thinking
//   haiku-4-5          HTTP 200 ✓      HTTP 200 ✓ (accepted)  no thinking
//
// Sonnet 5's 400 is verbatim: "`temperature` is deprecated for this model." That is why flipping the
// packager to Sonnet 5 was NEVER the one-line registry edit the old comment here claimed — every packager
// call sends `temperature: 0` (claude.ts) and would have 400'd. The transport now gates on `sampling`.
//
// `structuredOutputs` here means "SEND output_config.format", not merely "the API accepts it". Haiku 4.5
// ACCEPTS the schema (HTTP 200) but is set false: with the grounded-day schema it deterministically
// computes a derived delta (1500−1240 = 260, a number in no citable_fact) that the grounding validator
// then rejects — measured 4/4 rejects schema-on vs 0/4 schema-off, same payload. Sonnet 5 does NOT do this
// (0/4). The only schema-caller is runPackager, and under Haiku that is the daily briefing — so turning it
// off keeps the briefing on its working parser path instead of regressing it to a deterministic floor. Do
// not "correct" this to true because the API accepts it: the flag is a policy, and the policy is evidenced.
export type ModelCaps = {
  sampling: boolean;            // accepts temperature/top_p/top_k — Sonnet 5+ removed them (400)
  structuredOutputs: boolean;   // SEND output_config.format (json_schema). Policy, not raw API acceptance.
  thinkingDefaultsOn: boolean;  // omitting `thinking` runs ADAPTIVE thinking, eating the max_tokens budget
};

const CAPS: Record<string, ModelCaps> = {
  "claude-sonnet-5":            { sampling: false, structuredOutputs: true,  thinkingDefaultsOn: true },
  "claude-sonnet-4-6":          { sampling: true,  structuredOutputs: true,  thinkingDefaultsOn: false },
  "claude-sonnet-4-5-20250929": { sampling: true,  structuredOutputs: true,  thinkingDefaultsOn: false },
  "claude-haiku-4-5-20251001":  { sampling: true,  structuredOutputs: false, thinkingDefaultsOn: false }, // API-accepts, we don't send — see note
};

// Unknown model → assume the OLD surface (sampling on, no structured outputs, no implicit thinking).
// That fails toward today's behaviour rather than toward a 400 on a model we have not probed.
const LEGACY_CAPS: ModelCaps = { sampling: true, structuredOutputs: false, thinkingDefaultsOn: false };

export function capsFor(model: string): ModelCaps {
  return CAPS[model] ?? LEGACY_CAPS;
}
