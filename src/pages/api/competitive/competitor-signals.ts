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
          distance_flag,
          google_rating,
          google_rating_count,
          google_photos,
          CASE
            WHEN event_date_end IS NULL OR event_date_end = event_date
            THEN DATE(@selected_date) = event_date
            WHEN DATE_DIFF(event_date_end, event_date, DAY) <= 3
            THEN DATE(@selected_date) = event_date
            ELSE DATE(@selected_date) BETWEEN event_date AND DATE_ADD(event_date, INTERVAL 1 DAY)
          END AS is_launch,
          DATE(@selected_date) BETWEEN event_date AND COALESCE(event_date_end, event_date)
          AS is_active,
          event_date > DATE(@selected_date)
          AS is_upcoming,
          competitor_primary_audience,
          competitor_secondary_audience,
          competitor_industry_code,
          location_industry_code,
          location_primary_audience_1,
          location_primary_audience_2,
          event_primary_audience,
          event_type
        FROM \`${projectId}.semantic.vw_insight_event_competitor_signals\`
        WHERE location_id = @location_id
          AND event_date IS NOT NULL
          AND event_name IS NOT NULL
          AND (
            event_date BETWEEN DATE_SUB(DATE(@selected_date), INTERVAL 7 DAY)
                           AND DATE_ADD(DATE(@selected_date), INTERVAL 7 DAY)
            OR DATE(@selected_date) BETWEEN event_date AND COALESCE(event_date_end, event_date)
          )
          AND NOT (
            event_date < DATE(@selected_date)
            AND COALESCE(event_date_end, event_date) < DATE(@selected_date)
          )
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY competitor_id, event_name
          ORDER BY conflict_score DESC
        ) = 1
        ORDER BY
          CASE
            WHEN event_date_end IS NULL OR event_date_end = event_date
            THEN CASE WHEN DATE(@selected_date) = event_date THEN 0 ELSE 1 END
            WHEN DATE_DIFF(event_date_end, event_date, DAY) <= 3
            THEN CASE WHEN DATE(@selected_date) = event_date THEN 0 ELSE 1 END
            ELSE CASE WHEN DATE(@selected_date) BETWEEN event_date AND DATE_ADD(event_date, INTERVAL 1 DAY) THEN 0 ELSE 1 END
          END,
          ABS(DATE_DIFF(event_date, DATE(@selected_date), DAY)) ASC,
          conflict_score DESC
        LIMIT 30
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
      google_rating:            r.google_rating ?? null,
      google_rating_count:      r.google_rating_count ?? null,
      google_photos:            r.google_photos ?? null,
      is_launch:                r.is_launch ?? false,
      is_active:                r.is_active ?? false,
      is_upcoming:              r.is_upcoming ?? false,
      competitor_primary_audience: r.competitor_primary_audience ?? null,
      competitor_secondary_audience: r.competitor_secondary_audience ?? null,
      competitor_industry_code:   r.competitor_industry_code ?? null,
      location_industry_code:     r.location_industry_code ?? null,
      location_primary_audience_1: r.location_primary_audience_1 ?? null,
      location_primary_audience_2: r.location_primary_audience_2 ?? null,
      event_primary_audience:     r.event_primary_audience ?? null,
      event_type:                 r.event_type ?? null,
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