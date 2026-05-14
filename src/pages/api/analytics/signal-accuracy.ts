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
        SELECT signal_type, period, sample_size, accuracy_avg, accuracy_pct
        FROM \`muse-square-open-data.semantic.vw_insight_event_signal_accuracy\`
        WHERE location_id = @location_id
          AND period = 'month'
      `,
      params: { location_id },
      location: "EU",
    });

    const signals: Record<string, { accuracy_pct: number; sample_size: number }> = {};
    for (const r of (rows || [])) {
      signals[r.signal_type] = {
        accuracy_pct: Number(r.accuracy_pct || 0),
        sample_size: Number(r.sample_size || 0),
      };
    }

    return new Response(JSON.stringify({ ok: true, signals }), {
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