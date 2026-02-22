import { f as createComponent, e as createAstro, k as renderComponent, o as renderScript, r as renderTemplate, n as renderSlot, an as Fragment, h as addAttribute, m as maybeRenderHead, ao as renderHead } from "./astro/server_C4zwJFjj.mjs";
import "piccolore";
/* empty css                            */
import "clsx";
const $$Astro$8 = createAstro("http://localhost:4322");
const $$SignedInCSR = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$8, $$props, $$slots);
  Astro2.self = $$SignedInCSR;
  const { class: className } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "clerk-signed-in", "clerk-signed-in", { "class": className, "hidden": true }, { "default": () => renderTemplate` ${renderSlot($$result, $$slots["default"])} ` })} ${renderScript($$result, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedInCSR.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedInCSR.astro", void 0);
const $$Astro$7 = createAstro("http://localhost:4322");
const $$SignedInSSR = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$7, $$props, $$slots);
  Astro2.self = $$SignedInSSR;
  const { userId } = Astro2.locals.auth();
  return renderTemplate`${userId ? renderTemplate`${renderSlot($$result, $$slots["default"])}` : null}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedInSSR.astro", void 0);
const configOutput = "server";
function isStaticOutput(forceStatic) {
  if (forceStatic !== void 0) {
    return forceStatic;
  }
  return configOutput === "static";
}
const $$Astro$6 = createAstro("http://localhost:4322");
const $$SignedIn = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$6, $$props, $$slots);
  Astro2.self = $$SignedIn;
  const { isStatic, class: className } = Astro2.props;
  const SignedInComponent = isStaticOutput(isStatic) ? $$SignedInCSR : $$SignedInSSR;
  return renderTemplate`${renderComponent($$result, "SignedInComponent", SignedInComponent, { "class": className }, { "default": ($$result2) => renderTemplate` ${renderSlot($$result2, $$slots["default"])} ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedIn.astro", void 0);
const $$Astro$5 = createAstro("http://localhost:4322");
const $$SignedOutCSR = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$5, $$props, $$slots);
  Astro2.self = $$SignedOutCSR;
  const { class: className } = Astro2.props;
  return renderTemplate`${renderComponent($$result, "clerk-signed-out", "clerk-signed-out", { "class": className, "hidden": true }, { "default": () => renderTemplate` ${renderSlot($$result, $$slots["default"])} ` })} ${renderScript($$result, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedOutCSR.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedOutCSR.astro", void 0);
const $$Astro$4 = createAstro("http://localhost:4322");
const $$SignedOutSSR = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$4, $$props, $$slots);
  Astro2.self = $$SignedOutSSR;
  const { userId } = Astro2.locals.auth();
  return renderTemplate`${!userId ? renderTemplate`${renderSlot($$result, $$slots["default"])}` : null}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedOutSSR.astro", void 0);
const $$Astro$3 = createAstro("http://localhost:4322");
const $$SignedOut = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$3, $$props, $$slots);
  Astro2.self = $$SignedOut;
  const { isStatic, class: className } = Astro2.props;
  const SignedOutComponent = isStaticOutput(isStatic) ? $$SignedOutCSR : $$SignedOutSSR;
  return renderTemplate`${renderComponent($$result, "SignedOutComponent", SignedOutComponent, { "class": className }, { "default": ($$result2) => renderTemplate` ${renderSlot($$result2, $$slots["default"])} ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/control/SignedOut.astro", void 0);
var __freeze$1 = Object.freeze;
var __defProp$1 = Object.defineProperty;
var __template$1 = (cooked, raw) => __freeze$1(__defProp$1(cooked, "raw", { value: __freeze$1(cooked.slice()) }));
var _a$1;
const $$Astro$2 = createAstro("http://localhost:4322");
const $$Nav = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$Nav;
  const items = [
    { href: "/offres", label: "Solutions" },
    { href: "/a-propos", label: "À propos" },
    { href: "/contact", label: "Contact" }
  ];
  const normalize = (p) => p.replace(/\/+$/, "") || "/";
  const currentPath = normalize(Astro2.url.pathname);
  const isActive = (href) => {
    const h = normalize(href);
    return currentPath === h || h !== "/" && currentPath.startsWith(h + "/");
  };
  const isApp = Astro2.url.pathname.startsWith("/app") || Astro2.url.pathname === "/profile";
  const isInsightEvent = currentPath.startsWith("/app/insightevent");
  const isProfile = currentPath === "/profile" || currentPath.startsWith("/profile/");
  currentPath === "/sign-in" || currentPath.startsWith("/sign-in/");
  currentPath === "/sign-up" || currentPath.startsWith("/sign-up/");
  const isAppShell = isApp;
  return renderTemplate(_a$1 || (_a$1 = __template$1(["", '<header class="sticky top-0 z-50 w-full bg-background border-b border-border"> <nav class="ms-container py-3 md:py-4 flex items-center justify-between"> <!-- Logo --> <a', ' class="flex items-center gap-[16px]"> <img', "", ' class="block h-8 md:h-10 w-auto object-contain" loading="lazy" decoding="async"> </a> ', ' <div class="hidden md:flex items-center gap-10"> <!-- Primary nav --> <ul class="flex items-center gap-8 font-heading text-[15px] font-medium uppercase tracking-[0.5px] text-primary"> ', "  ", "  ", " </ul>  ", ' </div> <!-- Mobile nav --> <div id="mobileMenu" class="md:hidden hidden border-t border-border bg-background"> <ul class="ms-container py-4 grid gap-[24px] font-heading text-[15px] font-medium uppercase tracking-[0.5px] text-primary"> ', " </ul> </div> <script>\n    const btn = document.getElementById('menuBtn');\n    const menu = document.getElementById('mobileMenu');\n\n    if (!(btn instanceof HTMLElement) || !(menu instanceof HTMLElement)) {\n      // Nothing to wire up on pages without the mobile nav.\n    } else {\n\n    const toggle = () => {\n      if (!menu || !btn) return;\n      menu.classList.toggle('hidden');\n      const expanded = btn.getAttribute('aria-expanded') === 'true';\n      btn.setAttribute('aria-expanded', String(!expanded));\n    };\n\n    btn.addEventListener('click', toggle);\n\n    // Close menu on link click (mobile)\n    menu.addEventListener('click', (e) => {\n      const target = e.target;\n      const link = target instanceof Element ? target.closest('a') : null;\n      if (!link) return;\n\n      menu.classList.add('hidden');\n      btn.setAttribute('aria-expanded', 'false');\n    });\n\n    // Close on Escape\n    document.addEventListener('keydown', (e) => {\n      if (e.key === 'Escape' && !menu.classList.contains('hidden')) {\n        menu.classList.add('hidden');\n        btn.setAttribute('aria-expanded', 'false');\n      }\n    });\n    }\n  <\/script> </nav></header>"])), maybeRenderHead(), addAttribute(isAppShell ? "/app/insightevent/prompt" : "/", "href"), addAttribute(isAppShell ? "/images/logo_ms_insight.svg" : "/images/muse-square-logo.png?v=2", "src"), addAttribute(isAppShell ? "Muse Square Insight" : "Muse Square", "alt"), renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate`  <button id="menuBtn" class="md:hidden p-2" aria-label="Ouvrir le menu" aria-controls="mobileMenu" aria-expanded="false"> <svg width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true"> <path d="M3 6h18M3 12h18M3 18h18" stroke="#000"></path> </svg> </button> ` }), !isApp && items.map((i) => renderTemplate`<li> <a${addAttribute(i.href, "href")}${addAttribute(isActive(i.href) ? "page" : void 0, "aria-current")} class="ms-nav-link"> ${i.label} </a> </li>`), !isApp && renderTemplate`${renderComponent($$result, "SignedIn", $$SignedIn, {}, { "default": ($$result2) => renderTemplate` <li> <a href="/app/insightevent/prompt" class="ms-nav-link">
Insight
</a> </li> ` })}`, isApp && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li> <a href="/app/insightevent/prompt" class="ms-nav-link">
Event
</a> </li> <li> <span class="ms-nav-link opacity-40 cursor-not-allowed" aria-disabled="true">
Marketing
</span> </li> <li> <a href="/profile" class="ms-nav-link italic normal-case">
Profil
</a> </li> ${renderComponent($$result2, "SignedIn", $$SignedIn, {}, { "default": ($$result3) => renderTemplate` <li> <button type="button" class="logoutBtn ms-nav-link italic normal-case">
Log out
</button> </li> ` })} ` })}`, renderComponent($$result, "SignedOut", $$SignedOut, {}, { "default": ($$result2) => renderTemplate` <div class="flex items-center gap-8 font-heading text-[15px] font-medium uppercase tracking-[0.5px] text-primary"> <a href="/sign-in" class="ms-nav-link">
Se connecter
</a> <a href="/sign-up" class="ms-btn">
S’inscrire
</a> </div> ` }), isApp ? renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result2) => renderTemplate` <li> <a href="/app/insightevent/prompt"${addAttribute(isInsightEvent ? "page" : void 0, "aria-current")}${addAttribute(`font-heading relative inline-block pb-2 transition-opacity
                hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-[1px] after:h-[2px]
                ${isInsightEvent ? "after:bg-primary" : "after:bg-transparent"}`, "class")}>
Event
</a> </li> <li> <span class="font-heading inline-block pb-2 text-gray-300 cursor-not-allowed select-none" aria-disabled="true" title="Bientôt disponible">
Marketing
</span> </li> <li> <a href="/profile"${addAttribute(isProfile ? "page" : void 0, "aria-current")}${addAttribute(`font-heading relative inline-block pb-2 italic normal-case transition-opacity
                hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-[1px] after:h-[2px]
                ${isProfile ? "after:bg-primary" : "after:bg-transparent"}`, "class")}>
Profil
</a> </li> ${renderComponent($$result2, "SignedIn", $$SignedIn, {}, { "default": ($$result3) => renderTemplate` <li> <button type="button" class="logoutBtn font-heading relative inline-block pb-2 italic normal-case transition-opacity
                      hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
Log out
</button> </li> ` })} ` })}` : items.map((i) => renderTemplate`<li> <a${addAttribute(i.href, "href")}${addAttribute(isActive(i.href) ? "page" : void 0, "aria-current")}${addAttribute(`font-heading relative inline-block pb-2 transition-opacity
                hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-[1px] after:h-[2px]
                ${isActive(i.href) ? "after:bg-primary" : "after:bg-transparent"}`, "class")}> ${i.label} </a> </li>`));
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/components/Nav.astro", void 0);
const $$Footer = createComponent(($$result, $$props, $$slots) => {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  return renderTemplate`${maybeRenderHead()}<footer class="ms-footer w-full bg-background border-t border-border text-slate-700"> <!-- Top row: Logo + 3 columns --> <div class="ms-container py-[48px] grid grid-cols-1 md:grid-cols-4 gap-[32px] items-start"> <!-- Brand --> <div class="flex items-center md:items-start"> <img src="/images/muse-square-logo.png?v=2" alt="Muse Square" class="h-[28px] w-auto object-contain"> </div> <!-- Column 1 --> <div> <h4 class="not-italic uppercase tracking-[0.5px]">
Muse Square
</h4> <ul class="mt-[12px] space-y-[8px]"> <li><a href="/a-propos" class="font-body italic text-[13px] font-normal text-inherit">À propos</a></li> <li> <a href="https://www.linkedin.com/in/julen-de-ajuriaguerra/" target="_blank" rel="noopener noreferrer" class="font-body italic text-[13px] font-normal text-inherit hover:underline underline-offset-2">
LinkedIn
</a> </li> </ul> </div> <!-- Column 2 --> <div> <h4 class="not-italic uppercase tracking-[0.5px]">
Services
</h4> <ul class="mt-[12px] space-y-[8px]"> <li><a href="/offres#blueprint" class="font-body text-[13px] hover:underline underline-offset-2">insight event</a></li> <li><a href="/offres#engagement-lift" class="font-body text-[13px] hover:underline underline-offset-2">insight marketing</a></li> <li><a href="/offres#fractional-analytics" class="font-body text-[13px] hover:underline underline-offset-2">Agence Muse Square</a></li> <li> <a href="https://calendly.com/julen-deajuriaguerra/30min" target="_blank" rel="noopener noreferrer" class="font-body text-[13px] hover:underline underline-offset-2">
Planifier un RDV
</a> </li> </ul> </div> <!-- Column 3 --> <div> <h4 class="not-italic uppercase tracking-[0.5px]">
Mentions légales
</h4> <ul class="mt-[12px] space-y-[8px]"> <li><a href="/mentions-legales" class="font-body text-[13px] hover:underline underline-offset-2">Mentions légales</a></li> <li><a href="/conditions-generales" class="font-body text-[13px] hover:underline underline-offset-2">Conditions générales d’utilisation</a></li> </ul> </div> </div> <!-- Bottom row --> <div class="ms-container flex justify-center pt-[12px] pb-[48px]"> <span class="font-body italic text-[13px] leading-[1.45] text-slate-600 text-center">
© Muse Square ${year}. Tous droits réservés.
</span> </div> </footer>`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/components/Footer.astro", void 0);
const $$Astro$1 = createAstro("http://localhost:4322");
const $$SectionQuestionnaire = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$SectionQuestionnaire;
  const { formUrl, mode = "link" } = Astro2.props;
  return renderTemplate`${maybeRenderHead()}<section aria-labelledby="questionnaire-title" class="py-16 md:py-24"> <div class="mx-auto max-w-6xl px-4 sm:px-6"> <!-- Title + paragraph --> <div class="text-center space-y-3 mb-10 md:mb-12"> <h2 id="questionnaire-title" class="ms-h2">
Développez des outils de pilotage sur mesure
</h2> <p class="ms-body">
Connectez Muse Square insights à vos données internes selon les meilleurs standards de sécurité, de confidentialité et de gouvernance des données.
</p> </div> <!-- Steps row (md+: single row with arrows; mobile: stacked) --> <div class="grid grid-cols-1 md:grid-cols-8 gap-12 md:gap-10"> <!-- ÉTAPE 1 --> <div class="text-center md:col-span-2 flex flex-col items-center"> <!-- Circle unchanged; icon scaled larger and perfectly centered --> <div class="relative mx-auto mb-6 h-44 w-44 rounded-full bg-[#f5f5f5] overflow-hidden"> <img src="/images/icon-survey.png" alt="" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                h-44 w-44 object-contain origin-center scale-[1.3]" loading="lazy"> </div> <!-- Fixed heights to align baselines across all steps --> <div class="min-h-[28px] flex items-center"> <p class="ms-body font-bold leading-none">Étape 1</p> </div> <div class="min-h-[56px] flex items-center"> <p class="ms-body text-gray-600">Contactez-nous</p> </div> </div> <!-- ARROW 1 (desktop only) — exact midline of 44px circle --> <div class="hidden md:flex md:col-span-1 h-44 items-center justify-center" aria-hidden="true"> <svg width="220" height="40" viewBox="0 0 220 40" xmlns="http://www.w3.org/2000/svg"> <!-- line --> <path d="M10 20 H190" stroke="#FBC400" stroke-width="6" stroke-linecap="round"></path> <!-- open arrow head --> <path d="M190 10 L210 20 L190 30" stroke="#FBC400" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path> </svg> </div> <!-- ÉTAPE 2 --> <div class="text-center md:col-span-2 flex flex-col items-center"> <div class="relative mx-auto mb-6 h-44 w-44 rounded-full bg-[#f5f5f5] overflow-hidden"> <img src="/images/icon-time.png" alt="" class="absolute left-1/2 top-1/2
                    translate-x-[calc(-50%_-_10px)] translate-y-[calc(-50%_+_2px)]
                    h-44 w-44 object-contain origin-center scale-[1.3] pointer-events-none select-none" loading="lazy"> </div> <div class="min-h-[28px] flex items-center"> <p class="ms-body font-bold leading-none">Étape 2</p> </div> <div class="min-h-[56px] flex items-center"> <p class="ms-body text-gray-600">Recevez rapidement une feuille de route personnalisée</p> </div> </div> <!-- ARROW 2 --> <div class="hidden md:flex md:col-span-1 h-44 items-center justify-center" aria-hidden="true"> <svg width="220" height="40" viewBox="0 0 220 40" xmlns="http://www.w3.org/2000/svg"> <!-- line --> <path d="M10 20 H190" stroke="#FBC400" stroke-width="6" stroke-linecap="round"></path> <!-- open arrow head --> <path d="M190 10 L210 20 L190 30" stroke="#FBC400" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"></path> </svg> </div> <!-- ÉTAPE 3 --> <div class="text-center md:col-span-2 flex flex-col items-center"> <div class="relative mx-auto mb-6 h-44 w-44 rounded-full bg-[#f5f5f5] overflow-hidden"> <img src="/images/icon-contact.png" alt="" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                h-44 w-44 object-contain origin-center scale-[1.3]" loading="lazy"> </div> <div class="min-h-[28px] flex items-center"> <p class="ms-body font-bold leading-none">Étape 3</p> </div> <div class="min-h-[56px] flex items-center"> <p class="ms-body text-gray-600">Développons ensemble votre outil sur mesure</p> </div> </div> </div> <!-- CTA (Option A) --> ${mode === "link" && renderTemplate`<div class="mt-12 text-center"> <a href="/contact" class="inline-flex items-center justify-center border border-gray-900 px-7 py-3 rounded-none
                    uppercase tracking-[0.2px] text-[15px] font-bold leading-[1.2]
                    transition shadow-sm hover:shadow hover:-translate-y-0.5 active:translate-y-0
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 mx-auto" data-kpi="cta_contact">
NOUS CONTACTER
<span class="ml-2" aria-hidden="true">↗</span> </a> </div>`} </div> </section>`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/components/SectionQuestionnaire.astro", void 0);
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Astro = createAstro("http://localhost:4322");
const $$BaseLayout = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$BaseLayout;
  const {
    title = "Muse Square",
    hideSurveyCta = false,
    hideFooter = false,
    hideNav = false
  } = Astro2.props;
  const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSdaDoRrjhcEauybMeFNQSm_qlYD1RTahTw_ligFT2D20AoopA/viewform?usp=header";
  const isApp = Astro2.url.pathname.startsWith("/app");
  return renderTemplate(_a || (_a = __template(['<html lang="fr" data-astro-cid-37fxchfa> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>', '</title><!-- Favicons --><link rel="icon" href="/images/favicon.png?v=2" type="image/png"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-16.png?v=2"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2"><link rel="shortcut icon" href="/favicon-32.png?v=2"><!-- Page Loader (BaseLayout) --><!-- Ensure loader is ON before first paint --><script>\n      (function () {\n        try {\n          document.documentElement.classList.add("ms-loading");\n          document.body && document.body.classList.add("ms-loading");\n        } catch (_) {}\n      })();\n    <\/script>', "</head> <body", ' data-astro-cid-37fxchfa> <!-- Loader overlay --> <div id="ms-page-loader" aria-hidden="false" aria-live="polite" aria-busy="true" data-astro-cid-37fxchfa> <img class="ms-loader-gif" src="/icons/load/ms_load_icon.gif" alt="Chargement…" data-astro-cid-37fxchfa> </div> <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2" data-astro-cid-37fxchfa>\nAller au contenu principal\n</a> ', ' <main id="main"', "", " data-astro-cid-37fxchfa> ", " </main> ", " ", ' <!-- Loader controller --> <script>\n      (function () {\n        var loader = document.getElementById("ms-page-loader");\n        if (!loader) return;\n\n        function hide() {\n          loader.setAttribute("aria-hidden", "true");\n          loader.setAttribute("aria-busy", "false");\n          window.setTimeout(function () {\n            if (loader && loader.parentNode) loader.parentNode.removeChild(loader);\n          }, 180);\n        }\n\n        // Hide as soon as DOM is ready, with a max visible time of 500ms.\n        var hardCap = window.setTimeout(hide, 500);\n\n        if (document.readyState === "loading") {\n          document.addEventListener(\n            "DOMContentLoaded",\n            function () {\n              window.clearTimeout(hardCap);\n              // tiny delay so the GIF can show briefly without blocking anything\n              window.setTimeout(hide, 120);\n            },\n            { once: true }\n          );\n        } else {\n          window.clearTimeout(hardCap);\n          window.setTimeout(hide, 120);\n        }\n      })();\n    <\/script> <!-- Logout wiring (global) --> <script>\n      (function () {\n        function wire() {\n          var buttons = document.querySelectorAll(".logoutBtn");\n          if (!buttons.length) return;\n\n          var clerk = window.Clerk;\n          if (!clerk || typeof clerk.signOut !== "function") {\n            // Clerk not ready yet → retry a bit\n            var attempts = 0;\n            var t = window.setInterval(function () {\n              attempts++;\n              clerk = window.Clerk;\n              if (clerk && typeof clerk.signOut === "function") {\n                window.clearInterval(t);\n                wire(); // try again now that Clerk exists\n              } else if (attempts >= 30) {\n                window.clearInterval(t);\n                console.error("[logout] window.Clerk not available after retries");\n              }\n            }, 100);\n            return;\n          }\n\n          buttons.forEach(function (btn) {\n            if (btn.__msLogoutWired) return; // prevent double binding\n            btn.__msLogoutWired = true;\n\n            btn.addEventListener("click", function (e) {\n              e.preventDefault();\n              clerk.signOut({ redirectUrl: "/" }).catch(function (err) {\n                console.error("[logout] failed", err);\n              });\n            });\n          });\n        }\n\n        if (document.readyState === "loading") {\n          document.addEventListener("DOMContentLoaded", wire, { once: true });\n        } else {\n          wire();\n        }\n      })();\n    <\/script> </body> </html>'])), title, renderHead(), addAttribute(isApp ? "1" : void 0, "data-ms-app"), !hideNav && renderTemplate`${renderComponent($$result, "Nav", $$Nav, { "data-astro-cid-37fxchfa": true })}`, addAttribute(`ms-container ms-first-tight ${isApp ? "pb-0" : "pb-20"}`, "class"), addAttribute(
    isApp ? "padding-bottom: calc(var(--ms-bottombar-total-h, 0px) + env(safe-area-inset-bottom, 0px));" : void 0,
    "style"
  ), renderSlot($$result, $$slots["default"]), !hideSurveyCta && renderTemplate`${renderComponent($$result, "SectionQuestionnaire", $$SectionQuestionnaire, { "mode": "link", "formUrl": FORM_URL, "data-astro-cid-37fxchfa": true })}`, !hideFooter && renderTemplate`${renderComponent($$result, "Footer", $$Footer, { "data-astro-cid-37fxchfa": true })}`);
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/layouts/BaseLayout.astro", void 0);
export {
  $$BaseLayout as $,
  $$SignedOut as a,
  $$SignedIn as b
};
