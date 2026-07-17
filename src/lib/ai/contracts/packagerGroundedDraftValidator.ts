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
  // 4e source légale (18/07) : les faits DE LA CARTE elle-même — titre/synthèse rendus depuis le
  // mart + seed de rédaction + payload du signal. Première partie (les ventes du lieu, calculées
  // par nos pipelines), même niveau de confiance que userInstruction : une note interne qui cite
  // « 34,2 % remisés, 3 682 € réalisés » ne fabrique rien — elle répète la carte. Sans cette
  // source, tout brouillon fidèle à une carte ventes était rejeté (ses chiffres ne sont pas dans
  // le brief du cerveau). Le seam tient : entité/chiffre absent des 4 sources → rejet inchangé.
  cardFacts?: string;             // cardWhat + cardSowhat + draftSeed + JSON(signal)
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
    (ctx.cardFacts ?? "") + "  " +
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
  // Par LIGNE : un brouillon a des titres (« AUX ÉQUIPES COMMERCIALES ») suivis de texte — le
  // regex traversait le saut de ligne et fusionnait titre + 1er mot du paragraphe en une pseudo-
  // entité introuvable (18/07). Une vraie entité fabriquée vit sur une ligne : le seam tient.
  for (const line of text.split(/[\r\n]+/)) {
    for (const ent of line.match(entityRe) ?? []) {
      const e = norm(ent);
      if (e.length < 6 || seen.has(e)) continue;
      seen.add(e);
      if (!legalEntities.includes(e)) errors.push(`grounded_draft: ungrounded named entity: "${ent}"`);
    }
  }

  // 3) OUTCOME / causal — no fabricated result on the venue OR an external entity ("augmentera vos ventes",
  //    a competitor "à guichets fermés", "affiche complet", "record d'affluence"). Advice/CTA imperatives pass.
  const t = norm(text);
  for (const p of [...CAUSAL_PATTERNS, ...DRAFT_OUTCOME_PATTERNS]) {
    if (t.includes(p)) errors.push(`grounded_draft: forbidden fabricated outcome: "${p}"`);
  }

  return errors.length ? [false, errors] : [true, []];
}
