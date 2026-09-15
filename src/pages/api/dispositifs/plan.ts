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
import { appendPoint, listPoints, pointsEnVigueur, prochainAPlacer, refusDePoint, retirerPoint, type ComposantAPlacer } from "../../../lib/dispositifs/spaceFixturePoints";

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
    if (!file) {
      // Les POINTS voyagent avec la fiche : la page qui affiche le plan veut y poser les numéros, et
      // celle qui fait placer veut savoir où elle en est. Une seule lecture pour les deux.
      const pts = courant ? pointsEnVigueur(await listPoints(bq, location_id)) : new Map();
      const places = [...pts.values()].filter((p) => !courant || p.plan_id === courant.plan_id)
        .map((p) => ({ component_key: p.component_key, dispositif_id: p.dispositif_id, x: p.x, y: p.y }));
      return json({ ok: true, plan: courant ? fiche(courant) : null, points: places });
    }

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

    // ── RETIRER LE POINT D'UN COMPOSANT (owner 15/09 : « si je clique sur un item il devrait
    // disparaître »). Un tap à côté se défait d'un second tap, au même endroit — c'est le geste que
    // l'exploitant fait naturellement, et il n'y a rien à apprendre d'une faute de doigt.
    if (String(body.action || "") === "retirer_point") {
      const bqR2 = makeBQClient(BQ_PROJECT);
      const courantR = planEnVigueur(await listPlans(bqR2, location_id));
      if (!courantR) return json({ ok: false, refus: "plan_absent" }, 400);
      const cle = String(body.component_key || "").trim();
      if (!cle) return json({ ok: false, refus: "composant_absent" }, 400);
      await retirerPoint(bqR2, { location_id, component_key: cle, plan_id: courantR.plan_id });
      const pts2 = pointsEnVigueur(await listPoints(bqR2, location_id));
      const comps2: ComposantAPlacer[] = Array.isArray(body.composants) ? body.composants : [];
      return json({ ok: true, ...prochainAPlacer({ composants: comps2, points: pts2 }) });
    }

    // ── PLACER UN COMPOSANT SUR LE PLAN (owner 15/09) ──    // ── PLACER UN COMPOSANT SUR LE PLAN (owner 15/09) ────────────────────────────────────────────
    // Les coordonnées arrivent en FRACTION du plan (0 à 1), jamais en pixels : le plan se réaffiche à
    // toutes les tailles, et des pixels ne survivraient pas au premier changement d'écran. La règle
    // vit dans `lib/dispositifs/spaceFixturePoints.ts` ; cette route l'exécute.
    if (String(body.action || "") === "placer") {
      const bqP = makeBQClient(BQ_PROJECT);
      const courantP = planEnVigueur(await listPlans(bqP, location_id));
      if (!courantP) return json({ ok: false, refus: "plan_absent" }, 400);
      const refus = refusDePoint({ x: body.x, y: body.y, component_key: body.component_key, plan_id: courantP.plan_id });
      if (refus) return json({ ok: false, refus }, 400);
      await appendPoint(bqP, {
        location_id, dispositif_id: String(body.dispositif_id || "").trim(),
        component_key: String(body.component_key).trim(), plan_id: courantP.plan_id,
        x: Number(body.x), y: Number(body.y), created_by: userId,
      });
      // CE QUI RESTE À PLACER est relu en base, jamais déduit de ce qu'on vient d'écrire.
      const pts = pointsEnVigueur(await listPoints(bqP, location_id));
      const comps: ComposantAPlacer[] = Array.isArray(body.composants) ? body.composants : [];
      return json({ ok: true, ...prochainAPlacer({ composants: comps, points: pts }) });
    }

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
