// src/pages/api/cron/day-class-impacts.ts
//
// Nightly batch of the day-class registry (incrément 1 validé 24/07 — spec :
// docs/enjeu-day-class-registry.md + docs/kpi-enjeu-mapping.md).
// ONE statement: CREATE OR REPLACE TABLE analytics.day_class_impacts AS <raw aggregates for ALL
// locations × classes (météo 5 + competition_high + tourism_high terciles)>. RAW ONLY — the policy
// (gates, tiers, €/an, négatif-only) lives in lib/dayClassRegistry.rowsToImpacts and is applied at
// read time by monitor.ts, so a gate change never needs a re-run here.
// Auth: Bearer CRON_SECRET, soft (mirrors commitment-resolve.ts). Schedule: external pinger
// (cron.org — owner registers), daily. Deterministic, no AI, idempotent (full rebuild).
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { dayClassAggregateSql, DAY_CLASS_STORE } from "../../../lib/dayClassRegistry";

export const prerender = false;

const CRON_SECRET = process.env.CRON_SECRET || "";

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization") || "";
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }

  const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const bq = makeBQClient(projectId);

  try {
    const t0 = Date.now();
    await bq.query({
      query: `CREATE OR REPLACE TABLE \`${projectId}.${DAY_CLASS_STORE}\` AS ${dayClassAggregateSql(false)}`,
      location: "EU",
    });
    const [countRows] = await bq.query({
      // NB: `rows` est un mot RÉSERVÉ BigQuery — d'où n_rows (500 prod du 24/07 au premier test).
      query: `SELECT COUNT(*) AS n_rows, COUNT(DISTINCT location_id) AS locations FROM \`${projectId}.${DAY_CLASS_STORE}\``,
      location: "EU",
    });
    const stats = (countRows as any[])[0] || {};
    console.log(`[day-class-impacts] rebuilt: ${stats.n_rows} rows / ${stats.locations} locations in ${Date.now() - t0}ms`);
    return new Response(JSON.stringify({ ok: true, rows: Number(stats.n_rows ?? 0), locations: Number(stats.locations ?? 0), ms: Date.now() - t0 }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[day-class-impacts]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};
