/* empty css                                    */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
/* empty css                                      */
import { renderers } from "../renderers.mjs";
const $$Onboarding = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Activez votre Intelligence - Muse Square", "hideSurveyCta": true, "data-astro-cid-snsfjv3m": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<main id="ms-onboarding" data-astro-cid-snsfjv3m> <section class="ms-wrap" data-astro-cid-snsfjv3m> <div class="ms-content" data-astro-cid-snsfjv3m> <!-- Icon cluster --> <div class="ms-iconBlock" data-astro-cid-snsfjv3m> <div class="ms-iconStack" data-astro-cid-snsfjv3m> <div class="ms-glow" aria-hidden="true" data-astro-cid-snsfjv3m></div> <div class="ms-mainCircle" aria-hidden="true" data-astro-cid-snsfjv3m> <img class="ms-mainIcon" src="/images/context.png" alt="Intelligence métier" data-astro-cid-snsfjv3m> </div> <div class="ms-editBadge" aria-hidden="true" data-astro-cid-snsfjv3m> <svg class="ms-editSvg" fill="none" stroke="currentColor" viewBox="0 0 24 24" data-astro-cid-snsfjv3m> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" data-astro-cid-snsfjv3m></path> </svg> </div> </div> </div> <!-- Title --> <h1 class="ms-h1" data-astro-cid-snsfjv3m>
Activez votre<br data-astro-cid-snsfjv3m>Intelligence métier
</h1> <!-- Body --> <p class="ms-p" data-astro-cid-snsfjv3m>
Pour recevoir des prévisions ultra-précises, renseignez votre contexte d'activité.
</p> <!-- CTA --> <button type="button" class="ms-btn h-[56px] font-normal" data-kpi="contact_submit" onclick="window.location.href='/onboarding-gate';" data-astro-cid-snsfjv3m>
COMPLÉTER MON PROFIL
</button> <!-- Notice --> <p class="ms-note" data-astro-cid-snsfjv3m>ÉTAPE REQUISE POUR CONTINUER</p> </div> </section> </main>  ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/onboarding.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/onboarding.astro";
const $$url = "/onboarding";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Onboarding,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
