import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const selected_date = url.searchParams.get("selected_date")?.trim() || "";
    if (!selected_date || !/^\d{4}-\d{2}-\d{2}$/.test(selected_date)) {
      return new Response(JSON.stringify({ ok: false, error: "Missing or invalid selected_date" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const [rows] = await bq.query({
      query: `
        SELECT
          competitor_event_id,
          competitor_id,
          competitor_name,
          signal_type,
          event_name,
          event_date,
          event_date_end,
          venue_name,
          event_city,
          distance_from_location_m,
          conflict_score,
          industry_overlap,
          audience_overlap,
          distance_flag
        FROM \`${projectId}.semantic.vw_insight_event_competitor_signals\`
        WHERE location_id = @location_id
          AND event_date IS NOT NULL
          AND event_date BETWEEN
            DATE_SUB(DATE(@selected_date), INTERVAL 7 DAY)
            AND DATE_ADD(DATE(@selected_date), INTERVAL 7 DAY)
        ORDER BY
          ABS(DATE_DIFF(event_date, DATE(@selected_date), DAY)) ASC,
          conflict_score DESC
        LIMIT 10
      `,
      params: { location_id, selected_date },
      types:  { location_id: "STRING", selected_date: "STRING" },
      location: BQ_LOCATION,
    });

    const [countRows] = await bq.query({
      query: `
        SELECT COUNT(*) AS cnt
        FROM \`${projectId}.raw.watched_competitors\`
        WHERE clerk_user_id = @clerk_user_id
          AND deleted_at IS NULL
      `,
      params: { clerk_user_id },
      types: { clerk_user_id: "STRING" },
      location: BQ_LOCATION,
    });
    const followed_count = Number((countRows as any[])[0]?.cnt ?? 0);

    const signals = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      competitor_event_id:      r.competitor_event_id,
      competitor_id:            r.competitor_id,
      competitor_name:          r.competitor_name ?? null,
      signal_type:              r.signal_type ?? null,
      event_name:               r.event_name ?? null,
      event_date:               r.event_date ?? null,
      event_date_end:           r.event_date_end ?? null,
      venue_name:               r.venue_name ?? null,
      event_city:               r.event_city ?? null,
      distance_from_location_m: r.distance_from_location_m ?? null,
      conflict_score:           r.conflict_score ?? 0,
      industry_overlap:         r.industry_overlap ?? false,
      audience_overlap:         r.audience_overlap ?? false,
      distance_flag:            r.distance_flag ?? false,
    }));

    return new Response(JSON.stringify({ ok: true, signals, followed_count }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[competitor-signals]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};