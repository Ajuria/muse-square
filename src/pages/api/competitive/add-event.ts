import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";

export const prerender = false;

const BUCKET_MAP: Record<string, string> = {
  non_profit:         "institutional_activity",
  wellness:           "leisure_activity",
  cinema_theatre:     "culture_event",
  commercial:         "commercial_activity",
  institutional:      "institutional_activity",
  culture:            "culture_event",
  family:             "institutional_activity",
  live_event:         "culture_event",
  hotel_lodging:      "commercial_activity",
  food_nightlife:     "commercial_activity",
  science_innovation: "institutional_activity",
  pro_event:          "commercial_activity",
  sport:              "leisure_activity",
  transport_mobility: "institutional_activity",
  outdoor_leisure:    "leisure_activity",
  nightlife:          "culture_event",
  unknown:            "commercial_activity",
};

const VALID_INDUSTRY = new Set([
  "non_profit","wellness","cinema_theatre","commercial","institutional",
  "culture","family","live_event","hotel_lodging","food_nightlife",
  "science_innovation","pro_event","sport","transport_mobility",
  "outdoor_leisure","nightlife","unknown"
]);

const VALID_AUDIENCE = new Set([
  "local","tourists","mixed","professionals","students","families","seniors"
]);

const VALID_SOURCE_SYSTEM = new Set([
  "user_manual","agent_auto","eventbrite","openagenda","predictHQ"
]);

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

    // ---- Required fields ----
    const event_name  = String(body?.event_name  || "").trim();
    const event_city  = String(body?.event_city  || "").trim();
    const date_start  = (() => {
      const v = String(body?.date_start || "").trim();
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
    })();

    if (!event_name || !event_city || !date_start) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields: event_name, event_city, date_start" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_start)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid date_start format — use YYYY-MM-DD" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    // ---- Optional fields — sanitized ----
    const date_end = (() => {
      const v = String(body?.date_end || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    })();

    const event_address    = String(body?.event_address    || "").trim() || null;
    const event_lat        = typeof body?.event_lat === "number" && Number.isFinite(body.event_lat)  ? body.event_lat  : null;
    const event_lon        = typeof body?.event_lon === "number" && Number.isFinite(body.event_lon)  ? body.event_lon  : null;
    const event_type       = String(body?.event_type       || "").trim() || null;
    const description      = String(body?.description      || "").trim().slice(0, 500) || null;
    const organizer_name   = String(body?.organizer_name   || "").trim() || null;
    const source_url       = String(body?.source_url       || "").trim() || null;

    const source_type      = String(body?.source_type      || "").trim() || null;
    const source_system    = VALID_SOURCE_SYSTEM.has(body?.source_system) ? body.source_system : "user_manual";

    const industry_code    = VALID_INDUSTRY.has(body?.industry_code)  ? body.industry_code  : null;
    const industry_bucket  = industry_code ? (BUCKET_MAP[industry_code] ?? null) : null;
    const primary_audience = VALID_AUDIENCE.has(body?.primary_audience)  ? body.primary_audience  : null;
    const secondary_audience = VALID_AUDIENCE.has(body?.secondary_audience) ? body.secondary_audience : null;

    const estimated_attendance = typeof body?.estimated_attendance === "number" && Number.isFinite(body.estimated_attendance)
      ? Math.round(body.estimated_attendance) : null;
    const venue_capacity       = typeof body?.venue_capacity === "number" && Number.isFinite(body.venue_capacity)
      ? Math.round(body.venue_capacity) : null;

    // Confidence score — validated server-side, never trust client
    const confidence_score = (() => {
      const v = typeof body?.confidence_score === "number" ? body.confidence_score : null;
      if (v === null) {
        // Derive from available signals if not provided
        if (source_url && industry_code && primary_audience) return 0.7;
        if (source_url) return 0.5;
        return 0.3;
      }
      return Math.min(1, Math.max(0, v));
    })();

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- Deduplication check before insert ----
    const [existing] = await bq.query({
      query: `
        SELECT event_id, confidence_score, community_confirmations
        FROM \`${projectId}.raw.user_contributed_events\`
        WHERE LOWER(event_city) = LOWER(@event_city)
          AND LOWER(event_name) LIKE CONCAT('%', LOWER(@event_name_partial), '%')
          AND ABS(DATE_DIFF(event_date_start, DATE(@date_start), DAY)) <= 3
        LIMIT 1
      `,
      params: {
        event_city,
        event_name_partial: event_name.split(" ")[0] ?? event_name,
        date_start,
      },
      types: {
        event_city:          "STRING",
        event_name_partial:  "STRING",
        date_start:          "STRING",
      },
      location: BQ_LOCATION,
    });

    // If duplicate exists — boost community_confirmations instead of inserting
    if (Array.isArray(existing) && existing.length > 0) {
      const dup = existing[0];
      const newConfirmations = (Number(dup.community_confirmations) || 0) + 1;
      const newConfidence    = Math.min(1, (Number(dup.confidence_score) || 0) + 0.1);

      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.user_contributed_events\`
          SET
            community_confirmations = @confirmations,
            confidence_score        = @confidence
          WHERE event_id = @event_id
        `,
        params: {
          confirmations: newConfirmations,
          confidence:    newConfidence,
          event_id:      String(dup.event_id),
        },
        types: {
          confirmations: "INT64",
          confidence:    "FLOAT64",
          event_id:      "STRING",
        },
        location: BQ_LOCATION,
      });

      return new Response(JSON.stringify({
        ok:        true,
        action:    "confirmed",
        event_id:  dup.event_id,
        community_confirmations: newConfirmations,
        confidence_score:        newConfidence,
      }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }

    // ---- Insert new event ----
    const event_id = randomUUID();

    await bq.query({
      query: `
        INSERT INTO \`${projectId}.raw.user_contributed_events\` (
          event_id, clerk_user_id, location_id,
          event_name, event_date_start, event_date_end,
          event_city, event_address, event_lat, event_lon,
          event_type, description, organizer_name,
          source_url, source_type, source_system,
          industry_code, industry_bucket,
          primary_audience, secondary_audience,
          estimated_attendance, venue_capacity,
          confidence_score, community_confirmations,
          created_at
        ) VALUES (
          @event_id, @clerk_user_id, @location_id,
          @event_name, DATE(@date_start), ${date_end ? "DATE(@date_end)" : "NULL"},
          @event_city, @event_address, @event_lat, @event_lon,
          @event_type, @description, @organizer_name,
          @source_url, @source_type, @source_system,
          @industry_code, @industry_bucket,
          @primary_audience, @secondary_audience,
          @estimated_attendance, @venue_capacity,
          @confidence_score, 1,
          CURRENT_TIMESTAMP()
        )
      `,
      params: {
        event_id,
        clerk_user_id,
        location_id,
        event_name,
        date_start,
        ...(date_end ? { date_end } : {}),
        event_city,
        event_address:        event_address        ?? null,
        event_lat:            event_lat            ?? null,
        event_lon:            event_lon            ?? null,
        event_type:           event_type           ?? null,
        description:          description          ?? null,
        organizer_name:       organizer_name       ?? null,
        source_url:           source_url           ?? null,
        source_type:          source_type          ?? null,
        source_system,
        industry_code:        industry_code        ?? null,
        industry_bucket:      industry_bucket      ?? null,
        primary_audience:     primary_audience     ?? null,
        secondary_audience:   secondary_audience   ?? null,
        estimated_attendance: estimated_attendance ?? null,
        venue_capacity:       venue_capacity       ?? null,
        confidence_score,
      },
      types: {
        event_id:             "STRING",
        clerk_user_id:        "STRING",
        location_id:          "STRING",
        event_name:           "STRING",
        date_start:           "STRING",
        ...(date_end ? { date_end: "STRING" } : {}),
        event_city:           "STRING",
        event_address:        "STRING",
        event_lat:            "FLOAT64",
        event_lon:            "FLOAT64",
        event_type:           "STRING",
        description:          "STRING",
        organizer_name:       "STRING",
        source_url:           "STRING",
        source_type:          "STRING",
        source_system:        "STRING",
        industry_code:        "STRING",
        industry_bucket:      "STRING",
        primary_audience:     "STRING",
        secondary_audience:   "STRING",
        estimated_attendance: "INT64",
        venue_capacity:       "INT64",
        confidence_score:     "FLOAT64",
      },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({
      ok:              true,
      action:          "created",
      event_id,
      confidence_score,
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[add-event]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};