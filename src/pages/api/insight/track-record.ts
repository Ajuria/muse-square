// src/pages/api/insight/track-record.ts
// SHARED card-detail block "Ce qui a marché" (Engine 1) — for a given card type, did the operator's
// PAST commitments on it beat the baseline? Reads mart.fct_location_commitment_learning
// (source='commitment', authorship='user_authored'), the learning aggregate the évolution page uses.
// Grain is (location_id, action_type, window_days) -> summed across windows for the card type.
// Honest-absence: no resolved commitment on this type -> found:false (caller shows "aucune action
// passée mesurée"), never a fabricated track record. Type-A effect is a residual, never "proven".
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

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
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const ymd = (v: any): string | null => (v == null ? null : (typeof v === "object" && "value" in v ? String(v.value) : String(v)));

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const action_type = requireString(url.searchParams.get("action_type"), "action_type");

    const [rows] = await bq.query({
      query: `SELECT
                SUM(done_count) AS done,
                SUM(beat_count) AS beat,
                SUM(missed_count) AS missed,
                SAFE_DIVIDE(SUM(avg_effect_residual_pct * done_count), NULLIF(SUM(done_count), 0)) AS avg_effect_pct,
                MAX(last_resolved_date) AS last_resolved
              FROM \`${PROJECT}.mart.fct_location_commitment_learning\`
              WHERE location_id = @location_id
                AND action_type = @action_type
                AND source = 'commitment'`,
      params: { location_id, action_type }, types: { location_id: "STRING", action_type: "STRING" }, location: "EU",
    });
    const r: any = Array.isArray(rows) && rows.length ? rows[0] : null;
    const done = r ? (num(r.done) ?? 0) : 0;
    if (!r || done <= 0) {
      return json(200, { ok: true, found: false, action_type });
    }
    return json(200, {
      ok: true,
      found: true,
      action_type,
      done,
      beat: num(r.beat) ?? 0,
      missed: num(r.missed) ?? 0,
      // Weighted mean residual effect across measured (non-confounded) done outcomes; a residual,
      // not a "proven lift" — Type A never claims proof.
      avg_effect_pct: r.avg_effect_pct != null ? Math.round(num(r.avg_effect_pct)! * 10) / 10 : null,
      last_resolved: ymd(r.last_resolved),
    });
  } catch (err: any) {
    console.error("[api/insight/track-record] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
