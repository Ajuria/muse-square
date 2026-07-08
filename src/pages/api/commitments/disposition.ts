// Route: /api/commitments/disposition — Axis A (self-reported "action menée ?").
// POST { commitment_id, location_id, action_done_status: 'fait'|'pas_encore',
//        dispositif_note? }.  Reuses readMergeWrite() (create:false).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow } from "../../../lib/actionCommitments";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const DONE_STATUSES = new Set(["fait", "pas_encore"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return json({ ok: false }, 401);

    const body = await request.json().catch(() => null);
    if (!body || !body.commitment_id || !body.location_id || !body.action_done_status) {
      return json({ ok: false, error: "Champs requis : commitment_id, location_id, action_done_status" }, 400);
    }
    const doneStatus = String(body.action_done_status).trim();
    if (!DONE_STATUSES.has(doneStatus)) {
      return json({ ok: false, error: "action_done_status invalide : " + doneStatus }, 400);
    }
    requireLocationOwnership(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }

    const patch: Partial<CommitmentRow> = {
      action_done_status: doneStatus,
      action_done_at: new Date().toISOString(),
    };
    // dispositif_note only when provided (typically with 'fait'); don't wipe an
    // existing note on a bare status toggle.
    if (body.dispositif_note != null) {
      patch.dispositif_note = String(body.dispositif_note).trim() || null;
    }

    await readMergeWrite(bq, {
      commitmentId: String(body.commitment_id),
      transitionType: "disposition",
      patch,
    });
    return json({ ok: true });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
