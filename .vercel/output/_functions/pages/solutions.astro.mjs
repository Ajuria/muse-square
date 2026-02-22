/* empty css                                    */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { renderers } from "../renderers.mjs";
const $$Solutions = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Solutions — Muse Square" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section> <h1 class="ms-h1">Solutions</h1> <p class="ms-lead mt-4">Nos solutions pour transformer vos données en leviers de décision et de développement.</p> </section> <div class="ms-divider"></div> <section class="grid lg:grid-cols-2 gap-[40px]"> <div> <h2 class="font-heading font-bold text-[28px] leading-[36px] text-primary">Blueprint – Vision & feuille de route data</h2> <p class="ms-lead mt-3">Vos données au service de votre stratégie.</p> <ul class="list-disc pl-5 mt-4 ms-body text-secondary"></ul> <li>Cadre stratégique & cartographie des besoins</li> <li>Tracking propre & gouvernance</li> <li>Dashboard exécutif</li> <p class="mt-4 font-heading text-[16px]"><a class="hover:underline" href="/contact">Contactez-nous</a> · <a class="hover:underline" href="/docs/blueprint.pdf">Télécharger notre brochure</a></p> </div> <div class="max-w-[500px]"><div class="w-full aspect-[5/4] bg-muted" aria-hidden="true"></div></div> </section> <div class="ms-divider"></div> <section class="grid lg:grid-cols-2 gap-[40px]"> <div> <h2 class="font-heading font-bold text-[28px] leading-[36px] text-primary">Audience Growth – Croissance & diversification des publics</h2> <p class="ms-lead mt-3">Vos données au service de vos publics et visiteurs.</p> <ul class="list-disc pl-5 mt-4 ms-body text-secondary"> <li>Segmentation & ciblage</li> <li>Expérimentations & A/B tests</li> <li>Quick wins mesurables</li> </ul> <p class="mt-4 font-heading text-[16px]"><a class="hover:underline" href="/contact">Contactez-nous</a> · <a class="hover:underline" href="/docs/engagement-lift.pdf">Télécharger notre brochure</a></p> </div> <div class="max-w-[500px]"><div class="w-full aspect-[5/4] bg-muted" aria-hidden="true"></div></div> </section> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/solutions.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/solutions.astro";
const $$url = "/solutions";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Solutions,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
