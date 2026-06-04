import type { APIRoute } from "astro";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;

const GRAPH_VERSION = "v25.0"; // match your app's API version (App settings → Advanced)

export const GET: APIRoute = async ({ url, locals, redirect, request }) => {
  const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
  if (!userId) return redirect("/sign-in");

  const locationId = url.searchParams.get("location_id") || "";
  if (locationId) requireLocationOwnership(locals, locationId);

  const clientId = process.env.META_APP_ID;
  const configId = process.env.META_CONFIG_ID;
  if (!clientId) return new Response("META_APP_ID manquant", { status: 500 });
  if (!configId) return new Response("META_CONFIG_ID manquant", { status: 500 });

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;
  const redirectUri = baseUrl + "/api/channels/meta-callback";
  const state = Buffer.from(JSON.stringify({ user_id: userId, location_id: locationId })).toString("base64url");

  const metaUrl = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`
    + "?client_id=" + encodeURIComponent(clientId)
    + "&redirect_uri=" + encodeURIComponent(redirectUri)
    + "&response_type=code"
    + "&config_id=" + encodeURIComponent(configId)
    + "&state=" + encodeURIComponent(state);

  return redirect(metaUrl);
};