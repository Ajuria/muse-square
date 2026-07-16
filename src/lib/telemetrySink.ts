// src/lib/telemetrySink.ts
// =====================================================
// Telemetry sink (polish tier, 16/07) — the [telemetry][*] console lines, PERSISTED.
// One row per event in analytics.consulter_telemetry: flags and counts only, never model text
// (the payload is exactly what the log line already printed). This is the data the owner's
// KV-cache decision was gated on ("ship the telemetry line first; the data gates any revisit") —
// Vercel logs are ephemeral and unqueryable, BigQuery is neither.
//
// Fire-and-forget by design: an answer must never wait on — or break because of — telemetry.
// On Vercel the insert is kept alive past the response via waitUntil (@vercel/functions, the
// house pattern from crawl-best-in-class); outside Vercel (dev) waitUntil throws and the plain
// floating promise completes normally.
// =====================================================

import { waitUntil } from "@vercel/functions";
import { makeBQClient } from "./bq";

const PROJECT = "muse-square-open-data";
const TABLE = `\`${PROJECT}.analytics.consulter_telemetry\``;

export function sinkTelemetry(
  location_id: string | null,
  event_type: string,
  payload: Record<string, unknown>,
): void {
  // The greppable log line stays — dev debugging + Vercel live logs read it.
  console.log(`[telemetry][${event_type}]`, JSON.stringify(payload));
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const p = bq.query({
      query: `INSERT INTO ${TABLE} (event_ts, location_id, event_type, payload)
              VALUES (CURRENT_TIMESTAMP(), @location_id, @event_type, @payload)`,
      params: { location_id: location_id ?? null, event_type, payload: JSON.stringify(payload) },
      types: { location_id: "STRING", event_type: "STRING", payload: "STRING" },
      location: "EU",
    }).catch((e: any) => console.warn("[telemetry] sink failed:", e?.message));
    try { waitUntil(p); } catch { /* not on Vercel (dev) — the floating promise completes on its own */ }
  } catch (e: any) {
    console.warn("[telemetry] sink skipped:", e?.message);
  }
}
