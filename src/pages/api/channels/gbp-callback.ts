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
      return redirect("/profile?gbp=error&reason=" + encodeURIComponent(error));
    }
    if (!code || !stateRaw) {
      return redirect("/profile?gbp=error&reason=missing_code");
    }

    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf-8"));
    const userId = state.user_id;
    const locationId = state.location_id;
    if (!userId) {
      return redirect("/profile?gbp=error&reason=missing_user");
    }

    const clientId = process.env.GOOGLE_GBP_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_GBP_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return redirect("/profile?gbp=error&reason=config");
    }

    const redirectUri = url.origin + "/api/channels/gbp-callback";

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenJson || tokenJson.error) {
      return redirect("/profile?gbp=error&reason=" + encodeURIComponent(tokenJson?.error || "token_exchange_failed"));
    }

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;
    const expiresIn = tokenJson.expires_in || 3600;

    // Fetch GBP accounts to find the user's account and location
    const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: { "authorization": "Bearer " + accessToken },
    });
    const accountsJson = await accountsRes.json().catch(() => null);
    const accounts = accountsJson?.accounts || [];
    const firstAccount = accounts[0] || null;
    const accountName = firstAccount?.name || null; // e.g. "accounts/123456"

    let gbpLocationName = null;
    let gbpLocationTitle = null;

    if (accountName) {
      // Fetch locations for first account
      const locationsRes = await fetch(
        "https://mybusinessbusinessinformation.googleapis.com/v1/" + accountName + "/locations?readMask=name,title",
        { headers: { "authorization": "Bearer " + accessToken } }
      );
      const locationsJson = await locationsRes.json().catch(() => null);
      const locations = locationsJson?.locations || [];
      const firstLocation = locations[0] || null;
      gbpLocationName = firstLocation?.name || null; // e.g. "locations/789"
      gbpLocationTitle = firstLocation?.title || null;
    }

    // Store in channel_configs
    const now = new Date().toISOString();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const table = bq.dataset("analytics").table("channel_configs");
    await table.insert([{
      config_id: crypto.randomUUID(),
      user_id: userId,
      location_id: locationId || "",
      channel: "gbp",
      config_json: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        account_name: accountName,
        gbp_location_name: gbpLocationName,
        gbp_location_title: gbpLocationTitle,
      }),
      enabled: true,
      created_at: now,
      updated_at: now,
    }]);

    return redirect("/profile?gbp=success&location=" + encodeURIComponent(gbpLocationTitle || ""));
  } catch (err: any) {
    console.error("[gbp-callback] Error:", err);
    return redirect("/profile?gbp=error&reason=" + encodeURIComponent(err?.message || "unknown"));
  }
};