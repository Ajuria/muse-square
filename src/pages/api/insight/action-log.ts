import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

// J1.6 Explorer (26/08, arbitrage owner) — l'état « consulté » des suggestions vit dans
// analytics.action_log (clé user × change_subtype × affected_date, event 'explorer_consulted'),
// écrit par le POST ci-dessous, relu ICI : dernier événement par clé, fenêtre 60 j. Même patron
// de lecture que analytics/card-states.ts (le POST et le GET partagent LE foyer action_log).
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    }
    const location_id = url.searchParams.get("location_id");
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    requireLocationOwnership(locals, location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const [rows] = await bq.query({
      query: `
        SELECT change_subtype AS key,
               CAST(affected_date AS STRING) AS date,
               CAST(DATE(created_at) AS STRING) AS consulted_ymd
        FROM (
          SELECT change_subtype, affected_date, created_at,
                 ROW_NUMBER() OVER (PARTITION BY change_subtype, affected_date ORDER BY created_at DESC) AS rn
          FROM \`muse-square-open-data.analytics.action_log\`
          WHERE user_id = @userId
            AND location_id = @location_id
            AND event = 'explorer_consulted'
            AND affected_date IS NOT NULL
            AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 DAY)
        )
        WHERE rn = 1
      `,
      location: "EU",
      params: { userId, location_id },
    });
    return new Response(JSON.stringify({ ok: true, marks: rows ?? [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId =
      String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);
    const table = bq.dataset("analytics").table("action_log");

    const row = {
      log_id: crypto.randomUUID(),
      user_id: userId,
      location_id: body.location_id || null,
      affected_date: body.affected_date || null,
      change_subtype: body.change_subtype || null,
      action_key: body.action_key || null,
      action_text: body.action_text || null,
      action_category: body.action_category || null,
      channel: body.channel || null,
      event: body.event || "check",
      created_at: new Date().toISOString(),
    };

    await table.insert([row]).catch(async (err: any) => {
      if (err?.code === 404 || err?.message?.includes("Not found")) {
        const schema = [
          { name: "log_id", type: "STRING", mode: "REQUIRED" },
          { name: "user_id", type: "STRING", mode: "REQUIRED" },
          { name: "location_id", type: "STRING" },
          { name: "affected_date", type: "DATE" },
          { name: "change_subtype", type: "STRING" },
          { name: "action_key", type: "STRING" },
          { name: "action_text", type: "STRING" },
          { name: "action_category", type: "STRING" },
          { name: "channel", type: "STRING" },
          { name: "event", type: "STRING" },
          { name: "created_at", type: "TIMESTAMP" },
        ];
        await bq.dataset("analytics").createTable("action_log", { schema: { fields: schema } });
        await table.insert([row]);
      } else {
        throw err;
      }
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};