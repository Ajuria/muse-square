// src/lib/ai/contracts/packagerValidators.ts

export type ValidatorResult =
  | [true, string[]]
  | [false, string[]]
  | [true, string[], string[]]
  | [false, string[], string[]];

// ----------------------------
// Shared helpers (local only)
// ----------------------------
function isPlainObject(x: any): x is Record<string, any> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function isNonEmptyString(x: any, maxLen?: number): boolean {
  if (typeof x !== "string") return false;
  const s = x.trim();
  if (!s) return false;
  if (typeof maxLen === "number" && s.length > maxLen) return false;
  return true;
}

function isStringOrNull(x: any, maxLen?: number): boolean {
  if (x === null) return true;
  return isNonEmptyString(x, maxLen);
}

function uniqStrings(xs: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of xs) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function extraKeys(o: Record<string, any>, allowed: string[]): string[] {
  const k = Object.keys(o);
  const allowedSet = new Set(allowed);
  return k.filter((x) => !allowedSet.has(x));
}

function hasOnlyKeys(o: Record<string, any>, allowed: string[], errors: string[], ctx: string) {
  const extras = extraKeys(o, allowed);
  if (extras.length > 0) errors.push(`${ctx}: unexpected keys: ${extras.join(", ")}`);
}

function requireKey(o: Record<string, any>, key: string, errors: string[], ctx: string) {
  if (!(key in o)) errors.push(`${ctx}: missing key "${key}"`);
}

// ---------------------------------------------------------------------
// Existing validators (you already have these in some form).
// Keep your real implementations here if they exist.
// ---------------------------------------------------------------------
export function validate_packager_output_against_row(output: any, row: any): ValidatorResult {
  // If you already implemented this elsewhere, keep your implementation.
  // Placeholder remains "pass-through" only if you haven't done it yet.
  return [true, []];
}

export function validate_packager_output_window_30d_against_row(output: any, row: any): ValidatorResult {
  // If you already implemented this elsewhere, keep your implementation.
  // Placeholder remains "pass-through" only if you haven't done it yet.
  return [true, []];
}

// ============================
// MONTH validators (REAL)
// ============================

export function validate_packager_output_month_orchestrator_against_row(
  output: any,
  row: any
): ValidatorResult {
  const errors: string[] = [];

  if (!isPlainObject(output)) {
    return [false, ["month_orchestrator: output is not an object"]];
  }

  const ALLOWED = ["run_month_window_summary", "run_month_special_days"];
  hasOnlyKeys(output, ALLOWED, errors, "month_orchestrator");

  requireKey(output, "run_month_window_summary", errors, "month_orchestrator");
  requireKey(output, "run_month_special_days", errors, "month_orchestrator");

  if ("run_month_window_summary" in output && typeof output.run_month_window_summary !== "boolean") {
    errors.push(`month_orchestrator: run_month_window_summary must be boolean`);
  }

  if ("run_month_special_days" in output && typeof output.run_month_special_days !== "boolean") {
    errors.push(`month_orchestrator: run_month_special_days must be boolean`);
  }

  // Truth-based rule: special_days block should not run if special_days is empty.
  const sd = (row as any)?.special_days;
  const special_days_len = Array.isArray(sd) ? sd.length : 0;

  if (special_days_len <= 0 && output.run_month_special_days === true) {
    errors.push(`month_orchestrator: run_month_special_days=true but row.special_days is empty`);
  }

  return errors.length ? [false, errors] : [true, []];
}

export function validate_packager_output_month_window_summary_against_row(
  output: any,
  row: any
): ValidatorResult {
  const errors: string[] = [];

  if (!isPlainObject(output)) return [false, ["month_window_summary: output is not an object"]];

  const ALLOWED = [
    "headline",
    "summary",
    "key_facts",
    "operational_impacts",
    "recommended_actions",
    "per_date_notes",
    "caveat",
  ];
  hasOnlyKeys(output, ALLOWED, errors, "month_window_summary");

  requireKey(output, "headline", errors, "month_window_summary");
  requireKey(output, "summary", errors, "month_window_summary");
  requireKey(output, "key_facts", errors, "month_window_summary");
  requireKey(output, "operational_impacts", errors, "month_window_summary");
  requireKey(output, "recommended_actions", errors, "month_window_summary");
  requireKey(output, "per_date_notes", errors, "month_window_summary");
  requireKey(output, "caveat", errors, "month_window_summary");

  if ("headline" in output && !isNonEmptyString(output.headline, 120)) {
    errors.push("month_window_summary: headline must be non-empty string (<=120 chars)");
  }

  if ("summary" in output && !isNonEmptyString(output.summary, 500)) {
    errors.push("month_window_summary: summary must be non-empty string (<=500 chars)");
  }

  if ("key_facts" in output) {
    if (!Array.isArray(output.key_facts)) {
      errors.push("month_window_summary: key_facts must be an array");
    } else {
      const xs = uniqStrings(output.key_facts);
      if (xs.length < 1 || xs.length > 3) {
        errors.push("month_window_summary: key_facts must contain 1–3 non-empty unique strings");
      }
    }
  }

  if ("operational_impacts" in output) {
    if (!Array.isArray(output.operational_impacts)) {
      errors.push("month_window_summary: operational_impacts must be an array");
    } else {
      const xs = uniqStrings(output.operational_impacts);
      if (xs.length < 2 || xs.length > 4) {
        errors.push("month_window_summary: operational_impacts must contain 2–4 non-empty unique strings");
      }
    }
  }

  if ("recommended_actions" in output) {
    if (!Array.isArray(output.recommended_actions)) {
      errors.push("month_window_summary: recommended_actions must be an array");
    } else {
      const xs = uniqStrings(output.recommended_actions);
      if (xs.length < 2 || xs.length > 4) {
        errors.push("month_window_summary: recommended_actions must contain 2–4 non-empty unique strings");
      }
    }
  }

  if ("per_date_notes" in output) {
    if (!Array.isArray(output.per_date_notes)) {
      errors.push("month_window_summary: per_date_notes must be an array");
    } else {
      const xs = uniqStrings(output.per_date_notes);
      if (xs.length < 1 || xs.length > 7) {
        errors.push("month_window_summary: per_date_notes must contain 1–7 non-empty unique strings");
      }
    }
  }

  if ("caveat" in output && !isStringOrNull(output.caveat, 220)) {
    errors.push("month_window_summary: caveat must be string or null");
  }

  return errors.length ? [false, errors] : [true, []];
}

