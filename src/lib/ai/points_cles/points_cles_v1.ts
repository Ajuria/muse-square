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

  // nearest non-empty bucket wins
  let pool: any[] = [];
  for (const k of buckets) {
    const arr = Array.isArray(day?.[k]) ? day[k] : [];
    if (arr.length) {
      pool = arr;
      break;
    }
  }
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

  // ---------------------------------------------------
  // Relative ranking (mandatory when selection >= 2)
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
  // Weather interpretation (contextual)
  // ---------------------------------------------------
  const pp = numOrNull(current_day?.precipitation_probability_max_pct);
  const pSum = numOrNull(current_day?.precipitation_sum_mm);
  const wind = numOrNull(current_day?.wind_speed_10m_max);

  const alertMax = numOr(current_day?.alert_level_max, 0);
  const lvlWind = numOr(current_day?.lvl_wind, 0);
  const lvlRain = numOr(current_day?.lvl_rain, 0);
  const lvlSnow = numOr(current_day?.lvl_snow, 0);
  const lvlHeat = numOr(current_day?.lvl_heat, 0);
  const lvlCold = numOr(current_day?.lvl_cold, 0);

  const anyAlert =
    alertMax > 0 ||
    lvlWind > 0 ||
    lvlRain > 0 ||
    lvlSnow > 0 ||
    lvlHeat > 0 ||
    lvlCold > 0;

  const hasWeatherRisk =
    anyAlert ||
    (pp !== null && pp >= 60) ||
    (wind !== null && wind >= 40);

  const isOutdoor = location_context?.is_outdoor_event;
  let weatherSynth: string | null = null;

  if (hasWeatherRisk) {
    if (isOutdoor === true) {
      weatherSynth = "Risque météo à intégrer (impact possible sur la fréquentation)";
    } else if (isOutdoor === false) {
      weatherSynth = "Risque météo surtout logistique, impact limité pour un événement indoor";
    } else {
      weatherSynth = "Signal météo à surveiller (impact dépend du format)";
    }
  } else {
    if (isOutdoor === true) {
      weatherSynth = "Conditions favorables pour un événement en extérieur";
    } else if (isOutdoor === false) {
      weatherSynth = "Aucun enjeu météo pour ce type d’événement";
    } else {
      weatherSynth = "Pas de signal météo critique";
    }
  }

  // ---------------------------------------------------
  // Calendar interpretation
  // ---------------------------------------------------
  const specials = uniqStrings(current_special_labels ?? []);
  let calendarSynth: string | null = null;

  if (specials.length > 0) {
    const hasVacations = specials.some((s) =>
      s.toLowerCase().includes("vacance")
    );
    if (hasVacations) {
      calendarSynth =
        "Période de vacances : audience locale possiblement réduite, visiteurs extérieurs à capter";
    } else {
      calendarSynth =
        "Contexte calendrier spécifique : adaptation de la cible ou du format recommandée";
    }
  }

  // ---------------------------------------------------
  // Competition interpretation
  // ---------------------------------------------------
  const c500 = numOr(current_day?.events_within_500m_count, 0);
  const c5 = numOr(current_day?.events_within_5km_count, 0);
  const c10 = numOr(current_day?.events_within_10km_count, 0);
  const c50 = numOr(current_day?.events_within_50km_count, 0);

  const near = c500 + c5 + c10;
  const total = near + c50;

  let competitionSynth: string | null = null;

  if (near > 0) {
    competitionSynth = "Risque de cannibalisation directe ce jour-là";
  } else if (total > 0) {
    competitionSynth = "Concurrence présente, mais peu susceptible d’impacter directement votre événement";
  } else {
    competitionSynth = "Aucune pression concurrentielle significative ce jour-là";
  }

  // ---------------------------------------------------
  // Build output
  // ---------------------------------------------------
  const { label: dowFr, isWeekend } = weekdayLabelFr(date);
  const out: string[] = [];

  out.push(`Points clés — ${dowFr} ${date}${isWeekend ? " (week-end)" : ""}`);

  // Synthèse (3–5 bullets)
  const synth: string[] = [];

  if (rank !== null && ranked.length >= 2) {
  const n = ranked.length;

  if (rank === 1) {
    synth.push(`- Meilleure option de la sélection`);
  } else if (rank === n) {
    synth.push(`- Option la moins favorable de la sélection`);
  } else if (n % 2 === 1 && rank === (n + 1) / 2) {
    synth.push(`- Option médiane de la sélection`);
  } else {
    synth.push(`- Option intermédiaire de la sélection`);
  }
}

  if (calendarSynth) synth.push(`- ${calendarSynth}`);
  if (weatherSynth) synth.push(`- ${weatherSynth}`);
  if (competitionSynth) synth.push(`- ${competitionSynth}`);

  if (synth.length > 0) {
    out.push(["Synthèse", ...synth.slice(0, 5)].join("\n"));
  }

  // ---------------------------------------------------
  // À noter (supporting facts only)
  // ---------------------------------------------------
  const details: string[] = [];

  // single strongest weather fact
  if (anyAlert) {
    const bits: string[] = [];
    if (alertMax > 0) bits.push(`alerte ${alertMax}`);
    if (lvlWind > 0) bits.push(`vent ${lvlWind}`);
    if (lvlRain > 0) bits.push(`pluie ${lvlRain}`);
    if (lvlSnow > 0) bits.push(`neige ${lvlSnow}`);
    if (lvlHeat > 0) bits.push(`chaleur ${lvlHeat}`);
    if (lvlCold > 0) bits.push(`froid ${lvlCold}`);
    if (bits.length) details.push(`- Alertes météo : ${bits.join(", ")}`);
  } else if (pp !== null && pp >= 60) {
    details.push(`- Pluie probable (≥60%)`);
  } else if (wind !== null && wind >= 40) {
    details.push(`- Vent fort (≥40 km/h)`);
  } else if (pSum !== null && pSum > 0 && isOutdoor === true) {
    details.push(`- Précipitations faibles possibles`);
  }

  // nearest competition events
  const topEvents = getTopCompetitionEvents(current_day, location_context);
  if (topEvents.length === 1) {
    const e = topEvents[0];
    const type =
        typeof e?.event_label === "string" && e.event_label.toLowerCase().includes("exposition")
        ? "une exposition"
        : "un événement";

    const city =
        typeof e?.city_name === "string" && e.city_name.trim()
        ? e.city_name.trim()
        : "à proximité";

    details.push(
        `- L’événement concurrent le plus proche est ${type} à ${city}`
    );
    } else if (topEvents.length > 1) {
    const city =
        typeof topEvents[0]?.city_name === "string" && topEvents[0].city_name.trim()
        ? topEvents[0].city_name.trim()
        : "à proximité";

    details.push(
        `- Les événements concurrents les plus proches sont principalement des expositions situées à ${city}`
    );
  }
  if (details.length > 0) {
    out.push(["À noter", ...details].join("\n"));
  }

  return out.join("\n\n");
}
