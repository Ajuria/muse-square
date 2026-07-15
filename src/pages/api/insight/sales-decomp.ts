// src/pages/api/insight/sales-decomp.ts
// Card-SPECIFIC drill-down for footfall_vs_basket_decomposition (« Ventes ou panier »).
// THIN wrapper over the shared provider `salesDecompFamily` (src/lib/insightFamilies/salesDecomp.ts) — the SAME
// provider the family report and the grounded prompt Q&A reuse, so the thresholds and the honest
// framing cannot drift between the deep page and the chat. Response byte-identical to the
// pre-extraction endpoint.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { salesDecompFamily } from "../../../lib/insightFamilies/salesDecomp";

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

    const result = await salesDecompFamily(bq, location_id, date);
    return json(200, { ok: true, ...result.data });   // data carries found + date + card fields
  } catch (err: any) {
    console.error("[api/insight/sales-decomp] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
