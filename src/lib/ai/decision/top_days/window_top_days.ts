// src/lib/ai/decision/top_days/window_top_days.ts
// =====================================================
// Engine — WINDOW_TOP_DAYS (deterministic, V1 IR)
// =====================================================
// Purpose:
// - Answer: "Quels sont les meilleurs jours ?"
// - Input rows are assumed to be the month shortlist
//   (already hard-filtered + deterministically ordered in BigQuery)
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

export type WindowTopDaysInput = {
  rows: any[];
};

export type WindowTopDaysOutputV1 = {
  ok: true;
  focus_dates: string[];
  facts_by_date: Record<string, FactV1[]>;
  line_items: LineItemV1[];
  coverage: CoverageBlockV1;
};

export type WindowTopDaysOutputLegacy = {
  ok: true;
  headline: string;
  summary: string;
  key_facts: string[];
  caveat: string | null;
  v1?: WindowTopDaysOutputV1;
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

function windowTopDaysV1(rows: any[]): WindowTopDaysOutputV1 {
  if (rows.length === 0) {
    const emptyFact: FactV1 = {
      fact_id: "F.meta.empty_shortlist",
      date: "(date inconnue)",
      dimension: "meta",
      label_fr: "Aucun jour éligible dans la fenêtre",
      source_fields: ["rows.length"],
    };

    return {
      ok: true,
      focus_dates: [],
      facts_by_date: { window_scope: [emptyFact] },
      line_items: [{
        kind: "headline",
        template_id: "HEADLINE_TOP_DAYS" as TemplateIdV1,
        fact_ids: [emptyFact.fact_id],
        params: { mode: "empty" },
      }],
      coverage: { v: 1, by_dimension: [] },
    };
  }

  const top = rows.slice(0, 3);
  const focus_dates = top.map((r) => ymd(r?.date));

  const facts_by_date: Record<string, FactV1[]> = {};
  for (const r of top) {
    const d = ymd(r?.date);
    facts_by_date[d] = buildFactsForDate(r);
  }

  const coverage = buildCoverage(top);
  const line_items: LineItemV1[] = [];

  // --- Winner (first date) ---
  const winDate = focus_dates[0];
  const winFacts = facts_by_date[winDate] ?? [];
  const fidVerdict = winFacts.find((f) => f.dimension === "governance" && f.source_fields.includes("opportunity_regime"))?.fact_id
    ?? winFacts[0]?.fact_id ?? `F.governance.verdict.${winDate}`;
  const fidWx = winFacts.find((f) => f.dimension === "weather")?.fact_id ?? `F.weather.alert_max.${winDate}`;
  const fidComp = winFacts.find((f) => f.dimension === "competition")?.fact_id ?? `F.competition.proximity.${winDate}`;
  const fidDriver = winFacts.find((f) => f.source_fields.includes("primary_score_driver_label"))?.fact_id;

  line_items.push({
    kind: "headline",
    template_id: "TOP_DAY_VERDICT" as TemplateIdV1,
    fact_ids: [fidVerdict],
    params: {
      date: winDate,
      regime: getRegime(top[0]) || "ND",
      score: getScore(top[0]),
    },
  });

  line_items.push({
    kind: "fact",
    template_id: "WINNER_WEATHER_ALERT" as TemplateIdV1,
    fact_ids: [fidWx],
    params: { date: winDate, alert_level_max: getWeatherAlert(top[0]) },
  });

  line_items.push({
    kind: "fact",
    template_id: "WINNER_COMPETITION_LOCAL_REGIONAL" as TemplateIdV1,
    fact_ids: [fidComp],
    params: {
      date: winDate,
      c500m: getC500m(top[0]),
      c1km: getC1km(top[0]),
      c5km: getC5km(top[0]),
    },
  });

  if (fidDriver) {
    line_items.push({
      kind: "fact",
      template_id: "WINNER_PRIMARY_DRIVER" as TemplateIdV1,
      fact_ids: [fidDriver],
      params: { date: winDate },
    });
  }

  // --- Alternatives (dates 2 & 3) ---
  for (const r of top.slice(1)) {
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

export function windowTopDaysDeterministic(
  input: WindowTopDaysInput
): WindowTopDaysOutputLegacy {
  const rows = Array.isArray(input?.rows) ? input.rows : [];
  const v1 = windowTopDaysV1(rows);

  if (rows.length === 0) {
    return {
      ok: true,
      headline: "Aucun jour ne se détache",
      summary: "Aucune date ne ressort clairement comme choix prioritaire sur cette période.",
      key_facts: ["Décision : élargissez la période ou ajustez vos contraintes."],
      caveat: "Shortlist vide après application des exclusions.",
      v1,
    };
  }

  const top = rows.slice(0, 3);
  const dates = top.map((r) => ymd(r?.date));
  const key_facts: string[] = [];

  key_facts.push(`Décision : concentrez-vous en priorité sur ${dates.join(", ")}.`);

  const wxValues = top.map((r) => getWeatherAlert(r));
  const wxKnown = wxValues.filter((x): x is number => x !== null);
  if (wxKnown.length === 0) key_facts.push("Météo : signal indisponible sur ces dates.");
  else if (wxKnown.every((x) => x === 0)) key_facts.push("Météo : aucune alerte météo signalée sur ces dates.");
  else key_facts.push("Météo : signaux météo présents sur certaines dates (à surveiller).");

  const compValues = top.map((r) => getC5km(r) ?? getC1km(r) ?? getC500m(r));
  const compKnown = compValues.filter((x): x is number => x !== null);
  if (compKnown.length === 0) key_facts.push("Concurrence : signal indisponible sur ces dates.");
  else if (compKnown.every((x) => x === 0)) key_facts.push("Concurrence : aucune concurrence directe détectée.");
  else key_facts.push("Concurrence : concurrence présente sur certaines dates.");

  return {
    ok: true,
    headline: "Jours à privilégier sur la période",
    summary: "Ces dates ressortent comme les options les plus favorables sur la fenêtre analysée.",
    key_facts,
    caveat: null,
    v1,
  };
}