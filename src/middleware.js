import "dotenv/config";
import { ADMIN_USER_IDS } from "./lib/admins";
import { clerkMiddleware, createRouteMatcher } from "@clerk/astro/server";
import { BigQuery } from "@google-cloud/bigquery";
import { resolveOperationalScope } from "./lib/scope";
import { getProfileContext, resolvePendingMembership } from "./lib/profileContext";
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
  // 29/07 : /api/import manquait. Ses deux routes lisent locals.location_id /
  // all_location_ids — sans elles, /api/import/locations renvoyait une liste VIDE (la page
  // ne demandait donc jamais « Pour quel établissement ? ») et /api/import/sales-csv
  // répondait NO_LOCATION. Le dépôt d'un fichier de ventes n'avait donc jamais pu aboutir,
  // pour aucun compte. Trouvé sur le premier upload réel (Les Olivades, 29/07).
  "/api/import(.*)",
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

// getProfileContext vit désormais dans src/lib/profileContext.js (incrément 2, vue
// équipe) : UNE requête couvre profil owner + memberships (analytics.location_members),
// et la couture est testable hors Astro. Le middleware ne garde que l'orchestration.

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
    let profile = { ok: false, location_id: null, first_name: null, all_location_ids: [], member_location_ids: [], member_poles: {}, is_member: false };

    try {
      const bq = getBigQueryClient(mustGetEnv("BQ_PROJECT_ID"));
      profile = await getProfileContext(bq, userId);
      // Première connexion d'un membre invité : ni profil, ni membership résolu →
      // tenter la résolution email→clerk_user_id (une fois par process), puis relire.
      if (!profile.ok && !profile.is_member) {
        const resolved = await resolvePendingMembership(bq, userId);
        if (resolved) profile = await getProfileContext(bq, userId);
      }
    } catch (e) {
      console.log("[MW] BigQuery check failed:", e && e.message ? e.message : e);
      profile = { ok: false, location_id: null, first_name: null, all_location_ids: [], member_location_ids: [], member_poles: {}, is_member: false };
    }

    // Rôle : un utilisateur avec au moins un site possédé est owner ; un pur membre n'a
    // que des sites de membership. SÉCURITÉ : all_location_ids reste POSSÉDÉ seulement
    // (la liste de requireLocationOwnership) — les sites membres vivent à part.
    const isPureMember = !profile.ok && (profile.member_location_ids || []).length > 0;

    context.locals.profileRowExists = profile.ok === true;
    context.locals.location_id = profile.location_id;
    context.locals.first_name = profile.first_name;
    context.locals.all_location_ids = profile.all_location_ids || [];
    context.locals.member_location_ids = profile.member_location_ids || [];
    context.locals.member_poles = profile.member_poles || {};
    context.locals.role = profile.ok ? "owner" : (isPureMember ? "member" : null);

    // ── Operational scope (multi-site, non destructif) ──
    // Calque ms_admin_as : lit le cookie ms_active_location, honoré UNIQUEMENT
    // si l'utilisateur possède ce location_id. Ne touche jamais is_primary.
    // Pose locals.scope (consommé par les vues opérationnelles, ex. pulse) ;
    // locals.location_id reste l'alias = scope.locationId pour le code existant.
    const cookieHeader = context.request.headers.get("cookie") || "";
    const activeMatch = cookieHeader.match(/ms_active_location=([^;]+)/);
    const activeCookieId = activeMatch ? decodeURIComponent(activeMatch[1]) : null;

    // Pour un pur membre, le périmètre opérationnel = ses sites de membership (le
    // cookie ms_active_location est honoré sur cette liste) ; la liste POSSÉDÉE des
    // gardes d'écriture n'est pas touchée.
    const scope = resolveOperationalScope({
      ownedLocationIds: isPureMember ? profile.member_location_ids : (profile.all_location_ids || []),
      primaryLocationId: isPureMember ? profile.member_location_ids[0] : profile.location_id,
      activeCookieId,
    });
    context.locals.scope = scope;
    context.locals.location_id = scope.locationId; // alias rétro-compatible

    if (activeCookieId && scope.locationId === activeCookieId) {
      console.log("[MW] Active location override:", profile.location_id, "->", activeCookieId);
    } else if (activeCookieId) {
      console.log("[MW] ms_active_location non possédé, ignoré:", activeCookieId);
    }

    console.log("[MW] profileRowExists:", context.locals.profileRowExists);
    console.log("[MW] location_id:", context.locals.location_id);
    console.log("[MW] profileRowExists:", profile.ok);
    console.log("[MW] location_id:", profile.location_id);
    console.log("[MW] request.url:", context.request.url);

    // ── Périmètre de pages membre (vue équipe, incrément 2) ──
    // Un pur membre voit Agir (pulse) + Piloter light (tableau) + le compte (/profile,
    // hors /app donc hors de cette garde). Toute autre page /app redirige vers Agir.
    if (isPureMember && appHit) {
      const memberPage =
        path.startsWith("/app/insightevent/pulse") ||
        path.startsWith("/app/insightevent/tableau");
      if (!memberPage) {
        console.log("[MW] member hors périmètre -> /app/insightevent/pulse");
        return context.redirect("/app/insightevent/pulse", 302);
      }
    }

    // --------------------------------------------------
    // FORCE ONBOARDING if logged in & profile incomplete
    // (jamais pour un pur membre : il n'a pas d'établissement à déclarer)
    // --------------------------------------------------
    if (
      userId &&
      !context.locals.profileRowExists &&
      !isPureMember &&
      !isOnboardingRoute(context.request) &&
      !path.startsWith("/profile") &&
      !path.startsWith("/api/profile")
    ) {
      console.log("[MW] -> force onboarding: /onboarding");
      return context.redirect("/onboarding", 302);
    }

    // Enforce profile only for /app/* (un membre n'a pas de profil : sa page passe)
    if (appHit && !isPureMember && (!context.locals.profileRowExists || !context.locals.location_id)) {
      console.log("[MW] -> redirect: /profile");
      return context.redirect("/profile", 302);
    }
  }

  console.log("[MW] -> next()");
  return next();
});
