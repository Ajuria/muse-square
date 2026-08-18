// src/pages/api/insight/sales-breakdown.ts
// Card-SPECIFIC drill-down du mix produit ("Ce qui a fait la journée") — WRAPPER MINCE sur le
// provider partagé `salesFamily` (src/lib/insightFamilies/sales.ts) depuis la journée dédiée
// 18/08 : même donnée pour la page carte, le rapport famille et le Q&A groundé. Réponse
// SUPERSET de l'ancienne (mêmes champs + is_down/signal_types résolus du signal tiré) —
// la page carte continue de passer son isDown explicite, rien ne casse.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { salesFamily } from "../../../lib/insightFamilies/sales";

const PROJECT = "muse-square-open-data";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function requireString(v: string | null, name: string): string {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing required query param: ${name}`);
  return s;
}
function normalizeYmd(v: string): string {
  const m = String(v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`Invalid date format: ${v}`);
  return m[1];
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));
    const fam = await salesFamily(bq, location_id, date);
    if (!fam.found || !(fam.data as any).found) return json(200, { ok: true, found: false });
    return json(200, { ok: true, ...(fam.data as Record<string, unknown>) });
  } catch (err: any) {
    console.error("[api/insight/sales-breakdown] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
