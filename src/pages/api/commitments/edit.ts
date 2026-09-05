// Route: /api/commitments/edit — edit an OPEN engagement's user-authored fields
// (committed_action_text, owner_person_name, window_start, window_end, threshold_value).
// POST { commitment_id, location_id, committed_action_text?, owner_person_name?,
//        window_start?, window_end?, threshold_value? }. Reuses readMergeWrite (create:false).
// Only open/pending commitments are editable — a resolved verdict is frozen.
// FENÊTRE ET SEUIL ÉDITABLES (owner 10/08) : une fenêtre fausse ne se corrigeait que par
// suppression + recréation. Gardes : dates Y-m-d, fin >= début, fenêtre <= 90 j, seuil 1..200 %
// — et JAMAIS après résolution (le gel du verdict reste la garde anti p-hacking).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
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
    const text = body.committed_action_text != null ? String(body.committed_action_text).trim() : null;
    const owner = body.owner_person_name != null ? String(body.owner_person_name).trim() : null;
    const isYmd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T12:00:00Z"));
    const wsRaw = body.window_start != null ? String(body.window_start).trim() : null;
    const weRaw = body.window_end != null ? String(body.window_end).trim() : null;
    const thrRaw = body.threshold_value != null ? Number(body.threshold_value) : null;
    if (!text && !owner && !wsRaw && !weRaw && thrRaw == null) {
      return json({ ok: false, error: "Rien à modifier" }, 400);
    }
    if (text != null && text === "") {
      return json({ ok: false, error: "L'action ne peut pas être vide" }, 400);
    }
    if ((wsRaw && !isYmd(wsRaw)) || (weRaw && !isYmd(weRaw))) {
      return json({ ok: false, error: "Dates de fenêtre invalides (AAAA-MM-JJ)" }, 400);
    }
    if (thrRaw != null && (!Number.isFinite(thrRaw) || thrRaw < 1 || thrRaw > 200)) {
      return json({ ok: false, error: "Seuil hors bornes (1 à 200 %)" }, 400);
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

    // La fenêtre se valide sur l'état FUSIONNÉ (on peut ne bouger qu'une borne).
    const nextWs = wsRaw || String((prior as any).window_start || "");
    const nextWe = weRaw || String((prior as any).window_end || "");
    if ((wsRaw || weRaw)) {
      if (!isYmd(nextWs) || !isYmd(nextWe)) return json({ ok: false, error: "Fenêtre incomplète" }, 400);
      if (nextWe < nextWs) return json({ ok: false, error: "La fin de fenêtre précède son début" }, 400);
      const span = Math.round((Date.parse(nextWe + "T12:00:00Z") - Date.parse(nextWs + "T12:00:00Z")) / 86_400_000) + 1;
      if (span > 90) return json({ ok: false, error: "Fenêtre trop longue (90 jours maximum)" }, 400);
    }

    const patch: Partial<CommitmentRow> = {};
    if (text) patch.committed_action_text = text;
    if (owner) patch.owner_person_name = owner;
    if (wsRaw) (patch as any).window_start = nextWs;
    if (weRaw) (patch as any).window_end = nextWe;
    if (thrRaw != null) (patch as any).threshold_value = thrRaw;

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
