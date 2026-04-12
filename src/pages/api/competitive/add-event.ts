import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";

export const prerender = false;

const VALID_SOURCE_SYSTEM = new Set([
  "ms_database", "user_manual", "agent_auto", "eventbrite", "openagenda", "predictHQ"
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

    const event_name = String(body?.event_name || "").trim();
    const event_city = String(body?.event_city || "").trim();
    const date_start = (() => {
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

    const date_end = (() => {
      const v = String(body?.date_end || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    })();

    const calendar_item_uid = String(body?.calendar_item_uid || "").trim() || null;
    const source_system = VALID_SOURCE_SYSTEM.has(body?.source_system) ? body.source_system : "user_manual";
    const confidence_score = (() => {
      const v = typeof body?.confidence_score === "number" ? body.confidence_score : null;
      if (v === null) return source_system === "ms_database" ? 0.9 : 0.5;
      return Math.min(1, Math.max(0, v));
    })();

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Deduplication check
    const [existing] = await bq.query({
      query: `
        SELECT watched_event_id, confidence_score
        FROM \`${projectId}.raw.watched_events\`
        WHERE clerk_user_id = @clerk_user_id
          AND location_id = @location_id
          AND LOWER(event_name) LIKE CONCAT('%', LOWER(@event_name_partial), '%')
          AND ABS(DATE_DIFF(event_date_start, DATE(@date_start), DAY)) <= 3
          AND deleted_at IS NULL
        LIMIT 1
      `,
      params: {
        clerk_user_id,
        location_id,
        event_name_partial: event_name.split(' ')[0] ?? event_name,
        date_start,
      },
      types: {
        clerk_user_id:      "STRING",
        location_id:        "STRING",
        event_name_partial: "STRING",
        date_start:         "STRING",
      },
      location: BQ_LOCATION,
    });

    if (Array.isArray(existing) && existing.length > 0) {
      // Second user confirms same event — boost confidence
      const current = existing[0];
      const newConfidence = Math.min(1, (Number(current.confidence_score) || 0.5) + 0.2);

      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.watched_events\`
          SET confidence_score = @confidence
          WHERE watched_event_id = @watched_event_id
            AND deleted_at IS NULL
        `,
        params: { confidence: newConfidence, watched_event_id: String(current.watched_event_id) },
        types: { confidence: "FLOAT64", watched_event_id: "STRING" },
        location: BQ_LOCATION,
      });

      return new Response(JSON.stringify({
        ok: true,
        action: "already_watched",
        watched_event_id: current.watched_event_id,
        confidence_score: newConfidence,
      }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }

    const watched_event_id = randomUUID();

    await bq.query({
      query: `
        INSERT INTO \`${projectId}.raw.watched_events\` (
          watched_event_id, clerk_user_id, location_id,
          calendar_item_uid, event_name, event_date_start, event_date_end,
          event_city, source_system, confidence_score, created_at, deleted_at
        ) VALUES (
          @watched_event_id, @clerk_user_id, @location_id,
          @calendar_item_uid, @event_name, DATE(@date_start), ${date_end ? "DATE(@date_end)" : "NULL"},
          @event_city, @source_system, @confidence_score, CURRENT_TIMESTAMP(), NULL
        )
      `,
      params: {
        watched_event_id,
        clerk_user_id,
        location_id,
        calendar_item_uid: calendar_item_uid ?? null,
        event_name,
        date_start,
        ...(date_end ? { date_end } : {}),
        event_city,
        source_system,
        confidence_score,
      },
      types: {
        watched_event_id:  "STRING",
        clerk_user_id:     "STRING",
        location_id:       "STRING",
        calendar_item_uid: "STRING",
        event_name:        "STRING",
        date_start:        "STRING",
        ...(date_end ? { date_end: "STRING" } : {}),
        event_city:        "STRING",
        source_system:     "STRING",
        confidence_score:  "FLOAT64",
      },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({
      ok: true,
      action: "created",
      watched_event_id,
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