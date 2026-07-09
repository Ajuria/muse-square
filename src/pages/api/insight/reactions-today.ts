import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
import { getSensitivities, type Sensitivity } from '../../../lib/sensitivityStore';
import { FEATURE_FR, envTodayLine, actionLine, moveLine, trackRecordQualifies, type TrackRecord } from '../../../lib/sensitivityCopy';
import featureRegistry from '../../../lib/sensitivityFeatures.json';
import { assembleDayContext, type DayContextFact } from '../../../lib/dayContext';
import { fillContextFallback, CONTEXT_LABELS } from '../../../lib/contextCopy';

// French distance formatting (JJ/MM style number rules — comma decimal). Formatting, not copy.
const frKm = (km: number | null): string => km == null ? '' : (km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : String(Math.round(km))) + ' km';

export const prerender = false;
const PROJECT = 'muse-square-open-data';
const flat = (v: any): any => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const json = (b: unknown, s = 200): Response => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

// feature -> the today's-context expression that means "the factor is active today". This is the
// today-conditional join: only factors present today surface (contract). SINGLE SOURCE: the same
// registry (src/lib/sensitivityFeatures.json) drives the engine fit list and the matrix build, so
// this map can never drift from them. The predicate is evaluated against fct_location_context_daily
// below. (major_event's predicate is FALSE while it is an A3 placeholder -> never active.)
const ACTIVE_EXPR: Record<string, string> = Object.fromEntries(
  (featureRegistry.revenue as Array<{ key: string; predicate?: string }>).filter((f) => f.predicate).map((f) => [f.key, f.predicate as string]),
);

// ── Four-tier context-decision assembly (see docs/features/context-decision-service.md) ──
// Four provenance-labelled tiers, NEVER merged. Numbers are pulled from marts, never blended.
type RegEntry = { key: string; label_key?: string; tier?: number[]; fittable?: boolean; predicate?: string; impact_col?: string; mechanism?: string };
const REG = featureRegistry.revenue as RegEntry[];
const IMPACT_TABLE = (featureRegistry as any).impact_table as string; // fct_location_opportunity_components_daily
const labelKey = (k: string): string => REG.find((f) => f.key === k)?.label_key || k;
// Fine registry factor -> its coarse theme (the granularity a commitment's origin_factor carries).
// Derived from the registry's own `mechanism` (single source) — matches recoThemeMap theme ids.
const MECHANISM_THEME: Record<string, string> = { weather_footfall: 'meteo', access_friction: 'mobilite', tourist_footfall: 'tourisme', calendar_demand: 'calendrier', local_demand: 'fenetres' };
const themeOf = (k: string): string | null => MECHANISM_THEME[REG.find((f) => f.key === k)?.mechanism || ''] || null;

