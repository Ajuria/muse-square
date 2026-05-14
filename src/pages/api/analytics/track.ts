import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

const VALID_EVENTS = [
  "page_view",
  "draft_generated",
  "draft_copied",
  "draft_saved",
  "signal_confirmed",
  "signal_dismissed",
  "competitor_followed",
  "date_saved",
];

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.event || !VALID_EVENTS.includes(body.event)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid event" }), {
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
      event: body.event,
      created_at: new Date().toISOString(),
    };

    await table.insert([row]).catch(() => {});

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