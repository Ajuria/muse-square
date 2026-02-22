/* empty css                                    */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { renderers } from "../renderers.mjs";
const $$Privacy = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Politique de confidentialité — Muse Square" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<h1>Politique de confidentialité</h1> <p>(Base légale, conservation, sous-traitants, droits RGPD — à compléter.)</p> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/privacy.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/privacy.astro";
const $$url = "/privacy";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Privacy,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
