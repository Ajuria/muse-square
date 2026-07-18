import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const GRAPH_VERSION = "v25.0"; // keep in sync with meta-connect.ts / meta-callback.ts

type ChannelHandler = (config: any, payload: PublishPayload) => Promise<{ ok: boolean; error?: string; external_post_id?: string; permalink?: string }>;

interface PublishPayload {
  title: string;
  body: string;
  hashtags: string;
  recipient: string;
  channel: string;
  location_id: string;
  signal_type: string;
  affected_date: string;
  image_url: string;
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

// ── GBP (Google Business Profile) ──
const handleGbp: ChannelHandler = async (config, payload) => {
  let accessToken = config?.access_token;
  const refreshToken = config?.refresh_token;
  const expiresAt = config?.expires_at;
  const accountName = config?.account_name;
  const gbpLocationName = config?.gbp_location_name;

  if (!refreshToken || !accountName || !gbpLocationName) {
    return { ok: false, error: "Google Business Profile non connect\u00e9. Connectez-le dans vos param\u00e8tres." };
  }

  // Refresh token if expired
  if (!accessToken || !expiresAt || new Date(expiresAt) <= new Date()) {
    const clientId = process.env.GOOGLE_GBP_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GBP_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "Configuration GBP manquante c\u00f4t\u00e9 serveur" };
    }
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    const refreshJson = await refreshRes.json().catch(() => null);
    if (!refreshJson || refreshJson.error) {
      return { ok: false, error: "Token GBP expir\u00e9 \u2014 reconnectez Google Business Profile. " + (refreshJson?.error || "") };
    }
    accessToken = refreshJson.access_token;
    // Note: could update stored token here, but keeping it simple for now
  }

  const summary = [payload.title, payload.body].filter(Boolean).join("\n\n");
  if (!summary.trim()) {
    return { ok: false, error: "Contenu du post vide" };
  }

  // Create LocalPost
  const postUrl = "https://mybusiness.googleapis.com/v4/" + accountName + "/" + gbpLocationName + "/localPosts";
  const postBody: any = {
    languageCode: "fr",
    topicType: "STANDARD",
    summary: summary.substring(0, 1500),
  };

  const postRes = await fetch(postUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + accessToken,
    },
    body: JSON.stringify(postBody),
  });

  const postJson = await postRes.json().catch(() => null);
  if (!postRes.ok || !postJson?.name) {
    const errMsg = postJson?.error?.message || "Erreur GBP " + postRes.status;
    return { ok: false, error: errMsg };
  }

  return { ok: true, external_post_id: postJson.name, permalink: postJson.searchUrl || undefined };
};

// ── Facebook (Page feed) ──

const handleFacebook: ChannelHandler = async (config, payload) => {
  const pageId = config?.page_id;
  const pageToken = config?.page_access_token;
  if (!pageId || !pageToken) {
    return { ok: false, error: "Facebook non connect\u00e9. Reconnectez-le dans vos param\u00e8tres." };
  }
  const message = [payload.title, payload.body].filter(Boolean).join("\n\n").trim();
  if (!message) {
    return { ok: false, error: "Contenu du post vide" };
  }
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, access_token: pageToken }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    return { ok: false, error: json?.error?.message || "Erreur Facebook " + res.status };
  }
  return { ok: true, external_post_id: json.id };
};

// ── Instagram (container -> publish, image required) ──

const handleInstagram: ChannelHandler = async (config, payload) => {
  const igUserId = config?.ig_user_id;
  const token = config?.page_access_token;
  if (!igUserId || !token) {
    return { ok: false, error: "Instagram non connect\u00e9 ou non li\u00e9 \u00e0 une Page. Reconnectez-le dans vos param\u00e8tres." };
  }
  if (!payload.image_url) {
    return { ok: false, error: "Instagram exige une image (image_url manquante)." };
  }
  const caption = [payload.title, payload.body, payload.hashtags].filter(Boolean).join("\n\n").trim().substring(0, 2200);

  // Step 1 - create media container
  const createRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image_url: payload.image_url, caption, access_token: token }),
  });
  const createJson = await createRes.json().catch(() => null);
  if (!createRes.ok || !createJson?.id) {
    return { ok: false, error: createJson?.error?.message || "Erreur Instagram (conteneur) " + createRes.status };
  }

  // Step 2 - publish container
  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creation_id: createJson.id, access_token: token }),
  });
  const publishJson = await publishRes.json().catch(() => null);
  if (!publishRes.ok || !publishJson?.id) {
    return { ok: false, error: publishJson?.error?.message || "Erreur Instagram (publication) " + publishRes.status };
  }
  return { ok: true, external_post_id: publishJson.id };
};

