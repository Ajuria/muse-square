/* empty css                                    */
import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute, o as renderScript } from "../chunks/astro/server_C4zwJFjj.mjs";
import "piccolore";
import { $ as $$BaseLayout } from "../chunks/BaseLayout_B7lVY6IF.mjs";
import { BigQuery } from "@google-cloud/bigquery";
import { renderers } from "../renderers.mjs";
const $$Astro = createAstro("http://localhost:4322");
const prerender = false;
const $$Profile = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Profile;
  function requireString(v, name) {
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`Missing or invalid field: ${name}`);
    }
    return v.trim();
  }
  const clerk_user_id_raw = Astro2.locals?.clerk_user_id;
  const location_id_raw = Astro2.locals?.location_id;
  if (typeof clerk_user_id_raw !== "string" || clerk_user_id_raw.trim() === "") {
    return Astro2.redirect("/sign-in");
  }
  if (typeof location_id_raw !== "string" || location_id_raw.trim() === "") {
    return Astro2.redirect("/profile");
  }
  const clerk_user_id = clerk_user_id_raw.trim();
  const location_id = location_id_raw.trim();
  const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
  const dataset = requireString(process.env.BQ_DATASET, "BQ_DATASET");
  const table = requireString(process.env.BQ_TABLE, "BQ_TABLE");
  const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";
  if (!hasKeyfile && !useAdc) {
    throw new Error(
      "BigQuery auth misconfigured: set GOOGLE_APPLICATION_CREDENTIALS or set BQ_USE_ADC=true when running with ADC."
    );
  }
  const bigquery = new BigQuery(
    hasKeyfile ? { projectId, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS } : { projectId }
  );
  const fullTable = `\`${projectId}.${dataset}.${table}\``;
  const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
  const sql = `
  SELECT
    clerk_user_id,
    location_id,
    email,
    first_name,
    last_name,
    position,
    company_name,
    company_address,
    company_activity_type,
    location_type,
    event_time_profile,
    location_access_pattern,
    nearest_transit_stop,
    primary_audience_1,
    primary_audience_2,
    origin_city_id_1,
    origin_city_id_2,
    origin_city_id_3
  FROM ${fullTable}
  WHERE clerk_user_id = @clerk_user_id
    AND location_id = @location_id
  ORDER BY updated_at DESC
  LIMIT 1
`;
  let saved_row = null;
  function escAttr(v) {
    const s = v == null ? "" : String(v);
    return s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  let saved_safe = null;
  try {
    const [rows] = await bigquery.query({
      query: sql,
      location: BQ_LOCATION,
      params: { clerk_user_id, location_id },
      types: { clerk_user_id: "STRING", location_id: "STRING" }
    });
    saved_row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    saved_safe = saved_row ? {
      email: escAttr(saved_row.email),
      first_name: escAttr(saved_row.first_name),
      last_name: escAttr(saved_row.last_name),
      position: escAttr(saved_row.position),
      company_name: escAttr(saved_row.company_name),
      company_address: escAttr(saved_row.company_address),
      company_activity_type: escAttr(saved_row.company_activity_type),
      location_type: escAttr(saved_row.location_type),
      event_time_profile: escAttr(saved_row.event_time_profile),
      location_access_pattern: escAttr(saved_row.location_access_pattern),
      nearest_transit_stop: escAttr(saved_row.nearest_transit_stop),
      primary_audience_1: escAttr(saved_row.primary_audience_1),
      primary_audience_2: escAttr(saved_row.primary_audience_2),
      origin_city_id_1: escAttr(saved_row.origin_city_id_1),
      origin_city_id_2: escAttr(saved_row.origin_city_id_2),
      origin_city_id_3: escAttr(saved_row.origin_city_id_3)
    } : null;
  } catch (e) {
    {
      console.error("[PROFILE][BQ FAIL] load_saved_profile");
    }
    saved_safe = null;
    saved_row = null;
  }
  const selected_audiences = [
    saved_safe?.primary_audience_1 || null,
    saved_safe?.primary_audience_2 || null
  ].filter(Boolean);
  const selected_origin_city_ids = [
    saved_safe?.origin_city_id_1 || null,
    saved_safe?.origin_city_id_2 || null,
    saved_safe?.origin_city_id_3 || null
  ].filter(Boolean);
  return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, { "title": "Profil - Muse Square", "hideSurveyCta": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="min-h-screen bg-white pt-26 pb-20 px-4"> <div class="max-w-2xl mx-auto mt-10"> <!-- Page Header --> <div class="mb-8"> <div class="flex items-start justify-between mb-2"> <h1 class="text-3xl ont-semibold">Profil</h1> <a href="/api/auth/signout" class="text-sm text-gray-500 uppercase tracking-wide hover:text-black">
Déconnexion
</a> </div> <p class="text-sm text-gray-500">Gérez vos informations et préférences d'analyse.</p> </div> <!-- Form --> <form method="POST" id="profileForm"> <!-- Sections only: controls the big gaps between sections --> <div class="space-y-[15px]"> <!-- SECTION 1: PROFIL D'UTILISATEUR --> <section class="space-y-10"> <div> <h2 class="text-base font-medium text-black uppercase tracking-wider">PROFIL D'UTILISATEUR</h2> </div> <div class="space-y-[20px]"> <div class="grid grid-cols-2 gap-6"> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Prénom <span class="text-red-500">*</span> </label> <input type="text" name="first_name" required${addAttribute(saved_safe?.first_name ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Nom <span class="text-red-500">*</span> </label> <input type="text" name="last_name" required${addAttribute(saved_safe?.last_name ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> </div> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Fonction
</label> <input type="text" name="position"${addAttribute(saved_safe?.position ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Email
</label> <input type="email" name="email"${addAttribute(saved_safe?.email ?? "", "value")} readonly style="background:#f9fafb !important; color:#6b7280 !important;" class="w-full px-6 py-4 border-0 rounded-2xl text-base cursor-not-allowed"> </div> <div class="pt-2"> <a href="https://accounts.clerk.com/user/security" target="_blank" rel="noopener" class="text-sm text-gray-600 hover:text-black">
→ Modifier mon mot de passe
</a> </div> </div> </section> <!-- SECTION 2: PROFIL D'ENTREPRISE --> <section class="space-y-10"> <div> <h2 class="text-base font-medium text-black uppercase tracking-wider">PROFIL D'ENTREPRISE</h2> <p class="text-sm text-gray-500">Requis pour personnaliser les insights métiers</p> </div> <div class="space-y-[20px]"> <input type="hidden" name="location_id"${addAttribute(location_id, "value")}> <input type="hidden" name="origin_city_label_1" id="origin_city_label_1"${addAttribute(saved_safe?.origin_city_label_1 ?? "", "value")}> <input type="hidden" name="origin_city_label_2" id="origin_city_label_2"${addAttribute(saved_safe?.origin_city_label_2 ?? "", "value")}> <input type="hidden" name="origin_city_label_3" id="origin_city_label_3"${addAttribute(saved_safe?.origin_city_label_3 ?? "", "value")}> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Entreprise <span class="text-red-500">*</span> </label> <input type="text" name="company_name" required${addAttribute(saved_safe?.company_name ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> </div> <div class="relative"> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Adresse professionnelle
</label> <input id="companyAddressInput" type="text" name="company_address" autocomplete="off"${addAttribute(saved_safe?.company_address ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> <!-- Suggestions dropdown --> <div id="companyAddressSuggestions" class="absolute z-50 mt-2 w-full bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden hidden"></div> <p class="text-xs text-gray-500 mt-2">Commencez à taper, puis sélectionnez une proposition.</p> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Secteur d'activité <span class="text-red-500">*</span> </label> <div class="relative"> <select name="company_activity_type" required class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all appearance-none pr-12"> <option value="cultural"${addAttribute((saved_safe?.company_activity_type ?? "") === "cultural", "selected")}>Culture & Patrimoine</option> <option value="events"${addAttribute((saved_safe?.company_activity_type ?? "") === "events", "selected")}>Événementiel</option> <option value="tourism"${addAttribute((saved_safe?.company_activity_type ?? "") === "tourism", "selected")}>Tourisme & Loisirs</option> <option value="restaurant"${addAttribute((saved_safe?.company_activity_type ?? "") === "restaurant", "selected")}>Restauration & Bars</option> <option value="retail"${addAttribute((saved_safe?.company_activity_type ?? "") === "retail", "selected")}>Commerce & Retail</option> <option value="hospitality"${addAttribute((saved_safe?.company_activity_type ?? "") === "hospitality", "selected")}>Hôtellerie & Hébergement</option> <option value="public"${addAttribute((saved_safe?.company_activity_type ?? "") === "public", "selected")}>Collectivités & Secteur public</option> <option value="sports"${addAttribute((saved_safe?.company_activity_type ?? "") === "sports", "selected")}>Sports & Loisirs actifs</option> <option value="transport"${addAttribute((saved_safe?.company_activity_type ?? "") === "transport", "selected")}>Transport & Mobilité locale</option> <option value="education"${addAttribute((saved_safe?.company_activity_type ?? "") === "education", "selected")}>Éducation & Enseignement</option> <option value="nonprofit"${addAttribute((saved_safe?.company_activity_type ?? "") === "nonprofit", "selected")}>Associatif & Non lucratif</option> <option value="other"${addAttribute((saved_safe?.company_activity_type ?? "") === "other", "selected")}>Autre activité accueillant du public</option> </select> <div class="absolute inset-y-0 right-6 flex items-center pointer-events-none"> <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path> </svg> </div> </div> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Audience, Clientèle visée <span class="text-red-500">*</span> </label> <div class="relative"> <select name="primary_audience_1" required multiple size="6" class="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all overflow-auto"> <option value="">Sélectionner...</option> <option value="local"${addAttribute(selected_audiences.includes("local"), "selected")}>Public local / résidents</option> <option value="tourists"${addAttribute(selected_audiences.includes("tourists"), "selected")}>Touristes</option> <option value="mixed"${addAttribute(selected_audiences.includes("mixed"), "selected")}>Public mixte (locaux + touristes)</option> <option value="professionals"${addAttribute(selected_audiences.includes("professionals"), "selected")}>Professionnels</option> <option value="students"${addAttribute(selected_audiences.includes("students"), "selected")}>Scolaires / étudiants</option> <option value="families"${addAttribute(selected_audiences.includes("families"), "selected")}>Familles</option> </select> </div> <p class="text-xs text-gray-500 mt-2">
Maintenez Cmd/Ctrl pour sélectionner jusqu’à 2 audiences
</p> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Villes d'origine principales de vos clients <span class="text-red-500">*</span> </label> <div class="relative"> <select name="origin_city_ids" required multiple size="12" class="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all overflow-auto"> <optgroup label="Île-de-France"> <option value="75056"${addAttribute(selected_origin_city_ids.includes("75056"), "selected")}>Paris</option> <option value="92012"${addAttribute(selected_origin_city_ids.includes("92012"), "selected")}>Boulogne-Billancourt</option> <option value="93066"${addAttribute(selected_origin_city_ids.includes("93066"), "selected")}>Saint-Denis</option> <option value="93048"${addAttribute(selected_origin_city_ids.includes("93048"), "selected")}>Montreuil</option> <option value="92050"${addAttribute(selected_origin_city_ids.includes("92050"), "selected")}>Nanterre</option> <option value="78646"${addAttribute(selected_origin_city_ids.includes("78646"), "selected")}>Versailles</option> <option value="94028"${addAttribute(selected_origin_city_ids.includes("94028"), "selected")}>Créteil</option> <option value="94081"${addAttribute(selected_origin_city_ids.includes("94081"), "selected")}>Vitry-sur-Seine</option> <option value="idf_other"${addAttribute(selected_origin_city_ids.includes("idf_other"), "selected")}>Autres villes de la région</option> <option value="idf_outside"${addAttribute(selected_origin_city_ids.includes("idf_outside"), "selected")}>Hors région</option> </optgroup> <optgroup label="Provence–Alpes–Côte d'Azur"> <option value="13055"${addAttribute(selected_origin_city_ids.includes("13055"), "selected")}>Marseille</option> <option value="06088"${addAttribute(selected_origin_city_ids.includes("06088"), "selected")}>Nice</option> <option value="13001"${addAttribute(selected_origin_city_ids.includes("13001"), "selected")}>Aix-en-Provence</option> <option value="83137"${addAttribute(selected_origin_city_ids.includes("83137"), "selected")}>Toulon</option> <option value="84007"${addAttribute(selected_origin_city_ids.includes("84007"), "selected")}>Avignon</option> <option value="06029"${addAttribute(selected_origin_city_ids.includes("06029"), "selected")}>Cannes</option> <option value="06004"${addAttribute(selected_origin_city_ids.includes("06004"), "selected")}>Antibes</option> <option value="06069"${addAttribute(selected_origin_city_ids.includes("06069"), "selected")}>Grasse</option> <option value="paca_other"${addAttribute(selected_origin_city_ids.includes("paca_other"), "selected")}>Autres villes de la région</option> <option value="paca_outside"${addAttribute(selected_origin_city_ids.includes("paca_outside"), "selected")}>Hors région</option> </optgroup> <optgroup label="Occitanie"> <option value="31555"${addAttribute(selected_origin_city_ids.includes("31555"), "selected")}>Toulouse</option> <option value="34172"${addAttribute(selected_origin_city_ids.includes("34172"), "selected")}>Montpellier</option> <option value="30189"${addAttribute(selected_origin_city_ids.includes("30189"), "selected")}>Nîmes</option> <option value="66136"${addAttribute(selected_origin_city_ids.includes("66136"), "selected")}>Perpignan</option> <option value="34032"${addAttribute(selected_origin_city_ids.includes("34032"), "selected")}>Béziers</option> <option value="11262"${addAttribute(selected_origin_city_ids.includes("11262"), "selected")}>Narbonne</option> <option value="81004"${addAttribute(selected_origin_city_ids.includes("81004"), "selected")}>Albi</option> <option value="11069"${addAttribute(selected_origin_city_ids.includes("11069"), "selected")}>Carcassonne</option> <option value="occ_other"${addAttribute(selected_origin_city_ids.includes("occ_other"), "selected")}>Autres villes de la région</option> <option value="occ_outside"${addAttribute(selected_origin_city_ids.includes("occ_outside"), "selected")}>Hors région</option> </optgroup> </select> </div> <p class="text-xs text-gray-500 mt-2">Maintenez Cmd/Ctrl pour sélectionner plusieurs villes</p> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Moments d'activité principaux <span class="text-red-500">*</span> </label> <div class="relative"> <select name="event_time_profile" required class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all appearance-none pr-12"> <option value="">Sélectionner...</option> <option value="day"${addAttribute((saved_safe?.event_time_profile ?? "") === "day", "selected")}>Journée</option> <option value="evening"${addAttribute((saved_safe?.event_time_profile ?? "") === "evening", "selected")}>Soirée</option> <option value="weekend"${addAttribute((saved_safe?.event_time_profile ?? "") === "weekend", "selected")}>Week-end</option> <option value="variable"${addAttribute((saved_safe?.event_time_profile ?? "") === "variable", "selected")}>Variable / selon événements</option> </select> <div class="absolute inset-y-0 right-6 flex items-center pointer-events-none"> <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path> </svg> </div> </div> </div> </div> </section> <!-- SECTION 3: ENVIRONNEMENT DE TRAVAIL --> <section class="space-y-10"> <div> <h2 class="text-base font-medium text-black uppercase tracking-wider">ENVIRONNEMENT DE TRAVAIL</h2> <p class="text-sm text-gray-500">Requis pour personnaliser les alertes météo et mobilité</p> </div> <div class="space-y-[20px]"> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Type de lieu favori <span class="text-red-500">*</span> </label> <div class="relative"> <select name="location_type" required class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all appearance-none pr-12"> <option value="">Sélectionner...</option> <option value="outdoor"${addAttribute((saved_safe?.location_type ?? "") === "outdoor", "selected")}>Espace extérieur</option> <option value="indoor"${addAttribute((saved_safe?.location_type ?? "") === "indoor", "selected")}>Espace intérieur</option> <option value="mixed"${addAttribute((saved_safe?.location_type ?? "") === "mixed", "selected")}>Espace mixte</option> </select> <div class="absolute inset-y-0 right-6 flex items-center pointer-events-none"> <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path> </svg> </div> </div> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Profil de déplacement audience <span class="text-red-500">*</span> </label> <div class="relative"> <select name="location_access_pattern" required class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all appearance-none pr-12"> <option value="">Sélectionner...</option> <option value="public_transit"${addAttribute((saved_safe?.location_access_pattern ?? "") === "public_transit", "selected")}>Transports en commun / Métro</option> <option value="walking"${addAttribute((saved_safe?.location_access_pattern ?? "") === "walking", "selected")}>À pied</option> <option value="car"${addAttribute((saved_safe?.location_access_pattern ?? "") === "car", "selected")}>Voiture</option> <option value="bike"${addAttribute((saved_safe?.location_access_pattern ?? "") === "bike", "selected")}>Vélo</option> </select> <div class="absolute inset-y-0 right-6 flex items-center pointer-events-none"> <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path> </svg> </div> </div> </div> <div> <label class="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
Station de métro la plus proche (optionnel)
</label> <input type="text" name="nearest_transit_stop" placeholder="Rechercher une station..."${addAttribute(saved_safe?.nearest_transit_stop ?? "", "value")} class="w-full px-6 py-4 bg-gray-50 border-0 rounded-2xl text-base focus:ring-2 focus:ring-black focus:bg-white transition-all"> <p class="text-xs text-gray-500 mt-2">Tapez pour rechercher</p> </div> </div> </section> </div> <!-- Submit Button (kept separate so it doesn't inherit the 120px section gap) --> <div class="pt-10"> <button type="submit" class="ms-btn w-full h-[56px] font-normal">
Enregistrer les modifications
</button> </div> </form> </div> </div> ${renderScript($$result2, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/profile.astro?astro&type=script&index=0&lang.ts")} ` })}`;
}, "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/profile.astro", void 0);
const $$file = "/Users/julendeajuriaguerra/Documents/Muse_Square/Muse_Square_Website/muse-square/src/pages/profile.astro";
const $$url = "/profile";
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: $$Profile,
  file: $$file,
  prerender,
  url: $$url
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
