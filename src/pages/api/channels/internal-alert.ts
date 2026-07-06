import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { V1_ALERT_ACTION_TYPE_SET } from "../../../lib/internalAlertCards";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

// ── Barrier 2 — arm-time action_type allowlist ──
// The 5-card allowlist is the single source of truth in src/lib/internalAlertCards.ts,
// shared with the sweep so write-time and read-time can never drift.

// ── Barrier 3 — internal-only channels ──
// A public-publish channel (gbp/instagram/facebook/whatsapp/sms) is unstorable on this rail.
const INTERNAL_CHANNELS = new Set(["note_interne", "slack", "email"]);

// Dedup identity for the append-only log. channel is part of the identity: the same card
// armed to Slack AND note_interne is two independent arms. The sweep uses the same key.
// (PARTITION BY location_id, action_type, channel  ORDER BY updated_at DESC → rn=1 → enabled)

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    const locationId = url.searchParams.get("location_id");
    if (!locationId) return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), { status: 400, headers: { "content-type": "application/json" } });
    requireLocationOwnership(locals, locationId);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const [rows] = await bq.query({
      query: `
        SELECT rule_id, action_type, channel, recipient, enabled, frequency, threshold_pct, message
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY location_id, action_type, channel ORDER BY updated_at DESC) AS rn
          FROM \`${BQ_PROJECT}.analytics.internal_alert_rules\`
          WHERE user_id = @userId AND location_id = @locationId
        )
        WHERE rn = 1 AND enabled = TRUE
        ORDER BY action_type ASC
      `,
      params: { userId, locationId },
      location: "EU",
    });
    const items = (rows || []).map((r: any) => ({
      rule_id: r.rule_id,
      action_type: r.action_type,
      channel: r.channel,
      recipient: r.recipient,
      enabled: r.enabled,
      frequency: r.frequency,
      threshold_pct: r.threshold_pct,
      message: r.message,
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
    if (!body || !body.location_id || !body.action_type || !body.channel) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : location_id, action_type, channel" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    const actionType = String(body.action_type).trim();
    const channel = String(body.channel).trim();
    const recipient = String(body.recipient || "").trim();
    // Barrier 2 — reject any action_type outside the v1 allowlist.
    if (!V1_ALERT_ACTION_TYPE_SET.has(actionType)) {
      return new Response(JSON.stringify({ ok: false, error: "action_type non autorisé pour l'alerte interne : " + actionType }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // Barrier 3 — reject any channel that is not internal-only.
    if (!INTERNAL_CHANNELS.has(channel)) {
      return new Response(JSON.stringify({ ok: false, error: "Canal non interne interdit sur ce rail : " + channel }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // note_interne is an internal write (no recipient); slack/email require one.
    if ((channel === "slack" || channel === "email") && !recipient) {
      return new Response(JSON.stringify({ ok: false, error: "Destinataire requis pour ce canal" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    requireLocationOwnership(locals, body.location_id);
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("internal_alert_rules");
    const ruleId = body.rule_id || crypto.randomUUID();
    await table.insert([{
      rule_id: ruleId,
      user_id: userId,
      location_id: String(body.location_id).trim(),
      action_type: actionType,
      channel: channel,
      recipient: recipient,
      enabled: body.enabled !== false,
      frequency: String(body.frequency || "first_occurrence").trim(),
      threshold_pct: (body.threshold_pct != null && body.threshold_pct !== "") ? Number(body.threshold_pct) : null,
      message: (body.message != null && String(body.message).trim() !== "") ? String(body.message) : null,
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
    // Soft-delete-by-append. The disable row MUST carry the real dedup identity
    // (location_id, action_type, channel) — unlike automation.ts, which blanks channel
    // because it dedups by rule_id. Blanking channel here would strand the arm forever.
    if (!body || !body.location_id || !body.action_type || !body.channel) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : location_id, action_type, channel" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    requireLocationOwnership(locals, body.location_id);
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("internal_alert_rules");
    await table.insert([{
      rule_id: crypto.randomUUID(),
      user_id: userId,
      location_id: String(body.location_id).trim(),
      action_type: String(body.action_type).trim(),
      channel: String(body.channel).trim(),
      recipient: "",
      enabled: false,
      frequency: "first_occurrence",
      created_at: now,
      updated_at: now,
    }]);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
