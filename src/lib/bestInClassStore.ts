// Best-in-class plays — the ONE typed accessor for the "lieux comparables" advice slot.
//
// Every surface that shows "comment des lieux comparables s'y prennent" (the engagement diagnosis
// panel + the insight "Plan a essayer" cards) reads THROUGH this. None queries the store directly.
// A row that exists here was already vetted at crawl time (src/scripts/crawl-best-in-class.cjs):
// reputable named source + URL, real reported outcome (never invented), venue named only when the
// source names it publicly. Consumers PRESENT an analog to try — never a promised result.
//
// Store table = analytics.best_in_class_plays (script-loaded, WRITE_TRUNCATE monthly). Repointable
// to a mart later — change STORE_TABLE only, no consumer touches the path.

const STORE_TABLE = "analytics.best_in_class_plays";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export type Confidence = "eleve" | "moyen" | "faible";

export interface BestInClassPlay {
  play_id: string;
  industry_code: string;
  lever: string;
  title: string;
  context: string;
  move: string;          // the X — what the comparable venue did
  outcome: string;       // the Y — the reported result, as-is from the source (may be qualitative)
  steps: string[];       // 2-4 concrete steps to reproduce (feeds the "Comment faire ?" expand)
  source_name: string;
  source_url: string;
  published_at: string;
  confidence: Confidence;
  venue_named: boolean;
}

const CONF_RANK: Record<string, number> = { eleve: 3, moyen: 2, faible: 1 };

// Controlled lever vocabulary (must match crawl-best-in-class.cjs LEVER_LABELS).
export type Lever = "conversion" | "panier" | "yield" | "frequentation" | "fidelisation";

// Map a card's action_type onto ONE lever. Explicit for known families, keyword fallback otherwise
// so a new action_type still routes sensibly instead of returning nothing.
const ACTION_LEVER: Record<string, Lever> = {
  sales_revenue_down_wow: "conversion",
  offre_appel: "conversion",
  competition_proximity: "frequentation",
  sales_discount_no_lift: "yield",
};
export function leverForActionType(actionType?: string | null): Lever {
  const at = String(actionType || "").toLowerCase();
  if (ACTION_LEVER[at]) return ACTION_LEVER[at];
  if (/panier|basket|upsell|addition/.test(at)) return "panier";
  if (/yield|prix|price|discount|remise|tarif|early/.test(at)) return "yield";
  if (/freq|affluence|footfall|attendance|proximity|competition|concurrent/.test(at)) return "frequentation";
  if (/fidel|repeat|retention|revenir|abonn/.test(at)) return "fidelisation";
  return "conversion";
}

// Read vetted plays for a venue's vertical + lever, best-first (confidence, then a named source).
// `limit` defaults to 2 — the advice slot shows one analog, occasionally two.
export async function getBestInClassPlays(
  bq: any,
  industryCode: string,
  lever: string,
  opts: { limit?: number } = {}
): Promise<BestInClassPlay[]> {
  if (!industryCode || !lever) return [];
  const limit = opts.limit || 2;
  let rows: any[] = [];
  try {
    [rows] = await bq.query({
      query:
        `SELECT play_id, industry_code, lever, title, context, move, outcome, steps, ` +
        `source_name, source_url, published_at, confidence, venue_named ` +
        `FROM \`${STORE_TABLE}\` WHERE industry_code=@ind AND lever=@lev`,
      params: { ind: industryCode, lev: lever },
      location: "EU",
    });
  } catch (e) {
    return []; // store absent / not yet crawled — slot falls back to its placeholder
  }
  return rows
    .map((r) => ({
      play_id: flat(r.play_id),
      industry_code: flat(r.industry_code),
      lever: flat(r.lever),
      title: flat(r.title),
      context: flat(r.context),
      move: flat(r.move),
      outcome: flat(r.outcome),
      steps: Array.isArray(r.steps) ? r.steps.map(flat) : [],
      source_name: flat(r.source_name),
      source_url: flat(r.source_url),
      published_at: flat(r.published_at),
      confidence: (flat(r.confidence) || "faible") as Confidence,
      venue_named: flat(r.venue_named) === true,
    }))
    .sort((a, b) => (CONF_RANK[b.confidence] || 0) - (CONF_RANK[a.confidence] || 0) || (b.venue_named ? 1 : 0) - (a.venue_named ? 1 : 0))
    .slice(0, limit);
}
