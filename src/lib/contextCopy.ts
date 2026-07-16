// OWNER-FINAL context-decision copy. Fallback French for the four-tier decision surface, used ONLY
// where the mart provides no clean French `fact_text` (the reused mart string is shown verbatim when
// present). The owner authors these words — do not edit or add strings without the owner.
//
// Weather wording is NOT re-authored here: it reuses sensitivityCopy.FEATURE_FR so the app has ONE
// vocabulary for "Forte chaleur" / "Pluie" / "Vent fort" across sensitivities and acute alerts.

//
// Keys match the `label_key` the endpoint emits (src/pages/api/insight/reactions-today.ts):
//   mobility_disruption  — Tier-2 fallback when there is no named disruption, only a traffic level
//   events               — Tier-2 events line (fact is the named-events list)
//   concurrence_competitor — Tier-3 competitor line ({distance}, {nom} filled by the render)
// See docs/features/context-decision-service.md.

import { FEATURE_FR } from "./sensitivityCopy";

export const CONTEXT_FALLBACK_FR: Record<string, string> = {
  mobility_disruption: "Trafic dense aujourd'hui — accès au lieu perturbé",
  events: "Événements à proximité cette semaine",
  concurrence_competitor: "Concurrent à {distance} · {nom}",
  commercial_event: "Période commerciale : {nom}",                       // observed presence (soldes/foire)
  foreign_origins: "Visiteurs étrangers possibles (jours fériés / vacances) : {pays}", // observed presence
  signal_change: "Changement détecté : {label}",                         // observed_change (a named change fired today)
};

// Tier headings (verbatim from the four-tier spec) + chip labels + the honest-empty state.
// Owner-final — adjust wording here, never in the render.
export const CONTEXT_LABELS = {
  tiers: {
    mesure: "Mesuré sur vos ventes",
    estimation: "Contexte du jour — estimation",
    concurrence: "Concurrence",
    action: "Ce qui a marché pour vous",
  },
  impact_suffix: "estimé",       // Tier-2 chip: "≈ −6 % estimé"
  action_absent: "Pas encore assez de recul",
} as const;

// Compose the FULL mobility-disruption fact from the mart fields (reused French title_merged +
// severity; line/stop + delay when present) — never the bare title. Owner-final wording; format
// per the four-tier spec ("Accident — ligne X, +Y min, sévérité critique").
export function formatDisruption(p: { title?: string | null; line?: string | null; stop_name?: string | null; delay_minutes?: number | null; severity?: string | null }): string {
  const head = p.title || 'Perturbation';
  const bits: string[] = [];
  if (p.line) bits.push(`ligne ${p.line}`);
  else if (p.stop_name) bits.push(String(p.stop_name));
  if (p.delay_minutes != null && p.delay_minutes > 0) bits.push(`+${p.delay_minutes} min`);
  if (p.severity) bits.push(`sévérité ${String(p.severity).toLowerCase()}`);
  return bits.length ? `${head} — ${bits.join(', ')}` : head;
}

// Compose the ACUTE weather fact (operational trigger — distinct register from the measured heat
// sensitivity, never merged). Owner-final wording.
//
// NAMES THE NATURE, never a bare level: "Alerte météo niveau 3" tells the operator nothing he can act
// on — "Forte chaleur" does. The driver is the per-nature level that reaches the max (lvl_heat/rain/
// wind/snow/cold, straight from fct_location_weather_alerts_daily), so the label is DATA, not inferred
// from the temperature. Vocabulary reused from sensitivityCopy.FEATURE_FR — one weather wording in the
// app. Nature unknown (older payload / no per-nature level) → an honest generic head, still never a level.
export interface WeatherNatureLevels {
  lvl_heat?: number | null; lvl_cold?: number | null; lvl_rain?: number | null;
  lvl_snow?: number | null; lvl_wind?: number | null;
}

