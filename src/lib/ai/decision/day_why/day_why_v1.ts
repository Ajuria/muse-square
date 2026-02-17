// src/lib/ai/decision/day_why/day_why_v1.ts
// =====================================================
// DayWhy v1 — Day View (deterministic)
// =====================================================
// Purpose:
// - Explain "why this day" in 3–5 action-driven bullets
// - Truth-based only (semantic day surface + location_context)
// - No raw data dump / no duplication of the page's detailed sections
// - Deterministic, null-safe
// =====================================================

export type DayWhyV1Input = {
  date: string; // YYYY-MM-DD
  day_row: any | null; // semantic day surface row (truth)
  location_context: any | null; // ai_location_context row (truth)
};

export type DayWhyV1Output = {
  headline: string;
  bullets: string[]; // 3–5 bullets max
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toFiniteNumberOrNull(v: any): number | null {
  const n = typeof v === "number" ? v : (typeof v === "string" ? Number(v) : NaN);
  return Number.isFinite(n) ? n : null;
}

function numOr(v: any, fallback: number): number {
  const n = toFiniteNumberOrNull(v);
  return n === null ? fallback : n;
}

function uniq(xs: string[]): string[] {
  return Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));
}

type Driver = "weather" | "competition" | "calendar" | "score" | "unknown";

function getWeatherAlertLevel(r: any): number | null {
  // prefer alert_level_max if present (day_surface), else weather_alert_level
  const a = toFiniteNumberOrNull(r?.alert_level_max);
  if (a !== null) return a;
  const b = toFiniteNumberOrNull(r?.weather_alert_level);
  return b;
}

function deriveCompetitionNearTotal(r: any): { near: number; total: number } {
  const c500 = numOr(r?.events_within_500m_count, 0);
  const c5 = numOr(r?.events_within_5km_count, 0);
  const c10 = numOr(r?.events_within_10km_count, 0);
  const c50 = numOr(r?.events_within_50km_count, 0);
  const near = c500 + c5 + c10;
  const total = near + c50;
  return { near, total };
}

function competitionSentence(r: any): string {
  const { near, total } = deriveCompetitionNearTotal(r);
  if (near > 0) return "Risque de cannibalisation directe ce jour-là.";
  if (total > 0) return "Concurrence présente, mais peu susceptible d’impacter directement votre événement.";
  return "Aucune pression concurrentielle significative ce jour-là.";
}

function calendarSentence(r: any): string | null {
  // Truth flags only
  const rawWeekend = r?.is_weekend;
  const rawHoliday = r?.is_public_holiday_fr_flag;
  const rawSchool = r?.is_school_holiday_flag;
  const rawCommercial = r?.commercial_events; // truth: from vw_insight_event_day_surface

  const hasAny =
    rawWeekend !== undefined && rawWeekend !== null ||
    rawHoliday !== undefined && rawHoliday !== null ||
    rawSchool !== undefined && rawSchool !== null ||
    rawCommercial !== undefined && rawCommercial !== null;

  if (!hasAny) return null;

  const isWeekend = Boolean(rawWeekend);
  const isHoliday = Boolean(rawHoliday);
  const isSchool = Boolean(rawSchool);

  const commercialList = Array.isArray(rawCommercial) ? rawCommercial : [];
  const commercialNames = commercialList
    .map((x: any) => (typeof x?.label === "string" ? x.label : (typeof x === "string" ? x : "")))
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (!isWeekend && !isHoliday && !isSchool && commercialNames.length === 0) {
    return "Contexte calendrier neutre.";
  }

  const bits: string[] = [];
  if (isWeekend) bits.push("week-end");
  if (isHoliday) bits.push("jour férié");
  if (isSchool) bits.push("vacances scolaires");
  if (commercialNames.length > 0) {
    bits.push(`temps fort commercial: ${commercialNames.slice(0, 2).join(", ")}`);
  }
  return `Contexte calendrier particulier (${bits.join(", ")}).`;  
}

