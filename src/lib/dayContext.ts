// Shared day-context assembler (fact-first). ONE source of the app's existing French context facts
// for today × venue, reused by BOTH the four-tier context-decision endpoint
// (src/pages/api/insight/reactions-today.ts) and the sales report (src/pages/api/insight/sales-report.ts).
// It REUSES the strings the app already generates (audience_availability_label, disruption title_merged,
// action-candidate headline_fr, named events) rather than re-deriving bare numbers — see
// docs/features/context-decision-service.md. It produces STRUCTURED facts (mart French where clean +
// structured data for owner copy); it authors NO French of its own.

import { formatDisruption, fillContextFallback, formatWeatherAlert, frCountry } from './contextCopy';
import { getSensitivities, type Sensitivity, type Tier } from './sensitivityStore';
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
  site_name: string | null;
  transit: { stop_name: string | null; line_name: string | null; stop_distance_m: number | null };
  enriched: { key_differentiators: string | null; current_offering: string | null }; // parsed auto_enriched_description
}

export interface DayContextFact { fact_text: string | null; fact_data: Record<string, any>; source: string }
export interface DayCompetitor {
  competitor_id: string; name: string; distance_km: number | null; threat_level: string | null;
  google_rating: number | null; google_rating_count: number | null; enriched: string | null;
  offering_change: string | null; rating_trend: number | null; source: string;
}
// The day_surface projection — every field monitor.ts renders from `vw_insight_event_day_surface`,
// so consumers read them here instead of re-querying the view. Four rendered groups.
export interface DaySurface {
  opportunity: {
    score: number | null; regime: string | null; medal: string | null;   // opportunity_score_final_local / regime / medal
    driver_label_fr: string | null;                                       // primary_score_driver_label_fr (French)
    alert_level_max: number | null; major_realization_risk: boolean;      // alert_level_max / is_major_realization_risk_flag
    mega_event_name: string | null; signal_summary_fr: string[];          // active_mega_event_name / daily_signal_summary_fr
  };
  competition: {
    events_500m: number | null; events_1km: number | null; events_5km: number | null; events_5km_same_bucket: number | null;
    pressure_ratio: number | null; index_local: number | null;
    top_competitors: Array<{ event_uid: string | null; event_label: string | null; organizer_name: string | null; theme: string | null; distance_m: number | null; estimated_attendance: number | null; event_url: string | null }>;
  };
  weather_surface: { label_fr: string | null; temp_max: number | null; temp_min: number | null; code: number | null };
  // The mart's delta_att_* attribution (dow+trend decomposition) — RENDER-ONLY. Distinct register from
  // the measured sensitivity store (`impacts`): never merged, never a citable causal fact.
  attribution: { weather_pct: number | null; mobility_pct: number | null; events_pct: number | null; calendar_pct: number | null; impact_weather_pct: number | null };
}
export type SensitivityToday = Sensitivity & { active_today: boolean };  // Engine 2
export interface CommitmentFactorTrack { factor: string; action_type: string; beat: number; done: number }
export interface DayContext {
  weather: DayContextFact; mobility: DayContextFact; calendar: DayContextFact;
  events: Array<{ event_label: string; distance_m: number | null; event_start_date: string | null }>;
  tourism: { status: string | null; peak: boolean };
  foreign: string[]; takeaway: string | null; driver: string | null; // foreign = deduped union (school ∪ public holiday origins)
  day_surface: DaySurface;                                            // opportunity/competition/weather-surface/attribution projection (monitor's `day`)
  // Phase-1 compatibility bridge: the RAW view rows (unflattened, BQ {value} shapes intact) so monitor
  // re-sources its legacy `days[]`/`data.profile` from the brain instead of re-querying the two views.
  // The single reader of day_surface + ai_location_context is now the brain. Curated fields above are the
  // claim-typed truth; these raw rows exist only to keep monitor's existing render/derivation working.
  day_surface_raw: Record<string, any> | null;                        // full vw_insight_event_day_surface row
  profile_raw: Record<string, any> | null;                            // full vw_insight_event_ai_location_context row
  commercial_events: string[];                                        // named soldes/foires today (deduped vs named events)
  // acute/operational register. The per-nature levels are what let the copy NAME the alert ("Forte
  // chaleur") instead of printing a meaningless "niveau 3" — the driver is the nature at the max.
  weather_alert: {
    level: number; apparent_temp_max: number | null; wind_gusts: number | null;
    lvl_heat: number | null; lvl_cold: number | null; lvl_rain: number | null; lvl_snow: number | null; lvl_wind: number | null;
  } | null;
  competitors: DayCompetitor[];
  // Engines + context tiers folded into the brain — consumers read these from the payload, never from
  // the store / learning / opportunity marts.
  sensitivities: SensitivityToday[];                                  // Engine 2 (measured); filter active_today as needed
  actionTrackByFactor: CommitmentFactorTrack[];                       // Engine 1 factor-level (Tier 4), from the dbt learning mart
  actionTrackByType: Record<string, { beat: number; done: number }>; // Engine 1 action_type-level (évolution ③), pre-explode outcomes
  impacts: Record<string, number>;                                    // Tier-2 estimation priors (delta_att_*) keyed by factor — SUPPRESS-IN-2 applied (measured factors dropped)
  profile: VenueProfile;                                              // static per-location venue profile (user context)
  decomposition: DecompositionRecord[];                               // Engine 1 × Engine 2, pre-computed + claim-typed
  // signals[] = the "what fired / what changed" register — DISTINCT grain from context{} (change-grain,
  // not day-grain). Reused from detection (never re-detected). Two sub-registers, both claim-typed.
  signals: {
    changes: Array<{ change_type: string | null; change_subtype: string | null; alert_level: number | null; score_delta: number | null; direction: string | null; event_label: string | null; distance_m: number | null; claim_type: 'observed_change' }>;
    cards: Array<{ action_type: string | null; action_category: string | null; action_priority: number | null; confidence_tier: string | null; headline_fr: string | null; detail_fr: string | null; claim_type: 'observed' }>;
  };
  // the LLM contract: every citable fact carries its claim_type; driver is a salience RANKING (not a cause).
  llm: {
    citable_facts: Array<{ fact_fr: string; claim_type: 'measured' | 'observed_difference' | 'observed_proximity' | 'observed_presence' | 'observed_acute' | 'observed_change' | 'observed' }>;
    driver: { value: string | null; claim_type: 'observed_ranking' };
    forbidden: string[];
  };
}