// THE one place that turns per-nature alert levels into a French label. The driver is the nature that
// reaches the max (straight from the mart's lvl_* — DATA, never inferred from a temperature). Returns
// null when no nature is known, so callers stay honest instead of printing a meaningless level.
// Vocabulary from sensitivityCopy.FEATURE_FR: "Forte chaleur" / "Grand froid" / "Pluie" / "Neige" /
// "Vent fort". Used by the acute day fact AND the points-clés comparison — one wording, one rule.
export function weatherNatureFr(p: WeatherNatureLevels): string | null {
  const natures: Array<[string, number | null | undefined]> = [
    ['heat', p.lvl_heat], ['cold', p.lvl_cold], ['rain', p.lvl_rain], ['snow', p.lvl_snow], ['wind', p.lvl_wind],
  ];
  const driver = natures
    .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && (v as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
  return driver ? (FEATURE_FR[driver[0]] ?? null) : null;
}

export function formatWeatherAlert(p: {
  level: number | null;
  apparent_temp_max: number | null;
  wind_gusts: number | null;
} & WeatherNatureLevels): string {
  const bits: string[] = [];
  if (p.apparent_temp_max != null) bits.push(`${Math.round(p.apparent_temp_max)} °C ressenti`);
  if (p.wind_gusts != null && p.wind_gusts >= 60) bits.push(`rafales ${Math.round(p.wind_gusts)} km/h`);

  const nature = weatherNatureFr(p);
  const head = nature ? `${nature} aujourd'hui` : "Conditions météo marquées aujourd'hui";
  return bits.length ? `${head} — ${bits.join(', ')}` : head;
}

// Email-subject vocabulary for COMPETITOR alerts (cron/alerts.ts). The alert's change_subtype is what
// makes it worth opening — "Concurrent détecté" fires for both cases and says which one it is for
// neither. Terse noun-phrases, the house register, mirroring CONTEXT_FALLBACK_FR.concurrence_competitor
// ("Concurrent à {distance} · {nom}"). Owner delegated these two strings explicitly on 2026-07-15
// ("deal with it") — every other string in this file is owner-authored; these two are not, so they are
// the first to re-word if the voice is off.
// Keyed on change_subtype where change_category = 'competition' (the only category that exists today:
// proximity 19 rows, audience_overlap 4). Unknown subtype → null, caller keeps its own fallback.
export const ALERT_SUBTYPE_FR: Record<string, string> = {
  proximity: "Concurrent à proximité",
  audience_overlap: "Concurrent sur votre public",
};
export const frAlertSubtype = (v?: string | null): string | null =>
  v ? (ALERT_SUBTYPE_FR[String(v).trim()] ?? null) : null;

// English→French country names for the foreign-origins fact (the mart carries only country_name_en /
// country_iso_code — no French). Keyed on the TOURIST_COUNTRIES whitelist in dayContext.ts. OWNER-FINAL:
// factual names, confirm wording (e.g. "Royaume-Uni" vs "Grande-Bretagne"). Unknown → English passthrough.
export const COUNTRY_FR: Record<string, string> = {
  Germany: "Allemagne", "United Kingdom": "Royaume-Uni", Netherlands: "Pays-Bas", Belgium: "Belgique",
  Spain: "Espagne", Italy: "Italie", Switzerland: "Suisse", Portugal: "Portugal",
  "United States": "États-Unis", Ireland: "Irlande", Denmark: "Danemark", Sweden: "Suède",
  Luxembourg: "Luxembourg", Austria: "Autriche", Norway: "Norvège",
};
export const frCountry = (en: string): string => COUNTRY_FR[en] ?? en;

// Tier-2 ESTIMÉ chip for an attribution delta (delta_att_*). ALWAYS carries the "estimé" label — the
// mart's dow+trend attribution is an estimate, a distinct register from the measured sensitivity store,
// never a bare "−6". Returns null for null/zero (honest-absence). Format per the four-tier spec: "≈ −6 % estimé".
export function formatEstimatePct(pct: number | null | undefined): string | null {
  if (pct == null || !isFinite(Number(pct))) return null;
  const n = Math.round(Number(pct));
  if (n === 0) return null;
  const sign = n > 0 ? "+" : "−"; // U+2212 minus
  return `≈ ${sign}${Math.abs(n)} % ${CONTEXT_LABELS.impact_suffix}`;
}

// Consulter loading-stage labels (Phase 5 SSE — OWNER-FINAL, terse noun phrases). The five labels are
// the owner-approved loader prototype strings verbatim (2026-07-15). Keyed by the stage `k` the server
// emits; resolved at the wire edge (prompt.ts wrapper) so the pipeline itself never carries French.
// Increment ② adds the verification-detail strings here AFTER the owner approves the wording.
export const STAGE_FR: Record<string, string> = {
  route: "Routage de votre question",
  context: "Contexte du jour — météo, événements, concurrence",
  sales: "Lecture de vos ventes",
  generate: "Rédaction de la réponse",
  verify: "Vérification des faits",
  regen: "Correction en cours",   // inc ② — the validator rejected attempt 1; attempt 2 runs (owner-approved 2026-07-16)
};

// inc ② (owner-approved) — the verify row's DONE label when the validator passed and counted the cited
// facts. n=0 → the plain "validée" (never a padded count). Composed server-side so ALL French stays here.
export function stageVerifyDoneFr(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "Vérification des faits — validée";
  return `Vérification des faits — validée · ${n} fait${n > 1 ? "s" : ""} cité${n > 1 ? "s" : ""}`;
}

// Fill {distance} / {nom} (and any future placeholders) in a fallback string.
export function fillContextFallback(labelKey: string, vars: Record<string, string> = {}): string | null {
  const tpl = CONTEXT_FALLBACK_FR[labelKey];
  if (!tpl) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
