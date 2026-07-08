// Type B — French copy for citing sensitivities. OWNER: your voice pass lives here; no
// French is hardcoded in consumers. Rules (see memory french-copy-voice): terse noun-phrases,
// mirror the app's real strings, no robotic LLM French, no hedge-paragraphs.
//
// THE TIER REGISTER MOVES WITH THE TIER — this is a hard contract rule, not a style choice:
//   • etabli       → asserts a venue property ("CA … sous/au-dessus de l'attendu")
//   • emergent     → "en confirmation" (a trend, not yet settled)
//   • preliminaire → "signal préliminaire … à confirmer" — NEVER "votre lieu réagit ainsi"
// A préliminaire signal that reads like an established fact is the exact dishonesty the tier
// exists to prevent.

import type { Sensitivity, Tier } from "./sensitivityStore";

// feature key -> French label (extends with the taxonomy; owner refines wording)
export const FEATURE_FR: Record<string, string> = {
  heat: "Forte chaleur",
  cold: "Grand froid",
  rain: "Pluie",
  wind: "Vent fort",
  snow: "Neige",
  tourism_peak: "Affluence touristique",
  school_holiday: "Vacances scolaires",
  public_holiday: "Jour férié",
};

// section headings by register (a consumer groups rows under these)
export const TIER_SECTION: Record<Tier, { heading: string; caveat: string }> = {
  etabli: { heading: "Réactions établies", caveat: "Effets mesurés, toutes choses égales." },
  emergent: { heading: "Tendances en confirmation", caveat: "Se précisent au fil des données." },
  preliminaire: { heading: "Signaux préliminaires", caveat: "À confirmer — trop tôt pour trancher." },
};

const fr1 = (x: number): string => x.toFixed(1).replace(".", ",");
const pct = (s: Sensitivity): string => fr1(Math.abs(s.effect_size) * 100);
const side = (s: Sensitivity): string => (s.direction === "down" ? "sous" : "au-dessus de");

// One vetted sensitivity -> one cited line, in its tier's register. This is what every
// consumer renders / feeds the LLM verbatim; the LLM MUST NOT rephrase beyond this.
export function citeSensitivity(s: Sensitivity): string {
  const label = FEATURE_FR[s.feature] || s.feature;
  const cons = `cohérent ${Math.round(s.consistency_pct)} %`;
  switch (s.confidence_tier) {
    case "etabli":
      return `${label} : CA ~${pct(s)} % ${side(s)} l'attendu (${s.n_days} jours, ${cons}).`;
    case "emergent":
      return `${label} : tendance à ~${pct(s)} % ${side(s)} l'attendu, en confirmation (${s.n_days} jours).`;
    case "preliminaire":
      return `${label} : signal préliminaire (~${pct(s)} % ${side(s)} l'attendu, ${s.n_days} jours), à confirmer.`;
  }
}
