// src/lib/profileLabels.ts
// The declared-profile fields are MACHINE enums — "live_event", "mixed", "local", "professionals".
// Injecting them raw into a French prompt is how `live_event` got read as "lieu de spectacle": the
// model is handed a token, not a word, and guesses. Same class of bug as printing "alerte niveau 3".
//
// This is the ONE place that turns those enums into the operator's own words. Nothing is invented here
// — every label is the wording the app already uses:
//   - activity → competitive/constants.INDUSTRY_LABEL   ("live_event" → "Événementiel")
//   - audience → the AUDIENCE_FR authored in days.astro (verbatim)
//   - venue    → the labels authored in profile.astro
// Unknown value → passthrough (never invent a label for an enum we don't know).

import { INDUSTRY_LABEL } from "./competitive/constants";

// Verbatim from days.astro's AUDIENCE_FR — the owner's wording, one home.
export const AUDIENCE_FR: Record<string, string> = {
  local: "résidents locaux",
  professionals: "professionnels",
  tourists: "touristes",
  students: "étudiants",
  families: "familles",
  seniors: "seniors",
  general_public: "grand public",
  art_lovers: "amateurs d'art",
  mixed: "public mixte",
};

// profile.astro labels a dropdown ("Mixte"); in a sentence the model needs the descriptive form, so
// `mixed` reads "intérieur et extérieur". Same meaning, different register — not a second vocabulary.
export const VENUE_TYPE_FR: Record<string, string> = {
  indoor: "intérieur",
  outdoor: "extérieur",
  mixed: "intérieur et extérieur",
};

// Verbatim from profile.astro's EVENT_TYPE_LABELS — the same list the owner picks from in the form.
export const EVENT_TYPE_FR: Record<string, string> = {
  concert: "Concert / Spectacle",
  press_conf: "Conférence de presse",
  tasting: "Dégustation / Soirée gastronomique",
  charity: "Événement caritatif / Associatif",
  corporate: "Événement corporate",
  sport_evt: "Événement sportif",
  outdoor: "Happening extérieur",
  inauguration: "Inauguration",
  open_day: "Journée portes ouvertes",
  product_launch: "Lancement de produit",
  store_opening: "Ouverture d'un point de vente",
  promo: "Promotion en magasin / soldes",
  seminar: "Séminaire / Formation",
  launch_party: "Soirée de lancement",
  expo: "Vernissage / Exposition",
  other: "Autre",
};

// Verbatim from profile.astro's OBJ_LABELS — what the owner reads back on his own profile page.
export const OBJECTIVE_FR: Record<string, string> = {
  maximize_attendance: "Maximiser l'affluence",
  avoid_competition: "Éviter la concurrence",
  optimize_weather: "Optimiser le rapport coût / météo",
  test_market: "Tester un nouveau marché",
};

// Verbatim from profile.astro's seasonality <option> text.
export const SEASONALITY_FR: Record<string, string> = {
  year_round: "Toute l'année",
  spring_summer: "Printemps – Été (avr–sept)",
  summer_only: "Été uniquement (juin–août)",
};

// profile.astro's WEATHER_LABELS reads "Météo : élevée" because it stands alone as a chip. Inside a
// sentence the caller supplies its own subject ("Sensibilité météo: élevée"), so only the level word
// lives here. Same vocabulary, different register — not a second wording.
export const WEATHER_SENSITIVITY_FR: Record<string, string> = {
  "0": "aucune", "1": "faible", "2": "modérée", "3": "élevée", "4": "extrême",
};

// `opportunity_regime` is A/B/C — a bare letter carries no meaning to a model or an operator, and the
// prompt that printed "Régime: B" was handing over a token, not a fact. The app already names them:
// verbatim from days.astro's regimeMap (B = the map's default, "Conditions normales").
export const REGIME_FR: Record<string, string> = {
  A: "Contexte favorable",
  B: "Conditions normales",
  C: "Contexte défavorable",
};

export const frActivity = (v?: string | null): string | null =>
  v ? (INDUSTRY_LABEL[v] ?? v) : null;

export const frAudience = (v?: string | null): string | null =>
  v ? (AUDIENCE_FR[v] ?? v) : null;

export const frVenueType = (v?: string | null): string | null =>
  v ? (VENUE_TYPE_FR[v] ?? v) : null;

export const frEventType = (v?: string | null): string | null =>
  v ? (EVENT_TYPE_FR[v] ?? v) : null;

export const frObjective = (v?: string | null): string | null =>
  v ? (OBJECTIVE_FR[v] ?? v) : null;

export const frSeasonality = (v?: string | null): string | null =>
  v ? (SEASONALITY_FR[v] ?? v) : null;

// Accepts the number the surface carries as well as a string key.
export const frWeatherSensitivity = (v?: number | string | null): string | null =>
  v === null || v === undefined || v === "" ? null : (WEATHER_SENSITIVITY_FR[String(v)] ?? String(v));

export const frRegime = (v?: string | null): string | null =>
  v ? (REGIME_FR[String(v).trim().toUpperCase()] ?? v) : null;
