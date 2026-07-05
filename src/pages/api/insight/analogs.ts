// src/pages/api/insight/analogs.ts
// Analog/history layer for the movement-card dossier (Consulter la source).
// Returns the fct_client_day_analogs row for a (location_id, date): how many
// comparable days exist, their median revenue, this day vs those days, the
// named analog days, and is_unexplained ("situation nouvelle"). Read-only.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

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

function ymd(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "object" && v.value) return String(v.value);
  return String(v);
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    const [rows] = await bq.query({
      query: `
        SELECT
          dow, condition_key, weather_band,
          daily_revenue,
          analog_n,
          analog_median_revenue,
          residual_vs_analog_pct,
          analog_n_in_retreat,
          is_unexplained,
          analogs
        FROM \`muse-square-open-data.mart.fct_client_day_analogs\`
        WHERE location_id = @location_id
          AND date = PARSE_DATE('%Y-%m-%d', @date)
        LIMIT 1
      `,
      params: { location_id, date },
      types: { location_id: "STRING", date: "STRING" },
      location: "EU",
    }).catch(() => [[]]);

    const r: any = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!r) return json(200, { ok: true, found: false });

    const analogs = Array.isArray(r.analogs)
      ? r.analogs.map((a: any) => ({
          date: ymd(a.date),
          revenue: a.revenue != null ? Math.round(Number(a.revenue)) : null,
          weather_band: a.weather_band ?? null,
          events: a.events != null ? Number(a.events) : null,
        }))
      : [];

    return json(200, {
      ok: true,
      found: true,
      analog: {
        dow: r.dow != null ? Number(r.dow) : null,
        condition_key: r.condition_key ?? null,
        weather_band: r.weather_band ?? null,
        daily_revenue: r.daily_revenue != null ? Math.round(Number(r.daily_revenue)) : null,
        analog_n: r.analog_n != null ? Number(r.analog_n) : 0,
        analog_median_revenue: r.analog_median_revenue != null ? Math.round(Number(r.analog_median_revenue)) : null,
        residual_vs_analog_pct: r.residual_vs_analog_pct != null ? Math.round(Number(r.residual_vs_analog_pct)) : null,
        analog_n_in_retreat: r.analog_n_in_retreat != null ? Number(r.analog_n_in_retreat) : null,
        is_unexplained: r.is_unexplained === true,
        analogs,
      },
    });
  } catch (err: any) {
    console.error("[api/insight/analogs] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
