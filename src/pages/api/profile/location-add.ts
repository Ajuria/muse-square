import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import crypto from "node:crypto";

export const prerender = false;

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

async function geocodeWithBAN(q: string): Promise<{ lat: number; lon: number; citycode: string | null } | null> {
  const url = new URL("https://api-adresse.data.gouv.fr/search");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const f0 = data?.features?.[0];
    const coords = f0?.geometry?.coordinates;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const citycode = f0?.properties?.citycode ?? null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, citycode };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();
    const company_address = String(body.company_address || "").trim();

    if (!company_address) {
      return new Response(JSON.stringify({ ok: false, error: "company_address required" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId = process.env.BQ_PROJECT_ID!;
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
    const fullTable = `\`${projectId}.raw.insight_event_user_location_profile\``;

    // Copy all fields from primary location
    const [primaryRows] = await bigquery.query({
      query: `
        SELECT
          email, first_name, last_name, position,
          company_activity_type, location_type, event_time_profile,
          location_access_pattern, nearest_transit_stop, nearest_transit_stop_id,
          nearest_transit_lines, primary_audience_1, primary_audience_2,
          origin_city_id_1, origin_city_id_2, origin_city_id_3,
          origin_city_label_1, origin_city_label_2, origin_city_label_3
        FROM ${fullTable}
        WHERE clerk_user_id = @clerk_user_id AND is_primary = TRUE
        LIMIT 1
      `,
      params: { clerk_user_id },
      types: { clerk_user_id: "STRING" },
      location: BQ_LOCATION,
    });

    const p: any = Array.isArray(primaryRows) && primaryRows.length ? primaryRows[0] : {};
    const company_name = String(body.company_name || p.company_name || company_address).trim();
    const location_id = crypto.randomUUID();
    const company_address_key = sha256Hex(company_address.toUpperCase().replace(/\s+/g, " "));
    const geo = await geocodeWithBAN(company_address);
    const company_lat = geo?.lat ?? null;
    const company_lon = geo?.lon ?? null;
    const city_id = geo?.citycode ?? null;
    const geocode_status = geo ? "geocoded_ok" : "geocode_failed";

    await bigquery.query({
      query: `
        INSERT INTO ${fullTable} (
          clerk_user_id, location_id, email, first_name, last_name, position,
          company_name, company_address, company_address_key, city_id,
          company_lat, company_lon, company_geocode_status, company_geog,
          company_activity_type, location_type, event_time_profile,
          location_access_pattern, nearest_transit_stop, nearest_transit_stop_id,
          nearest_transit_lines, primary_audience_1, primary_audience_2,
          origin_city_id_1, origin_city_id_2, origin_city_id_3,
          origin_city_label_1, origin_city_label_2, origin_city_label_3,
          is_primary, created_at, updated_at,
          site_name, location_description, venue_capacity,
          event_type_1, event_type_2, event_type_3,
          weather_sensitivity, seasonality, operating_hours
        ) VALUES (
          @clerk_user_id, @location_id, @email, @first_name, @last_name, @position,
          @company_name, @company_address, @company_address_key, @city_id,
          @company_lat, @company_lon, @geocode_status,
          IF(@company_lat IS NULL OR @company_lon IS NULL, NULL, ST_GEOGPOINT(@company_lon, @company_lat)),
          @company_activity_type, @location_type, @event_time_profile,
          @location_access_pattern, @nearest_transit_stop, @nearest_transit_stop_id,
          @nearest_transit_lines, @primary_audience_1, @primary_audience_2,
          @origin_city_id_1, @origin_city_id_2, @origin_city_id_3,
          @origin_city_label_1, @origin_city_label_2, @origin_city_label_3,
          FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(),
          NULL, NULL, NULL,
          NULL, NULL, NULL,
          NULL, NULL, NULL
        )
      `,
      params: {
        clerk_user_id,
        location_id,
        email: p.email ?? null,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        position: p.position ?? null,
        company_name,
        company_address,
        company_address_key,
        city_id,
        company_lat,
        company_lon,
        geocode_status,
        company_activity_type: p.company_activity_type ?? null,
        location_type: p.location_type ?? null,
        event_time_profile: p.event_time_profile ?? null,
        location_access_pattern: p.location_access_pattern ?? null,
        nearest_transit_stop: p.nearest_transit_stop ?? null,
        nearest_transit_stop_id: p.nearest_transit_stop_id ?? null,
        nearest_transit_lines: p.nearest_transit_lines ?? null,
        primary_audience_1: p.primary_audience_1 ?? null,
        primary_audience_2: p.primary_audience_2 ?? null,
        origin_city_id_1: p.origin_city_id_1 ?? null,
        origin_city_id_2: p.origin_city_id_2 ?? null,
        origin_city_id_3: p.origin_city_id_3 ?? null,
        origin_city_label_1: p.origin_city_label_1 ?? null,
        origin_city_label_2: p.origin_city_label_2 ?? null,
        origin_city_label_3: p.origin_city_label_3 ?? null,
        site_name: null,
        location_description: null,
        venue_capacity: null,
        event_type_1: null,
        event_type_2: null,
        event_type_3: null,
        weather_sensitivity: null,
        seasonality: null,
        operating_hours: null,
      },
      types: {
        clerk_user_id: "STRING",
        location_id: "STRING",
        email: "STRING",
        first_name: "STRING",
        last_name: "STRING",
        position: "STRING",
        company_name: "STRING",
        company_address: "STRING",
        company_address_key: "STRING",
        city_id: "STRING",
        company_lat: "FLOAT64",
        company_lon: "FLOAT64",
        geocode_status: "STRING",
        company_activity_type: "STRING",
        location_type: "STRING",
        event_time_profile: "STRING",
        location_access_pattern: "STRING",
        nearest_transit_stop: "STRING",
        nearest_transit_stop_id: "STRING",
        nearest_transit_lines: "STRING",
        primary_audience_1: "STRING",
        primary_audience_2: "STRING",
        origin_city_id_1: "STRING",
        origin_city_id_2: "STRING",
        origin_city_id_3: "STRING",
        origin_city_label_1: "STRING",
        origin_city_label_2: "STRING",
        origin_city_label_3: "STRING",
        site_name: "STRING",
        location_description: "STRING",
        venue_capacity: "INT64",
        event_type_1: "STRING",
        event_type_2: "STRING",
        event_type_3: "STRING",
        weather_sensitivity: "INT64",
        seasonality: "STRING",
        operating_hours: "STRING",
      },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({ ok: true, location_id }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[location-add]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};