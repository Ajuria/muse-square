import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  console.log("[locations] locals keys:", Object.keys(locals || {}));
  console.log("[locations] clerk_user_id:", (locals as any)?.clerk_user_id);
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const projectId = process.env.BQ_PROJECT_ID!;
    const bigquery = makeBQClient(projectId);

    const [rows] = await bigquery.query({
      query: `
        SELECT
          location_id,
          COALESCE(site_name, company_name, company_address, '') AS site_name,
          company_name,
          company_address,
          company_lat,
          company_lon,
          is_primary,
          company_activity_type,
          location_type,
          location_access_pattern,
          primary_audience_1,
          primary_audience_2,
          origin_city_id_1, origin_city_id_2, origin_city_id_3,
          origin_city_label_1, origin_city_label_2, origin_city_label_3,
          event_type_1, event_type_2, event_type_3,
          CAST(weather_sensitivity AS STRING) AS weather_sensitivity,
          seasonality,
          event_time_profile,
          nearest_transit_stop,
          nearest_transit_stop_id,
          nearest_transit_lines,
          CAST(venue_capacity AS STRING) AS venue_capacity,
          location_description,
          operating_hours
        FROM \`${projectId}.raw.insight_event_user_location_profile\`
        WHERE clerk_user_id = @clerk_user_id
        ORDER BY is_primary DESC, created_at ASC
      `,
      location: (process.env.BQ_LOCATION || "EU").trim(),
      params: { clerk_user_id },
      types: { clerk_user_id: "STRING" },
    });

    return new Response(JSON.stringify({
      ok: true,
      locations: Array.isArray(rows) ? rows.map(r => ({
        location_id: r.location_id,
        company_name: r.company_name || null,
        company_address: r.company_address || null,
        company_lat: r.company_lat || null,
        company_lon: r.company_lon || null,
        is_primary: r.is_primary === true,
      })) : [],
    }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};