// src/pages/api/commitments/space-measures.ts
// Mesures d'espace d'un pôle EXISTANT (docs/espace-et-pole.md E3) : une mesure se corrige sans
// re-versionner le dispositif — un mètre ruban qui remplace le plan, un N° sur le plan oublié, la
// surface de vente d'un pôle. À la création du pôle, les mesures voyagent dans le POST /api/commitments
// (space_measures) ; ici, après coup. Owner seulement (requireLocationOwnership).
//
// GET  ?location_id=…[&dispositif_id=…]  -> { ok, current: [mesures en vigueur], history: [journal] }
// POST { location_id, commitment_id, space_measures: { components: [{component_key, fixture_no, length_m,
//        depth_m, faces, families_share}], surface_m2, source: plan|ruban|saisie, measured_at: AAAA-MM-JJ } }
//      -> { ok, written: n, dispositif_id, version_no }
// Tout passe par lib/dispositifs/spaceMeasures.ts (le seul foyer). La lecture métier (mètres par pôle,
// Part de linéaire, € par mètre) est la vue semantic.vw_insight_event_pole_space ; ici le producteur
// relit son propre journal.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { readLatestSnapshot } from "../../../lib/commitments/actionCommitments";
import { readComponents } from "../../../lib/dispositifs/dispositifTypes";
import { parseSpaceMeasuresBody, appendSpaceMeasures, listSpaceMeasures, currentMeasures, parseMeasureSource } from "../../../lib/dispositifs/spaceMeasures";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function requireString(v: unknown, name: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required param: ${name}`);
  return s;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const dispositif_id = String(url.searchParams.get("dispositif_id") ?? "").trim() || null;
    const history = await listSpaceMeasures(location_id, dispositif_id);
    return json(200, { ok: true, current: currentMeasures(history), history });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json(forbidden ? 403 : 400, { ok: false, error: err?.message || "Erreur" });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const location_id = requireString(body?.location_id, "location_id");
    requireLocationOwnership(locals, location_id);
    const commitment_id = requireString(body?.commitment_id, "commitment_id");
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const snap = await readLatestSnapshot(bq, commitment_id);
    if (!snap) return json(400, { ok: false, error: "commitment_id introuvable" });
    if (String(snap.location_id) !== location_id) return json(403, { ok: false, error: "commitment_id d'un autre site" });
    if ((snap as any).dispositif_nature !== "permanent") return json(400, { ok: false, error: "les mesures d'espace portent sur un pôle (dispositif permanent)" });
    if (String(snap.status) === "cancelled") return json(400, { ok: false, error: "ce pôle est fermé" });
    const parsed = parseSpaceMeasuresBody(body?.space_measures);
    if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
    if (!parsed.value.components.length && !parsed.value.pole) return json(400, { ok: false, error: "Aucune mesure dans space_measures" });
    const keys = new Set(readComponents((snap as any).components).map((c) => c.key));
    const unknown = parsed.value.components.find((m) => !keys.has(m.component_key));
    if (unknown) return json(400, { ok: false, error: `space_measures : le composant « ${unknown.component_key} » n'est pas dans cette version du pôle` });
    const dispositif_id = String((snap as any).dispositif_id || snap.commitment_id);
    const version_no = Number((snap as any).version_no) || 1;
    const sm = body.space_measures || {};
    const written = await appendSpaceMeasures({
      location_id, dispositif_id, version_no,
      components: parsed.value.components, pole: parsed.value.pole,
      source: parseMeasureSource(sm.source, "saisie"),
      measured_at: typeof sm.measured_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sm.measured_at) ? sm.measured_at : new Date().toISOString().slice(0, 10),
      declarant_user_id: (locals as any)?.clerk_user_id ?? null,
    });
    return json(200, { ok: true, written: written.length, dispositif_id, version_no });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json(forbidden ? 403 : 400, { ok: false, error: err?.message || "Erreur" });
  }
};
