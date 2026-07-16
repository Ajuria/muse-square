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

// Batch 2 — ELICIT, don't degrade (generalized). Answer copy for questions about a dimension the
// warehouse verifiably does NOT carry (checked across semantic+mart+intermediate+raw, 2026-07-16:
// no margin/cost/profit, no per-customer identity, no stock, no staffing columns). One entry per
// missing dimension: name what's missing + HOW to address it, then invite the re-ask. DRAFT copy —
// owner owns the final wording (edit here, nothing else to touch).
// `cta` (optional) attaches an ACTION to the ask — only where a real surface exists today:
// action "upload" opens the chat's own CSV/Excel file picker (marge, par_client). Stock and
// personnel have NO import surface yet, so they stay text-only — a button must never be a dead end.
export const MISSING_DIMENSION_FR: Record<string, { headline: string; answer: string; cta?: { label: string; action: "upload" } }> = {
  marge: {
    headline: "Marge absente de vos ventes",
    answer: "Vos ventes importées ne contiennent ni coût ni marge — ce calcul est impossible aujourd'hui. Ajoutez une colonne coût (ou marge) à votre import de ventes, ou indiquez-moi votre marge moyenne ici (par exemple : « ma marge moyenne est de 60 % »), puis reposez-moi la question.",
    cta: { label: "Importer un fichier de ventes", action: "upload" },
  },
  par_client: {
    headline: "Ventes par client non rattachées",
    answer: "Vos ventes ne sont pas rattachées à des clients identifiés — pas d'analyse par client possible. Importez des ventes avec un identifiant client, ou indiquez-moi la taille de votre clientèle ici (par exemple : « j'ai environ 300 clients réguliers »), puis reposez-moi la question.",
    cta: { label: "Importer un fichier de ventes", action: "upload" },
  },
  stock: {
    headline: "Stocks absents de vos données",
    answer: "Aucune donnée de stock n'est connectée. Importez vos stocks ou connectez votre outil de gestion, puis reposez-moi la question.",
  },
  personnel: {
    headline: "Données d'équipe absentes",
    answer: "Aucune donnée de personnel (effectifs, plannings) n'est connectée. Connectez votre outil de planning ou importez vos effectifs, puis reposez-moi la question.",
  },
};

// Item 2 (16/07) — PREMISE CHECK on entity-impact questions. When the question embeds a checkable
// claim about the operator's own CA (« …a-t-il fait chuter mon CA de 47 % ? »), the answer LEADS
// with the verdict from THEIR OWN sales (mart.fct_client_day_residual: actual vs dow+trend normale)
// before any web research. Deterministic French — DRAFT copy, owner owns the wording. Causal
// discipline: we confirm or refute the CA MOVE, never its cause.
const _frPct = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(Math.round(n))} %`;
const _frEur = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} €`;
export function premiseCheckFr(p: {
  direction: "down" | "up";
  claimed_pct: number | null;      // absolute value as asked (47 for « 47 % »); null = direction only
  scope_fr: string;                // « le 18/07 » (explicit date) or « sur vos 30 derniers jours »
  extreme_pct: number;             // signed worst (down) / best (up) residual_pct in the window
  extreme_date_fr: string;         // JJ/MM of that day
  actual_eur: number;
  expected_eur: number;
}): { headline: string; text: string; refuted: boolean } {
  const move = p.direction === "down" ? "chute" : "hausse";
  const observed = `${_frPct(p.extreme_pct)} le ${p.extreme_date_fr} (${_frEur(p.actual_eur)} pour une normale de ${_frEur(p.expected_eur)})`;
  if (p.claimed_pct != null) {
    const met = p.direction === "down" ? p.extreme_pct <= -p.claimed_pct : p.extreme_pct >= p.claimed_pct;
    if (!met) {
      return {
        refuted: true,
        headline: `Pas de ${move} de ${Math.round(p.claimed_pct)} % dans vos ventes`,
        text: `D'après vos ventes, aucune ${move} de ${Math.round(p.claimed_pct)} % ${p.scope_fr} : votre plus fort écart est de ${observed}.`,
      };
    }
    return {
      refuted: false,
      headline: `Une ${move} de cet ordre existe dans vos ventes`,
      text: `Vos ventes montrent bien une ${move} proche ${p.scope_fr} : ${observed}. L'écart est vérifié dans vos ventes — sa cause ne l'est pas.`,
    };
  }
  return {
    refuted: false,
    headline: `Ce que montrent vos ventes`,
    text: `${p.scope_fr.charAt(0).toUpperCase()}${p.scope_fr.slice(1)}, votre plus fort écart à la normale est de ${observed}. L'écart est vérifié dans vos ventes — sa cause ne l'est pas.`,
  };
}

