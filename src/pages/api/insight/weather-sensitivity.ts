// src/pages/api/insight/weather-sensitivity.ts
// Card-SPECIFIC drill-down for weather movement cards. The depth a weather card needs is the
// venue's OWN MEASURED weather response (Engine 2), not a raw vigilance level or a declared 3/5.
//
// Given (location_id, date): reads the venue's vetted weather sensitivities from the store (via the
// ONE typed accessor getSensitivities — the store, NOT assembleDayContext/the brain), reads the
// signal day's dominant weather condition from fct_location_context_daily, and MATCHES them:
//   - measured sensitivity for that condition exists -> lead with it ("les jours de chaleur, votre
//     CA -12,2 % — 28 j, tenu 68 %"), + the €/day stake from the venue's typical daily revenue.
//   - no measured sensitivity for that condition -> honest-absence (measured:null): the caller shows
//     the forecast only, NEVER the generic "planifiez un repli" filler. We never fabricate an effect.
// The measured store is THIN (Engine 2): today only one venue has a weather sensitivity. That is the
// truth; the honest-absence branch is the common case, by design.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { getSensitivities } from "../../../lib/sensitivityStore";

const PROJECT = "muse-square-open-data";
// Weather-family feature keys (sensitivityFeatures.json) ↔ their per-day level column.
const WEATHER_LVL: Record<string, string> = {
  heat: "lvl_heat", rain: "lvl_rain", cold: "lvl_cold", wind: "lvl_wind", snow: "lvl_snow",
};

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

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    // 1) the venue's MEASURED weather sensitivities (store, not the brain), 2) the day's condition
    //    levels, 3) the venue's typical daily revenue (for the €/day stake). Independent -> parallel.
    const [sens, condRows, revRows] = await Promise.all([
      getSensitivities(bq, location_id, { metric: "revenue" }).catch(() => []),
      bq.query({
        query: `SELECT lvl_heat, lvl_rain, lvl_cold, lvl_wind, lvl_snow
                FROM \`${PROJECT}.mart.fct_location_context_daily\`
                WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
      bq.query({
        query: `SELECT APPROX_QUANTILES(day_rev, 2)[OFFSET(1)] AS median_daily
                FROM (SELECT transaction_date, SUM(revenue) AS day_rev
                      FROM \`${PROJECT}.mart.fct_client_offering_daily\`
                      WHERE location_id = @location_id GROUP BY transaction_date)`,
        params: { location_id }, types: { location_id: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
    ]);

    // Dominant active weather condition on the signal day = the weather level column with the max value.
    const cond: any = Array.isArray(condRows) && condRows.length ? condRows[0] : null;
    let condition: { feature: string; level: number } | null = null;
    if (cond) {
      for (const [feature, col] of Object.entries(WEATHER_LVL)) {
        const lvl = num(cond[col]) ?? 0;
        if (lvl >= 1 && (!condition || lvl > condition.level)) condition = { feature, level: lvl };
      }
    }

    const typical_daily_eur = (() => {
      const r: any = Array.isArray(revRows) && revRows.length ? revRows[0] : null;
      const v = r ? num(r.median_daily) : null;
      return v != null ? Math.round(v) : null;
    })();

    // Match the day's condition to a MEASURED weather sensitivity. No condition -> no match.
    let measured: any = null;
    if (condition) {
      const hit = (sens as any[]).find((s) => s.feature === condition!.feature);
      if (hit) {
        const effect_pct = Math.round(Number(hit.effect_size) * 100 * 10) / 10; // one decimal, e.g. -12.2
        measured = {
          feature: hit.feature,
          effect_pct,
          n_days: Number(hit.n_days) || 0,
          consistency_pct: Math.round(Number(hit.consistency_pct) || 0),
          tier: hit.confidence_tier,
          // €/day stake = measured effect applied to a typical day (rounded). Honest-absent if no revenue.
          eur_per_day: typical_daily_eur != null ? Math.round((effect_pct / 100) * typical_daily_eur) : null,
        };
      }
    }

    return json(200, {
      ok: true,
      found: condition != null || measured != null,
      date,
      condition,          // the day's dominant weather condition (feature + level), or null
      measured,           // the venue's measured response to that condition, or null (honest-absence)
      typical_daily_eur,
    });
  } catch (err: any) {
    console.error("[api/insight/weather-sensitivity] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
