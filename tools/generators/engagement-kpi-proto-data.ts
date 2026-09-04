// Harnais proto « KPI jour » (D demi-cercle + C points pairs) — LECTURE SEULE.
// Capture, pour CHAQUE engagement réel (hors annulés), la mesure dans son KPI DÉCLARÉ :
// réalisé, habituel (kpi_baseline stocké ou recalcul), objectif (pct déclaré ou traduction
// legacy z), et les POINTS C : jours pairs réels (même jour de semaine, fenêtre day_of)
// ou les journées de la fenêtre (multi-jours). Rien d'inventé : valeur absente → null,
// et le proto l'affiche comme absence.
// Usage : npx tsx tools/generators/engagement-kpi-proto-data.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { makeBQClient } from "../../src/lib/bq";
import { KPI_LABEL_FR } from "../../src/lib/kpiRegistry";

const P = "muse-square-open-data";
const PERF = `${P}.mart.fct_client_daily_performance`;
const RESIDUAL = `${P}.mart.fct_client_day_residual`;
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const KPI_COL: Record<string, string> = {
  footfall: "daily_visitors", conversion: "daily_conversion_rate", basket: "daily_avg_basket",
  transactions: "daily_transactions", discount: "daily_discount_total",
};

// Arrondi au référentiel : un taux 0-1 arrondi au dixième serait détruit.
const rnd = (v: number): number => (Math.abs(v) < 10 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10);

