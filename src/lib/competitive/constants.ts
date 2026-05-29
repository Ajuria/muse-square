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