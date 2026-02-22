/* empty css                                          */
import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate, h as addAttribute, m as maybeRenderHead } from "../../../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { a as $$SignedOut, b as $$SignedIn, $ as $$BaseLayout } from "../../../chunks/BaseLayout_B7lVY6IF.mjs";
import { $ as $$InsightBottomBar } from "../../../chunks/InsightBottomBar_CMpl7VY1.mjs";
/* empty css                                        */
import { renderers } from "../../../renderers.mjs";
var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Astro = createAstro("http://localhost:4322");
const prerender = false;
const $$Prompt = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Prompt;
  const location_id = Astro2.locals && typeof Astro2.locals.location_id === "string" && Astro2.locals.location_id.trim() ? Astro2.locals.location_id.trim() : null;
  if (!location_id) {
    return Astro2.redirect("/profile");
  }
  return renderTemplate`${renderComponent($$result, "SignedOut", $$SignedOut, {}, { "default": ($$result2) => renderTemplate` <meta http-equiv="refresh" content="0; url=/sign-in"> ` })} ${renderComponent($$result, "SignedIn", $$SignedIn, {}, { "default": ($$result2) => renderTemplate` ${renderComponent($$result2, "BaseLayout", $$BaseLayout, { "title": "Insight Event — Prompt", "hideSurveyCta": true, "hideFooter": true }, { "default": ($$result3) => renderTemplate(_a || (_a = __template([" ", '<div id="ie-prompt-root"', `> <div id="ie-prompt-main"> <header id="ie-prompt-header"> <nav id="ie-breadcrumb" aria-label="Breadcrumb"> <span class="ie-breadcrumb-root">Insight Event</span> <span class="ie-breadcrumb-sep">/</span> <span class="ie-breadcrumb-current" id="ie-breadcrumb-current">Prompt</span> </nav> </header> <!-- EMPTY STATE (shown before first submit) --> <section id="ie-prompt-empty"> <div id="ie-prompt-hero"> <h1 id="ie-prompt-title">Bonjour.</h1> <p id="ie-prompt-subtitle">Je suis votre outil d’aide à la décision opérationnelle. Que souhaitez-vous planifier aujourd’hui ?</p> </div> <div id="ie-prompt-suggestions-label">SUGGESTIONS</div> <a href="#" class="ie-prompt-card" data-suggestion-idx="0"> <div class="ie-prompt-card-icon"> <svg viewBox="0 0 24 24" aria-hidden="true"> <rect x="3" y="4" width="18" height="18" rx="2"></rect> <path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M3 10h18"></path> </svg> </div> <div class="ie-prompt-card-content"> <p class="ie-prompt-card-text">Quels sont les 3 meilleurs jours pour organiser un événement au mois de juin ?</p> </div> <div class="ie-prompt-card-arrow"> <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"> <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </svg> </div> </a> <a href="#" class="ie-prompt-card" data-suggestion-idx="1"> <div class="ie-prompt-card-icon"> <svg viewBox="0 0 24 24" aria-hidden="true"> <path d="M3 22h18"></path><path d="M6 18V9"></path><path d="M10 18V9"></path><path d="M14 18V9"></path><path d="M18 18V9"></path><path d="M4 9l8-4 8 4"></path> </svg> </div> <div class="ie-prompt-card-content"> <p class="ie-prompt-card-text">Quels week-ends sont les plus favorables pour un happening en extérieur au mois de mars ?</p> </div> <div class="ie-prompt-card-arrow"> <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"> <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </svg> </div> </a> <a href="#" class="ie-prompt-card" data-suggestion-idx="2"> <div class="ie-prompt-card-icon"> <svg viewBox="0 0 24 24" aria-hidden="true"> <path d="M3 3v18h18"></path><path d="M7 16v-6"></path><path d="M12 16V8"></path><path d="M17 16v-10"></path> </svg> </div> <div class="ie-prompt-card-content"> <p class="ie-prompt-card-text">Quelle est la probabilité d'une forte affluence pour une inauguration ce vendredi ?</p> </div> <div class="ie-prompt-card-arrow"> <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"> <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path> </svg> </div> </a> </section> <section id="ie-thread" aria-live="polite" hidden> <!-- AI output render target --> <div id="ai_output_mount"></div> </section> </div> <!-- END ie-prompt-main --> <!-- INPUT BAR (fixed above bottom nav) --> <div id="ie-prompt-input-wrap" aria-label="Prompt input"> <div id="ie-prompt-input-bar"> <textarea id="ie-prompt-input" placeholder="Posez votre question…" rows="1" aria-label="Votre question"></textarea> <button id="ie-prompt-submit-btn" type="button" aria-label="Envoyer"> <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"> <path d="M5 12h14M12 5l7 7-7 7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path> </svg> </button> </div> </div> <!-- Shared bottom navigation --> `, ' </div>   <script type="module" src="/scripts/ie-prompt.js" defer><\/script> '])), maybeRenderHead(), addAttribute(location_id, "data-location-id"), renderComponent($$result3, "InsightBottomBar", $$InsightBottomBar, { "active": "prompt", "showActions": false, "disableDays": true })) })} ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/app/insightevent/prompt.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/app/insightevent/prompt.astro";
const $$url = "/app/insightevent/prompt";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Prompt,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
