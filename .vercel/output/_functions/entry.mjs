import { renderers } from "./renderers.mjs";
import { c as createExports, s as serverEntrypointModule } from "./chunks/_@astrojs-ssr-adapter_CHvQNM46.mjs";
import { manifest } from "./manifest_BtBknoEp.mjs";
const serverIslandMap = /* @__PURE__ */ new Map();
;
const _page0 = () => import("./pages/_image.astro.mjs");
const _page1 = () => import("./pages/a-propos.astro.mjs");
const _page2 = () => import("./pages/api/auth-inspect.astro.mjs");
const _page3 = () => import("./pages/api/debug-auth.astro.mjs");
const _page4 = () => import("./pages/api/insight/days.astro.mjs");
const _page5 = () => import("./pages/api/insight/legacy_days_compared_dates.astro.mjs");
const _page6 = () => import("./pages/api/insight/legacy_month_data.astro.mjs");
const _page7 = () => import("./pages/api/insight/month.astro.mjs");
const _page8 = () => import("./pages/api/insight/prompt.astro.mjs");
const _page9 = () => import("./pages/api/profile/save.astro.mjs");
const _page10 = () => import("./pages/api/saved-items/create.astro.mjs");
const _page11 = () => import("./pages/api/saved-items/delete.astro.mjs");
const _page12 = () => import("./pages/api/saved-items/get.astro.mjs");
const _page13 = () => import("./pages/api/saved-items/list.astro.mjs");
const _page14 = () => import("./pages/app/insightevent/days.astro.mjs");
const _page15 = () => import("./pages/app/insightevent/month.astro.mjs");
const _page16 = () => import("./pages/app/insightevent/prompt.astro.mjs");
const _page17 = () => import("./pages/app/insightmarketing/prompt.astro.mjs");
const _page18 = () => import("./pages/app.astro.mjs");
const _page19 = () => import("./pages/conditions-generales.astro.mjs");
const _page20 = () => import("./pages/contact.astro.mjs");
const _page21 = () => import("./pages/dashboard.astro.mjs");
const _page22 = () => import("./pages/form.astro.mjs");
const _page23 = () => import("./pages/locations/multi-location.astro.mjs");
const _page24 = () => import("./pages/mentions-legales.astro.mjs");
const _page25 = () => import("./pages/offres.astro.mjs");
const _page26 = () => import("./pages/onboarding.astro.mjs");
const _page27 = () => import("./pages/onboarding-gate.astro.mjs");
const _page28 = () => import("./pages/privacy.astro.mjs");
const _page29 = () => import("./pages/profile.astro.mjs");
const _page30 = () => import("./pages/references.astro.mjs");
const _page31 = () => import("./pages/sign-in.astro.mjs");
const _page32 = () => import("./pages/sign-up.astro.mjs");
const _page33 = () => import("./pages/solutions.astro.mjs");
const _page34 = () => import("./pages/index.astro.mjs");
const pageMap = /* @__PURE__ */ new Map([
  ["node_modules/astro/dist/assets/endpoint/generic.js", _page0],
  ["src/pages/a-propos.astro", _page1],
  ["src/pages/api/auth-inspect.ts", _page2],
  ["src/pages/api/debug-auth.ts", _page3],
  ["src/pages/api/insight/days.ts", _page4],
  ["src/pages/api/insight/legacy_days_compared_dates.ts", _page5],
  ["src/pages/api/insight/legacy_month_data.ts", _page6],
  ["src/pages/api/insight/month.ts", _page7],
  ["src/pages/api/insight/prompt.ts", _page8],
  ["src/pages/api/profile/save.ts", _page9],
  ["src/pages/api/saved-items/create.ts", _page10],
  ["src/pages/api/saved-items/delete.ts", _page11],
  ["src/pages/api/saved-items/get.ts", _page12],
  ["src/pages/api/saved-items/list.ts", _page13],
  ["src/pages/app/insightevent/days.astro", _page14],
  ["src/pages/app/insightevent/month.astro", _page15],
  ["src/pages/app/insightevent/prompt.astro", _page16],
  ["src/pages/app/insightmarketing/prompt.astro", _page17],
  ["src/pages/app/index.astro", _page18],
  ["src/pages/conditions-generales.astro", _page19],
  ["src/pages/contact.astro", _page20],
  ["src/pages/dashboard.astro", _page21],
  ["src/pages/form.astro", _page22],
  ["src/pages/locations/multi-location.astro", _page23],
  ["src/pages/mentions-legales.astro", _page24],
  ["src/pages/offres.astro", _page25],
  ["src/pages/onboarding.astro", _page26],
  ["src/pages/onboarding-gate.astro", _page27],
  ["src/pages/privacy.astro", _page28],
  ["src/pages/profile.astro", _page29],
  ["src/pages/references.astro", _page30],
  ["src/pages/sign-in.astro", _page31],
  ["src/pages/sign-up.astro", _page32],
  ["src/pages/solutions.astro", _page33],
  ["src/pages/index.astro", _page34]
]);
const _manifest = Object.assign(manifest, {
  pageMap,
  serverIslandMap,
  renderers,
  actions: () => import("./noop-entrypoint.mjs"),
  middleware: () => import("./_astro-internal_middleware.mjs")
});
const _args = {
  "middlewareSecret": "22badb15-9782-446e-811e-94dbda8fc4e0",
  "skewProtection": false
};
const _exports = createExports(_manifest, _args);
const __astrojsSsrVirtualEntry = _exports.default;
const _start = "start";
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) ;
export {
  __astrojsSsrVirtualEntry as default,
  pageMap
};
