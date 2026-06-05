import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { waitUntil } from "@vercel/functions";
export const prerender = false;

const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
const GRAPH_VERSION = "v25.0";

// Lifetime post metrics. If a call starts returning "(#100) ... valid insights metric"
// after a Meta deprecation, remove the offending name from this list.
const FB_POST_METRICS = ["post_impressions", "post_clicks", "post_engaged_users"];

async function fetchPostInsights(postId: string, token: string): Promise<any | null> {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${postId}/insights` +
    `?metric=${FB_POST_METRICS.join(",")}&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data) {
      console.error("[sync-fb-performance] insights error", postId, json?.error?.message || res.status);
      return null;
    }
    return json.data;
  } catch (e: any) {
    console.error("[sync-fb-performance] fetch error", postId, e?.message);
    return null;
  }
}

async function runFbSync() {
  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);

  // MS-published FB posts (last 30d) joined to the latest facebook config per location
  const [rows] = await bq.query({
    query: `
      WITH cfg AS (
        SELECT location_id, config_json
        FROM \`${projectId}.analytics.channel_configs\`
        WHERE channel = 'facebook' AND enabled = TRUE
        QUALIFY ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY updated_at DESC) = 1
      )
      SELECT p.location_id, p.external_post_id, cfg.config_json
      FROM \`${projectId}.analytics.publish_log\` p
      JOIN cfg USING (location_id)
      WHERE p.channel = 'facebook'
        AND p.publish_status = 'success'
        AND p.external_post_id IS NOT NULL
        AND p.published_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    `,
    location: BQ_LOCATION,
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[sync-fb-performance] no FB posts to sync");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const fetchedAt = new Date().toISOString();
  let synced = 0;
  let failed = 0;

  for (const row of rows) {
    const locationId = String(row.location_id);
    const postId = String(row.external_post_id);
    let config: any = {};
    try { config = JSON.parse(row.config_json || "{}"); } catch {}
    const token = config?.page_access_token;
    if (!token) { failed++; continue; }

    const data = await fetchPostInsights(postId, token);
    if (!data) { failed++; continue; }

    const outRows: any[] = [];
    for (const item of data) {
      const metricName = item?.name;
      const val = item?.values?.[0]?.value;
      if (!metricName || typeof val !== "number") continue;
      outRows.push({
        platform: "facebook",
        entity_type: "post",
        entity_id: postId,
        location_id: locationId,
        metric_date: today,
        metric_name: metricName,
        metric_period: "lifetime",
        metric_value: val,
        source_api: "graph_" + GRAPH_VERSION,
        fetched_at: fetchedAt,
      });
    }

    if (outRows.length === 0) continue;

    // Idempotent within the day: replace today's lifetime snapshot for this post
    await bq.query({
      query: `
        DELETE FROM \`${projectId}.raw.channel_performance_daily\`
        WHERE platform = 'facebook' AND entity_type = 'post'
          AND entity_id = @postId AND metric_date = DATE(@today) AND metric_period = 'lifetime'
      `,
      params: { postId, today },
      types: { postId: "STRING", today: "STRING" },
      location: BQ_LOCATION,
    });

    try {
      await bq.dataset("raw").table("channel_performance_daily").insert(outRows);
      synced++;
    } catch (e: any) {
      failed++;
      console.error("[sync-fb-performance] insert error", postId, e?.message);
    }
  }

  console.log("[sync-fb-performance] done:", JSON.stringify({ synced, failed, total: rows.length }));
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }
  waitUntil(runFbSync().catch((e) => console.error("[sync-fb-performance] background error:", e?.message)));
  return new Response(JSON.stringify({ ok: true, status: "started" }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};