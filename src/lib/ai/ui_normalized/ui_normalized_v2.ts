// src/lib/ai/ui_normalized/ui_normalized_v2.ts
//
// Deterministic UI Normalizer (V2)
// Goal: generate UI-ready "AI" output that is 100% derived from decision_payload + rows.
// No LLM. No free-form claims. No contradictions.

import { compileMonthImpactNarrationV1 } from "../impact_narrations/compile_month_impact_narration_v1";
import { IMPACT_ASSERTION_ASSETS_V1 } from "../impact_narrations/impact_assertion_asset.v1";

export type OpportunityRegime = "A" | "B" | "C";
export type Impact = "blocking" | "risk" | "neutral";
export type ResolvedHorizon = "month" | "calendar_month" | "day" | "selected_days" | "lookup_event";

export type WindowTopDayRow = {
  date: string; // YYYY-MM-DD
  regime?: OpportunityRegime | null;
  score?: number | null;

  weather_alert_level?: number | null;
  precip_probability_max_pct?: number | null;
  wind_speed_10m_max?: number | null;

  events_within_5km_count?: number | null;
  events_within_10km_count?: number | null;
  events_within_50km_count?: number | null;

  is_weekend?: boolean | null;
  is_public_holiday_fr_flag?: boolean | null;
  is_school_holiday_flag?: boolean | null;
  is_commercial_event_flag?: boolean | null;
};

export type DecisionPayload = {
  horizon: ResolvedHorizon;
  intent: string;
  used_dates: string[];
  signals?: {
    weather?: {
      impact: Impact;
      facts?: {
        weather_alert_level?: number | null;
        precip_probability_max_pct?: number | null;
        wind_speed_10m_max?: number | null;
        venue_exposure?: "indoor" | "outdoor" | "unknown" | null;
      };
      explanation?: string | null;
    };
    competition?: {
      impact: Impact;
      facts?: {
        events_within_5km_count?: number | null;
        events_within_10km_count?: number | null;
        events_within_50km_count?: number | null;
        competition_scope?: "direct" | "regional" | string | null;
      };
      explanation?: string | null;
    };
    calendar?: {
      impact: Impact;
      facts?: {
        is_weekend?: boolean | null;
        is_public_holiday_fr_flag?: boolean | null;
        is_school_holiday_flag?: boolean | null;
        is_commercial_event_flag?: boolean | null;
      };
      explanation?: string | null;
    };
  };
};

export type UiNormalizedV2 = {
  headline: string;
  answer: string;
  reasons: string[]; // reserved for later (still deterministic)
  key_facts: string[];
  caveats: string[];
  meta: {
    v: 2;
    horizon: ResolvedHorizon;
    intent: string;
    used_dates: string[];
    month_constraint?: { year: number; month: number } | null;
    decision_payload_ref: { horizon: ResolvedHorizon; intent: string; used_dates: string[]; source: "decision_payload" };
  };
};

function ymd(v: string): string {
  return v.slice(0, 10);
}

function parseMonthConstraintFromQuestion(q: string): { year?: number; month?: number } | null {
  const s = (q ?? "").toLowerCase();

  // Minimal FR month parsing (extend later if needed)
  const monthMap: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    février: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    août: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
    décembre: 12,
  };

  let month: number | undefined;
  for (const [k, m] of Object.entries(monthMap)) {
    if (s.includes(k)) {
      month = m;
      break;
    }
  }
  if (!month) return null;

  // If user says "février" without year: use window year from anchor elsewhere; caller can fill.
  // We still return month-only.
  return { month };
}

