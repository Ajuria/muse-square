// /api/dispositifs/photos — les photos des composants d'un dispositif permanent (spec
// docs/dispositifs-typologie-spec.md § 5.1-5.3, owner 03/09, incrément 1 de l'étape 4).
//
//   GET  ?dispositif_id=&version_no=   → la dernière photo lue par composant (+ url de l'image)
//   GET  ?dispositif_id=&file=<photo_id> → l'image elle-même (proxy authentifié — le bucket est privé,
//                                       rien n'est signé ni public)
//   POST {action: "confirm", dispositif_id, photo_id, items_confirmed: [item_code]}
//        → une NOUVELLE ligne de la même photo avec les articles confirmés (append-only, la
//          dernière gagne) ; codes hors liste du site écartés. items_confirmed prime partout.
//   POST {dispositif_id, version_no, component_key, image_base64, content_type}
//        → écrit l'objet, LIT la photo (une consigne + un schéma générés depuis le registre,
//          une porte qui rejette toute clé hors registre et tout code hors liste), écrit la ligne.
//          Personne visible → l'objet est EFFACÉ, aucune ligne, réponse rejected: "person".
//
// Le dispositif et son site sont résolus par la couche SEMANTIC (vue mémoire), jamais par la
// table analytics. Écriture = owner du site (requireLocationOwnership) ; lecture = owner ou
// membre (requireLocationAccess).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership, requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { readComponents, dispositifTypeLabelFr, checklistFor } from "../../../lib/dispositifs/dispositifTypes";
import {
  PHOTO_MAX_BYTES, makeStorageClient, photoObjectPath, photoGcsUri, putPhotoObject, getPhotoObject, deletePhotoObject,
  insertPhotoRow, listPhotoRows, latestPerComponent, listSiteItems, withConfirmedItems, type PhotoRow,
} from "../../../lib/dispositifs/dispositifPhotos";
import { PHOTO_PROMPT_VERSION, photoQuestions, photoExtractionSchema, photoExtractionSystem } from "../../../lib/ai/photoExtraction";
import { validatePhotoExtraction } from "../../../lib/ai/contracts/photoExtractionChecks";
import { callClaudeMessagesAPI } from "../../../lib/ai/runtime/claude";
import { modelFor } from "../../../lib/ai/models";

