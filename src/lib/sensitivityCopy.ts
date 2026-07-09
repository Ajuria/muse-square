// Type B — French copy for citing sensitivities. OWNER: your voice pass lives here; no
// French is hardcoded in consumers. Rules (see memory french-copy-voice): terse noun-phrases,
// mirror the app's real strings, no robotic LLM French, no hedge-paragraphs.
//
// THE LINE STATES THE OBSERVED HISTORY AS FACT — it happened, so no hedging ("pourrait",
// "à confirmer", "signal préliminaire"). Honesty lives in the SAMPLE shown, not weasel-words:
// always the count behind the rate ("19 jours sur 27, soit 70 % des fois") + the period it was
// drawn from, so the operator judges representativeness himself. The TIER gates INFLUENCE
// (canInfluence — whether it may drive a move/baseline), NOT the wording.
// [PERIOD: "pour la période …" is pending — needs a period field wired store→accessor→type.]

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


// ── Today-conditional operator phrasing (the A+B synthesis). LOCKED language rules:
// never "l'attendu"; "plus bas/haut que d'habitude / qu'une journée comparable"; consistency
// reads "N fois sur 10"; Type A track record reads "N fois sur M" / "ça a payé", never "prouvé".
export const ACTION_FR: Record<string, string> = {
  offre_appel: "une offre d'appel",
};
export interface TrackRecord { action_type: string; beat: number; done: number }

const pctInt = (s: Sensitivity): number => Math.round(Math.abs(s.effect_size) * 100);
const higherLower = (s: Sensitivity): string => (s.direction === "down" ? "plus bas" : "plus haut");
const actionFr = (t: string): string => ACTION_FR[t] || t;
const de = (label: string): string => (/^[aàâeéèêiîoôu]/i.test(label) ? `d'${label}` : `de ${label}`);
const featOf = (s: Sensitivity): string => de((FEATURE_FR[s.feature] || s.feature).toLowerCase());
// count behind the rate: how many feature-on days the effect actually held.
const heldDays = (s: Sensitivity): number => Math.round((s.consistency_pct / 100) * s.n_days);
// the sample tail every env line shares: "19 jours sur 27, soit 70 % des fois".
// ISO "2026-04-18" -> "18/04/2026" (JJ/MM/AAAA — France).
const frDate = (iso: string): string => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
// "19 jours sur 27, soit 70 % des fois" + the window it was drawn from (representativeness).
const sampleFr = (s: Sensitivity): string => {
  const base = `${heldDays(s)} jours sur ${s.n_days}, soit ${Math.round(s.consistency_pct)} % des fois`;
  return (s.period_start && s.period_end)
    ? `${base} pour la période du ${frDate(s.period_start)} au ${frDate(s.period_end)}`
    : base;
};

// Engine 2 — your environment, today-conditional (insight / prompt: "comme aujourd'hui").
// States the observed history as fact; the sample (count + rate) carries the honesty, not hedging.
export function envTodayLine(s: Sensitivity): string {
  return `Les jours ${featOf(s)} comme aujourd'hui, votre CA a été ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}
// Engine 2 — period framing (report: "vos journées de forte chaleur").
export function envPeriodLine(s: Sensitivity): string {
  return `Vos journées ${featOf(s)} : CA ~${pctInt(s)} % ${higherLower(s)} qu'une journée comparable — ${sampleFr(s)}.`;
}
// Engine 1 — your measured track record. "N fois sur M" / "ça a payé", never "prouvé"/rate.
export function actionLine(a: TrackRecord): string {
  return `Les fois où vous avez lancé ${actionFr(a.action_type)} ces jours-là, ça a payé — ${a.beat} fois sur ${a.done}.`;
}
// The move — soft, only when the Type A track record qualifies (reconduire gate; caller enforces).
export function moveLine(a: TrackRecord): string {
  return `Envisagez de relancer ${actionFr(a.action_type)} aujourd'hui.`;
}
// The reconduire gate (mirrors commitmentContext): a real, positive track record only.
export function trackRecordQualifies(a: TrackRecord): boolean {
  return a.done >= 5 && a.beat >= 4 && a.beat / a.done >= 0.70;
}

// One vetted sensitivity -> one cited line, in its tier's register. This is what every
// consumer renders / feeds the LLM verbatim; the LLM MUST NOT rephrase beyond this.
export function citeSensitivity(s: Sensitivity): string {
  return `${FEATURE_FR[s.feature] || s.feature} : les jours comme aujourd'hui, CA ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}
