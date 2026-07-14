// src/pages/api/insight/best-in-class.ts
// "Lieux comparables" for the insight "Plan à essayer" cards — a vetted external analog for a given
// card type: a comparable venue's move X → reported outcome Y, with a citation. Resolves the venue's
// vertical, maps action_type → lever, reads the crawl store through bestInClassStore. An analog to
// try, never a promised result; honest-absence (found:false) when the store has nothing for the lever.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { getBestInClassPlays, leverForActionType } from "../../../lib/bestInClassStore";

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
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const action_type = requireString(url.searchParams.get("action_type"), "action_type");

    const [irows] = await bq.query({
      query: `SELECT client_industry_code FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\` WHERE location_id=@loc LIMIT 1`,
      params: { loc: location_id }, types: { loc: "STRING" }, location: "EU",
    });
    const industry = irows.length ? String(flat(irows[0].client_industry_code) || "") : "";
    if (!industry) return json(200, { ok: true, found: false, action_type });

    const lever = leverForActionType(action_type);
    const plays = await getBestInClassPlays(bq, industry, lever, { limit: 2 });
    return json(200, { ok: true, found: plays.length > 0, action_type, lever, plays });
  } catch (err: any) {
    console.error("[api/insight/best-in-class] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
