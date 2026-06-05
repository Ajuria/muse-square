import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { waitUntil } from "@vercel/functions";
export const prerender = false;

const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

const GBP_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "BUSINESS_DIRECTION_REQUESTS",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
  "BUSINESS_FOOD_ORDERS",
];

// Reuse the GBP refresh logic from publish.ts handleGbp
async function getGbpAccessToken(config: any): Promise<string | null> {
  let accessToken = config?.access_token;
  const refreshToken = config?.refresh_token;
  const expiresAt = config?.expires_at;
  if (!refreshToken) return null;
  if (!accessToken || !expiresAt || new Date(expiresAt) <= new Date()) {
    const clientId = process.env.GOOGLE_GBP_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GBP_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const json = await res.json().catch(() => null);
    if (!json || json.error || !json.access_token) return null;
    accessToken = json.access_token;
  }
  return accessToken || null;
}

async function fetchGbpPerformance(
  locResource: string,
  accessToken: string,
  startStr: string,
  endStr: string
): Promise<any | null> {
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const params = new URLSearchParams();
  for (const m of GBP_METRICS) params.append("dailyMetrics", m);
  params.append("dailyRange.start_date.year", String(sy));
  params.append("dailyRange.start_date.month", String(sm));
  params.append("dailyRange.start_date.day", String(sd));
  params.append("dailyRange.end_date.year", String(ey));
  params.append("dailyRange.end_date.month", String(em));
  params.append("dailyRange.end_date.day", String(ed));
  const url =
    "https://businessprofileperformance.googleapis.com/v1/" +
    locResource +
    ":fetchMultiDailyMetricsTimeSeries?" +
    params.toString();
  try {
    const res = await fetch(url, {
      headers: { authorization: "Bearer " + accessToken },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error("[sync-gbp-performance] perf API", res.status, await res.text().catch(() => ""));
      return null;
    }
    return await res.json();
  } catch (e: any) {
    console.error("[sync-gbp-performance] fetch error", e?.message);
    return null;
  }
}

async function runGbpSync() {
  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);

  // Latest enabled gbp config per location
  const [cfgRows] = await bq.query({
    query: `
      SELECT location_id, config_json
      FROM \`${projectId}.analytics.channel_configs\`
      WHERE channel = 'gbp' AND enabled = TRUE
      QUALIFY ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY updated_at DESC) = 1
    `,
    location: BQ_LOCATION,
  });

  if (!Array.isArray(cfgRows) || cfgRows.length === 0) {
    console.log("[sync-gbp-performance] no gbp connections");
    return;
  }

  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  let synced = 0;
  let failed = 0;

  for (const row of cfgRows) {
    const locationId = String(row.location_id);
    let config: any = {};
    try { config = JSON.parse(row.config_json || "{}"); } catch {}

    const gbpLocationName = String(config?.gbp_location_name || "");
    const lm = gbpLocationName.match(/locations\/\d+/);
    const locResource = lm ? lm[0] : "locations/" + gbpLocationName.replace(/\D/g, "");
    if (locResource === "locations/") { failed++; continue; }

    const accessToken = await getGbpAccessToken(config);
    if (!accessToken) { failed++; console.error("[sync-gbp-performance] no token", locationId); continue; }

    const data = await fetchGbpPerformance(locResource, accessToken, startStr, endStr);
    if (!data) { failed++; continue; }

    const rows: any[] = [];
    const fetchedAt = new Date().toISOString();
    for (const multi of (data?.multiDailyMetricTimeSeries || [])) {
      const dmtArr = multi?.dailyMetricTimeSeries || (multi?.dailyMetric ? [multi] : []);
      for (const dmt of dmtArr) {
        const metricName = dmt?.dailyMetric;
        if (!metricName) continue;
        for (const dv of (dmt?.timeSeries?.datedValues || [])) {
          const dt = dv?.date;
          if (!dt?.year) continue;
          const metricDate =
            dt.year + "-" + String(dt.month).padStart(2, "0") + "-" + String(dt.day).padStart(2, "0");
          rows.push({
            platform: "gbp",
            entity_type: "location",
            entity_id: locResource,
            location_id: locationId,
            metric_date: metricDate,
            metric_name: metricName,
            metric_period: "day",
            metric_value: dv.value != null ? Number(dv.value) : 0,
            source_api: "gbp_performance_v1",
            fetched_at: fetchedAt,
          });
        }
      }
    }

    if (rows.length === 0) { console.log("[sync-gbp-performance] 0 rows", locationId); continue; }

    // Idempotent: clear the window for this location, then insert fresh
    await bq.query({
      query: `
        DELETE FROM \`${projectId}.raw.channel_performance_daily\`
        WHERE platform = 'gbp' AND location_id = @locationId
          AND metric_date BETWEEN DATE(@start) AND DATE(@end)
      `,
      params: { locationId, start: startStr, end: endStr },
      types: { locationId: "STRING", start: "STRING", end: "STRING" },
      location: BQ_LOCATION,
    });

    try {
      await bq.dataset("raw").table("channel_performance_daily").insert(rows);
      synced++;
    } catch (e: any) {
      failed++;
      console.error("[sync-gbp-performance] insert error", locationId, e?.message);
    }
  }

  console.log("[sync-gbp-performance] done:", JSON.stringify({ synced, failed, total: cfgRows.length }));
}

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }

  waitUntil(
    runGbpSync().catch((e) => console.error("[sync-gbp-performance] background error:", e?.message))
  );

  return new Response(JSON.stringify({ ok: true, status: "started" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};