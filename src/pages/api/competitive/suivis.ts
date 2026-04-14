import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const [evtRows, compRows, locationRows] = await Promise.all([
      bq.query({
        query: `
          SELECT
            watched_event_id, location_id, event_name,
            FORMAT_DATE('%Y-%m-%d', event_date_start) AS date_start,
            FORMAT_DATE('%Y-%m-%d', event_date_end) AS date_end,
            event_city
          FROM \`${projectId}.raw.watched_events\`
          WHERE clerk_user_id = @clerk_user_id
            AND deleted_at IS NULL
          ORDER BY event_date_start ASC
        `,
        params: { clerk_user_id },
        types: { clerk_user_id: "STRING" },
        location: BQ_LOCATION,
      }),
      bq.query({
      query: `
        SELECT
          wc.watched_competitor_id,
          wc.location_id,
          wc.competitor_name,
          wc.industry_code,
          wc.city,
          wc.competitor_id,
          wc.source_url                         AS wc_source_url,
          wc.confidence_score                   AS wc_confidence_score,
          cd.source_url                         AS cd_source_url,
          cd.confidence_score                   AS cd_confidence_score,
          cd.is_user_vetted,
          cd.description,
          cd.address,
          cd.google_rating,
          cd.google_review_count,
          cd.google_review_summary,
          cd.photos
        FROM \`${projectId}.raw.watched_competitors\` wc
        LEFT JOIN \`${projectId}.raw.competitor_directory\` cd
          ON wc.competitor_id = cd.competitor_id
          AND cd.deleted_at IS NULL
        WHERE wc.clerk_user_id = @clerk_user_id
          AND wc.deleted_at IS NULL
        ORDER BY wc.created_at ASC
      `,
      params: { clerk_user_id },
      types: { clerk_user_id: "STRING" },
      location: BQ_LOCATION,
    }),
      bq.query({
        query: `
          SELECT location_id, COALESCE(site_name, company_name, location_id) AS location_label
          FROM \`${projectId}.raw.insight_event_user_location_profile\`
          WHERE clerk_user_id = @clerk_user_id
        `,
        params: { clerk_user_id },
        types: { clerk_user_id: "STRING" },
        location: BQ_LOCATION,
      }),
    ]);

    const locationMap: Record<string, string> = {};
    (locationRows[0] ?? []).forEach((r: any) => {
      locationMap[r.location_id] = r.location_label ?? r.location_id;
    });

    const events = (evtRows[0] ?? []).map((r: any) => ({
      id:             r.watched_event_id,
      type:           'event',
      location_id:    r.location_id,
      location_label: locationMap[r.location_id] ?? r.location_id,
      name:           r.event_name,
      date_start:     r.date_start ?? null,
      date_end:       r.date_end ?? null,
      city:           r.event_city ?? null,
    }));

    const competitors = (compRows[0] ?? []).map((r: any) => ({
      id:                   r.watched_competitor_id,
      type:                 'competitor',
      location_id:          r.location_id,
      location_label:       locationMap[r.location_id] ?? r.location_id,
      name:                 r.competitor_name,
      industry_code:        r.industry_code ?? null,
      city:                 r.city ?? null,
      competitor_id:        r.competitor_id ?? null,
      // source_url: prefer watched_competitors (user-set), fall back to directory
      source_url:           r.wc_source_url ?? r.cd_source_url ?? null,
      confidence_score:     r.wc_confidence_score ?? r.cd_confidence_score ?? null,
      is_user_vetted:       r.is_user_vetted ?? false,
      description:          r.description ?? null,
      address:              r.address ?? null,
      google_rating:        r.google_rating ?? null,
      google_review_count:  r.google_review_count ?? null,
      google_review_summary: r.google_review_summary ?? null,
      photos:               r.photos ?? null,
    }));

    return new Response(JSON.stringify({ ok: true, events, competitors }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[suivis]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};