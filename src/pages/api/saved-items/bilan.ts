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
    const saved_item_id       = String(body?.saved_item_id || "").trim();
    const selected_date       = String(body?.selected_date || "").trim();
    const weather_accuracy    = String(body?.weather_accuracy || "").trim() || null;
    const competition_felt    = String(body?.competition_felt || "").trim() || null;
    const mobility_felt       = String(body?.mobility_felt || "").trim() || null;
    const attendance_vs_expect = String(body?.attendance_vs_expect || "").trim() || null;
    const attendance_approx   = typeof body?.attendance_approx === "number" ? body.attendance_approx : null;
    const free_comment        = String(body?.free_comment || "").trim() || null;
    const collection_channel  = String(body?.collection_channel || "in_app").trim();

    if (!saved_item_id || !selected_date || !/^\d{4}-\d{2}-\d{2}$/.test(selected_date)) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    await bq.query({
      query: `
        INSERT INTO \`${projectId}.raw.event_outcomes\`
        (saved_item_id, location_id, clerk_user_id, selected_date, submitted_at,
         weather_accuracy, competition_felt, mobility_felt, attendance_vs_expect,
         attendance_approx, free_comment, collection_channel)
        VALUES (
          @saved_item_id, @location_id, @clerk_user_id,
          PARSE_DATE('%F', @selected_date), CURRENT_TIMESTAMP(),
          @weather_accuracy, @competition_felt, @mobility_felt, @attendance_vs_expect,
          @attendance_approx, @free_comment, @collection_channel
        )
      `,
      params: {
        saved_item_id, location_id, clerk_user_id, selected_date,
        weather_accuracy, competition_felt, mobility_felt, attendance_vs_expect,
        attendance_approx: attendance_approx ?? null,
        free_comment: free_comment ?? null,
        collection_channel,
      },
      types: {
        saved_item_id: "STRING", location_id: "STRING", clerk_user_id: "STRING",
        selected_date: "STRING", weather_accuracy: "STRING", competition_felt: "STRING",
        mobility_felt: "STRING", attendance_vs_expect: "STRING",
        attendance_approx: "INT64", free_comment: "STRING", collection_channel: "STRING",
      },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
};