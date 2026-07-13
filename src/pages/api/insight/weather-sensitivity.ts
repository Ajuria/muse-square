// src/pages/api/insight/weather-sensitivity.ts
// Card-SPECIFIC drill-down for weather movement cards. The depth a weather card needs is what THIS
// venue's weather actually moves — computed from its OWN trailing history (Engine 2, direct
// comparable-day association), NOT the thin learned b_sensitivity_store and NOT the universal brain.
//
// Given (location_id, date):
//   1) reads the signal day's dominant weather condition (fct_location_context_daily),
//   2) pulls the forward forecast window (fct_location_weather_forecast_daily_detail) — weather is one
//      of the few dimensions where the future is known, so the card leads forward,
//   3) DECOMPOSES the venue's history on the CHAIN weather actually moves — footfall -> conversion ->
//      basket -> revenue (fct_client_daily_performance) — condition days vs the venue's typical day,
//   4) reads which PRODUCT lines ride the condition and which do NOT (fct_client_offering_daily) —
//      the star + the laggard, where a manager actually acts.
// Everything is TRAILING (transaction_date <= signal date): only what was known at signal time.
// Honest-absence: too few comparable days -> chain:null (the caller shows the forecast only, never a
// fabricated effect). The extreme tier (lvl>=3) count is surfaced so the card can flag a thin peak day.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
// Weather-family feature keys ↔ their per-day level column in fct_location_context_daily.
const WEATHER_LVL: Record<string, string> = {
  heat: "lvl_heat", rain: "lvl_rain", cold: "lvl_cold", wind: "lvl_wind", snow: "lvl_snow",
};
const COND_LABEL_FR: Record<string, string> = {
  heat: "forte chaleur", rain: "pluie", cold: "grand froid", wind: "vent fort", snow: "neige",
};
// The "condition" band: a day counts as a comparable condition day at moderate level or above.
const BAND = 2;
const EXTREME = 3;
// Robust floor: below this many comparable condition days we do not claim a measured chain.
const MIN_COND_DAYS = 5;
const FORECAST_DAYS = 7;

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
const ymd = (v: any): string | null => {
  if (v == null) return null;
  if (typeof v === "object" && "value" in v) return String(v.value);
  return String(v);
};

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    // 1) The signal day's dominant weather condition = the level column with the max value (>=1).
    const [condRows] = await bq.query({
      query: `SELECT lvl_heat, lvl_rain, lvl_cold, lvl_wind, lvl_snow
              FROM \`${PROJECT}.mart.fct_location_context_daily\`
              WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    });
    const cond: any = Array.isArray(condRows) && condRows.length ? condRows[0] : null;
    let condition: { feature: string; level: number; label_fr: string } | null = null;
    if (cond) {
      for (const [feature, col] of Object.entries(WEATHER_LVL)) {
        const lvl = num(cond[col]) ?? 0;
        if (lvl >= 1 && (!condition || lvl > condition.level)) {
          condition = { feature, level: lvl, label_fr: COND_LABEL_FR[feature] || feature };
        }
      }
    }
    if (!condition) {
      // No active weather on the signal day -> nothing card-specific to decompose.
      return json(200, { ok: true, found: false, date, condition: null });
    }
    // Whitelisted column (never user-supplied) -> safe to interpolate.
    const lvlCol = WEATHER_LVL[condition.feature];

    // 2) forecast window, 3) chain decomposition, 4) product movers — all independent, run in parallel.
    const [fcRows, chainRows, prodRows] = await Promise.all([
      bq.query({
        query: `SELECT f.date, f.weather_label_fr,
                       f.temperature_2m_max AS tmax, f.temperature_2m_min AS tmin,
                       f.precipitation_probability_max_pct AS rain_prob, f.wind_speed_10m_max AS wind,
                       c.${lvlCol} AS lvl
                FROM \`${PROJECT}.mart.fct_location_weather_forecast_daily_detail\` f
                LEFT JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                  ON c.location_id = f.location_id AND c.date = f.date
                WHERE f.location_id = @location_id AND f.date >= PARSE_DATE('%Y-%m-%d', @date)
                ORDER BY f.date LIMIT ${FORECAST_DAYS}`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
      bq.query({
        query: `WITH perf AS (
                  SELECT p.daily_visitors AS vis, p.daily_conversion_rate AS conv,
                         p.daily_avg_basket AS basket, p.daily_revenue AS rev, c.${lvlCol} AS lvl
                  FROM \`${PROJECT}.mart.fct_client_daily_performance\` p
                  JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                    ON c.location_id = p.location_id AND c.date = p.transaction_date
                  WHERE p.location_id = @location_id
                    AND p.transaction_date <= PARSE_DATE('%Y-%m-%d', @date)
                )
                SELECT COUNTIF(lvl >= ${BAND}) AS n_cond,
                       COUNTIF(lvl >= ${EXTREME}) AS n_extreme,
                       COUNT(*) AS n_all,
                       AVG(IF(lvl >= ${BAND}, vis, NULL))    AS cond_vis,    AVG(vis)    AS all_vis,
                       AVG(IF(lvl >= ${BAND}, conv, NULL))   AS cond_conv,   AVG(conv)   AS all_conv,
                       AVG(IF(lvl >= ${BAND}, basket, NULL)) AS cond_basket, AVG(basket) AS all_basket,
                       AVG(IF(lvl >= ${BAND}, rev, NULL))    AS cond_rev,    AVG(rev)    AS all_rev
                FROM perf`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]?.[0]).catch(() => null),
      bq.query({
        query: `WITH tagged AS (
                  SELECT o.item_category AS cat, o.revenue AS rev,
                         IF(c.${lvlCol} >= ${BAND}, 'cond', 'base') AS band
                  FROM \`${PROJECT}.mart.fct_client_offering_daily\` o
                  JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                    ON c.location_id = o.location_id AND c.date = o.transaction_date
                  WHERE o.location_id = @location_id
                    AND o.transaction_date <= PARSE_DATE('%Y-%m-%d', @date)
                )
                SELECT cat,
                       AVG(IF(band = 'cond', rev, NULL)) AS cond_rev,
                       AVG(IF(band = 'base', rev, NULL)) AS base_rev
                FROM tagged
                GROUP BY cat
                HAVING cond_rev IS NOT NULL AND base_rev IS NOT NULL AND base_rev > 0
                ORDER BY cond_rev DESC`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }).then((r: any) => r[0]).catch(() => []),
    ]);

    // Forecast window: pick the peak (most extreme) day for this feature.
    const forecast = (Array.isArray(fcRows) ? fcRows : []).map((r: any) => {
      const lvl = num(r.lvl) ?? 0;
      return {
        date: ymd(r.date), label_fr: r.weather_label_fr ?? null,
        tmax: num(r.tmax), tmin: num(r.tmin), rain_prob: num(r.rain_prob), wind: num(r.wind),
        lvl, is_extreme: lvl >= EXTREME,
      };
    });
    let peak: any = null;
    for (const d of forecast) {
      if (!peak || d.lvl > peak.lvl || (d.lvl === peak.lvl && (d.tmax ?? -99) > (peak.tmax ?? -99))) {
        peak = { date: d.date, tmax: d.tmax, lvl: d.lvl };
      }
    }

    // Chain decomposition: condition days vs the venue's typical day. Honest-absence below the floor.
    let chain: any = null;
    if (chainRows) {
      const n_cond = num(chainRows.n_cond) ?? 0;
      if (n_cond >= MIN_COND_DAYS) {
        const condVis = num(chainRows.cond_vis), allVis = num(chainRows.all_vis);
        const condRev = num(chainRows.cond_rev), allRev = num(chainRows.all_rev);
        const pct = (a: number | null, b: number | null) =>
          a != null && b != null && b !== 0 ? Math.round((a / b - 1) * 100) : null;
        chain = {
          n_cond, n_all: num(chainRows.n_all) ?? 0, n_extreme: num(chainRows.n_extreme) ?? 0,
          visitors: { cond: condVis != null ? Math.round(condVis) : null, typical: allVis != null ? Math.round(allVis) : null, pct: pct(condVis, allVis) },
          conversion: { cond: num(chainRows.cond_conv), typical: num(chainRows.all_conv) },
          basket: { cond: num(chainRows.cond_basket), typical: num(chainRows.all_basket) },
          revenue: {
            cond: condRev != null ? Math.round(condRev) : null,
            typical: allRev != null ? Math.round(allRev) : null,
            pct: pct(condRev, allRev),
            eur_per_day: condRev != null && allRev != null ? Math.round(condRev - allRev) : null,
          },
        };
      }
    }

    // Product movers: which lines ride the condition (up) and which do not (down). Shown even when
    // the chain aggregate is too thin to chart — the caller labels them with cond_days so a small
    // sample reads AS small (honest, not hidden). cond_days = the venue's condition-day count.
    const cond_days = chainRows ? (num(chainRows.n_cond) ?? 0) : 0;
    const products = { up: [] as any[], down: [] as any[] };
    for (const r of (Array.isArray(prodRows) ? prodRows : [])) {
      const condRev = num(r.cond_rev), baseRev = num(r.base_rev);
      if (condRev == null || baseRev == null || baseRev === 0) continue;
      const pct = Math.round((condRev / baseRev - 1) * 100);
      const item = { category: r.cat, cond_eur: Math.round(condRev), base_eur: Math.round(baseRev), pct };
      (pct >= 0 ? products.up : products.down).push(item);
    }
    products.up.sort((a, b) => b.cond_eur - a.cond_eur);   // star first (biggest line that rides it)
    products.down.sort((a, b) => a.pct - b.pct);           // worst laggard first

    return json(200, {
      ok: true,
      found: true,
      date,
      condition,      // dominant weather feature on the signal day (+ FR label)
      forecast,       // forward window (next 7 days), each with the feature's level + is_extreme
      peak,           // most extreme day in the window (the "watch" day)
      chain,          // measured chain decomposition vs typical, or null (honest-absence)
      cond_days,      // condition-day count behind the product split (for the honest sample caveat)
      products,       // { up: lines that ride the condition, down: lines that don't }
    });
  } catch (err: any) {
    console.error("[api/insight/weather-sensitivity] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
