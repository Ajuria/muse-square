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

    const body             = await request.json().catch(() => null);
    const competitor_name  = String(body?.competitor_name  || "").trim();
    const competitor_city  = String(body?.competitor_city  || "").trim();

    if (!competitor_name || !competitor_city) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    let [rows] = await bq.query({
      query: `
        SELECT
          competitor_id,
          competitor_name,
          address,
          city,
          city_id,
          region_code_insee,
          industry_code,
          industry_bucket,
          primary_audience,
          secondary_audience,
          lat,
          lon,
          source_system,
          google_place_id,
          photos,
          google_rating,
          google_review_count,
          google_review_summary,
          description,
          source_url,
          confidence_score,
          is_user_vetted
        FROM \`${projectId}.semantic.vw_insight_event_competitor_lookup\`
        WHERE (
          competitor_name_norm LIKE CONCAT('%', LOWER(@name_full), '%')
        )
        AND (
          city_norm LIKE CONCAT('%', LOWER(@competitor_city), '%')
          OR city_id = @competitor_city
        )
        AND source_system != 'ms_database'
        ORDER BY
          CASE WHEN competitor_name_norm = LOWER(@competitor_name) THEN 0 ELSE 1 END,
          is_user_vetted DESC,
          confidence_score DESC
        LIMIT 10
      `,
      params: {
        name_full:       competitor_name,
        competitor_name: competitor_name.toLowerCase(),
        competitor_city: competitor_city.toLowerCase(),
      },
      types: {
        name_full:       "STRING",
        competitor_name: "STRING",
        competitor_city: "STRING",
      },
      location: BQ_LOCATION,
    });

    // Fallback: query raw.competitor_directory directly if view returned nothing
    if (!Array.isArray(rows) || rows.length === 0) {
      [rows] = await bq.query({
        query: `
          SELECT
            competitor_id,
            competitor_name,
            address,
            city,
            NULL AS city_id,
            NULL AS region_code_insee,
            industry_code,
            NULL AS industry_bucket,
            primary_audience,
            secondary_audience,
            lat,
            lon,
            source_system,
            google_place_id,
            photos,
            google_rating,
            google_review_count,
            google_review_summary,
            description,
            source_url,
            confidence_score,
            is_user_vetted
          FROM \`${projectId}.raw.competitor_directory\`
          WHERE LOWER(competitor_name) LIKE CONCAT('%', LOWER(@name_full), '%')
            AND LOWER(city) LIKE CONCAT('%', LOWER(@competitor_city), '%')
            AND deleted_at IS NULL
          ORDER BY
            CASE WHEN LOWER(competitor_name) = LOWER(@competitor_name) THEN 0 ELSE 1 END,
            is_user_vetted DESC,
            confidence_score DESC
          LIMIT 10
        `,
        params: {
          name_full:       competitor_name,
          competitor_name: competitor_name.toLowerCase(),
          competitor_city: competitor_city.toLowerCase(),
        },
        types: {
          name_full:       "STRING",
          competitor_name: "STRING",
          competitor_city: "STRING",
        },
        location: BQ_LOCATION,
      });
    }

    const exists = Array.isArray(rows) && rows.length > 0;

    return new Response(JSON.stringify({
      ok: true,
      exists,
      matches: exists ? rows.map((r: any) => ({
        competitor_id:        r.competitor_id,
        competitor_name:      r.competitor_name,
        address:              r.address ?? null,
        city:                 r.city ?? competitor_city,
        city_id:              r.city_id ?? null,
        region_code_insee:    r.region_code_insee ?? null,
        industry_code:        r.industry_code ?? null,
        industry_bucket:      r.industry_bucket ?? null,
        primary_audience:     r.primary_audience ?? null,
        secondary_audience:   r.secondary_audience ?? null,
        lat:                  r.lat ?? null,
        lon:                  r.lon ?? null,
        source_system:        r.source_system ?? null,
        google_place_id:      r.google_place_id ?? null,
        photos:               r.photos ?? null,
        google_rating:        r.google_rating ?? null,
        google_review_count:  r.google_review_count ?? null,
        google_review_summary: r.google_review_summary ?? null,
        description:          r.description ?? null,
        source_url:           r.source_url ?? null,
        confidence_score:     r.confidence_score ?? null,
        is_user_vetted:       r.is_user_vetted ?? false,
      })) : [],
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[check-competitor]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};