// Route: /api/commitments/retro — post-resolution reflection = the "Documenter" step (Spec 2).
// POST { commitment_id, location_id, retro_worked?, retro_change?, retro_repeat?, retro_note? }.
// Structured retro (worked / would-change / repeat oui-non) is the reusable knowledge-base entry
// that seeds Spec 1's "Plan à reprendre"; legacy retro_note free-text still accepted. Partial-safe:
// only provided fields are patched. The 4th writer; reuses readMergeWrite() (create:false).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { memberCommitmentInPerimeter, logMemberGesture } from "../../../lib/memberCardPolicy";
import { readMergeWrite, readLatestSnapshot, type CommitmentRow } from "../../../lib/commitments/actionCommitments";

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
    // At least one Documenter field must be present (structured retro or legacy note).
    const hasRetroField =
      body.retro_worked != null || body.retro_change != null ||
      body.retro_repeat != null || body.retro_note != null;
    if (!hasRetroField) {
      return json({ ok: false, error: "Au moins un champ de retour est requis" }, 400);
    }
    // Vue équipe inc 5 : geste membre v1 « feedback de fin de dispositif » — même règle
    // que disposition : membre du site, sur son périmètre de pôles seulement.
    requireLocationAccess(locals, body.location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const prior = await readLatestSnapshot(bq, String(body.commitment_id));
    if (!prior || prior.location_id !== String(body.location_id).trim()) {
      return json({ ok: false, error: "Engagement introuvable" }, 404);
    }
    if (!memberCommitmentInPerimeter(locals, String(body.location_id), prior as any)) {
      return json({ ok: false, error: "FORBIDDEN: hors du périmètre de vos pôles" }, 403);
    }
    // Retro is a post-resolution reflection; only meaningful once a verdict exists.
    if (!["resolved", "expired"].includes(String(prior.status))) {
      return json({ ok: false, error: "Retro disponible seulement après résolution" }, 409);
    }

    // Partial-safe: only patch provided fields — saving one field must not wipe the others.
    const patch: Partial<CommitmentRow> = {};
    if (body.retro_worked != null) patch.retro_worked = String(body.retro_worked).trim() || null;
    if (body.retro_change != null) patch.retro_change = String(body.retro_change).trim() || null;
    if (body.retro_repeat != null) patch.retro_repeat = Boolean(body.retro_repeat);
    if (body.retro_note != null) patch.retro_note = String(body.retro_note).trim() || null;
    await readMergeWrite(bq, {
      commitmentId: String(body.commitment_id),
      transitionType: "retro",
      patch,
    });
    if (String((locals as any)?.role || "") === "member") {
      await logMemberGesture(bq, {
        clerk_user_id: userId, location_id: String(body.location_id),
        gesture: "retro", commitment_id: String(body.commitment_id),
        note: [body.retro_worked, body.retro_change, body.retro_note].filter((v) => v != null).map(String).join(" · ") || null,
      });
    }
    return json({ ok: true });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
