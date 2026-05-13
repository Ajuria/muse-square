import type { APIRoute } from "astro";
export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
  if (!userId) return redirect("/sign-in");

  const locationId = url.searchParams.get("location_id") || "";
  const clientId = process.env.GOOGLE_GBP_CLIENT_ID;
  if (!clientId) {
    return new Response("GOOGLE_GBP_CLIENT_ID manquant", { status: 500 });
  }

  const baseUrl = url.origin;
  const redirectUri = baseUrl + "/api/channels/gbp-callback";
  const state = Buffer.from(JSON.stringify({ user_id: userId, location_id: locationId })).toString("base64url");

  const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth"
    + "?client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&response_type=code"
    + "&scope=" + encodeURIComponent("https://www.googleapis.com/auth/business.manage")
    + "&access_type=offline"
    + "&prompt=consent"
    + "&state=" + encodeURIComponent(state);

  return redirect(googleUrl);
};