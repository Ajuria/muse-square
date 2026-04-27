// src/pages/api/competitive/search-db.ts
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
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body  = await request.json().catch(() => null);
    const query = String(body?.query || "").trim();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ ok: false, error: "Query too short" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // 1. Get user's city_id for context
    const [locRows] = await bq.query({
      query: `
        SELECT city_id_granular AS city_id, latitude, longitude
        FROM \`${projectId}.dims.dim_client_location\`
        WHERE location_id = @location_id
        LIMIT 1
      `,
      params: { location_id },
      location: BQ_LOCATION,
    });
    const userCityId = locRows?.[0]?.city_id ?? null;
    const userLat    = locRows?.[0]?.latitude ?? null;
    const userLon    = locRows?.[0]?.longitude ?? null;

    // 2. Search events + competitors in parallel
    const queryLower = query.toLowerCase();
    // Split first word for partial matching (same pattern as check-event)
    const firstWord  = query.split(/\s+/)[0] || query;

    const [eventResult, competitorResult, directoryResult, watchedEventsResult, watchedCompetitorsResult] = await Promise.all([
      // Events from event calendar lookup
      bq.query({
        query: `
          SELECT
            calendar_item_uid AS id,
            event_name AS name,
            event_start_date,
            event_end_date,
            city_name,
            industry_code,
            source_system,
            description,
            'event' AS type
          FROM \`${projectId}.semantic.vw_insight_eventcalendar_event_lookup\`
          WHERE (
            LOWER(event_name) LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(description) LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(keywords) LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(theme) LIKE CONCAT('%', LOWER(@query), '%')
          )
          AND event_start_date >= CURRENT_DATE()
          GROUP BY calendar_item_uid, event_name, event_start_date, event_end_date,
                   city_name, industry_code, source_system, description
          ORDER BY
            CASE WHEN LOWER(event_name) LIKE CONCAT('%', LOWER(@query), '%') THEN 0 ELSE 1 END,
            event_start_date ASC
          LIMIT 10
        `,
        params: { query: queryLower },
        types:  { query: "STRING" },
        location: BQ_LOCATION,
      }),

      // Competitors from competitor lookup + raw fallback
      bq.query({
        query: `
          SELECT
            competitor_id AS id,
            competitor_name AS name,
            city,
            city_id,
            industry_code,
            source_system,
            description,
            source_url,
            google_rating,
            google_rating_count,
            lat,
            lon,
            confidence_score,
            is_user_vetted,
            'competitor' AS type
          FROM \`${projectId}.semantic.vw_insight_event_competitor_lookup\`
          WHERE (
            competitor_name_norm LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(description) LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(industry_code) LIKE CONCAT('%', LOWER(@query), '%')
          )
          AND source_system != 'ms_database'
          ORDER BY
            CASE WHEN competitor_name_norm LIKE CONCAT('%', LOWER(@query), '%') THEN 0 ELSE 1 END,
            is_user_vetted DESC,
            confidence_score DESC
          LIMIT 10
        `,
        params: { query: queryLower },
        types:  { query: "STRING" },
        location: BQ_LOCATION,
      }),

      // Competitors from competitor directory (manually added entries)
      bq.query({
        query: `
          SELECT
            competitor_id AS id,
            competitor_name AS name,
            city,
            city_id,
            industry_code,
            address,
            description,
            source_url,
            google_rating,
            google_rating_count,
            lat,
            lon,
            'competitor' AS type
          FROM \`${projectId}.mart.fct_competitor_directory\`
          WHERE (
            LOWER(competitor_name) LIKE CONCAT('%', LOWER(@query), '%')
            OR LOWER(description) LIKE CONCAT('%', LOWER(@query), '%')
          )
          ORDER BY
            CASE WHEN LOWER(competitor_name) LIKE CONCAT('%', LOWER(@query), '%') THEN 0 ELSE 1 END
          LIMIT 10
        `,
        params: { query: queryLower },
        types:  { query: "STRING" },
        location: BQ_LOCATION,
      }),

      // Watched events (to set is_followed flag)
      bq.query({
        query: `
          SELECT watched_event_name
          FROM \`${projectId}.raw.watched_events\`
          WHERE location_id = @location_id
            AND deleted_at IS NULL
        `,
        params: { location_id },
        location: BQ_LOCATION,
      }),

      // Watched competitors (to set is_followed flag)
      bq.query({
        query: `
          SELECT competitor_name
          FROM \`${projectId}.raw.watched_competitors\`
          WHERE location_id = @location_id
            AND deleted_at IS NULL
        `,
        params: { location_id },
        location: BQ_LOCATION,
      }),
    ]);

    const [eventRows]      = eventResult;
    const [competitorRows] = competitorResult;
    const [directoryRows]  = directoryResult;
    const [watchedEvents]  = watchedEventsResult;
    const [watchedComps]   = watchedCompetitorsResult;

    // Build followed lookup sets
    const followedEventNames = new Set(
      (watchedEvents || []).map((r: any) => String(r.watched_event_name || "").toLowerCase().trim())
    );
    const followedCompNames = new Set(
      (watchedComps || []).map((r: any) => String(r.competitor_name || "").toLowerCase().trim())
    );

    // Compute distance from user location
    function computeDistanceKm(lat: number | null, lon: number | null): number | null {
      if (userLat == null || userLon == null || lat == null || lon == null) return null;
      const R = 6371;
      const dLat = (lat - userLat) * Math.PI / 180;
      const dLon = (lon - userLon) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(userLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Deduplicate events by name + start_date
    const seenEvents = new Set<string>();
    const dedupedEvents = (Array.isArray(eventRows) ? eventRows : []).filter((r: any) => {
      const key = `${String(r.name || "").toLowerCase()}__${r.event_start_date?.value ?? r.event_start_date ?? ""}`;
      if (seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    });

    // Format event results
    const events = dedupedEvents.map((r: any) => {
      const startRaw = r.event_start_date?.value ?? r.event_start_date ?? null;
      const endRaw   = r.event_end_date?.value   ?? r.event_end_date   ?? null;
      const dateLabel = (() => {
        if (!startRaw) return null;
        const months = ["jan.","fév.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
        const [y, m, d] = startRaw.split("-");
        const start = `${parseInt(d)} ${months[parseInt(m) - 1]}`;
        if (!endRaw || endRaw === startRaw) return `${start} ${y}`;
        const [y2, m2, d2] = endRaw.split("-");
        return `${start} – ${parseInt(d2)} ${months[parseInt(m2) - 1]} ${y2}`;
      })();

      return {
        type:          "event" as const,
        id:            r.id,
        name:          r.name,
        city_name:     r.city_name ?? null,
        industry_code: r.industry_code ?? null,
        source_system: r.source_system ?? null,
        description:   r.description ?? null,
        date_label:    dateLabel,
        distance_km:   null as number | null,
        is_followed:   followedEventNames.has(String(r.name || "").toLowerCase().trim()),
      };
    });

    // Format competitor results
    // Merge competitor lookup + directory, deduplicate by id
    const seenCompIds = new Set<string>();
    const allCompetitorRows = [...(Array.isArray(competitorRows) ? competitorRows : []), ...(Array.isArray(directoryRows) ? directoryRows : [])].filter((r: any) => {
      const id = String(r.id || "");
      if (seenCompIds.has(id)) return false;
      seenCompIds.add(id);
      return true;
    });
    const competitors = allCompetitorRows.map((r: any) => {
      const distKm = computeDistanceKm(
        r.lat != null ? Number(r.lat) : null,
        r.lon != null ? Number(r.lon) : null,
      );

      return {
        type:           "competitor" as const,
        id:             r.id,
        name:           r.name,
        city_name:      r.city ?? null,
        industry_code:  r.industry_code ?? null,
        source_system:  r.source_system ?? null,
        description:    r.description ?? null,
        source_url:     r.source_url ?? null,
        google_rating:  r.google_rating ?? null,
        google_rating_count: r.google_rating_count ?? null,
        distance_km:    distKm,
        confidence_score: r.confidence_score ?? null,
        date_label:     null as string | null,
        is_followed:    followedCompNames.has(String(r.name || "").toLowerCase().trim()),
      };
    });

    // Merge and sort: followed first, then by type (events before competitors), then by distance
    const results = [...events, ...competitors].sort((a, b) => {
      // Followed items first
      if (a.is_followed !== b.is_followed) return a.is_followed ? -1 : 1;
      // Events before competitors
      if (a.type !== b.type) return a.type === "event" ? -1 : 1;
      // By distance (nulls last)
      const da = a.distance_km ?? 9999;
      const db = b.distance_km ?? 9999;
      return da - db;
    });

    return new Response(JSON.stringify({
      ok: true,
      results,
      query,
      event_count:      events.length,
      competitor_count: competitors.length,
    }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[search-db]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};