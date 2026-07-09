// OWNER-FINAL context-decision copy. Fallback French for the four-tier decision surface, used ONLY
// where the mart provides no clean French `fact_text` (the reused mart string is shown verbatim when
// present). The owner authors these words — do not edit or add strings without the owner.
//
// Keys match the `label_key` the endpoint emits (src/pages/api/insight/reactions-today.ts):
//   mobility_disruption  — Tier-2 fallback when there is no named disruption, only a traffic level
//   events               — Tier-2 events line (fact is the named-events list)
//   concurrence_competitor — Tier-3 competitor line ({distance}, {nom} filled by the render)
// See docs/features/context-decision-service.md.

export const CONTEXT_FALLBACK_FR: Record<string, string> = {
  mobility_disruption: "Trafic dense aujourd'hui — accès au lieu perturbé",
  events: "Événements à proximité cette semaine",
  concurrence_competitor: "Concurrent à {distance} · {nom}",
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

// Fill {distance} / {nom} (and any future placeholders) in a fallback string.
export function fillContextFallback(labelKey: string, vars: Record<string, string> = {}): string | null {
  const tpl = CONTEXT_FALLBACK_FR[labelKey];
  if (!tpl) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