// Item 4 (16/07) — DECLARED-DATA loop copy (DRAFT, owner-final). A margin the user declares in chat
// is stored (append-only corrections log) and reused: the capture turn gets a confirmation, and the
// next margin question gets a computed estimate — measured CA × declared %, attributed « déclarée
// par vous », labelled estimation. Deterministic composition — no LLM text anywhere in this loop.
// Generalized capture confirmation (registry version, 16/07): label + formatted values come from the
// metric spec (declaredMetrics.ts), so every declared metric confirms in the same voice.
export function declaredCaptureFr(p: {
  label_fr: string;            // « Marge », « Clientèle »
  value_fr: string;            // « 62 % », « 300 clients »
  prior_value_fr: string | null;
  declarant_name?: string | null;
}): { headline: string; answer: string } {
  const by = p.declarant_name ? `déclarée par ${p.declarant_name}` : "déclarée par vous";
  return {
    headline: `${p.label_fr} notée : ${p.value_fr}`,
    answer:
      (p.prior_value_fr != null
        ? `Votre ${p.label_fr.toLowerCase()} déclarée passe de ${p.prior_value_fr} à ${p.value_fr} (${by}). `
        : `${p.label_fr} de ${p.value_fr} — ${by}, retenue. `) +
      `Je l'utiliserai pour vos questions (estimations, jamais présentées comme mesurées). Modifiable à tout moment : redéclarez une valeur, ou « Oublier » dans le panneau mémoire.`,
  };
}
export function declaredMarginAnswerFr(p: {
  pct: number;
  ca_eur: number;          // measured CA over the window
  window_fr: string;       // « vos 30 derniers jours »
  declarant_name?: string | null;
  declared_on?: string | null;   // ISO Y-m-d from the event log
}): { headline: string; answer: string } {
  const margin = Math.round(p.ca_eur * (p.pct / 100));
  const eur = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} €`;
  const v = `${String(p.pct).replace(".", ",")} %`;
  const onFr = p.declared_on && /^\d{4}-\d{2}-\d{2}/.test(p.declared_on)
    ? ` le ${p.declared_on.slice(8, 10)}/${p.declared_on.slice(5, 7)}/${p.declared_on.slice(0, 4)}` : "";
  const by = p.declarant_name ? `déclarée par ${p.declarant_name}${onFr}` : `déclarée par vous${onFr}`;
  return {
    headline: `Marge estimée : ≈ ${eur(margin)} sur ${p.window_fr}`,
    answer:
      `CA mesuré sur ${p.window_fr} : ${eur(p.ca_eur)}. Avec votre marge moyenne déclarée (${v}, ${by}), cela représente ≈ ${eur(margin)} de marge estimée. ` +
      `Estimation fondée sur une marge globale déclarée — pas une mesure par produit. Pour la marge réelle par produit, ajoutez une colonne coût à votre import de ventes.`,
  };
}

// Declared client base → CA-per-client estimate (generalization 16/07; same voice as the margin
// answer: measured CA over declared value, attributed, labelled estimation). DRAFT — owner-final.
export function declaredClientCountAnswerFr(p: {
  count: number;
  ca_eur: number;          // measured CA over the window
  window_fr: string;       // « vos 30 derniers jours »
  declarant_name?: string | null;
  declared_on?: string | null;   // ISO Y-m-d
}): { headline: string; answer: string } {
  const perClient = p.count > 0 ? p.ca_eur / p.count : NaN;
  const eur = (n: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(n))} €`;
  const cnt = p.count.toLocaleString("fr-FR");
  const onFr = p.declared_on && /^\d{4}-\d{2}-\d{2}/.test(p.declared_on)
    ? ` le ${p.declared_on.slice(8, 10)}/${p.declared_on.slice(5, 7)}/${p.declared_on.slice(0, 4)}` : "";
  const by = p.declarant_name ? `déclarée par ${p.declarant_name}${onFr}` : `déclarée par vous${onFr}`;
  return {
    headline: `CA par client estimé : ≈ ${eur(perClient)} sur ${p.window_fr}`,
    answer:
      `CA mesuré sur ${p.window_fr} : ${eur(p.ca_eur)}. Rapporté à votre clientèle déclarée (${cnt} clients, ${by}), cela représente ≈ ${eur(perClient)} par client sur la période. ` +
      `Estimation fondée sur un effectif global déclaré — pas des clients identifiés dans vos ventes. Pour l'analyse réelle par client, importez des ventes avec un identifiant client.`,
  };
}

// Fill {distance} / {nom} (and any future placeholders) in a fallback string.
export function fillContextFallback(labelKey: string, vars: Record<string, string> = {}): string | null {
  const tpl = CONTEXT_FALLBACK_FR[labelKey];
  if (!tpl) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
