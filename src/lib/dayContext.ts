// Shared day-context assembler (fact-first). ONE source of the app's existing French context facts
// for today × venue, reused by BOTH the four-tier context-decision endpoint
// (src/pages/api/insight/reactions-today.ts) and the sales report (src/pages/api/insight/sales-report.ts).
// It REUSES the strings the app already generates (audience_availability_label, disruption title_merged,
// action-candidate headline_fr, named events) rather than re-deriving bare numbers — see
// docs/features/context-decision-service.md. It produces STRUCTURED facts (mart French where clean +
// structured data for owner copy); it authors NO French of its own.

import { formatDisruption } from './contextCopy';

const PROJECT = 'muse-square-open-data';
export const flatVal = (v: any): any => (v && typeof v === 'object' && 'value' in v ? v.value : v);

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

export interface DayContextFact { fact_text: string | null; fact_data: Record<string, any>; source: string }
export interface DayCompetitor {
  competitor_id: string; name: string; distance_km: number | null; threat_level: string | null;
  google_rating: number | null; google_rating_count: number | null; enriched: string | null;
  offering_change: string | null; rating_trend: number | null; source: string;
}
export interface DayContext {
  weather: DayContextFact; mobility: DayContextFact; calendar: DayContextFact;
  events: Array<{ event_label: string; distance_m: number | null; event_start_date: string | null }>;
  tourism: { status: string | null; peak: boolean };
  foreign: string[]; takeaway: string | null; driver: string | null;
  competitors: DayCompetitor[];
}

// Assemble today's reused French facts for one venue. Single date (range helpers above serve windows).
export async function assembleDayContext(bq: any, loc: string, date: string): Promise<DayContext> {
  const d = bq.date(date);
  const one = async (query: string, params: Record<string, any>) => {
    const [rows] = await bq.query({ query, params, location: 'EU' });
    return (rows || [])[0] || {};
  };

  const [surface, mob, disruption, weatherHead, events, foreign, tour] = await Promise.all([
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

  const wHead = flatVal(weatherHead.headline_fr);
  return {
    weather: { fact_text: isCleanFrench(wHead) ? wHead : null, fact_data: {}, source: 'mart.fct_location_daily_action_candidates' },
    mobility,
    calendar: { fact_text: flatVal(surface.cal_label) ?? null, fact_data: { vacation_name: flatVal(surface.vacation_name) ?? null, holiday_name: flatVal(surface.holiday_name) ?? null }, source: 'semantic.vw_insight_event_day_surface' },
    events: (events || []).map((e: any) => ({ event_label: flatVal(e.label), distance_m: e.dist == null ? null : Number(flatVal(e.dist)), event_start_date: flatVal(e.start_date) })),
    tourism: { status: flatVal(tour.status) ?? null, peak: flatVal(tour.peak) === true },
    foreign, takeaway: flatVal(surface.key_takeaway) ?? null, driver: flatVal(surface.driver) ?? null,
    competitors,
  };
}
