import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";
export const prerender = false;

const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

async function fetchBestTimeWeek(venueId: string, apiKey: string): Promise<any[] | null> {
  if (!apiKey || !venueId) return null;
  try {
    const res = await fetch(
      `https://besttime.app/api/v1/forecasts/week?api_key_public=${encodeURIComponent(apiKey)}&venue_id=${encodeURIComponent(venueId)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const days = data?.analysis;
    if (!Array.isArray(days)) return null;
    return days;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ url, request }) => {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
  }

  const projectId = (process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const apiKey = process.env.BESTTIME_API_KEY_PUBLIC;
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "BESTTIME_API_KEY_PUBLIC not set" }), { status: 500 });
  }

  const bq = makeBQClient(projectId);

  // Ensure raw table exists
  await bq.query({
    query: `
      CREATE TABLE IF NOT EXISTS \`${projectId}.raw.besttime_foot_traffic\` (
        row_id STRING NOT NULL,
        location_id STRING NOT NULL,
        besttime_venue_id STRING NOT NULL,
        day_int INT64,
        day_text STRING,
        day_max INT64,
        day_mean INT64,
        day_rank_max INT64,
        day_rank_mean INT64,
        peak_hour INT64,
        peak_busyness_pct INT64,
        quiet_hour INT64,
        quiet_busyness_pct INT64,
        avg_busyness_pct FLOAT64,
        busy_hours_count INT64,
        quiet_hours_count INT64,
        venue_open_hour INT64,
        venue_closed_hour INT64,
        hourly_raw STRING,
        fetched_at TIMESTAMP NOT NULL,
        fetch_date DATE NOT NULL
      )
      PARTITION BY fetch_date
      CLUSTER BY location_id
    `,
    location: BQ_LOCATION,
  });

  // Get all locations with a besttime_venue_id
  const [rows] = await bq.query({
    query: `
      SELECT location_id, besttime_venue_id
      FROM \`${projectId}.dims.dim_ai_context_location\`
      WHERE besttime_venue_id IS NOT NULL
        AND active_flag = true
    `,
    location: BQ_LOCATION,
  });

  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "No venues to fetch", fetched: 0 }));
  }

  const today = new Date().toISOString().slice(0, 10);
  let fetched = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const locationId = String(row.location_id);
    const venueId = String(row.besttime_venue_id);

    const days = await fetchBestTimeWeek(venueId, apiKey);
    if (!days || days.length === 0) {
      failed++;
      errors.push(locationId);
      continue;
    }

    for (const d of days) {
      const raw = d?.day_raw ?? [];
      const info = d?.day_info ?? {};
      const dayInt = info.day_int ?? d?.day_int ?? null;
      const nonZero = raw.filter((v: number) => v > 0);
      const peakIdx = raw.indexOf(Math.max(...raw));
      const quietIdx = nonZero.length ? raw.indexOf(Math.min(...nonZero)) : 0;

      const peakHour = peakIdx >= 0 ? (peakIdx + 6) % 24 : null;
      const peakBusyness = raw.length ? Math.max(...raw) : null;
      const quietHour = nonZero.length ? (quietIdx + 6) % 24 : null;
      const quietBusyness = nonZero.length ? Math.min(...nonZero) : null;
      const avgBusyness = nonZero.length
        ? Math.round((nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length) * 100) / 100
        : null;
      const busyCount = raw.filter((v: number) => v >= 70).length;
      const quietCount = raw.filter((v: number) => v > 0 && v < 30).length;

      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.besttime_foot_traffic\` (
            row_id, location_id, besttime_venue_id,
            day_int, day_text,
            day_max, day_mean, day_rank_max, day_rank_mean,
            peak_hour, peak_busyness_pct,
            quiet_hour, quiet_busyness_pct,
            avg_busyness_pct, busy_hours_count, quiet_hours_count,
            venue_open_hour, venue_closed_hour,
            hourly_raw, fetched_at, fetch_date
          ) VALUES (
            @row_id, @location_id, @besttime_venue_id,
            @day_int, @day_text,
            @day_max, @day_mean, @day_rank_max, @day_rank_mean,
            @peak_hour, @peak_busyness_pct,
            @quiet_hour, @quiet_busyness_pct,
            @avg_busyness_pct, @busy_hours_count, @quiet_hours_count,
            @venue_open_hour, @venue_closed_hour,
            @hourly_raw, CURRENT_TIMESTAMP(), DATE(@fetch_date)
          )
        `,
        params: {
          row_id: randomUUID(),
          location_id: locationId,
          besttime_venue_id: venueId,
          day_int: dayInt,
          day_text: info.day_text ?? null,
          day_max: info.day_max ?? (raw.length ? Math.max(...raw) : null),
          day_mean: info.day_mean ?? (nonZero.length ? Math.round(nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length) : null),
          day_rank_max: info.day_rank_max ?? null,
          day_rank_mean: info.day_rank_mean ?? null,
          peak_hour: peakHour,
          peak_busyness_pct: peakBusyness,
          quiet_hour: quietHour,
          quiet_busyness_pct: quietBusyness,
          avg_busyness_pct: avgBusyness,
          busy_hours_count: busyCount,
          quiet_hours_count: quietCount,
          venue_open_hour: info.venue_open ?? null,
          venue_closed_hour: info.venue_closed ?? null,
          hourly_raw: JSON.stringify(raw),
          fetch_date: today,
        },
        types: {
          row_id: "STRING",
          location_id: "STRING",
          besttime_venue_id: "STRING",
          day_int: "INT64",
          day_text: "STRING",
          day_max: "INT64",
          day_mean: "INT64",
          day_rank_max: "INT64",
          day_rank_mean: "INT64",
          peak_hour: "INT64",
          peak_busyness_pct: "INT64",
          quiet_hour: "INT64",
          quiet_busyness_pct: "INT64",
          avg_busyness_pct: "FLOAT64",
          busy_hours_count: "INT64",
          quiet_hours_count: "INT64",
          venue_open_hour: "INT64",
          venue_closed_hour: "INT64",
          hourly_raw: "STRING",
          fetch_date: "STRING",
        },
        location: BQ_LOCATION,
      });
    }

    fetched++;
  }

  return new Response(
    JSON.stringify({ ok: true, fetched, failed, errors, total_venues: rows.length }),
    { headers: { "content-type": "application/json" } }
  );
};