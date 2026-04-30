// src/pages/api/cron/competitor-alerts.ts
/*
  CRON JOB — Competitor Alert Generator

  Schedule: nightly 04:00 UTC (after competitor-surveillance at 03:00)

  Steps:
  1. Read confirmed competitor events from fct_competitor_events_conflicts
     that have conflict_score >= 2 and no existing alert
  2. Join raw.watched_events to find date overlaps with user's PILOTER dates
  3. Join raw.insight_event_user_location_profile for clerk_user_id + email
  4. Write alert rows to raw.competitor_alerts
  5. The existing alerts.ts email cron picks up high-level rows automatically
     via its own schedule — no modification needed to alerts.ts
*/

import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const BQ_LOCATION = String(process.env.BQ_LOCATION || "EU").trim();
  const createdAt   = new Date().toISOString();

  try {
    const bq = makeBQClient(projectId);

    // ── Step 1-3: Read conflicts, join watched_events and user profile ────────
    const [rows] = await bq.query({
      query: `
        WITH conflicts AS (
          SELECT
            ce.competitor_event_id,
            ce.competitor_id,
            ce.location_id,
            ce.event_name                 AS competitor_event_name,
            ce.event_date                 AS competitor_event_date,
            ce.event_date_end             AS competitor_event_date_end,
            ce.distance_from_location_m,
            ce.conflict_score,
            entity_threat_score,
            entity_threat_level,
            entity_threat_audience_pct,
            entity_threat_industry_tier,
            entity_threat_seasonality_flag,
            entity_threat_distance_km,
            ce.date_conflict,
            ce.industry_overlap,
            ce.audience_overlap,
            ce.distance_flag,
            cd.competitor_name
          FROM \`${projectId}.mart.fct_competitor_events_conflicts\` ce
          LEFT JOIN \`${projectId}.mart.fct_competitor_directory\` cd
            ON ce.competitor_id = cd.competitor_id
          WHERE ce.conflict_score >= 2
            AND ce.event_date IS NOT NULL
            AND ce.event_date >= CURRENT_DATE()
        ),

        -- Match competitor event dates against user's watched (PILOTER) dates
        overlap AS (
          SELECT
            c.competitor_event_id,
            c.competitor_id,
            c.location_id,
            c.competitor_event_name,
            c.competitor_event_date,
            c.competitor_event_date_end,
            c.distance_from_location_m,
            c.conflict_score,
            entity_threat_score,
            entity_threat_level,
            entity_threat_audience_pct,
            entity_threat_industry_tier,
            entity_threat_seasonality_flag,
            entity_threat_distance_km,
            c.date_conflict,
            c.industry_overlap,
            c.audience_overlap,
            c.distance_flag,
            c.competitor_name,
            w.watched_event_id,
            w.event_name                  AS watched_event_name,
            w.event_date_start            AS watched_date_start,
            w.event_date_end              AS watched_date_end
          FROM conflicts c
          LEFT JOIN \`${projectId}.raw.watched_events\` w
            ON c.location_id = w.location_id
            AND w.deleted_at IS NULL
            AND c.competitor_event_date BETWEEN w.event_date_start
                AND COALESCE(w.event_date_end, w.event_date_start)
        ),

        -- Exclude already-alerted competitor_event_id
        new_conflicts AS (
          SELECT o.*
          FROM overlap o
          LEFT JOIN \`${projectId}.raw.competitor_alerts\` ca
            ON o.competitor_event_id = ca.competitor_event_id
          WHERE ca.competitor_alert_id IS NULL
        )

        SELECT
          nc.*,
          p.clerk_user_id,
          p.email
        FROM new_conflicts nc
        JOIN (
          SELECT location_id, clerk_user_id, email
          FROM \`${projectId}.raw.insight_event_user_location_profile\`
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id ORDER BY updated_at DESC
          ) = 1
        ) p ON nc.location_id = p.location_id
        WHERE p.clerk_user_id IS NOT NULL
        LIMIT 500
      `,
      location: BQ_LOCATION,
    });

    const conflicts = rows as any[];

    if (conflicts.length === 0) {
      return new Response(JSON.stringify({ ok: true, written: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // ── Step 4: Determine alert_level and subtype, write rows ─────────────────
    let written = 0;
    const errors: string[] = [];

    for (const row of conflicts) {
      try {
        // alert_level: based on conflict_score + watched_event overlap
        // 4 = conflict_score >= 3 AND date overlaps a watched event
        // 3 = conflict_score >= 2 AND date overlaps a watched event
        // 2 = conflict_score >= 2 but no watched event overlap
        const hasWatchedOverlap = !!row.watched_event_id;
        const alertLevel: number =
          row.conflict_score >= 3 && hasWatchedOverlap ? 4
          : row.conflict_score >= 2 && hasWatchedOverlap ? 3
          : 2;

        // change_subtype: most severe signal present
        const changeSubtype: string =
          row.industry_overlap && row.audience_overlap ? "industry_audience_overlap"
          : row.industry_overlap ? "industry_overlap"
          : row.audience_overlap ? "audience_overlap"
          : row.distance_flag ? "proximity"
          : "date_conflict";

        // direction: always down for competitor conflicts (threat)
        const direction = "down";

        // old_value / new_value: encode conflict signal as human-readable change
        const oldValue = row.watched_event_name
          ? `Pas de concurrent connu sur "${row.watched_event_name}"`
          : null;
        const newValue = row.competitor_name
          ? `${row.competitor_name} détecté le ${row.competitor_event_date}`
          : `Concurrent détecté le ${row.competitor_event_date}`;

        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_alerts\` (
              competitor_alert_id,
              competitor_event_id,
              competitor_id,
              location_id,
              clerk_user_id,
              alert_level,
              change_category,
              change_subtype,
              affected_date,
              event_label,
              old_value,
              new_value,
              score_delta,
              direction,
              distance_m,
              conflict_score,
              entity_threat_score,
              entity_threat_level,
              entity_threat_audience_pct,
              entity_threat_industry_tier,
              entity_threat_seasonality_flag,
              entity_threat_distance_km,
              watched_event_id,
              watched_event_name,
              created_at,
              notified_at
            ) VALUES (
              @competitor_alert_id,
              @competitor_event_id,
              @competitor_id,
              @location_id,
              @clerk_user_id,
              @alert_level,
              'competition',
              @change_subtype,
              @affected_date,
              @event_label,
              @old_value,
              @new_value,
              NULL,
              @direction,
              @distance_m,
              @conflict_score,
              @entity_threat_score,
              @entity_threat_level,
              @entity_threat_audience_pct,
              @entity_threat_industry_tier,
              @entity_threat_seasonality_flag,
              @entity_threat_distance_km,
              @watched_event_id,
              @watched_event_name,
              @created_at,
              NULL
            )
          `,
          params: {
            competitor_alert_id: randomUUID(),
            competitor_event_id: row.competitor_event_id,
            competitor_id:       row.competitor_id,
            location_id:         row.location_id,
            clerk_user_id:       row.clerk_user_id,
            alert_level:         alertLevel,
            change_subtype:      changeSubtype,
            affected_date:       row.competitor_event_date ?? null,
            event_label:         row.competitor_event_name ?? null,
            old_value:           oldValue,
            new_value:           newValue,
            direction,
            distance_m:          row.distance_from_location_m ?? null,
            conflict_score:      row.conflict_score,
            entity_threat_score:      row.entity_threat_score ?? null,
            entity_threat_level:      row.entity_threat_level ?? null,
            entity_threat_audience_pct: row.entity_threat_audience_pct ?? null,
            entity_threat_industry_tier: row.entity_threat_industry_tier ?? null,
            entity_threat_seasonality_flag: row.entity_threat_seasonality_flag ?? null,
            entity_threat_distance_km: row.entity_threat_distance_km ?? null,
            watched_event_id:    row.watched_event_id ?? null,
            watched_event_name:  row.watched_event_name ?? null,
            created_at:          createdAt,
          },
          location: BQ_LOCATION,
        });

        written++;
      } catch (err: any) {
        errors.push(`${row.competitor_event_id}: ${err?.message ?? String(err)}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, written, errors }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};