// src/lib/ai/ui_packaging_v3/buildUiPackagingV3Month.ts
import type { UiPackagingV3 } from "../contracts/uiPackagingV3";

function ymd(v: any): string {
  if (typeof v === "string" && v.trim()) return v.trim().slice(0, 10);
  if (v && typeof v === "object" && typeof v.value === "string") return v.value.trim().slice(0, 10);
  return "";
}

function numOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : (typeof v === "string" ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}

function truthBool(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  return null;
}

function fmtList(xs: string[]): string {
  return xs.filter(Boolean).join(", ");
}

function commercialEventNames(r: any): string[] {
  const a = Array.isArray(r?.commercial_events) ? r.commercial_events : [];
  return a
    .map((x: any) => (typeof x?.event_name === "string" ? x.event_name : ""))
    .map((s: string) => s.trim())
    .filter(Boolean);
}

export function buildUiPackagingV3Month(args: {
  intent: "WINDOW_TOP_DAYS" | "WINDOW_WORST_DAYS";
  used_dates: string[];         // authoritative from decision_payload.used_dates (already sliced)
  month_window: any | null;     // semantic_truth.month_window (or fallback window row)
  month_days: any[];            // semantic_truth.month_days (day surface rows)
}): UiPackagingV3 {
  const intent = args.intent;
  const used = (Array.isArray(args.used_dates) ? args.used_dates : []).map((d) => String(d).slice(0, 10));

  // Index month_days by YYYY-MM-DD
  const idx = new Map<string, any>();
  for (const r of (Array.isArray(args.month_days) ? args.month_days : [])) {
    const d = ymd(r?.date);
    if (d) idx.set(d, r);
  }

  const timeframe_label =
    typeof args.month_window?.display_label === "string" ? args.month_window.display_label : undefined;

  const headerTitle =
    intent === "WINDOW_WORST_DAYS"
      ? "Jours les moins favorables sur la période"
      : "Jours les plus favorables sur la période";

  const dates = used.map((d) => {
    const r = idx.get(d) ?? null;

    const date_label =
      r && typeof r?.display_label === "string" && r.display_label.trim()
        ? r.display_label
        : d;

    // score: truth fields
    const regimeRaw = typeof r?.opportunity_regime === "string" ? r.opportunity_regime.trim().toUpperCase() : "";
    const regime = (regimeRaw === "A" || regimeRaw === "B" || regimeRaw === "C") ? regimeRaw : null;
    const score = numOrNull(r?.opportunity_score_final_local);

    // WEATHER (truth)
    const weather_alert = numOrNull(r?.weather_alert_level);
    const precip = numOrNull(r?.precipitation_probability_max_pct);
    const wind = numOrNull(r?.wind_speed_10m_max);
    const weather_code = numOrNull(r?.weather_code);

    const meteoFacts: string[] = [];
    if (weather_alert !== null) meteoFacts.push(`Alerte météo: niveau ${weather_alert}`);
    if (precip !== null) meteoFacts.push(`Pluie (probabilité max): ${Math.round(precip)}%`);
    if (wind !== null) meteoFacts.push(`Vent (max): ${Math.round(wind)}`);
    if (weather_code !== null) meteoFacts.push(`Code météo: ${Math.round(weather_code)}`);

    // COMPETITION (truth)
    const c5 = numOrNull(r?.events_within_5km_count);
    const c10 = numOrNull(r?.events_within_10km_count);
    const c50 = numOrNull(r?.events_within_50km_count);

    const compFacts: string[] = [];
    if (c5 !== null) compFacts.push(`Événements ≤5km: ${Math.round(c5)}`);
    if (c10 !== null) compFacts.push(`Événements ≤10km: ${Math.round(c10)}`);
    if (c50 !== null) compFacts.push(`Événements ≤50km: ${Math.round(c50)}`);

    // CALENDAR (truth)
    const isWeekend = truthBool(r?.is_weekend);
    const isSchool = truthBool(r?.is_school_holiday_flag);
    const isHoliday = truthBool(r?.is_public_holiday_fr_flag);
    const isCommercial = truthBool(r?.is_commercial_event_flag);

    const calFacts: string[] = [];
    if (isWeekend !== null) calFacts.push(`Week-end: ${isWeekend ? "oui" : "non"}`);
    if (isSchool !== null) calFacts.push(`Vacances scolaires: ${isSchool ? "oui" : "non"}`);
    if (isHoliday !== null) calFacts.push(`Jour férié: ${isHoliday ? "oui" : "non"}`);
    if (isCommercial !== null) calFacts.push(`Événement commercial: ${isCommercial ? "oui" : "non"}`);

    const cNames = commercialEventNames(r);
    if (cNames.length) calFacts.push(`Temps fort(s) commercial(aux): ${fmtList(cNames.slice(0, 3))}`);

    // SCORE (truth)
    const scoreFacts: string[] = [];
    if (regime) scoreFacts.push(`Classement: ${regime}`);
    if (score !== null) scoreFacts.push(`Score: ${Math.round(score)}`);

    // IMPORTANT: implications[] must be empty here (truth-first).
    // If later you have governed implications from impact narrations/rules, you’ll inject them deterministically.
    const sections = [
      { id: "autre" as const, title: "Score", facts: scoreFacts, implications: [] as string[] },
      { id: "meteo_faisabilite" as const, title: "Météo", facts: meteoFacts, implications: [] as string[] },
      { id: "concurrence" as const, title: "Concurrence", facts: compFacts, implications: [] as string[] },
      { id: "calendrier" as const, title: "Calendrier", facts: calFacts, implications: [] as string[] },
    ].filter((s) => s.facts.length > 0); // drop empty sections deterministically

    return {
      date: d,
      date_label,
      score: regime ? { regime, ...(score !== null ? { score: Math.round(score) } : {}) } : undefined,
      sections,
    };
  });

  const out: UiPackagingV3 = {
    v: 3,
    header: {
      title: headerTitle,
      ...(timeframe_label ? { timeframe_label } : {}),
      summary_bullets: [], // keep empty (truth-first). later you can generate deterministically or via LLM on top.
    },
    dates,
  };

  return out;
}
