/* empty css                                          */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../../../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../../../chunks/BaseLayout_B7lVY6IF.mjs";
import { renderers } from "../../../renderers.mjs";
const prerender = false;
const partial = true;
const $$Prompt = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Insight Marketing — Prompt", "hideSurveyCta": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-white pt-20 pb-10 px-4"> <div class="max-w-6xl mx-auto"> <div class="w-full rounded-2xl overflow-hidden border border-gray-200 bg-white"> <iframe title="Muse Square — Insight Marketing" width="100%" height="820" style="border:none;" src="https://app.hex.tech/019afdb4-43e2-7dd6-bd1f-656cf9f3f549/app/0320Gn4UpPaep2KfCQ8xkC/latest?embedded=true&page=prompt&product=insightmarketing" allow="clipboard-read; clipboard-write"></iframe> </div> </div> </div> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/app/insightmarketing/prompt.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/app/insightmarketing/prompt.astro";
const $$url = "/app/insightmarketing/prompt";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Prompt,
  file: $$file,
  partial,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
