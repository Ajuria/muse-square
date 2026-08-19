// src/pages/api/insight/track-record.ts
// SHARED card-detail block "Ce qui a marché" — WRAPPER MINCE sur src/lib/trackRecordCore.ts
// depuis la journée dédiée 18/08 (le provider famille SALES lit le MÊME noyau : une seule
// définition du track record). Réponse inchangée byte-compatible.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { trackRecordFor } from "../../../lib/trackRecordCore";

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
    const action_type = requireString(url.searchParams.get("action_type"), "action_type");
    const tr = await trackRecordFor(bq, location_id, action_type);
    return json(200, { ok: true, ...tr });
  } catch (err: any) {
    console.error("[api/insight/track-record] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
