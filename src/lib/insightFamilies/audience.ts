// src/lib/insightFamilies/audience.ts
// AUDIENCE family provider — "qui sont mes clients, quand viennent-ils, combien de temps restent-ils".
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/audience.ts) so the deep page
// stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// Reads the SEMANTIC layer the app already trusts (never a mart schema guess).
// There is no per-customer transaction key in the warehouse, so this is audience PROFILE + footfall
// behaviour — never a "top customers by CA" ranking (that data does not exist).
//
// TWO honesty rules the facts enforce, which the card does not have to:
// 1. `who` / `catchment` / `capacity_sensitivity` are DECLARED (the owner typed them), not measured.
//    A fact must say "déclaré" or the model will report the owner's own guess back to him as a finding.
// 2. `peak_hour` / `dwell` / `avg_busyness_pct` come from BESTTIME (external), NOT from his till. The
//    footfall family exists to say "l'affluence BestTime situe le pic à Xh — à l'opposé de vos ventes,
//    fiez-vous à votre CA". If audience facts asserted a bare "votre pic est à Xh", the chat would
//    contradict the footfall card from the same dataset — the exact failure the provider pattern is
//    for. So every BestTime number is NAMED as BestTime, and the venue's real peak stays footfall's.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
// primary_audience_* arrive as English tokens (closed set) — render French. Unknown → passthrough.
// NOTE: the endpoint's own register ("clientèle locale"), which differs from profileLabels.AUDIENCE_FR
// ("résidents locaux"). Kept VERBATIM so the deep page is unchanged — reconciling the registers is an
// owner copy decision, not a side effect of this extraction.
const AUDIENCE_FR: Record<string, string> = {
  local: "clientèle locale", tourists: "touristes", students: "étudiants",
  professionals: "professionnels", mixed: "clientèle mixte",
};
const frAudience = (v: string | null): string | null => (v ? (AUDIENCE_FR[v.toLowerCase()] || v) : null);

export async function audienceFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  const [profRows, dayRows] = await Promise.all([
    bq.query({
      query: `SELECT primary_audience_1, primary_audience_2, geographic_catchment,
                     capacity_sensitivity, besttime_dwell_time_min, besttime_dwell_time_max
              FROM \`${PROJECT}.semantic.vw_insight_event_ai_location_context\`
              WHERE location_id = @location_id LIMIT 1`,
      params: { location_id }, types: { location_id: "STRING" }, location: "EU",
    }).then((r: any) => r[0]?.[0]).catch(() => null),
    bq.query({
      query: `SELECT ft_peak_hour, ft_avg_busyness_pct, ft_busy_hours_count, audience_availability_label
              FROM \`${PROJECT}.semantic.vw_insight_event_day_surface\`
              WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]?.[0]).catch(() => null),
  ]);

  const p: any = profRows || {};
  const d: any = dayRows || {};
  const audience = {
    who: [frAudience(str(p.primary_audience_1)), frAudience(str(p.primary_audience_2))].filter(Boolean),
    catchment: str(p.geographic_catchment),
    capacity_sensitivity: str(p.capacity_sensitivity),
    dwell_min: num(p.besttime_dwell_time_min),
    dwell_max: num(p.besttime_dwell_time_max),
    peak_hour: num(d.ft_peak_hour),
    avg_busyness_pct: d.ft_avg_busyness_pct != null ? Math.round(num(d.ft_avg_busyness_pct)!) : null,
    busy_hours_count: num(d.ft_busy_hours_count),
    availability_label: str(d.audience_availability_label),
  };
  // found = at least one non-empty field, else the caller shows nothing (self-suppress).
  const found = audience.who.length > 0 || audience.catchment != null || audience.dwell_max != null ||
    audience.peak_hour != null || audience.availability_label != null;

  // ── FACTS — declared vs external, never blended (see header).
  const facts: FamilyFact[] = [];

  if (audience.who.length) {
    facts.push({
      fact_fr: `Votre public déclaré : ${audience.who.join(" et ")}.`,
      claim_type: "observed",
    });
  }
  if (audience.catchment) {
    facts.push({ fact_fr: `Zone de chalandise déclarée : ${audience.catchment}.`, claim_type: "observed" });
  }
  if (audience.dwell_min != null && audience.dwell_max != null) {
    // BestTime's estimate, named as such — it is not measured from his till.
    facts.push({
      fact_fr: `Durée de visite estimée par BestTime : ${audience.dwell_min} à ${audience.dwell_max} minutes.`,
      claim_type: "observed",
    });
  }
  if (audience.avg_busyness_pct != null) {
    facts.push({
      fact_fr: `Affluence moyenne estimée par BestTime ce jour : ${audience.avg_busyness_pct} %.`,
      claim_type: "observed",
    });
  }
  if (audience.availability_label) {
    facts.push({
      fact_fr: `Disponibilité de votre public ce jour : ${audience.availability_label}.`,
      claim_type: "observed",
    });
  }
  // The gap is a TRUE statement about the warehouse and it stops the model inventing a customer list.
  facts.push({
    fact_fr: "Aucune donnée client individuelle n'existe dans vos données : ce profil décrit votre public et l'affluence, jamais des clients nommés ni un classement par CA.",
    claim_type: "observed",
  });

  const sources: string[] = [];
  if (audience.who.length || audience.catchment) sources.push("Votre profil — public et zone déclarés");
  if (audience.dwell_max != null || audience.avg_busyness_pct != null) sources.push("BestTime — affluence et durée de visite estimées");
  if (audience.availability_label) sources.push("Calendrier — disponibilité du public ce jour");

  return { found, data: { found, date, audience }, facts, sources };
}
