/* empty css                                    */
import { e as createAstro, f as createComponent } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import "clsx";
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro("http://localhost:4322");
const prerender = false;
const $$OnboardingGate = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$OnboardingGate;
  return Astro2.redirect("/app");
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/onboarding-gate.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/onboarding-gate.astro";
const $$url = "/onboarding-gate";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$OnboardingGate,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