function weatherSentence(r: any, ctx: any): string {
  const isOutdoor = ctx?.is_outdoor_event;
  const alert = getWeatherAlertLevel(r);
  const pp = toFiniteNumberOrNull(r?.precipitation_probability_max_pct);
  const wind = toFiniteNumberOrNull(r?.wind_speed_10m_max);

  const anyAlert = alert !== null && alert > 0;
  const hasRisk =
    (alert !== null && alert >= 3) ||
    anyAlert ||
    (pp !== null && pp >= 60) ||
    (wind !== null && wind >= 40);

  if (!hasRisk) {
    if (isOutdoor === true) return "Météo favorable pour un événement en extérieur.";
    if (isOutdoor === false) return "Pas de signal météo critique (impact limité en intérieur).";
    return "Pas de signal météo critique.";
  }

  // risk path
  if (alert !== null && alert >= 3) {
    // hard blocking signal (truth-based)
    return "Risque météo majeur (niveau d’alerte élevé) : prévoir un plan B.";
  }

  if (isOutdoor === true) return "Risque météo à intégrer (impact possible sur la fréquentation).";
  if (isOutdoor === false) return "Risque météo surtout logistique, impact limité pour un événement indoor.";
  return "Signal météo à surveiller (impact dépend du format).";
}

function scoreSentence(r: any): string | null {
  const regime = typeof r?.opportunity_regime === "string" ? r.opportunity_regime.trim().toUpperCase() : "";
  const score = toFiniteNumberOrNull(r?.opportunity_score_final_local);

  // Don’t repeat exact numbers if you don’t want—keep it qualitative, but still truth-based.
  if (regime === "A") return "Jour globalement favorable (catégorie A).";
  if (regime === "B") return "Jour correct mais non optimal (catégorie B).";
  if (regime === "C") return "Jour défavorable (catégorie C).";

  if (score !== null) {
    // If regime missing but score exists, stay generic.
    return "Jour évalué par le score d’opportunité (catégorie non disponible).";
  }

  return null;
}

function driverPrimary(r: any, ctx: any): Driver {
  // Deterministic severity scoring by dimension (truth-only).
  // We pick the highest severity as the "driver".
  // Severity ranges are explicit and conservative.
  const severityWeather = (() => {
    const alert = getWeatherAlertLevel(r);
    if (alert !== null && alert >= 3) return 100;
    if (alert !== null && alert >= 1) return 60;

    const pp = toFiniteNumberOrNull(r?.precipitation_probability_max_pct);
    const wind = toFiniteNumberOrNull(r?.wind_speed_10m_max);

    let s = 0;
    if (pp !== null && pp >= 60) s = Math.max(s, 40);
    if (wind !== null && wind >= 40) s = Math.max(s, 40);

    // Outdoor increases relevance (not changing truth, just severity)
    const isOutdoor = ctx?.is_outdoor_event;
    if (isOutdoor === true && s > 0) s += 10;

    return s;
  })();

  const severityCompetition = (() => {
    const { near, total } = deriveCompetitionNearTotal(r);
    if (near > 0) return 70;
    if (total > 0) return 30;
    return 0;
  })();

  const severityCalendar = (() => {
    const rawWeekend = r?.is_weekend;
    const rawHoliday = r?.is_public_holiday_fr_flag;
    const rawSchool = r?.is_school_holiday_flag;
    const rawCommercial = r?.commercial_events;

    const hasAny =
      rawWeekend !== undefined && rawWeekend !== null ||
      rawHoliday !== undefined && rawHoliday !== null ||
      rawSchool !== undefined && rawSchool !== null ||
      rawCommercial !== undefined && rawCommercial !== null;

    if (!hasAny) return 0;

    const isWeekend = Boolean(rawWeekend);
    const isHoliday = Boolean(rawHoliday);
    const isSchool = Boolean(rawSchool);
    const commercialList = Array.isArray(rawCommercial) ? rawCommercial : [];
    const commercialNames = commercialList
      .map((x: any) => (typeof x?.label === "string" ? x.label : (typeof x === "string" ? x : "")))
      .map((s: string) => s.trim())
      .filter(Boolean);

    // Not "risk" by itself in general, but can be the main driver if others are neutral.
    if (isHoliday) return 35;
    if (isSchool) return 30;
    if (isWeekend) return 25;
    if (commercialNames.length > 0) return 45;
    return 0;
  })();

  const severityScore = (() => {
    const reg = typeof r?.opportunity_regime === "string" ? r.opportunity_regime.trim().toUpperCase() : "";
    if (reg === "C") return 80;
    if (reg === "B") return 20;
    if (reg === "A") return 0;
    return 0;
  })();

  const entries: Array<[Driver, number]> = [
    ["weather", severityWeather],
    ["competition", severityCompetition],
    ["calendar", severityCalendar],
    ["score", severityScore],
  ];

  entries.sort((a, b) => b[1] - a[1]);

  const [bestDriver, bestScoreValue] = entries[0] ?? ["unknown", 0];
  return bestScoreValue > 0 ? bestDriver : "unknown";
}

