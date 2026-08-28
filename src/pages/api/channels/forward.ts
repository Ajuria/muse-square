// Routes: /api/channels/forward — vue équipe inc 6 (docs/vue-equipe-slack-spec.md).
//   POST : « faire suivre » une carte (ou publier une fiche dispositif) dans Slack —
//          résolution du canal (dispositif explicite → pôle par famille → default_channel
//          de la config Slack du compte), envoi par le rail interne (sendSlack), trace
//          append-only analytics.card_forwards. Geste OWNER (requireLocationOwnership).
//          Le texte est composé par la page depuis le RENDU MEMBRE de la carte (payload
//          expurgé — jumeau client de memberCardPolicy) : un canal d'équipe n'a pas plus
//          de droits qu'une session membre.
//   PUT  : poser/retirer l'adresse du canal d'un pôle/dispositif/série
//          (analytics.dispositif_channels). Geste OWNER.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { sendSlack, loadChannelConfig } from "../../../lib/channels/internalSend";
import { resolveForwardChannel, writeDispositifChannel, traceForward } from "../../../lib/channels/slackRouting";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function uid(locals: any): string | null {
  return String(locals?.clerk_user_id || "").trim() || null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.title || !body.body) {
      return json({ ok: false, error: "Champs requis : location_id, title, body" }, 400);
    }
    requireLocationOwnership(locals, body.location_id);
    const locationId = String(body.location_id).trim();
    const kind = String(body.kind || "card").trim();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

    const resolved = await resolveForwardChannel(bq, {
      location_id: locationId,
      dispositif_id: body.dispositif_id ? String(body.dispositif_id).trim() : null,
      item_category: body.item_category ? String(body.item_category).trim() : null,
    });
    const cfg = await loadChannelConfig(bq, userId, locationId, "slack");
    const channel = resolved.channel || String((cfg as any)?.default_channel || "").trim() || null;
    if (!channel) {
      return json({ ok: false, error: "Aucun canal Slack : ni canal de pôle/dispositif déclaré, ni canal par défaut dans la config Slack." }, 400);
    }

    const text = String(body.body).trim() + (body.link ? "\n\nOuvrir : " + String(body.link).trim() : "");
    const res = await sendSlack(cfg, { title: String(body.title).trim(), body: text, recipient: channel });
    await traceForward(bq, {
      location_id: locationId, user_id: userId, kind,
      action_type: body.action_type ? String(body.action_type).trim() : null,
      affected_date: body.affected_date ? String(body.affected_date).trim() : null,
      dispositif_id: resolved.dispositif_id, slack_channel: channel, sent_ok: res.ok === true,
    }).catch(() => { /* trace non bloquante — l'envoi prime */ });
    if (!res.ok) return json({ ok: false, error: res.error || "Envoi Slack échoué", channel_used: channel }, 502);
    return json({ ok: true, channel_used: channel, via_pole: resolved.dispositif_id });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const userId = uid(locals);
    if (!userId) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.dispositif_id) {
      return json({ ok: false, error: "Champs requis : location_id, dispositif_id" }, 400);
    }
    requireLocationOwnership(locals, body.location_id);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const ch = body.slack_channel_id != null && String(body.slack_channel_id).trim() !== ""
      ? String(body.slack_channel_id).trim() : null;
    await writeDispositifChannel(bq, {
      location_id: String(body.location_id).trim(),
      dispositif_id: String(body.dispositif_id).trim(),
      slack_channel_id: ch,
    });
    return json({ ok: true, slack_channel_id: ch });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
