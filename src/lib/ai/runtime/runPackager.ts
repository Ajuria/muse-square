import { pickAllowedPayload, assertPayloadCoverage } from "./allowlist";
import { callClaudeMessagesAPI } from "./claude";
import { emitStage } from "./stageEmitter";
import { parseJsonObjectStrict } from "./json";
import { PACKAGER_PROMPT_V3_NARRATIVE_FR } from "../contracts/packagePromptV3";
import { PACKAGER_PROMPT_GROUNDED_DAY_FR } from "../contracts/packagerGroundedDayPrompt";
import { validate_packager_output_grounded_day } from "../contracts/packagerGroundedDayValidator";

import { PACKAGER_PROMPT_MONTH_MODE } from "../contracts/packagerMonthPrompt";
import { PACKAGER_PROMPT_MONTH_WINDOW_SUMMARY_MODE } from "../contracts/packagerMonthWindowSummaryPrompt";
import { PACKAGER_PROMPT_MONTH_SPECIAL_DAYS_MODE } from "../contracts/packagerMonthSpecialDaysPrompt";
import { PACKAGER_PROMPT_MONTH_WINDOW_WORST_DAYS_MODE } from "../contracts/packagerMonthWindowWorstDaysPrompt";

import { PACKAGER_PROMPT_UI_V2_FR } from "../contracts/packagerUiV2Prompt";
import { validate_packager_output_ui_v2 } from "../contracts/packagerUiV2Validator";

import {
  validate_packager_output_month_orchestrator_against_row,
  validate_packager_output_month_window_summary_against_row,
  validate_packager_output_month_special_days_against_row,
} from "../contracts/packagerValidators";

import {
  SCHEMA_GROUNDED_DAY,
  SCHEMA_UI_V2,
  SCHEMA_MONTH_ORCHESTRATOR,
  SCHEMA_MONTH_WINDOW_SUMMARY,
  SCHEMA_MONTH_SPECIAL_DAYS,
} from "../contracts/packagerSchemas";

export type ValidatorResult = [boolean, string[], string[]?];

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type Mode =
  | "month"
  | "ui_packaging_v2"
  | "v3_narrative"
  | "grounded_day";   // day-horizon answer grounded on the brain's citable_facts (Phase 2)

export type MonthSubMode =
  | "orchestrator"
  | "window_summary"
  | "window_worst_days"
  | "special_days";

type ValidatorFn = (output: any, row: any) => ValidatorResult;

/* ------------------------------------------------------------------ */
/* Main runner */
/* ------------------------------------------------------------------ */

