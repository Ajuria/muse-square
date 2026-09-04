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
//   - PAST day NOT YET MEASURED (I9, owner 04/09 — « hier » le matin, avant le traitement de nuit)
//                  -> ONE fact : the day is not in the sales yet, and the latest measured day.
//                  NEVER the same-dow habituel of the unmeasured day : mesuré le 04/09, ces deux
//                  faits côte à côte (« habituel pour un jeudi ~1 533 € » + « dernier jour mesuré
//                  02/09 +70 % ») faisaient écrire au modèle « 1 439 € contre 1 533 €, +70 % » —
//                  le référentiel croisé que le validateur (I4) rejette, jusqu'au plancher.
// Same consumption pattern as buildIdentityFacts: folded into the grounded whitelist as
// extraFacts — every number the model may surface is INSIDE a fact string, validator-gated.
// Honesty rules: components state ONLY what is measured (visitors are often absent — a NULL delta
// is silence, never "stable"); analogs are gated on analog_n >= MIN_ANALOGS; phrasing stays
// comparative (réalisé vs habituel), never causal — these facts carry no tier.
// =====================================================

import { makeBQClient } from "../../bq";

const PROJECT = "muse-square-open-data";
const RESIDUAL = `\`${PROJECT}.semantic.vw_insight_event_day_residual\``;
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

// I9 — QUAND un jour entre dans la base (owner 04/09 : « la précision doit être notre marque de
// fabrique »). Mesuré sur dbt Cloud le 04/09 : le job `daily_fresh_data_run_general`
// (`dbt build --select source_status:fresher+`) part à 05:00 UTC du lundi au samedi (cron
// « 0 5 * * 1,2,3,4,5,6 », jamais le dimanche) ; `fct_client_day_residual` (transaction_date <
// current_date()) est construit ~7-10 min plus tard (runs Paris 07:07-07:10 du 28/08 au 03/09).
// L'heure est UTC : 7 h 10 à Paris l'été, 6 h 10 l'hiver — calculée, jamais écrite en dur.
const DBT_DAILY_RUN_UTC = { hour: 5, minute: 10, days: [1, 2, 3, 4, 5, 6] };   // 1 = lundi … 6 = samedi

/** « ce matin » / « demain matin » / « lundi matin », avec l'heure de Paris du prochain run. */
export function nextDailyRunFr(nowUtc: Date): string {
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const paris = (d: Date) => {
    const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const h = Number(parts.find((x) => x.type === "hour")?.value ?? 0), m = Number(parts.find((x) => x.type === "minute")?.value ?? 0);
    return { h, m };
  };
  const parisDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  // Prochain run : aujourd'hui (UTC) si jour de run et pas encore passé, sinon le jour de run suivant.
  const run = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate(), DBT_DAILY_RUN_UTC.hour, DBT_DAILY_RUN_UTC.minute));
  while (!DBT_DAILY_RUN_UTC.days.includes(run.getUTCDay()) || run.getTime() <= nowUtc.getTime()) run.setUTCDate(run.getUTCDate() + 1);
  const { h, m } = paris(run);
  const heure = `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
  const todayKey = parisDayKey(nowUtc), runKey = parisDayKey(run);
  const tomorrow = new Date(nowUtc.getTime() + 86400000);
  const quand = runKey === todayKey ? "ce matin" : runKey === parisDayKey(tomorrow) ? "demain matin" : `${JOURS[run.getUTCDay()]} matin`;
  return `${quand}, à partir de ${heure}`;
}

/** I9 — le fait d'un jour PASSÉ non mesuré (phrase owner 04/09, corrigée : « il sera dans la base de
 *  données demain matin, à partir de 7 h 10 » — l'heure vient du job, jamais d'un concept).
 *  Pur : testé par mutation dans buildDayPerformanceFacts.test.ts. */
export function unmeasuredPastDayFacts(
  date: string,
  latest: { date: string; ca: number; res_pct: number } | null,
  nowUtc: Date = new Date(),
): DayPerfFact[] {
  const arrive = `il sera dans la base de données ${nextDailyRunFr(nowUtc)}`;
  if (!latest || !Number.isFinite(latest.ca) || !Number.isFinite(latest.res_pct)) {
    return [{ fact_fr: `Le ${frDay(date)} n'est pas encore dans vos ventes : ${arrive}.`, claim_type: "observed" }];
  }
  const dow = DOW_FR[dowOf(latest.date)];
  return [{
    fact_fr: `Le ${frDay(date)} n'est pas encore dans vos ventes : ${arrive}. Dernier jour mesuré : ${dow} ${frDay(latest.date)}, ${frInt(latest.ca)} €, ${frSignedPct(latest.res_pct)} vs votre CA habituel.`,
    claim_type: "observed_difference",
  }];
}

export async function buildDayPerformanceFacts(location_id: string, date: string, todayIso?: string): Promise<{ facts: DayPerfFact[] }> {
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
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
            (SELECT DATE_DIFF(MAX(date), MIN(date), DAY) + 1 FROM ${RESIDUAL}
               WHERE location_id = @location_id AND residual_pct IS NOT NULL) AS hist_span_days,
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
        // Pool size/composition spelled out (owner remark 16/07): the analogs share the asked day's
        // weekday, so n analogs = n samedis/lundis/…; the venue's measured-history span gives the
        // window they were drawn from. « médiane » without « mesurée sur quoi » reads as hand-waving.
        const cx: any = (ctxRes[0] ?? [])[0];
        const histWeeks = cx && Number.isFinite(num(cx.hist_span_days)) ? Math.max(1, Math.round(num(cx.hist_span_days) / 7)) : null;
        // Pure-dow tier: « 12 samedis » already says it — the qualifier only adds signal on the
        // weather/exact tiers (« météo similaire », « conditions identiques »). The pool LEADS the
        // comparison (owner remark 16/07): quoting « +43 % vs … » then drags « vos 12 derniers
        // samedis » along — a trailing “mesurée sur …” clause gets paraphrased away.
        const tierClause = str(d.match_tier) === "dow" ? "" : ` à ${tierFr}`;
        const pool = `${frInt(an)} derniers ${DOW_FR_PLURAL[dow]}${tierClause}${histWeeks != null ? ` (${frInt(histWeeks)} semaines d'historique mesuré)` : ""}`;
        facts.push({
          fact_fr: `Vs vos ${pool} : ${frSignedPct(num(d.residual_vs_analog_pct))} — leur médiane : ${frInt(num(d.analog_median_revenue))} €.`,
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
    } else if (date < today) {
      // ── PAST day NOT YET MEASURED (I9) — one fact, never the unmeasured day's habituel ──
      const c: any = (ctxRes[0] ?? [])[0];
      const lIso = c ? str(c.latest_date).slice(0, 10) : "";
      const latest = c && lIso && Number.isFinite(num(c.latest_ca)) && Number.isFinite(num(c.latest_res))
        ? { date: lIso, ca: num(c.latest_ca), res_pct: num(c.latest_res) } : null;
      facts.push(...unmeasuredPastDayFacts(date, latest));
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
