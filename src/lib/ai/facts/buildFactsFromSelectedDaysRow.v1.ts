// src/lib/ai/facts/buildFactsFromSelectedDaysRow.v1.ts
// =====================================================
// Deterministic fact builder (Selected Days row -> FactV1[])
// Truth-only: uses only fields present in selected_days_surface rows.
// =====================================================

import type { FactV1 } from "../contracts/facts_v1";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function fmtScore(x: number): string {
  return Number.isFinite(x) ? String(Math.round(x)) : "ND";
}

function fmtNum(x: number): string {
  return Number.isFinite(x) ? String(x) : "ND";
}

function ymdFromAnyDate(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}

function getScore(r: any): number {
  return toNum(r?.opportunity_score_final_local);
}

function getRegime(r: any): string {
  return typeof r?.opportunity_regime === "string" ? r.opportunity_regime : "";
}

function getWeatherRisk(r: any): number {
  const a = toNum(r?.alert_level_max);
  if (Number.isFinite(a)) return a;
  const b = toNum(r?.weather_alert_level);
  if (Number.isFinite(b)) return b;
  return NaN;
}

function getCompetition10km(r: any): number {
  const c10 = toNum(r?.events_within_10km_count);
  return Number.isFinite(c10) ? c10 : NaN;
}

function getCompetition50km(r: any): number {
  const c50 = toNum(r?.events_within_50km_count);
  return Number.isFinite(c50) ? c50 : NaN;
}

function getEvidenceComplete(r: any): boolean | null {
  if (typeof r?.evidence_completeness_flag === "boolean") return r.evidence_completeness_flag;
  return null;
}

function getPrimaryDriverFr(r: any): { label_fr: string | null; confidence_fr: string | null } {
  const label_fr = typeof r?.primary_score_driver_label_fr === "string" ? r.primary_score_driver_label_fr : null;
  const confidence_fr = typeof r?.primary_driver_confidence_fr === "string" ? r.primary_driver_confidence_fr : null;
  return { label_fr, confidence_fr };
}

export function buildFactsFromSelectedDaysRowV1(r: any): FactV1[] {
  const d = ymdFromAnyDate(r?.date);
  const facts: FactV1[] = [];

  // Governance verdict (truth)
  const regime = getRegime(r) || "ND";
  const score = getScore(r);
  facts.push({
    fact_id: `F.governance.verdict.${d}`,
    date: d,
    dimension: "governance",
    label_fr: `Régime ${regime}, score ${fmtScore(score)}`,
    source_fields: ["opportunity_regime", "opportunity_score_final_local"],
  });

  // Weather (alert max proxy)
  const wx = getWeatherRisk(r);
  facts.push({
    fact_id: `F.weather.alert_max.${d}`,
    date: d,
    dimension: "weather",
    label_fr: `Alerte météo max ${fmtNum(wx)}`,
    source_fields: ["alert_level_max", "weather_alert_level"],
  });

  // Competition (radius-scoped)
  const c10 = getCompetition10km(r);
  const c50 = getCompetition50km(r);
  facts.push({
    fact_id: `F.competition.count_10km.${d}`,
    date: d,
    dimension: "competition",
    label_fr: `Événements ≤10km: ${fmtNum(c10)}`,
    source_fields: ["events_within_10km_count"],
  });
  facts.push({
    fact_id: `F.competition.count_50km.${d}`,
    date: d,
    dimension: "competition",
    label_fr: `Événements ≤50km: ${fmtNum(c50)}`,
    source_fields: ["events_within_50km_count"],
  });

  // Evidence completeness (if present)
  const ev = getEvidenceComplete(r);
  if (ev !== null) {
    facts.push({
      fact_id: `F.governance.evidence_completeness.${d}`,
      date: d,
      dimension: "governance",
      label_fr: ev ? "Preuves complètes" : "Preuves incomplètes",
      source_fields: ["evidence_completeness_flag"],
    });
  }

  // Primary driver (FR) (if present)
  const drv = getPrimaryDriverFr(r);
  if (drv.label_fr || drv.confidence_fr) {
    facts.push({
      fact_id: `F.governance.primary_driver.${d}`,
      date: d,
      dimension: "governance",
      label_fr: `Driver principal: ${drv.label_fr ?? "ND"} (${drv.confidence_fr ?? "ND"})`,
      source_fields: ["primary_score_driver_label_fr", "primary_driver_confidence_fr"],
    });
  }

  return facts;
}
