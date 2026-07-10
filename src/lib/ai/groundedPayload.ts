// The ONE adapter: the brain's LLM envelope (assembleDayContext → dc.llm) → a grounded prompt payload.
// Everything that narrates a day off the brain goes through here — the day-horizon prompt today, and
// drafts / reports / any future assistant later. Do NOT re-derive facts elsewhere; point at this.
//
// The contract is grounding-first: `citable_facts` is the WHITELIST — the model may state nothing that
// isn't one of these claim-typed facts. `signals` is the "what fired" register (distinct grain). `forbidden`
// is enforced (no causal verbs, no tier changes). Engines (sensitivities / decomposition / track record)
// are included ONLY where present — honest-absent otherwise, never padded.

import type { DayContext } from "../dayContext";

export interface CitableFact {
  id: string;                 // stable ref (f0, f1, …) — the model and the validator cite by id
  fact_fr: string;            // the exact French string the model may surface, verbatim
  claim_type:
    | "measured" | "observed_difference" | "observed_proximity" | "observed_presence"
    | "observed_acute" | "observed_change" | "observed";
}

export interface GroundedDayPayload {
  horizon: "day";
  question: string;
  date: string;               // ISO Y-m-d (internal)
  display_date: string;       // JJ/MM/AAAA (France — user-facing)
  // The grounding whitelist. The model composes the answer from ONLY these; each carries its claim_type.
  citable_facts: CitableFact[];
  // "What fired / what changed" today — distinct register from the day-grain facts, never blended.
  signals: {
    changes: DayContext["signals"]["changes"];
    cards: DayContext["signals"]["cards"];
  };
  // Salience ranking, claim-typed — NOT a cause (the forbidden rules bar causal phrasing on it).
  driver: DayContext["llm"]["driver"];
  // Measured engines, present only where the store has them (honest-absent → empty).
  engines: {
    sensitivities: DayContext["sensitivities"];      // Engine 2, filtered to active_today
    decomposition: DayContext["decomposition"];      // Engine 1×2 observed_difference
    track_record: DayContext["actionTrackByType"];   // Engine 1 what-worked (action_type → beat/done)
  };
  // The hard rules the packager prompt states and the validator enforces.
  forbidden: string[];
  // Minimal venue framing (non-citable descriptors — declared, low-trust; never a source of claims).
  venue: { site_name: string | null; location_type: string | null; business_description: string | null };
}

// ISO Y-m-d → JJ/MM/AAAA (France). Internal value stays ISO; only the display form is French.
function frDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// dc (the brain payload) + the day question → the grounded payload. Pure; no I/O.
// `extraFacts` appends caller-supplied claim-typed facts to the whitelist (e.g. Point du jour's
// yesterday-vs-today score delta — one extra read, made citable). A DESIGNED extension, not a fork:
// the facts still flow through the same grounding + validation. Never pass ungrounded/derived strings.
export function toGroundedDayPayload(
  dc: DayContext,
  opts: { question: string; date: string; extraFacts?: Array<{ fact_fr: string; claim_type: CitableFact["claim_type"] }>; excludeEngines?: boolean },
): GroundedDayPayload {
  // Drafts (customer-facing copy) exclude MEASURED engine facts entirely — a revenue sensitivity
  // ("votre CA −12 % les jours de chaleur") is operator intel, never Instagram/GBP/email copy. The
  // forecast context (heat/tourism/events) stays; the internal measured effect + decomposition drop.
  const ENGINE_TYPES = new Set(["measured", "observed_difference"]);
  const rawFacts = (dc.llm?.citable_facts ?? []).filter((f) => !(opts.excludeEngines && ENGINE_TYPES.has(f.claim_type)));
  const base = [...rawFacts, ...(opts.extraFacts ?? [])];
  const citable_facts: CitableFact[] = base.map((f, i) => ({
    id: `f${i}`,
    fact_fr: f.fact_fr,
    claim_type: f.claim_type,
  }));
  return {
    horizon: "day",
    question: opts.question,
    date: opts.date,
    display_date: frDate(opts.date),
    citable_facts,
    signals: {
      changes: dc.signals?.changes ?? [],
      cards: dc.signals?.cards ?? [],
    },
    driver: dc.llm?.driver ?? { value: null, claim_type: "observed_ranking" },
    engines: opts.excludeEngines
      ? { sensitivities: [], decomposition: [], track_record: {} }
      : {
        sensitivities: (dc.sensitivities ?? []).filter((s) => s.active_today),
        decomposition: dc.decomposition ?? [],
        track_record: dc.actionTrackByType ?? {},
      },
    forbidden: dc.llm?.forbidden ?? [],
    venue: {
      site_name: dc.profile?.site_name ?? null,
      location_type: dc.profile?.location_type ?? null,
      business_description: dc.profile?.business_description ?? null,
    },
  };
}

