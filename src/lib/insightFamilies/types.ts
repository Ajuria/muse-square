// src/lib/insightFamilies/types.ts
// The "one provider, three consumers" contract for insight card families.
// A family provider reads ONE card family's own data ONCE and returns:
//   - data:    the exact JSON the deep-page renderer (MSCardKit.render<Family>) consumes
//   - facts:   claim-typed French facts for the GROUNDED consumers (prompt Q&A + report
//              exec-summary). Shape MATCHES toGroundedDayPayload's `extraFacts` (id assigned
//              downstream by the grounding adapter) so the validator stays the only gate.
//   - sources: named providers, for the report "Sources & fiabilité" block.
// Deep page, report, and grounded Q&A all reuse the SAME provider — no re-derivation, and
// every fact the LLM can surface still flows through the grounding whitelist.
import type { CitableFact } from "../ai/groundedPayload";

export type FamilyFact = { fact_fr: string; claim_type: CitableFact["claim_type"] };

export interface FamilyResult {
  found: boolean;
  data: Record<string, unknown>;   // -> MSCardKit.render<Family>(data)
  facts: FamilyFact[];             // -> toGroundedDayPayload({ extraFacts })
  sources: string[];
}

export interface FamilyProvider {
  key: string;                     // stable family key (e.g. "footfall")
  title: string;                   // report section heading (French)
  render: string;                  // MSCardKit method name (e.g. "renderFootfall")
  match: RegExp[];                 // question-family routing (the prompt classifier)
  run: (bq: any, location_id: string, date: string) => Promise<FamilyResult>;
}
