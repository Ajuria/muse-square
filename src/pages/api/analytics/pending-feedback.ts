import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const location_id = url.searchParams.get("location_id");
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

    const [rows] = await bq.query({
      query: `
        SELECT
          log_id,
          action_key,
          change_subtype,
          channel,
          affected_date,
          action_text,
          event,
          created_at
        FROM \`muse-square-open-data.analytics.action_log\`
        WHERE user_id = @userId
          AND location_id = @location_id
          AND event IN ('draft_generated', 'draft_copied')
          AND affected_date IS NOT NULL
          AND affected_date < CURRENT_DATE()
          AND affected_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        ORDER BY affected_date DESC
        LIMIT 5
      `,
      params: { userId, location_id },
      location: "EU",
    });

    const items = (rows || []).map((r: any) => ({
      log_id: r.log_id,
      action_key: r.action_key,
      change_subtype: r.change_subtype,
      channel: r.channel,
      affected_date: r.affected_date?.value ?? String(r.affected_date ?? ""),
      action_text: r.action_text,
      event: r.event,
    }));

    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};