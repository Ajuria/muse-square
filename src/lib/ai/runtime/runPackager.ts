import { pickAllowedPayload } from "./allowlist";
import { callClaudeMessagesAPI } from "./claude";
import { parseJsonObjectStrict } from "./json";

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

export type ValidatorResult = [boolean, string[], string[]?];

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type Mode =
  | "month"
  | "ui_packaging_v2";

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

  if (mode !== "month" && submode) {
    // ignore; do not fail
    // (caller may accidentally pass it; we treat it as noop)
  }

  /* -------------------------------------------------------------- */
  /* 1) Enrich row first, then allowlist payload only               */
  /* -------------------------------------------------------------- */

  const row_enriched: Record<string, any> = { ...(row ?? {}) };

  if (args.aiLocationContextRow && typeof args.aiLocationContextRow === "object") {
    for (const [k, v] of Object.entries(args.aiLocationContextRow)) {
      if (!(k in row_enriched)) row_enriched[k] = v;
    }
  }

  // ✅ Claude only sees allowlisted fields (plus jsonable coercion)
  const payload: Record<string, any> = pickAllowedPayload(row_enriched);

  /* -------------------------------------------------------------- */
  /* 2) Prompt + validator selection (authoritative) */
  /* -------------------------------------------------------------- */

  let system_prompt = "";

  // Safe default to satisfy TS definite assignment analysis.
  // This should never execute because every supported mode assigns validatorFn.
  let validatorFn: ValidatorFn = (_output: any, _row: any) => [
    false,
    ["Internal error: validatorFn not initialized."],
  ];

  if (mode === "ui_packaging_v2") {
    system_prompt = PACKAGER_PROMPT_UI_V2_FR;
    validatorFn = validate_packager_output_ui_v2;
  }

  else if (mode === "month") {
    switch (submode) {
      case "orchestrator":
        system_prompt = PACKAGER_PROMPT_MONTH_MODE;
        validatorFn = validate_packager_output_month_orchestrator_against_row;
        break;

      case "window_summary":
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_SUMMARY_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        break;

      case "window_worst_days":
        // Same output shape as window_summary: { headline, summary, key_facts, caveat }
        system_prompt = PACKAGER_PROMPT_MONTH_WINDOW_WORST_DAYS_MODE;
        validatorFn = validate_packager_output_month_window_summary_against_row;
        break;

      case "special_days":
        system_prompt = PACKAGER_PROMPT_MONTH_SPECIAL_DAYS_MODE;
        validatorFn = validate_packager_output_month_special_days_against_row;
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

  const call = await callClaudeMessagesAPI({
    system: system_prompt,
    userPayload: payload,
    temperature: 0,
    maxTokens: 600,
    timeoutMs: 30_000,
  });

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
  /* 4) Strict JSON parsing */
  /* -------------------------------------------------------------- */

  function stripCodeFence(s: string): string {
    const t = s.trim();
    if (!t.startsWith("```")) return t;

    const lines = t.split("\n");
    lines.shift(); // opening fence
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    return lines.join("\n").trim();
  }

  const normalized = stripCodeFence(call.rawText);

  if (!normalized.startsWith("{") || !normalized.endsWith("}")) {
    return {
      ok: false,
      mode,
      output: null,
      errors: ["Model returned non-JSON output."],
      warnings: [],
      raw_text: call.rawText,
    };
  }

  const parsed = parseJsonObjectStrict(normalized);

  if (!parsed.ok) {
    return {
      ok: false,
      mode,
      output: null,
      errors: [parsed.error],
      warnings: [],
      raw_text: normalized,
    };
  }

  /* -------------------------------------------------------------- */
  /* 5) Validation */
  /* -------------------------------------------------------------- */
  console.log("[packager][debug] mode:", mode, "submode:", submode);
  console.log("[packager][debug] validatorFn head:", String(validatorFn).slice(0, 400));

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

  return {
    ok: true,
    mode,
    output: parsed.value,
    errors: [],
    warnings: v_warnings,
    raw_text: normalized,
  };
}
