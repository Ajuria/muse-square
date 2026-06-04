import type { APIRoute } from "astro";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals, redirect, request }) => {
  const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
  if (!userId) return redirect("/sign-in");

  const locationId = url.searchParams.get("location_id") || "";
  if (locationId) requireLocationOwnership(locals, locationId);
  const clientId = process.env.GOOGLE_GBP_CLIENT_ID;
  if (!clientId) {
    return new Response("GOOGLE_GBP_CLIENT_ID manquant", { status: 500 });
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;
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