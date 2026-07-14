// Route: /api/commitments/evolution?commitment_id=  — read-only day-grain series
// for "Consulter l'évolution". Clerk-gated + requireLocationOwnership. Lifts the
// resolution cron's mart queries (BETWEEN + bq.date, the DATE/STRING-safe pattern).
//
// z-HIDDEN AT THE BOUNDARY: the curated snapshot below intentionally omits every z
// field (window_residual_z, _raw, applied_rho/vif, threshold_value, creation_residual_z)
// and the per-day series returns residual_pct only — so the render cannot leak z.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { readLatestSnapshot } from "../../../lib/actionCommitments";
import { assembleEvolutionExtras } from "../../../lib/commitmentContext";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const RESIDUAL = `${BQ_PROJECT}.mart.fct_client_day_residual`;
const CTX = `${BQ_PROJECT}.mart.fct_location_context_features_daily`;

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
function parisDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function dateArray(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z"); const e = new Date(end + "T00:00:00Z");
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return json({ ok: false }, 401);
    const commitmentId = url.searchParams.get("commitment_id");
    if (!commitmentId) return json({ ok: false, error: "Missing commitment_id" }, 400);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const snap = await readLatestSnapshot(bq, commitmentId);
    if (!snap) return json({ ok: false, error: "Engagement introuvable" }, 404);
    requireLocationOwnership(locals, snap.location_id);

    // Same window-date logic as the cron (day_of → Paris business day of creation).
    const dates = snap.window_kind === "day_of"
      ? [parisDate(String(snap.created_at))]
      : dateArray(String(snap.window_start), String(snap.window_end));
    const minD = dates[0], maxD = dates[dates.length - 1];

    const [rrows] = await bq.query({
      query: `SELECT CAST(date AS STRING) AS date, daily_revenue, expected_revenue, residual_pct ` +
             `FROM \`${RESIDUAL}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
      params: { loc: snap.location_id, minD: bq.date(minD), maxD: bq.date(maxD) }, location: "EU",
    });
    const [crows] = await bq.query({
      query: `SELECT CAST(date AS STRING) AS date, is_school_holiday_flag, impact_weather_pct, event_count_region, tourism_index_region ` +
             `FROM \`${CTX}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
      params: { loc: snap.location_id, minD: bq.date(minD), maxD: bq.date(maxD) }, location: "EU",
    });

    const rBy: Record<string, any> = {}, cBy: Record<string, any> = {};
    for (const r of rrows) rBy[String(flat(r.date))] = r;
    for (const c of crows) cBy[String(flat(c.date))] = c;

    // All window days — days without ingested sales are has_data=false ("en attente").
    const series = dates.map((d) => {
      const r = rBy[d], c = cBy[d];
      return {
        date: d,
        has_data: !!r,
        daily_revenue: r ? Number(flat(r.daily_revenue)) : null,
        expected_revenue: r ? Number(flat(r.expected_revenue)) : null,
        residual_pct: r ? Number(flat(r.residual_pct)) : null, // % ONLY — no per-day z
        is_school_holiday: c ? !!flat(c.is_school_holiday_flag) : false,
        impact_weather_pct: c && flat(c.impact_weather_pct) != null ? Number(flat(c.impact_weather_pct)) : null,
        event_count: c && flat(c.event_count_region) != null ? Number(flat(c.event_count_region)) : null,
        tourism_index: c && flat(c.tourism_index_region) != null ? Number(flat(c.tourism_index_region)) : null,
      };
    });

    // Curated, z-free snapshot for the header/verdict.
    const commitment = {
      commitment_id: snap.commitment_id, location_id: snap.location_id, status: snap.status, verdict: snap.verdict,
      committed_action_text: snap.committed_action_text, owner_person_name: snap.owner_person_name,
      origin_action_type: snap.origin_action_type,  // re-commit an adjustment on the same card type (diagnosis panel)
      origin_suppression_key: snap.origin_suppression_key,  // child copies it → keeps the system card suppressed
      window_kind: snap.window_kind, window_start: flat(snap.window_start), window_end: flat(snap.window_end),
      window_days_expected: snap.window_days_expected, window_days_resolved: snap.window_days_resolved,
      threshold_level: snap.threshold_level,
      // the measurable goal reference (window baseline €) — lets ① show the objective even
      // before any window day has data. z stays hidden; this is a plain € baseline.
      window_expected_revenue: snap.window_expected_revenue != null ? Number(flat(snap.window_expected_revenue)) : null,
      window_residual_pct: snap.window_residual_pct, material_holiday_share: snap.material_holiday_share,
      ctx_any_school_holiday: snap.ctx_any_school_holiday, ctx_material_confound: snap.ctx_material_confound,
      action_done_status: snap.action_done_status, dispositif_note: snap.dispositif_note, retro_note: snap.retro_note,
      // Documenter (Spec 2) structured retro — so the capture UI pre-fills saved answers.
      retro_worked: snap.retro_worked, retro_change: snap.retro_change, retro_repeat: snap.retro_repeat,
      resolved_at: flat(snap.resolved_at),
      // owner + when (header) and the goal reference for "vs objectif".
      created_at: flat(snap.created_at), action_done_at: flat(snap.action_done_at),
      threshold_value: snap.threshold_value, threshold_basis: snap.threshold_basis,
      execution_quality: snap.execution_quality,  // self-reported run quality (routes the advice)
    };

    // §2d holiday-norm + ② named context + provenance + ③ advice (z-free, keys only)
    const asOf = parisDate(new Date().toISOString());
    const extras = await assembleEvolutionExtras(bq, snap, asOf);

    // Move "how" hit-rates for this action type (fct_location_action_moves) — feeds the diagnosis advice.
    let move_stats: { move: string; attempts: number; hits: number }[] = [];
    if (snap.origin_action_type) {
      const [mrows] = await bq.query({
        query: `SELECT move, attempts, hits FROM \`muse-square-open-data.mart.fct_location_action_moves\`
                WHERE location_id = @loc AND action_type = @at`,
        params: { loc: snap.location_id, at: snap.origin_action_type },
        types: { loc: "STRING", at: "STRING" }, location: "EU",
      });
      move_stats = (mrows as any[]).map((r) => ({
        move: String(flat(r.move)), attempts: Number(flat(r.attempts)) || 0, hits: Number(flat(r.hits)) || 0,
      }));
    }

    return json({ ok: true, commitment, series, move_stats, ...extras });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
