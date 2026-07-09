import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
import { FEATURE_FR, envTodayLine, actionLine, moveLine, trackRecordQualifies } from '../../../lib/sensitivityCopy';
import featureRegistry from '../../../lib/sensitivityFeatures.json';
import { assembleDayContext, type DayContext, type DayContextFact } from '../../../lib/dayContext';
import { fillContextFallback, CONTEXT_LABELS } from '../../../lib/contextCopy';

// French distance formatting (JJ/MM style number rules — comma decimal). Formatting, not copy.
const frKm = (km: number | null): string => km == null ? '' : (km < 10 ? String(Math.round(km * 10) / 10).replace('.', ',') : String(Math.round(km))) + ' km';

export const prerender = false;
const PROJECT = 'muse-square-open-data';
const json = (b: unknown, s = 200): Response => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

// ── Four-tier context-decision assembly (see docs/features/context-decision-service.md) ──
// PURE SHAPING of the brain's payload (assembleDayContext). This endpoint reads NOTHING directly —
// Engine 2 (sensitivities), Engine 1 (track record), the estimation priors and competitors ALL come
// from the brain. Four provenance-labelled tiers, never merged.
type RegEntry = { key: string; label_key?: string; mechanism?: string };
const REG = featureRegistry.revenue as RegEntry[];
const IMPACT_TABLE = (featureRegistry as any).impact_table as string;
const labelKey = (k: string): string => REG.find((f) => f.key === k)?.label_key || k;
// Fine registry factor -> its coarse theme (a commitment's window-context factor is fine, but the
// theme-tolerant match keeps working). Derived from the registry mechanism (single source).
const MECHANISM_THEME: Record<string, string> = { weather_footfall: 'meteo', access_friction: 'mobilite', tourist_footfall: 'tourisme', calendar_demand: 'calendrier', local_demand: 'fenetres' };
const themeOf = (k: string): string | null => MECHANISM_THEME[REG.find((f) => f.key === k)?.mechanism || ''] || null;

function assembleTiers(dc: DayContext, devSeed: boolean) {
  // Tier 1 — Mesuré (learned, active today) — from the brain's sensitivities.
  const active = dc.sensitivities.filter((s) => s.active_today);
  const mesure = active.map((s) => ({
    tier: 1, feature: s.feature, label_key: labelKey(s.feature), direction: s.direction,
    effect_pct: +(s.effect_size * 100).toFixed(1), n_days: s.n_days, consistency_pct: s.consistency_pct,
    period_start: s.period_start, period_end: s.period_end,
    display: envTodayLine(s), // owner copy (sensitivityCopy)
    provenance: 'mesure', source: 'analytics.b_sensitivity_store',
  }));
  const measuredFeatures = new Set(dc.sensitivities.map((s) => s.feature)); // suppress-in-2 (per venue × factor)
  const summary = { takeaway: dc.takeaway, driver: dc.driver };

  // Tier 2 — Estimation (delta_att prior from the brain + the app's existing French fact). Never a
  // bare number; suppressed when the factor is measured (Tier 1).
  const eventsFact: DayContextFact = { fact_text: null, fact_data: { events: dc.events }, source: 'mart.fct_location_events_topn_daily' };
  const factOf = (key: string): DayContextFact =>
    (['heat', 'rain', 'cold', 'wind', 'snow'].includes(key)) ? dc.weather
      : key === 'mobility_disruption' ? dc.mobility
        : key === 'calendar' ? dc.calendar
          : key === 'events' ? eventsFact
            : { fact_text: null, fact_data: {}, source: IMPACT_TABLE };
  const estimation = Object.entries(dc.impacts)
    .filter(([f]) => !measuredFeatures.has(f))
    .map(([f, v]) => {
      const fact = factOf(f);
      return {
        tier: 2, feature: f, label_key: labelKey(f), fact_text: fact.fact_text, fact_data: fact.fact_data,
        display: fact.fact_text ?? fillContextFallback(labelKey(f)) ?? fillContextFallback(f),
        impact_pct: +v.toFixed(1), provenance: 'estimation', source: fact.source,
      };
    });

  // Tier 3 — Concurrence (observed facts; NO impact number) — top-3 proximity, from the brain.
  const concurrence = dc.competitors.map((c) => ({
    tier: 3, kind: 'competitor', label_key: 'concurrence_competitor', name: c.name, distance_km: c.distance_km,
    threat_level: c.threat_level, google_rating: c.google_rating, google_rating_count: c.google_rating_count,
    enriched: c.enriched, offering_change: c.offering_change, rating_trend: c.rating_trend,
    display: fillContextFallback('concurrence_competitor', { distance: frKm(c.distance_km), nom: c.name }) ?? c.name,
    provenance: 'observe', source: c.source,
  }));

  // Tier 4 — Ce qui a marché pour vous (measured ACTION track record, Engine 1) — from the brain's
  // factor-level track record, matched to today's factors (exact OR theme), reconduire-gated.
  const activeFactors = [...new Set<string>([...mesure.map((m) => m.feature), ...estimation.map((e) => e.feature)])];
  const activeFactorSet = new Set(activeFactors);
  const activeThemes = new Set(activeFactors.map(themeOf).filter(Boolean) as string[]);
  const actionLines = dc.actionTrackByFactor
    .filter((x) => (activeFactorSet.has(x.factor) || activeThemes.has(x.factor)) && trackRecordQualifies(x))
    .map((x) => ({
      tier: 4, feature: x.factor, label_key: labelKey(x.factor), action_type: x.action_type, beat: x.beat, done: x.done,
      display: actionLine(x), move: moveLine(x), provenance: 'mesure_action',
      source: devSeed ? 'analytics.b_commitment_learning_seed' : 'mart.fct_location_commitment_learning',
    }));
  const action = actionLines.length ? actionLines : { present: false, reason: 'bridge_absent', source: 'mart.fct_location_commitment_learning' };

  return { summary, mesure, estimation, concurrence, action };
}

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
    // ONE brain call — Engine 1 & 2, estimation, competition all composed inside; this endpoint reads
    // nothing from the sensitivity store / learning / opportunity marts directly.
    const dc = await assembleDayContext(bq, loc, date, { devSeed });

    // Legacy factors[] (Type B × Type A synthesis) — still consumed by engagement.astro; built from
    // the same payload. Kept until engagement migrates to `tiers`.
    const activeSens = dc.sensitivities.filter((s) => s.active_today);
    const trackByFactor: Record<string, { action_type: string; beat: number; done: number }> = {};
    dc.actionTrackByFactor.forEach((t) => { if (!trackByFactor[t.factor]) trackByFactor[t.factor] = t; });
    const factors = activeSens.map((s) => {
      const tr = trackByFactor[s.feature];
      return {
        feature: s.feature, label: FEATURE_FR[s.feature] || s.feature, tier: s.confidence_tier,
        env: envTodayLine(s),
        action: tr ? actionLine(tr) : null,
        move: tr && trackRecordQualifies(tr) ? moveLine(tr) : null,
      };
    });

    const tiers = assembleTiers(dc, devSeed);
    return json({ ok: true, empty: factors.length === 0, location_id: loc, date, factors, tiers, labels: CONTEXT_LABELS });
  } catch (e: any) {
    return json({ ok: false, error: 'QUERY_FAILED', detail: e?.message ?? String(e) }, 500);
  }
};
