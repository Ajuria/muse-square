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
  intent: string;       // pivot | reinforce | scale — chosen by the owner's own result (see intentForState)
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
  source_tier: number; // 1 institutionnel/académique · 2 rapport multi-lieux/presse pro · 3 legacy pré-registre
}

const CONF_RANK: Record<string, number> = { eleve: 3, moyen: 2, faible: 1 };

// Controlled lever vocabulary (must match crawl-best-in-class.cjs LEVER_LABELS).
export type Lever = "conversion" | "panier" | "yield" | "frequentation" | "fidelisation";

// Intent — the analog must fit the owner's own result ("Votre action paie-t-elle ?"):
//   below goal   -> pivot     (what else to try)
//   aligned/thin -> reinforce (push the working move further)
//   above goal   -> scale     (make the win last / bigger)
export type PlayState = "below" | "aligned" | "above";
export type Intent = "pivot" | "reinforce" | "scale";
const STATE_INTENT: Record<PlayState, Intent> = { below: "pivot", aligned: "reinforce", above: "scale" };
export function intentForState(state: PlayState): Intent { return STATE_INTENT[state]; }

// Map a card's action_type onto ONE lever — TABLE EXPLICITE pour tout le registre des origins
// d'engagement (étape 2 « méthodes pertinentes », 27/07 — avant : 4 entrées + fallback, la
// quasi-totalité des 80+ sous-types retombait sur « conversion »). Résolution :
//   1. table explicite ; 2. origin_driver de la carte (les cartes sales K1 : le levier est le
//   driver qui décroche, pas le type) ; 3. préfixe structural_ → frequentation (classes de jours) ;
//   4. mots-clés (filet pour un futur type non listé) ; 5. conversion.
const ACTION_LEVER: Record<string, Lever> = {
  // Ventes — types à levier PROPRE (le driver ne les change pas)
  sales_traffic_not_converting: "conversion",
  sales_missed_opportunity: "conversion",
  sales_underperformance: "conversion",
  offre_appel: "conversion",
  offering_mix_shift: "conversion",
  sales_discount_no_lift: "yield",
  structural_discount_no_lift: "yield",
  structural_traffic_high: "conversion",
  chat_decision_salesdiscount: "yield",
  chat_decision_offering: "conversion",
  // Prix concurrents → yield
  competitor_price_drop: "yield",
  competitor_price_increase: "yield",
  competitor_repricing_event: "yield",
  // Réputation / contenu → fidélisation (réduire la sensibilité à l'offre d'en face)
  competitor_review_surge: "fidelisation",
  competitor_review_drop: "fidelisation",
  competitor_reputation_strength: "fidelisation",
  review_solicitation: "fidelisation",
  // C1 (27/08, test levier instruit — rouge depuis le 07/08) : relancer un client dormant
  // est un geste de fidélisation, pas de conversion.
  client_dormant: "fidelisation",
  // Chat (28/08) : rejeu d'un prouvé et idée soumise — le levier RÉEL varie par idée/dispositif ;
  // conversion assumée (même précédent que weekly_briefing), le vrai levier vit sur le dispositif.
  chat_journal_replay: "conversion",
  chat_idea_test: "conversion",
  competitor_content_spike: "fidelisation",
  competitor_content_silent: "fidelisation",
  sales_competition_cannibalization: "fidelisation",
  proven_action_replication: "fidelisation",
  // Positionnement concurrent → conversion (différenciation)
  competitor_positioning_brief: "conversion",
  competitor_positioning_gap: "conversion",
  competitor_new_offering: "conversion",
  competitor_offering_removed: "conversion",
  competitor_threat_direct: "conversion",
  // Météo → fréquentation (la condition joue sur le flux)
  weather_hazard_onset: "frequentation",
  weather_worsened: "frequentation",
  weather_improved: "frequentation",
  extended_bad_weather: "frequentation",
  extended_bad_weather_3d: "frequentation",
  weather_window: "frequentation",
  weather_window_after_bad: "frequentation",
  saturated_bad_weather: "frequentation",
  weather_mobility_double: "frequentation",
  weather_comp_opportunity: "frequentation",
  chat_decision_weather: "frequentation",
  // Calendrier / événements / jours → fréquentation
  commercial_event_match: "frequentation",
  mega_event_activation: "frequentation",
  mega_event_end: "frequentation",
  top_day_approaching: "frequentation",
  weekend_opportunity: "frequentation",
  day_opportunity: "frequentation",
  weekend_vacation_low_comp: "frequentation",
  best_day_of_week: "frequentation",
  holiday_high_comp: "frequentation",
  perfect_storm: "frequentation",
  calendar_audience_shift: "frequentation",
  audience_shift_opportunity: "frequentation",
  chat_decision_calendar: "frequentation",
  chat_decision_events: "frequentation",
  chat_decision_audience: "frequentation",
  // Concurrence ambiante / événements concurrents → fréquentation
  competition_proximity: "frequentation",
  high_competition_density: "frequentation",
  competition_pressure_spike: "frequentation",
  same_bucket_saturation: "frequentation",
  low_competition_window: "frequentation",
  mobility_comp_squeeze: "frequentation",
  competitor_event_launch: "frequentation",
  competitor_event_ending: "frequentation",
  competitor_audience_conflict: "frequentation",
  competitor_sold_out: "frequentation",
  competitor_hours_change: "frequentation",
  chat_decision_competitor: "frequentation",
  // Tourisme → fréquentation
  tourist_high_season: "frequentation",
  tourist_surge_vacation: "frequentation",
  tourism_peak_window: "frequentation",
  tourism_weather_vacation: "frequentation",
  tourism_comp_squeeze: "frequentation",
  low_tourism_local_opp: "frequentation",
  foreign_tourism_signal: "frequentation",
  tourism_mobility_hit: "frequentation",
  chat_decision_tourism: "frequentation",
  // Mobilité / score / régime → fréquentation
  mobility_disruption: "frequentation",
  mobility_disruption_planned: "frequentation",
  mobility_disruption_resolved: "frequentation",
  score_up: "frequentation",
  score_down: "frequentation",
  regime_change: "frequentation",
  regime_c_warning: "frequentation",
  medal_change: "frequentation",
  score_driver_shift: "frequentation",
  chat_decision_footfall: "frequentation",
  ft_peak_bad_weather: "frequentation",
  ft_quiet_good_weather: "frequentation",
  ft_peak_saturated: "frequentation",
  ft_peak_low_comp: "frequentation",
  ft_peak_tourism_vacation: "frequentation",
  ft_peak_mobility: "frequentation",
  // Visibilité institutionnelle / médias → fréquentation
  institution_campaign_detected: "frequentation",
  media_mention_detected: "frequentation",
};
const DRIVER_LEVER: Record<string, Lever> = {
  basket: "panier",
  conversion: "conversion",
  footfall: "frequentation",
  transactions: "frequentation", // transactions folds into footfall (même règle que reco-library)
};
// Aiguillage par le facteur MESURÉ le plus faible (owner 28/08) : quand la décomposition
// des ventes dit où il reste de la marge, elle prime sur le type de la carte d'origine —
// une carte « vacances scolaires » renvoyait toujours vers la fréquentation, même quand ce
// qui manquait était la valeur de l'article. Le foyer des leviers reste ici.
const FACTEUR_LEVER: Record<string, Lever> = {
  tx: "frequentation",   // peu d'achats -> faire venir
  items: "panier",       // peu d'articles par achat -> vente additionnelle, formules
  price: "yield",        // article peu cher -> montée en gamme, valeur perçue
};
export function leverForWeakFactor(weak?: string | null): Lever | null {
  const k = String(weak || "");
  return FACTEUR_LEVER[k] ?? null;
}

