// Route: /api/commitments/edit — edit an OPEN engagement's user-authored fields
// (committed_action_text, owner_person_name). POST { commitment_id, location_id,
// committed_action_text?, owner_person_name? }. Reuses readMergeWrite (create:false).
// Only open/pending commitments are editable — a resolved verdict is frozen.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow } from "../../../lib/actionCommitments";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

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
    if (!body || !body.commitment_id || !body.location_id) {
      return json({ ok: false, error: "Champs requis : commitment_id, location_id" }, 400);
    }
    const text = body.committed_action_text != null ? String(body.committed_action_text).trim() : null;
    const owner = body.owner_person_name != null ? String(body.owner_person_name).trim() : null;
    if (!text && !owner) {
      return json({ ok: false, error: "Rien à modifier" }, 400);
    }
    if (text != null && text === "") {
      return json({ ok: false, error: "L'action ne peut pas être vide" }, 400);
    }
    requireLocationOwnership(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }
    // Edits only make sense before resolution — a verdict is frozen.
    if (!["open", "pending"].includes(String(prior.status))) {
      return json({ ok: false, error: "Un engagement résolu ne peut plus être modifié" }, 409);
    }

    const patch: Partial<CommitmentRow> = {};
    if (text) patch.committed_action_text = text;
    if (owner) patch.owner_person_name = owner;

    await readMergeWrite(bq, {
      commitmentId: String(body.commitment_id),
      transitionType: "edited",
      patch,
    });
    return json({ ok: true });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
