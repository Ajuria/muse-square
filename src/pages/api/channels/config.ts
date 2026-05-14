import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

// GET — list configs for a location
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const locationId = url.searchParams.get("location_id");
    if (!locationId) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const [rows] = await bq.query({
      query: `
        SELECT config_id, channel, config_json, enabled, created_at, updated_at
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY channel ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.channel_configs\`
          WHERE user_id = @userId
            AND location_id = @locationId
        )
        WHERE rn = 1
        ORDER BY channel ASC
      `,
      params: { userId, locationId },
      location: "EU",
    });
    const items = (rows || []).map((r: any) => ({
      config_id: r.config_id,
      channel: r.channel,
      config: (() => { try { return JSON.parse(r.config_json); } catch { return {}; } })(),
      enabled: r.enabled,
      created_at: r.created_at?.value ?? String(r.created_at ?? ""),
      updated_at: r.updated_at?.value ?? String(r.updated_at ?? ""),
    }));
    return new Response(JSON.stringify({ ok: true, items }), {
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

// POST — create or update a channel config
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
    if (!body || !body.channel || !body.location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : channel, location_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const channel = String(body.channel).trim();
    const locationId = String(body.location_id).trim();
    const configJson = JSON.stringify(body.config || {});
    const enabled = body.enabled !== false;
    const now = new Date().toISOString();

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    // Always insert — BQ streaming buffer prevents UPDATE on recent rows
    // GET query uses ORDER BY updated_at DESC LIMIT 1, so latest wins
    const table = bq.dataset("analytics").table("channel_configs");
    await table.insert([{
        config_id: crypto.randomUUID(),
        user_id: userId,
        location_id: locationId,
        channel,
        config_json: configJson,
        enabled,
        created_at: now,
        updated_at: now,
      }]);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};