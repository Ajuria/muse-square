// src/lib/ai/assertions/assertions_v1.ts
//
// V3 Enforcements (contract-safe)
// - no LineItem without fact_ids
// - every referenced fact_id must exist in facts_by_date
//

import type { FactV1, LineItemV1 } from "../contracts/facts_v1";

function buildFactsIndex(facts_by_date: Record<string, FactV1[]>): Set<string> {
  const ids = new Set<string>();
  for (const k of Object.keys(facts_by_date)) {
    for (const f of facts_by_date[k] ?? []) {
      if (f?.fact_id) ids.add(f.fact_id);
    }
  }
  return ids;
}

// Non-negotiable V3 invariant:
// no surfaced sentence without fact_id AND no unknown fact_id.
export function assertNoSentenceWithoutFactIdV1(
  facts_by_date: Record<string, FactV1[]>,
  line_items: LineItemV1[]
): void {
  const idx = buildFactsIndex(facts_by_date);

  for (let i = 0; i < (line_items ?? []).length; i++) {
    const li = line_items[i];

    if (!li) throw new Error(`LineItem[${i}] undefined`);

    if (!Array.isArray(li.fact_ids) || li.fact_ids.length < 1) {
      throw new Error(`LineItem[${i}] has no fact_ids`);
    }

    for (const fid of li.fact_ids) {
      if (!idx.has(fid)) {
        throw new Error(`LineItem[${i}] references unknown fact_id: ${fid}`);
      }
    }
  }
}