export function validate_packager_output_month_special_days_against_row(
  output: any,
  row: any
): ValidatorResult {
  const errors: string[] = [];

  if (!isPlainObject(output)) return [false, ["month_special_days: output is not an object"]];

  const ALLOWED = ["headline", "summary", "special_days", "caveat"];
  hasOnlyKeys(output, ALLOWED, errors, "month_special_days");

  requireKey(output, "headline", errors, "month_special_days");
  requireKey(output, "summary", errors, "month_special_days");
  requireKey(output, "special_days", errors, "month_special_days");
  requireKey(output, "caveat", errors, "month_special_days");

  if ("headline" in output && !isNonEmptyString(output.headline, 120)) {
    errors.push("month_special_days: headline must be non-empty string (<=120 chars)");
  }

  if ("summary" in output && !isNonEmptyString(output.summary, 600)) {
    errors.push("month_special_days: summary must be non-empty string (<=600 chars)");
  }

  if ("caveat" in output && !isStringOrNull(output.caveat, 220)) {
    errors.push("month_special_days: caveat must be string or null");
  }

  if ("special_days" in output) {
    if (!Array.isArray(output.special_days)) {
      errors.push("month_special_days: special_days must be an array");
    } else {
      // Validate each bullet
      for (let i = 0; i < output.special_days.length; i++) {
        const item = output.special_days[i];
        const ctx = `month_special_days: special_days[${i}]`;

        if (!isPlainObject(item)) {
          errors.push(`${ctx} must be an object`);
          continue;
        }

        const allowedItemKeys = ["date", "labels", "types"];
        hasOnlyKeys(item, allowedItemKeys, errors, ctx);

        requireKey(item, "date", errors, ctx);
        requireKey(item, "labels", errors, ctx);
        requireKey(item, "types", errors, ctx);

        if ("date" in item && !isNonEmptyString(item.date, 40)) {
          errors.push(`${ctx}.date must be non-empty string`);
        }

        if ("labels" in item) {
          if (!Array.isArray(item.labels)) {
            errors.push(`${ctx}.labels must be an array`);
          } else {
            const ls = uniqStrings(item.labels);
            if (ls.length < 1 || ls.length > 3) {
              errors.push(`${ctx}.labels must contain 1 to 3 non-empty unique strings`);
            }
          }
        }

        if ("types" in item) {
          if (!Array.isArray(item.types)) {
            errors.push(`${ctx}.types must be an array`);
          } else {
            const allowedTypes = new Set(["public_holiday", "school_holiday", "commercial_event"]);
            const ts = uniqStrings(item.types);
            if (ts.length < 1 || ts.length > 3) {
              errors.push(`${ctx}.types must contain 1 to 3 entries`);
            }
            for (const t of ts) {
              if (!allowedTypes.has(t)) errors.push(`${ctx}.types contains invalid value "${t}"`);
            }
          }
        }
      }
    }
  }

  return errors.length ? [false, errors] : [true, []];
}

export function validate_packager_output_ui_v2_fr_against_row(output: any, row: any) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!output || typeof output !== "object") {
    return [false, ["Output must be an object."]] as const;
  }

  if (typeof output.headline !== "string" || !output.headline.trim()) {
    errors.push("headline must be a non-empty string.");
  }

  if (typeof output.answer !== "string" || !output.answer.trim()) {
    errors.push("answer must be a non-empty string.");
  }

  if (!Array.isArray(output.blocks)) {
    errors.push("blocks must be an array.");
  } else {
    for (const [i, b] of output.blocks.entries()) {
      if (!b || typeof b !== "object") {
        errors.push(`blocks[${i}] must be an object.`);
        continue;
      }
      if (typeof b.date_label !== "string" || !b.date_label.trim()) {
        errors.push(`blocks[${i}].date_label must be a non-empty string.`);
      }
      if (!Array.isArray(b.data_points)) {
        errors.push(`blocks[${i}].data_points must be an array.`);
      }
      if (!Array.isArray(b.interpretation)) {
        errors.push(`blocks[${i}].interpretation must be an array.`);
      }
      if (!["positive", "neutral", "caution"].includes(String(b.tone))) {
        errors.push(`blocks[${i}].tone must be "positive" | "neutral" | "caution".`);
      }
    }
  }

  // Optional: ensure we didn't “forget” to keep the question context
  if (row?.headline && typeof row.headline === "string" && output.headline !== row.headline) {
    // allowed (we expect better FR), so no error
  }

  return [errors.length === 0, errors, warnings] as const;
}