// The forbidden envelope for surfaces without a per-venue brain (multi-day window): the core rules,
// same spirit as dc.llm.forbidden. No causal verbs on facts, no invented numbers, honest-absence.
export const FORBIDDEN_BASE: string[] = [
  "Ne calcule, n'agrège ni ne réconcilie aucun nombre : cite uniquement les faits fournis.",
  "AUCUN verbe causal sur un fait (jamais « a causé / a fait baisser / a généré »). Un concurrent = proximité ; une date bien classée = un classement, pas une promesse.",
  "N'invente aucune date, aucun concurrent, aucun chiffre absent des faits ; à défaut, dis « pas assez de recul ».",
  "L'action proposée est un conseil ancré (« Vu X, envisagez Y ») — jamais un résultat chiffré ni une cause.",
];

// Multi-day WINDOW → a GroundedDayPayload (reuses the SAME validator + prompt as the day answer). Each
// day's row is claim-typed into date-prefixed facts; the answer leads with a takeaway, ranks the days,
// and ends on one grounded action. Engines honest-absent (forecast). NOT a period-brain — just claim-typing
// the rows already bulk-queried.
export function toGroundedWindowPayload(
  days: Array<{
    date: string; score?: number | null; regime?: string | null; weather_alert_level?: number | null;
    weather_label?: string | null; events_5km_same_bucket?: number | null; is_weekend?: boolean | null;
    is_holiday?: boolean | null; commercial?: boolean | null;
  }>,
  opts: { question: string; windowLabel: string },
): GroundedDayPayload {
  const facts: Array<{ fact_fr: string; claim_type: CitableFact["claim_type"] }> = [];
  for (const d of days) {
    const dd = frDate(d.date);
    if (d.score != null) facts.push({ fact_fr: `${dd} : score ${String(d.score).replace(".", ",")}/10${d.regime ? ` (régime ${d.regime})` : ""}`, claim_type: "observed" });
    if (d.events_5km_same_bucket != null) facts.push({ fact_fr: `${dd} : ${d.events_5km_same_bucket} concurrents directs à 5 km`, claim_type: "observed_proximity" });
    if (d.weather_alert_level != null && d.weather_alert_level > 0) facts.push({ fact_fr: `${dd} : alerte météo niveau ${d.weather_alert_level}`, claim_type: "observed_acute" });
    else if (d.weather_label) facts.push({ fact_fr: `${dd} : ${d.weather_label}`, claim_type: "observed" });
    if (d.is_holiday) facts.push({ fact_fr: `${dd} : jour férié`, claim_type: "observed_presence" });
    else if (d.is_weekend) facts.push({ fact_fr: `${dd} : week-end`, claim_type: "observed" });
    if (d.commercial) facts.push({ fact_fr: `${dd} : temps fort commercial`, claim_type: "observed_presence" });
  }
  const citable_facts: CitableFact[] = facts.map((f, i) => ({ id: `f${i}`, fact_fr: f.fact_fr, claim_type: f.claim_type }));
  return {
    horizon: "day", question: opts.question, date: days[0]?.date ?? "", display_date: opts.windowLabel,
    citable_facts, signals: { changes: [], cards: [] },
    driver: { value: null, claim_type: "observed_ranking" },
    engines: { sensitivities: [], decomposition: [], track_record: {} },
    forbidden: FORBIDDEN_BASE,
    venue: { site_name: null, location_type: null, business_description: null },
  };
}

// The set of exact strings the model is allowed to surface as facts — the validator's whitelist.
// Includes the citable_fact strings + the fired-signal labels (event_label / headline_fr) so a named
// change/card the model references still traces to a source. Numbers/entities not appearing in any of
// these are ungrounded (Step-5 validation rejects them).
export function groundedFactStrings(p: GroundedDayPayload): string[] {
  const out: string[] = [];
  for (const f of p.citable_facts) out.push(f.fact_fr);
  // Each fired change/card serialized (labels + its numbers) so a change the model references is grounded.
  for (const c of p.signals.changes) {
    const bits = [c.change_type, c.change_subtype, c.direction, c.event_label, c.score_delta, c.alert_level, c.distance_m]
      .filter((v) => v != null && v !== "");
    if (bits.length) out.push(bits.join(" "));
  }
  for (const c of p.signals.cards) if (c.headline_fr) out.push(c.headline_fr);
  for (const s of p.engines.sensitivities) if ((s as any).feature) out.push(String((s as any).feature));
  return out.filter(Boolean);
}
