// src/lib/ai/facts/buildDayPerformanceFacts.ts
// =====================================================
// Phase 4 (16/07) — DAY-PERFORMANCE facts for the grounded day answer.
// The owner's standing complaint: day answers "state what's in the database" (weather, events,
// soldes) and never say how the day actually WENT. This builder turns the existing performance
// layers into citable facts so the verdict can LEAD with performance:
//   - PAST day  -> CA réalisé vs CA habituel (fct_client_day_residual — dow+trend baseline),
//                  vs the day's ANALOGS (fct_client_day_analogs — same dow / weather-matched),
//                  and WHICH component moved (fct_client_sales_signals_daily *_delta_pct).
//   - TODAY/FUTURE day -> the same-dow CA habituel (mean of recent same-dow realized days) +
//                  the latest measured day's performance (recency anchor).
// Same consumption pattern as buildIdentityFacts: folded into the grounded whitelist as
// extraFacts — every number the model may surface is INSIDE a fact string, validator-gated.
// Honesty rules: components state ONLY what is measured (visitors are often absent — a NULL delta
// is silence, never "stable"); analogs are gated on analog_n >= MIN_ANALOGS; phrasing stays
// comparative (réalisé vs habituel), never causal — these facts carry no tier.
// =====================================================

import { makeBQClient } from "../../bq";

const PROJECT = "muse-square-open-data";
const RESIDUAL = `\`${PROJECT}.mart.fct_client_day_residual\``;
const ANALOGS = `\`${PROJECT}.mart.fct_client_day_analogs\``;
const SIGNALS = `\`${PROJECT}.mart.fct_client_sales_signals_daily\``;

const MIN_ANALOGS = 5;          // below this the analog comparison is noise, not context
const HABITUAL_DOW_N = 10;      // same-dow days averaged for the habitual
const COMPONENT_MATERIAL = 5;   // |delta_pct| >= this before a component is named as a mover

export type DayPerfFact = { fact_fr: string; claim_type: "observed_difference" | "observed" };

const num = (v: any): number =>
  v == null ? NaN : Number(v && typeof v === "object" && "value" in v ? (v as any).value : v);
