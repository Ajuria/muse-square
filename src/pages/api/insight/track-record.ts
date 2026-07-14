// src/pages/api/insight/track-record.ts
// SHARED card-detail block "Ce qui a marché" (Engine 1) — for a given card type, did the operator's
// PAST commitments on it beat the baseline? Reads the PRE-EXPLODE mart.fct_client_commitment_outcomes
// (one row per resolved + self-reported-done commitment) — NOT the factor-exploded
// fct_location_commitment_learning, whose grain fans a commitment out per window factor; summing that
// double-counts any commitment active under 2+ factors. Aggregates here at commitment grain
// (COUNTIF over non-confounded), matching the learning model's own done/beat/missed definitions.
// Honest-absence: no resolved+done commitment on this type -> found:false (caller shows "aucune action
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
                COUNTIF(NOT is_confounded) AS done,
                COUNTIF(NOT is_confounded AND verdict = 'met') AS beat,
                COUNTIF(NOT is_confounded AND verdict = 'missed') AS missed,
                AVG(IF(NOT is_confounded, effect_residual_pct, NULL)) AS avg_effect_pct,
                MAX(resolved_date) AS last_resolved
              FROM \`${PROJECT}.mart.fct_client_commitment_outcomes\`
              WHERE location_id = @location_id
                AND action_type = @action_type`,
      params: { location_id, action_type }, types: { location_id: "STRING", action_type: "STRING" }, location: "EU",
    });
    const r: any = Array.isArray(rows) && rows.length ? rows[0] : null;
    const done = r ? (num(r.done) ?? 0) : 0;
    if (!r || done <= 0) {
      return json(200, { ok: true, found: false, action_type });
    }

    // Spec 1 "Plan à reprendre" — the single best PAST plan for this card type: the specific action
    // text + dispositif + documented "ce qui a marché" (Spec 2). Read from the RAW commitment log —
    // the mart carries counts, not text. Highest measured lift among resolved + done + beat (verdict met).
    const [bestRows] = await bq.query({
      query: `SELECT committed_action_text, dispositif_note, retro_worked, retro_repeat,
                     window_residual_pct AS effect_pct, DATE(resolved_at) AS resolved_date
              FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) AS rn
                FROM \`${PROJECT}.analytics.action_commitments\`
                WHERE location_id = @location_id AND origin_action_type = @action_type
              )
              WHERE rn = 1 AND status = 'resolved' AND action_done_status = 'fait' AND verdict = 'met'
              ORDER BY window_residual_pct DESC
              LIMIT 1`,
      params: { location_id, action_type }, types: { location_id: "STRING", action_type: "STRING" }, location: "EU",
    });
    const bp: any = Array.isArray(bestRows) && bestRows.length ? bestRows[0] : null;
    const best = bp && bp.committed_action_text ? {
      action_text: String(bp.committed_action_text),
      dispositif: bp.dispositif_note != null ? String(bp.dispositif_note) : null,
      worked: bp.retro_worked != null ? String(bp.retro_worked) : null,       // from Documenter (Spec 2)
      repeat: bp.retro_repeat == null ? null : (bp.retro_repeat === true || bp.retro_repeat === "true"),
      effect_pct: bp.effect_pct != null ? Math.round(num(bp.effect_pct)! * 10) / 10 : null,
      resolved_date: ymd(bp.resolved_date),
    } : null;

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
      best,   // Spec 1: null when no beat-plan on record
    });
  } catch (err: any) {
    console.error("[api/insight/track-record] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
