// =====================================================
// PointsClés v1 — Days View (deterministic)
// =====================================================
// Purpose:
// - Action-driven digest for event organizers
// - No repetition of raw data shown elsewhere
// - Deterministic, null-safe, traceable
// =====================================================

export type RendererMode = "selected_day";

export type DeterministicRenderInput = {
  mode: RendererMode;

  current_day: any | null;
  selection_days: any[];
  current_special_labels: string[];
  location_context: any | null;
};

// -----------------------------------------------------
// Helpers (strict, null-safe)
// -----------------------------------------------------
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toFiniteNumberOrNull = (v: any): number | null => {
  const n = typeof v === "number" ? v : (typeof v === "string" ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
};

const numOrNull = (v: any): number | null => toFiniteNumberOrNull(v);

const numOr = (v: any, fallback: number): number => {
  const n = toFiniteNumberOrNull(v);
  return n === null ? fallback : n;
};

const truncate = (s: any, max = 140): string => {
  const v = typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
  if (!v) return "";
  if (v.length <= max) return v;
  return v.slice(0, max - 1).trimEnd() + "…";
};

const kmFromMeters = (m: any): string | null => {
  const x = numOrNull(m);
  if (x == null) return null;
  return (x / 1000).toFixed(1);
};

const weekdayLabelFr = (isoDate: string): { label: string; isWeekend: boolean } => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const map = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return { label: map[dow] ?? "Jour", isWeekend: dow === 0 || dow === 6 };
};

const uniqStrings = (xs: any[]): string[] =>
  Array.from(
    new Set(
      (Array.isArray(xs) ? xs : [])
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean)
    )
  );

// -----------------------------------------------------
// Competition helpers (new truth: top_events_*)
// -----------------------------------------------------
const isSameIndustry = (eventIndustry: any, clientIndustry: any): boolean => {
  const e = typeof eventIndustry === "string" ? eventIndustry.toLowerCase() : "";
  const c = typeof clientIndustry === "string" ? clientIndustry.toLowerCase() : "";
  if (!e || !c) return false;

  // v1 explicit mapping only
  if (c === "cultural") {
    return e.includes("culture") || e.includes("patrimoine");
  }
  return false;
};

export type TopEvent = {
  event_label?: string;
  city_name?: string;
  distance_m?: number;
  industry_code?: string;
  description?: string;
  event_uid?: string;
};

const getTopCompetitionEvents = (
  day: any,
  location_context: any
): TopEvent[] => {
  const clientIndustry = location_context?.client_industry_code ?? null;

  const buckets = [
    "top_events_500m",
    "top_events_5km",
    "top_events_10km",
    "top_events_50km",
  ];

  // collect events from all radius buckets
const pool = buckets.flatMap((k) =>
  Array.isArray(day?.[k]) ? day[k] : []
);

if (!pool.length) return [];

  const sameIndustry = pool.filter((e) =>
    isSameIndustry(e?.industry_code, clientIndustry)
  );
  const chosen = sameIndustry.length ? sameIndustry : pool;

  const sorted = chosen
    .slice()
    .sort(
      (a, b) =>
        Number(a?.distance_m ?? 1e18) -
          Number(b?.distance_m ?? 1e18) ||
        String(a?.event_uid ?? "").localeCompare(String(b?.event_uid ?? ""))
    );

  const farOnly =
    (!Array.isArray(day?.top_events_500m) || day.top_events_500m.length === 0) &&
    (!Array.isArray(day?.top_events_5km) || day.top_events_5km.length === 0) &&
    (!Array.isArray(day?.top_events_10km) || day.top_events_10km.length === 0) &&
    Array.isArray(day?.top_events_50km) &&
    day.top_events_50km.length > 0;

  if (farOnly && sameIndustry.length) return sorted.slice(0, 1);

  return sorted.slice(0, 3);
};

