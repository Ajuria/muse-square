// Internal RULE-alert send primitives — the sealed rail for the #9 internal-alert consumer.
//
// These are INTENTIONALLY duplicated from src/pages/api/channels/publish.ts, not shared with
// it. The internal rail must have no code path to any public-publish handler (gbp / instagram /
// facebook): duplicating the two thin, stateless primitives (a Slack chat.postMessage POST and
// a Resend email POST) keeps that guarantee by construction and leaves the live publish path
// untouched. Do NOT refactor these to import from publish.ts — the duplication is the
// leak-proofing, not a smell.
//
// Behaviour is kept equivalent to publish.ts handleSlack / handleEmail so both rails send
// identically. If you fix a bug in one, mirror it in the other.

export type InternalSendConfig = Record<string, any>;
export type InternalSendResult = { ok: boolean; error?: string };
export interface InternalMessage {
  title?: string;
  body: string;
  recipient: string;
}

// ── Slack (chat.postMessage) — mirror of publish.ts handleSlack ──
export async function sendSlack(
  config: InternalSendConfig,
  msg: InternalMessage,
): Promise<InternalSendResult> {
  const token = config?.bot_token;
  if (!token || !token.startsWith("xoxb-")) {
    return { ok: false, error: "Token Slack bot invalide ou manquant. Reconnectez Slack dans vos paramètres." };
  }
  const channel = msg.recipient || config?.default_channel;
  if (!channel) {
    return { ok: false, error: "Canal Slack non spécifié" };
  }
  const text = [msg.title, msg.body].filter(Boolean).join("\n\n");
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + token,
    },
    body: JSON.stringify({ channel: channel, text: text }),
  });
  const json = await res.json().catch(function () { return null; });
  if (!json || !json.ok) {
    const err = json?.error || "Erreur Slack " + res.status;
    if (err === "not_in_channel" || err === "channel_not_found") {
      return { ok: false, error: "Le bot Muse Square n'a pas accès à ce canal. Tapez /invite @Muse Square Insight dans le canal Slack concerné, puis réessayez." };
    }
    return { ok: false, error: err };
  }
  return { ok: true };
}

// ── Email (Resend) — mirror of publish.ts handleEmail ──
export async function sendEmail(
  config: InternalSendConfig,
  msg: InternalMessage,
): Promise<InternalSendResult> {
  const apiKey = config?.api_key || process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Clé API Resend manquante" };
  }
  const from = config?.from_email || "Muse Square <noreply@musesquare.com>";
  const to = msg.recipient;
  if (!to || !to.includes("@")) {
    return { ok: false, error: "Destinataire email invalide" };
  }
  const subject = msg.title || "Information de votre établissement";
  const text = msg.body || "";
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
}
