// src/lib/insightFamilies/weather.ts
// WEATHER family provider — what THIS venue's weather actually moves, from its OWN trailing history.
// Extracted VERBATIM from the deep-page endpoint (src/pages/api/insight/weather-sensitivity.ts) so the
// deep page stays byte-identical — the endpoint is now a thin wrapper over run(). Adds `facts` + `sources`.
//
// Everything is TRAILING (transaction_date <= signal date): only what was known at signal time.
// Honest-absence: below MIN_COND_DAYS comparable days -> chain:null, and NO chain facts. A thin sample
// must produce silence, not a smaller-sounding number.
//
// CLAIM TYPES — deliberate, do not "upgrade" them:
// the chain compares condition days vs typical days. That is an ASSOCIATION (the header calls it
// "direct comparable-day association"), so it is `observed_difference` — the same label the brain gives
// its decomposition. `measured` is reserved for Engine 2's causal store (OLS + SE + VIF). Calling this
// "measured" would sell an association as a causal effect, which is the one thing the card bar forbids.
import type { FamilyResult, FamilyFact } from "./types";

const PROJECT = "muse-square-open-data";
// Weather-family feature keys ↔ their per-day level column in fct_location_context_daily.
const WEATHER_LVL: Record<string, string> = {
  heat: "lvl_heat", rain: "lvl_rain", cold: "lvl_cold", wind: "lvl_wind", snow: "lvl_snow",
};
const COND_LABEL_FR: Record<string, string> = {
  heat: "forte chaleur", rain: "pluie", cold: "grand froid", wind: "vent fort", snow: "neige",
};
// The "condition" band: a day counts as a comparable condition day at moderate level or above.
const BAND = 2;
const EXTREME = 3;
// Robust floor: below this many comparable condition days we do not claim a measured chain.
const MIN_COND_DAYS = 5;
const FORECAST_DAYS = 7;

const num = (v: any): number | null => (v == null ? null : Number(v && typeof v === "object" && "value" in v ? v.value : v));
const ymd = (v: any): string | null => {
  if (v == null) return null;
  if (typeof v === "object" && "value" in v) return String(v.value);
  return String(v);
};
const frInt = (n: number): string => Math.round(n).toLocaleString("fr-FR");
const frDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : null;   // JJ/MM/AAAA — never ISO to the reader
};
const signed = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;   // U+2212

