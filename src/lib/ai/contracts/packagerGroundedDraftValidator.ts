// Grounding validator for a DRAFT (customer-facing channel copy: Instagram / GBP / email). Free text,
// not JSON. HARD-rejects an EXTERNAL fact the copy asserts that no legal source supports — a fabricated
// competitor / event / weather figure / attendance stat / outcome. The three LEGAL sources:
//   1. citable_facts  — external context from the brain (competitors, weather, commercial, nationalities)
//   2. profile identity — the venue's own name / city / offerings / differentiators (self-reference is fine)
//   3. user instruction — the operator's OWN ask/offer (their prices, discounts, hours: "-20 % ce week-end")
// Creative voice, CTAs and imperatives are free. Engines never reach a draft (excluded in the payload).

import { groundedFactStrings, type GroundedDayPayload } from "../groundedPayload";
import { extractNumbers, norm, makeEntityRegex, CAUSAL_PATTERNS, DRAFT_OUTCOME_PATTERNS } from "./groundingChecks";

export interface DraftLegalSources {
  grounded: GroundedDayPayload;   // engines already excluded
  identityText: string;           // the venue identity block the system prompt was built from
  userInstruction: string;        // the operator's own instruction / offer (their prices/dates)
}

export function validate_grounded_draft(draftText: string, ctx: DraftLegalSources): [boolean, string[]] {
  const errors: string[] = [];
  const text = String(draftText ?? "");
  if (!text.trim()) return [false, ["grounded_draft: empty draft"]];

  const factStrings = groundedFactStrings(ctx.grounded);
  // Legal pools = all three sources combined.
  const legalText = factStrings.join("  ") + "  " +
    JSON.stringify(ctx.grounded.signals ?? {}) + "  " +
    (ctx.identityText ?? "") + "  " + (ctx.userInstruction ?? "") + "  " +
    (ctx.grounded.display_date ?? "") + "  " + (ctx.grounded.date ?? "");
  const legalNums = extractNumbers(legalText);
  const legalEntities = norm(legalText);

  // 1) NUMBER grounding — any figure in the copy must come from a legal source. The operator's own
  //    "-20 %" / "22h" (from the instruction) pass; a fabricated "40 °C" / "+50 % de visites" fails.
  const draftNums = extractNumbers(text);
  const ungroundedNums = [...draftNums].filter((n) => !legalNums.has(n));
  if (ungroundedNums.length) {
    errors.push(`grounded_draft: ungrounded number(s) — no legal source: ${ungroundedNums.join(", ")}`);
  }

  // 2) ENTITY grounding — a named entity (2+ Capitalized words: a competitor / event / place) must appear
  //    in a legal source. The venue's own name/offerings (identity) pass; a fabricated competitor/event fails.
  const entityRe = makeEntityRegex();
  const seen = new Set<string>();
  for (const ent of text.match(entityRe) ?? []) {
    const e = norm(ent);
    if (e.length < 6 || seen.has(e)) continue;
    seen.add(e);
    if (!legalEntities.includes(e)) errors.push(`grounded_draft: ungrounded named entity: "${ent}"`);
  }

  // 3) OUTCOME / causal — no fabricated result on the venue OR an external entity ("augmentera vos ventes",
  //    a competitor "à guichets fermés", "affiche complet", "record d'affluence"). Advice/CTA imperatives pass.
  const t = norm(text);
  for (const p of [...CAUSAL_PATTERNS, ...DRAFT_OUTCOME_PATTERNS]) {
    if (t.includes(p)) errors.push(`grounded_draft: forbidden fabricated outcome: "${p}"`);
  }

  return errors.length ? [false, errors] : [true, []];
}
