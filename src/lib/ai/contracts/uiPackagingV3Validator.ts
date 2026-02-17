// src/lib/ai/contracts/uiPackagingV3Validator.ts
import type { UiPackagingV3, UiSectionIdV3 } from "./uiPackagingV3";

const SECTION_IDS: UiSectionIdV3[] = [
  "alertes",
  "meteo_faisabilite",
  "concurrence",
  "calendrier",
  "mobilite",
  "tourisme",
  "autre",
];

function isString(x: unknown): x is string {
  return typeof x === "string";
}
function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}
function isYmd(s: unknown): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function validateUiPackagingV3(payload: unknown): string[] {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object") {
    return ["payload must be an object"];
  }

  const p = payload as any;

  if (p.v !== 3) errors.push("v must be 3");

  // header
  if (!p.header || typeof p.header !== "object") {
    errors.push("header must be an object");
  } else {
    if (!isString(p.header.title) || !p.header.title.trim()) errors.push("header.title must be a non-empty string");
    if (p.header.timeframe_label !== undefined && !isString(p.header.timeframe_label))
      errors.push("header.timeframe_label must be a string if present");
    if (!isStringArray(p.header.summary_bullets)) errors.push("header.summary_bullets must be an array of strings");
  }

  // dates
  if (!Array.isArray(p.dates)) errors.push("dates must be an array");
  else if (p.dates.length < 1) errors.push("dates must have at least 1 element");
  else {
    for (let i = 0; i < p.dates.length; i++) {
      const d = p.dates[i];
      const ctx = `dates[${i}]`;

      if (!d || typeof d !== "object") {
        errors.push(`${ctx} must be an object`);
        continue;
      }
      if (!isYmd(d.date)) errors.push(`${ctx}.date must be YYYY-MM-DD`);
      if (!isString(d.date_label) || !d.date_label.trim()) errors.push(`${ctx}.date_label must be a non-empty string`);

      // score
      if (d.score !== undefined) {
        if (!d.score || typeof d.score !== "object") errors.push(`${ctx}.score must be an object if present`);
        else {
          const r = d.score.regime;
          if (r !== "A" && r !== "B" && r !== "C") errors.push(`${ctx}.score.regime must be A|B|C`);
          if (d.score.score !== undefined && typeof d.score.score !== "number") errors.push(`${ctx}.score.score must be a number if present`);
        }
      }

      // sections
      if (!Array.isArray(d.sections)) errors.push(`${ctx}.sections must be an array`);
      else {
        for (let j = 0; j < d.sections.length; j++) {
          const s = d.sections[j];
          const sctx = `${ctx}.sections[${j}]`;
          if (!s || typeof s !== "object") {
            errors.push(`${sctx} must be an object`);
            continue;
          }
          if (!SECTION_IDS.includes(s.id)) errors.push(`${sctx}.id invalid`);
          if (!isString(s.title) || !s.title.trim()) errors.push(`${sctx}.title must be a non-empty string`);
          if (!isStringArray(s.facts)) errors.push(`${sctx}.facts must be an array of strings`);
          if (!isStringArray(s.implications)) errors.push(`${sctx}.implications must be an array of strings`);
        }
      }
    }
  }

  // warnings
  if (p.warnings !== undefined && !isStringArray(p.warnings)) errors.push("warnings must be an array of strings if present");

  return errors;
}
