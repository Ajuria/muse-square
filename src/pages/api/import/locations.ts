import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';

export const prerender = false;

const PROJECT = 'muse-square-open-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Returns the establishments OWNED by the signed-in user (their all_location_ids),
// labelled from dims.dim_client_location. The raw id is only a value the client
// submits back — never displayed. Used to populate the "Pour quel établissement ?"
// follow-up after a sales CSV is dropped.
export const GET: APIRoute = async ({ locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const active = ((locals as any).location_id as string | undefined) ?? null;

  const ids = owned.length > 0 ? owned : active ? [active] : [];
  if (ids.length === 0) return json({ ok: true, active, locations: [] });

  try {
    const bq = makeBQClient(PROJECT);
    const [rows] = await bq.query({
      query: `SELECT location_id, location_label
              FROM \`${PROJECT}.dims.dim_client_location\`
              WHERE location_id IN UNNEST(@ids) AND active_flag = true`,
      params: { ids },
      location: 'EU',
    });
    const labelById = new Map<string, string>(
      (rows as Array<{ location_id: string; location_label: string | null }>)
        .filter((r) => r.location_label)
        .map((r) => [r.location_id, r.location_label as string]),
    );
    // active first, then the rest in owned order; drop any without a human label
    const ordered = active ? [active, ...ids.filter((id) => id !== active)] : ids;
    const locations = ordered
      .map((id) => ({ location_id: id, label: labelById.get(id) }))
      .filter((x): x is { location_id: string; label: string } => Boolean(x.label));

    return json({ ok: true, active, locations });
  } catch (err: any) {
    console.error('import/locations error:', err?.message || err);
    return json({ ok: false, error: err?.message || 'BQ_ERROR' }, 500);
  }
};
