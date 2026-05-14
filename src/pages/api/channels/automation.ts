import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    const locationId = url.searchParams.get("location_id");
    if (!locationId) return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), { status: 400, headers: { "content-type": "application/json" } });
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const [rows] = await bq.query({
      query: `
        SELECT rule_id, member_id, signal_category, channel, recipient, enabled, require_approval, frequency, created_at, updated_at
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY rule_id ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.automation_rules\`
          WHERE user_id = @userId AND location_id = @locationId
        )
        WHERE rn = 1 AND enabled = TRUE
        ORDER BY signal_category ASC
      `,
      params: { userId, locationId },
      location: "EU",
    });
    const items = (rows || []).map((r: any) => ({
      rule_id: r.rule_id,
      member_id: r.member_id,
      signal_category: r.signal_category,
      channel: r.channel,
      recipient: r.recipient,
      enabled: r.enabled,
      require_approval: r.require_approval,
      frequency: r.frequency,
    }));
    return new Response(JSON.stringify({ ok: true, items }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.signal_category || !body.channel || !body.recipient) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : location_id, signal_category, channel, recipient" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("automation_rules");
    const ruleId = body.rule_id || crypto.randomUUID();
    await table.insert([{
      rule_id: ruleId,
      user_id: userId,
      location_id: String(body.location_id).trim(),
      member_id: String(body.member_id || "").trim(),
      signal_category: String(body.signal_category).trim(),
      channel: String(body.channel).trim(),
      recipient: String(body.recipient).trim(),
      enabled: body.enabled !== false,
      require_approval: body.require_approval !== false,
      frequency: String(body.frequency || "first_occurrence").trim(),
      created_at: now,
      updated_at: now,
    }]);
    return new Response(JSON.stringify({ ok: true, rule_id: ruleId }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    const body = await request.json().catch(() => null);
    if (!body || !body.rule_id || !body.location_id) {
      return new Response(JSON.stringify({ ok: false, error: "rule_id et location_id requis" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("automation_rules");
    await table.insert([{
      rule_id: body.rule_id,
      user_id: userId,
      location_id: String(body.location_id).trim(),
      member_id: "",
      signal_category: "",
      channel: "",
      recipient: "",
      enabled: false,
      require_approval: true,
      frequency: "first_occurrence",
      created_at: now,
      updated_at: now,
    }]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};