import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const body = await request.json().catch(() => null);
    const event_name   = String(body?.event_name   || "").trim();
    const event_city   = String(body?.event_city   || "").trim();
    const date_start   = String(body?.date_start   || "").trim();

    if (!event_name || !event_city) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Check for existing event within ±3 days of date_start in same city
    const hasDate = date_start && /^\d{4}-\d{2}-\d{2}$/.test(date_start);

    const [rows] = await bq.query({
      query: `
        SELECT
          event_id,
          event_name,
          event_date_start,
          event_city,
          event_address,
          organizer_name,
          industry_code,
          industry_bucket,
          primary_audience,
          secondary_audience,
          location_type,
          description,
          source_url,
          source_type,
          confidence_score,
          community_confirmations
        FROM \`${projectId}.raw.user_contributed_events\`
        WHERE LOWER(event_city) = LOWER(@event_city)
          AND LOWER(event_name) LIKE CONCAT('%', LOWER(@event_name_partial), '%')
          AND (
            @has_date = FALSE
            OR ABS(DATE_DIFF(event_date_start, DATE(@date_start), DAY)) <= 3
          )
          AND confidence_score >= 0.5
        ORDER BY confidence_score DESC, community_confirmations DESC
        LIMIT 5
      `,
      params: {
        event_city,
        event_name_partial: event_name.split(' ')[0] ?? event_name,
        has_date: hasDate,
        date_start: hasDate ? date_start : "2000-01-01",
      },
      types: {
        event_city:           "STRING",
        event_name_partial:   "STRING",
        has_date:             "BOOL",
        date_start:           "STRING",
      },
      location: BQ_LOCATION,
    });

    const exists = Array.isArray(rows) && rows.length > 0;

    return new Response(JSON.stringify({
      ok: true,
      exists,
      matches: exists ? rows.map((r: any) => ({
        event_id:             r.event_id,
        event_name:           r.event_name,
        event_date_start:     r.event_date_start?.value ?? r.event_date_start ?? null,
        event_city:           r.event_city,
        event_address:        r.event_address ?? null,
        organizer_name:       r.organizer_name ?? null,
        industry_code:        r.industry_code ?? null,
        industry_bucket:      r.industry_bucket ?? null,
        primary_audience:     r.primary_audience ?? null,
        secondary_audience:   r.secondary_audience ?? null,
        description:          r.description ?? null,
        source_url:           r.source_url ?? null,
        source_type:          r.source_type ?? null,
        confidence_score:     r.confidence_score ?? null,
        community_confirmations: r.community_confirmations ?? 0,
      })) : [],
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[check-event]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};