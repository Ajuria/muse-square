// src/pages/api/insight/weather-window.ts
// Card-SPECIFIC drill-down for extended_bad_weather ("Météo prolongée") — treats it as a WINDOW to plan
// around, NOT a single day. Three parts:
//   1) the WINDOW: the run of consecutive extreme days from the card date (heat/rain/cold/wind/snow at
//      level ≥2), its length, its peak day, its DOMINANT feature. "Bad weather" INCLUDES heat — a July
//      canicule is the archetypal extended window (excluding heat here would be the classic mistake).
//   2) the MEASURED impact: how the venue's OWN CA moved on past days with that condition vs without —
//      truth-first (for a café, a heatwave is an OPPORTUNITY, +CA; for others a threat). n-gated.
//   3) the (currently empty) playbook — what was done in past windows — lives in the shared track-record
//      zone; honest-absence until the operator commits.
// Sources: mart.fct_location_context_daily (lvl_* levels, incl. forecast rows), fct_location_weather_
// forecast_daily_detail (apparent/real tmax), fct_client_sales_signals_daily (daily_revenue/transactions/avg_basket).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

const PROJECT = "muse-square-open-data";
const HORIZON = 13;   // forecast days scanned for the window (pulse shows today+6; we read wider, clamp in copy)
const EXTREME = 2;    // level ≥ this = an extreme day (part of a window)
const MIN_DAYS = 5;   // measured-impact floor
const FEATS = ["heat", "rain", "cold", "wind", "snow"] as const;
const LVL_COL: Record<string, string> = { heat: "lvl_heat", rain: "lvl_rain", cold: "lvl_cold", wind: "lvl_wind", snow: "lvl_snow" };
const LABEL: Record<string, string> = { heat: "forte chaleur", rain: "pluie", cold: "grand froid", wind: "vent fort", snow: "neige" };
const WINDOW_NOUN: Record<string, string> = { heat: "canicule", rain: "épisode pluvieux", cold: "vague de froid", wind: "coup de vent", snow: "épisode neigeux" };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function requireString(v: string | null, name: string): string { const s = String(v || "").trim(); if (!s) throw new Error(`Missing required query param: ${name}`); return s; }
function normalizeYmd(v: string): string { const m = String(v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/); if (!m) throw new Error(`Invalid date format: ${v}`); return m[1]; }
const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const str = (v: any): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const frDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const pctFr = (n: number) => (n >= 0 ? "+" : "−") + String(Math.abs(Math.round(n))).replace(".", ",") + " %";

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(url.searchParams.get("date"), "date"));

    // 1) The forecast window — levels (context_daily, has forecast rows) + apparent tmax (forecast_detail).
    const [winRows] = await bq.query({
      query: `SELECT CAST(c.date AS STRING) AS d, c.lvl_heat, c.lvl_rain, c.lvl_cold, c.lvl_wind, c.lvl_snow,
                     f.apparent_temperature_max AS feels, f.temperature_2m_max AS tmax
              FROM \`${PROJECT}.mart.fct_location_context_daily\` c
              LEFT JOIN \`${PROJECT}.mart.fct_location_weather_forecast_daily_detail\` f
                ON c.location_id = f.location_id AND c.date = f.date
              WHERE c.location_id = @location_id
                AND c.date BETWEEN DATE(@date) AND DATE_ADD(DATE(@date), INTERVAL ${HORIZON} DAY)
              ORDER BY c.date`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    });
    const days = (Array.isArray(winRows) ? winRows : []).map((r: any) => {
      const lvls: Record<string, number> = {}; FEATS.forEach((ft) => { lvls[ft] = num((r as any)[LVL_COL[ft]]) || 0; });
      const maxft = FEATS.reduce((a, b) => (lvls[b] > lvls[a] ? b : a), "heat");
      return { d: str(r.d)!, lvls, maxlvl: Math.max(...FEATS.map((ft) => lvls[ft])), feature: maxft, feels: num(r.feels), tmax: num(r.tmax) };
    });
    // The run of consecutive extreme days starting at the card date (index 0).
    let run: typeof days = [];
    for (const day of days) { if (day.maxlvl >= EXTREME) run.push(day); else break; }
    if (run.length < 2) return json(200, { ok: true, found: false, date });   // not an EXTENDED window

    // Dominant feature = the one with the greatest summed level across the run.
    const featSum: Record<string, number> = {}; FEATS.forEach((ft) => { featSum[ft] = run.reduce((s, dd) => s + dd.lvls[ft], 0); });
    const feature = FEATS.reduce((a, b) => (featSum[b] > featSum[a] ? b : a), "heat");
    const peak = run.reduce((mx, dd) => (dd.lvls[feature] > mx.lvls[feature] ? dd : mx), run[0]);

    // 2) Measured impact — the venue's OWN CA on past days WITH this condition (level ≥1) vs WITHOUT.
    const col = LVL_COL[feature];
    const [impRows] = await bq.query({
      query: `WITH j AS (
                SELECT c.${col} AS lvl, s.daily_revenue AS rev, s.daily_transactions AS txns, s.avg_basket AS basket
                FROM \`${PROJECT}.mart.fct_location_context_daily\` c
                JOIN \`${PROJECT}.mart.fct_client_sales_signals_daily\` s
                  ON c.location_id = s.location_id AND c.date = s.transaction_date
                WHERE c.location_id = @location_id AND c.date < DATE(@date))
              SELECT COUNTIF(lvl >= 1) AS n_cond, COUNT(*) AS n_total,
                     AVG(IF(lvl >= 1, rev, NULL)) AS rev_cond, AVG(IF(lvl = 0 OR lvl IS NULL, rev, NULL)) AS rev_base,
                     AVG(IF(lvl >= 1, txns, NULL)) AS txns_cond, AVG(IF(lvl = 0 OR lvl IS NULL, txns, NULL)) AS txns_base,
                     AVG(IF(lvl >= 1, basket, NULL)) AS bk_cond, AVG(IF(lvl = 0 OR lvl IS NULL, basket, NULL)) AS bk_base
              FROM j`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    });
    const im: any = (Array.isArray(impRows) && impRows.length) ? impRows[0] : {};
    const nCond = num(im.n_cond) || 0;
    const pctDelta = (a: number | null, b: number | null) => (a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null);
    const caDelta = pctDelta(num(im.rev_cond), num(im.rev_base));
    const txnsDelta = pctDelta(num(im.txns_cond), num(im.txns_base));
    const bkDelta = pctDelta(num(im.bk_cond), num(im.bk_base));
    const measured = nCond >= MIN_DAYS && caDelta != null;
    const opportunity = measured && caDelta! >= 0;

    const noun = WINDOW_NOUN[feature] || "épisode";
    const startFr = frDate(run[0].d), endFr = frDate(run[run.length - 1].d);
    const peakTemp = feature === "heat" && peak.feels != null ? ` (pic ${Math.round(peak.feels)} °C ressenti le ${frDate(peak.d)})` : "";
    const within6 = run.length;   // the run starts today; how much of it is in the pulse horizon
    const lead = measured
      ? `${noun.charAt(0).toUpperCase() + noun.slice(1)} de ${run.length} jours (${startFr} → ${endFr})${peakTemp} — et pour VOUS, ${LABEL[feature]} rime avec CA ${pctFr(caDelta!)} (mesuré sur ${nCond} jours). ${opportunity ? "À capitaliser." : "À défendre."}`
      : `${noun.charAt(0).toUpperCase() + noun.slice(1)} de ${run.length} jours (${startFr} → ${endFr})${peakTemp}. Impact sur votre CA non mesurable pour l'instant (trop peu de jours comparables).`;

    const strip = run.map((dd) => ({
      day: frDate(dd.d).slice(0, 5), level: dd.lvls[feature],
      temp: feature === "heat" && dd.feels != null ? Math.round(dd.feels) + "°" : null,
      peak: dd.d === peak.d,
    }));

    const decision_lines: { head: string; body: string }[] = [];
    if (measured && opportunity) {
      decision_lines.push({ head: `${LABEL[feature].charAt(0).toUpperCase() + LABEL[feature].slice(1)} = votre fenêtre`, body: `Ces jours-là votre CA monte de ${pctFr(caDelta!)}${txnsDelta != null && bkDelta != null ? ` (fréquentation ${pctFr(txnsDelta)}, panier ${pctFr(bkDelta)})` : ""} — préparez l'offre et le réassort AVANT, pas pendant.` });
      if (feature === "heat") decision_lines.push({ head: "Jouez le chaud", body: "Boissons fraîches / glaces en avant, terrasse ombragée, eau offerte — captez le flux que la chaleur vous amène." });
    } else if (measured) {
      decision_lines.push({ head: `${LABEL[feature].charAt(0).toUpperCase() + LABEL[feature].slice(1)} pèse sur votre CA`, body: `Ces jours-là votre CA baisse de ${pctFr(caDelta!)} — anticipez : offre de repli, staffing allégé, communication proactive.` });
    } else {
      decision_lines.push({ head: "Fenêtre à surveiller", body: "Trop peu de jours comparables pour chiffrer l'impact — notez ce que vous faites cette fois pour construire votre référence." });
    }

    // Ampleur — how often this condition recurs per year + the €/year at stake (potential when it lifts CA,
    // at risk when it hurts). ASSOCIATIVE → "jusqu'à / potentiel", never a guaranteed causal gain.
    const nTotal = num(im.n_total) || 0;
    const annualCondDays = nTotal ? Math.round((nCond / nTotal) * 365) : null;
    const incrPerDay = (num(im.rev_cond) != null && num(im.rev_base) != null) ? Math.round(num(im.rev_cond)! - num(im.rev_base)!) : null;
    let scale: any = null;
    if (measured && annualCondDays && incrPerDay != null) {
      scale = {
        annual_eur: Math.abs(annualCondDays * incrPerDay),
        annual_label: opportunity ? "de potentiel / an sur ces jours" : "de CA / an en risque",
        recurrence: `~${annualCondDays} jours de ${LABEL[feature]} par an — récurrent, chaque année.`,
        enjeu: opportunity
          ? `Sur vos ~${annualCondDays} jours de ${LABEL[feature]}/an, votre CA est ${pctFr(caDelta!)} — soit ce montant à capter en jouant bien la fenêtre (potentiel, pas garanti).`
          : `Sur vos ~${annualCondDays} jours de ${LABEL[feature]}/an, votre CA baisse de ${pctFr(caDelta!)} — le montant à défendre.`,
      };
    }

    return json(200, {
      ok: true, found: true, date, feature, feature_label: LABEL[feature], window_noun: noun, scale,
      window: { start: run[0].d, end: run[run.length - 1].d, length: run.length, within_horizon: within6, peak_date: peak.d, peak_level: peak.lvls[feature], peak_feels: feature === "heat" ? num(peak.feels) : null, strip },
      measured, opportunity,
      impact: measured ? { ca_delta: Math.round(caDelta!), txns_delta: txnsDelta != null ? Math.round(txnsDelta) : null, basket_delta: bkDelta != null ? Math.round(bkDelta) : null, n: nCond } : null,
      lead, decision_lines,
      caveat: "Association observée sur vos jours comparables passés, pas une garantie — la fenêtre au-delà de 6 jours reste une prévision. Notez vos actions pour affiner.",
    });
  } catch (err: any) {
    console.error("[api/insight/weather-window] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
