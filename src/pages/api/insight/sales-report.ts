import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
// 12/09 — le cœur du rapport vit dans lib/rapport/ventes.ts (LA lecture partagée avec l'outil `lire_ventes`
// de l'agent Explorer, docs/explorer-outil-spec.md § 4) ; la route n'est plus que l'habillage : auth,
// corps, JSON. L'objet rendu est inchangé à l'octet près (preuve : capture avant/après sur f10c3e58).
import { ISO, computeSalesReport } from '../../../lib/rapport/ventes';

export const prerender = false;

const PROJECT = 'muse-square-open-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }

  const start = String(body?.date_start ?? '');
  const end = String(body?.date_end ?? '');
  if (!ISO.test(start) || !ISO.test(end) || start > end) return json({ ok: false, error: 'INVALID_RANGE' }, 400);

  // authorize the establishment against the user's owned set (fallback: active site)
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const reqLoc = body?.location_id ? String(body.location_id) : null;
  let loc: string;
  if (reqLoc) {
    if (reqLoc !== activeLoc && !owned.includes(reqLoc)) return json({ ok: false, error: 'LOCATION_FORBIDDEN' }, 403);
    loc = reqLoc;
  } else if (activeLoc) { loc = activeLoc; } else { return json({ ok: false, error: 'NO_LOCATION' }, 400); }

  const bq = makeBQClient(PROJECT);
  try {
    const { body: out } = await computeSalesReport(bq, { location_id: loc, owned, start, end, scope: body?.scope, channel: body?.channel });
    return json(out);
  } catch (err: any) {
    console.error('sales-report error:', err?.message || err);
    return json({ ok: false, error: err?.message || 'REPORT_FAILED' }, 500);
  }
};
