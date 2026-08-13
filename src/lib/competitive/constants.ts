// src/lib/competitive/constants.ts

export const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

export const VALID_INDUSTRY = new Set([
  "non_profit", "wellness", "camping_outdoor", "convention_center",
  "cinema_theatre", "commercial", "institutional", "coworking",
  "culture", "family", "live_event", "gallery", "hotel_lodging",
  "market_hall", "wine_tourism", "theme_park", "food_nightlife",
  "science_innovation", "pro_event", "sport", "transport_mobility",
  "nightlife", "unknown"
]);

export const VALID_AUDIENCE = new Set([
  "local", "tourists", "mixed", "professionals", "students", "families", "seniors"
]);

// ── Prose → taxonomie ────────────────────────────────────────────────────────
// L'extraction Claude decrit l'audience en PROSE FRANCAISE (« Grand public, amateurs
// de vin, touristes et locaux... ») ; la mesure de recouvrement (int_competitor_threat_profile)
// compare des CODES par egalite stricte avec le vocabulaire des locations (« local »,
// « tourists »...). Constat du 12/08 : 27 fiches actives sur 30 sans audience parce que
// add-competitor filtrait la prose contre une liste anglaise fantome (« locals »,
// « art_lovers ») qui ne matche ni la prose ni l'entrepot. Ce mapper est l'UNIQUE
// passerelle prose → VALID_AUDIENCE ; l'ordre d'apparition dans la prose donne
// primaire puis secondaire.
const AUDIENCE_KEYWORDS: Array<[string, RegExp]> = [
  ["mixed",         /grand[\s-]public|general[\s-]public|tous[\s-]publics|large[\s-]public/i],
  ["tourists",      /tourist|touriste|international|anglophone|voyageur|visiteurs? de (paris|la ville)/i],
  ["local",         /\blocaux\b|\blocal(e|es|s)?\b|habitant|riverain|r[ée]gional|de la r[ée]gion/i],
  ["professionals", /professionnel|professional|architecte|d[ée]corateur|designer|entreprise|b2b|prescripteur|s[ée]minaire|congr[èe]s/i],
  ["students",      /[ée]tudiant|student|scolaire|universitaire|acad[ée]mique/i],
  ["families",      /famille|families|enfant|jeune[\s-]public|children/i],
  ["seniors",       /senior|a[îi]n[ée]/i],
];

/**
 * Extrait (primaire, secondaire) du texte libre d'audience. Retourne des codes de
 * VALID_AUDIENCE, dans l'ordre d'apparition dans la prose ; null si rien ne matche.
 */
export function audiencesFromProse(prose: string | null | undefined): { primary: string | null; secondary: string | null } {
  const text = String(prose ?? "");
  if (!text.trim()) return { primary: null, secondary: null };
  const hits: Array<{ code: string; idx: number }> = [];
  for (const [code, re] of AUDIENCE_KEYWORDS) {
    const m = text.match(re);
    if (m && m.index !== undefined) hits.push({ code, idx: m.index });
  }
  hits.sort((a, b) => a.idx - b.idx);
  return { primary: hits[0]?.code ?? null, secondary: hits[1]?.code ?? null };
}

export const BUCKET_MAP: Record<string, string> = {
  non_profit:         "institutional_activity",
  wellness:           "leisure_activity",
  camping_outdoor:    "leisure_activity",
  convention_center:  "commercial_activity",
  cinema_theatre:     "culture_event",
  commercial:         "commercial_activity",
  institutional:      "institutional_activity",
  coworking:          "commercial_activity",
  culture:            "culture_event",
  family:             "institutional_activity",
  live_event:         "culture_event",
  gallery:            "culture_event",
  hotel_lodging:      "commercial_activity",
  market_hall:        "commercial_activity",
  wine_tourism:       "leisure_activity",
  theme_park:         "leisure_activity",
  food_nightlife:     "commercial_activity",
  science_innovation: "institutional_activity",
  pro_event:          "commercial_activity",
  sport:              "leisure_activity",
  transport_mobility: "institutional_activity",
  nightlife:          "culture_event",
  unknown:            "commercial_activity",
};

// French labels used in seed files — maps industry_code to display label
export const INDUSTRY_LABEL: Record<string, string> = {
  non_profit:         "Associatif & Non lucratif",
  wellness:           "Bien-être & Fitness",
  camping_outdoor:    "Camping & Plein air",
  convention_center:  "Centres de congrès & Palais des expos",
  cinema_theatre:     "Cinéma & Théâtre",
  commercial:         "Commerce & Retail",
  institutional:      "Collectivités & Secteur public",
  coworking:          "Coworking & Tiers-lieux",
  culture:            "Culture & Patrimoine",
  family:             "Éducation & Enseignement",
  live_event:         "Événementiel",
  gallery:            "Galeries d'art & Ateliers",
  hotel_lodging:      "Hôtellerie & Hébergement",
  market_hall:        "Marchés & Halles",
  wine_tourism:       "Œnotourisme & Domaines viticoles",
  theme_park:         "Parcs d'attractions & Loisirs",
  food_nightlife:     "Restauration & Bars",
  pro_event:          "Salons & Événements professionnels",
  science_innovation: "Sciences & Innovation",
  sport:              "Sports & Loisirs actifs",
  transport_mobility: "Transport & Mobilité locale",
  nightlife:          "Vie nocturne",
  unknown:            "Autre activité accueillant du public",
};

export function classifySource(url: string | null): string {
  if (!url) return "Autre";
  const u = url.toLowerCase();
  if (u.includes("linkedin.com/company")) return "LinkedIn";
  if (u.includes("linkedin.com"))         return "LinkedIn";
  if (u.includes("eventbrite"))           return "Eventbrite";
  if (u.includes("openagenda"))           return "OpenAgenda";
  if (u.includes("facebook.com"))         return "Réseaux sociaux";
  if (u.includes("instagram.com"))        return "Réseaux sociaux";
  if (u.includes("societe.com") ||
      u.includes("pappers.fr")  ||
      u.includes("verif.com")   ||
      u.includes("kompass.com"))          return "Annuaire pro";
  if (u.includes("lemonde.fr")    ||
      u.includes("lefigaro.fr")   ||
      u.includes("lesechos.fr")   ||
      u.includes("mediapart.fr"))         return "Presse";
  return "Site officiel";
}

export function confidenceToScore(c: string): number {
  if (c === "high")   return 0.9;
  if (c === "medium") return 0.7;
  return 0.5;
}

export function validDateOrNull(s: any): string | null {
  if (!s || typeof s !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
}

export const JUNK_URL_PATTERNS = [
  /linkedin\.com\/posts\//i,
  /linkedin\.com\/feed\//i,
  /\/404/i,
];