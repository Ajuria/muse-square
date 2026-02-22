/* empty css                                    */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
/* empty css                                            */
import { renderers } from "../renderers.mjs";
const $$MentionsLegales = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Mentions légales — Muse Square" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<section class="ms-section"> <div class="max-w-[900px]"> <!-- Page title --> <h1 class="ms-h1 mb-[24px] md:mb-[32px]">
Mentions légales
</h1> <!-- Helpers (no @layer) -->  <p class="legal-body">
Le site www.musesquare.com est édité par Monsieur Julen DE AJURIA GUERRA, créateur de Muse Square, entreprise en cours d’immatriculation.<br>
Éditeur : Julen DE AJURIA GUERRA<br>
Adresse : 7 rue de l’Yvette, 75016 Paris France<br>
Téléphone : 06.10.14.00.29<br>
Email : contact@musesquare.com<br>
Hébergeur : Vercel Inc. / Adresse web : vercel.com / Adresse physique : 440 N Barranca Avenue #4133 - Covina, CA 91723 - United States / Contact : privacy@vercel.com.<br> </p> </div> </section> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/mentions-legales.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/mentions-legales.astro";
const $$url = "/mentions-legales";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$MentionsLegales,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
