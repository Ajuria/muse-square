// src/lib/ai/decision/worst_days/window_worst_days.ts
// =====================================================
// Engine — WINDOW_WORST_DAYS (deterministic, V1 IR)
// =====================================================
// Purpose:
// - Answer: "Quels sont les jours à éviter ?"
// - Input rows are assumed to be a "worstlist"
//   (deterministically ordered in BigQuery: worst → best)
// - This engine MUST NOT re-rank, re-filter, or invent signals
//
// V1 IR: produces facts_by_date + line_items (same pattern as compare_dates.ts)
// Legacy: headline/summary/key_facts/caveat preserved for backward compat
// =====================================================

import type {
  FactV1,
  LineItemV1,
  TemplateIdV1,
  DimensionV1,
  CoverageBlockV1,
  CoverageStatusV1,
  CoverageItemV1,
} from "../../contracts/facts_v1";

// ---- Output types ----

export type WindowWorstDaysInput = {
  rows: any[];
};

export type WindowWorstDaysOutputV1 = {
  ok: true;
  focus_dates: string[];
  facts_by_date: Record<string, FactV1[]>;
  line_items: LineItemV1[];
  coverage: CoverageBlockV1;
};

export type WindowWorstDaysOutputLegacy = {
  ok: true;
  headline: string;
  summary: string;
  key_facts: string[];
  caveat: string | null;
  v1?: WindowWorstDaysOutputV1;
};

// ---- Helpers (pure, deterministic) ----

function ymd(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string")
    return v.value.trim().slice(0, 10);
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return v.toISOString().slice(0, 10);
  return "(date inconnue)";
}

function num(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return null;
}

function getScore(r: any): number | null { return num(r?.opportunity_score_final_local); }
function getRegime(r: any): string { return typeof r?.opportunity_regime === "string" ? r.opportunity_regime : ""; }

function getWeatherAlert(r: any): number | null {
  const a = num(r?.alert_level_max);
  if (a !== null) return a;
  return num(r?.weather_alert_level);
}

function getC500m(r: any): number | null { return num(r?.events_within_500m_count); }
function getC1km(r: any): number | null { return num(r?.events_within_1km_count); }
function getC5km(r: any): number | null { return num(r?.events_within_5km_count); }

function getDriverLabel(r: any): string | null {
  if (typeof r?.primary_score_driver_label === "string") return r.primary_score_driver_label;
  if (typeof r?.primary_score_driver_label_fr === "string") return r.primary_score_driver_label_fr;
  return null;
}

function fmtScore(x: number | null): string { return x !== null ? String(Math.round(x)) : "ND"; }
function fmtNum(x: number | null): string { return x !== null ? String(x) : "ND"; }

// ---- Fact builders (per date) ----

function buildFactsForDate(r: any): FactV1[] {
  const d = ymd(r?.date);
  const facts: FactV1[] = [];

  // Governance
  const regime = getRegime(r) || "ND";
  const score = getScore(r);
  facts.push({
    fact_id: `F.governance.verdict.${d}`,
    date: d,
    dimension: "governance",
    label_fr: `Régime ${regime}, score ${fmtScore(score)}`,
    source_fields: ["opportunity_regime", "opportunity_score_final_local"],
  });

  // Weather
  const wx = getWeatherAlert(r);
  facts.push({
    fact_id: `F.weather.alert_max.${d}`,
    date: d,
    dimension: "weather",
    label_fr: `Alerte météo max ${fmtNum(wx)}`,
    source_fields: ["alert_level_max", "weather_alert_level"],
  });

  // Competition (500m / 1km / 5km)
  const c500m = getC500m(r);
  const c1km = getC1km(r);
  const c5km = getC5km(r);
  facts.push({
    fact_id: `F.competition.proximity.${d}`,
    date: d,
    dimension: "competition",
    label_fr: `Concurrence: ${fmtNum(c500m)} à 500m, ${fmtNum(c1km)} à 1km, ${fmtNum(c5km)} à 5km`,
    source_fields: ["events_within_500m_count", "events_within_1km_count", "events_within_5km_count"],
  });

  // Driver
  const driver = getDriverLabel(r);
  if (driver) {
    facts.push({
      fact_id: `F.governance.primary_driver.${d}`,
      date: d,
      dimension: "governance",
      label_fr: `Driver principal: ${driver}`,
      source_fields: ["primary_score_driver_label", "primary_score_driver_label_fr"],
    });
  }

  // Calendar
  const isWeekend = toBool(r?.is_weekend);
  const isHoliday = toBool(r?.is_public_holiday_fr_flag);
  const isVacation = toBool(r?.is_school_holiday_flag);
  const isCommercial = toBool(r?.is_commercial_event_flag);

  if (isWeekend !== null || isHoliday !== null || isVacation !== null || isCommercial !== null) {
    const tags: string[] = [];
    if (isWeekend === true) tags.push("week-end");
    if (isHoliday === true) tags.push("jour férié");
    if (isVacation === true) tags.push("vacances");
    if (isCommercial === true) tags.push("temps fort commercial");

    facts.push({
      fact_id: `F.calendar.context.${d}`,
      date: d,
      dimension: "calendar",
      label_fr: tags.length > 0 ? tags.join(" + ") : "calendrier standard",
      source_fields: ["is_weekend", "is_public_holiday_fr_flag", "is_school_holiday_flag", "is_commercial_event_flag"],
    });
  }

  return facts;
}