function driverSentence(driver: Driver): string | null {
  if (driver === "weather") return "Point principal de vigilance : la météo.";
  if (driver === "competition") return "Point principal de vigilance : la concurrence événementielle.";
  if (driver === "calendar") return "Point principal de vigilance : le calendrier (rythme du public).";
  if (driver === "score") return "Point principal : le score d’opportunité (jour globalement défavorable).";
  return null;
}

function actionSentence(driver: Driver, ctx: any, r: any): string | null {
  // One operational action; deterministic; no invented facts.
  if (driver === "weather") {
    const isOutdoor = ctx?.is_outdoor_event;
    const alert = getWeatherAlertLevel(r);
    if (alert !== null && alert >= 3) return "Action : sécuriser une option de repli (format indoor / report / logistique).";
    if (isOutdoor === true) return "Action : prévoir un plan B (abri, communication météo, flexibilité).";
    return "Action : vérifier la météo la veille et adapter la logistique si besoin.";
  }
  if (driver === "competition") return "Action : renforcer la différenciation (angle, horaires, communication, partenariats).";
  if (driver === "calendar") return "Action : adapter l’offre et la communication au contexte calendrier (cible, horaires, message).";
  if (driver === "score") return "Action : envisager une date alternative ou compenser par un levier fort (programmation / com / partenariat).";
  return null;
}

export function renderDayWhyV1(input: DayWhyV1Input): DayWhyV1Output | null {
  const date = typeof input?.date === "string" ? input.date.slice(0, 10) : "";
  if (!date || !ISO_DATE_RE.test(date)) return null;

  const r = input?.day_row ?? null;
  const ctx = input?.location_context ?? null;

  // If we have no row at all, return minimal (still stable)
  if (!r) {
    return {
      headline: `Pourquoi ce jour ? — ${date}`,
      bullets: [
        "Données du jour indisponibles (ligne semantic manquante).",
        "Action : ouvrez la vue Mois pour choisir une alternative proche.",
      ],
    };
  }

  const bullets: string[] = [];

  // 1) Global verdict (score/regime)
  const s1 = scoreSentence(r);
  if (s1) bullets.push(s1);

  // 2) Primary driver
  const d = driverPrimary(r, ctx);
  const d1 = driverSentence(d);
  if (d1) bullets.push(d1);

  // 3) Add 1–2 supporting synth sentences (avoid repetition; choose dims not equal to primary where possible)
  const wx = weatherSentence(r, ctx);
  const comp = competitionSentence(r);
  const cal = calendarSentence(r);

  // Deterministic ordering: if driver is X, push X sentence first, then the next most informative
  const pack: Array<[Driver, string | null]> = [
    ["weather", wx],
    ["competition", comp],
    ["calendar", cal],
  ];

  // Put primary driver first, then others.
  pack.sort((a, b) => {
    const aIs = a[0] === d ? 0 : 1;
    const bIs = b[0] === d ? 0 : 1;
    return aIs - bIs;
  });

  for (const [, sentence] of pack) {
    if (!sentence) continue;
    // Avoid exact duplicate ideas
    bullets.push(sentence);
    if (bullets.length >= 4) break; // keep room for action
  }

  // 4) Action (only if we have at least one driver or some risk signal)
  const action = actionSentence(d, ctx, r);
  if (action) bullets.push(action);

  // Cap 5, uniq, keep deterministic order
  const finalBullets = uniq(bullets).slice(0, 5);

  return {
    headline: `Pourquoi ce jour ? — ${date}`,
    bullets: finalBullets.length ? finalBullets : ["Aucun signal exploitable sur les champs disponibles."],
  };
}