export async function runAIPackagerClaude(args: {
  mode: Mode;
  row: Record<string, any>;
  aiLocationContextRow?: Record<string, any>;
  submode?: MonthSubMode; // required iff mode === "month"
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;   // registry-resolved model override (e.g. modelFor("briefing") for the daily cron)
}): Promise<{
  ok: boolean;
  mode: Mode;
  output: any | null;
  errors: string[];
  warnings: string[];
  raw_text: string;
  debug?: any;
}> {
  const { mode, row, submode } = args;

  /* -------------------------------------------------------------- */
  /* 0) Guardrails */
  /* -------------------------------------------------------------- */

  if (!row || typeof row !== "object") {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Missing or invalid row payload."],
      warnings: [],
      raw_text: "",
    };
  }

  if (mode === "month" && !submode) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Month mode requires explicit submode."],
      warnings: [],
      raw_text: "",
    };
  }

  if (mode !== "month" && mode !== "v3_narrative" && submode) {
    // ignore; do not fail
    // (caller may accidentally pass it; we treat it as noop)
  }

  /* -------------------------------------------------------------- */
  /* 1) Enrich row first, then allowlist payload only               */
  /* -------------------------------------------------------------- */

  console.log("[packager][entry] mode:", mode, "submode:", submode, "row keys:", Object.keys(row ?? {}).slice(0, 10));
  const row_enriched: Record<string, any> = { ...(row ?? {}) };

  if (args.aiLocationContextRow && typeof args.aiLocationContextRow === "object") {
    for (const [k, v] of Object.entries(args.aiLocationContextRow)) {
      if (!(k in row_enriched)) row_enriched[k] = v;
    }
  }

  // Extract conversation history before allowlisting (not a semantic field)
  const extracted_history: Array<{ role: "user" | "assistant"; content: string }> =
    Array.isArray(row_enriched._conversation_history)
      ? row_enriched._conversation_history
      : (Array.isArray(args.conversationHistory) ? args.conversationHistory : []);

  // Remove _conversation_history from row before allowlist check
  const row_for_allowlist = Object.fromEntries(
    Object.entries(row_enriched).filter(([k]) => k !== "_conversation_history")
  );

  // grounded_day is ALREADY curated by the brain (only claim-typed citable_facts + typed registers reach
  // it), so the field-allowlist is bypassed — the grounding IS the safety layer. Every other mode stays
  // restricted to allowlisted semantic/decision fields.
  let payload: Record<string, any>;
  if (mode === "grounded_day") {
    payload = row_for_allowlist;
  } else {
    assertPayloadCoverage(row_for_allowlist);
    payload = pickAllowedPayload(row_for_allowlist);
  }

  /* -------------------------------------------------------------- */
  /* 2) Prompt + validator selection (authoritative) */
  /* -------------------------------------------------------------- */

  let system_prompt = "";

  // Per-mode JSON Schema (Anthropic structured outputs). Pairs 1:1 with validatorFn: the schema pins the
  // SHAPE, the validator keeps the truth rules the schema cannot express (grounding, array counts, string
  // lengths). Left undefined for v3_narrative, whose `answer` is polymorphic — see packagerSchemas.ts.
  let outputSchema: Record<string, any> | undefined;

  // Safe default to satisfy TS definite assignment analysis.
  // This should never execute because every supported mode assigns validatorFn.
  let validatorFn: ValidatorFn = (_output: any, _row: any) => [
    false,
    ["Internal error: validatorFn not initialized."],
  ];

  if (mode === "grounded_day") {
    system_prompt = PACKAGER_PROMPT_GROUNDED_DAY_FR;
    validatorFn = validate_packager_output_grounded_day;
    outputSchema = SCHEMA_GROUNDED_DAY;

  } else if (mode === "ui_packaging_v2") {
    system_prompt = PACKAGER_PROMPT_UI_V2_FR;
    validatorFn = validate_packager_output_ui_v2;
    outputSchema = SCHEMA_UI_V2;

  } else if (mode === "v3_narrative") {
    system_prompt = submode
      ? `INTENT OVERRIDE — PRIORITÉ ABSOLUE : Le intent de cette requête est "${submode}". Applique UNIQUEMENT le bloc de logique correspondant à cet intent dans le prompt. Ignore tout autre bloc.\n\n${PACKAGER_PROMPT_V3_NARRATIVE_FR}`
      : PACKAGER_PROMPT_V3_NARRATIVE_FR;
    validatorFn = (output: any) => {
      const errors: string[] = [];
      if (!output || typeof output !== "object") {
        return [false, ["v3_narrative: output is not an object"]];
      }
      if (typeof output.headline !== "string" || !output.headline.trim()) {
        errors.push("v3_narrative: missing headline");
      }
      if (
        (typeof output.answer !== "string" || !output.answer.trim()) &&
        (!Array.isArray(output.answer) || output.answer.length === 0) &&
        (typeof output.answer !== "object" || output.answer === null)
      ) {
        errors.push("v3_narrative: missing answer");
      }
      if (output.verdict !== undefined && typeof output.verdict !== "string") {
        errors.push("v3_narrative: verdict must be a string");
      }
      if (!Array.isArray(output.key_facts)) {
        errors.push("v3_narrative: key_facts must be an array");
      }
      if (!Array.isArray(output.reasons)) {
        errors.push("v3_narrative: reasons must be an array");
      }
      if (!Array.isArray(output.caveats)) {
        errors.push("v3_narrative: caveats must be an array");
      }
      return errors.length ? [false, errors] : [true, []];
    };
  } else if (mode === "month") {
    switch (submode) {
      case "orchestrator":
        system_prompt = PACKAGER_PROMPT_MONTH_MODE;
        validatorFn = validate_packager_output_month_orchestrator_against_row;
        outputSchema = SCHEMA_MONTH_ORCHESTRATOR;
        break;

      case "window_summary":
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_SUMMARY_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        outputSchema = SCHEMA_MONTH_WINDOW_SUMMARY;
        break;

      case "window_worst_days":
        // Same output shape as window_summary: { headline, summary, key_facts, caveat }
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_WORST_DAYS_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        outputSchema = SCHEMA_MONTH_WINDOW_SUMMARY;   // same shape, different prompt
        break;

      case "special_days":
        system_prompt = PACKAGER_PROMPT_MONTH_SPECIAL_DAYS_MODE;
        validatorFn = validate_packager_output_month_special_days_against_row;
        outputSchema = SCHEMA_MONTH_SPECIAL_DAYS;
        break;

      default:
        return {
          ok: false,
          mode,
          output: null,
          errors: [`Unknown month submode: ${String(submode)}`],
          warnings: [],
          raw_text: "",
        };
    }
  }

  else {
    return {
      ok: false,
      mode,
      output: null,
      errors: [`Unsupported mode: ${String(mode)}`],
      warnings: [],
      raw_text: "",
    };
  }
  
  /* -------------------------------------------------------------- */
  /* 3) Call Claude */
  /* -------------------------------------------------------------- */

  // Phase 5: real generation boundary — no-op unless a streaming request set the ALS emitter.
  emitStage("generate", "start");
  const call = await callClaudeMessagesAPI({
    system: system_prompt,
    userPayload: payload,
    model: args.model,
    // temperature stays 0 for the models that still accept it (briefing/Haiku). The transport DROPS it on
    // models that removed sampling params (Sonnet 5 400s on it) — see capsFor in ../models.
    temperature: 0,
    outputSchema,
    maxTokens: 2048,
    timeoutMs: 30_000,
    conversationHistory: extracted_history.length > 0 ? extracted_history : args.conversationHistory,
  });
  emitStage("generate", "done");

  if (!call.ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: call.errors,
      warnings: [],
      raw_text: call.rawText,
    };
  }

  if (!call.rawText.trim()) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Model returned empty output."],
      warnings: [],
      raw_text: "",
    };
  }

  /* -------------------------------------------------------------- */
  /* 4) JSON parsing */
  /* -------------------------------------------------------------- */
  // When structured outputs applied (`call.structured`), the API GUARANTEES schema-valid JSON: no markdown
  // fence, no preamble, no literal control chars inside strings. Nothing to strip or repair — parse it.
  //
  // The legacy branch below is the repair stack that existed because a model merely ASKED for JSON in prose
  // could answer in prose: strip a ``` fence, then walk the string character by character re-escaping raw
  // newlines/tabs that a model emitted inside string values. It survives ONLY for the paths structured
  // outputs cannot cover — v3_narrative (polymorphic `answer`, no schema) and any model without the
  // capability. Do not "unify" the two branches: reviving the repair pass over schema-valid JSON is how a
  // silent corruption gets reintroduced for zero benefit.

  function legacyNormalize(raw: string): string {
    const t = raw.trim();
    const stripped = (() => {
      if (!t.startsWith("```")) return t;
      const lines = t.split("\n");
      lines.shift(); // opening fence
      if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
      return lines.join("\n").trim();
    })();

    // Escape literal control chars inside JSON string values only (outside strings, leave as-is).
    let result = "";
    let inString = false;
    let escaped = false;
    for (let i = 0; i < stripped.length; i++) {
      const c = stripped[i];
      if (escaped) { result += c; escaped = false; continue; }
      if (c === "\\" && inString) { result += c; escaped = true; continue; }
      if (c === '"') { inString = !inString; result += c; continue; }
      if (inString) {
        if (c === "\n") { result += "\\n"; continue; }
        if (c === "\r") { result += "\\r"; continue; }
        if (c === "\t") { result += "\\t"; continue; }
      }
      result += c;
    }
    return result;
  }

  const normalized = call.structured ? call.rawText.trim() : legacyNormalize(call.rawText);

  console.log(`[packager][debug] structured=${call.structured} head:`, normalized.slice(0, 200));

  const parsed = parseJsonObjectStrict(normalized);

  if (!parsed.ok) {
    console.error("[packager] JSON parse failed:", parsed.error, "structured:", call.structured);
    return {
      ok: false,
      mode,
      output: null,
      errors: [parsed.error],
      warnings: [],
      raw_text: normalized,
    };
  }
  console.log("[packager] JSON parsed ok, keys:", Object.keys(parsed.value));

  /* -------------------------------------------------------------- */
  /* 5) Validation */
  /* -------------------------------------------------------------- */
  console.log("[packager][debug] mode:", mode, "submode:", submode);
  console.log("[packager][debug] validatorFn head:", String(validatorFn).slice(0, 400));

  // Phase 5: real validation boundary. `done` is emitted only on a PASS (below) — a reject falls through
  // to the caller's regen/floor, so the verify row keeps waiting; nothing is ever claimed verified early.
  emitStage("verify", "start");
  const res = validatorFn(parsed.value, row_enriched);

  let v_ok = false;
  let v_errors: string[] = [];
  let v_warnings: string[] = [];

  if (!Array.isArray(res) || (res.length !== 2 && res.length !== 3)) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Unexpected validator return shape."],
      warnings: [],
      raw_text: normalized,
    };
  }

  v_ok = Boolean(res[0]);
  v_errors = Array.isArray(res[1]) ? res[1] : [];
  v_warnings = res.length === 3 && Array.isArray(res[2]) ? res[2] : [];

  if (!v_ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: v_errors,
      warnings: v_warnings,
      raw_text: normalized,
    };
  }

  /* -------------------------------------------------------------- */
  /* 6) Success */
  /* -------------------------------------------------------------- */

  // Phase 5: validation PASSED — the only place `verify done` may be emitted. `facts_cited` rides along
  // for increment ②'s detail line (a count, never model text; the emitter payload has no text field).
  emitStage("verify", "done", {
    ...(Array.isArray(parsed.value?.cited_fact_ids) ? { facts_cited: parsed.value.cited_fact_ids.length } : {}),
  });

  return {
    ok: true,
    mode,
    output: parsed.value,
    errors: [],
    warnings: v_warnings,
    raw_text: normalized,
    debug: { usage: call.usage },   // token usage incl. cache_read / cache_creation (prompt caching)
  };
}
