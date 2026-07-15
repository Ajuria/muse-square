// The ONE adapter: the brain's LLM envelope (assembleDayContext → dc.llm) → a grounded prompt payload.
// Everything that narrates a day off the brain goes through here — the day-horizon prompt today, and
// drafts / reports / any future assistant later. Do NOT re-derive facts elsewhere; point at this.
//
// The contract is grounding-first: `citable_facts` is the WHITELIST — the model may state nothing that
// isn't one of these claim-typed facts. `signals` is the "what fired" register (distinct grain). `forbidden`
// is enforced (no causal verbs, no tier changes). Engines (sensitivities / decomposition / track record)
// are included ONLY where present — honest-absent otherwise, never padded.

import type { DayContext } from "../dayContext";
import type { Tier } from "../sensitivityStore";

export interface CitableFact {
  id: string;                 // stable ref (f0, f1, …) — the model and the validator cite by id
  fact_fr: string;            // the exact French string the model may surface, verbatim
  claim_type:
    | "measured" | "observed_difference" | "observed_proximity" | "observed_presence"
    | "observed_acute" | "observed_change" | "observed";
  // Confidence tier — present ONLY on the two engine-backed claim types (measured = Engine 2's
  // confidence_tier; observed_difference = the decomposition's independent-N tier). Absent everywhere
  // else: a competitor's proximity or a weather alert has no confidence register, and inventing one
  // would imply a measurement that was never made.
  // Carried so the model can LABEL a causal upgrade with the register it rests on (Phase 1 #5) — the
  // fact text itself stays unhedged (see sensitivityCopy's locked no-hedging rule).
  tier?: Tier;
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
    // Pass the tier THROUGH when the brain supplied one. Never defaulted: a fact with no tier must stay
    // tier-less so the validator's causal gate can't be satisfied by an invented register.
    ...((f as any).tier ? { tier: (f as any).tier as Tier } : {}),
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

// ── Honest-absence floor (Phase 1 change #3) ─────────────────────────────────────────────────────────
// When BOTH grounded attempts fail AND the payload carries no citable facts at all, the old floor printed
// a generic template — which reads as "nothing happened" when the truth is "we have nothing MEASURED to
// say". This composer writes that truth instead, in code, from which fact CATEGORIES are absent — zero
// model text, so it is exactly as un-fabricable as the template it replaces. Returns null whenever any
// citable fact exists: then the gap is not the story and the existing deterministic floor stays.
//
// OWNER-FINAL copy (terse noun-phrases, house register) — adjust wording here, never in prompt.ts.
const ABSENCE_CATEGORY_FR: Array<{ types: CitableFact["claim_type"][]; label: string }> = [
  { types: ["measured"], label: "réaction mesurée de vos ventes" },
  { types: ["observed_difference"], label: "écart mesuré vs vos jours comparables" },
  { types: ["observed_proximity", "observed_presence"], label: "signal de contexte (concurrent, événement, visiteurs)" },
  { types: ["observed_acute"], label: "alerte météo" },
  { types: ["observed_change", "observed"], label: "changement détecté" },
];

export function composeHonestAbsenceFr(p: GroundedDayPayload): { headline: string; answer: string } | null {
  if ((p.citable_facts ?? []).length > 0) return null;   // facts exist → the gap is not the story
  const missing = ABSENCE_CATEGORY_FR.map((c) => c.label);
  return {
    headline: `Pas de donnée mesurée à citer pour le ${p.display_date}.`,
    answer:
      `Pour ce jour, je n'ai aucun fait vérifié à vous citer : ni ${missing.slice(0, -1).join(", ni ")}, ` +
      `ni ${missing[missing.length - 1]}. Plutôt que de remplir ce vide, je vous le signale — ` +
      `la réponse changera dès que vos données couvriront ce jour.`,
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
