import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
import { getSensitivities, type Sensitivity } from '../../../lib/sensitivityStore';
import { FEATURE_FR, envTodayLine, actionLine, moveLine, trackRecordQualifies, type TrackRecord } from '../../../lib/sensitivityCopy';
import featureRegistry from '../../../lib/sensitivityFeatures.json';

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
  (featureRegistry.revenue as Array<{ key: string; predicate: string }>).map((f) => [f.key, f.predicate]),
);

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
    return json({ ok: true, empty: factors.length === 0, location_id: loc, date, factors });
  } catch (e: any) {
    return json({ ok: false, error: 'QUERY_FAILED', detail: e?.message ?? String(e) }, 500);
  }
};
