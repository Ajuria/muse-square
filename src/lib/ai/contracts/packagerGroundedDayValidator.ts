// Grounding validator for the grounded day answer. HARD failure (reject) — never warn-and-pass — when
// the output states a number, a key-fact, or a causal claim that does not trace to a citable_fact.
// The forbidden envelope stops being hope and becomes enforced here.

import { groundedFactStrings, type GroundedDayPayload } from "../groundedPayload";

// Pull numeric values out of French text: join thousands spaces ("95 349"→"95349"), then every number.
function extractNumbers(text: string): Set<string> {
  const joined = String(text ?? "").replace(/(\d)[  ](?=\d{3}\b)/g, "$1");
  const out = new Set<string>();
  const re = /-?\d+(?:[.,]\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(joined))) {
    const n = Number(m[0].replace(",", "."));
    if (Number.isFinite(n)) out.add(String(Math.round(n * 100) / 100));
  }
  return out;
}

const norm = (s: string): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Causal constructions the forbidden envelope bans on facts (competitor/driver/tourism/signals/weather),
// PLUS predicted-outcome constructions banned on the suggested_action ("X augmentera/boostera vos ventes").
// "Vu X, envisagez Y" (advice, no promised outcome) is NOT here — it's allowed. Conservative list.
const CAUSAL_PATTERNS = [
  // causal attribution on a fact
  "a cause", "ont cause", "a genere", "ont genere", "a fait baisser", "ont fait baisser",
  "a fait grimper", "a fait chuter", "a reduit la frequentation", "a dope", "a booste",
  "responsable de la baisse", "responsable de la hausse", "explique la baisse", "explique la hausse",
  "a provoque", "a entraine une baisse", "a entraine une hausse", "fait exploser", "grace a la concurrence",
  // predicted OUTCOME on the action (a promise, not grounded advice)
  "augmentera", "augmenteront", "boostera", "boosteront", "dopera", "doperont", "rapportera",
  "rapporteront", "generera", "genereront", "fera grimper", "fera gagner", "permettra de gagner",
  "vous fera gagner", "fera venir", "attirera", "doublera", "augmentera vos", "boostera vos",
];

export function validate_packager_output_grounded_day(output: any, row: any): [boolean, string[], string[]?] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const payload = row as GroundedDayPayload;

  // 1) shape
  if (!output || typeof output !== "object") return [false, ["grounded_day: output is not an object"]];
  if (typeof output.headline !== "string" || !output.headline.trim()) errors.push("grounded_day: missing headline");
  if (typeof output.answer !== "string" || !output.answer.trim()) errors.push("grounded_day: missing answer");
  for (const k of ["key_facts", "caveats", "cited_fact_ids"]) {
    if (!Array.isArray(output[k])) errors.push(`grounded_day: ${k} must be an array`);
  }
  if (output.reasons !== undefined && !Array.isArray(output.reasons)) errors.push("grounded_day: reasons must be an array");
  if (output.suggested_action !== undefined && typeof output.suggested_action !== "string") errors.push("grounded_day: suggested_action must be a string");
  if (errors.length) return [false, errors];

  const factStrings = groundedFactStrings(payload);
  const groundedText = factStrings.join("  ");

  // all surfaced text (what the operator will read) — incl. reasons (optional) + the suggested_action.
  // The action is advice but its numbers/entities must still be grounded and it may promise no outcome.
  const reasons: string[] = Array.isArray(output.reasons) ? output.reasons : [];
  const suggestedAction: string = typeof output.suggested_action === "string" ? output.suggested_action : "";
  const surfaced = [output.headline, output.answer, ...output.key_facts, ...reasons, suggestedAction]
    .map((x: any) => String(x ?? ""))
    .join("  ");

  // 2) NUMBER grounding — every number surfaced must exist SOMEWHERE the model was shown: the citable
  //    facts OR the raw signals/engines it received OR the date. A number absent from the whole payload is
  //    invented (rounded/counted/hallucinated) → reject. (score_delta, distances, ratings etc. are grounded.)
  const payloadNumericText = groundedText + " " +
    JSON.stringify(payload.signals ?? {}) + " " +
    JSON.stringify(payload.engines ?? {}) + " " +
    (payload.display_date ?? "") + " " + (payload.date ?? "");
  const allowedNums = extractNumbers(payloadNumericText);
  const surfacedNums = extractNumbers(surfaced);
  const ungroundedNums = [...surfacedNums].filter((n) => !allowedNums.has(n));
  if (ungroundedNums.length) {
    errors.push(`grounded_day: ungrounded number(s) not in any citable_fact: ${ungroundedNums.join(", ")}`);
  }

  // 3) ENTITY grounding — a named entity (2+ consecutive Capitalized words, e.g. a competitor/event/place)
  //    surfaced anywhere must appear in the payload. A planted "Festival Imaginaire de Nîmes" fails here;
  //    grounded paraphrase ("Score +14 points") has no such entity and passes.
  const payloadEntityText = norm(
    groundedText + " " + JSON.stringify(payload.signals ?? {}) + " " + JSON.stringify(payload.engines ?? {}) + " " +
    (payload.venue?.site_name ?? "") + " " + (payload.venue?.business_description ?? "")
  );
  // Uppercase start = [A-Z] + uppercase accented (U+00C0..U+00DD, minus × U+00D7); continuation lowercase.
  const U = "A-Z\\u00C0-\\u00D6\\u00D8-\\u00DD";
  const L = "a-z\\u00DF-\\u00FF\\w'’-";
  const entityRe = new RegExp(`[${U}][${L}]+(?:\\s+(?:de|des|du|d['’]|la|le|les|the|of|von)?\\s*[${U}][${L}]+)+`, "g");
  const seenEnt = new Set<string>();
  // Per SEGMENT (never across the join) so an entity can't straddle two facts ("Portugal  Contexte").
  const segments = [output.headline, output.answer, ...output.key_facts, ...reasons, suggestedAction].map((x: any) => String(x ?? ""));
  for (const seg of segments) {
    for (const ent of seg.match(entityRe) ?? []) {
      const e = norm(ent);
      if (e.length < 6 || seenEnt.has(e)) continue;
      seenEnt.add(e);
      if (!payloadEntityText.includes(e)) errors.push(`grounded_day: ungrounded named entity: "${ent}"`);
    }
  }

  // 4) CAUSAL claims — forbidden envelope enforced
  const surfNorm = norm(surfaced);
  for (const p of CAUSAL_PATTERNS) {
    if (surfNorm.includes(p)) errors.push(`grounded_day: forbidden causal construction: "${p}"`);
  }

  // 5) cited_fact_ids must be real ids (and present when facts exist)
  const validIds = new Set(payload.citable_facts.map((f) => f.id));
  for (const id of output.cited_fact_ids as any[]) {
    if (!validIds.has(String(id))) errors.push(`grounded_day: cited_fact_id not in payload: "${String(id)}"`);
  }
  if (payload.citable_facts.length > 0 && (output.cited_fact_ids as any[]).length === 0) {
    warnings.push("grounded_day: no cited_fact_ids while citable_facts exist");
  }

  return errors.length ? [false, errors] : [true, [], warnings];
}
