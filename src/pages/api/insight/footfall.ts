// src/pages/api/insight/footfall.ts
// Card-SPECIFIC drill-down for the FOOTFALL family — the "when" of the venue's business, SALES-ANCHORED.
// THIN wrapper over the shared provider `footfallFamily` (src/lib/insightFamilies/footfall.ts) — the
// SAME provider the family report and the grounded prompt Q&A reuse. Response is byte-identical to the
// pre-extraction endpoint: { ok, found, date, lead, hourly, peak_hour, besttime_note, weekly, decision_lines }.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { footfallFamily } from "../../../lib/insightFamilies/footfall";

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

    const result = await footfallFamily(bq, location_id, date);
    return json(200, { ok: true, ...result.data });   // data carries found + date + card fields
  } catch (err: any) {
    console.error("[api/insight/footfall] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