const str = (v: any): string => (v == null ? "" : String(v && typeof v === "object" && "value" in v ? (v as any).value : v)).trim();
const frInt = (n: number): string => (Number.isFinite(n) ? Math.round(n).toLocaleString("fr-FR") : "ND");
const frSignedPct = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))} %`;
const frDay = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
const DOW_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const DOW_FR_PLURAL = ["dimanches", "lundis", "mardis", "mercredis", "jeudis", "vendredis", "samedis"];
function dowOf(iso: string): number {
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1)).getUTCDay();
}
const MATCH_TIER_FR: Record<string, string> = {
  exact: "conditions identiques",
  dow_weather: "même jour de semaine, météo similaire",
  dow: "même jour de semaine",
};

export async function buildDayPerformanceFacts(location_id: string, date: string): Promise<{ facts: DayPerfFact[] }> {
  const facts: DayPerfFact[] = [];
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const dow = dowOf(date);
    const [dayRes, ctxRes] = await Promise.all([
      // The asked day, if it is measured: residual + analogs + component deltas in one row.
      bq.query({
        query: `
          SELECT r.daily_revenue, r.expected_revenue, r.residual_pct,
                 a.analog_n, a.analog_median_revenue, a.residual_vs_analog_pct, a.match_tier,
                 s.footfall_delta_pct, s.basket_delta_pct, s.conversion_delta_pct
          FROM ${RESIDUAL} r
          LEFT JOIN ${ANALOGS} a ON a.location_id = r.location_id AND a.date = r.date
          LEFT JOIN ${SIGNALS} s ON s.location_id = r.location_id AND s.transaction_date = r.date
          WHERE r.location_id = @location_id AND r.date = DATE(@date)
            AND r.residual_pct IS NOT NULL AND r.expected_revenue > 0`,
        params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
      }),
      // Context for an unmeasured (today/future) day: same-dow habitual + the latest measured day.
      bq.query({
        query: `
          SELECT
            (SELECT AVG(daily_revenue) FROM (
               SELECT daily_revenue FROM ${RESIDUAL}
               WHERE location_id = @location_id AND EXTRACT(DAYOFWEEK FROM date) = @bq_dow
                 AND date < DATE(@date) AND daily_revenue IS NOT NULL
               ORDER BY date DESC LIMIT ${HABITUAL_DOW_N})) AS dow_avg,
            (SELECT COUNT(*) FROM (
               SELECT 1 FROM ${RESIDUAL}
               WHERE location_id = @location_id AND EXTRACT(DAYOFWEEK FROM date) = @bq_dow
                 AND date < DATE(@date) AND daily_revenue IS NOT NULL
               ORDER BY date DESC LIMIT ${HABITUAL_DOW_N})) AS dow_n,
            latest.date AS latest_date, latest.daily_revenue AS latest_ca, latest.residual_pct AS latest_res
          FROM (
            SELECT date, daily_revenue, residual_pct FROM ${RESIDUAL}
            WHERE location_id = @location_id AND residual_pct IS NOT NULL
            ORDER BY date DESC LIMIT 1
          ) AS latest`,
        // BigQuery DAYOFWEEK: 1 = Sunday … 7 = Saturday; JS getUTCDay 0 = Sunday.
        params: { location_id, date, bq_dow: dow + 1 },
        types: { location_id: "STRING", date: "STRING", bq_dow: "INT64" }, location: "EU",
      }),
    ]);

    const d: any = (dayRes[0] ?? [])[0];
    if (d && Number.isFinite(num(d.residual_pct))) {
      // ── PAST measured day: performance LEADS ──
      const ca = num(d.daily_revenue), exp = num(d.expected_revenue), res = num(d.residual_pct);
      facts.push({
        fact_fr: `CA réalisé le ${frDay(date)} : ${frInt(ca)} € — ${frSignedPct(res)} vs votre CA habituel (${frInt(exp)} €, base jour de semaine et tendance).`,
        claim_type: "observed_difference",
      });
      const an = num(d.analog_n);
      if (Number.isFinite(an) && an >= MIN_ANALOGS && Number.isFinite(num(d.residual_vs_analog_pct))) {
        const tierFr = MATCH_TIER_FR[str(d.match_tier)] ?? "jours comparables";
        facts.push({
          fact_fr: `Vs vos ${frInt(an)} jours comparables (${tierFr}) : ${frSignedPct(num(d.residual_vs_analog_pct))} (médiane de ces jours : ${frInt(num(d.analog_median_revenue))} €).`,
          claim_type: "observed_difference",
        });
      }
      // Components: name ONLY measured movers; a NULL delta is silence (visitors often absent).
      const comps: Array<{ label: string; v: number }> = [
        { label: "fréquentation", v: num(d.footfall_delta_pct) },
        { label: "panier moyen", v: num(d.basket_delta_pct) },
        { label: "taux de conversion", v: num(d.conversion_delta_pct) },
      ].filter((c) => Number.isFinite(c.v));
      if (comps.length) {
        const movers = comps.filter((c) => Math.abs(c.v) >= COMPONENT_MATERIAL);
        facts.push({
          fact_fr: movers.length
            ? `Composante(s) en mouvement ce jour-là : ${movers.map((c) => `${c.label} ${frSignedPct(c.v)} vs sa base`).join(" ; ")}.`
            : `Composantes mesurées du jour (${comps.map((c) => c.label).join(", ")}) : sans écart marquant vs leur base.`,
          claim_type: "observed_difference",
        });
      }
    } else {
      // ── TODAY / FUTURE day: expectation + recency anchor ──
      const c: any = (ctxRes[0] ?? [])[0];
      const dowAvg = c ? num(c.dow_avg) : NaN;
      const dowN = c ? num(c.dow_n) : NaN;
      if (Number.isFinite(dowAvg) && Number.isFinite(dowN) && dowN >= 3) {
        facts.push({
          fact_fr: `Votre CA habituel pour un ${DOW_FR[dow]} : ~${frInt(dowAvg)} € (moyenne de vos ${frInt(dowN)} derniers ${DOW_FR_PLURAL[dow]} mesurés).`,
          claim_type: "observed",
        });
      }
      if (c && Number.isFinite(num(c.latest_res))) {
        const lIso = str(c.latest_date).slice(0, 10);
        facts.push({
          fact_fr: `Dernier jour mesuré (${frDay(lIso)}) : ${frInt(num(c.latest_ca))} € — ${frSignedPct(num(c.latest_res))} vs votre CA habituel.`,
          claim_type: "observed_difference",
        });
      }
    }
  } catch (e: any) {
    console.warn("[day-perf-facts] skipped:", e?.message);
  }
  return { facts };
}
