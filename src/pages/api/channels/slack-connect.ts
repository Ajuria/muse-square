import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
  if (!userId) return redirect("/sign-in");

  const locationId = url.searchParams.get("location_id") || "";
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return new Response("SLACK_CLIENT_ID manquant", { status: 500 });
  }

  const baseUrl = url.origin;
  const redirectUri = baseUrl + "/api/channels/slack-callback";
  const state = Buffer.from(JSON.stringify({ user_id: userId, location_id: locationId })).toString("base64url");

  const slackUrl = "https://slack.com/oauth/v2/authorize"
    + "?client_id=" + encodeURIComponent(clientId)
    + "&scope=chat:write,channels:read"
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&state=" + encodeURIComponent(state);

  return redirect(slackUrl);
};