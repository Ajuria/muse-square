// src/lib/ai/contracts/packagerSchemas.ts
// JSON Schemas for the packager's per-mode output — the SHAPE half of the contract, handed to the API as
// Anthropic structured outputs (`output_config.format`). Sibling of packagerValidators.ts: same modes,
// split responsibility.
//
// ── WHAT A SCHEMA REPLACES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────────
// The schema makes the SHAPE the API's job: schema-valid JSON, no markdown fence, no preamble prose. That
// is what retires the hand-rolled fence-strip + character-by-character re-escaper in runPackager — those
// existed only because a model asked for JSON in prose could answer in prose.
//
// A schema CANNOT carry the truth rules, and must never be mistaken for them:
//   • grounding (every number/entity/cause traces to a citable_fact) — not expressible; validator only.
//   • array COUNTS (key_facts 1-3, operational_impacts 2-4, per_date_notes 1-7) — Anthropic structured
//     outputs does not support minItems/maxItems, so the counts stay validator-enforced. Do not add them
//     here expecting enforcement: unsupported keywords are silently dropped, which reads as enforced.
//   • string LENGTHS (headline <=120, summary <=500) — minLength/maxLength unsupported, same trap.
// So the validator stays the net. The schema only removes the parser's guesswork.
//
// SCHEMA DIALECT LIMITS (Anthropic structured outputs): no recursion; no numeric/string/array constraints;
// `additionalProperties: false` REQUIRED on every object. That last one mirrors the validators'
// `hasOnlyKeys` exactly — an extra key is a reject in both layers.
//
// Applied only on models with `capsFor(model).structuredOutputs`; the transport ignores them elsewhere,
// so grounded_day carries one schema for BOTH its models (packager -> Sonnet 5, briefing -> Haiku 4.5).

const strArray = { type: "array", items: { type: "string" } } as const;

// `caveat` is string-or-null in the month validators (isStringOrNull). Expressed as anyOf — a supported
// combinator — rather than a type-array, which the dialect does not document.
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

// mode: "grounded_day" — the Consulter answer + the daily Point du jour.
// Mirrors validate_packager_output_grounded_day: headline/answer strings; key_facts, caveats,
// cited_fact_ids required arrays; `reasons` optional (the validator only shape-checks it when present).
export const SCHEMA_GROUNDED_DAY = {
  type: "object",
  properties: {
    headline: { type: "string" },
    answer: { type: "string" },
    key_facts: strArray,
    reasons: strArray,
    caveats: strArray,
    cited_fact_ids: strArray,
  },
  required: ["headline", "answer", "key_facts", "caveats", "cited_fact_ids"],
  additionalProperties: false,
} as const;

// mode: "ui_packaging_v2" — mirrors validate_packager_output_ui_v2's STRICT key set (headline/answer/key_facts).
export const SCHEMA_UI_V2 = {
  type: "object",
  properties: {
    headline: { type: "string" },
    answer: { type: "string" },
    key_facts: strArray,
  },
  required: ["headline", "answer", "key_facts"],
  additionalProperties: false,
} as const;

// mode: "month" / submode: "orchestrator" — two booleans routing the month run.
export const SCHEMA_MONTH_ORCHESTRATOR = {
  type: "object",
  properties: {
    run_month_window_summary: { type: "boolean" },
    run_month_special_days: { type: "boolean" },
  },
  required: ["run_month_window_summary", "run_month_special_days"],
  additionalProperties: false,
} as const;

// mode: "month" / submodes: "window_summary" AND "window_worst_days" (same output shape, different prompt).
export const SCHEMA_MONTH_WINDOW_SUMMARY = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    key_facts: strArray,
    operational_impacts: strArray,
    recommended_actions: strArray,
    per_date_notes: strArray,
    caveat: nullableStr,
  },
  required: ["headline", "summary", "key_facts", "operational_impacts", "recommended_actions", "per_date_notes", "caveat"],
  additionalProperties: false,
} as const;

// mode: "month" / submode: "special_days". `types` is a closed enum in the validator — the one place a
// schema CAN carry a rule verbatim, so an invalid type becomes impossible rather than merely rejected.
export const SCHEMA_MONTH_SPECIAL_DAYS = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    special_days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          labels: strArray,
          types: { type: "array", items: { enum: ["public_holiday", "school_holiday", "commercial_event"] } },
        },
        required: ["date", "labels", "types"],
        additionalProperties: false,
      },
    },
    caveat: nullableStr,
  },
  required: ["headline", "summary", "special_days", "caveat"],
  additionalProperties: false,
} as const;

// NO schema for mode "v3_narrative" — DELIBERATE, not an omission. Its validator accepts `answer` as a
// string OR an array OR an object, and a schema must commit to one. Forcing a shape here would narrow a
// contract three call sites already depend on. It keeps the parser path until that contract is pinned down.