(async () => {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || P);
  const [rows] = await bq.query({ query: `
    SELECT commitment_id, location_id, status, verdict, measured_metric, threshold_basis, threshold_value,
           threshold_level, CAST(window_start AS STRING) ws, CAST(window_end AS STRING) we, window_kind,
           window_days_expected, kpi_baseline, kpi_window_value, saved_item_id,
           committed_action_text, owner_person_name, CAST(created_at AS STRING) created_at
    FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC) rn
          FROM \`${P}.analytics.action_commitments\`)
    WHERE rn = 1 AND status != 'cancelled' ORDER BY created_at DESC`, location: "EU" });
  // Libellés sites (jamais d'UUID à l'écran).
  const [locRows] = await bq.query({ query: `SELECT location_id, ANY_VALUE(company_name) name FROM \`${P}.raw.insight_event_user_location_profile\` GROUP BY 1`, location: "EU" });
  const locName: Record<string, string> = {};
  for (const l of locRows as any[]) locName[String(flat(l.location_id))] = String(flat(l.name) || "");

  const out: any[] = [];
  for (const r of rows as any[]) {
    const loc = String(flat(r.location_id));
    const metric = String(flat(r.measured_metric) || "");
    const ws = String(flat(r.ws)), we = String(flat(r.we));
    const dayOf = String(flat(r.window_kind)) === "day_of";
    const basis = String(flat(r.threshold_basis) || "");
    const thr = flat(r.threshold_value) != null ? Number(flat(r.threshold_value)) : null;
    const days = Number(flat(r.window_days_expected) || (dayOf ? 1 : 7));
    let baseline = flat(r.kpi_baseline) != null ? Number(flat(r.kpi_baseline)) : null;
    let realized = flat(r.kpi_window_value) != null ? Number(flat(r.kpi_window_value)) : null;
    let unit = "€/j", label = KPI_LABEL_FR[metric as keyof typeof KPI_LABEL_FR] || "CA vs normale";
    let family: string | null = null;
    let dailySeries: { date: string; v: number }[] = [];
    let peers: { date: string; v: number }[] = [];

    if (metric === "family_revenue") {
      const sid = flat(r.saved_item_id);
      if (sid) {
        const [f] = await bq.query({ query: `SELECT kpi_family FROM \`${P}.raw.saved_items\` WHERE saved_item_id = @s LIMIT 1`, params: { s: String(sid) }, location: "EU" });
        family = f[0] ? String(flat((f[0] as any).kpi_family) || "") || null : null;
      }
      label = "CA famille" + (family ? " « " + family + " »" : "");
      if (family) {
        const [dr] = await bq.query({ query: `
          SELECT CAST(transaction_date AS STRING) d, SUM(revenue) v FROM \`${P}.raw.client_transactions\`
          WHERE location_id=@l AND item_category=@f AND transaction_date BETWEEN @a AND @b GROUP BY 1 ORDER BY 1`,
          params: { l: loc, f: family, a: bq.date(ws), b: bq.date(we) }, location: "EU" });
        dailySeries = (dr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) }));
        // Pairs C (day_of) : les 8 derniers MÊMES jours de semaine avant la fenêtre, CA famille réel.
        const [pr] = await bq.query({ query: `
          SELECT CAST(transaction_date AS STRING) d, SUM(revenue) v FROM \`${P}.raw.client_transactions\`
          WHERE location_id=@l AND item_category=@f AND transaction_date < @a
            AND EXTRACT(DAYOFWEEK FROM transaction_date) = EXTRACT(DAYOFWEEK FROM @a)
          GROUP BY 1 ORDER BY 1 DESC LIMIT 8`,
          params: { l: loc, f: family, a: bq.date(ws) }, location: "EU" });
        peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
      }
    } else if (metric && metric !== "revenue_residual" && KPI_COL[metric]) {
      const col = KPI_COL[metric];
      unit = metric === "conversion" ? "" : metric === "transactions" ? "tickets/j" : metric === "footfall" ? "visiteurs/j" : metric === "basket" ? "€" : "€/j";
      const [dr] = await bq.query({ query: `
        SELECT CAST(transaction_date AS STRING) d, ${col} v FROM \`${PERF}\`
        WHERE location_id=@l AND transaction_date BETWEEN @a AND @b ORDER BY 1`,
        params: { l: loc, a: bq.date(ws), b: bq.date(we) }, location: "EU" });
      dailySeries = (dr as any[]).filter((x) => flat(x.v) != null).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) }));
      const [pr] = await bq.query({ query: `
        SELECT CAST(transaction_date AS STRING) d, ${col} v FROM \`${PERF}\`
        WHERE location_id=@l AND transaction_date < @a AND ${col} IS NOT NULL
        ORDER BY 1 DESC LIMIT 8`, params: { l: loc, a: bq.date(ws) }, location: "EU" });
      peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
    } else {
      // K1 legacy : CA/j réalisé vs habituel (expected_revenue) — le seul référentiel du z.
      const [dr] = await bq.query({ query: `
        SELECT CAST(date AS STRING) d, daily_revenue v, expected_revenue e FROM \`${RESIDUAL}\`
        WHERE location_id=@l AND date BETWEEN @a AND @b ORDER BY 1`,
        params: { l: loc, a: bq.date(ws), b: bq.date(we) }, location: "EU" });
      const dd = (dr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)), e: Number(flat(x.e)) }));
      dailySeries = dd.map(({ date, v }) => ({ date, v }));
      if (dd.length) {
        realized = Math.round((dd.reduce((s, x) => s + x.v, 0) / dd.length) * 10) / 10;
        baseline = Math.round((dd.reduce((s, x) => s + x.e, 0) / dd.length) * 10) / 10;
      }
      const [pr] = await bq.query({ query: `
        SELECT CAST(date AS STRING) d, daily_revenue v FROM \`${RESIDUAL}\`
        WHERE location_id=@l AND date < @a ORDER BY 1 DESC LIMIT 8`,
        params: { l: loc, a: bq.date(ws) }, location: "EU" });
      peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
    }

    // Jours FUTURS = non mesurés, toujours (le seed démo porte des lignes au-delà
    // d'aujourd'hui — une page qui les compterait « mesurerait » l'avenir).
    const today = new Date().toISOString().slice(0, 10);
    dailySeries = dailySeries.filter((x) => x.date <= today);
    if (ws > today) realized = null;
    // Réalisé fenêtre : si non stocké, moyenne/j de la série (jours passés seulement).
    if (realized == null && ws <= today && dailySeries.length) realized = rnd(dailySeries.reduce((s, x) => s + x.v, 0) / dailySeries.length);
    // Objectif : pct déclaré → baseline×(1+pct) ; legacy z → traduction indicative (formule card-kit) ; sinon null.
    let goal: number | null = null, goalPct: number | null = null;
    if (basis === "pct" && thr != null && baseline != null) { goalPct = thr; goal = rnd(baseline * (1 + thr / 100)); }
    else if (basis === "residual_z" && thr != null && baseline != null) { goalPct = Math.max(1, Math.round(thr * 0.19 / Math.sqrt(days) * 100)); goal = rnd(baseline * (1 + goalPct / 100)); }
    out.push({
      commitment_id: String(flat(r.commitment_id)), site: locName[loc] || "", status: String(flat(r.status)),
      verdict: flat(r.verdict) || null, text: String(flat(r.committed_action_text) || ""),
      owner: flat(r.owner_person_name) || null, metric, label, unit, family,
      window: { start: ws, end: we, day_of: dayOf, days },
      baseline, realized, goal, goalPct, basis,
      daily: dailySeries, peers,
    });
    console.log((String(flat(r.committed_action_text)).slice(0, 40)).padEnd(42), "| réalisé:", realized, "| habituel:", baseline, "| objectif:", goal, "| pairs:", peers.length, "| jours fenêtre:", dailySeries.length);
  }
  const dest = new URL("../proto/engagement-kpi-proto-data.js", import.meta.url).pathname;
  writeFileSync(dest, "window.ENG_KPI_PROTO = " + JSON.stringify({ captured_at: new Date().toISOString(), engagements: out }, null, 1) + ";\n");
  console.log("écrit:", dest);
})();
