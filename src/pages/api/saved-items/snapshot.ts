import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    }

    const body = await request.json().catch(() => null);
    const saved_item_id = String(body?.saved_item_id || "").trim();
    const selected_date = String(body?.selected_date || "").trim();

    if (!saved_item_id || !selected_date || !/^\d{4}-\d{2}-\d{2}$/.test(selected_date)) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    await bq.query({
      query: `
        INSERT INTO \`${projectId}.raw.saved_item_snapshots\`
        SELECT
          @saved_item_id                    AS saved_item_id,
          @location_id                      AS location_id,
          @clerk_user_id                    AS clerk_user_id,
          PARSE_DATE('%F', @selected_date)  AS selected_date,
          CURRENT_TIMESTAMP()               AS snapshotted_at,
          opportunity_score_final_local     AS opportunity_score,
          opportunity_regime                AS opportunity_regime,
          lvl_rain,
          lvl_wind,
          lvl_snow,
          lvl_heat,
          lvl_cold,
          alert_level_max,
          delta_att_events_pct,
          delta_att_mobility_car_pct,
          is_forced_regime_c_flag,
          primary_score_driver_label,
          weather_label_fr,
          competition_presence_flag,
          events_within_5km_count,
          mobility_status_region
        FROM \`${projectId}.semantic.vw_insight_event_day_surface\`
        WHERE location_id = @location_id
          AND date = PARSE_DATE('%F', @selected_date)
        LIMIT 1
      `,
      params: { saved_item_id, location_id, clerk_user_id, selected_date },
      types: { saved_item_id: "STRING", location_id: "STRING", clerk_user_id: "STRING", selected_date: "STRING" },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    console.error("[snapshot] error:", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
    }

    const saved_item_id = url.searchParams.get("saved_item_id") || "";
    if (!saved_item_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing saved_item_id" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const [[snapRows], [bilanRows]] = await Promise.all([
      bq.query({
        query: `SELECT * FROM \`${projectId}.raw.saved_item_snapshots\` WHERE saved_item_id = @saved_item_id AND clerk_user_id = @clerk_user_id LIMIT 1`,
        params: { saved_item_id, clerk_user_id },
        location: BQ_LOCATION,
      }),
      bq.query({
        query: `SELECT submitted_at FROM \`${projectId}.raw.event_outcomes\` WHERE saved_item_id = @saved_item_id AND clerk_user_id = @clerk_user_id LIMIT 1`,
        params: { saved_item_id, clerk_user_id },
        location: BQ_LOCATION,
      }),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      snapshot: snapRows?.[0] ?? null,
      bilan_submitted: Array.isArray(bilanRows) && bilanRows.length > 0,
    }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
};