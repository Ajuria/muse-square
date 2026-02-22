/* empty css                                    */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { renderers } from "../renderers.mjs";
const $$Contact = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Contact — Muse Square" }, { "default": ($$result2) => renderTemplate`  ${maybeRenderHead()}<section class="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] aspect-[1440/500]"> <!-- Background layer (placeholder; swap to <picture> if needed) --> <picture class="absolute inset-0 block" aria-hidden="true"> <source srcset="/images/banner-contact-300k.png" type="image/png"> <img src="/images/banner-contact-300k.png" alt="" class="w-full h-full object-cover" sizes="100vw" loading="eager" decoding="async"> </picture> <!-- optional legibility overlay (same as Services) --> <div class="absolute inset-0 bg-black/10 md:bg-black/15" aria-hidden="true"></div> <!-- Overlay content: title only, aligned to the rail --> <div class="absolute inset-0"> <div class="ms-container h-full flex items-center"> <h1 class="ms-h1 text-primary">Discutons de vos besoins</h1> </div> </div> </section>  <section class="ms-section"> <div class="max-w-[800px]"> <p class="ms-lead text-[22px] sm:text-[24px] md:text-[26px] leading-[32px] sm:leading-[36px]">
Vous souhaitez bénéficier d'une intelligence contextuelle spécialisée dans votre territoire, ou être accompagné dans vos projets data et IA?
</p> <p class="mt-[12px] font-body text-[18px] leading-[28px] text-secondary">
Décrivez-nous votre besoin ou planifiez un rendez-vous en ligne via notre agenda.
</p> </div> </section> <div class="ms-divider my-[6px] sm:my-[8px] lg:my-[12px]"></div>  <section class="ms-section"> <div class="max-w-[700px]"> <form class="space-y-5" method="post" action="#"> <div> <label for="name" class="block font-heading text-[14px]">Nom</label> <input id="name" name="name" class="h-[44px] w-full px-[12px] border border-border rounded bg-white" placeholder="Votre nom"> </div> <div> <label for="email" class="block font-heading text-[14px]">Email</label> <input id="email" name="email" type="email" class="h-[44px] w-full px-[12px] border border-border rounded bg-white" placeholder="vous@example.com"> </div> <div> <label for="org" class="block font-heading text-[14px]">Organisation</label> <input id="org" name="org" class="h-[44px] w-full px-[12px] border border-border rounded bg-white" placeholder="Votre organisation"> </div> <div> <label for="msg" class="block font-heading text-[14px]">Message</label> <textarea id="msg" name="message" rows="5" class="w-full px-[12px] py-[12px] border border-border rounded bg-white" placeholder="Expliquez votre besoin…"></textarea> </div> <div class="flex items-center gap-4"> <button type="submit" class="msq-btn-ghost" data-kpi="contact_submit">
Envoyer
</button> <a href="https://calendly.com/julen-deajuriaguerra/30min" class="msq-link font-heading" target="_blank" rel="noopener noreferrer" data-kpi="contact_rdv">
Planifier un RDV
<span class="sr-only">(s’ouvre dans un nouvel onglet)</span> </a> </div> </form> </div> </section> ` })} <button type="submit" class="msq-btn-ghost" data-kpi="contact_submit">
Envoyer
</button>`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/contact.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/contact.astro";
const $$url = "/contact";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Contact,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
