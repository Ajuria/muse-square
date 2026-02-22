// src/lib/ai/decision/engines/compare_dates.ts
// =====================================================
// Engine — COMPARE_DATES (deterministic, V1 IR)
// =====================================================
//
// V0-safe boundary:
// - The engine selects facts + template IDs (LineItemV1).
// - The renderer owns all French phrasing (RenderLineV1.text_fr).
//
// This prevents drift/inconsistency and makes Claude a drop-in renderer later.
//


export type CompareDatesInput = {
  rows: any[]; // selected_days_rows (semantic truth)
};

export type DimensionV1 =
  | "governance"
  | "competition"
  | "weather"
  | "calendar"
  | "envelope_7d"
  | "meta";

export type CoverageStatusV1 = "full" | "partial" | "none";

export type CoverageItemV1 = {
  dimension: DimensionV1;
  status: CoverageStatusV1;
  present_fields: string[];
  missing_fields: string[];
  note_fr?: string;
};

export type CoverageBlockV1 = {
  v: 1;
  by_dimension: CoverageItemV1[];
};

export type FactV1 = {
  fact_id: string; // stable
  date: string; // YYYY-MM-DD (best effort; derived from row.date)
  dimension: DimensionV1;
  label_fr: string; // factual statement (renderer may ignore and use params instead)
  source_fields: string[];
};

export type ImpactBucketV1 = "watchout" | "neutral" | "unknown";

export type TemplateIdV1 =
  | "HEADLINE_COMPARE"
  | "TIE_EQUIVALENT_DATES"
  | "WINNER_VERDICT"
  | "WINNER_WEATHER_ALERT"
  | "WINNER_COMPETITION_LOCAL_REGIONAL"
  | "WINNER_PRIMARY_DRIVER"
  | "EVIDENCE_INCOMPLETE"
  | "ALTERNATIVE_SUMMARY";

export type LineItemV1 = {
  kind: "headline" | "fact" | "implication" | "caveat";
  template_id: TemplateIdV1;
  fact_ids: string[]; // MUST be non-empty in normal flow
  params?: Record<string, any>;
};

export type RenderLineV1 = {
  kind: "headline" | "fact" | "implication" | "caveat";
  text_fr: string;
  fact_ids: string[];
};

export type CompareDatesOutputV1 = {
  ok: true;

  used_dates: string[]; // in input order, normalized
  winner_date: string | null;
  tie_flag: boolean;

  coverage: CoverageBlockV1;

  facts_by_date: Record<string, FactV1[]>;

  // Engine IR (no free-form FR)
  line_items: LineItemV1[];
};

// Legacy compatibility (optional during migration)
export type CompareDatesOutputLegacy = {
  ok: true;
  headline: string;
  summary: string;
  key_facts: string[];
  caveat: string | null;
  // attach trace for audits
  v1?: CompareDatesOutputV1;
};

// -----------------------------
// Helpers (pure, deterministic)
// -----------------------------

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function ymdFromAnyDate(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  // IMPORTANT: we keep deterministic placeholder rather than current date (no invention)
  return "(date inconnue)";
}

function regimeRank(v: unknown): number {
  const s = typeof v === "string" ? v.trim().toUpperCase() : "";
  if (s === "A") return 0;
  if (s === "B") return 1;
  if (s === "C") return 2;
  return 9;
}

function fmtScore(x: number): string {
  return Number.isFinite(x) ? String(Math.round(x)) : "ND";
}

function fmtNum(x: number): string {
  return Number.isFinite(x) ? String(x) : "ND";
}

function getScore(r: any): number {
  return toNum(r?.opportunity_score_final_local);
}

function getRegime(r: any): string {
  return typeof r?.opportunity_regime === "string" ? r.opportunity_regime : "";
}