// In-process memo of the assembled payload. It is a pure function of the warehouse state for a given
// (location, date, slice, devSeed), and the warehouse only advances on daily / detection refresh — so a
// short TTL dedupes the several consumers that assemble the same day in one request cycle (monitor +
// reactions-today + sensitivities) without staling intra-day detection updates. Concurrent callers share
// the in-flight promise; a rejection is evicted so a transient failure is never cached.
const _ctxCache = new Map<string, { p: Promise<DayContext>; ts: number }>();
const CTX_TTL_MS = 120_000; // 2 min

// Assemble today's reused French facts + Engine 1/2 records for one venue. Single date (range helpers
// above serve windows). opts.devSeed swaps the store/learning to demo fixtures (?src=seed). This is the
// ONE brain: every consumer reads its payload; none reads the sensitivity store or learning marts directly.
export function assembleDayContext(bq: any, loc: string, date: string, opts: { devSeed?: boolean; slice?: 'full' | 'context' | 'brief' | 'signals' } = {}): Promise<DayContext> {
  const slice = opts.slice ?? 'full';
  const seed = opts.devSeed ? 1 : 0;
  const now = Date.now();
  // Slice-aware: a BROADER cached payload supersets a narrower request (full ⊇ context ⊇ signals), so a
  // 'context' request reuses a live 'full' entry. Narrower never serves broader. SCOPE: in-process only.
  // The GUARANTEED win is within a single invocation (monitor's multi-date calls + repeat reads in a warm
  // process). On Vercel, monitor / reactions-today / sensitivities are SEPARATE invocations, so cross-
  // endpoint collapse is best-effort (only if they land on the same warm instance) — a shared cache
  // (Redis/KV) is the path to guaranteed cross-endpoint sharing, deferred.
  const superset: Record<string, string[]> = { signals: ['full', 'context', 'brief', 'signals'], brief: ['full', 'context', 'brief'], context: ['full', 'context'], full: ['full'] };
  for (const s of superset[slice]) {
    const hit = _ctxCache.get(`${loc}|${date}|${s}|${seed}`);
    if (hit && now - hit.ts < CTX_TTL_MS) return hit.p;
  }
  const key = `${loc}|${date}|${slice}|${seed}`;
  const p = assembleDayContextUncached(bq, loc, date, opts);
  _ctxCache.set(key, { p, ts: now });
  p.catch(() => { if (_ctxCache.get(key)?.p === p) _ctxCache.delete(key); });
  return p;
}

