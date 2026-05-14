import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

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
        SELECT member_id, first_name, last_name, role, channels_contact, signal_routing, created_at, updated_at
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.team_members\`
          WHERE user_id = @userId
            AND location_id = @locationId
        )
        WHERE rn = 1
        ORDER BY first_name ASC
      `,
      params: { userId, locationId },
      location: "EU",
    });
    const items = (rows || []).map((r: any) => ({
      member_id: r.member_id,
      first_name: r.first_name,
      last_name: r.last_name,
      role: r.role,
      channels_contact: (() => { try { return JSON.parse(r.channels_contact); } catch { return {}; } })(),
      signal_routing: (() => { try { return JSON.parse(r.signal_routing); } catch { return {}; } })(),
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
    if (!body || !body.location_id || !body.first_name) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : location_id, first_name" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const memberId = body.member_id || crypto.randomUUID();
    const table = bq.dataset("analytics").table("team_members");
    await table.insert([{
      member_id: memberId,
      user_id: userId,
      location_id: String(body.location_id).trim(),
      first_name: String(body.first_name).trim(),
      last_name: String(body.last_name || "").trim() || null,
      role: String(body.role || "").trim() || null,
      channels_contact: JSON.stringify(body.channels_contact || {}),
      signal_routing: JSON.stringify(body.signal_routing || {}),
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

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const body = await request.json().catch(() => null);
    if (!body || !body.member_id) {
      return new Response(JSON.stringify({ ok: false, error: "member_id requis" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    await bq.query({
      query: `
        DELETE FROM \`${BQ_PROJECT}.analytics.team_members\`
        WHERE member_id = @memberId AND user_id = @userId
      `,
      params: { memberId: body.member_id, userId },
      location: "EU",
    });
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