export function leverForActionType(actionType?: string | null, driver?: string | null): Lever {
  const at = String(actionType || "").toLowerCase();
  if (ACTION_LEVER[at]) return ACTION_LEVER[at];
  const dv = String(driver || "").toLowerCase();
  if (DRIVER_LEVER[dv]) return DRIVER_LEVER[dv]; // sales_surge / revenue_down_wow / decomposition
  if (/^structural_/.test(at)) return "frequentation"; // classes de jours (météo/tourisme/concurrence)
  if (/panier|basket|upsell|addition/.test(at)) return "panier";
  if (/yield|prix|price|discount|remise|tarif|early/.test(at)) return "yield";
  if (/review|reputation|avis/.test(at)) return "fidelisation";
  if (/freq|affluence|footfall|attendance|proximity|competition|concurrent|weather|meteo|tourism|tourist|event|calendar|mobility|score|regime|audience|weekend/.test(at)) return "frequentation";
  if (/fidel|repeat|retention|revenir|abonn/.test(at)) return "fidelisation";
  return "conversion";
}

// Read vetted plays for a venue's vertical + lever, best-first (confidence, then a named source).
// `limit` defaults to 2 — the advice slot shows one analog, occasionally two.
// La ligne du magasin → un play typé — UNE conversion, partagée par les deux lecteurs.
function rowToPlay(r: any): BestInClassPlay {
  return {
    play_id: flat(r.play_id),
    industry_code: flat(r.industry_code),
    lever: flat(r.lever),
    intent: flat(r.intent),
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
    source_tier: Number(flat(r.source_tier)) || 3, // legacy pré-registre → dernier rang
  };
}

