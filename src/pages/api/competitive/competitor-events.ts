// src/pages/api/competitive/competitor-events.ts
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    if (!clerk_user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const competitor_id = url.searchParams.get("competitor_id")?.trim() || "";
    if (!competitor_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing competitor_id" }), {
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
          event_name,
          FORMAT_DATE('%Y-%m-%d', event_date)     AS event_date,
          FORMAT_DATE('%Y-%m-%d', event_date_end)  AS event_date_end,
          event_type,
          description,
          venue_name,
          event_city,
          capacity,
          estimated_attendance,
          venue_exposure,
          extracted_field_count,
          confirmation_source,
          crawled_at
        FROM \`${projectId}.raw.competitor_events\`
        WHERE competitor_id = @competitor_id
          AND is_user_confirmed = TRUE
          AND extraction_status IN ('success', 'partial')
          AND event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY competitor_id, event_name, event_date
          ORDER BY crawled_at DESC
        ) = 1
        ORDER BY event_date ASC
        LIMIT 20
      `,
      params: { competitor_id },
      types: { competitor_id: "STRING" },
      location: BQ_LOCATION,
    });

    const events = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      competitor_event_id:  r.competitor_event_id,
      event_name:           r.event_name ?? null,
      event_date:           r.event_date ?? null,
      event_date_end:       r.event_date_end ?? null,
      event_type:           r.event_type ?? null,
      description:          r.description ?? null,
      venue_name:           r.venue_name ?? null,
      event_city:           r.event_city ?? null,
      capacity:             r.capacity ?? null,
      estimated_attendance: r.estimated_attendance ?? null,
      venue_exposure:       r.venue_exposure ?? null,
      extracted_field_count: r.extracted_field_count ?? null,
      confirmation_source:  r.confirmation_source ?? null,
      crawled_at:           r.crawled_at ?? null,
    }));

    return new Response(JSON.stringify({ ok: true, events }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[competitor-events]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};