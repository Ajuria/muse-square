import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const GRAPH_VERSION = "v25.0"; // keep identical to meta-connect.ts

export const GET: APIRoute = async ({ url, redirect, request }) => {
  try {
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) return redirect("/profile?meta=error&reason=" + encodeURIComponent(error));
    if (!code || !stateRaw) return redirect("/profile?meta=error&reason=missing_code");

    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    const userId = state.user_id;
    const locationId = state.location_id;
    if (!userId) return redirect("/profile?meta=error&reason=missing_user");

    const clientId = process.env.META_APP_ID;
    const clientSecret = process.env.META_APP_SECRET;
    if (!clientId || !clientSecret) return redirect("/profile?meta=error&reason=config");

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const baseUrl = `${proto}://${host}`;
    const redirectUri = baseUrl + "/api/channels/meta-callback";

    // Exchange code for an access token (server-to-server)
    const tokenUrl = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
      + "?client_id=" + encodeURIComponent(clientId)
      + "&client_secret=" + encodeURIComponent(clientSecret)
      + "&redirect_uri=" + encodeURIComponent(redirectUri)
      + "&code=" + encodeURIComponent(code);

    const tokenRes = await fetch(tokenUrl);
    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenJson || tokenJson.error || !tokenJson.access_token) {
      return redirect("/profile?meta=error&reason=" + encodeURIComponent(tokenJson?.error?.message || "token_exchange_failed"));
    }

    const accessToken = tokenJson.access_token;
    const expiresIn = tokenJson.expires_in || 0;

    // Fetch the user's Pages + linked Instagram business accounts
    const accountsRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
        + "?fields=" + encodeURIComponent("id,name,access_token,instagram_business_account{id,username}")
        + "&access_token=" + encodeURIComponent(accessToken)
    );
    const accountsJson = await accountsRes.json().catch(() => null);
    const pages = accountsJson?.data || [];
    const firstPage = pages[0] || null;

    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("channel_configs");
    const baseConfig = {
      user_access_token: accessToken,
      expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      page_id: firstPage?.id || null,
      page_name: firstPage?.name || null,
      page_access_token: firstPage?.access_token || null,
      ig_user_id: firstPage?.instagram_business_account?.id || null,
      ig_username: firstPage?.instagram_business_account?.username || null,
    };
    const rows = [];
    if (baseConfig.page_id) {
      rows.push({
        config_id: crypto.randomUUID(),
        user_id: userId,
        location_id: locationId || "",
        channel: "facebook",
        config_json: JSON.stringify(baseConfig),
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
    if (baseConfig.ig_user_id) {
      rows.push({
        config_id: crypto.randomUUID(),
        user_id: userId,
        location_id: locationId || "",
        channel: "instagram",
        config_json: JSON.stringify(baseConfig),
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
    if (rows.length === 0) {
      return redirect("/profile?meta=error&reason=no_assets");
    }
    await table.insert(rows);

    return redirect("/profile?meta=success&page=" + encodeURIComponent(firstPage?.name || "") + "&ig=" + encodeURIComponent(firstPage?.instagram_business_account?.username || ""));
  } catch (err: any) {
    console.error("[meta-callback] Error:", err);
    return redirect("/profile?meta=error&reason=" + encodeURIComponent(err?.message || "unknown"));
  }
};