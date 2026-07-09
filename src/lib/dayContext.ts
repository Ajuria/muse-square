// Shared day-context assembler (fact-first). ONE source of the app's existing French context facts
// for today × venue, reused by BOTH the four-tier context-decision endpoint
// (src/pages/api/insight/reactions-today.ts) and the sales report (src/pages/api/insight/sales-report.ts).
// It REUSES the strings the app already generates (audience_availability_label, disruption title_merged,
// action-candidate headline_fr, named events) rather than re-deriving bare numbers — see
// docs/features/context-decision-service.md. It produces STRUCTURED facts (mart French where clean +
// structured data for owner copy); it authors NO French of its own.

import { formatDisruption, fillContextFallback } from './contextCopy';
import { getSensitivities, type Sensitivity } from './sensitivityStore';
import { envTodayLine, decompositionLine } from './sensitivityCopy';
import featureRegistry from './sensitivityFeatures.json';

const PROJECT = 'muse-square-open-data';
export const flatVal = (v: any): any => (v && typeof v === 'object' && 'value' in v ? v.value : v);
// French distance (comma decimal). Formatting, not copy.
const frKmFmt = (km: number | null): string => km == null ? '' : (km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : String(Math.round(km))) + ' km';

// Curated tourist-origin countries (moved here from sales-report so both share one list).
export const TOURIST_COUNTRIES = [
  'Germany', 'United Kingdom', 'Netherlands', 'Belgium', 'Spain', 'Italy',
  'Switzerland', 'Portugal', 'United States', 'Ireland', 'Denmark', 'Sweden',
  'Luxembourg', 'Austria', 'Norway',
];

// Gate reused mart strings: NEVER surface English/mangled headlines on the operator's screen
// (upstream dbt bug — file separately). Accept clean French; reject decomposition dumps + English tells.
const EN_TELL = /\b(weather|alert|increased|decreased|worsened|onset|shift|brief|strength|match|opportunity)\b/i;
export function isCleanFrench(s?: string | null): boolean {
  if (!s) return false;
  if (/\(\s*\d+\s*(→|->)\s*\d+\s*\)/.test(s)) return false; // "(2 → 4)" decomposition
  if (EN_TELL.test(s)) return false;
  return true;
}

// ── Shared named-context helpers (reused by sales-report's window assembly too) ──
export async function namedEventsRange(bq: any, loc: string, start: string, end: string, limit = 4) {
  const [rows] = await bq.query({
    query:
      `SELECT ev.event_label AS label, COUNT(DISTINCT t.date) AS days, MIN(ev.distance_m) AS dist ` +
      `FROM \`${PROJECT}.mart.fct_location_events_topn_daily\` t, UNNEST(t.top_events_5km) ev ` +
      `WHERE t.location_id=@loc AND t.date BETWEEN @s AND @e AND NOT COALESCE(ev.is_cancelled_bool,false) ` +
      `GROUP BY 1 ORDER BY days DESC LIMIT ${limit}`,
    params: { loc, s: start, e: end }, location: 'EU',
  });
  return (rows || []).map((e: any) => ({ label: flatVal(e.label), days: Number(flatVal(e.days)) || 0, distance_m: e.dist == null ? null : Number(flatVal(e.dist)) }));
}
export async function foreignVisitorsRange(bq: any, loc: string, start: string, end: string, limit = 4) {
  const [rows] = await bq.query({
    query:
      `SELECT c.country_name_en AS country, COUNT(DISTINCT date) AS days ` +
      `FROM \`${PROJECT}.mart.fct_foreign_tourism_context_daily\` t, UNNEST(t.countries_on_school_holiday) c ` +
      `WHERE date BETWEEN @s AND @e AND c.country_name_en IN UNNEST(@tc) GROUP BY 1 ORDER BY days DESC LIMIT ${limit}`,
    params: { loc, s: start, e: end, tc: TOURIST_COUNTRIES }, location: 'EU',
  });
  return (rows || []).map((f: any) => flatVal(f.country));
}

