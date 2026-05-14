import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";

export const GET: APIRoute = async ({ url, redirect }) => {
  try {
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return redirect("/profile?slack=error&reason=" + encodeURIComponent(error));
    }

    if (!code || !stateRaw) {
      return redirect("/profile?slack=error&reason=missing_code");
    }

    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    const userId = state.user_id;
    const locationId = state.location_id;

    if (!userId) {
      return redirect("/profile?slack=error&reason=missing_user");
    }

    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return redirect("/profile?slack=error&reason=config");
    }

    const redirectUri = url.origin + "/api/channels/slack-callback";

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenJson || !tokenJson.ok) {
      return redirect("/profile?slack=error&reason=" + encodeURIComponent(tokenJson?.error || "token_exchange_failed"));
    }

    const botToken = tokenJson.access_token;
    const teamName = tokenJson.team?.name || "";
    const teamId = tokenJson.team?.id || "";
    const incomingChannel = tokenJson.incoming_webhook?.channel || "";
    const incomingChannelId = tokenJson.incoming_webhook?.channel_id || "";

    // Store in channel_configs
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("channel_configs");
    await table.insert([{
      config_id: crypto.randomUUID(),
      user_id: userId,
      location_id: locationId || "",
      channel: "slack",
      config_json: JSON.stringify({
        bot_token: botToken,
        team_name: teamName,
        team_id: teamId,
        default_channel: incomingChannel,
        default_channel_id: incomingChannelId,
      }),
      enabled: true,
      created_at: now,
      updated_at: now,
    }]);

    return redirect("/profile?slack=success&team=" + encodeURIComponent(teamName));
  } catch (err: any) {
    console.error("[slack-callback] Error:", err);
    return redirect("/profile?slack=error&reason=" + encodeURIComponent(err?.message || "unknown"));
  }
};