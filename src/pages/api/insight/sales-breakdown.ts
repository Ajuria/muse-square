// src/pages/api/insight/sales-breakdown.ts
// Card-SPECIFIC drill-down for sales movement cards ("Ce qui a fait la journée").
// Given (location_id, date), returns the top category MOVERS: each category's revenue on the
// signal day vs the median of the venue's comparable days (same weekday, trailing), from
// mart.fct_client_sales_by_category_daily. This is the "what sold" the universal brain can't give.
//
// Deliberately NARROW: reads ONLY the category mart. No assembleDayContext, no weather/competitor/
// events/tourism. Comparable days = same weekday (how the card frames them to the operator, "vos
// samedis"), trailing (only what was known at signal time). Honest-absence: a venue with empty
// item_category returns found:false -> the page shows volume/panier only, never a fabricated mix.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
// Robust baseline floor: with fewer than this many comparable weekdays, we don't claim a median.
const MIN_COMPARABLE_DAYS = 3;
const MAX_MOVERS = 6;

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
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    // Per-category: signal-day revenue vs same-weekday trailing median (+ how many comparable days).
    const [rows] = await bq.query({
      query: `
        WITH ct AS (
          SELECT transaction_date AS d, item_category AS category, category_revenue AS rev
          FROM \`${PROJECT}.mart.fct_client_sales_by_category_daily\`
          WHERE location_id = @location_id
        ),
        sig AS (
          SELECT category, rev AS sig_rev FROM ct WHERE d = PARSE_DATE('%Y-%m-%d', @date)
        ),
        base AS (
          SELECT category,
                 APPROX_QUANTILES(rev, 2)[OFFSET(1)] AS med_rev,
                 COUNT(*) AS n_days
          FROM ct
          WHERE EXTRACT(DAYOFWEEK FROM d) = EXTRACT(DAYOFWEEK FROM PARSE_DATE('%Y-%m-%d', @date))
            AND d < PARSE_DATE('%Y-%m-%d', @date)
          GROUP BY category
        )
        SELECT s.category, s.sig_rev, b.med_rev, b.n_days
        FROM sig s
        LEFT JOIN base b ON s.category = b.category
        ORDER BY ABS(s.sig_rev - COALESCE(b.med_rev, 0)) DESC
      `,
      params: { location_id, date },
      types: { location_id: "STRING", date: "STRING" },
      location: "EU",
    }).catch(() => [[]]);

    const raw: any[] = Array.isArray(rows) ? rows : [];
    // Honest-absence: no category rows for the signal day (empty item_category venue) -> found:false.
    if (!raw.length) return json(200, { ok: true, found: false });

    // Distinct comparable weekdays actually present (for "vs vos N derniers lundis").
    const nComparable = raw.reduce((mx, r) => Math.max(mx, num(r.n_days) ?? 0), 0);

    // Movers: only categories with a robust same-weekday baseline. Verbatim numbers from the mart.
    const movers = raw
      .map((r) => {
        const day_eur = num(r.sig_rev);
        const median_eur = num(r.med_rev);
        const n_days = num(r.n_days) ?? 0;
        if (day_eur == null || median_eur == null || n_days < MIN_COMPARABLE_DAYS) return null;
        const delta_eur = day_eur - median_eur;
        return {
          category: String(r.category),
          day_eur: Math.round(day_eur),
          median_eur: Math.round(median_eur),
          delta_eur: Math.round(delta_eur),
          delta_pct: median_eur > 0 ? Math.round((delta_eur / median_eur) * 100) : null,
        };
      })
      .filter(Boolean)
      .slice(0, MAX_MOVERS);

    if (!movers.length) return json(200, { ok: true, found: false });

    const day_total_eur = Math.round(
      raw.reduce((s, r) => s + (num(r.sig_rev) ?? 0), 0),
    );

    return json(200, {
      ok: true,
      found: true,
      date,
      n_comparable_days: nComparable,
      day_total_eur,
      movers,
    });
  } catch (err: any) {
    console.error("[api/insight/sales-breakdown] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
