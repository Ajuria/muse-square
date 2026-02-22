// src/lib/ai/facts/buildCoverageFromRows.v1.ts
// =====================================================
// Deterministic coverage builder (Selected Days rows -> CoverageBlockV1)
// Truth-only: checks field presence across the provided rows.
// Includes evidence completeness downgrade (full -> partial).
// =====================================================

import type { CoverageBlockV1, CoverageItemV1, CoverageStatusV1 } from "../contracts/facts_v1";

function isPresent(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

function anyRowHasNonNull(rows: any[], field: string): boolean {
  for (const r of rows) {
    if (r && isPresent(r[field])) return true;
  }
  return false;
}

function anyEvidenceIncomplete(rows: any[]): boolean {
  for (const r of rows) {
    if (r && typeof r.evidence_completeness_flag === "boolean" && r.evidence_completeness_flag === false) {
      return true;
    }
  }
  return false;
}

export function buildCoverageFromRowsV1(args: { rows: any[]; used_dates: string[] }): CoverageBlockV1 {
  const rows = Array.isArray(args.rows) ? args.rows : [];

  // Coverage is conservative: only fields we *actually use today* in compare_dates.
  const REQUIRED: Record<string, string[]> = {
    governance: ["opportunity_regime", "opportunity_score_final_local", "evidence_completeness_flag"],
    weather: ["alert_level_max", "weather_alert_level"],
    competition: ["events_within_10km_count", "events_within_50km_count"],
  };

  const by_dimension: CoverageItemV1[] = [];

  for (const [dimension, fields] of Object.entries(REQUIRED)) {
    const present_fields: string[] = [];
    const missing_fields: string[] = [];

    for (const f of fields) {
      if (anyRowHasNonNull(rows, f)) present_fields.push(f);
      else missing_fields.push(f);
    }

    let status: CoverageStatusV1 = "full";
    if (present_fields.length === 0) status = "none";
    else if (missing_fields.length > 0) status = "partial";

    // Evidence completeness downgrade: if any date has evidence incomplete, full -> partial
    if (status === "full" && dimension === "governance" && anyEvidenceIncomplete(rows)) {
      status = "partial";
    }

    by_dimension.push({
      dimension: dimension as any,
      status,
      present_fields,
      missing_fields,
    });
  }

  // 7d envelope: for now, you said those fields are null => report none deterministically.
  by_dimension.push({
    dimension: "envelope_7d",
    status: "none",
    present_fields: [],
    missing_fields: [],
    note_fr: "Fenêtre 7 jours indisponible",
  });

  return { v: 1, by_dimension };
}
