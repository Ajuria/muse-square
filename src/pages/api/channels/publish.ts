import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

type ChannelHandler = (config: any, payload: PublishPayload) => Promise<{ ok: boolean; error?: string }>;

interface PublishPayload {
  title: string;
  body: string;
  hashtags: string;
  recipient: string;
  channel: string;
  location_id: string;
  signal_type: string;
  affected_date: string;
}

// ── Slack ──

const handleSlack: ChannelHandler = async (config, payload) => {
  const token = config?.bot_token;
  if (!token || !token.startsWith("xoxb-")) {
    return { ok: false, error: "Token Slack bot invalide ou manquant. Reconnectez Slack dans vos param\u00e8tres." };
  }
  const channel = payload.recipient || config?.default_channel;
  if (!channel) {
    return { ok: false, error: "Canal Slack non sp\u00e9cifi\u00e9" };
  }
  const text = [payload.title, payload.body].filter(Boolean).join("\n\n");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + token,
    },
    body: JSON.stringify({ channel: channel, text: text }),
  });
  const json = await res.json().catch(function() { return null; });
  if (!json || !json.ok) {
    var err = json?.error || "Erreur Slack " + res.status;
    if (err === "not_in_channel" || err === "channel_not_found") {
      return { ok: false, error: "Le bot Muse Square n'a pas acc\u00e8s \u00e0 ce canal. Tapez /invite @Muse Square Insight dans le canal Slack concern\u00e9, puis r\u00e9essayez." };
    }
    return { ok: false, error: err };
  }
  return { ok: true };
};

// ── Email (Resend) ──

const handleEmail: ChannelHandler = async (config, payload) => {
  const apiKey = config?.api_key || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Cl\u00e9 API Resend manquante" };
  }
  const from = config?.from_email || "Muse Square <noreply@musesquare.com>";
  const to = payload.recipient;
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Destinataire email invalide" };
  }
  const subject = payload.title || "Information de votre \u00e9tablissement";
  const text = payload.body || "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    return { ok: false, error: json?.message || "Erreur Resend " + res.status };
  }
  return { ok: true };
};

// ── SMS (placeholder) ──

const handleSms: ChannelHandler = async (_config, _payload) => {
  return { ok: false, error: "Canal SMS pas encore disponible" };
};

// ── WhatsApp (placeholder) ──

const handleWhatsapp: ChannelHandler = async (_config, _payload) => {
  return { ok: false, error: "Canal WhatsApp pas encore disponible" };
};

// ── GBP (placeholder) ──

const handleGbp: ChannelHandler = async (_config, _payload) => {
  return { ok: false, error: "Canal Google Business Profile pas encore disponible" };
};

// ── Router ──

const HANDLERS: Record<string, ChannelHandler> = {
  slack: handleSlack,
  email: handleEmail,
  sms: handleSms,
  whatsapp: handleWhatsapp,
  gbp: handleGbp,
};

// ── Main ──

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Non authentifi\u00e9" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.channel || !body.body) {
      return new Response(JSON.stringify({ ok: false, error: "Champs requis : channel, body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const channel = String(body.channel).trim();
    const handler = HANDLERS[channel];
    if (!handler) {
      return new Response(JSON.stringify({ ok: false, error: "Canal non support\u00e9 : " + channel }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const locationId = String(body.location_id || "").trim();

    // Fetch channel config
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    let config: any = {};
    if (locationId) {
      const [rows] = await bq.query({
        query: `
          SELECT config_json
          FROM \`${BQ_PROJECT}.analytics.channel_configs\`
          WHERE user_id = @userId
            AND location_id = @locationId
            AND channel = @channel
            AND enabled = TRUE
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        params: { userId, locationId, channel },
        location: "EU",
      });
      if (rows?.[0]?.config_json) {
        try { config = JSON.parse(rows[0].config_json); } catch {}
      }
    }

    const payload: PublishPayload = {
      title: String(body.title || "").trim(),
      body: String(body.body || "").trim(),
      hashtags: String(body.hashtags || "").trim(),
      recipient: String(body.recipient || "").trim(),
      channel,
      location_id: locationId,
      signal_type: String(body.signal_type || "").trim(),
      affected_date: String(body.affected_date || "").trim(),
    };

    // Execute
    const result = await handler(config, payload);

    if (result.ok) {
      // Log to action_log
      const logTable = bq.dataset("analytics").table("action_log");
      logTable.insert([{
        log_id: crypto.randomUUID(),
        user_id: userId,
        location_id: locationId,
        event: "draft_published",
        action_key: "publish",
        change_subtype: payload.signal_type,
        channel,
        affected_date: payload.affected_date || null,
        action_text: (payload.title ? payload.title + " | " : "") + payload.body.substring(0, 100),
        action_category: "publish",
        created_at: new Date().toISOString(),
      }]).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: result.ok, error: result.error || null }), {
      status: result.ok ? 200 : 422,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[publish] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Erreur serveur" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};