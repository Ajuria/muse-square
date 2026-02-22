/* empty css                                    */
import { f as createComponent, e as createAstro, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { $ as $$InternalUIComponentRenderer } from "../chunks/InternalUIComponentRenderer_6kyXJqjO.mjs";
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro("http://localhost:4322");
const $$SignIn$1 = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$SignIn$1;
  return renderTemplate`${renderComponent($$result, "InternalUIComponentRenderer", $$InternalUIComponentRenderer, { ...Astro2.props, "component": "sign-in" })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/node_modules/@clerk/astro/components/interactive/SignIn.astro", void 0);
const $$SignIn = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Sign In - Muse Square", "hideSurveyCta": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="flex items-center justify-center min-h-[60vh]"> ${renderComponent($$result2, "ClerkSignIn", $$SignIn$1, { "afterSignInUrl": "/app/insightevent/prompt" })} </div> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/sign-in.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/sign-in.astro";
const $$url = "/sign-in";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$SignIn,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