async function assembleTiers(
  bq: any, loc: string, date: string, sens: Sensitivity[], active: Sensitivity[], devSeed: boolean,
) {
  // Tier 1 — Mesuré (learned, active today). effect as a signed % — the copy layer words it.
  const mesure = active.map((s) => ({
    tier: 1, feature: s.feature, label_key: labelKey(s.feature), direction: s.direction,
    effect_pct: +(s.effect_size * 100).toFixed(1), n_days: s.n_days, consistency_pct: s.consistency_pct,
    period_start: s.period_start, period_end: s.period_end,
    display: envTodayLine(s), // owner copy (sensitivityCopy)
    provenance: 'mesure', source: 'analytics.b_sensitivity_store',
  }));

  // suppress-in-2 (per venue × factor): any factor MEASURED for this venue hides its Tier-2 prior.
  const measuredFeatures = new Set(sens.map((s) => s.feature));

  // FACT-FIRST: reuse the app's existing French facts (dayContext) — delta_att is only the impact
  // appended. Never a bare number. devSeed skips the real marts.
  let estimation: any[] = [];
  const concurrence: any[] = [];
  let summary: { takeaway: string | null; driver: string | null } = { takeaway: null, driver: null };
  const t2 = REG.filter((f) => (f.tier || []).includes(2) && f.impact_col);
  if (!devSeed) {
    const [ocRows] = await bq.query({
      query: `SELECT ${[...new Set(t2.map((f) => f.impact_col as string))].join(',')} FROM \`${PROJECT}.${IMPACT_TABLE}\` WHERE location_id=@loc AND date=@d LIMIT 1`,
      params: { loc, d: bq.date(date) }, location: 'EU',
    });
    const oc = (ocRows || [])[0] || {};
    const dc = await assembleDayContext(bq, loc, date);
    summary = { takeaway: dc.takeaway, driver: dc.driver };

    // each estimation factor's FACT comes from the existing layer; delta_att is the impact appended.
    const eventsFact: DayContextFact = { fact_text: null, fact_data: { events: dc.events }, source: 'mart.fct_location_events_topn_daily' };
    const factOf = (key: string): DayContextFact =>
      (['heat', 'rain', 'cold', 'wind', 'snow'].includes(key)) ? dc.weather
        : key === 'mobility_disruption' ? dc.mobility
          : key === 'calendar' ? dc.calendar
            : key === 'events' ? eventsFact
              : { fact_text: null, fact_data: {}, source: IMPACT_TABLE };

    estimation = t2
      .filter((f) => !measuredFeatures.has(f.key)) // suppress-in-2
      .map((f) => ({ f, v: Number(flat(oc[f.impact_col as string])) || 0 }))
      .filter((x) => x.v !== 0)
      .map(({ f, v }) => {
        const fact = factOf(f.key);
        return {
          tier: 2, feature: f.key, label_key: labelKey(f.key), fact_text: fact.fact_text, fact_data: fact.fact_data,
          display: fact.fact_text ?? fillContextFallback(labelKey(f.key)) ?? fillContextFallback(f.key), // reused mart fact, else owner fallback
          impact_pct: +v.toFixed(1), provenance: 'estimation', source: fact.source,
        };
      });

    // Tier 3 — Concurrence (observed facts; NO impact number). Top-3 proximity-aware, reused via
    // dayContext (name/distance/threat/rating/enriched + offering-change / rating-trend where populated).
    concurrence.push(...dc.competitors.map((c) => ({
      tier: 3, kind: 'competitor', label_key: 'concurrence_competitor', name: c.name, distance_km: c.distance_km,
      threat_level: c.threat_level, google_rating: c.google_rating, google_rating_count: c.google_rating_count,
      enriched: c.enriched, offering_change: c.offering_change, rating_trend: c.rating_trend,
      display: fillContextFallback('concurrence_competitor', { distance: frKm(c.distance_km), nom: c.name }) ?? c.name, // owner template
      provenance: 'observe', source: c.source,
    })));
  }

  // Tier 4 — Ce qui a marché pour vous (measured ACTION track record, Engine 1), factor-keyed via
  // origin_factor. DEFAULT = the real mart.fct_location_commitment_learning (empty until real
  // resolved+done commitments flow → honest labelled-absent). Dev fallback only = the seed fixture.
  // Matched to today's factors (Tiers 1–2), tolerant on granularity (exact fine key OR the factor's
  // theme, since a commitment's origin_factor is theme-level), reconduire-gated (never "prouvé").
  const activeFactors = [...new Set<string>([...mesure.map((m) => m.feature), ...estimation.map((e: any) => e.feature)])];
  const activeFactorSet = new Set(activeFactors);
  const activeThemes = new Set(activeFactors.map(themeOf).filter(Boolean) as string[]);
  const TRACK_TABLE = devSeed ? 'analytics.b_commitment_learning_seed' : 'mart.fct_location_commitment_learning';
  // roll up beat/done across window_days (and any sub-grain) per (origin_factor, action_type).
  const [trRows] = await bq.query({
    query: `SELECT origin_factor AS factor, action_type, SUM(beat_count) AS beat, SUM(done_count) AS done ` +
      `FROM \`${PROJECT}.${TRACK_TABLE}\` WHERE location_id=@loc${devSeed ? '' : " AND source='commitment'"} GROUP BY 1, 2`,
    params: { loc }, location: 'EU',
  });
  const actionLines = (trRows || [])
    .map((r: any) => ({ factor: flat(r.factor) as string, tr: { action_type: flat(r.action_type), beat: Number(flat(r.beat)), done: Number(flat(r.done)) } as TrackRecord }))
    .filter((x: any) => x.factor && (activeFactorSet.has(x.factor) || activeThemes.has(x.factor)) && trackRecordQualifies(x.tr))
    .map((x: any) => ({
      tier: 4, feature: x.factor, label_key: labelKey(x.factor), action_type: x.tr.action_type, beat: x.tr.beat, done: x.tr.done,
      display: actionLine(x.tr), move: moveLine(x.tr), provenance: 'mesure_action', source: TRACK_TABLE,
    }));
  const action = actionLines.length ? actionLines : { present: false, reason: 'bridge_absent', source: 'mart.fct_location_commitment_learning' };

  return { summary, mesure, estimation, concurrence, action };
}