export const prerender = false;
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// Le dispositif tel que la couche semantic le connaît : site, version courante, composants.
async function readDispositif(bq: any, dispositif_id: string, version_no: number | null) {
  const rows = await bq.query({
    query: `SELECT commitment_id, location_id, version_no, components
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_commitment_memory\`
            WHERE dispositif_id = @d AND dispositif_nature = 'permanent'
            ORDER BY version_no DESC LIMIT 20`,
    params: { d: dispositif_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  if (!rows.length) return null;
  const pick = version_no != null ? rows.find((r: any) => Number(flat(r.version_no)) === version_no) : rows[0];
  if (!pick) return null;
  return {
    location_id: String(flat(pick.location_id)),
    version_no: Number(flat(pick.version_no)),
    components: readComponents(flat(pick.components)),
  };
}

const photoUrl = (dispositif_id: string, photo_id: string) =>
  `/api/dispositifs/photos?dispositif_id=${encodeURIComponent(dispositif_id)}&file=${encodeURIComponent(photo_id)}`;

// La photo telle que la page la rend : les QUESTIONS du registre (clé + libellé) pour lire la
// check-list, et la désignation des articles reconnus (jamais un code nu à l'écran).
function publicRow(r: PhotoRow, itemsByCode: Record<string, string>) {
  return {
    photo_id: r.photo_id, dispositif_id: r.dispositif_id, version_no: r.version_no, component_key: r.component_key,
    url: photoUrl(r.dispositif_id, r.photo_id), status: r.status, checklist: r.checklist,
    questions: r.dispositif_type ? checklistFor(r.dispositif_type, r.dispositif_role).map((q) => ({ key: q.key, question_fr: q.question_fr })) : [],
    items_matched: (r.items_matched ?? []).map((it) => ({ ...it, item_description: itemsByCode[it.item_code] ?? null })),
    items_confirmed: r.items_confirmed ? r.items_confirmed.map((it) => ({ ...it, item_description: itemsByCode[it.item_code] ?? null })) : null,
    prices_seen: r.prices_seen, coverage_flag: r.coverage_flag, created_at: r.created_at,
    dispositif_type: r.dispositif_type, dispositif_type_label_fr: r.dispositif_type ? dispositifTypeLabelFr(r.dispositif_type) : null,
  };
}
const byCode = (items: Array<{ item_code: string; item_description: string }>): Record<string, string> =>
  Object.fromEntries(items.map((i) => [i.item_code, i.item_description]));

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const dispositif_id = String(url.searchParams.get("dispositif_id") || "").trim();
    if (!dispositif_id) return json({ ok: false, error: "dispositif_id requis" }, 400);
    const bq = makeBQClient(BQ_PROJECT);
    const disp = await readDispositif(bq, dispositif_id, null);
    if (!disp) return json({ ok: false, error: "dispositif introuvable" }, 404);
    requireLocationAccess(locals, disp.location_id);

    const file = String(url.searchParams.get("file") || "").trim();
    if (file) {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(file)) return json({ ok: false, error: "file invalide" }, 400);
      const rows = await listPhotoRows(bq, dispositif_id);
      const row = rows.find((r) => r.photo_id === file);
      if (!row) return json({ ok: false, error: "photo introuvable" }, 404);
      const bytes = await getPhotoObject(makeStorageClient(), photoObjectPath(row.location_id, row.dispositif_id, row.photo_id));
      return new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=300" } });
    }

    const vParam = url.searchParams.get("version_no");
    const version_no = vParam != null && vParam !== "" ? Number(vParam) : null;
    const [rows, items] = await Promise.all([
      listPhotoRows(bq, dispositif_id, Number.isFinite(version_no as number) ? version_no : null),
      listSiteItems(bq, disp.location_id),
    ]);
    const codes = byCode(items);
    return json({ ok: true, dispositif_id, version_no: version_no ?? disp.version_no, photos: latestPerComponent(rows).map((r) => publicRow(r, codes)) });
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
    if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
    const dispositif_id = String(body.dispositif_id || "").trim();

    // ── Confirmation des articles (incrément 2a, 03/09) ──
    if (String(body.action || "") === "confirm") {
      const photo_id = String(body.photo_id || "").trim();
      if (!dispositif_id || !photo_id || !Array.isArray(body.items_confirmed)) return json({ ok: false, error: "dispositif_id, photo_id, items_confirmed requis" }, 400);
      const bq0 = makeBQClient(BQ_PROJECT);
      const disp0 = await readDispositif(bq0, dispositif_id, null);
      if (!disp0) return json({ ok: false, error: "dispositif introuvable" }, 404);
      requireLocationOwnership(locals, disp0.location_id);
      const [rows0, items0] = await Promise.all([listPhotoRows(bq0, dispositif_id), listSiteItems(bq0, disp0.location_id)]);
      const current = rows0.find((r) => r.photo_id === photo_id);
      if (!current) return json({ ok: false, error: "photo introuvable" }, 404);
      const confirmed = withConfirmedItems(current, body.items_confirmed.map((c: any) => String(c)), items0.map((i) => i.item_code), new Date().toISOString());
      await insertPhotoRow(bq0, confirmed);
      return json({ ok: true, photo: publicRow(confirmed, byCode(items0)) });
    }

    const component_key = String(body.component_key || "").trim();
    const version_no = body.version_no != null && Number.isFinite(Number(body.version_no)) ? Number(body.version_no) : null;
    const content_type = String(body.content_type || "image/jpeg");
    const b64 = typeof body.image_base64 === "string" ? body.image_base64.replace(/^data:[^;]+;base64,/, "") : "";
    if (!dispositif_id || !component_key || !b64) return json({ ok: false, error: "dispositif_id, component_key, image_base64 requis" }, 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(content_type)) return json({ ok: false, error: "content_type non accepté (jpeg, png, webp)" }, 400);
    const bytes = Buffer.from(b64, "base64");
    if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return json({ ok: false, error: `image vide ou trop lourde (max ${Math.round(PHOTO_MAX_BYTES / 1e6 * 10) / 10} Mo après réduction)` }, 413);

    const bq = makeBQClient(BQ_PROJECT);
    const disp = await readDispositif(bq, dispositif_id, version_no);
    if (!disp) return json({ ok: false, error: "dispositif introuvable" }, 404);
    requireLocationOwnership(locals, disp.location_id);
    const comp = disp.components.find((c) => c.key === component_key);
    if (!comp) return json({ ok: false, error: "component_key inconnu pour cette version" }, 400);

    // 1. L'objet — écrit d'abord ; effacé si une personne est visible ou si la lecture échoue.
    const photo_id = crypto.randomUUID();
    const path = photoObjectPath(disp.location_id, dispositif_id, photo_id);
    const storage = makeStorageClient();
    const itemsP = listSiteItems(bq, disp.location_id);
    await putPhotoObject(storage, path, bytes, content_type);

    // 2. La lecture — consigne + schéma générés depuis le registre, image en bloc base64.
    const questions = photoQuestions({ type: comp.type, role: comp.role });
    const items = await itemsP;
    const model = modelFor("packager");
    const call = await callClaudeMessagesAPI({
      model, maxTokens: 2000, timeoutMs: 60_000, cacheSystem: true,
      system: photoExtractionSystem({ type: comp.type, role: comp.role, items }, questions),
      userContent: [
        { type: "image", source: { type: "base64", media_type: content_type as any, data: b64 } },
        { type: "text", text: "Remplis le formulaire pour cette photo." },
      ],
      outputSchema: photoExtractionSchema(questions),
    });
    let out: any = null;
    if (call.ok && call.rawText) { try { out = JSON.parse(call.rawText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch { out = null; } }
    const gate = validatePhotoExtraction(out, questions.map((q) => q.key), items.map((i) => i.item_code));

    // 3. Personne visible → l'image n'existe plus, aucune ligne (déviation acceptée owner 03/09).
    if (gate.rejected_person) {
      await deletePhotoObject(storage, path);
      return json({ ok: false, rejected: "person", error: "Une personne est visible sur la photo — elle n'est pas conservée." }, 422);
    }
    if (!gate.ok) {
      await deletePhotoObject(storage, path);
      return json({ ok: false, rejected: "read", error: "La lecture de la photo a échoué — réessayez.", details: [...(call.errors ?? []), ...gate.errors].slice(0, 6) }, 502);
    }

    // 4. La ligne.
    const row: PhotoRow = {
      photo_id, location_id: disp.location_id, dispositif_id, version_no: disp.version_no, component_key,
      walk_id: null, seq: null, t_offset_s: null, gcs_uri: photoGcsUri(path),
      dispositif_type: comp.type, dispositif_role: comp.role, status: "read",
      checklist: out.checklist, items_matched: out.items, items_confirmed: null, prices_seen: out.prices,
      coverage_flag: out.coverage, model, prompt_version: PHOTO_PROMPT_VERSION, created_by: userId, created_at: new Date().toISOString(),
    };
    await insertPhotoRow(bq, row);
    return json({ ok: true, photo: publicRow(row, byCode(items)), usage: call.usage });
  } catch (e: any) {
    const msg = String(e?.message || e);
    return json({ ok: false, error: msg }, msg.startsWith("FORBIDDEN") ? 403 : 500);
  }
};
