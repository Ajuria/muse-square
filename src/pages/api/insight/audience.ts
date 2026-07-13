// src/pages/api/insight/audience.ts
// SHARED card-detail block "Votre audience" — who the venue's customers are, when they come, how
// long they stay. Reads the SEMANTIC layer the app already trusts (NOT a mart schema guess):
//   - semantic.vw_insight_event_ai_location_context: primary_audience_1/2, geographic_catchment,
//     capacity_sensitivity, besttime_dwell_time_min/max  (static venue/customer profile)
//   - semantic.vw_insight_event_day_surface (for @date): ft_peak_hour, ft_avg_busyness_pct,
//     ft_busy_hours_count, audience_availability_label  (that day's footfall + availability)
// Honest-absence per field: nulls are returned as null and the caller omits them (no fabrication).
// NOTE: there is no per-customer transaction key in the warehouse, so this is audience PROFILE +
// footfall behaviour, never a "top customers by CA" ranking (that data does not exist).
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
function normalizeYmd(v: string): string {
  const m = String(v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`Invalid date format: ${v}`);
  return m[1];
}
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
// primary_audience_* arrive as English tokens (closed set) — render French. Unknown → passthrough.
const AUDIENCE_FR: Record<string, string> = {
  local: "clientèle locale", tourists: "touristes", students: "étudiants",
  professionals: "professionnels", mixed: "clientèle mixte",
};
const frAudience = (v: string | null): string | null => (v ? (AUDIENCE_FR[v.toLowerCase()] || v) : null);

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    const [profRows, dayRows] = await Promise.all([
      bq.query({
        query: `SELECT primary_audience_1, primary_audience_2, geographic_catchment,
                       capacity_sensitivity, besttime_dwell_time_min, besttime_dwell_time_max
                FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\`
                WHERE location_id = @location_id LIMIT 1`,
        params: { location_id }, types: { location_id: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
      bq.query({
        query: `SELECT ft_peak_hour, ft_avg_busyness_pct, ft_busy_hours_count, audience_availability_label
                FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
                WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
    ]);

    const p: any = profRows || {};
    const d: any = dayRows || {};
    const audience = {
      who: [frAudience(str(p.primary_audience_1)), frAudience(str(p.primary_audience_2))].filter(Boolean),
      catchment: str(p.geographic_catchment),
      capacity_sensitivity: str(p.capacity_sensitivity),
      dwell_min: num(p.besttime_dwell_time_min),
      dwell_max: num(p.besttime_dwell_time_max),
      peak_hour: num(d.ft_peak_hour),
      avg_busyness_pct: d.ft_avg_busyness_pct != null ? Math.round(num(d.ft_avg_busyness_pct)!) : null,
      busy_hours_count: num(d.ft_busy_hours_count),
      availability_label: str(d.audience_availability_label),
    };
    // found = at least one non-empty field, else the caller shows nothing (self-suppress).
    const found = audience.who.length > 0 || audience.catchment != null || audience.dwell_max != null ||
      audience.peak_hour != null || audience.availability_label != null;

    return json(200, { ok: true, found, date, audience });
  } catch (err: any) {
    console.error("[api/insight/audience] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
