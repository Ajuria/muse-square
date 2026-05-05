import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

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