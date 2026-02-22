import "dotenv/config";
import { createClerkClient } from "@clerk/backend";
import { createClerkRequest, constants, AuthStatus, TokenType, signedOutAuthObject, getAuthObjectForAcceptedToken, createRedirect } from "@clerk/backend/internal";
import { isDevelopmentFromSecretKey } from "@clerk/shared/keys";
import { handleNetlifyCacheInDevInstance } from "@clerk/shared/netlifyCacheHandler";
import { isHttpOrHttps } from "@clerk/shared/proxy";
import { handleValueOrFn } from "@clerk/shared/utils";
import { clerkJsScriptUrl } from "@clerk/shared/loadClerkJsScript";
import { isTruthy } from "@clerk/shared/underscore";
import { DEV_BROWSER_JWT_KEY, setDevBrowserJWTInURL } from "@clerk/shared/devBrowser";
import { createPathMatcher } from "@clerk/shared/pathMatcher";
import { BigQuery } from "@google-cloud/bigquery";
import "es-module-lexer";
import "./chunks/astro-designed-error-pages_FguXv6tr.mjs";
import "piccolore";
import "./chunks/astro/server_C4zwJFjj.mjs";
import "clsx";
import { s as sequence } from "./chunks/index_CtwVKTR2.mjs";
async function createAsyncLocalStorage() {
  const { AsyncLocalStorage } = await import("async_hooks");
  return new AsyncLocalStorage();
}
var authAsyncStorage = await createAsyncLocalStorage();
const __vite_import_meta_env__ = { "ASSETS_PREFIX": void 0, "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "PUBLIC_CALENDLY_URL": "https://calendly.com/", "PUBLIC_CLERK_AFTER_SIGN_IN_URL": "/app", "PUBLIC_CLERK_AFTER_SIGN_UP_URL": "/app", "PUBLIC_CLERK_PUBLISHABLE_KEY": "pk_test_Y29tcG9zZWQtYmFzaWxpc2stNTMuY2xlcmsuYWNjb3VudHMuZGV2JA", "PUBLIC_CLERK_SIGN_IN_URL": "/sign-in", "PUBLIC_CLERK_SIGN_UP_URL": "/sign-up", "PUBLIC_FORMS_ENDPOINT": "", "PUBLIC_PLAUSIBLE_DOMAIN": "", "SITE": "http://localhost:4322", "SSR": true };
function getContextEnvVar(envVarName, contextOrLocals) {
  const locals = "locals" in contextOrLocals ? contextOrLocals.locals : contextOrLocals;
  if (locals?.runtime?.env) {
    return locals.runtime.env[envVarName];
  }
  return Object.assign(__vite_import_meta_env__, { CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY, _: process.env._ })[envVarName];
}
function getSafeEnv(context) {
  return {
    domain: getContextEnvVar("PUBLIC_CLERK_DOMAIN", context),
    isSatellite: getContextEnvVar("PUBLIC_CLERK_IS_SATELLITE", context) === "true",
    proxyUrl: getContextEnvVar("PUBLIC_CLERK_PROXY_URL", context),
    pk: getContextEnvVar("PUBLIC_CLERK_PUBLISHABLE_KEY", context),
    sk: getContextEnvVar("CLERK_SECRET_KEY", context),
    machineSecretKey: getContextEnvVar("CLERK_MACHINE_SECRET_KEY", context),
    signInUrl: getContextEnvVar("PUBLIC_CLERK_SIGN_IN_URL", context),
    signUpUrl: getContextEnvVar("PUBLIC_CLERK_SIGN_UP_URL", context),
    clerkJsUrl: getContextEnvVar("PUBLIC_CLERK_JS_URL", context),
    clerkJsVariant: getContextEnvVar("PUBLIC_CLERK_JS_VARIANT", context),
    clerkJsVersion: getContextEnvVar("PUBLIC_CLERK_JS_VERSION", context),
    apiVersion: getContextEnvVar("CLERK_API_VERSION", context),
    apiUrl: getContextEnvVar("CLERK_API_URL", context),
    telemetryDisabled: isTruthy(getContextEnvVar("PUBLIC_CLERK_TELEMETRY_DISABLED", context)),
    telemetryDebug: isTruthy(getContextEnvVar("PUBLIC_CLERK_TELEMETRY_DEBUG", context))
  };
}
function getClientSafeEnv(context) {
  return {
    domain: getContextEnvVar("PUBLIC_CLERK_DOMAIN", context),
    isSatellite: getContextEnvVar("PUBLIC_CLERK_IS_SATELLITE", context) === "true",
    proxyUrl: getContextEnvVar("PUBLIC_CLERK_PROXY_URL", context),
    signInUrl: getContextEnvVar("PUBLIC_CLERK_SIGN_IN_URL", context),
    signUpUrl: getContextEnvVar("PUBLIC_CLERK_SIGN_UP_URL", context)
  };
}
function buildClerkHotloadScript(locals) {
  const publishableKey = getSafeEnv(locals).pk;
  const proxyUrl = getSafeEnv(locals).proxyUrl;
  const domain = getSafeEnv(locals).domain;
  const scriptSrc = clerkJsScriptUrl({
    clerkJSUrl: getSafeEnv(locals).clerkJsUrl,
    clerkJSVariant: getSafeEnv(locals).clerkJsVariant,
    clerkJSVersion: getSafeEnv(locals).clerkJsVersion,
    domain,
    proxyUrl,
    publishableKey
  });
  return `
  <script src="${scriptSrc}"
  data-clerk-js-script
  async
  crossOrigin='anonymous'
  ${publishableKey ? `data-clerk-publishable-key="${publishableKey}"` : ``}
  ${proxyUrl ? `data-clerk-proxy-url="${proxyUrl}"` : ``}
  ${domain ? `data-clerk-domain="${domain}"` : ``}
  ><\/script>
`;
}
var createClerkClientWithOptions = (context, options) => createClerkClient({
  secretKey: getSafeEnv(context).sk,
  machineSecretKey: getSafeEnv(context).machineSecretKey,
  publishableKey: getSafeEnv(context).pk,
  apiUrl: getSafeEnv(context).apiUrl,
  apiVersion: getSafeEnv(context).apiVersion,
  proxyUrl: getSafeEnv(context).proxyUrl,
  domain: getSafeEnv(context).domain,
  isSatellite: getSafeEnv(context).isSatellite,
  userAgent: `${"@clerk/astro"}@${"2.16.12"}`,
  sdkMetadata: {
    name: "@clerk/astro",
    version: "2.16.12",
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    environment: Object.assign(__vite_import_meta_env__, { CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY, _: process.env._ }).MODE
  },
  telemetry: {
    disabled: getSafeEnv(context).telemetryDisabled,
    debug: getSafeEnv(context).telemetryDebug
  },
  ...options
});
var clerkClient = (context) => createClerkClientWithOptions(context);
var createCurrentUser = (context) => {
  return async () => {
    const { userId } = context.locals.auth();
    if (!userId) {
      return null;
    }
    return clerkClient(context).users.getUser(userId);
  };
};
var serverRedirectWithAuth = (context, clerkRequest, res, opts) => {
  const location = res.headers.get("location");
  const shouldAppendDevBrowser = res.headers.get(constants.Headers.ClerkRedirectTo) === "true";
  if (shouldAppendDevBrowser && !!location && // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  isDevelopmentFromSecretKey(opts.secretKey || getSafeEnv(context).sk) && clerkRequest.clerkUrl.isCrossOrigin(location)) {
    const dbJwt = clerkRequest.cookies.get(DEV_BROWSER_JWT_KEY) || "";
    const url = new URL(location);
    const urlWithDevBrowser = setDevBrowserJWTInURL(url, dbJwt);
    return context.redirect(urlWithDevBrowser.href, 307);
  }
  return res;
};
var isRedirect = (res) => {
  return [300, 301, 302, 303, 304, 307, 308].includes(res.status) || res.headers.get(constants.Headers.ClerkRedirectTo) === "true";
};
var setHeader = (res, name, val) => {
  res.headers.set(name, val);
  return res;
};
var CONTROL_FLOW_ERROR = {
  REDIRECT_TO_SIGN_IN: "CLERK_PROTECT_REDIRECT_TO_SIGN_IN"
};
var clerkMiddleware = (...args) => {
  const [handler, options] = parseHandlerAndOptions(args);
  const astroMiddleware = async (context, next) => {
    if (isPrerenderedPage(context)) {
      return next();
    }
    const clerkRequest = createClerkRequest(context.request);
    const requestState = await clerkClient(context).authenticateRequest(
      clerkRequest,
      createAuthenticateRequestOptions(clerkRequest, options, context)
    );
    const locationHeader = requestState.headers.get(constants.Headers.Location);
    if (locationHeader) {
      handleNetlifyCacheInDevInstance({
        locationHeader,
        requestStateHeaders: requestState.headers,
        publishableKey: requestState.publishableKey
      });
      const res = new Response(null, { status: 307, headers: requestState.headers });
      return decorateResponseWithObservabilityHeaders(res, requestState);
    } else if (requestState.status === AuthStatus.Handshake) {
      throw new Error("Clerk: handshake status without redirect");
    }
    const authObjectFn = (opts) => requestState.toAuth(opts);
    const redirectToSignIn = createMiddlewareRedirectToSignIn(clerkRequest);
    decorateAstroLocal(clerkRequest, authObjectFn, context, requestState);
    const asyncStorageAuthObject = authObjectFn().tokenType === TokenType.SessionToken ? authObjectFn() : signedOutAuthObject({});
    const authHandler = (opts) => {
      const authObject = getAuthObjectForAcceptedToken({
        authObject: authObjectFn({ treatPendingAsSignedOut: opts?.treatPendingAsSignedOut }),
        acceptsToken: opts?.acceptsToken
      });
      if (authObject.tokenType === TokenType.SessionToken) {
        return Object.assign(authObject, { redirectToSignIn });
      }
      return authObject;
    };
    return authAsyncStorage.run(asyncStorageAuthObject, async () => {
      let handlerResult;
      try {
        handlerResult = await handler?.(authHandler, context, next) || await next();
      } catch (e) {
        handlerResult = handleControlFlowErrors(e, clerkRequest, requestState, context);
      }
      if (isRedirect(handlerResult)) {
        return serverRedirectWithAuth(context, clerkRequest, handlerResult, options);
      }
      const response = decorateRequest(context.locals, handlerResult);
      if (requestState.headers) {
        requestState.headers.forEach((value, key) => {
          response.headers.append(key, value);
        });
      }
      return response;
    });
  };
  return astroMiddleware;
};
var isPrerenderedPage = (context) => {
  return (
    // for Astro v5
    "isPrerendered" in context && context.isPrerendered || // for Astro v4
    "_isPrerendered" in context && context._isPrerendered
  );
};
var parseHandlerAndOptions = (args) => {
  return [
    typeof args[0] === "function" ? args[0] : void 0,
    (args.length === 2 ? args[1] : typeof args[0] === "function" ? {} : args[0]) || {}
  ];
};
var createAuthenticateRequestOptions = (clerkRequest, options, context) => {
  return {
    ...options,
    secretKey: options.secretKey || getSafeEnv(context).sk,
    publishableKey: options.publishableKey || getSafeEnv(context).pk,
    signInUrl: options.signInUrl || getSafeEnv(context).signInUrl,
    signUpUrl: options.signUpUrl || getSafeEnv(context).signUpUrl,
    ...handleMultiDomainAndProxy(clerkRequest, options, context),
    acceptsToken: "any"
  };
};
var decorateResponseWithObservabilityHeaders = (res, requestState) => {
  if (requestState.message) {
    res.headers.set(constants.Headers.AuthMessage, encodeURIComponent(requestState.message));
  }
  if (requestState.reason) {
    res.headers.set(constants.Headers.AuthReason, encodeURIComponent(requestState.reason));
  }
  if (requestState.status) {
    res.headers.set(constants.Headers.AuthStatus, encodeURIComponent(requestState.status));
  }
  return res;
};
var handleMultiDomainAndProxy = (clerkRequest, opts, context) => {
  const relativeOrAbsoluteProxyUrl = handleValueOrFn(
    opts?.proxyUrl,
    clerkRequest.clerkUrl,
    getSafeEnv(context).proxyUrl
  );
  let proxyUrl;
  if (!!relativeOrAbsoluteProxyUrl && !isHttpOrHttps(relativeOrAbsoluteProxyUrl)) {
    proxyUrl = new URL(relativeOrAbsoluteProxyUrl, clerkRequest.clerkUrl).toString();
  } else {
    proxyUrl = relativeOrAbsoluteProxyUrl;
  }
  const isSatellite = handleValueOrFn(opts.isSatellite, new URL(clerkRequest.url), getSafeEnv(context).isSatellite);
  const domain = handleValueOrFn(opts.domain, new URL(clerkRequest.url), getSafeEnv(context).domain);
  const signInUrl = opts?.signInUrl || getSafeEnv(context).signInUrl;
  if (isSatellite && !proxyUrl && !domain) {
    throw new Error(missingDomainAndProxy);
  }
  if (isSatellite && !isHttpOrHttps(signInUrl) && // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  isDevelopmentFromSecretKey(opts.secretKey || getSafeEnv(context).sk)) {
    throw new Error(missingSignInUrlInDev);
  }
  return {
    proxyUrl,
    isSatellite,
    domain
  };
};
var missingDomainAndProxy = `
Missing domain and proxyUrl. A satellite application needs to specify a domain or a proxyUrl.

1) With middleware
   e.g. export default clerkMiddleware({domain:'YOUR_DOMAIN',isSatellite:true});
2) With environment variables e.g.
   PUBLIC_CLERK_DOMAIN='YOUR_DOMAIN'
   PUBLIC_CLERK_IS_SATELLITE='true'
   `;
var missingSignInUrlInDev = `
Invalid signInUrl. A satellite application requires a signInUrl for development instances.
Check if signInUrl is missing from your configuration or if it is not an absolute URL

1) With middleware
   e.g. export default clerkMiddleware({signInUrl:'SOME_URL', isSatellite:true});
2) With environment variables e.g.
   PUBLIC_CLERK_SIGN_IN_URL='SOME_URL'
   PUBLIC_CLERK_IS_SATELLITE='true'`;
function decorateAstroLocal(clerkRequest, authObjectFn, context, requestState) {
  const { reason, message, status, token } = requestState;
  context.locals.authToken = token;
  context.locals.authStatus = status;
  context.locals.authMessage = message;
  context.locals.authReason = reason;
  context.locals.auth = (({ acceptsToken, treatPendingAsSignedOut } = {}) => {
    const authObject = getAuthObjectForAcceptedToken({
      authObject: authObjectFn({ treatPendingAsSignedOut }),
      acceptsToken
    });
    if (authObject.tokenType === TokenType.SessionToken) {
      const clerkUrl = clerkRequest.clerkUrl;
      const redirectToSignIn = (opts = {}) => {
        const devBrowserToken = clerkRequest.clerkUrl.searchParams.get(constants.QueryParameters.DevBrowser) || clerkRequest.cookies.get(constants.Cookies.DevBrowser);
        return createRedirect({
          redirectAdapter,
          devBrowserToken,
          baseUrl: clerkUrl.toString(),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          publishableKey: getSafeEnv(context).pk,
          signInUrl: requestState.signInUrl,
          signUpUrl: requestState.signUpUrl,
          sessionStatus: requestState.toAuth()?.sessionStatus
        }).redirectToSignIn({
          returnBackUrl: opts.returnBackUrl === null ? "" : opts.returnBackUrl || clerkUrl.toString()
        });
      };
      return Object.assign(authObject, { redirectToSignIn });
    }
    return authObject;
  });
  context.locals.currentUser = createCurrentUser(context);
}
function findClosingHeadTagIndex(chunk, endHeadTag) {
  return chunk.findIndex((_, i) => endHeadTag.every((value, j) => value === chunk[i + j]));
}
function decorateRequest(locals, res) {
  if (res.headers.get("content-type") === "text/html") {
    const encoder = new TextEncoder();
    const closingHeadTag = encoder.encode("</head>");
    const clerkAstroData = encoder.encode(
      `<script id="__CLERK_ASTRO_DATA__" type="application/json">${JSON.stringify(locals.auth())}<\/script>
`
    );
    const clerkSafeEnvVariables = encoder.encode(
      `<script id="__CLERK_ASTRO_SAFE_VARS__" type="application/json">${JSON.stringify(getClientSafeEnv(locals))}<\/script>
`
    );
    const hotloadScript = encoder.encode(buildClerkHotloadScript(locals));
    const stream = res.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const index = findClosingHeadTagIndex(chunk, closingHeadTag);
          const isClosingHeadTagFound = index !== -1;
          if (isClosingHeadTagFound) {
            controller.enqueue(chunk.slice(0, index));
            controller.enqueue(clerkAstroData);
            controller.enqueue(clerkSafeEnvVariables);
            controller.enqueue(hotloadScript);
            controller.enqueue(closingHeadTag);
            controller.enqueue(chunk.slice(index + closingHeadTag.length));
          } else {
            controller.enqueue(chunk);
          }
        }
      })
    );
    const modifiedResponse = new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers
    });
    return modifiedResponse;
  }
  return res;
}
var redirectAdapter = (url) => {
  const res = new Response(null, {
    status: 307
  });
  setHeader(res, constants.Headers.ClerkRedirectTo, "true");
  return setHeader(res, "Location", url instanceof URL ? url.href : url);
};
var createMiddlewareRedirectToSignIn = (clerkRequest) => {
  return (opts = {}) => {
    const err = new Error(CONTROL_FLOW_ERROR.REDIRECT_TO_SIGN_IN);
    err.returnBackUrl = opts.returnBackUrl === null ? "" : opts.returnBackUrl || clerkRequest.clerkUrl.toString();
    throw err;
  };
};
var handleControlFlowErrors = (e, clerkRequest, requestState, context) => {
  switch (e.message) {
    case CONTROL_FLOW_ERROR.REDIRECT_TO_SIGN_IN:
      return createRedirect({
        redirectAdapter,
        baseUrl: clerkRequest.clerkUrl,
        signInUrl: requestState.signInUrl,
        signUpUrl: requestState.signUpUrl,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        publishableKey: getSafeEnv(context).pk,
        sessionStatus: requestState.toAuth()?.sessionStatus
      }).redirectToSignIn({ returnBackUrl: e.returnBackUrl });
    default:
      throw e;
  }
};
var createRouteMatcher = (routes) => {
  const matcher = createPathMatcher(routes);
  return (req) => matcher(new URL(req.url).pathname);
};
console.log("[MW] LOADED middleware.js");
const isOnboardingRoute = createRouteMatcher([
  "/onboarding",
  "/onboarding(.*)"
]);
const _bqClients = /* @__PURE__ */ new Map();
function getBigQueryClient(projectId) {
  const key = projectId || "__default__";
  let client = _bqClients.get(key);
  if (!client) {
    client = new BigQuery({ projectId });
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
  "/api/profile(.*)",
  "/api/saved-items(.*)",
  "/api/insight(.*)"
]);
const isAppRoute = createRouteMatcher([
  "/app",
  "/app(.*)"
]);
const isLocalsRoute = createRouteMatcher([
  "/app",
  "/app(.*)",
  "/profile",
  "/profile(.*)",
  "/api/saved-items(.*)",
  "/api/insight(.*)"
]);
createRouteMatcher([
  "/api/insight/prompt",
  "/api/insight/prompt(.*)"
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
      first_name
    FROM \`${projectId}.${dataset}.${table}\`
    WHERE clerk_user_id = @clerk_user_id
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  const [rows] = await bq.query({
    query: sql,
    location: "EU",
    params: { clerk_user_id }
  });
  if (!rows || rows.length === 0) {
    return { ok: false, location_id: null, first_name: null };
  }
  const r = rows[0] || {};
  return {
    ok: true,
    location_id: r.location_id ?? null,
    first_name: r.first_name ?? null
  };
}
function isAssetPath(path) {
  return (
    // Astro / Vite internals (dev + build)
    path.startsWith("/_astro/") || path.startsWith("/@vite/") || path.startsWith("/@id/") || path.startsWith("/node_modules/") || // Your static assets
    path.startsWith("/fonts/") || path.startsWith("/images/") || path.startsWith("/assets/") || path.startsWith("/favicon") || // Common extensions
    path.endsWith(".css") || path.endsWith(".js") || path.endsWith(".map") || path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".svg") || path.endsWith(".webp") || path.endsWith(".ico") || path.endsWith(".otf") || path.endsWith(".ttf") || path.endsWith(".woff") || path.endsWith(".woff2")
  );
}
const onRequest$1 = clerkMiddleware(async (auth, context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;
  if (isAssetPath(path)) return next();
  const { userId } = auth();
  context.locals.clerk_user_id = userId || null;
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
    console.log("[MW] profileRowExists:", context.locals.profileRowExists);
    console.log("[MW] location_id:", context.locals.location_id);
    if (userId && !context.locals.profileRowExists && !isOnboardingRoute(context.request) && !path.startsWith("/profile")) {
      const target = new URL("/onboarding", context.request.url).toString();
      console.log("[MW] -> force onboarding:", target);
      return context.redirect(target, 302);
    }
    if (appHit && (!context.locals.profileRowExists || !context.locals.location_id)) {
      const target = new URL("/profile", context.request.url).toString();
      console.log("[MW] -> redirect:", target);
      return context.redirect(target, 302);
    }
  }
  console.log("[MW] -> next()");
  return next();
});
const onRequest = sequence(
  onRequest$1
);
export {
  onRequest
};
