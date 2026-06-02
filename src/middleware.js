import "dotenv/config";
import { ADMIN_USER_IDS } from "./lib/admins";
import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { BigQuery } from "@google-cloud/bigquery";
console.log("[MW] LOADED middleware.js");

const isOnboardingRoute = createRouteMatcher([
  "/onboarding",
  "/onboarding(.*)",
]);

// ---- BigQuery client cache (module scope) ----
// Reused across requests within the same Node process.
// Safe for dev + prod; avoids creating a new client per request.
const _bqClients = new Map();

function getBigQueryClient(projectId) {
  const key = projectId || "__default__";
  let client = _bqClients.get(key);
  if (!client) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (raw) {
      try {
        const credentials = JSON.parse(raw);
        client = new BigQuery({ projectId, credentials });
      } catch {
        client = new BigQuery({ projectId });
      }
    } else {
      client = new BigQuery({ projectId });
    }
    _bqClients.set(key, client);
  }
  return client;
}

console.log("[MW] LOADED middleware.js");

const isProtectedRoute = createRouteMatcher([
  "/app",
  "/app(.*)",
  "/profile",
  "/profile(.*)",
  "/suivis",
  "/api/profile(.*)",
  "/api/saved-items(.*)",
  "/api/competitive(.*)",
  "/api/insight(.*)",
  "/api/analytics(.*)",
  "/api/channels/publish",
  "/api/channels/config",
  "/api/channels/team",
  "/api/channels/automation",
  "/api/channels/gbp-connect",
  "/api/channels/slack-connect",
]);

const isAppRoute = createRouteMatcher([
  "/app",
  "/app(.*)",
]);

const isLocalsRoute = createRouteMatcher([
  "/app",
  "/app(.*)",
  "/profile",
  "/profile(.*)",
  "/suivis",
  "/api/saved-items(.*)",
  "/api/insight(.*)",
  "/api/profile(.*)",
  "/api/competitive(.*)",
  "/api/analytics(.*)",
  "/api/channels(.*)",
]);

const DEV_BYPASS_PROMPT =
  import.meta.env.DEV && process.env.MS_AUTH_BYPASS === "1";

const isPromptRoute = createRouteMatcher([
  "/api/insight/prompt",
  "/api/insight/prompt(.*)",
]);

function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getProfileContext(clerk_user_id) {
  const projectId = mustGetEnv("BQ_PROJECT_ID");
  const dataset = mustGetEnv("BQ_DATASET");
  const table = mustGetEnv("BQ_TABLE");

  const bq = getBigQueryClient(projectId);

  const sql = `
    SELECT
      location_id,
      first_name,
      is_primary
    FROM \`${projectId}.${dataset}.${table}\`
    WHERE clerk_user_id = @clerk_user_id
    ORDER BY is_primary DESC, company_geocode_status = 'geocoded_ok' DESC, created_at DESC
  `;

  const [rows] = await bq.query({
    query: sql,
    location: "EU",
    params: { clerk_user_id },
  });

  if (!rows || rows.length === 0) {
    return { ok: false, location_id: null, first_name: null, all_location_ids: [] };
  }

  const r = rows[0] || {};
  const all_location_ids = rows.map(row => row.location_id).filter(Boolean);
  return {
    ok: true,
    location_id: (r.location_id ?? null),
    first_name: (r.first_name ?? null),
    all_location_ids,
  };
}

function isAssetPath(path) {
  return (
    // Astro / Vite internals (dev + build)
    path.startsWith("/_astro/") ||
    path.startsWith("/@vite/") ||
    path.startsWith("/@id/") ||
    path.startsWith("/node_modules/") ||

    // Your static assets
    path.startsWith("/fonts/") ||
    path.startsWith("/images/") ||
    path.startsWith("/assets/") ||
    path.startsWith("/favicon") ||

    // Common extensions
    path.endsWith(".css") ||
    path.endsWith(".js") ||
    path.endsWith(".map") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".jpeg") ||
    path.endsWith(".svg") ||
    path.endsWith(".webp") ||
    path.endsWith(".ico") ||
    path.endsWith(".otf") ||
    path.endsWith(".ttf") ||
    path.endsWith(".woff") ||
    path.endsWith(".woff2")
  );
}

export const onRequest = clerkMiddleware(async (auth, context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (isAssetPath(path)) return next();

  // ✅ DEV-only bypass: allow hitting prompt endpoint without Clerk session/cookies
  if (DEV_BYPASS_PROMPT && isPromptRoute(context.request)) {
    console.log("[MW] DEV_BYPASS_PROMPT -> next() for", path);
    return next();
  }

  const { userId } = auth();
  context.locals.clerk_user_id = userId || null;

  // ── Admin impersonation ──
  const ADMIN_IDS = ADMIN_USER_IDS;
  
  if (userId && ADMIN_IDS.includes(userId)) {
    const cookies = context.request.headers.get("cookie") || "";
    const match = cookies.match(/ms_admin_as=([^;]+)/);
    if (match) {
      const targetId = decodeURIComponent(match[1]);
      console.log("[MW] Admin impersonation:", userId, "->", targetId);
      context.locals.clerk_user_id = targetId;
      context.locals.real_clerk_user_id = userId;
    }
  }
  if (!context.locals.real_clerk_user_id) {
    context.locals.real_clerk_user_id = userId || null;
  }

  const protectedHit = isProtectedRoute(context.request);
  const appHit = isAppRoute(context.request);

  console.log("[MW] path:", path);
  console.log("[MW] userId:", userId);
  console.log("[MW] protectedHit:", protectedHit, "appHit:", appHit);

  if (protectedHit && !userId) {
    console.log("[MW] -> redirectToSignIn()");
    return auth().redirectToSignIn();
  }

  const localsHit = isLocalsRoute(context.request);

  if (userId && localsHit) {
    let profile = { ok: false, location_id: null, first_name: null };

    try {
      profile = await getProfileContext(userId);
    } catch (e) {
      console.log("[MW] BigQuery check failed:", e && e.message ? e.message : e);
      profile = { ok: false, location_id: null, first_name: null };
    }

    context.locals.profileRowExists = profile.ok === true;
    context.locals.location_id = profile.location_id;
    context.locals.first_name = profile.first_name;
    context.locals.all_location_ids = profile.all_location_ids || [];

    console.log("[MW] profileRowExists:", context.locals.profileRowExists);
    console.log("[MW] location_id:", context.locals.location_id);
    console.log("[MW] profileRowExists:", profile.ok);
    console.log("[MW] location_id:", profile.location_id);
    console.log("[MW] request.url:", context.request.url);

    // --------------------------------------------------
    // FORCE ONBOARDING if logged in & profile incomplete
    // --------------------------------------------------
    if (
      userId &&
      !context.locals.profileRowExists &&
      !isOnboardingRoute(context.request) &&
      !path.startsWith("/profile") &&
      !path.startsWith("/api/profile")
    ) {
      console.log("[MW] -> force onboarding: /onboarding");
      return context.redirect("/onboarding", 302);
    }

    // Enforce profile only for /app/*
    if (appHit && (!context.locals.profileRowExists || !context.locals.location_id)) {
      console.log("[MW] -> redirect: /profile");
      return context.redirect("/profile", 302);
    }
  }

  console.log("[MW] -> next()");
  return next();
});
