import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

const VALID_SIGNAL_TYPES = ["competitor", "weather", "mobility", "outcome"];
const VALID_CONFIRMATIONS = ["confirmed", "dismissed", "positive", "neutral", "negative"];

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
    if (
      !body ||
      !VALID_SIGNAL_TYPES.includes(body.signal_type) ||
      !VALID_CONFIRMATIONS.includes(body.confirmation)
    ) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);

    const row = {
      confirmation_id: crypto.randomUUID(),
      clerk_user_id: userId,
      location_id: body.location_id || null,
      signal_type: body.signal_type,
      signal_ref_id: body.signal_ref_id || null,
      signal_date: body.signal_date ? { v: body.signal_date } : null,
      confirmation: body.confirmation,
      created_at: new Date().toISOString(),
    };

    const table = bq.dataset("analytics").table("signal_confirmations");
    await table.insert([row]).catch(async (err: any) => {
      if (err?.code === 404 || err?.message?.includes("Not found")) {
        const schema = [
          { name: "confirmation_id", type: "STRING", mode: "REQUIRED" },
          { name: "clerk_user_id", type: "STRING", mode: "REQUIRED" },
          { name: "location_id", type: "STRING" },
          { name: "signal_type", type: "STRING", mode: "REQUIRED" },
          { name: "signal_ref_id", type: "STRING" },
          { name: "signal_date", type: "DATE" },
          { name: "confirmation", type: "STRING", mode: "REQUIRED" },
          { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
        ];
        await bq.dataset("analytics").createTable("signal_confirmations", { schema: { fields: schema } });
        await table.insert([row]);
      } else {
        throw err;
      }
    });

    // Also log to action_log for unified tracking
    const actionTable = bq.dataset("analytics").table("action_log");
    await actionTable.insert([{
      log_id: crypto.randomUUID(),
      user_id: userId,
      location_id: body.location_id || null,
      affected_date: body.signal_date || null,
      change_subtype: body.signal_type,
      action_key: body.signal_ref_id || null,
      action_text: null,
      action_category: "signal_confirmation",
      channel: null,
      event: body.confirmation === "dismissed" ? "signal_dismissed" : "signal_confirmed",
      created_at: new Date().toISOString(),
    }]).catch(() => {});

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("confirm error:", err?.message, err?.errors ? JSON.stringify(err.errors) : "");
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};