// weather risk: prefer alert_level_max if present, else weather_alert_level
function getWeatherRisk(r: any): number {
  const a = toNum(r?.alert_level_max);
  if (Number.isFinite(a)) return a;

  const b = toNum(r?.weather_alert_level);
  if (Number.isFinite(b)) return b;

  return NaN;
}

// Competition is explicitly radius-scoped (truth discipline):
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

function stableUniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = String(x ?? "").trim();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function isTieOnDeterministicCriteria(a: any, b: any): boolean {
  const ra = regimeRank(a?.opportunity_regime);
  const rb = regimeRank(b?.opportunity_regime);
  if (ra !== rb) return false;

  const sa = getScore(a), sb = getScore(b);
  if (Number.isFinite(sa) !== Number.isFinite(sb)) return false;
  if (Number.isFinite(sa) && Number.isFinite(sb) && sa !== sb) return false;

  const wa = getWeatherRisk(a), wb = getWeatherRisk(b);
  if (Number.isFinite(wa) !== Number.isFinite(wb)) return false;
  if (Number.isFinite(wa) && Number.isFinite(wb) && wa !== wb) return false;

  const ca = getCompetition10km(a), cb = getCompetition10km(b);
  if (Number.isFinite(ca) !== Number.isFinite(cb)) return false;
  if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) return false;

  return true;
}

// -----------------------------
// Minimal deterministic fact builder (truth-based, local).
// NOTE: later you will replace with buildFactsFromSelectedDaysRowV1(...) shared module.
// -----------------------------

