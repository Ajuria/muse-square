// src/lib/insightFamilies/index.ts
// Registry of insight card-family providers — the single dispatch table the three consumers
// share: the deep-page endpoints, the family report, and the grounded prompt Q&A. Each family
// is registered ONCE here; adding a family = one entry + its provider file.
// FOOTFALL is the first family on this pattern (vertical slice); the other five
// (sales/weather/events/competitor/tourism) roll onto it mechanically.
import type { FamilyProvider } from "./types";
import { footfallFamily } from "./footfall";

export const FAMILIES: Record<string, FamilyProvider> = {
  footfall: {
    key: "footfall",
    title: "Fréquentation · votre horloge du CA",
    render: "renderFootfall",
    // Footfall-TIMING questions only ("MY selling rhythm — which hour / which day-of-week"). Matchers
    // run against the ACCENT-STRIPPED, lowercased question (see familyForQuestion) so "A quel moment"
    // (no accent, as typed on a real keyboard) matches too. Each requires a sales/traffic context so
    // event-date-picking "meilleurs jours du mois pour organiser un evenement" does NOT route here.
    match: [
      /affluence/,
      /frequentation/,
      /\bpic\b.{0,25}(vent|vend|\bca\b|chiffre|affluence|client|monde)/,
      /(quand|quelle heure|quel jour|quel moment|a quel moment).{0,35}(vend|vent|gagn|chiffre|\bca\b|affluence|monde|client|frequent)/,
      /(meilleur|pire|plus (fort|calme)|creux|de pointe).{0,15}(heure|creneau)/,   // time-of-day: unambiguous
      /(meilleur|pire).{0,12}jour.{0,25}(semaine|vent|vend|\bca\b|chiffre|rentable|affluence)/,   // best DAY-OF-WEEK for sales
      /jour.{0,10}(de pointe|le plus (fort|calme|rentable))/,   // "jour de pointe" = peak day
    ],
    run: footfallFamily,
  },
};

// Accent-strip + lowercase so matchers are robust to "A quel moment" (no accent, as typed) vs "À".
function normQ(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Route a free-text question to the family whose matchers hit (first match wins). null = no family.
export function familyForQuestion(question: string): FamilyProvider | null {
  const q = normQ(question);
  for (const key of Object.keys(FAMILIES)) {
    const fam = FAMILIES[key];
    if (fam.match.some((re) => re.test(q))) return fam;
  }
  return null;
}

export type { FamilyResult, FamilyFact, FamilyProvider } from "./types";
