// Route: /api/commitments/retro — post-resolution reflection ("qu'est-ce qui a
// marché / pas"). POST { commitment_id, location_id, retro_note }. The 4th
// writer; reuses readMergeWrite() (create:false).
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
    if (!body || !body.commitment_id || !body.location_id || body.retro_note == null) {
      return json({ ok: false, error: "Champs requis : commitment_id, location_id, retro_note" }, 400);
    }
    requireLocationOwnership(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }
    // Retro is a post-resolution reflection; only meaningful once a verdict exists.
    if (!["resolved", "expired"].includes(String(prior.status))) {
      return json({ ok: false, error: "Retro disponible seulement après résolution" }, 409);
    }

    const patch: Partial<CommitmentRow> = {
      retro_note: String(body.retro_note).trim() || null,
    };
    await readMergeWrite(bq, {
      commitmentId: String(body.commitment_id),
      transitionType: "retro",
      patch,
    });
    return json({ ok: true });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