// Type B (environment) × Type A (your action track record), joined to TODAY's active factors.
// Two labeled registers, never merged. The move fires only when a real Type A track record
// qualifies (reconduire gate); no lever -> environment half alone, never a fabricated move.
export const GET: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const url = new URL(request.url);
  const devSeed = import.meta.env.DEV && url.searchParams.get('src') === 'seed';
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const reqLoc = url.searchParams.get('location_id');
  let loc: string;
  if (reqLoc) {
    if (!devSeed && reqLoc !== activeLoc && !owned.includes(reqLoc)) return json({ ok: false, error: 'LOCATION_FORBIDDEN' }, 403);
    loc = reqLoc;
  } else if (activeLoc) { loc = activeLoc; } else { return json({ ok: false, error: 'NO_LOCATION' }, 400); }
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

  const bq = makeBQClient(PROJECT);
  try {
    // Engine 2 — sensitivities. devSeed reads the demo fixture; prod reads the real (empty) store.
    const sens: Sensitivity[] = await getSensitivities(bq, loc, {
      metric: 'revenue', storeTable: devSeed ? 'analytics.b_demo_sensitivity' : undefined,
    });

    // today-conditional join: keep only factors active today.
    let active = sens;
    if (devSeed) {
      // demo: the seeded factors are treated as active today (deterministic demo).
    } else if (sens.length) {
      const checks = sens.filter((s) => ACTIVE_EXPR[s.feature]).map((s) => `${ACTIVE_EXPR[s.feature]} AS f_${s.feature}`);
      if (checks.length) {
        const [rows] = await bq.query({
          query: `SELECT ${checks.join(',')} FROM \`${PROJECT}.mart.fct_location_context_daily\` WHERE location_id=@loc AND date=@d LIMIT 1`,
          params: { loc, d: bq.date(date) }, location: 'EU',
        });
        const r = (rows || [])[0] || {};
        active = sens.filter((s) => flat(r[`f_${s.feature}`]) === true);
      } else active = [];
    }

    // Engine 1 — your track record, matched to the factor. devSeed reads the demo fixture; real
    // A<->B matching (origin_factor on the learning mart) is a follow-up, so prod attaches none yet.
    const trackByFeature: Record<string, TrackRecord> = {};
    if (devSeed) {
      const [tr] = await bq.query({
        query: `SELECT origin_factor, action_type, beat_count, done_count FROM \`${PROJECT}.analytics.b_demo_commitment\` WHERE location_id=@loc`,
        params: { loc }, location: 'EU',
      });
      (tr || []).forEach((x: any) => {
        trackByFeature[flat(x.origin_factor)] = { action_type: flat(x.action_type), beat: Number(flat(x.beat_count)), done: Number(flat(x.done_count)) };
      });
    }

    const factors = active.map((s) => {
      const tr = trackByFeature[s.feature];
      return {
        feature: s.feature,
        label: FEATURE_FR[s.feature] || s.feature,
        tier: s.confidence_tier,
        env: envTodayLine(s),                                   // Engine 2 — headwind/tailwind
        action: tr ? actionLine(tr) : null,                     // Engine 1 — your lever (if any)
        move: tr && trackRecordQualifies(tr) ? moveLine(tr) : null, // the move (gated)
      };
    });
    // Four-tier context-decision payload (the close-out). Additive: legacy `factors` stays for the
    // current insight/engagement renders until they migrate to `tiers`.
    const tiers = await assembleTiers(bq, loc, date, sens, active, devSeed);
    return json({ ok: true, empty: factors.length === 0, location_id: loc, date, factors, tiers, labels: CONTEXT_LABELS });
  } catch (e: any) {
    return json({ ok: false, error: 'QUERY_FAILED', detail: e?.message ?? String(e) }, 500);
  }
};