function buildFactsForRowV1(r: any): FactV1[] {
  const d = ymdFromAnyDate(r?.date);

  const facts: FactV1[] = [];

  const regime = getRegime(r) || "ND";
  const score = getScore(r);
  facts.push({
    fact_id: `F.governance.verdict.${d}`,
    date: d,
    dimension: "governance",
    label_fr: `Régime ${regime}, score ${fmtScore(score)}`,
    source_fields: ["opportunity_regime", "opportunity_score_final_local"],
  });

  const wx = getWeatherRisk(r);
  facts.push({
    fact_id: `F.weather.alert_max.${d}`,
    date: d,
    dimension: "weather",
    label_fr: `Alerte météo max ${fmtNum(wx)}`,
    source_fields: ["alert_level_max", "weather_alert_level"],
  });

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

// -----------------------------
// Minimal deterministic coverage builder (truth-based, local).
// NOTE: later you will replace with buildCoverageFromRowsV1(...) shared module.
// This version is conservative and only covers fields used here.
// -----------------------------

function buildCoverageFromRowsLocalV1(rows: any[]): CoverageBlockV1 {
  const required = {
    governance: ["opportunity_regime", "opportunity_score_final_local", "evidence_completeness_flag"],
    weather: ["alert_level_max", "weather_alert_level"],
    competition: ["events_within_10km_count", "events_within_50km_count"],
  } as const;

  const dims: Array<keyof typeof required> = ["governance", "weather", "competition"];

  const by_dimension: CoverageItemV1[] = [];

  for (const dim of dims) {
    const fields = required[dim];
    const present = new Set<string>();
    const missing = new Set<string>();

    for (const f of fields) {
      let anyPresent = false;
      for (const r of rows) {
        if (r && r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== "") {
          anyPresent = true;
          break;
        }
      }
      if (anyPresent) present.add(f);
      else missing.add(f);
    }

    let status: CoverageStatusV1 = "full";
    if (present.size === 0) status = "none";
    else if (missing.size > 0) status = "partial";

    // Evidence completeness downgrades "full" -> "partial" if any date is incomplete
    if (status === "full" && dim === "governance") {
      for (const r of rows) {
        const ev = getEvidenceComplete(r);
        if (ev === false) {
          status = "partial";
          break;
        }
      }
    }

    by_dimension.push({
      dimension: dim,
      status,
      present_fields: [...present],
      missing_fields: [...missing],
    });
  }

  // 7d envelope currently not used here; report none deterministically (you can wire real fields later)
  by_dimension.push({
    dimension: "envelope_7d",
    status: "none",
    present_fields: [],
    missing_fields: [],
    note_fr: "Fenêtre 7 jours indisponible",
  });

  return { v: 1, by_dimension };
}

// -----------------------------
// Engine: IR builder (no French free-form)
// -----------------------------

export function compareDatesDeterministicV1(input: CompareDatesInput): CompareDatesOutputV1 {
  const rows = Array.isArray(input.rows) ? input.rows : [];

  const used_dates = stableUniq(rows.map((r) => ymdFromAnyDate(r?.date)));

  const coverage = buildCoverageFromRowsLocalV1(rows);

  const facts_by_date: Record<string, FactV1[]> = {};
  for (const r of rows) {
    const d = ymdFromAnyDate(r?.date);
    facts_by_date[d] = buildFactsForRowV1(r);
  }

  // If fewer than 2 rows, IR still returns deterministically.
  // Upstream should usually prevent this for COMPARE_DATES, but we keep it safe.
  if (rows.length < 2) {
    const d0 = used_dates[0] ?? "(date inconnue)";
    const f0 = facts_by_date[d0]?.[0]?.fact_id ?? `F.meta.rows_count.${d0}`;
    if (!facts_by_date[d0]) {
      facts_by_date[d0] = [
        {
          fact_id: f0,
          date: d0,
          dimension: "meta",
          label_fr: `Nombre de dates reçues: ${rows.length}`,
          source_fields: ["rows.length"],
        },
      ];
    }

    return {
      ok: true,
      used_dates,
      winner_date: null,
      tie_flag: false,
      coverage,
      facts_by_date,
      line_items: [
        {
          kind: "headline",
          template_id: "HEADLINE_COMPARE",
          fact_ids: [f0],
          params: { mode: "missing_dates" },
        },
      ],
    };
  }

  const cmp = (a: any, b: any): number => {
    // 1) regime asc
    const ra = regimeRank(a?.opportunity_regime);
    const rb = regimeRank(b?.opportunity_regime);
    if (ra !== rb) return ra - rb;

    // 2) score desc (NaN -> worst)
    const sa = getScore(a);
    const sb = getScore(b);
    const saOk = Number.isFinite(sa);
    const sbOk = Number.isFinite(sb);
    if (saOk !== sbOk) return saOk ? -1 : 1;
    if (saOk && sbOk && sa !== sb) return sb - sa;

    // 3) weather risk asc (known beats unknown; lower is better)
    const wa = getWeatherRisk(a);
    const wb = getWeatherRisk(b);
    const waOk = Number.isFinite(wa);
    const wbOk = Number.isFinite(wb);
    if (waOk !== wbOk) return waOk ? -1 : 1;
    if (waOk && wbOk && wa !== wb) return wa - wb;

    // 4) competition LOCAL (10km) asc (known beats unknown; lower is better)
    const ca = getCompetition10km(a);
    const cb = getCompetition10km(b);
    const caOk = Number.isFinite(ca);
    const cbOk = Number.isFinite(cb);
    if (caOk !== cbOk) return caOk ? -1 : 1;
    if (caOk && cbOk && ca !== cb) return ca - cb;

    // 5) earlier date first (stable tie-break)
    return ymdFromAnyDate(a?.date).localeCompare(ymdFromAnyDate(b?.date));
  };

  const sorted = [...rows].sort(cmp);
  const best = sorted[0];
  const second = sorted[1];

  const bestDate = ymdFromAnyDate(best?.date);
  const tie_flag = second ? isTieOnDeterministicCriteria(best, second) : false;

  const bestFacts = facts_by_date[bestDate] ?? [];
  const fidVerdict = bestFacts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id
    ?? bestFacts[0]?.fact_id
    ?? `F.governance.verdict.${bestDate}`;

  const fidWx = bestFacts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${bestDate}`;
  const fidC10 = bestFacts.find((f) => f.source_fields.includes("events_within_10km_count"))?.fact_id ?? `F.competition.count_10km.${bestDate}`;
  const fidC50 = bestFacts.find((f) => f.source_fields.includes("events_within_50km_count"))?.fact_id ?? `F.competition.count_50km.${bestDate}`;
  const fidDrv = bestFacts.find((f) => f.source_fields.includes("primary_score_driver_label_fr"))?.fact_id;
  const fidEv = bestFacts.find((f) => f.source_fields.includes("evidence_completeness_flag"))?.fact_id;

  const line_items: LineItemV1[] = [];

  line_items.push({
    kind: "headline",
    template_id: "HEADLINE_COMPARE",
    fact_ids: [fidVerdict],
    params: { winner_date: bestDate },
  });

  if (tie_flag) {
    line_items.push({
      kind: "caveat",
      template_id: "TIE_EQUIVALENT_DATES",
      fact_ids: [fidVerdict],
      params: { default_choice_date: bestDate },
    });
  }

  line_items.push({
    kind: "fact",
    template_id: "WINNER_VERDICT",
    fact_ids: [fidVerdict],
    params: { date: bestDate },
  });

  const bestWx = getWeatherRisk(best);

  line_items.push({
    kind: "fact",
    template_id: "WINNER_WEATHER_ALERT",
    fact_ids: [fidWx],
    params: {
      date: bestDate,
      alert_level_max: Number.isFinite(bestWx) ? bestWx : null,
    },
  });

  const bestC10 = getCompetition10km(best);
  const bestC50 = getCompetition50km(best);

  line_items.push({
    kind: "fact",
    template_id: "WINNER_COMPETITION_LOCAL_REGIONAL",
    fact_ids: [fidC10, fidC50],
    params: {
      date: bestDate,
      local_radius_km: 10,
      regional_radius_km: 50,
      c10: Number.isFinite(bestC10) ? bestC10 : null,
      c50: Number.isFinite(bestC50) ? bestC50 : null,
    },
  });

  if (fidDrv) {
    line_items.push({
      kind: "fact",
      template_id: "WINNER_PRIMARY_DRIVER",
      fact_ids: [fidDrv],
      params: { date: bestDate },
    });
  }

  if (fidEv) {
    const ev = getEvidenceComplete(best);
    if (ev === false) {
      line_items.push({
        kind: "caveat",
        template_id: "EVIDENCE_INCOMPLETE",
        fact_ids: [fidEv],
        params: { date: bestDate },
      });
    }
  }

  const runnerUps = sorted.slice(1, 3);
  for (const r of runnerUps) {
    const d = ymdFromAnyDate(r?.date);
    const facts = facts_by_date[d] ?? [];
    const fVerd =
      facts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id ??
      facts[0]?.fact_id ??
      `F.governance.verdict.${d}`;

    const fWx = facts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${d}`;
    const fC10 = facts.find((f) => f.source_fields.includes("events_within_10km_count"))?.fact_id ?? `F.competition.count_10km.${d}`;

    const altReg = getRegime(r) || "ND";
    const altScore = getScore(r);
    const altWx = getWeatherRisk(r);
    const altC10 = getCompetition10km(r);

    line_items.push({
      kind: "fact",
      template_id: "ALTERNATIVE_SUMMARY",
      fact_ids: [fVerd, fWx, fC10],
      params: {
        date: d,
        regime: altReg,
        score: Number.isFinite(altScore) ? altScore : null,
        alert_level_max: Number.isFinite(altWx) ? altWx : null,
        c10: Number.isFinite(altC10) ? altC10 : null,
        local_radius_km: 10,
      },
    });
  }

  return {
    ok: true,
    used_dates,
    winner_date: bestDate,
    tie_flag,
    coverage,
    facts_by_date,
    line_items,
  };
}