// ---- Coverage builder ----

function buildCoverage(rows: any[]): CoverageBlockV1 {
  const dims: Array<{ dim: DimensionV1; fields: string[] }> = [
    { dim: "governance", fields: ["opportunity_regime", "opportunity_score_final_local"] },
    { dim: "weather", fields: ["alert_level_max", "weather_alert_level"] },
    { dim: "competition", fields: ["events_within_500m_count", "events_within_1km_count", "events_within_5km_count"] },
    { dim: "calendar", fields: ["is_weekend", "is_public_holiday_fr_flag", "is_school_holiday_flag"] },
  ];

  const by_dimension: CoverageItemV1[] = dims.map(({ dim, fields }) => {
    const present = new Set<string>();
    const missing = new Set<string>();

    for (const f of fields) {
      let found = false;
      for (const r of rows) {
        if (r && r[f] !== null && r[f] !== undefined && String(r[f]).trim() !== "") {
          found = true;
          break;
        }
      }
      if (found) present.add(f); else missing.add(f);
    }

    let status: CoverageStatusV1 = "full";
    if (present.size === 0) status = "none";
    else if (missing.size > 0) status = "partial";

    return { dimension: dim, status, present_fields: [...present], missing_fields: [...missing] };
  });

  return { v: 1, by_dimension };
}

// ---- V1 IR engine ----