// ── Router ──

const HANDLERS: Record<string, ChannelHandler> = {
  slack: handleSlack,
  email: handleEmail,
  sms: handleSms,
  whatsapp: handleWhatsapp,
  gbp: handleGbp,
  facebook: handleFacebook,
  instagram: handleInstagram,
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
    // note_interne (18/07) : le workspace de la page d\u00e9tail envoie la note d'\u00e9quipe par le M\u00caME
    // bouton \u2014 la note est un \u00e9crit interne (insert saved_drafts, le feed notes de pulse/monitor
    // la lit via list-drafts), pas un canal externe. G\u00e9r\u00e9 dans l'Execute ci-dessous.
    const handler = HANDLERS[channel] || null;
    if (!handler && channel !== "note_interne") {
      return new Response(JSON.stringify({ ok: false, error: "Canal non support\u00e9 : " + channel }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const locationId = String(body.location_id || "").trim();
    if (locationId) requireLocationOwnership(locals, locationId);

    // Fetch channel config
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    let config: any = {};
    let configId: string | null = null;
    if (locationId) {
      // Owner 19/07 : config niveau COMPTE — site d'abord, sinon compte (aligné sur le GET
      // de config.ts : un site sans ligne propre hérite du set-up du compte, sinon l'envoi
      // échouerait alors que le workspace vient d'offrir le canal).
      const [rows] = await bq.query({
        query: `
          SELECT config_json, config_id
          FROM \`${BQ_PROJECT}.analytics.channel_configs\`
          WHERE user_id = @userId
            AND channel = @channel
            AND enabled = TRUE
          ORDER BY (location_id = @locationId) DESC, updated_at DESC
          LIMIT 1
        `,
        params: { userId, locationId, channel },
        location: "EU",
      });
      if (rows?.[0]) {
        configId = rows[0].config_id || null;
        try { config = JSON.parse(rows[0].config_json || "{}"); } catch {}
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
      image_url: String(body.image_url || "").trim(),
    };

    // Execute — note_interne : écrit interne (même insert que le rail internal-send : saved_drafts,
    // user_instruction 'internal_send' → surfacé par list-drafts sur pulse/monitor). Pas d'envoi externe.
    let result: { ok: boolean; error?: string; external_post_id?: string; permalink?: string };
    if (channel === "note_interne") {
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
            user_id: userId,
            location_id: locationId,
            signal_type: payload.signal_type,
            card_what: payload.signal_type,
            affected_date: payload.affected_date,
            title: payload.title,
            body: payload.body,
            recipient: payload.recipient,
          },
          location: "EU",
        });
        result = { ok: true };
      } catch (e: any) {
        result = { ok: false, error: e?.message || "Erreur d'enregistrement de la note" };
      }
    } else {
      result = await handler!(config, payload);
    }

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

    // Log to publish_log (success and failure) — attribution chain
    bq.dataset("analytics").table("publish_log").insert([{
      publish_id: crypto.randomUUID(),
      draft_id: String(body.draft_id || "").trim() || null,
      location_id: locationId,
      user_id: userId,
      channel,
      action_type: String(body.action_type || "").trim() || null,
      signal_type: payload.signal_type || null,
      affected_date: payload.affected_date || null,
      external_post_id: result.external_post_id || null,
      permalink: result.permalink || null,
      config_id: configId,
      published_text: [payload.title, payload.body].filter(Boolean).join("\n\n") || null,
      publish_status: result.ok ? "success" : "failed",
      error_detail: result.error || null,
      published_at: new Date().toISOString(),
    }]).catch(() => {});

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