// Scoped sub-accessor — the ONE action_type-rollup read (pre-explode commitment-grain outcomes, no
// double-count). Used inside the brain AND by évolution ③ so it stops paying for a full assemble;
// same composition, never a parallel read path.
export async function getActionRollup(bq: any, loc: string): Promise<Record<string, { beat: number; done: number }>> {
  const [orows] = await bq.query({
    query: `SELECT action_type, COUNTIF(beat) AS beat, COUNTIF(NOT is_confounded) AS done ` +
      `FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\` WHERE location_id=@loc AND source='commitment' GROUP BY 1`,
    params: { loc }, location: 'EU',
  }).catch(() => [[]] as any[]);
  const out: Record<string, { beat: number; done: number }> = {};
  (orows || []).forEach((r: any) => { out[flatVal(r.action_type)] = { beat: Number(flatVal(r.beat)), done: Number(flatVal(r.done)) }; });
  return out;
}

// Engine 1 × Engine 2 decomposition — an OBSERVED DIFFERENCE, computed once in the brain, claim-typed.
// context_effect = the no-action subset of factor-days (verified: action days stay OUT of the baseline).
export interface DecompositionRecord {
  factor: string; context_effect: number; action_delta: number; net: number; n: number;
  tier: string; claim_type: 'observed_difference'; cite_fr: string;
}

// Static per-location venue profile ("user context"). Declared attributes — declared_weather_sensitivity
// / seasonality are the venue's PROFILE, NEVER the measured Engine-2 effect (the learned engine is truth).
export interface VenueProfile {
  activity_type: string | null; location_type: string | null; audience: string[];
  capacity_sensitivity: string | null; declared_weather_sensitivity: number | null; seasonality: string | null;
  operating_hours: string | null; venue_capacity: number | null; event_types: string[];
  besttime: { rating: number | null; dwell_min: number | null; dwell_max: number | null };
  top_item: { description: string | null; revenue_share: number | null };
  business_description: string | null;
}

export interface DayContextFact { fact_text: string | null; fact_data: Record<string, any>; source: string }
export interface DayCompetitor {
  competitor_id: string; name: string; distance_km: number | null; threat_level: string | null;
  google_rating: number | null; google_rating_count: number | null; enriched: string | null;
  offering_change: string | null; rating_trend: number | null; source: string;
}
export type SensitivityToday = Sensitivity & { active_today: boolean };  // Engine 2
export interface CommitmentFactorTrack { factor: string; action_type: string; beat: number; done: number }
export interface DayContext {
  weather: DayContextFact; mobility: DayContextFact; calendar: DayContextFact;
  events: Array<{ event_label: string; distance_m: number | null; event_start_date: string | null }>;
  tourism: { status: string | null; peak: boolean };
  foreign: string[]; takeaway: string | null; driver: string | null;
  competitors: DayCompetitor[];
  // Engines + context tiers folded into the brain — consumers read these from the payload, never from
  // the store / learning / opportunity marts.
  sensitivities: SensitivityToday[];                                  // Engine 2 (measured); filter active_today as needed
  actionTrackByFactor: CommitmentFactorTrack[];                       // Engine 1 factor-level (Tier 4), from the dbt learning mart
  actionTrackByType: Record<string, { beat: number; done: number }>; // Engine 1 action_type-level (évolution ③), pre-explode outcomes
  impacts: Record<string, number>;                                    // Tier-2 estimation priors (delta_att_*) keyed by factor — SUPPRESS-IN-2 applied (measured factors dropped)
  profile: VenueProfile;                                              // static per-location venue profile (user context)
  decomposition: DecompositionRecord[];                               // Engine 1 × Engine 2, pre-computed + claim-typed
  // the LLM contract: every citable fact carries its claim_type; driver is a salience RANKING (not a cause).
  llm: {
    citable_facts: Array<{ fact_fr: string; claim_type: 'measured' | 'observed_difference' | 'observed_proximity' }>;
    driver: { value: string | null; claim_type: 'observed_ranking' };
    forbidden: string[];
  };
}

