import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

const bq = makeBQClient(process.env.BQ_PROJECT_ID || "");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requireString(v: string | null, name: string): string {
  const s = String(v || "").trim();
  if (!s) {
    throw new Error(`Missing required query param: ${name}`);
  }
  return s;
}

function normalizeYmd(v: string): string {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  return m[1];
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    const query = `
      SELECT
        date,
        location_id,
        client_lat,
        client_lon,
        nearest_transit_stop_id,
        nearest_transit_stop_name,
        nearest_transit_line_name,
        nearest_transit_stop_distance_m,
        signal_id,
        signal_type,
        event_uid,
        source_system,
        event_label,
        description,
        longDescription,
        keywords,
        theme,
        city_id,
        city_name,
        SAFE_CAST(event_lat AS FLOAT64) AS latitude,
        SAFE_CAST(event_lon AS FLOAT64) AS longitude,
        SAFE_CAST(distance_m AS FLOAT64) AS distance_m,
        radius_bucket,
        radius_precedence,
        industry_code,
        keyword_priority_rank,
        mobility_signal_type,
        mobility_title_merged,
        mobility_severity,
        mobility_perturbation_lvl,
        mobility_mode,
        mobility_disruption_category,
        mobility_is_active_flag,
        mobility_route_long_name,
        mobility_short_name,
        mobility_nom_commune,
        mobility_distance_meters,
        mobility_disruption_begin_ts,
        mobility_disruption_end_ts
      FROM \`muse-square-open-data.semantic.vw_insight_event_map_signals\`
      WHERE location_id = @location_id
        AND (date = @date OR signal_type = 'mobility_disruption')
      ORDER BY
        radius_precedence ASC,
        distance_m ASC,
        keyword_priority_rank ASC
    `;

    const [rows] = await bq.query({
      query,
      params: { location_id, date },
      location: "EU",
    });

    const events = (rows || [])
      .filter((r:any)=> r.latitude && r.longitude)
      .map((r: any) => ({
      id: String(r.signal_id),
      event_uid: r.event_uid,
      signal_type: r.signal_type,
      source_system: r.source_system,

      title: r.event_label || "",
      description: r.description || "",
      longDescription: r.longDescription || "",

      city_name: r.city_name || "",
      theme: r.theme || "",
      keywords: r.keywords || "",

      latitude: Number(r.latitude),
      longitude: Number(r.longitude),

      distance_m: r.distance_m ?? null,
      radius_bucket: r.radius_bucket,
      radius_precedence: r.radius_precedence,

      industry_code: r.industry_code,
      keyword_priority_rank: r.keyword_priority_rank
    }));

    const isMobilityDisruption = (r: any) => r.signal_type === 'mobility_disruption' && r.latitude && r.longitude;

    const road_disruptions = (rows || [])
      .filter((r: any) => isMobilityDisruption(r) && !['metro', 'rer', 'tram', 'bus'].includes(String(r.mobility_mode || '').toLowerCase()))
      .map((r: any) => ({
        id: String(r.signal_id ?? ''),
        title: r.mobility_title_merged || '',
        severity: r.mobility_severity || '',
        perturbation_lvl: r.mobility_perturbation_lvl ?? null,
        mode: r.mobility_mode || '',
        category: r.mobility_disruption_category || '',
        is_active: r.mobility_is_active_flag ?? false,
        route_long_name: r.mobility_route_long_name || '',
        short_name: r.mobility_short_name || '',
        city_name: r.mobility_nom_commune || '',
        distance_m: r.mobility_distance_meters ?? null,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        begin_ts: r.mobility_disruption_begin_ts ?? null,
        end_ts: r.mobility_disruption_end_ts ?? null,
      }));

    const hasNearestTransit = !!(rows?.find((r: any) => r.nearest_transit_stop_id != null)?.nearest_transit_stop_id);

    const subway_disruptions = hasNearestTransit
      ? (rows || [])
          .filter((r: any) => isMobilityDisruption(r) && ['metro', 'rer', 'tram'].includes(String(r.mobility_mode || '').toLowerCase()))
          .map((r: any) => ({
            id: String(r.signal_id ?? ''),
            title: r.mobility_title_merged || '',
            severity: r.mobility_severity || '',
            perturbation_lvl: r.mobility_perturbation_lvl ?? null,
            mode: r.mobility_mode || '',
            category: r.mobility_disruption_category || '',
            is_active: r.mobility_is_active_flag ?? false,
            route_long_name: r.mobility_route_long_name || '',
            short_name: r.mobility_short_name || '',
            city_name: r.mobility_nom_commune || '',
            distance_m: r.mobility_distance_meters ?? null,
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            begin_ts: r.mobility_disruption_begin_ts ?? null,
            end_ts: r.mobility_disruption_end_ts ?? null,
          }))
      : [];

    return json(200, {
      ok: true,
      meta: {
        location_id,
        date,
        venue: {
          lat: rows?.find((r: any) => r.client_lat != null)?.client_lat ?? null,
          lon: rows?.find((r: any) => r.client_lon != null)?.client_lon ?? null,
        },
        nearest_transit: {
          stop_id: rows?.[0]?.nearest_transit_stop_id ?? null,
          stop_name: rows?.[0]?.nearest_transit_stop_name ?? null,
          line: rows?.[0]?.nearest_transit_line_name ?? null,
          distance_m: rows?.[0]?.nearest_transit_stop_distance_m ?? null
        },
        event_count: events.length
      },
      events,
      road_disruptions,
      subway_disruptions
    });

  } catch (err: any) {

    return json(400, {
      ok: false,
      error: err?.message || "Unknown error",
      events: [],
      road_disruptions: [],
      subway_disruptions: []
    });

  }
};