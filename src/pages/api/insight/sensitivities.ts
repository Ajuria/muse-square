import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
import { getSensitivities, type Tier } from '../../../lib/sensitivityStore';
import { citeSensitivity, TIER_SECTION } from '../../../lib/sensitivityCopy';

export const prerender = false;

const PROJECT = 'muse-square-open-data';
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Read-only consumer for "comment votre lieu réagit" (Type B). It NEVER computes an effect —
// it retrieves vetted sensitivities from the store via the one typed accessor and renders the
// pre-cited lines at their tier. Honesty was enforced offline at ingestion; this only presents.
export const GET: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const url = new URL(request.url);
  // DEV-ONLY: ?src=seed reads the seed fixture store (prod ignores it) AND relaxes the
  // location-ownership check, so the populated render can be eyeballed on a seed venue
  // (e.g. V_nimes) the dev user doesn't own. Both concessions gated to import.meta.env.DEV.
  const devSeed = import.meta.env.DEV && url.searchParams.get('src') === 'seed';
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const reqLoc = url.searchParams.get('location_id');
  let loc: string;
  if (reqLoc) {
    if (!devSeed && reqLoc !== activeLoc && !owned.includes(reqLoc)) return json({ ok: false, error: 'LOCATION_FORBIDDEN' }, 403);
    loc = reqLoc;
  } else if (activeLoc) { loc = activeLoc; } else { return json({ ok: false, error: 'NO_LOCATION' }, 400); }

  const storeTable = devSeed ? 'analytics.b_sensitivity_store' : undefined; // prod = real store (empty)

  const bq = makeBQClient(PROJECT);
  try {
    const rows = await getSensitivities(bq, loc, { metric: 'revenue', storeTable });
    const ORDER: Tier[] = ['etabli', 'emergent', 'preliminaire'];
    const sections = ORDER
      .map((tier) => ({
        tier,
        heading: TIER_SECTION[tier].heading,
        caveat: TIER_SECTION[tier].caveat,
        lines: rows.filter((r) => r.confidence_tier === tier).map(citeSensitivity),
      }))
      .filter((s) => s.lines.length > 0);
    return json({ ok: true, empty: rows.length === 0, location_id: loc, sections });
  } catch (e: any) {
    return json({ ok: false, error: 'QUERY_FAILED', detail: e?.message ?? String(e) }, 500);
  }
};