async function assembleDayContextUncached(bq: any, loc: string, date: string, opts: { devSeed?: boolean; slice?: 'full' | 'context' | 'brief' | 'signals' } = {}): Promise<DayContext> {
  // Scoped slices from the ONE composition (no parallel read path). A light surface skips the
  // expensive reads: 'signals' = signals[] + driver only; 'context' = context{} (no Engine-1/decomp);
  // 'full' (default) = everything. Grains stay separate regardless of slice.
  const wantContext = opts.slice !== 'signals';                 // Engine 2 (measured) + competitors + context facts
  const wantEngines = (opts.slice ?? 'full') === 'full';        // Engine 1 (learning/outcomes) + decomposition (the heavy reads)
  // 'brief' (Point du jour / cron) = context minus the heaviest extras: skips competitor ENRICHMENT
  // (rating/offering/snapshot — 2 live reads) and the delta_att estimation, keeping driver + signals +
  // key context facts + measured sensitivity. Fewer BQ reads per location = affordable across all users.
  const heavyCtx = opts.slice === 'full' || opts.slice === 'context';
  const wantCompEnrich = heavyCtx;                              // competitor ratings/offering/snapshot (Phase 1b extras)
  const wantEstimation = heavyCtx;                              // delta_att Tier-2 estimation (impacts)
  const d = bq.date(date);
  const one = async (query: string, params: Record<string, any>) => {
    const [rows] = await bq.query({ query, params, location: 'EU' });
    return (rows || [])[0] || {};
  };

  const [surface, mob, disruption, weatherHead, events, foreign, tour, profileRow, commRows, weatherAcute, pubHolRows, changeRows, cardRows] = await Promise.all([
    // day_surface — the mart's own French facts + "what's driving today". This is the SAME view
    // monitor.ts builds its entire `day` object from. SELECT * so the brain is the single reader: its
    // curated projection (opportunity/competition/weather-surface/attribution) reads named fields off the
    // row, and the whole row is exposed as `day_surface_raw` for monitor's legacy passthrough (Phase 1).
    // The two aliases (driver/cal_label) are added alongside * for the brain's own reads.
    one(`SELECT *, primary_score_driver_label AS driver, audience_availability_label AS cal_label
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
    // The brain is the single reader of this view: the curated VenueProfile reads named fields and the row
    // is exposed as `profile_raw` (monitor's legacy `data.profile`). Explicit projection = the USED-column
    // union (monitor's 40 + the brain's top_item extras) to trim the cold path; SAFE_OFFSET reproduces
    // monitor's scalar transform on the ARRAY column nearest_transit_line_name.
    one(`SELECT location_id, location_type, client_industry_code, location_access_pattern, origin_city_ids,
           company_activity_type, event_time_profile, primary_audience_1, primary_audience_2, capacity_sensitivity,
           geographic_catchment, company_industry, business_short_description, website_url, instagram_url,
           facebook_url, review_link, latitude, longitude, city_name, region_name, nearest_transit_stop_name,
           nearest_transit_line_name[SAFE_OFFSET(0)] AS nearest_transit_line_name, nearest_transit_stop_distance_m,
           is_primary, site_name, venue_capacity, event_type_1, event_type_2, event_type_3, weather_sensitivity,
           seasonality, main_event_objective, operating_hours, auto_enriched_description, besttime_venue_id,
           besttime_venue_type, besttime_rating, besttime_dwell_time_min, besttime_dwell_time_max,
           top_item_description, top_item_revenue_share
         FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\` WHERE location_id=@loc LIMIT 1`, { loc }),
    // commercial events (region annotations) for today — named soldes/foires (observed presence)
    (async () => { const [r] = await bq.query({ query: `SELECT ev.event_name AS name FROM \`${PROJECT}.mart.fct_region_day_annotations_daily\` a JOIN \`${PROJECT}.dims.dim_client_location\` dl ON dl.region_name=a.region_name CROSS JOIN UNNEST(a.commercial_events) ev WHERE dl.location_id=@loc AND a.date=@d`, params: { loc, d }, location: 'EU' }).catch(() => [[]] as any[]); return r || []; })(),
    // acute weather (operational trigger) — alert level + apparent temp + gusts. Distinct register.
    one(`SELECT al.alert_level_max AS level,
                al.lvl_heat, al.lvl_cold, al.lvl_rain, al.lvl_snow, al.lvl_wind,
                f.apparent_temperature_max AS atemp, f.wind_gusts_10m_max AS gusts
         FROM \`${PROJECT}.mart.fct_location_weather_alerts_daily\` al
         LEFT JOIN \`${PROJECT}.mart.fct_location_weather_forecast_daily_detail\` f ON f.location_id=al.location_id AND f.date=al.date
         WHERE al.location_id=@loc AND al.date=@d LIMIT 1`, { loc, d }),
    // public-holiday foreign origins today (union+dedup with the school-holiday origins below)
    (async () => { const [r] = await bq.query({ query: `SELECT c.country_name_en AS country FROM \`${PROJECT}.mart.fct_foreign_tourism_context_daily\` t, UNNEST(t.countries_on_public_holiday) c WHERE t.date=@d AND c.country_name_en IN UNNEST(@tc)`, params: { d, tc: TOURIST_COUNTRIES }, location: 'EU' }).catch(() => [[]] as any[]); return r || []; })(),
    // SIGNALS — reused from DETECTION (never re-detected). change feed (the delta / what changed):
    (async () => { const [r] = await bq.query({ query: `SELECT change_type, change_subtype, alert_level, score_delta, direction, event_label, distance_m FROM \`${PROJECT}.semantic.vw_insight_event_change_feed\` WHERE location_id=@loc AND affected_date=@d ORDER BY alert_level DESC, ABS(score_delta) DESC LIMIT 12`, params: { loc, d }, location: 'EU' }).catch(() => [[]] as any[]); return r || []; })(),
    // action candidates (the detected cards, claim-safe headline_fr/detail_fr):
    (async () => { const [r] = await bq.query({ query: `SELECT action_type, action_category, action_priority, confidence_tier, headline_fr, detail_fr FROM \`${PROJECT}.semantic.vw_insight_event_action_candidates\` WHERE location_id=@loc AND date=@d ORDER BY action_priority DESC LIMIT 12`, params: { loc, d }, location: 'EU' }).catch(() => [[]] as any[]); return r || []; })(),
  ]);

  // Top-3 followed competitors, proximity-aware (threat_score is NOT distance-weighted), + rating/enriched.
  const [compRows] = wantContext ? await bq.query({
    query:
      `SELECT tp.competitor_id AS cid, tp.competitor_name AS name, tp.distance_km AS km, tp.threat_level AS threat_level, ` +
      `dir.google_rating AS rating, dir.google_rating_count AS rating_count, ` +
      `JSON_VALUE(dir.auto_enriched_description, '$.business_description') AS enriched ` +
      `FROM \`${PROJECT}.mart.fct_competitor_threat_profile\` tp ` +
      `LEFT JOIN \`${PROJECT}.mart.fct_competitor_directory\` dir USING(competitor_id) ` +
      `WHERE tp.is_followed AND tp.location_id=@loc AND tp.distance_km IS NOT NULL ` +
      `ORDER BY tp.threat_score/(1+tp.distance_km/5) DESC LIMIT 3`,
    params: { loc }, location: 'EU',
  }) : [[]] as any[];
  const cids = (compRows || []).map((c: any) => flatVal(c.cid));
  // offering changes + rating trends for those competitors (live tables; empty for offering-less verticals)
  const offeringByCid: Record<string, string> = {};
  const trendByCid: Record<string, number> = {};
  if (cids.length && wantCompEnrich) {
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
  // Engine 2 — measured sensitivities (Tier 1), via the one typed accessor. Part of context{} (cheap store read).
  const sensRaw = wantContext ? await getSensitivities(bq, loc, { metric: 'revenue', storeTable: opts.devSeed ? 'analytics.b_demo_sensitivity' : undefined }) : [];
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
  const [lrows] = wantEngines ? await bq.query({
    query: `SELECT factor, action_type, SUM(beat_count) AS beat, SUM(done_count) AS done FROM \`${PROJECT}.${learnTable}\` ` +
      `WHERE location_id=@loc${opts.devSeed ? '' : " AND source='commitment'"} GROUP BY 1, 2`,
    params: { loc }, location: 'EU',
  }) : [[]] as any[];
  const actionTrackByFactor: CommitmentFactorTrack[] = (lrows || [])
    .map((r: any) => ({ factor: flatVal(r.factor), action_type: flatVal(r.action_type), beat: Number(flatVal(r.beat)), done: Number(flatVal(r.done)) }))
    .filter((x: CommitmentFactorTrack) => x.factor);

  // Engine 1 action_type-level (évolution ③) — via the ONE sub-accessor (pre-explode outcomes).
  const actionTrackByType = (wantEngines && !opts.devSeed) ? await getActionRollup(bq, loc) : {};

  // Tier-2 estimation priors (delta_att) — folded in, with SUPPRESS-IN-2 applied HERE (measured
  // supersedes the estimated prior per venue×factor), so the payload ships reconciled: no factor in
  // both `sensitivities` (measured) and `impacts` (estimated). Consumers never re-suppress.
  const measuredFeatures = new Set(sensitivities.map((s) => s.feature));
  const t2feats = (featureRegistry.revenue as Array<{ key: string; tier?: number[]; impact_col?: string }>).filter((f) => (f.tier || []).includes(2) && f.impact_col);
  const impacts: Record<string, number> = {};
  if (wantContext && wantEstimation && !opts.devSeed && t2feats.length) {
    const cols = [...new Set(t2feats.map((f) => f.impact_col as string))];
    const r = await one(`SELECT ${cols.join(',')} FROM \`${PROJECT}.${(featureRegistry as any).impact_table}\` WHERE location_id=@loc AND date=@d LIMIT 1`, { loc, d });
    t2feats.forEach((f) => { const v = Number(flatVal(r[f.impact_col as string])) || 0; if (v !== 0 && !measuredFeatures.has(f.key)) impacts[f.key] = v; });
  }

  // Engine 1 × Engine 2 decomposition — computed ONCE, claim-typed 'observed_difference'. For each
  // fittable factor: context_effect = mean residual on NO-ACTION factor-days (verified baseline),
  // net = mean residual on ACTION factor-days (any resolved+done commitment window), action_delta =
  // net − context_effect. Directional/préliminaire at current N; never a proven %.
  const decomposition: DecompositionRecord[] = [];
  if (wantEngines && !opts.devSeed) {
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

  // Reservoir facts (observed, claim-typed, honest-absent when empty):
  // commercial events (soldes/foires) — deduped against the named topn events so a foire never shows twice.
  const topnNames = new Set((events || []).map((e: any) => String(flatVal(e.label) ?? '').toLowerCase()));
  const commercial_events = [...new Set((commRows || []).map((r: any) => flatVal(r.name)).filter(Boolean) as string[])]
    .filter((n) => !topnNames.has(String(n).toLowerCase()));
  // acute weather — operational trigger, only for a meaningful alert (>=3). DISTINCT register from the
  // measured heat sensitivity; NOT suppress-in-2'd against it (complementary, not two heat numbers).
  const wLevel = weatherAcute.level == null ? null : Number(flatVal(weatherAcute.level));
  const wLvl = (k: string) => {
    const v = (weatherAcute as any)?.[k];
    return v == null ? null : Number(flatVal(v));
  };
  const weather_alert = (wLevel != null && wLevel >= 3)
    ? {
        level: wLevel,
        apparent_temp_max: weatherAcute.atemp == null ? null : Number(flatVal(weatherAcute.atemp)),
        wind_gusts: weatherAcute.gusts == null ? null : Number(flatVal(weatherAcute.gusts)),
        lvl_heat: wLvl('lvl_heat'), lvl_cold: wLvl('lvl_cold'), lvl_rain: wLvl('lvl_rain'),
        lvl_snow: wLvl('lvl_snow'), lvl_wind: wLvl('lvl_wind'),
      }
    : null;
  // foreign origins — deduped UNION of school-holiday (foreign) + public-holiday origins.
  const foreignUnion = [...new Set([...(foreign || []), ...((pubHolRows || []).map((r: any) => flatVal(r.country)))].filter(Boolean) as string[])].map(frCountry);

  // signals — reused from detection, claim-typed, DISTINCT grain from context{} (change-grain).
  const changes = (changeRows || []).map((r: any) => ({
    change_type: flatVal(r.change_type) ?? null, change_subtype: flatVal(r.change_subtype) ?? null,
    alert_level: r.alert_level == null ? null : Number(flatVal(r.alert_level)),
    score_delta: r.score_delta == null ? null : Number(flatVal(r.score_delta)), direction: flatVal(r.direction) ?? null,
    event_label: flatVal(r.event_label) ?? null, distance_m: r.distance_m == null ? null : Number(flatVal(r.distance_m)),
    claim_type: 'observed_change' as const,
  }));
  const cards = (cardRows || []).map((r: any) => ({
    action_type: flatVal(r.action_type) ?? null, action_category: flatVal(r.action_category) ?? null,
    action_priority: r.action_priority == null ? null : Number(flatVal(r.action_priority)),
    confidence_tier: flatVal(r.confidence_tier) ?? null, headline_fr: flatVal(r.headline_fr) ?? null,
    detail_fr: flatVal(r.detail_fr) ?? null, claim_type: 'observed' as const,
  }));
  const signals = { changes, cards };

  // The LLM contract — the sayable universe. EVERY citable fact carries its claim_type so the model
  // can never upgrade an observed fact into a cause. Context facts are observed (proximity/presence/
  // acute/ranking), never causal; the only causal-SHAPED statement allowed is a decomposition observed_difference.
  const llm = {
    citable_facts: [
      // `tier` rides along on the two ENGINE-BACKED claim types only (Phase 1 #5). Engine 2's field is
      // `confidence_tier`; the decomposition's is `tier` (set off independent-N at line ~414). Both were
      // computed here already and dropped at this mapping — the model never saw the register its facts
      // rest on, so it could not label a causal claim with it. No other fact type gets a tier: proximity /
      // presence / acute have no measurement to be confident about.
      ...sensitivities.filter((s) => s.active_today).map((s) => ({ fact_fr: envTodayLine(s), claim_type: 'measured' as const, tier: s.confidence_tier })),
      ...decomposition.map((d) => ({ fact_fr: d.cite_fr, claim_type: 'observed_difference' as const, tier: d.tier as Tier })),
      ...competitors.map((c) => ({ fact_fr: fillContextFallback('concurrence_competitor', { distance: frKmFmt(c.distance_km), nom: c.name }) ?? c.name, claim_type: 'observed_proximity' as const })),
      ...commercial_events.map((n) => ({ fact_fr: fillContextFallback('commercial_event', { nom: n }) ?? n, claim_type: 'observed_presence' as const })),
      ...(weather_alert ? [{ fact_fr: formatWeatherAlert(weather_alert), claim_type: 'observed_acute' as const }] : []),
      ...(foreignUnion.length ? [{ fact_fr: fillContextFallback('foreign_origins', { pays: foreignUnion.join(', ') }) ?? foreignUnion.join(', '), claim_type: 'observed_presence' as const }] : []),
      ...cards.filter((c: typeof cards[number]) => isCleanFrench(c.headline_fr)).map((c: typeof cards[number]) => ({ fact_fr: c.headline_fr as string, claim_type: 'observed' as const })), // detected cards (claim-safe headline)
      ...changes.filter((c: typeof changes[number]) => c.event_label).map((c: typeof changes[number]) => ({ fact_fr: fillContextFallback('signal_change', { label: c.event_label as string }) ?? (c.event_label as string), claim_type: 'observed_change' as const })), // named changes
    ],
    driver: { value: flatVal(surface.driver) ?? null, claim_type: 'observed_ranking' as const }, // salience, NOT a cause
    forbidden: [
      // Bounded arithmetic (Phase 1 #4): the ONE licensed operation is a same-unit sum/difference of two
      // numbers from CITED facts — the validator recomputes it and rejects any figure it cannot reproduce.
      'Ne calcule, n’agrège ni ne réconcilie aucun nombre, à UNE exception près : tu peux énoncer la somme ou l’écart de DEUX nombres de même unité pris dans des faits que tu cites (cited_fact_ids) — le résultat exact, sans arrondi. Tout autre calcul (pourcentage, conversion, comptage, arrondi) reste interdit : cite uniquement les champs du payload.',
      'Ne modifie aucun tier (préliminaire reste préliminaire ; ne dis jamais « prouvé »).',
      'AUCUN verbe causal sur un fait SANS tier — y compris driver, concurrents, tourisme, météo, cartes : jamais « a pesé / a causé / a fait baisser / a réduit / a généré la fréquentation ». Un concurrent proche = fait de proximité, pas d’impact ; le driver = classement de saillance, pas une cause ; le tourisme = présence observée. Ces faits n’ont pas de tier : aucun verbe causal ne leur est jamais applicable.',
      // Phase 1 #5 — the tiered causal register. The carve-out was previously "an observed_difference,
      // phrased as an observed gap" (i.e. never with a real causal verb). It now licenses the verb itself,
      // but ONLY on an engine-backed fact the model cites AND labels with that fact's own tier. The
      // validator enforces both conditions per sentence.
      'Un verbe causal n’est autorisé QUE sur un fait « measured » ou « observed_difference » que tu CITES dans cited_fact_ids, ET UNIQUEMENT si la phrase porte le tier EXACT de ce fait (« préliminaire », « émergent » ou « établi », tel qu’il t’est donné dans le champ "tier"). Ex. : « la forte chaleur a fait baisser votre CA — effet mesuré, préliminaire ». Sans fait cité de ce type, ou sans son tier dans la MÊME phrase, aucun verbe causal.',
      'Aucune PROMESSE de résultat futur, jamais, quel que soit le tier : jamais « augmentera / boostera / rapportera / fera venir ». Un effet mesuré au passé ne garantit aucun résultat à venir.',
      'profile.declared_weather_sensitivity / seasonality sont des attributs DÉCLARÉS du lieu, jamais l’effet mesuré : la vérité est la sensibilité mesurée (Engine 2). Ne les présente pas comme un effet observé sur le CA.',
      'profile.activity_type / location_type / event_types sont des descripteurs DÉCLARÉS, PEU FIABLES (souvent génériques ou erronés) : ne produis jamais de conseil au mauvais vertical à partir d’eux. La justesse verticale vient des concurrents nommés, pas du profil.',
      'signals (change_feed + cartes) sont des faits OBSERVÉS (ex: un concurrent a baissé son prix, une carte s’est déclenchée), JAMAIS une cause de ton résultat : ne dis jamais « ce qui a causé votre baisse ». Un changement détecté (grain change) est distinct du contexte (grain jour) — ne les fusionne pas.',
      'N’invente aucun facteur, chiffre ou concurrent absent du payload ; à défaut, dis « pas encore assez de recul ».',
    ],
  };

  const pr = profileRow || {};
  const num = (v: any): number | null => (v == null ? null : Number(flatVal(v)));
  // parse the enriched crawl blob (JSON string on the profile row) — same shape insight.astro reads.
  const enrichedRaw = flatVal(pr.auto_enriched_description);
  let enrichedObj: any = {};
  try { enrichedObj = typeof enrichedRaw === 'string' ? JSON.parse(enrichedRaw) : (enrichedRaw || {}); } catch { enrichedObj = {}; }
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
    site_name: flatVal(pr.site_name) ?? null,
    transit: {
      stop_name: flatVal(pr.nearest_transit_stop_name) ?? null,
      line_name: flatVal(pr.nearest_transit_line_name) ?? null,
      stop_distance_m: num(pr.nearest_transit_stop_distance_m),
    },
    enriched: {
      key_differentiators: enrichedObj?.key_differentiators ?? null,
      current_offering: enrichedObj?.current_offering ?? null,
    },
  };

  // day_surface projection — shape the rendered groups from the (already-fetched) surface row.
  const sNum = (v: any): number | null => { const x = flatVal(v); return x == null || x === '' ? null : Number(x); };
  const day_surface: DaySurface = {
    opportunity: {
      score: sNum(surface.opportunity_score_final_local), regime: flatVal(surface.opportunity_regime) ?? null,
      medal: flatVal(surface.opportunity_medal) ?? null, driver_label_fr: flatVal(surface.primary_score_driver_label_fr) ?? null,
      alert_level_max: sNum(surface.alert_level_max), major_realization_risk: flatVal(surface.is_major_realization_risk_flag) === true,
      mega_event_name: flatVal(surface.active_mega_event_name) ?? null,
      signal_summary_fr: (flatVal(surface.daily_signal_summary_fr) || []).map((x: any) => flatVal(x)).filter(Boolean) as string[],
    },
    competition: {
      events_500m: sNum(surface.events_within_500m_count), events_1km: sNum(surface.events_within_1km_count),
      events_5km: sNum(surface.events_within_5km_count), events_5km_same_bucket: sNum(surface.events_within_5km_same_bucket_count),
      pressure_ratio: sNum(surface.competition_pressure_ratio), index_local: sNum(surface.competition_index_local),
      top_competitors: (flatVal(surface.top_competitors) || []).map((r: any) => {
        const e = flatVal(r?.e) ?? r?.e ?? {};
        return {
          event_uid: flatVal(e.event_uid) ?? null, event_label: flatVal(e.event_label) ?? null,
          organizer_name: flatVal(e.organizer_name) ?? null, theme: flatVal(e.theme) ?? null,
          distance_m: sNum(e.distance_m), estimated_attendance: sNum(e.estimated_attendance), event_url: flatVal(e.event_url) ?? null,
        };
      }),
    },
    weather_surface: {
      label_fr: flatVal(surface.weather_label_fr) ?? null, temp_max: sNum(surface.temperature_2m_max),
      temp_min: sNum(surface.temperature_2m_min), code: sNum(surface.weather_code),
    },
    attribution: {
      weather_pct: sNum(surface.delta_att_weather_total_pct), mobility_pct: sNum(surface.delta_att_mobility_pct),
      events_pct: sNum(surface.delta_att_events_pct), calendar_pct: sNum(surface.delta_att_calendar_pct),
      impact_weather_pct: sNum(surface.impact_weather_pct),
    },
  };

  const wHead = flatVal(weatherHead.headline_fr);
  return {
    weather: { fact_text: isCleanFrench(wHead) ? wHead : null, fact_data: {}, source: 'mart.fct_location_daily_action_candidates' },
    mobility,
    calendar: { fact_text: flatVal(surface.cal_label) ?? null, fact_data: { vacation_name: flatVal(surface.vacation_name) ?? null, holiday_name: flatVal(surface.holiday_name) ?? null }, source: 'semantic.vw_insight_event_day_surface' },
    events: (events || []).map((e: any) => ({ event_label: flatVal(e.label), distance_m: e.dist == null ? null : Number(flatVal(e.dist)), event_start_date: flatVal(e.start_date) })),
    tourism: { status: flatVal(tour.status) ?? null, peak: flatVal(tour.peak) === true },
    foreign: foreignUnion, takeaway: flatVal(surface.key_takeaway) ?? null, driver: flatVal(surface.driver) ?? null,
    day_surface,
    day_surface_raw: wantContext ? (surface && Object.keys(surface).length ? surface : null) : null,
    profile_raw: profileRow && Object.keys(profileRow).length ? profileRow : null,
    commercial_events, weather_alert,
    competitors, profile, signals,
    sensitivities, actionTrackByFactor, actionTrackByType, impacts, decomposition, llm,
  };
}
