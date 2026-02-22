/* empty css                                       */
import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from "../../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../../chunks/BaseLayout_B7lVY6IF.mjs";
import { renderers } from "../../renderers.mjs";
const $$MultiLocation = createComponent(($$result, $$props, $$slots) => {
  const availableLocations = [
    {
      location_id: "LOC001",
      location_label: "Musée de la Romanité – Nîmes",
      location_type: "indoor",
      address: "16 Boulevard des Arènes, 30000 Nîmes"
    },
    {
      location_id: "LOC002",
      location_label: "Palais des Papes – Avignon",
      location_type: "indoor",
      address: "Place du Palais, 84000 Avignon"
    },
    {
      location_id: "LOC003",
      location_label: "Théâtre Antique – Orange",
      location_type: "outdoor",
      address: "Rue Madeleine Roch, 84100 Orange"
    }
  ];
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Ajouter un lieu - Muse Square", "hideSurveyCta": true }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-4xl mx-auto py-12 px-4"> <!-- Header --> <div class="mb-8"> <h1 class="text-3xl font-bold mb-2">Sélectionnez votre lieu</h1> <p class="text-gray-600">
Choisissez le lieu pour lequel vous souhaitez activer l'intelligence prédictive.
</p> </div> <!-- Location Grid --> <div class="grid gap-4"> ${availableLocations.map((location) => renderTemplate`<a${addAttribute(`/locations/${location.location_id}/onboarding`, "href")} class="block p-6 bg-white border-2 border-gray-200 rounded-lg hover:border-black hover:shadow-md transition-all"> <div class="flex items-start justify-between"> <div class="flex-1"> <h3 class="text-xl font-semibold mb-2">${location.location_label}</h3> <p class="text-sm text-gray-600 mb-1">${location.address}</p> <span class="inline-block px-3 py-1 text-xs font-medium bg-gray-100 rounded-full"> ${location.location_type === "indoor" ? "Intérieur" : "Extérieur"} </span> </div> <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path> </svg> </div> </a>`)} </div> <!-- Back Link --> <div class="mt-8"> <a href="/app" class="text-gray-600 hover:text-black">
← Retour à l'app
</a> </div> </div> ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/locations/multi-location.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/locations/multi-location.astro";
const $$url = "/locations/multi-location";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$MultiLocation,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
