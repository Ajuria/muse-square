// src/lib/insightFamilies/calendar.ts
// CALENDAR family provider — "les vacances scolaires / les jours fériés font-ils bouger mon CA ?".
// Built from scratch (no deep-page endpoint exists for this family), so it is chat + report only until
// a renderCalendar card exists; the client skips a missing render.
//
// ── WHY THIS DOES NOT COPY THE WEATHER FAMILY'S NAIVE SPLIT ───────────────────────────────────────
// weather compares condition-days vs ALL days. That is defensible for weather (a hot day can fall in
// any month), and indefensible here: calendar conditions are PERIOD-CLUSTERED by construction — school
// holidays ARE July/August, and half the year's public holidays ARE May. Any venue with a seasonal
// trend will therefore show a fake "holiday effect" that is really the trend.
//   Measured on the test seed (2026-07-15): the naive split said "jours fériés −23 % de CA". Controlling
//   each holiday against its OWN month and day-type, the effect collapsed to −8 % ± 7 (n=6, t=−1,2) —
//   indistinguishable from zero. The −23 % was the revenue trend wearing a calendar costume.
// So: every occurrence is compared to a control built from the SAME month and the SAME day-type
// (weekend vs weekday), and the mean effect must clear a significance gate before it is stated at all.
// NOTE: that seed is DUMMY data — it validates the code path and the gates, never whether holidays
// really move revenue. Only real venue history can answer that; this provider stays silent until it can.
//
// WEEKENDS are deliberately NOT a condition here: the footfall family already answers "votre meilleur
// jour de la semaine" from the same till, and a weekend effect is something the operator sees anyway.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
const MIN_OCCURRENCES = 5;   // fewer condition-days than this -> no claim, ever
const MIN_CONTROL_DAYS = 3;  // an occurrence whose month/day-type control is thinner is dropped
const T_GATE = 2;            // |mean / SE| below this -> indistinguishable from zero -> stay silent

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const ymd = (v: any): string | null => (v == null ? null : (typeof v === "object" && "value" in v ? String(v.value) : String(v)));
const sgn = (n: number): string => (n > 0 ? "+" : n < 0 ? "−" : "");
const pctSigned = (n: number): string => `${sgn(Math.round(n))}${Math.abs(Math.round(n))} %`;

type Day = { d: string; rev: number; month: string; weekend: boolean; pub: boolean; sch: boolean };

// Mean effect of a condition, each occurrence controlled by its own month + day-type.
// Returns null when the evidence cannot carry a claim — the caller then says so plainly.
function controlledEffect(days: Day[], pick: (d: Day) => boolean) {
  const cond = days.filter(pick);
  if (cond.length < MIN_OCCURRENCES) return { n: cond.length, effect: null as number | null, se: null as number | null, t: null as number | null, dropped: 0 };

  const deltas: number[] = [];
  let dropped = 0;
  for (const c of cond) {
    // Control = same month, same day-type, condition ABSENT. Never the global average.
    const ctrl = days.filter((x) => x.month === c.month && x.weekend === c.weekend && !pick(x));
    if (ctrl.length < MIN_CONTROL_DAYS) { dropped++; continue; }
    const ref = ctrl.reduce((s, x) => s + x.rev, 0) / ctrl.length;
    if (!(ref > 0)) { dropped++; continue; }
    deltas.push((c.rev / ref - 1) * 100);
  }
  if (deltas.length < MIN_OCCURRENCES) return { n: deltas.length, effect: null, se: null, t: null, dropped };

  const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / (deltas.length - 1);
  const se = Math.sqrt(variance) / Math.sqrt(deltas.length);
  const t = se > 0 ? mean / se : 0;
  return { n: deltas.length, effect: mean, se, t, dropped };
}