function inferYearFromDates(dates: string[]): number | null {
  const d = dates?.[0];
  if (!d) return null;
  const y = Number(d.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function monthFilterDates(dates: string[], year: number, month: number): string[] {
  const mm = String(month).padStart(2, "0");
  const prefix = `${year}-${mm}-`;
  return (dates ?? []).filter((d) => ymd(d).startsWith(prefix));
}

function pickTopN(rows: WindowTopDayRow[], n: number): WindowTopDayRow[] {
  // deterministic: score desc, then date asc
  const sorted = [...rows].sort((a, b) => {
    const sa = a.score ?? -Infinity;
    const sb = b.score ?? -Infinity;
    if (sb !== sa) return sb - sa;
    return (a.date ?? "").localeCompare(b.date ?? "");
  });
  return sorted.slice(0, n);
}

function impactLabel(i: Impact | undefined): string {
  if (i === "blocking") return "bloquant";
  if (i === "risk") return "à risque";
  return "neutre";
}

// ------------------------------
// Canonical row normalizer (V2)
// ------------------------------
// Goal: accept "truth rows" coming from various SELECTs / views / joins with
// inconsistent naming, nesting, and types, and output a stable WindowTopDayRow.
//
// Constraints:
// - no new files
// - deterministic coercions only
// - never invent values (null when not confidently parseable)

type AnyObj = Record<string, any>;

function getPath(o: any, path: string[]): any {
  let cur = o;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur?.[p];
  }
  return cur;
}

// BigQuery sometimes returns wrappers like { value: "2026-02-01" }
function unwrapValue(v: any): any {
  if (v && typeof v === "object" && "value" in v) return (v as any).value;
  return v;
}

function asString(v: any): string | null {
  const u = unwrapValue(v);
  if (typeof u === "string") return u;
  if (typeof u === "number" && Number.isFinite(u)) return String(u);
  return null;
}

function asNumber(v: any): number | null {
  const u = unwrapValue(v);
  if (typeof u === "number") return Number.isFinite(u) ? u : null;
  if (typeof u === "string" && u.trim() !== "") {
    const n = Number(u);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asBoolean(v: any): boolean | null {
  const u = unwrapValue(v);
  if (typeof u === "boolean") return u;
  if (typeof u === "number") return u === 1 ? true : u === 0 ? false : null;
  if (typeof u === "string") {
    const s = u.trim().toLowerCase();
    if (["true", "t", "yes", "y", "1"].includes(s)) return true;
    if (["false", "f", "no", "n", "0"].includes(s)) return false;
  }
  return null;
}

function pickFirst<T>(...vals: T[]): T {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return vals[vals.length - 1] as T;
}

function normalizeDateYYYYMMDD(input: any): string | null {
  const s = asString(input);
  if (!s) return null;
  // accept ISO strings; always slice to YYYY-MM-DD if possible
  if (s.length >= 10) return s.slice(0, 10);
  return null;
}

function normalizeRegime(input: any): OpportunityRegime | null {
  const s = asString(input);
  if (!s) return null;
  const u = s.trim().toUpperCase();
  if (u === "A" || u === "B" || u === "C") return u;
  return null;
}

export function normalizeWindowTopDayRow(raw: unknown): WindowTopDayRow {
  const r = (raw ?? {}) as AnyObj;

  // date can be: r.date, r.day_date, r.event_date, r.date.value, etc.
  const date =
    normalizeDateYYYYMMDD(
      pickFirst(
        r.date,
        r.day_date,
        r.event_date,
        r.d,
        getPath(r, ["date"]),
        getPath(r, ["date", "value"])
      )
    ) ?? "0000-00-00";

  // regime can be: regime, opportunity_regime, opportunity_score_regime, etc.
  const regime =
    normalizeRegime(
      pickFirst(
        r.regime,
        r.opportunity_regime,
        r.opportunity_score_regime,
        getPath(r, ["opportunity", "regime"]),
        getPath(r, ["score", "regime"])
      )
    ) ?? null;

  // score can be: score, opportunity_score, opportunity_score_pct, etc.
  const score =
    asNumber(
      pickFirst(
        r.score,
        r.opportunity_score,
        r.opportunity_score_pct,
        r.opportunity_score_v1,
        getPath(r, ["opportunity", "score"]),
        getPath(r, ["score", "value"])
      )
    ) ?? null;

  // weather fields (accept multiple naming variants)
  const weather_alert_level =
    asNumber(
      pickFirst(
        r.weather_alert_level,
        r.alert_level,
        r.weather_alert,
        getPath(r, ["weather", "alert_level"]),
        getPath(r, ["weather_alert", "level"])
      )
    ) ?? null;

  const precip_probability_max_pct =
    asNumber(
      pickFirst(
        r.precip_probability_max_pct,
        r.precipitation_probability_max_pct, // frequent variant
        r.precip_probability_max, // sometimes without _pct
        r.pr_max_pct,
        getPath(r, ["weather", "precip_probability_max_pct"]),
        getPath(r, ["weather", "precipitation_probability_max_pct"])
      )
    ) ?? null;

  const wind_speed_10m_max =
    asNumber(
      pickFirst(
        r.wind_speed_10m_max,
        r.wind_speed_max,
        r.wind_max,
        getPath(r, ["weather", "wind_speed_10m_max"]),
        getPath(r, ["weather", "wind_speed_max"])
      )
    ) ?? null;

  // competition fields (accept nested struct paths too)
  const events_within_5km_count =
    asNumber(
      pickFirst(
        r.events_within_5km_count,
        r.n_le_5km,
        getPath(r, ["competition", "events_within_5km_count"]),
        getPath(r, ["nearby_events", "n_le_5km"])
      )
    ) ?? null;

  const events_within_10km_count =
    asNumber(
      pickFirst(
        r.events_within_10km_count,
        r.n_le_10km,
        getPath(r, ["competition", "events_within_10km_count"]),
        getPath(r, ["nearby_events", "n_le_10km"])
      )
    ) ?? null;

  const events_within_50km_count =
    asNumber(
      pickFirst(
        r.events_within_50km_count,
        r.n_le_50km,
        getPath(r, ["competition", "events_within_50km_count"]),
        getPath(r, ["nearby_events", "n_le_50km"])
      )
    ) ?? null;

  // calendar flags (accept legacy + nested)
  const is_weekend =
    asBoolean(
      pickFirst(
        r.is_weekend,
        r.weekend_flag,
        getPath(r, ["calendar", "is_weekend"])
      )
    ) ?? null;

  const is_public_holiday_fr_flag =
    asBoolean(
      pickFirst(
        r.is_public_holiday_fr_flag,
        r.is_public_holiday_flag,
        r.public_holiday_flag,
        getPath(r, ["calendar", "is_public_holiday_fr_flag"])
      )
    ) ?? null;

  const is_school_holiday_flag =
    asBoolean(
      pickFirst(
        r.is_school_holiday_flag,
        r.school_holiday_flag,
        getPath(r, ["calendar", "is_school_holiday_flag"])
      )
    ) ?? null;

  const is_commercial_event_flag =
    asBoolean(
      pickFirst(
        r.is_commercial_event_flag,
        r.commercial_event_flag,
        getPath(r, ["calendar", "is_commercial_event_flag"])
      )
    ) ?? null;

  return {
    date,
    regime,
    score,
    weather_alert_level,
    precip_probability_max_pct,
    wind_speed_10m_max,
    events_within_5km_count,
    events_within_10km_count,
    events_within_50km_count,
    is_weekend,
    is_public_holiday_fr_flag,
    is_school_holiday_flag,
    is_commercial_event_flag,
  };
}

export function buildUiNormalizedV2(args: {
  question: string;
  decision_payload: DecisionPayload | null | undefined;
  shortlist_rows: unknown[]; // may be raw truth rows; normalized internally
}): UiNormalizedV2 {

  const { question, decision_payload, shortlist_rows } = args;
  const rows: WindowTopDayRow[] = (shortlist_rows ?? []).map(normalizeWindowTopDayRow);

  const dp: DecisionPayload = decision_payload ?? {
    horizon: "month" as ResolvedHorizon,
    intent: "WINDOW_TOP_DAYS",
    used_dates: [],
    signals: {},
  };

  const baseUsed = (dp.used_dates ?? []).map(ymd);

  const mc = parseMonthConstraintFromQuestion(question);
  const inferredYear = inferYearFromDates(baseUsed);

  const monthConstraint =
    mc?.month && inferredYear
      ? { year: inferredYear, month: mc.month }
      : mc?.month
        ? { year: inferredYear ?? 0, month: mc.month } // year=0 means "unknown year"
        : null;

  const shouldApplyMonthFilter = Boolean(monthConstraint && monthConstraint.year && monthConstraint.month);

  const filteredRows = shouldApplyMonthFilter
    ? rows.filter((r) => monthFilterDates([r.date], monthConstraint!.year, monthConstraint!.month).length === 1)
    : rows;

  const filteredUsedDates = shouldApplyMonthFilter
    ? monthFilterDates(baseUsed, monthConstraint!.year, monthConstraint!.month)
    : baseUsed;

  // NOTE: upstream (prompt.ts) is responsible for choosing how many rows to send (k).
  // Here we only format and align for UI.
  const picked = filteredRows;
  const pickedDates = picked.map((r) => ymd(r.date));

  function formatDateFr(ymdStr: string): string {
    const d = new Date(`${ymdStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymdStr;
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  }

  function rowFactsFr(r: WindowTopDayRow): string[] {
    const facts: string[] = [];

    // Opportunity / score
    if (r.regime) {
      const s = typeof r.score === "number" ? ` (score ${Math.round(r.score)})` : "";
      facts.push(`Classement : ${r.regime}${s}`);
    } else if (typeof r.score === "number") {
      facts.push(`Score d’opportunité : ${Math.round(r.score)}`);
    }

    // Weather
    const w: string[] = [];
    if (typeof r.weather_alert_level === "number") w.push(`alerte niveau ${r.weather_alert_level}`);
    if (typeof r.precip_probability_max_pct === "number") w.push(`pluie (max) ${Math.round(r.precip_probability_max_pct)}%`);
    if (typeof r.wind_speed_10m_max === "number") w.push(`vent (max) ${Math.round(r.wind_speed_10m_max)}`);
    if (w.length) facts.push(`Météo : ${w.join(", ")}`);

    // Competition (no symbols, no scope)
    if (typeof r.events_within_10km_count === "number") {
      facts.push(`Concurrence : ${r.events_within_10km_count} événement(s) à moins de 10 km`);
    } else if (typeof r.events_within_5km_count === "number") {
      facts.push(`Concurrence : ${r.events_within_5km_count} événement(s) à moins de 5 km`);
    } else if (typeof r.events_within_50km_count === "number") {
      facts.push(`Concurrence : ${r.events_within_50km_count} événement(s) dans un rayon de 50 km`);
    }

    // Calendar
    const cal: string[] = [];
    if (r.is_weekend === true) cal.push("week-end");
    if (r.is_public_holiday_fr_flag === true) cal.push("jour férié");
    if (r.is_school_holiday_flag === true) cal.push("vacances scolaires");
    if (r.is_commercial_event_flag === true) cal.push("événement commercial");
    if (cal.length) facts.push(`Calendrier : ${cal.join(", ")}`);

    return facts;
  }

  // ------------------------------
  // Intent-aware headline + answer
  // ------------------------------
  const isWorst = dp.intent === "WINDOW_WORST_DAYS";

  const headline = isWorst
    ? "Jours les moins favorables sur la période"
    : "Jours les plus favorables sur la période";

  const answer = shouldApplyMonthFilter
    ? (isWorst
        ? "Ces dates présentent les conditions les moins favorables sur le mois demandé."
        : "Ces dates présentent les conditions les plus favorables sur le mois demandé.")
    : (isWorst
        ? "Ces dates présentent les conditions les moins favorables sur la fenêtre analysée."
        : "Ces dates présentent les conditions les plus favorables sur la fenêtre analysée.");

  // ------------------------------
  // Prepare short implications (layout only)
  // ------------------------------
  let perDateImplications: string[] = [];

  if (
    dp.horizon === "month" &&
    (dp.intent === "WINDOW_TOP_DAYS" || dp.intent === "WINDOW_WORST_DAYS")
  ) {
    const narration = compileMonthImpactNarrationV1({
      intent: dp.intent as "WINDOW_TOP_DAYS" | "WINDOW_WORST_DAYS",
      horizon: "month",
      used_dates: filteredUsedDates,
      decision_signals: dp.signals,
      assertions: IMPACT_ASSERTION_ASSETS_V1,
    });

    const cleaned = (Array.isArray(narration.key_facts) ? narration.key_facts : [])
      .map((t) =>
        String(t)
          .replace(/^THEN\s+/i, "")
          .replace(/^then\s+/i, "")
          .trim()
      )
      .filter(Boolean);

    perDateImplications = cleaned.slice(0, 2);
  }

  const key_facts: string[] = [];

  if (picked.length > 0) {
    for (const r of picked) {
      const dfr = formatDateFr(ymd(r.date));
      const facts = rowFactsFr(r);

      // Date line (facts)
      key_facts.push(`${dfr} — ${facts.slice(0, 5).join(" · ")}`);

      // Immediately under the date: short, generic guardrails (NOT date-causal)
      for (const imp of perDateImplications) {
        key_facts.push(`↳ Alors: ${imp}`);
      }
    }
  } else if (filteredUsedDates.length > 0) {
    key_facts.push(`Dates disponibles sur la période : ${filteredUsedDates.map(formatDateFr).join(" ; ")}.`);
  } else {
    key_facts.push(`Aucune date disponible après filtrage (contrainte de mois trop stricte).`);
  }
  
  // No kitchen caveats in production UI
  const caveats: string[] = [];

  return {
    headline,
    answer,
    reasons: [],
    key_facts,
    caveats,
    meta: {
      v: 2,
      horizon: dp.horizon,
      intent: dp.intent,
      used_dates: filteredUsedDates,
      month_constraint: shouldApplyMonthFilter ? monthConstraint : null,
      decision_payload_ref: {
        horizon: dp.horizon,
        intent: dp.intent,
        used_dates: filteredUsedDates,
        source: "decision_payload",
      },
    },
  };
}