// Assemble today's reused French facts + Engine 1/2 records for one venue. Single date (range helpers
// above serve windows). opts.devSeed swaps the store/learning to demo fixtures (?src=seed). This is the
// ONE brain: every consumer reads its payload; none reads the sensitivity store or learning marts directly.
export async function assembleDayContext(bq: any, loc: string, date: string, opts: { devSeed?: boolean } = {}): Promise<DayContext> {
  const d = bq.date(date);
  const one = async (query: string, params: Record<string, any>) => {
    const [rows] = await bq.query({ query, params, location: 'EU' });
    return (rows || [])[0] || {};
  };

  const [surface, mob, disruption, weatherHead, events, foreign, tour, profileRow] = await Promise.all([
    // day_surface — the mart's own French facts + "what's driving today"
    one(`SELECT key_takeaway, primary_score_driver_label AS driver, audience_availability_label AS cal_label,
           holiday_name, vacation_name
         FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d }),
    // mobility scalars (traffic level is interpretable: lvl 3->~-8%, lvl 4->~-12% car access)
    one(`SELECT traffic_customer_lvl AS traffic_lvl, transit_lvl
         FROM \`${PROJECT}.mart.fct_location_impact_daily_mobility\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d }),
    // named disruption (French title_merged) when one is active today
    one(`SELECT title_merged, short_name AS line, stop_name, delay_minutes, severity
         FROM \`${PROJECT}.mart.fct_location_mobility_disruption_changes\`
         WHERE location_id=@loc AND current_disruption_date=@d AND is_active_flag ORDER BY delay_minutes DESC NULLS LAST LIMIT 1`, { loc, d }),
    // weather fact = clean French action-candidate headline (gated), category context/weather
    one(`SELECT headline_fr FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
         WHERE location_id=@loc AND date=@d AND action_category IN ('context','weather') AND headline_fr IS NOT NULL
         ORDER BY action_priority DESC LIMIT 1`, { loc, d }),
    // nearest named events today (reused; distance-ranked)
    (async () => {
      const [rows] = await bq.query({
        query: `SELECT ev.event_label AS label, ev.distance_m AS dist, CAST(ev.event_start_date AS STRING) AS start_date
          FROM \`${PROJECT}.mart.fct_location_events_topn_daily\` t, UNNEST(t.top_events_5km) ev
          WHERE t.location_id=@loc AND t.date=@d AND NOT COALESCE(ev.is_cancelled_bool,false)
            AND COALESCE(ev.event_end_date, ev.event_start_date) >= @d ORDER BY ev.distance_m ASC LIMIT 3`,
        params: { loc, d }, location: 'EU',
      });
      return rows || [];
    })(),
    foreignVisitorsRange(bq, loc, date, date),
    // tourism status
    one(`SELECT tourism_status_region AS status, COALESCE(tourism_peak_flag_region,false) AS peak
         FROM \`${PROJECT}.mart.fct_location_context_daily\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d }),
    // venue profile — STATIC per-location "user context". Complementary, NOT a fork. Its declared
    // weather_sensitivity/seasonality are attributes, NEVER the measured Engine-2 effect (guard below).
    one(`SELECT company_activity_type, location_type, primary_audience_1, primary_audience_2, capacity_sensitivity,
           weather_sensitivity, seasonality, operating_hours, venue_capacity, event_type_1, event_type_2, event_type_3,
           besttime_rating, besttime_dwell_time_min, besttime_dwell_time_max, top_item_description, top_item_revenue_share,
           business_short_description
         FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\` WHERE location_id=@loc LIMIT 1`, { loc }),
  ]);

  // Top-3 followed competitors, proximity-aware (threat_score is NOT distance-weighted), + rating/enriched.
  const [compRows] = await bq.query({
    query:
      `SELECT tp.competitor_id AS cid, tp.competitor_name AS name, tp.distance_km AS km, tp.threat_level AS threat_level, ` +
      `dir.google_rating AS rating, dir.google_rating_count AS rating_count, ` +
      `JSON_VALUE(dir.auto_enriched_description, '$.business_description') AS enriched ` +
      `FROM \`${PROJECT}.mart.fct_competitor_threat_profile\` tp ` +
      `LEFT JOIN \`${PROJECT}.mart.fct_competitor_directory\` dir USING(competitor_id) ` +
      `WHERE tp.is_followed AND tp.location_id=@loc AND tp.distance_km IS NOT NULL ` +
      `ORDER BY tp.threat_score/(1+tp.distance_km/5) DESC LIMIT 3`,
    params: { loc }, location: 'EU',
  });
  const cids = (compRows || []).map((c: any) => flatVal(c.cid));
  // offering changes + rating trends for those competitors (live tables; empty for offering-less verticals)
  const offeringByCid: Record<string, string> = {};
  const trendByCid: Record<string, number> = {};
  if (cids.length) {
    const [off] = await bq.query({
      query: `SELECT competitor_id AS cid, item, change_type, ROUND(price_pct_change,0) AS pct
        FROM \`${PROJECT}.intermediate.int_competitor_offering_changes\` WHERE competitor_id IN UNNEST(@cids)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY competitor_id ORDER BY current_crawled_at DESC)=1`,
      params: { cids }, location: 'EU',
    }).catch(() => [[]]);
    (off || []).forEach((r: any) => { offeringByCid[flatVal(r.cid)] = `${flatVal(r.item)} (${flatVal(r.change_type)})`; });
    const [tr] = await bq.query({
      query: `SELECT competitor_id AS cid, delta_rating
        FROM \`${PROJECT}.intermediate.int_competitor_snapshot_deltas\`
        WHERE competitor_id IN UNNEST(@cids) AND delta_rating IS NOT NULL AND delta_rating != 0
        QUALIFY ROW_NUMBER() OVER (PARTITION BY competitor_id ORDER BY snapshot_date DESC)=1`,
      params: { cids }, location: 'EU',
    }).catch(() => [[]]);
    (tr || []).forEach((r: any) => { trendByCid[flatVal(r.cid)] = Number(flatVal(r.delta_rating)); });
  }
  const competitors: DayCompetitor[] = (compRows || []).map((c: any) => {
    const cid = flatVal(c.cid);
    return {
      competitor_id: cid, name: flatVal(c.name), distance_km: c.km == null ? null : Number(flatVal(c.km)),
      threat_level: flatVal(c.threat_level), google_rating: c.rating == null ? null : Number(flatVal(c.rating)),
      google_rating_count: c.rating_count == null ? null : Number(flatVal(c.rating_count)), enriched: flatVal(c.enriched) ?? null,
      offering_change: offeringByCid[cid] ?? null, rating_trend: trendByCid[cid] ?? null,
      source: 'mart.fct_competitor_threat_profile+directory',
    };
  });

  // mobility fact: named disruption (reused French) OR interpretable traffic level (owner copy via fact_data)
  const disTitle = flatVal(disruption.title_merged);
  const trafficLvl = flatVal(mob.traffic_lvl) == null ? null : Number(flatVal(mob.traffic_lvl));
  const disParts = {
    title: disTitle, line: flatVal(disruption.line), stop_name: flatVal(disruption.stop_name),
    delay_minutes: disruption.delay_minutes == null ? null : Number(flatVal(disruption.delay_minutes)), severity: flatVal(disruption.severity),
  };
  // Full disruption fact (title + line/stop + delay + severity), never the bare title. No named
  // disruption -> null so the endpoint falls back to the traffic-level owner string (contextCopy).
  const mobility: DayContextFact = (disTitle && isCleanFrench(disTitle))
    ? { fact_text: formatDisruption(disParts), fact_data: disParts, source: 'mart.fct_location_mobility_disruption_changes' }
    : { fact_text: null, fact_data: { traffic_customer_lvl: trafficLvl }, source: 'mart.fct_location_impact_daily_mobility' };

  // ── Engines folded in: consumers read these from the payload; NONE reads the store/learning marts. ──
  // Engine 2 — measured sensitivities (Tier 1), via the one typed accessor.
  const sensRaw = await getSensitivities(bq, loc, { metric: 'revenue', storeTable: opts.devSeed ? 'analytics.b_demo_sensitivity' : undefined });
  // active-today flag: the single-source registry predicate against context_daily (this mart).
  const REG = featureRegistry.revenue as Array<{ key: string; predicate?: string }>;
  let activeSet = new Set<string>();
  if (opts.devSeed) activeSet = new Set(sensRaw.map((s) => s.feature)); // demo: seeded factors are "active today"
  else {
    const feats = sensRaw.filter((s) => REG.find((f) => f.key === s.feature)?.predicate);
    if (feats.length) {
      const checks = feats.map((s) => `${REG.find((f) => f.key === s.feature)!.predicate} AS f_${s.feature}`);
      const r = await one(`SELECT ${checks.join(',')} FROM \`${PROJECT}.mart.fct_location_context_daily\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d });
      activeSet = new Set(feats.filter((s) => flatVal(r[`f_${s.feature}`]) === true).map((s) => s.feature));
    }
  }
  const sensitivities: SensitivityToday[] = sensRaw.map((s) => ({ ...s, active_today: activeSet.has(s.feature) }));

  // Engine 1 factor-level (Tier 4) — the dbt learning mart, factor-keyed (NOT re-exploded in TS).
  const learnTable = opts.devSeed ? 'analytics.b_commitment_learning_seed' : 'mart.fct_location_commitment_learning';
  const [lrows] = await bq.query({
    query: `SELECT factor, action_type, SUM(beat_count) AS beat, SUM(done_count) AS done FROM \`${PROJECT}.${learnTable}\` ` +
      `WHERE location_id=@loc${opts.devSeed ? '' : " AND source='commitment'"} GROUP BY 1, 2`,
    params: { loc }, location: 'EU',
  });
  const actionTrackByFactor: CommitmentFactorTrack[] = (lrows || [])
    .map((r: any) => ({ factor: flatVal(r.factor), action_type: flatVal(r.action_type), beat: Number(flatVal(r.beat)), done: Number(flatVal(r.done)) }))
    .filter((x: CommitmentFactorTrack) => x.factor);

  // Engine 1 action_type-level (évolution ③) — via the ONE sub-accessor (pre-explode outcomes).
  const actionTrackByType = opts.devSeed ? {} : await getActionRollup(bq, loc);

  // Tier-2 estimation priors (delta_att) — folded in, with SUPPRESS-IN-2 applied HERE (measured
  // supersedes the estimated prior per venue×factor), so the payload ships reconciled: no factor in
  // both `sensitivities` (measured) and `impacts` (estimated). Consumers never re-suppress.
  const measuredFeatures = new Set(sensitivities.map((s) => s.feature));
  const t2feats = (featureRegistry.revenue as Array<{ key: string; tier?: number[]; impact_col?: string }>).filter((f) => (f.tier || []).includes(2) && f.impact_col);
  const impacts: Record<string, number> = {};
  if (!opts.devSeed && t2feats.length) {
    const cols = [...new Set(t2feats.map((f) => f.impact_col as string))];
    const r = await one(`SELECT ${cols.join(',')} FROM \`${PROJECT}.${(featureRegistry as any).impact_table}\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d });
    t2feats.forEach((f) => { const v = Number(flatVal(r[f.impact_col as string])) || 0; if (v !== 0 && !measuredFeatures.has(f.key)) impacts[f.key] = v; });
  }

  // Engine 1 × Engine 2 decomposition — computed ONCE, claim-typed 'observed_difference'. For each
  // fittable factor: context_effect = mean residual on NO-ACTION factor-days (verified baseline),
  // net = mean residual on ACTION factor-days (any resolved+done commitment window), action_delta =
  // net − context_effect. Directional/préliminaire at current N; never a proven %.
  const decomposition: DecompositionRecord[] = [];
  if (!opts.devSeed) {
    const fitFactors = (featureRegistry.revenue as Array<{ key: string; fittable?: boolean; predicate?: string }>)
      .filter((f) => f.fittable && f.predicate && f.predicate !== 'FALSE');
    // n = INDEPENDENT engagements (distinct commitment windows overlapping factor-days), NOT the
    // autocorrelated day count. cw = commitment×date; ctx/net are daily means, nc is the independent unit.
    const sel = fitFactors.map((f, i) =>
      `AVG(IF((${f.predicate}) AND NOT is_action, residual_pct, NULL)) AS ctx_${i}, ` +
      `AVG(IF((${f.predicate}) AND is_action, residual_pct, NULL)) AS net_${i}, ` +
      `(SELECT COUNT(DISTINCT commitment_id) FROM cw JOIN resid rr ON cw.d=rr.date WHERE (${f.predicate})) AS nc_${i}`).join(', ');
    const [drows] = await bq.query({
      query:
        `WITH cw AS (SELECT ac.commitment_id, d FROM \`${PROJECT}.analytics.action_commitments\` ac, ` +
        `UNNEST(GENERATE_DATE_ARRAY(ac.window_start, ac.window_end)) d ` +
        `WHERE ac.location_id=@loc AND ac.status='resolved' AND ac.action_done_status='fait'), ` +
        `resid AS (SELECT r.date, r.residual_pct, c.* EXCEPT(date, location_id) FROM \`${PROJECT}.mart.fct_client_day_residual\` r ` +
        `JOIN \`${PROJECT}.mart.fct_location_context_daily\` c USING(location_id, date) WHERE r.location_id=@loc), ` +
        `rj AS (SELECT resid.*, resid.date IN (SELECT d FROM cw) AS is_action FROM resid) ` +
        `SELECT ${sel} FROM rj`,
      params: { loc }, location: 'EU',
    }).catch(() => [[{}]] as any[]);
    const dr = (drows || [])[0] || {};
    const DECOMP_MIN_ENGAGEMENTS = 2; // need >= 2 independent engagements to surface (honest-absence below).
    fitFactors.forEach((f, i) => {
      const n = Number(flatVal(dr[`nc_${i}`])) || 0; // INDEPENDENT engagements
      if (n < DECOMP_MIN_ENGAGEMENTS) return;
      const ctx = +(Number(flatVal(dr[`ctx_${i}`])) || 0).toFixed(2);
      const net = +(Number(flatVal(dr[`net_${i}`])) || 0).toFixed(2);
      const action_delta = +(net - ctx).toFixed(2);
      const tier = n >= 8 ? 'emergent' : 'preliminaire'; // driven off independent-N, never day count
      decomposition.push({ factor: f.key, context_effect: ctx, action_delta, net, n, tier, claim_type: 'observed_difference', cite_fr: decompositionLine({ factor: f.key, action_delta, n }) });
    });
  }

  // The LLM contract — the sayable universe. EVERY citable fact carries its claim_type so the model
  // can never upgrade an observed fact into a cause. Context facts are observed (proximity/presence/
  // ranking), never causal; the only causal-SHAPED statement allowed is a decomposition observed_difference.
  const llm = {
    citable_facts: [
      ...sensitivities.filter((s) => s.active_today).map((s) => ({ fact_fr: envTodayLine(s), claim_type: 'measured' as const })),
      ...decomposition.map((d) => ({ fact_fr: d.cite_fr, claim_type: 'observed_difference' as const })),
      ...competitors.map((c) => ({ fact_fr: fillContextFallback('concurrence_competitor', { distance: frKmFmt(c.distance_km), nom: c.name }) ?? c.name, claim_type: 'observed_proximity' as const })),
    ],
    driver: { value: flatVal(surface.driver) ?? null, claim_type: 'observed_ranking' as const }, // salience, NOT a cause
    forbidden: [
      'Ne calcule, n’agrège ni ne réconcilie aucun nombre : cite uniquement les champs du payload.',
      'Ne modifie aucun tier (préliminaire reste préliminaire ; ne dis jamais « prouvé »).',
      'AUCUN verbe causal sur AUCUN fait — y compris driver, concurrents, tourisme : jamais « a pesé / a causé / a fait baisser / a réduit / a généré la fréquentation ». Un concurrent proche = fait de proximité, pas d’impact ; le driver = classement de saillance, pas une cause ; le tourisme = présence observée.',
      'Le SEUL énoncé de forme causale autorisé est un « observed_difference » de la décomposition, formulé comme un écart observé (jamais « votre action a généré »).',
      'profile.declared_weather_sensitivity / seasonality sont des attributs DÉCLARÉS du lieu, jamais l’effet mesuré : la vérité est la sensibilité mesurée (Engine 2). Ne les présente pas comme un effet observé sur le CA.',
      'N’invente aucun facteur, chiffre ou concurrent absent du payload ; à défaut, dis « pas encore assez de recul ».',
    ],
  };

  const pr = profileRow || {};
  const num = (v: any): number | null => (v == null ? null : Number(flatVal(v)));
  const profile: VenueProfile = {
    activity_type: flatVal(pr.company_activity_type) ?? null, location_type: flatVal(pr.location_type) ?? null,
    audience: [flatVal(pr.primary_audience_1), flatVal(pr.primary_audience_2)].filter(Boolean) as string[],
    capacity_sensitivity: flatVal(pr.capacity_sensitivity) ?? null,
    declared_weather_sensitivity: num(pr.weather_sensitivity), seasonality: flatVal(pr.seasonality) ?? null,
    operating_hours: flatVal(pr.operating_hours) ?? null, venue_capacity: num(pr.venue_capacity),
    event_types: [flatVal(pr.event_type_1), flatVal(pr.event_type_2), flatVal(pr.event_type_3)].filter(Boolean) as string[],
    besttime: { rating: num(pr.besttime_rating), dwell_min: num(pr.besttime_dwell_time_min), dwell_max: num(pr.besttime_dwell_time_max) },
    top_item: { description: flatVal(pr.top_item_description) ?? null, revenue_share: num(pr.top_item_revenue_share) },
    business_description: flatVal(pr.business_short_description) ?? null,
  };

  const wHead = flatVal(weatherHead.headline_fr);
  return {
    weather: { fact_text: isCleanFrench(wHead) ? wHead : null, fact_data: {}, source: 'mart.fct_location_daily_action_candidates' },
    mobility,
    calendar: { fact_text: flatVal(surface.cal_label) ?? null, fact_data: { vacation_name: flatVal(surface.vacation_name) ?? null, holiday_name: flatVal(surface.holiday_name) ?? null }, source: 'semantic.vw_insight_event_day_surface' },
    events: (events || []).map((e: any) => ({ event_label: flatVal(e.label), distance_m: e.dist == null ? null : Number(flatVal(e.dist)), event_start_date: flatVal(e.start_date) })),
    tourism: { status: flatVal(tour.status) ?? null, peak: flatVal(tour.peak) === true },
    foreign, takeaway: flatVal(surface.key_takeaway) ?? null, driver: flatVal(surface.driver) ?? null,
    competitors, profile,
    sensitivities, actionTrackByFactor, actionTrackByType, impacts, decomposition, llm,
  };
}
