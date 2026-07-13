// Type B — COMMITTED design-matrix build (A2). See docs/features/learning-types.md §C.1.
//
// Materializes analytics.b_real_designmatrix = the fit source the offline engine
// (src/scripts/sensitivity-engine.cjs, BMODE=real) reads. Until now this table was an
// ORPHAN — built ad-hoc offline, never in source control, so the whole Type-B pipeline
// (matrix -> fit -> store) was not reproducible. This script IS that build.
//
//   residual  = mart.fct_client_day_residual (dow+trend removed; the fit target)
//   features  = binary predicates over mart.fct_location_context_daily, driven by the
//               SINGLE-SOURCE registry src/lib/sensitivityFeatures.json (same map the engine's
//               mechanism gate and the endpoint's today-activation read — no second list).
//   is_oos    = the most-recent ceil(0.2*n) days PER LOCATION (holdout for the baseline shadow).
//
// The universe (which venues / dates) is inherited from the residual mart — never hardcoded, so
// the matrix tracks the data as it accrues. Reproducible in one command:
//   node src/scripts/build-designmatrix.cjs            (writes the real table)
//   node src/scripts/build-designmatrix.cjs --dry <t>  (writes a scratch table for verification)

const { BigQuery } = require("@google-cloud/bigquery");
const REG = require("../lib/sensitivityFeatures.json");

const bq = new BigQuery({ projectId: "muse-square-open-data" });
const DS = "muse-square-open-data";
const RESIDUAL = `${DS}.mart.fct_client_day_residual`;
const CONTEXT = `${DS}.${REG.context_table}`; // registry declares the context table (mart.fct_location_context_daily)
const num = (v) => (v && typeof v === "object" && "value" in v ? Number(v.value) : Number(v));

// --dry <table> writes to a scratch table (verification) instead of the live matrix.
const argv = process.argv.slice(2);
const dryIdx = argv.indexOf("--dry");
const TARGET = dryIdx >= 0 && argv[dryIdx + 1] ? `${DS}.${argv[dryIdx + 1]}` : `${DS}.analytics.b_real_designmatrix`;

// feature SELECT list from the registry: one CAST(predicate AS INT64) AS <key> per FITTABLE feature
// (Tier-1 environment factors). Estimation/concurrence/action entries are excluded from the matrix.
// Same registry the engine's fit list and the endpoint's ACTIVE_EXPR read (single source).
const FIT_FEATURES = REG.revenue.filter((f) => f.fittable);
const FEATURE_SELECT = FIT_FEATURES.map((f) => `    CAST(${f.predicate} AS INT64) AS ${f.key}`).join(",\n");

const BUILD_SQL = `
CREATE OR REPLACE TABLE \`${TARGET}\` AS
WITH residual AS (
  SELECT
    location_id, date,
    daily_revenue    AS actual_revenue,
    expected_revenue AS expected_dow_trend,
    residual_pct
  FROM \`${RESIDUAL}\`
),
joined AS (
  SELECT
    r.location_id, r.date, r.actual_revenue, r.expected_dow_trend, r.residual_pct,
${FEATURE_SELECT}
  FROM residual r
  JOIN \`${CONTEXT}\` c USING(location_id, date)
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY date DESC) AS _rn,
    COUNT(*)     OVER (PARTITION BY location_id)                    AS _n
  FROM joined
)
SELECT * EXCEPT(_rn, _n),
  (_rn <= CAST(CEIL(0.2 * _n) AS INT64)) AS is_oos   -- most-recent 20% per venue -> holdout
FROM ranked
ORDER BY location_id, date`;

(async () => {
  console.log(`Build design matrix -> ${TARGET}`);
  console.log(`  residual: ${RESIDUAL}\n  context:  ${CONTEXT}`);
  console.log(`  features (${FIT_FEATURES.length}): ${FIT_FEATURES.map((f) => f.key).join(", ")}`);
  await bq.query({ location: "EU", query: BUILD_SQL });

  // verification summary — row universe, is_oos split, per-feature contrast
  const [rows] = await bq.query({
    location: "EU",
    query: `SELECT
      COUNT(*) n, COUNT(DISTINCT location_id) locs,
      CAST(MIN(date) AS STRING) mn, CAST(MAX(date) AS STRING) mx,
      COUNTIF(is_oos) oos,
      ${FIT_FEATURES.map((f) => `SUM(${f.key}) AS on_${f.key}`).join(", ")}
    FROM \`${TARGET}\``,
  });
  const r = rows[0];
  console.log(`\nrows=${num(r.n)}  venues=${num(r.locs)}  span=${r.mn}..${r.mx}  oos=${num(r.oos)}`);
  console.log("feature on-days:");
  for (const f of FIT_FEATURES) console.log(`  ${f.key.padEnd(20)} ${String(num(r[`on_${f.key}`])).padStart(4)}`);
  console.log("\nDONE.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
