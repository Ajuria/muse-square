// Route: /api/dispositifs/walks — LE CONTEXTE D'UNE MARCHE (spec § 9 point 4, owner 14/09).
//
// POST { location_id, walk_id, started_at, ended_at, photos_kept?, photos_written?, problems?,
//        pole_sequence?, user_agent?, viewport_w?, viewport_h?, stream_w?, stream_h?,
//        camera_mode?, real_photos?, photo_failures?, app_build? } → une ligne
// `analytics.dispositif_walks` (append-only, table née à la première écriture).
//
// La règle de construction est PURE et testée (`lib/dispositifs/dispositifWalks.ts`) : la route ne
// garde que l'accès et la sérialisation. AUCUNE position n'est acceptée ni écrite — la construction
// ignore tout champ de ce genre, et un test le vérifie.
//
// NON BLOQUANT côté relevé : la marche est un CONTEXTE de diagnostic, jamais la donnée du produit.
// Si l'écriture échoue, les photos sont déjà en base et rien n'est perdu.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { construireMarche, appendWalk } from "../../../lib/dispositifs/dispositifWalks";

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
    const location_id = String(body?.location_id || "").trim();
    if (!body || !location_id) return json({ ok: false, error: "Champs requis : location_id, walk_id" }, 400);
    requireLocationOwnership(locals, location_id);

    // L'user agent vient de l'EN-TÊTE quand le corps n'en porte pas : c'est la source la plus sûre.
    const ua = body.user_agent != null ? body.user_agent : request.headers.get("user-agent");
    const plan = construireMarche({ body: { ...body, user_agent: ua }, location_id, created_by: userId });
    if (!plan.ok) return json({ ok: false, error: plan.error }, 400);

    await appendWalk(makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT), plan.row);
    return json({ ok: true, walk_id: plan.row.walk_id, duration_s: plan.row.duration_s, platform: plan.row.platform, os_version: plan.row.os_version });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
