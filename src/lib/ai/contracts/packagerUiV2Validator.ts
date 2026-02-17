// src/lib/ai/contracts/packagerUiV2Validator.ts

export type ValidatorResult = [boolean, string[], string[]?];

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract date labels from ui_v2.key_facts that look like:
 * "lundi 2 février 2026 — ..."
 * We keep the part before the em dash if present.
 */
function extractUiDateLabels(ui_v2: any): string[] {
  const out: string[] = [];
  const arr: any[] = Array.isArray(ui_v2?.key_facts) ? ui_v2.key_facts : [];

  for (const line of arr) {
    if (typeof line !== "string") continue;
    const s = line.trim();
    if (!s) continue;

    // Keep only lines that look like they start with a weekday in FR (common in your UI)
    // Example: "lundi 2 février 2026 — ..."
    const m = s.match(
      /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+\S+\s+\d{4}\b/i
    );
    if (!m) continue;

    const beforeDash = s.split("—")[0]?.trim() ?? s;
    if (beforeDash) out.push(beforeDash);
  }

  // de-dup while preserving order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const d of out) {
    const k = norm(d);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(d);
  }
  return uniq;
}

function requestedK(question: string): number | null {
  const q = norm(question);

  // hard “2 / deux”
  if (/\b(2|deux)\b/.test(q)) return 2;

  // hard “3 / trois”
  if (/\b(3|trois)\b/.test(q)) return 3;

  // otherwise unknown
  return null;
}

function countMentionedDates(text: string, dateLabels: string[]): number {
  const t = norm(text);
  let n = 0;
  for (const d of dateLabels) {
    if (t.includes(norm(d))) n++;
  }
  return n;
}

function countDateLinesInKeyFacts(key_facts: string[], dateLabels: string[]): number {
  let n = 0;
  for (const line of key_facts) {
    if (typeof line !== "string") continue;
    const s = line.trim();
    if (!s) continue;

    // date line must start with one of the known ui labels
    const sNorm = norm(s);
    const isDateLine = dateLabels.some((d) => sNorm.startsWith(norm(d)));
    if (isDateLine) n++;
  }
  return n;
}

export function validate_packager_output_ui_v2(output: any, row: any): ValidatorResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(output)) {
    return [false, ["Output must be a JSON object."]];
  }

  // STRICT keys: headline, answer, key_facts only
  const allowed = new Set(["headline", "answer", "key_facts"]);
  const keys = Object.keys(output);
  for (const k of keys) {
    if (!allowed.has(k)) errors.push(`Unexpected key: ${k}`);
  }
  for (const k of Array.from(allowed)) {
    if (!(k in output)) errors.push(`Missing key: ${k}`);
  }

  if (typeof output.headline !== "string" || !output.headline.trim()) {
    errors.push("headline must be a non-empty string.");
  }

  if (typeof output.answer !== "string" || !output.answer.trim()) {
    errors.push("answer must be a non-empty string.");
  }

  if (!Array.isArray(output.key_facts)) {
    errors.push("key_facts must be an array.");
  } else {
    const bad = output.key_facts.filter((x: any) => typeof x !== "string" || !String(x).trim());
    if (bad.length) errors.push("key_facts must contain non-empty strings only.");
  }

  // If structural errors already, stop here.
  if (errors.length) return [false, errors, warnings];

  const question = typeof row?.question === "string" ? row.question : "";
  const ui_v2 = row?.ui_v2 ?? null;

  // Truth anchor: date labels come from ui_v2.key_facts (already produced deterministically)
  const dateLabels = extractUiDateLabels(ui_v2);

  if (!dateLabels.length) {
    // If we can't find labels, we can't enforce mention counting; warn, but do not fail.
    warnings.push("Could not extract date labels from ui_v2.key_facts; relaxed date mention checks.");
    return [true, [], warnings];
  }

  // MUST mention at least one date label in answer (your quality gate)
  const nInAnswer = countMentionedDates(output.answer, dateLabels);
  if (nInAnswer < 1) {
    errors.push("answer must mention at least one date_label from ui_v2.");
  }

  // key_facts must start with date lines; at least 1 date line must exist
  const keyFacts: string[] = output.key_facts;
  const nDateLines = countDateLinesInKeyFacts(keyFacts, dateLabels);
  if (nDateLines < 1) {
    errors.push("key_facts must include at least one date line starting with a date_label from ui_v2.");
  }

  // If user asked for K=2 or K=3, enforce EXACT count in answer + key_facts date lines
  const k = requestedK(question);
  if (k !== null) {
    if (nInAnswer !== k) {
      errors.push(`answer must mention exactly ${k} date_label(s) (question asks for ${k}).`);
    }
    if (nDateLines !== k) {
      errors.push(`key_facts must contain exactly ${k} date line(s) (question asks for ${k}).`);
    }
  }

  return [errors.length === 0, errors, warnings];
}