export async function calendarFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [rows] = await bq.query({
    query: `SELECT CAST(p.transaction_date AS STRING) AS d, p.daily_revenue AS rev,
                   c.is_public_holiday_flag AS pub, c.is_school_holiday_flag AS sch
            FROM \`${PROJECT}.mart.fct_client_daily_performance\` p
            JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
              ON c.location_id = p.location_id AND c.date = p.transaction_date
            WHERE p.location_id = @location_id
              AND p.transaction_date <= PARSE_DATE('%Y-%m-%d', @date)
              AND p.daily_revenue IS NOT NULL`,
    params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
  });

  const days: Day[] = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const d = String(ymd(r.d)).slice(0, 10);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    return {
      d, rev: num(r.rev) as number, month: d.slice(0, 7),
      weekend: dow === 0 || dow === 6,
      pub: r.pub === true || r.pub === "true",
      sch: r.sch === true || r.sch === "true",
    };
  }).filter((x: Day) => Number.isFinite(x.rev));

  if (!days.length) return { found: false, data: { found: false, date }, facts: [], sources: [] };

  const pubRes = controlledEffect(days, (d) => d.pub);
  const schRes = controlledEffect(days, (d) => d.sch);

  const CONDS = [
    { key: "public_holiday", label: "jours fériés", short: "Jours fériés", res: pubRes },
    { key: "school_holiday", label: "vacances scolaires", short: "Vacances scolaires", res: schRes },
  ];

  // What is TODAY, from the same rows (no second query) — the card leads on it when it applies.
  const today = days.find((d) => d.d === date) || null;
  const today_conditions = today ? [today.pub ? "jour férié" : null, today.sch ? "vacances scolaires" : null].filter(Boolean) : [];

  const measured = CONDS.filter((c) => c.res.effect != null && c.res.t != null && Math.abs(c.res.t) >= T_GATE);
  const inconclusive = CONDS.filter((c) => !measured.includes(c));

  const facts: FamilyFact[] = [];
  const profile = CONDS.map((c) => ({
    label: c.short, n_days: c.res.n,
    effect_pct: c.res.effect != null ? Math.round(c.res.effect) : null,
    conclusive: measured.includes(c),
  }));

  for (const c of measured) {
    facts.push({
      // The control method is IN the sentence: "à mois et type de jour comparables" is what separates
      // this from the naive split that reports a seasonal trend as a holiday effect.
      fact_fr: `Sur ${c.res.n} occurrences, les ${c.label} font ${pctSigned(c.res.effect!)} de CA à mois et type de jour comparables (± ${Math.round(c.res.se!)} points).`,
      claim_type: "observed_difference",
    });
  }
  for (const c of inconclusive) {
    // Honest absence, WITH the reason. Silence alone lets the model fill the gap itself.
    facts.push({
      fact_fr: c.res.n < MIN_OCCURRENCES
        ? `Trop peu d'occurrences de ${c.label} dans votre historique (${c.res.n} sur ${MIN_OCCURRENCES} requises) : aucun effet sur votre CA ne peut être établi.`
        : `Sur ${c.res.n} occurrences, l'effet des ${c.label} sur votre CA n'est pas distinguable de zéro (${pctSigned(c.res.effect!)} ± ${Math.round(c.res.se!)} points) : trop dispersé pour conclure.`,
      claim_type: "observed",
    });
  }
  if (today_conditions.length) {
    // Terse noun-phrase (the house register) — "Aujourd'hui est vacances scolaires" is not French.
    facts.push({ fact_fr: `Aujourd'hui : ${today_conditions.join(" et ")}.`, claim_type: "observed" });
  }

  const lead = measured.length
    ? `${measured[0].short} : ${pctSigned(measured[0].res.effect!)} de CA à mois comparable.`
    : "Votre historique ne permet pas encore de mesurer l'effet du calendrier sur votre CA.";

  const decision_lines: { head: string; body: string }[] = [];
  for (const c of measured) {
    decision_lines.push({
      head: `${c.short} : ${pctSigned(c.res.effect!)}`,
      body: c.res.effect! < 0
        ? `Mesuré sur ${c.res.n} occurrences, à mois et type de jour comparables — adaptez effectif et ouverture plutôt que de subir.`
        : `Mesuré sur ${c.res.n} occurrences, à mois et type de jour comparables — c'est une fenêtre à exploiter, pas un hasard.`,
    });
  }
  if (!measured.length) {
    decision_lines.push({
      head: "Pas encore de verdict calendaire",
      body: "Les vacances et les fériés se concentrent sur quelques mois : sans plusieurs saisons d'historique, un écart de CA reflète la saison, pas le calendrier. Rien à décider ici pour l'instant.",
    });
  }

  const sources = ["Vos ventes — jours fériés et vacances comparés à vos jours habituels du même mois", "Calendrier scolaire et jours fériés (France)"];

  return {
    found: true,
    data: { found: true, date, lead, today_conditions, profile, decision_lines, n_days: days.length },
    facts,
    sources,
  };
}