// Les meilleures références d'une INDUSTRIE, tous leviers (plan de période, 27/08) — le
// même magasin, même contrat : des PREUVES crawlées (« X a fait Y »), jamais des plans.
// Tri : meilleure source d'abord (source_tier), puis la plus récente.
export async function listIndustryPlays(
  bq: any,
  industryCode: string,
  limit = 3,
): Promise<BestInClassPlay[]> {
  if (!industryCode) return [];
  let rows: any[] = [];
  try {
    [rows] = await bq.query({
      query:
        `SELECT play_id, industry_code, lever, intent, title, context, move, outcome, steps, ` +
        `source_name, source_url, published_at, confidence, venue_named, source_tier ` +
        `FROM \`${STORE_TABLE}\` WHERE industry_code=@ind ` +
        `ORDER BY source_tier, published_at DESC LIMIT ${Math.max(1, Math.min(6, limit))}`,
      params: { ind: industryCode },
      location: "EU",
    });
  } catch { return []; }
  return (rows || []).map(rowToPlay);
}

export async function getBestInClassPlays(
  bq: any,
  industryCode: string,
  lever: string,
  opts: { limit?: number; intent?: Intent } = {}
): Promise<BestInClassPlay[]> {
  if (!industryCode || !lever) return [];
  const limit = opts.limit || 2;
  let rows: any[] = [];
  try {
    const conds = ["industry_code=@ind", "lever=@lev"];
    const params: any = { ind: industryCode, lev: lever };
    if (opts.intent) { conds.push("intent=@intent"); params.intent = opts.intent; }
    [rows] = await bq.query({
      query:
        `SELECT play_id, industry_code, lever, intent, title, context, move, outcome, steps, ` +
        `source_name, source_url, published_at, confidence, venue_named, source_tier ` +
        `FROM \`${STORE_TABLE}\` WHERE ${conds.join(" AND ")}`,
      params,
      location: "EU",
    });
  } catch (e) {
    return []; // store absent / not yet crawled — slot falls back to its placeholder
  }
  return rows
    .map(rowToPlay)
    .sort((a, b) => a.source_tier - b.source_tier || (CONF_RANK[b.confidence] || 0) - (CONF_RANK[a.confidence] || 0) || (b.venue_named ? 1 : 0) - (a.venue_named ? 1 : 0))
    .slice(0, limit);
}