// -----------------------------------------------------
// Main renderer
// -----------------------------------------------------
export function renderPointsClesV1(
  input: DeterministicRenderInput
): string | null {
  const { current_day, selection_days, current_special_labels, location_context } = input;

  const date = current_day?.date;
  if (!current_day || typeof date !== "string" || !ISO_DATE_RE.test(date)) {
    return null;
  }

  const locationType = location_context?.location_type ?? null;
  const isOutdoor = locationType === "outdoor";
  const isIndoor = locationType === "indoor";

  // ---------------------------------------------------
  // Selection ranking
  // ---------------------------------------------------
  const ranked = (Array.isArray(selection_days) ? selection_days : [])
    .filter(
      (d) =>
        typeof d?.date === "string" &&
        ISO_DATE_RE.test(d.date) &&
        numOrNull(d?.opportunity_score_final_local) !== null
    )
    .sort(
      (a, b) =>
        Number(b.opportunity_score_final_local) -
        Number(a.opportunity_score_final_local)
    );

  const score = numOrNull(current_day?.opportunity_score_final_local);
  let rank: number | null = null;
  if (score !== null && ranked.length >= 2) {
    const idx = ranked.findIndex((d) => d.date === date);
    rank = idx >= 0 ? idx + 1 : null;
  }

  // ---------------------------------------------------
  // Others in selection
  // ---------------------------------------------------
  const others = (Array.isArray(selection_days) ? selection_days : [])
    .filter((d) => typeof d?.date === "string" && d.date !== date);

  const avgOthers = (fn: (d: any) => number | null): number | null => {
    const vals = others.map(fn).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // ---------------------------------------------------
  // AUDIENCE — strictly unique check + weekend/weekday mix
  // ---------------------------------------------------
  const isAvailable = (d: any): boolean => {
    const { isWeekend } = weekdayLabelFr(d.date);
    return Boolean(d?.vacation_name) || Boolean(d?.holiday_name) || isWeekend;
  };

  const currentAvailable = isAvailable(current_day);
  const { isWeekend: currentIsWeekend } = weekdayLabelFr(date);
  const allDays = Array.isArray(selection_days) ? selection_days : [];
  const availableCount = allDays.filter(isAvailable).length;
  const unavailableCount = allDays.length - availableCount;

  const selectionHasWeekend = allDays.some((d) => {
    const { isWeekend: ow } = weekdayLabelFr(d.date);
    return ow;
  });
  const selectionHasWeekday = allDays.some((d) => {
    const { isWeekend: ow } = weekdayLabelFr(d.date);
    return !ow;
  });
  const mixedSelection = selectionHasWeekend && selectionHasWeekday;

  let audienceSynth: string | null = null;
  if (currentAvailable && availableCount === 1) {
    audienceSynth = "Seule date où votre audience est disponible dans votre sélection";
  } else if (!currentAvailable && unavailableCount === 1) {
    audienceSynth = "Audience peu disponible ce type de jour, à prendre en compte";
  } else if (mixedSelection && currentIsWeekend) {
    audienceSynth = "Week-end — audience généralement plus disponible que les dates en semaine";
  } else if (mixedSelection && !currentIsWeekend) {
    audienceSynth = "Semaine — audience moins disponible que les dates week-end de la sélection";
  }

  // ---------------------------------------------------
  // CONCURRENCE — delta_att_events_pct
  // ---------------------------------------------------
  const deltaEvents = numOr(current_day?.delta_att_events_pct, 0);
  const avgOtherDeltaEvents = avgOthers((d) => numOrNull(d?.delta_att_events_pct));

  let concurrenceSynth: string | null = null;
  if (avgOtherDeltaEvents !== null) {
    const diff = deltaEvents - avgOtherDeltaEvents;
    if (diff > 2) {
      concurrenceSynth = "Pression concurrentielle plus forte que les autres dates";
    } else if (diff < -2) {
      concurrenceSynth = "Moins de concurrence que les autres dates de la sélection";
    }
  } else if (deltaEvents > 3) {
    concurrenceSynth = "Concurrence élevée sur cette date";
  } else if (deltaEvents < -3) {
    concurrenceSynth = "Faible concurrence sur cette date";
  }

  // ---------------------------------------------------
  // ACCESSIBILITÉ — delta_att_mobility_pct
  // ---------------------------------------------------
  const deltaMobility = numOr(current_day?.delta_att_mobility_pct, 0);
  const avgOtherMobility = avgOthers((d) => numOrNull(d?.delta_att_mobility_pct));

  let accessibiliteSynth: string | null = null;
  if (avgOtherMobility !== null) {
    const diff = deltaMobility - avgOtherMobility;
    if (diff < -3) {
      accessibiliteSynth = "Accès au site plus perturbé que les autres dates de la sélection";
    } else if (diff > 3) {
      accessibiliteSynth = "Meilleur accès au site que les autres dates de la sélection";
    }
  } else if (deltaMobility < -4) {
    accessibiliteSynth = "Perturbations d'accès détectées sur cette date";
  }

  // ---------------------------------------------------
  // EXPLOITATION — alert_level_max
  // ---------------------------------------------------
  const alertMax = numOr(current_day?.alert_level_max, 0);
  const avgOtherAlert = avgOthers((d) => numOrNull(d?.alert_level_max));

  let exploitationSynth: string | null = null;
  if (alertMax > 0) {
    if (avgOtherAlert !== null && alertMax > avgOtherAlert) {
      if (isIndoor) {
        exploitationSynth = `Alerte météo niveau ${alertMax} — plus exposé que les autres dates, impact logistique`;
      } else if (isOutdoor) {
        exploitationSynth = `Alerte météo niveau ${alertMax} — plus exposé que les autres dates`;
      } else {
        exploitationSynth = `Alerte météo niveau ${alertMax} — plus exposé que les autres dates`;
      }
    } else if (avgOtherAlert === null) {
      exploitationSynth = `Alerte météo niveau ${alertMax} sur cette date`;
    }
  } else if (avgOtherAlert !== null && avgOtherAlert > 0) {
    exploitationSynth = "Meilleures conditions météo de la sélection";
  }

  // ---------------------------------------------------
  // Build output
  // ---------------------------------------------------
  const synth: string[] = [];

  // 1. Ranking
  if (rank !== null && ranked.length >= 2) {
    const n = ranked.length;
    if (rank === 1) synth.push("Meilleure option de la sélection");
    else if (rank === 2) synth.push(`2e meilleure option sur ${n} de la sélection`);
    else if (rank === n) synth.push(`Option la moins favorable des ${n} dates`);
    else synth.push(`${rank}e option sur ${n} de la sélection`);
  }

  // 2. Differentiating signals (max 3, priority order)
  const signals = [audienceSynth, concurrenceSynth, accessibiliteSynth, exploitationSynth]
    .filter(Boolean) as string[];

  for (const s of signals.slice(0, 3)) {
    synth.push(s);
  }

  // 3. Fallback
  if (synth.length <= 1) {
    synth.push("Pas de différence marquée avec les autres dates");
  }

  return synth.join("\n\n");
}