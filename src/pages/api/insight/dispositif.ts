// src/pages/api/insight/dispositif.ts
// « Reproduire le dispositif gagnant » — la matière d'enquête d'un motif structurel. THIN
// wrapper over the shared provider `dispositifFamily` (src/lib/insightFamilies/dispositif.ts) —
// le MÊME provider que le futur prompt Q&A du mode enquête réutilisera, pour que la matière ne
// diverge jamais entre la page et le chat (pattern des familles, docs/atelier-mecanismes-spec.md).
// Famille pilote : affluence (class=traffic_high) ; autres classes → found:false, raison dite.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { dispositifFamily } from "../../../lib/insightFamilies/dispositif";

const PROJECT = "muse-square-open-data";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function requireString(v: string | null, name: string): string {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing required query param: ${name}`);
  return s;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const class_key = requireString(url.searchParams.get("class"), "class");

    const result = await dispositifFamily(bq, location_id, class_key);
    return json(200, { ok: true, ...result.data });
  } catch (err: any) {
    console.error("[api/insight/dispositif] Error", err);
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};
