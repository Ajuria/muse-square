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

export const frActivity = (v?: string | null): string | null =>
  v ? (INDUSTRY_LABEL[v] ?? v) : null;

export const frAudience = (v?: string | null): string | null =>
  v ? (AUDIENCE_FR[v] ?? v) : null;

export const frVenueType = (v?: string | null): string | null =>
  v ? (VENUE_TYPE_FR[v] ?? v) : null;