function windowWorstDaysV1(rows: any[]): WindowWorstDaysOutputV1 {
  if (rows.length === 0) {
    const emptyFact: FactV1 = {
      fact_id: "F.meta.empty_worstlist",
      date: "(date inconnue)",
      dimension: "meta",
      label_fr: "Aucun jour à risque dans la fenêtre",
      source_fields: ["rows.length"],
    };

    return {
      ok: true,
      focus_dates: [],
      facts_by_date: { window_scope: [emptyFact] },
      line_items: [{
        kind: "headline",
        template_id: "HEADLINE_WORST_DAYS" as TemplateIdV1,
        fact_ids: [emptyFact.fact_id],
        params: { mode: "empty" },
      }],
      coverage: { v: 1, by_dimension: [] },
    };
  }

  const worst = rows.slice(0, 3);
  const focus_dates = worst.map((r) => ymd(r?.date));

  const facts_by_date: Record<string, FactV1[]> = {};
  for (const r of worst) {
    const d = ymd(r?.date);
    facts_by_date[d] = buildFactsForDate(r);
  }

  const coverage = buildCoverage(worst);
  const line_items: LineItemV1[] = [];

  // --- Worst date (first) ---
  const wDate = focus_dates[0];
  const wFacts = facts_by_date[wDate] ?? [];
  const fidVerdict = wFacts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id
    ?? wFacts[0]?.fact_id ?? `F.governance.verdict.${wDate}`;
  const fidWx = wFacts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${wDate}`;
  const fidComp = wFacts.find((f) => f.dimension === "competition")?.fact_id ?? `F.competition.proximity.${wDate}`;
  const fidDriver = wFacts.find((f) => f.source_fields.includes("primary_score_driver_label"))?.fact_id;

  line_items.push({
    kind: "headline",
    template_id: "WORST_DAY_VERDICT" as TemplateIdV1,
    fact_ids: [fidVerdict],
    params: {
      date: wDate,
      regime: getRegime(worst[0]) || "ND",
      score: getScore(worst[0]),
    },
  });

  line_items.push({
    kind: "fact",
    template_id: "WORST_WEATHER_ALERT" as TemplateIdV1,
    fact_ids: [fidWx],
    params: { date: wDate, alert_level_max: getWeatherAlert(worst[0]) },
  });

  line_items.push({
    kind: "fact",
    template_id: "WORST_COMPETITION_LOCAL_REGIONAL" as TemplateIdV1,
    fact_ids: [fidComp],
    params: {
      date: wDate,
      c500m: getC500m(worst[0]),
      c1km: getC1km(worst[0]),
      c5km: getC5km(worst[0]),
    },
  });

  if (fidDriver) {
    line_items.push({
      kind: "fact",
      template_id: "WORST_PRIMARY_DRIVER" as TemplateIdV1,
      fact_ids: [fidDriver],
      params: { date: wDate },
    });
  }

  // --- Other worst dates (2 & 3) ---
  for (const r of worst.slice(1)) {
    const d = ymd(r?.date);
    const dFacts = facts_by_date[d] ?? [];
    const fVerd = dFacts.find((f) => f.dimension === "governance")?.fact_id ?? `F.governance.verdict.${d}`;
    const fWx = dFacts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${d}`;
    const fComp = dFacts.find((f) => f.dimension === "competition")?.fact_id ?? `F.competition.proximity.${d}`;

    line_items.push({
      kind: "fact",
      template_id: "ALTERNATIVE_SUMMARY" as TemplateIdV1,
      fact_ids: [fVerd, fWx, fComp],
      params: {
        date: d,
        regime: getRegime(r) || "ND",
        score: getScore(r),
        alert_level_max: getWeatherAlert(r),
        c500m: getC500m(r),
        c1km: getC1km(r),
        c5km: getC5km(r),
      },
    });
  }

  return { ok: true, focus_dates, facts_by_date, line_items, coverage };
}

// ---- Public export: legacy shape + V1 IR ----

export function windowWorstDaysDeterministic(
  input: WindowWorstDaysInput
): WindowWorstDaysOutputLegacy {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const v1 = windowWorstDaysV1(rows);

  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache (côté risques)",
      summary: "Aucune date n'est clairement ressortie comme \"à éviter\" sur cette période.",
      key_facts: ["Décision : vérifiez un jour précis si vous suspectez un risque non capté."],
      caveat: "Worstlist vide après application des critères.",
      v1,
    };
  }

  const worst = rows.slice(0, 3);
  const dates = worst.map((r) => ymd(r?.date));
  const key_facts: string[] = [];

  key_facts.push(`Décision : évitez en priorité ${dates.join(", ")}.`);

  const wxValues = worst.map((r) => getWeatherAlert(r));
  const wxKnown = wxValues.filter((x): x is number => x !== null);
  if (wxKnown.length === 0) key_facts.push("Météo : signal indisponible sur ces dates.");
  else if (wxKnown.every((x) => x === 0)) key_facts.push("Météo : aucune alerte météo signalée sur ces dates.");
  else key_facts.push("Météo : signaux météo présents sur certaines dates (à surveiller).");

  const compValues = worst.map((r) => getC5km(r) ?? getC1km(r) ?? getC500m(r));
  const compKnown = compValues.filter((x): x is number => x !== null);
  if (compKnown.length === 0) key_facts.push("Concurrence : signal indisponible sur ces dates.");
  else if (compKnown.every((x) => x === 0)) key_facts.push("Concurrence : aucune concurrence directe détectée.");
  else key_facts.push("Concurrence : concurrence présente sur certaines dates.");

  return {
    ok: true,
    headline: "Jours à éviter sur la période",
    summary: "Ces dates ressortent comme les plus défavorables sur la fenêtre analysée.",
    key_facts,
    caveat: null,
    v1,
  };
}