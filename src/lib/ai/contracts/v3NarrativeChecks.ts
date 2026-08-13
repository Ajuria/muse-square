// Étape 2 du chantier Explorer (R4-4, 08/08 — docs/explorer-attribution-spec.md) : la porte de
// GROUNDING des chemins v3_narrative (mois / compare / mobilité / entité in-data), jusqu'ici
// shape-check seulement — la DERNIÈRE surface de chat où un nombre non validé pouvait passer.
//
// Même sémantique que le validateur grounded_day, adaptée au payload allowlisté : tout nombre
// surfacé doit exister dans le payload (magnitude 2-décimales, séparateurs français normalisés par
// groundingChecks), avec la MÊME et SEULE dérogation — une somme/différence exacte de deux nombres
// de même unité du payload (les verdicts compare disent « 5 événements de moins ») ; toute entité
// nommée doit apparaître dans le payload. REJECT, jamais warn-and-pass ; le repli déterministe
// existant (windowTopDays/worstDays/compare) reste le plancher — une réponse rejetée ne ship jamais.

import { extractNumbersWithUnits, extractNamedEntities, norm, type NumWithUnit } from "./groundingChecks";

// Same semantics as groundingChecks.reproducibleSumDiff, with ONE tightening required by this seam:
// operands must have DISTINCT VALUES. The grounded validator derives against a handful of CITED
// facts; here the operand pool is the WHOLE payload (dates, scores…), where « 20 » is trivially
// « 10+10 » off two day-of-month digits (mesuré : la lie-bait « écart FAUX 20 » passait). The shared
// primitive stays untouched — its own lie-bait suite guards the grounded seam.
function reproducibleSumDiffDistinct(stated: NumWithUnit, operandText: string): boolean {
  const nums = extractNumbersWithUnits(operandText);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i].unit !== nums[j].unit) continue;
      if (stated.unit && nums[i].unit && stated.unit !== nums[i].unit) continue;
      const a = nums[i].v, b = nums[j].v;
      if (a === b) continue;                                     // the tightening — distinct values only
      if (r2(a + b) === stated.v || r2(Math.abs(a - b)) === stated.v) return true;
    }
  }
  return false;
}

// The polymorphic v3 `answer` (string | array of row-objects | object) → every surfaced string.
export function v3SurfacedStrings(output: any): string[] {
  const segs: string[] = [];
  const push = (v: any) => { if (typeof v === "string" && v.trim()) segs.push(v); };
  if (!output || typeof output !== "object") return segs;
  push(output.headline);
  push(output.verdict);
  const a = output.answer;
  if (typeof a === "string") push(a);
  else if (Array.isArray(a)) for (const item of a) {
    if (typeof item === "string") push(item);
    else if (item && typeof item === "object") for (const v of Object.values(item)) push(v);
  } else if (a && typeof a === "object") for (const v of Object.values(a)) push(v);
  for (const k of ["key_facts", "reasons", "caveats"]) for (const v of (Array.isArray(output[k]) ? output[k] : [])) push(v);
  return segs;
}

export function validate_v3_grounding(output: any, row: any): [boolean, string[]] {
  const errors: string[] = [];
  const payloadStr = JSON.stringify(row ?? {});
  const allowed = new Set(extractNumbersWithUnits(payloadStr).map((n) => `${n.v}`));
  const payloadNorm = norm(payloadStr);
  for (const seg of v3SurfacedStrings(output)) {
    for (const n of extractNumbersWithUnits(seg)) {
      if (allowed.has(`${n.v}`)) continue;
      // The ONE carve-out, identical to grounded_day rule 1bis: an exact same-unit sum/diff of two
      // payload numbers (recomputed here — the model's word is never taken for arithmetic).
      if (reproducibleSumDiffDistinct(n, payloadStr)) continue;
      errors.push(`v3_narrative: nombre non fondé « ${n.v} » — absent du payload et non dérivable (somme/écart exact de deux nombres de même unité)`);
    }
    for (const e of extractNamedEntities(seg)) {
      if (!payloadNorm.includes(norm(e))) errors.push(`v3_narrative: entité non fondée « ${e} » — absente du payload`);
    }
  }
  return errors.length ? [false, [...new Set(errors)]] : [true, []];
}
