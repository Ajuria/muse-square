// Routes: /api/best-practices — « Vos bonnes pratiques » (validé 26/07, proto methode-proto.html).
//   POST : create a DECLARED practice from a positive card's « Enrichir vos bonnes pratiques »
//          form (public/bp-form.js). kpi + outcome_lever are computed SERVER-SIDE from the
//          origin (kpiRegistry / bestInClassStore vocabularies) — the client never invents them.
//   GET  : matched practices for an origin context — feeds the « Mon action » slot of the
//          M'engager form (public/commit-form.js self-fetch), prouvées d'abord.
//   PATCH: link the replay commitment created by the chain « Ajouter + m'engager à la rejouer »
//          (the commitment itself is created by the EXISTING /api/commitments POST).
// Auth mirrors /api/commitments (Clerk session + requireLocationOwnership).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { kpiKeyForOrigin } from "../../../lib/kpiRegistry";
import { leverForActionType } from "../../../lib/bestInClassStore";
import { isCommitmentOrigin } from "../../../lib/commitmentOrigins";
import {
  insertBestPractice,
  listMatchedPractices,
  linkReplayCommitment,
  type BestPracticeRow,
} from "../../../lib/bestPractices";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

// The ONLY user-chosen taxonomy on a practice (validated proto chips). Everything else is derived.
const MEANS_LEVERS = new Set(["offre", "staffing", "communication", "prix", "accueil", "autre"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function uid(locals: any): string | null {
  return String(locals?.clerk_user_id || "").trim() || null;
}
function errStatus(err: any): number {
  return String(err?.message || "").startsWith("FORBIDDEN") ? 403 : 500;
}

// ── GET /api/best-practices?location_id&origin_action_type[&origin_driver][&day_class_key] ──
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    if (!uid(locals)) return json({ ok: false }, 401);
    const locationId = String(url.searchParams.get("location_id") || "").trim();
    const originType = String(url.searchParams.get("origin_action_type") || "").trim();
    if (!locationId || !originType) return json({ ok: false, error: "Missing location_id or origin_action_type" }, 400);
    requireLocationOwnership(locals, locationId);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const driver = String(url.searchParams.get("origin_driver") || "").trim() || null;
    const practices = await listMatchedPractices(bq, {
      location_id: locationId,
      kpi: kpiKeyForOrigin(originType, driver),
      outcome_lever: leverForActionType(originType, driver),
      day_class_key: String(url.searchParams.get("day_class_key") || "").trim() || null,
    });
    return json({ ok: true, practices });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, errStatus(err));
  }
};

// ── POST /api/best-practices — body: { location_id, practice_text, means_lever?, author_person_name?,
//    origin: { origin_action_type, origin_driver?, origin_card_instance_id?, origin_affected_date?, day_class_key? } } ──
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => ({}));
    const locationId = String(body?.location_id || "").trim();
    const text = String(body?.practice_text || "").trim();
    const origin = body?.origin || {};
    const originType = String(origin?.origin_action_type || "").trim();
    if (!locationId || !text || !originType)
      return json({ ok: false, error: "Missing location_id, practice_text or origin_action_type" }, 400);
    if (!isCommitmentOrigin(originType)) return json({ ok: false, error: "Unknown origin_action_type" }, 400);
    requireLocationOwnership(locals, locationId);

    const driver = String(origin?.origin_driver || "").trim() || null;
    const meansRaw = String(body?.means_lever || "").trim().toLowerCase();
    const row: BestPracticeRow = {
      practice_id: crypto.randomUUID(),
      user_id: userId,
      location_id: locationId,
      author_person_name: String(body?.author_person_name || "").trim() || null,
      origin_card_instance_id: String(origin?.origin_card_instance_id || "").trim() || null,
      origin_action_type: originType,
      origin_driver: driver,
      origin_affected_date: String(origin?.origin_affected_date || "").trim() || null,
      kpi: kpiKeyForOrigin(originType, driver),
      outcome_lever: leverForActionType(originType, driver),
      means_lever: MEANS_LEVERS.has(meansRaw) ? meansRaw : null,
      day_class_key: String(origin?.day_class_key || "").trim() || null,
      practice_text: text.slice(0, 2000),
      replay_commitment_id: null,
      status: "active",
    };
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    await insertBestPractice(bq, row);
    return json({ ok: true, practice_id: row.practice_id });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, errStatus(err));
  }
};

// ── PATCH /api/best-practices — body: { practice_id, location_id, replay_commitment_id } ──
export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    if (!uid(locals)) return json({ ok: false }, 401);
    const body = await request.json().catch(() => ({}));
    const practiceId = String(body?.practice_id || "").trim();
    const locationId = String(body?.location_id || "").trim();
    const commitmentId = String(body?.replay_commitment_id || "").trim();
    if (!practiceId || !locationId || !commitmentId)
      return json({ ok: false, error: "Missing practice_id, location_id or replay_commitment_id" }, 400);
    requireLocationOwnership(locals, locationId);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    await linkReplayCommitment(bq, practiceId, locationId, commitmentId);
    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, error: String(err?.message || err) }, errStatus(err));
  }
};
