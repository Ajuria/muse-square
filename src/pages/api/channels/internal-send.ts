import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { sendSlack, sendEmail } from "../../../lib/channels/internalSend";
// NO import of ./publish — the manual internal-send rail has no path to any public handler.
import { V1_ALERT_ACTION_TYPE_SET } from "../../../lib/internalAlertCards";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

// Barrier 3 — internal-only channels. Identical to internal-alert.ts so both endpoints on the
// rail share one Barrier-3 surface (the seal stays by-construction).
const INTERNAL_CHANNELS = new Set(["note_interne", "slack", "email"]);

// Duplicated from cron/internal-alert-sweep.ts (not leak surfaces: a config read + a saved_drafts
// INSERT). Kept local to avoid touching the shipped sweep; extract-to-shared candidate later.
async function loadChannelConfig(bq: any, userId: string, locationId: string, channel: string): Promise<any> {
  const [rows] = await bq.query({
    query: `
      SELECT config_json
      FROM \`${BQ_PROJECT}.analytics.channel_configs\`
      WHERE user_id = @userId AND location_id = @locationId AND channel = @channel AND enabled = TRUE
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    params: { userId, locationId, channel },
    location: "EU",
  });
  let config: any = {};
  if (rows?.[0]) { try { config = JSON.parse(rows[0].config_json || "{}"); } catch {} }
  return config;
}

async function writeInternalNote(
  bq: any,
  args: { userId: string; locationId: string; actionType: string; title: string; body: string; recipient: string; affectedDate: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    await bq.query({
      query: `
        INSERT INTO \`${BQ_PROJECT}.analytics.saved_drafts\` (
          draft_id, user_id, location_id, signal_type, channel,
          card_what, card_sowhat, affected_date, severity,
          title, body, hashtags, recipient,
          original_ai_text, user_instruction,
          status, artifact_mode,
          created_at, updated_at
        ) VALUES (
          @draft_id, @user_id, @location_id, @signal_type, 'note_interne',
          @card_what, '', SAFE.PARSE_DATE('%Y-%m-%d', NULLIF(@affected_date, '')), '',
          @title, @body, '', @recipient,
          @body, 'internal_send',
          'active', 'post',
          CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        )
      `,
      params: {
        draft_id: crypto.randomUUID(),
        user_id: args.userId,
        location_id: args.locationId,
        signal_type: args.actionType,
        card_what: args.actionType,
        affected_date: args.affectedDate,
        title: args.title,
        body: args.body,
        recipient: args.recipient,
      },
      location: "EU",
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "saved_drafts insert error" };
  }
}

// One-off internal alert (Manuel mode). No rule is created — this dispatches a single send now.
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });

    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.action_type || !body.channel || !body.body) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : location_id, action_type, channel, body" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const actionType = String(body.action_type).trim();
    const channel = String(body.channel).trim();
    // Barrier 2 — only the v1 performance cards.
    if (!V1_ALERT_ACTION_TYPE_SET.has(actionType)) {
      return new Response(JSON.stringify({ ok: false, error: "action_type non autorisé pour l'alerte interne : " + actionType }), { status: 400, headers: { "content-type": "application/json" } });
    }
    // Barrier 3 — internal channels only.
    if (!INTERNAL_CHANNELS.has(channel)) {
      return new Response(JSON.stringify({ ok: false, error: "Canal non interne interdit sur ce rail : " + channel }), { status: 400, headers: { "content-type": "application/json" } });
    }

    requireLocationOwnership(locals, body.location_id);

    const locationId = String(body.location_id).trim();
    const recipient = String(body.recipient || "").trim();
    const title = String(body.title || "").trim();
    const messageBody = String(body.body).trim();
    const affectedDate = String(body.affected_date || "").trim();

    // slack/email need a recipient; note_interne is an internal write.
    if ((channel === "slack" || channel === "email") && !recipient) {
      return new Response(JSON.stringify({ ok: false, error: "Destinataire requis pour ce canal" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);

    let result: { ok: boolean; error?: string };
    if (channel === "note_interne") {
      result = await writeInternalNote(bq, { userId, locationId, actionType, title, body: messageBody, recipient, affectedDate });
    } else if (channel === "slack") {
      result = await sendSlack(await loadChannelConfig(bq, userId, locationId, "slack"), { title, body: messageBody, recipient });
    } else if (channel === "email") {
      result = await sendEmail(await loadChannelConfig(bq, userId, locationId, "email"), { title, body: messageBody, recipient });
    } else {
      // Unreachable past Barrier 3.
      return new Response(JSON.stringify({ ok: false, error: "canal non interne" }), { status: 400, headers: { "content-type": "application/json" } });
    }

    if (result.ok) {
      try {
        const logTable = bq.dataset("analytics").table("action_log");
        await logTable.insert([{
          log_id: crypto.randomUUID(),
          user_id: userId,
          location_id: locationId,
          action_key: "internal_send",
          event: "internal_send",
          action_type: actionType,
          change_subtype: actionType,
          channel: channel,
          affected_date: affectedDate || null,
          action_category: "internal_alert",
          action_text: (title ? title + " | " : "") + messageBody.substring(0, 100),
          created_at: new Date().toISOString(),
        }]);
      } catch {}
    }

    return new Response(JSON.stringify(result.ok ? { ok: true } : { ok: false, error: result.error }), { status: result.ok ? 200 : 502, headers: { "content-type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
