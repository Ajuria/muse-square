// Grounding validator for the grounded day answer. HARD failure (reject) — never warn-and-pass — when
// the output states a number, a key-fact, or a causal claim that does not trace to a citable_fact.
// The forbidden envelope stops being hope and becomes enforced here.

import { groundedFactStrings, type GroundedDayPayload } from "../groundedPayload";
import {
  extractNumbers, extractNumbersWithUnits, reproducibleSumDiff,
  norm, extractNamedEntities, splitSentences,
  CAUSAL_ATTRIBUTION_PATTERNS, PREDICTED_OUTCOME_PATTERNS,
} from "./groundingChecks";
import { TIER_TOKEN_FR } from "../../sensitivityCopy";




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
  // sentence_provenance (Phase 1 #6) is OPTIONAL to the validator even though the schema requires it: the
  // deterministic floors (honest-absence / family / day_why) construct outputs without it and bypass the
  // model entirely, so the validator must tolerate its absence. When present it must be well-shaped.
  if (output.sentence_provenance !== undefined) {
    if (!Array.isArray(output.sentence_provenance)) {
      errors.push("grounded_day: sentence_provenance must be an array");
    } else if (!output.sentence_provenance.every(
      (p: any) => p && typeof p.text === "string" && Array.isArray(p.fact_ids),
    )) {
      errors.push("grounded_day: each sentence_provenance entry needs {text: string, fact_ids: string[]}");
    }
  }
  if (errors.length) return [false, errors];

  const factStrings = groundedFactStrings(payload);
  const groundedText = factStrings.join("  ");

  // all surfaced text (what the operator reads) — headline + answer + facts + reasons + CAVEATS. No
  // synthesized action: the operator sees the REAL fired action card, attached in code, never LLM-invented.
  // All the fabrication guards below (number / entity / causal-outcome) apply to this text. Caveats are
  // included since Phase 1 #2: they were the one unscanned surfaced field, and feedback-driven
  // regeneration made that hole REACHABLE — a model told "entity X was rejected" relocates X into a
  // caveat ("aucune donnée sur le Festival Imaginaire…") and passes. Honest denials stay possible,
  // phrased generically ("l'événement que vous mentionnez") — the prompt says so.
  // Scanned PER SEGMENT, never as one join: an entity must not straddle two facts ("Portugal  Contexte"),
  // and the tiered causal register (Phase 1 #5) is a per-sentence property. `segments` is that surface.
  const reasons: string[] = Array.isArray(output.reasons) ? output.reasons : [];
  const caveats: string[] = Array.isArray(output.caveats) ? output.caveats : [];
  const segments: string[] = [output.headline, output.answer, ...output.key_facts, ...reasons, ...caveats]
    .map((x: any) => String(x ?? ""));

  // 2) NUMBER grounding — every number surfaced must exist SOMEWHERE the model was shown: the citable
  //    facts OR the raw signals/engines it received OR the date. A number absent from the whole payload is
  //    invented (rounded/counted/hallucinated) → reject. (score_delta, distances, ratings etc. are grounded.)
  //    ONE carve-out (bounded arithmetic, Phase 1 #4): a number absent from the payload passes iff the
  //    validator itself can REPRODUCE it as a same-unit sum/diff of two numbers from the facts the model
  //    CITED (cited_fact_ids) — the model states "260 €", we recompute 1500−1240 from the cited fact and
  //    confirm. Anything we cannot reproduce (wrong total, %, rounding, uncited operand) rejects as before.
  const payloadNumericText = groundedText + " " +
    JSON.stringify(payload.signals ?? {}) + " " +
    JSON.stringify(payload.engines ?? {}) + " " +
    (payload.display_date ?? "") + " " + (payload.date ?? "");
  const allowedNums = extractNumbers(payloadNumericText);
  const citedIdSet = new Set((output.cited_fact_ids as any[]).map((x) => String(x)));
  const citedFactText = payload.citable_facts
    .filter((f) => citedIdSet.has(f.id))
    .map((f) => f.fact_fr)
    .join("  ");
  const ungroundedNums: string[] = [];
  const seenNums = new Set<string>();
  for (const seg of segments) {
    for (const nu of extractNumbersWithUnits(seg)) {
      const key = String(nu.v);
      if (allowedNums.has(key) || seenNums.has(key)) continue;
      seenNums.add(key);
      const rep = reproducibleSumDiff(nu, citedFactText);
      if (rep.ok) {
        warnings.push(`grounded_day: derived number ${key} accepted (recomputed ${rep.expr} from cited facts)`);
      } else {
        ungroundedNums.push(key);
      }
    }
  }
  if (ungroundedNums.length) {
    errors.push(`grounded_day: ungrounded number(s) not in any citable_fact: ${ungroundedNums.join(", ")}`);
  }

  // 3) ENTITY grounding — a named entity (2+ consecutive Capitalized words, e.g. a competitor/event/place)
  //    must trace to a fact. Phase 1 #6 (per-sentence cite-with-reasoning) TIGHTENS this from a global
  //    "appears somewhere in the whole payload" scan to a LOCAL "appears in the fact this sentence cites".
  //
  //    `sentence_provenance` maps each surfaced claim to the fact_ids backing it. When present (the schema
  //    now requires it, so this is the live path on every structured call), an entity is grounded iff it
  //    appears in the fact text of the provenance entry that carries it — NOT merely somewhere in the
  //    payload. This rejects "entity real in fact f7, but surfaced in a sentence citing f2", which the old
  //    global scan waved through. It also closes the hiding hole: an entity in answer/key_facts with no
  //    covering provenance entry is an undeclared claim → reject.
  //
  //    Absent `sentence_provenance` (v3 uses a different validator; older payloads; a model w/o the
  //    schema), it falls back to the global scan below — never weaker than today.
  const globalPayloadEntityText = norm(
    groundedText + " " + JSON.stringify(payload.signals ?? {}) + " " + JSON.stringify(payload.engines ?? {}) + " " +
    (payload.venue?.site_name ?? "") + " " + (payload.venue?.business_description ?? "")
  );
  const provenance: Array<{ text: string; fact_ids: string[] }> =
    Array.isArray(output.sentence_provenance) ? output.sentence_provenance : [];
  const factById = new Map(payload.citable_facts.map((f) => [f.id, f.fact_fr]));

  // Every provenance fact_id must be a real id (mirrors the cited_fact_ids check).
  for (const pv of provenance) {
    for (const id of Array.isArray(pv.fact_ids) ? pv.fact_ids : []) {
      if (!factById.has(String(id))) errors.push(`grounded_day: sentence_provenance cites unknown fact_id: "${String(id)}"`);
    }
  }

  const usePerSentence = provenance.length > 0;
  const seenEnt = new Set<string>();
  for (const seg of segments) {
    for (const ent of extractNamedEntities(seg)) {
      const e = norm(ent);
      if (e.length < 6 || seenEnt.has(e)) continue;
      seenEnt.add(e);

      if (!usePerSentence) {
        if (!globalPayloadEntityText.includes(e)) errors.push(`grounded_day: ungrounded named entity: "${ent}"`);
        continue;
      }

      // LOCAL check: find the provenance entry (or entries) whose declared text contains this entity, and
      // require the entity to appear in the fact text those entries cite. An entity declared nowhere, or
      // declared against facts that don't contain it, is ungrounded.
      const covering = provenance.filter((pv) => norm(String(pv.text ?? "")).includes(e));
      if (!covering.length) {
        errors.push(`grounded_day: named entity "${ent}" not declared in sentence_provenance (undeclared claim)`);
        continue;
      }
      const groundedInCitedFact = covering.some((pv) =>
        (Array.isArray(pv.fact_ids) ? pv.fact_ids : [])
          .map((id) => norm(String(factById.get(String(id)) ?? "")))
          .some((factText) => factText.includes(e)),
      );
      if (!groundedInCitedFact) {
        errors.push(`grounded_day: named entity "${ent}" not grounded in the fact its sentence cites`);
      }
    }
  }

  // 4) CAUSAL claims — the TIERED register (Phase 1 #5). Two groups, deliberately not one scan:
  //
  //    a. PREDICTED OUTCOME ("augmentera vos ventes") — a promise about the FUTURE. Rejected everywhere,
  //       always, at any tier: no measured past effect grounds a claim about what will happen.
  //    b. CAUSAL ATTRIBUTION ("a fait baisser") — a claim about the PAST. Legal ONLY in a sentence that
  //       (i) belongs to an output citing a `measured` / `observed_difference` fact, and (ii) carries that
  //       fact's OWN tier token. Both conditions, per sentence — the check the old whole-text scan of
  //       CAUSAL_PATTERNS could not express.
  //
  // Why per sentence: "la chaleur a fait baisser votre CA" + a tier token parked in a different sentence
  // is not a labelled causal claim, it is an unlabelled one next to a disclaimer. The operator reads the
  // sentence, so the sentence carries the register.
  const citedCausalFacts = payload.citable_facts.filter(
    (f) => citedIdSet.has(f.id) && (f.claim_type === "measured" || f.claim_type === "observed_difference"),
  );
  // Only the tiers of the CITED engine-backed facts unlock — not any tier word the model happens to type.
  const licensedTierTokens = citedCausalFacts
    .map((f) => (f.tier ? norm(TIER_TOKEN_FR[f.tier]) : null))
    .filter((t): t is string => Boolean(t));

  for (const seg of segments) {
    for (const sentence of splitSentences(seg)) {
      const sNorm = norm(sentence);

      for (const p of PREDICTED_OUTCOME_PATTERNS) {
        if (sNorm.includes(p)) errors.push(`grounded_day: forbidden predicted outcome: "${p}"`);
      }

      const hit = CAUSAL_ATTRIBUTION_PATTERNS.find((p) => sNorm.includes(p));
      if (!hit) continue;
      if (!citedCausalFacts.length) {
        errors.push(`grounded_day: causal construction "${hit}" without any cited measured/observed_difference fact`);
        continue;
      }
      if (!licensedTierTokens.some((t) => sNorm.includes(t))) {
        errors.push(`grounded_day: causal construction "${hit}" without its cited fact's tier token in the same sentence`);
        continue;
      }
      warnings.push(`grounded_day: tiered causal claim accepted ("${hit}", tier-labelled, cited measured fact)`);
    }
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
