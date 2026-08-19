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
// P3.1-c : chaque site porte aussi sa caisse déclarée (`pos`) — profil.pos_system joint à
// analytics.pos_systems — pour que le flux d'import SAUTE la question « De quel logiciel ? »
// et route sur import_source (clé parseur de sales-csv). Superset : `pos` absent = null.
export const GET: APIRoute = async ({ locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const active = ((locals as any).location_id as string | undefined) ?? null;

  const ids = owned.length > 0 ? owned : active ? [active] : [];
  if (ids.length === 0) return json({ ok: true, active, locations: [] });

  try {
    const bq = makeBQClient(PROJECT);
    const [[rows], [posRows]] = await Promise.all([
      bq.query({
        query: `SELECT location_id, location_label
                FROM \`${PROJECT}.dims.dim_client_location\`
                WHERE location_id IN UNNEST(@ids) AND active_flag = true`,
        params: { ids },
        location: 'EU',
      }),
      bq.query({
        query: `SELECT p.location_id, s.pos_key, s.label_fr, s.ingestion_mode, s.import_source, s.export_note_fr
                FROM \`${PROJECT}.raw.insight_event_user_location_profile\` p
                JOIN \`${PROJECT}.analytics.pos_systems\` s
                  ON s.pos_key = p.pos_system AND s.active
                WHERE p.location_id IN UNNEST(@ids) AND p.clerk_user_id = @uid`,
        params: { ids, uid: userId },
        location: 'EU',
      }).catch(() => [[]]),
    ]);
    const labelById = new Map<string, string>(
      (rows as Array<{ location_id: string; location_label: string | null }>)
        .filter((r) => r.location_label)
        .map((r) => [r.location_id, r.location_label as string]),
    );
    type Pos = { pos_key: string; label_fr: string; ingestion_mode: string; import_source: string; export_note_fr: string | null };
    const posById = new Map<string, Pos>(
      (Array.isArray(posRows) ? (posRows as any[]) : []).map((r) => [String(r.location_id), {
        pos_key: String(r.pos_key || ''),
        label_fr: String(r.label_fr || ''),
        ingestion_mode: String(r.ingestion_mode || 'csv'),
        import_source: String(r.import_source || 'generic'),
        export_note_fr: r.export_note_fr != null ? String(r.export_note_fr) : null,
      }]),
    );
    // active first, then the rest in owned order; drop any without a human label
    const ordered = active ? [active, ...ids.filter((id) => id !== active)] : ids;
    const locations = ordered
      .map((id) => ({ location_id: id, label: labelById.get(id), pos: posById.get(id) ?? null }))
      .filter((x): x is { location_id: string; label: string; pos: Pos | null } => Boolean(x.label));

    return json({ ok: true, active, locations });
  } catch (err: any) {
    console.error('import/locations error:', err?.message || err);
    return json({ ok: false, error: err?.message || 'BQ_ERROR' }, 500);
  }
};