export async function weatherFamily(bq: any, location_id: string, date: string): Promise<FamilyResult> {
  // 1) The signal day's dominant weather condition = the level column with the max value (>=1).
  const [condRows] = await bq.query({
    query: `SELECT lvl_heat, lvl_rain, lvl_cold, lvl_wind, lvl_snow
            FROM \`${PROJECT}.mart.fct_location_context_daily\`
            WHERE location_id = @location_id AND date = PARSE_DATE('%Y-%m-%d', @date) LIMIT 1`,
    params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
  });
  const cond: any = Array.isArray(condRows) && condRows.length ? condRows[0] : null;
  let condition: { feature: string; level: number; label_fr: string } | null = null;
  if (cond) {
    for (const [feature, col] of Object.entries(WEATHER_LVL)) {
      const lvl = num(cond[col]) ?? 0;
      if (lvl >= 1 && (!condition || lvl > condition.level)) {
        condition = { feature, level: lvl, label_fr: COND_LABEL_FR[feature] || feature };
      }
    }
  }
  if (!condition) {
    // No active weather on the signal day -> nothing card-specific to decompose.
    return { found: false, data: { found: false, date, condition: null }, facts: [], sources: [] };
  }
  // Whitelisted column (never user-supplied) -> safe to interpolate.
  const lvlCol = WEATHER_LVL[condition.feature];

  // 2) forecast window, 3) chain decomposition, 4) product movers — all independent, run in parallel.
  const [fcRows, chainRows, prodRows] = await Promise.all([
    bq.query({
      query: `SELECT f.date, f.weather_label_fr,
                     f.temperature_2m_max AS tmax, f.temperature_2m_min AS tmin,
                     f.precipitation_probability_max_pct AS rain_prob, f.wind_speed_10m_max AS wind,
                     c.${lvlCol} AS lvl
              FROM \`${PROJECT}.mart.fct_location_weather_forecast_daily_detail\` f
              LEFT JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                ON c.location_id = f.location_id AND c.date = f.date
              WHERE f.location_id = @location_id AND f.date >= PARSE_DATE('%Y-%m-%d', @date)
              ORDER BY f.date LIMIT ${FORECAST_DAYS}`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
    bq.query({
      query: `WITH perf AS (
                SELECT p.daily_visitors AS vis, p.daily_conversion_rate AS conv,
                       p.daily_avg_basket AS basket, p.daily_revenue AS rev, c.${lvlCol} AS lvl
                FROM \`${PROJECT}.mart.fct_client_daily_performance\` p
                JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                  ON c.location_id = p.location_id AND c.date = p.transaction_date
                WHERE p.location_id = @location_id
                  AND p.transaction_date <= PARSE_DATE('%Y-%m-%d', @date)
              )
              SELECT COUNTIF(lvl >= ${BAND}) AS n_cond,
                     COUNTIF(lvl >= ${EXTREME}) AS n_extreme,
                     COUNT(*) AS n_all,
                     AVG(IF(lvl >= ${BAND}, vis, NULL))    AS cond_vis,    AVG(vis)    AS all_vis,
                     AVG(IF(lvl >= ${BAND}, conv, NULL))   AS cond_conv,   AVG(conv)   AS all_conv,
                     AVG(IF(lvl >= ${BAND}, basket, NULL)) AS cond_basket, AVG(basket) AS all_basket,
                     AVG(IF(lvl >= ${BAND}, rev, NULL))    AS cond_rev,    AVG(rev)    AS all_rev
              FROM perf`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]?.[0]).catch(() => null),
    bq.query({
      query: `WITH tagged AS (
                SELECT o.item_category AS cat, o.revenue AS rev,
                       IF(c.${lvlCol} >= ${BAND}, 'cond', 'base') AS band
                FROM \`${PROJECT}.mart.fct_client_offering_daily\` o
                JOIN \`${PROJECT}.mart.fct_location_context_daily\` c
                  ON c.location_id = o.location_id AND c.date = o.transaction_date
                WHERE o.location_id = @location_id
                  AND o.transaction_date <= PARSE_DATE('%Y-%m-%d', @date)
              )
              SELECT cat,
                     AVG(IF(band = 'cond', rev, NULL)) AS cond_rev,
                     AVG(IF(band = 'base', rev, NULL)) AS base_rev
              FROM tagged
              GROUP BY cat
              HAVING cond_rev IS NOT NULL AND base_rev IS NOT NULL AND base_rev > 0
              ORDER BY cond_rev DESC`,
      params: { location_id, date }, types: { location_id: "STRING", date: "STRING" }, location: "EU",
    }).then((r: any) => r[0]).catch(() => []),
  ]);

  // Forecast window: pick the peak (most extreme) day for this feature.
  const forecast = (Array.isArray(fcRows) ? fcRows : []).map((r: any) => {
    const lvl = num(r.lvl) ?? 0;
    return {
      date: ymd(r.date), label_fr: r.weather_label_fr ?? null,
      tmax: num(r.tmax), tmin: num(r.tmin), rain_prob: num(r.rain_prob), wind: num(r.wind),
      lvl, is_extreme: lvl >= EXTREME,
    };
  });
  let peak: any = null;
  for (const d of forecast) {
    if (!peak || d.lvl > peak.lvl || (d.lvl === peak.lvl && (d.tmax ?? -99) > (peak.tmax ?? -99))) {
      peak = { date: d.date, tmax: d.tmax, lvl: d.lvl };
    }
  }

  // Chain decomposition: condition days vs the venue's typical day. Honest-absence below the floor.
  let chain: any = null;
  if (chainRows) {
    const n_cond = num(chainRows.n_cond) ?? 0;
    if (n_cond >= MIN_COND_DAYS) {
      const condVis = num(chainRows.cond_vis), allVis = num(chainRows.all_vis);
      const condRev = num(chainRows.cond_rev), allRev = num(chainRows.all_rev);
      const pct = (a: number | null, b: number | null) =>
        a != null && b != null && b !== 0 ? Math.round((a / b - 1) * 100) : null;
      chain = {
        n_cond, n_all: num(chainRows.n_all) ?? 0, n_extreme: num(chainRows.n_extreme) ?? 0,
        visitors: { cond: condVis != null ? Math.round(condVis) : null, typical: allVis != null ? Math.round(allVis) : null, pct: pct(condVis, allVis) },
        conversion: { cond: num(chainRows.cond_conv), typical: num(chainRows.all_conv) },
        basket: { cond: num(chainRows.cond_basket), typical: num(chainRows.all_basket) },
        revenue: {
          cond: condRev != null ? Math.round(condRev) : null,
          typical: allRev != null ? Math.round(allRev) : null,
          pct: pct(condRev, allRev),
          eur_per_day: condRev != null && allRev != null ? Math.round(condRev - allRev) : null,
        },
      };
    }
  }

  // Product movers: which lines ride the condition (up) and which do not (down). Shown even when
  // the chain aggregate is too thin to chart — the caller labels them with cond_days so a small
  // sample reads AS small (honest, not hidden). cond_days = the venue's condition-day count.
  const cond_days = chainRows ? (num(chainRows.n_cond) ?? 0) : 0;
  const products = { up: [] as any[], down: [] as any[] };
  for (const r of (Array.isArray(prodRows) ? prodRows : [])) {
    const condRev = num(r.cond_rev), baseRev = num(r.base_rev);
    if (condRev == null || baseRev == null || baseRev === 0) continue;
    const pct = Math.round((condRev / baseRev - 1) * 100);
    const item = { category: r.cat, cond_eur: Math.round(condRev), base_eur: Math.round(baseRev), pct };
    (pct >= 0 ? products.up : products.down).push(item);
  }
  products.up.sort((a, b) => b.cond_eur - a.cond_eur);   // star first (biggest line that rides it)
  products.down.sort((a, b) => a.pct - b.pct);           // worst laggard first

  // ── FACTS. The chain is an ASSOCIATION -> observed_difference (see header). Below the floor there is
  // no chain and therefore NO effect fact: silence, not a hedged number.
  const facts: FamilyFact[] = [
    { fact_fr: `Condition météo dominante aujourd'hui : ${condition.label_fr} (niveau ${condition.level} sur 4).`, claim_type: "observed_acute" },
  ];

  if (peak && peak.date && peak.lvl >= EXTREME) {
    const d = frDate(peak.date);
    facts.push({
      fact_fr: `Pic de ${condition.label_fr} attendu le ${d}${peak.tmax != null ? ` (${Math.round(peak.tmax)} °C)` : ""} dans les ${FORECAST_DAYS} prochains jours.`,
      claim_type: "observed",
    });
  }

  if (chain) {
    if (chain.revenue?.pct != null) {
      facts.push({
        fact_fr: `Sur vos ${chain.n_cond} jours de ${condition.label_fr}, votre CA s'écarte de ${signed(chain.revenue.pct)} % par rapport à un jour habituel${chain.revenue.eur_per_day != null ? ` (${signed(chain.revenue.eur_per_day)} € par jour)` : ""}.`,
        claim_type: "observed_difference",
      });
    }
    if (chain.visitors?.pct != null) {
      facts.push({
        fact_fr: `Sur ces mêmes jours, votre fréquentation s'écarte de ${signed(chain.visitors.pct)} % (${frInt(chain.visitors.cond)} visiteurs contre ${frInt(chain.visitors.typical)} habituellement).`,
        claim_type: "observed_difference",
      });
    }
  } else {
    // Honest gap — states WHY there is no effect claim, so the model cannot fill the silence itself.
    facts.push({
      fact_fr: `Trop peu de jours de ${condition.label_fr} dans votre historique (${cond_days} sur ${MIN_COND_DAYS} requis) : aucun effet sur votre CA ne peut être établi.`,
      claim_type: "observed",
    });
  }

  // Product lines: subject to the SAME floor as the chain. The CARD shows them below the floor on
  // purpose (labelled with cond_days, so a thin sample reads as thin) — but a FACT is quoted by the
  // model as an assertion, and "Coffee beans −50 % par forte chaleur" off ONE day is noise sold as
  // insight. Below the floor the facts stay silent; the honest-gap fact above already says why.
  const star = cond_days >= MIN_COND_DAYS ? products.up[0] : null;
  const laggard = cond_days >= MIN_COND_DAYS ? products.down[0] : null;
  if (star) {
    facts.push({
      fact_fr: `Par ${condition.label_fr}, ${star.category} est votre ligne la plus solide : ${frInt(star.cond_eur)} € en moyenne contre ${frInt(star.base_eur)} € hors condition (${signed(star.pct)} %, sur ${cond_days} jour(s)).`,
      claim_type: "observed_difference",
    });
  }
  if (laggard && laggard.pct < 0) {
    facts.push({
      fact_fr: `À l'inverse, ${laggard.category} recule de ${signed(laggard.pct)} % par ${condition.label_fr} (${frInt(laggard.cond_eur)} € contre ${frInt(laggard.base_eur)} €, sur ${cond_days} jour(s)).`,
      claim_type: "observed_difference",
    });
  }

  const sources = [`Vos ventes — jours de ${condition.label_fr} comparés à vos jours habituels`, "Prévision météo du lieu (7 jours)"];

  return {
    found: true,
    data: { found: true, date, condition, forecast, peak, chain, cond_days, products },
    facts,
    sources,
  };
}
