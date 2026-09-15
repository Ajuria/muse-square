// Route: /api/dispositifs/plan — LE PLAN DU MAGASIN, DÉPOSÉ PAR L'EXPLOITANT (owner 15/09, voie b).
//
//   GET  ?location_id=            → le plan EN VIGUEUR (sa fiche : adresse, type, date), ou null
//   GET  ?location_id=&file=<id>  → le fichier lui-même (proxy authentifié, comme les photos)
//   POST {location_id, file_base64, content_type, original_name?} → dépose un plan
//
// POURQUOI UN PROXY ET PAS UNE URL SIGNÉE : le plan d'un magasin dit où tout se trouve. Il se sert
// derrière la même garde que les photos (`requireLocationOwnership`), jamais par un lien qui traîne.
//
// La RÈGLE (types acceptés, plafond, quel plan fait foi) vit dans `lib/dispositifs/spacePlans.ts` ;
// cette route l'exécute. Ordre d'écriture : le BUCKET d'abord, la ligne ensuite — une ligne sans
// objet afficherait un plan mort, un objet sans ligne n'est qu'un fichier oublié.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { makeStorageClient } from "../../../lib/dispositifs/dispositifPhotos";
import {
  appendPlan, listPlans, planEnVigueur, planObjectPath, planApiUrl, planGcsUri, cheminDepuisUri,
  putPlanObject, getPlanObject, refusDeDepot, PLAN_MAX_BYTES,
} from "../../../lib/dispositifs/spacePlans";
import { randomUUID } from "node:crypto";

export const prerender = false;
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
/** La fiche que la page reçoit — jamais l'URI gs://, qui ne lui sert à rien et nomme le bucket. */
const fiche = (r: { plan_id: string; location_id: string; content_type: string; bytes: number; created_at: string; original_name: string | null }) => ({
  plan_id: r.plan_id, url: planApiUrl(r.location_id, r.plan_id), content_type: r.content_type,
  est_pdf: r.content_type.toLowerCase().indexOf("pdf") >= 0, bytes: r.bytes,
  original_name: r.original_name, created_at: r.created_at,
});

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = (locals as any)?.clerk_user_id ? String((locals as any).clerk_user_id) : null;
    if (!userId) return json({ ok: false }, 401);
    const location_id = String(url.searchParams.get("location_id") || "").trim();
    if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
    requireLocationOwnership(locals, location_id);

    const bq = makeBQClient(BQ_PROJECT);
    const courant = planEnVigueur(await listPlans(bq, location_id));
    const file = String(url.searchParams.get("file") || "").trim();
    if (!file) return json({ ok: true, plan: courant ? fiche(courant) : null });

    // LE FICHIER. On ne sert que le plan EN VIGUEUR de CE site : un identifiant deviné ne descend
    // pas un objet, et un plan remplacé ne se sert plus (ses numéros ne sont plus ceux du magasin).
    if (!courant || courant.plan_id !== file) return json({ ok: false, error: "plan introuvable" }, 404);
    const buf = await getPlanObject(makeStorageClient(), cheminDepuisUri(courant.gcs_uri));
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: { "content-type": courant.content_type, "cache-control": "private, max-age=300", "content-length": String(buf.length) },
    });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = (locals as any)?.clerk_user_id ? String((locals as any).clerk_user_id) : null;
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    const location_id = String(body?.location_id || "").trim();
    if (!body || !location_id) return json({ ok: false, error: "location_id, file_base64, content_type requis" }, 400);
    requireLocationOwnership(locals, location_id);

    const content_type = String(body.content_type || "").toLowerCase().split(";")[0].trim();
    const b64 = String(body.file_base64 || "");
    const bytes = Buffer.from(b64, "base64");
    const refus = refusDeDepot({ content_type, bytes: bytes.length });
    if (refus) return json({ ok: false, refus, max_bytes: PLAN_MAX_BYTES }, 400);

    const plan_id = randomUUID();
    const chemin = planObjectPath(location_id, plan_id, content_type);
    const storage = makeStorageClient();
    await putPlanObject(storage, chemin, bytes, content_type);
    const bq = makeBQClient(BQ_PROJECT);
    const row = await appendPlan(bq, {
      plan_id, location_id, gcs_uri: planGcsUri(chemin), content_type, bytes: bytes.length,
      original_name: body.original_name ? String(body.original_name).slice(0, 200) : null,
      created_by: userId,
    });
    return json({ ok: true, plan: fiche(row) });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
  }
};
