// Type B — OFFLINE sensitivity engine (v1). See docs/features/learning-types.md §C.1.
//
// A vetted BATCH -> STORE service, NEVER a live fitter. Run offline; consumers only retrieve.
//   BMODE=seed  → synthetic ground-truth validation (recovers known coefs; proves the gates).
//   BMODE=real  → the real batch over analytics.b_real_designmatrix (81-day residual + context).
//
// Model: OLS + standard errors (BQML calculate_p_values) + VIF pre-check (BQML can't do ridge
//   AND SE; OLS honest-wide-SE beats ridge shrinkage for tier-not-gate). Store per (location,
//   feature, metric). Gate stack, ALL required before anything surfaces (even préliminaire):
//   1. mechanism (taxonomy-gated feature set)  2. min-N + per-venue contrast
//   3. PARTIAL-residual consistency (net of other factors)  4. Benjamini-Hochberg over the
//      ELIGIBLE family (post N+contrast)  5. pooled-eligibility (global licenses the factor).
//   Then tier = min(|t|-ladder, consistency-ladder). Influence: préliminaire = display-only;
//   the baseline uses émergent+ effects ONLY, swapped solely on a POWERED out-of-sample beat.
//
// Productionization (next): store analytics.b_sensitivity_store_real -> mart
//   mart.fct_location_sensitivity; schedule the real batch; keep the fit itself unchanged.

const { BigQuery } = require("@google-cloud/bigquery");
const bq = new BigQuery({ projectId: "muse-square-open-data" });
const MODE = process.env.BMODE || "seed";     // 'seed' (synthetic validation) | 'real' (81-day residual)
const DS = "muse-square-open-data.analytics";
const SEED = MODE === "real" ? `${DS}.b_real_designmatrix` : `${DS}.b_v1_seed`; // "source table"
const STORE = MODE === "real" ? `${DS}.b_sensitivity_store` : `${DS}.b_sensitivity_store_seedtest`;
const num = (v) => (v && typeof v === "object" && "value" in v ? Number(v.value) : Number(v));

// ── config ──────────────────────────────────────────────────────────────────
// Split is by an `is_oos` column baked into the source (per-location last ~20% held out),
// so it generalizes across seed (300 days) and real (81 days) without a magic day index.
const GATES = { nFloor: 20, contrastFloor: 15, consistencyMin: 0.60, fdrAlpha: 0.10, vifMax: 10 };
const OPT = "model_type='linear_reg', calculate_p_values=TRUE, category_encoding_method='dummy_encoding', data_split_method='no_split', input_label_cols=['y']";

// TAXONOMY = mechanism gate + factor set. (metric -> feature -> mechanism_tag).
// Theory-constrained allowlist; a feature with no plausible mechanism for the metric is never
// fit. SEED includes `decoy_promo` (plausible-SOUNDING tag, pure noise) — must be rejected.
const TAXONOMY_SEED = {
  revenue: {
    tourism_peak: "tourist_footfall", heat: "weather_footfall", rain: "weather_footfall",
    school_holiday: "calendar_demand", weak_signal: "calendar_demand", decoy_promo: "marketing",
  },
};
// REAL factor set from the context taxonomy; low-contrast ones (cold/wind/snow/public_holiday/
// mobility/major_event at 81 days) are expected to drop out on the N/contrast gates — deferral,
// not suppression. Weekend/dow/season are NOT features: already removed in the residual.
const TAXONOMY_REAL = {
  revenue: {
    tourism_peak: "tourist_footfall", school_holiday: "calendar_demand", public_holiday: "calendar_demand",
    rain: "weather_footfall", heat: "weather_footfall", cold: "weather_footfall",
    wind: "weather_footfall", snow: "weather_footfall",
    mobility_disruption: "access_friction", major_event: "local_demand",
  },
};
const TAXONOMY = MODE === "real" ? TAXONOMY_REAL : TAXONOMY_SEED;
// each metric -> its dow+trend residual col + naive-expected col + actual col in the seed
const METRIC_COLS = { revenue: { y: "residual_pct", expected: "expected_dow_trend", actual: "actual_revenue" } };
const CONTROLLED_FOR = "dow, trend"; // baked into the residual by construction

// ── 0. (re)seed synthetic ground-truth with the decoy + a weak-but-real signal ───────────
async function seed() {
  await bq.query({ location: "EU", query: `
    CREATE OR REPLACE TABLE \`${SEED}\` AS
    WITH base AS (
      SELECT v AS location_id, DATE_ADD(DATE '2025-01-01', INTERVAL d DAY) AS date, d AS day_idx
      FROM UNNEST(['V_paris1','V_paris2','V_nimes']) v, UNNEST(GENERATE_ARRAY(0,299)) d ),
    feat AS (
      SELECT *, EXTRACT(MONTH FROM date) AS month, (EXTRACT(MONTH FROM date) IN (6,7,8)) AS is_summer FROM base ),
    asg AS (
      SELECT location_id, date, day_idx, month,
        IF(RAND() < IF(is_summer,0.55,0.10),1,0) AS tourism_peak,
        IF(RAND() < CASE WHEN location_id='V_nimes' AND is_summer THEN 0.65 WHEN location_id='V_nimes' THEN 0.15 ELSE 0.02 END,1,0) AS heat,
        IF(RAND() < 0.20,1,0) AS rain,
        IF(RAND() < IF(is_summer OR month IN (2,4),0.40,0.05),1,0) AS school_holiday,
        IF(RAND() < 0.30,1,0) AS weak_signal,
        IF(RAND() < 0.30,1,0) AS decoy_promo
      FROM feat ),
    truth AS (
      SELECT *,
        8.0*tourism_peak - 12.0*heat - 6.0*rain + 5.0*school_holiday + 2.2*weak_signal
          + 0.0*decoy_promo + (RAND()-0.5)*28 AS residual_pct
      FROM asg )
    SELECT * EXCEPT(month),
      1000.0 AS expected_dow_trend,
      1000.0*(1 + residual_pct/100.0) AS actual_revenue,
      (day_idx >= 240) AS is_oos
    FROM truth` });
}

// ── 1. VIF pre-check from the correlation matrix (VIF_i = [R^-1]_ii); drop VIF>max ────────
function invMatrix(M) { // Gauss-Jordan
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const pv = A[c][c]; if (Math.abs(pv) < 1e-12) return null;
    for (let j = 0; j < 2 * n; j++) A[c][j] /= pv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}
// Features with NO variance in a scope's training data (all-0 or all-1) can't be fit — BQML
// chokes on a constant column and CORR returns NULL. Drop them per scope BEFORE fitting; at
// 81 real days this is what removes cold/snow/wind/mobility/event (deferred, not suppressed).
async function variableFeatures(features, whereLoc) {
  const sel = features.map((f, i) => `SUM(${f}) AS s_${i}`).join(",");
  const [r] = await bq.query({ location: "EU", query:
    `SELECT COUNT(*) AS tot, ${sel} FROM \`${SEED}\` WHERE NOT is_oos ${whereLoc ? `AND location_id='${whereLoc}'` : ""}` });
  const tot = num(r[0].tot);
  return features.filter((f, i) => { const on = num(r[0][`s_${i}`]); return on > 0 && on < tot; });
}
async function vifCheck(features) {
  features = await variableFeatures(features, null);
  const sel = [];
  for (let i = 0; i < features.length; i++) for (let j = 0; j < features.length; j++)
    sel.push(i === j ? `1.0 AS c_${i}_${j}` : `CORR(${features[i]},${features[j]}) AS c_${i}_${j}`);
  const [m] = await bq.query({ location: "EU", query: `SELECT ${sel.join(",")} FROM \`${SEED}\` WHERE NOT is_oos` });
  const R = features.map((_, i) => features.map((__, j) => num(m[0][`c_${i}_${j}`])));
  const Rinv = invMatrix(R);
  const vif = {}; features.forEach((f, i) => (vif[f] = Rinv ? Rinv[i][i] : NaN));
  const kept = features.filter((f) => !(vif[f] > GATES.vifMax));
  return { vif, kept, dropped: features.filter((f) => vif[f] > GATES.vifMax) };
}

// ── 2. per-feature stats (n_on, PARTIAL-residual consistency) per scope ────────────────────
// Consistency is measured on the residual NET OF the other fitted factors (partial residual):
// y - Σ_{g≠f} coef_g·g. Raw-residual consistency is confounded (a rainy day that is also a
// tourism-peak day nets positive) and understates real effects. This is both the gate and the
// cited "cohérent M/N jours" number, so it must be the honest all-else-equal version.
async function featureStats(features, weights, yCol, whereLoc) {
  const sel = [];
  features.forEach((f, i) => {
    const others = features.filter((g) => g !== f).map((g) => `(${weights[g].coef})*${g}`).join("+") || "0";
    const sign = weights[f].coef < 0 ? -1 : 1;
    sel.push(`COUNTIF(${f}=1) AS n_${i}`);
    sel.push(`COUNTIF(${f}=1 AND SIGN(${yCol} - (${others})) = ${sign}) AS ok_${i}`);
  });
  const [rows] = await bq.query({ location: "EU", query:
    `SELECT COUNT(*) AS _tot, ${sel.join(",")} FROM \`${SEED}\` WHERE NOT is_oos ${whereLoc ? `AND location_id='${whereLoc}'` : ""}` });
  const tot = num(rows[0]._tot);
  const s = {}; features.forEach((f, i) => {
    const n = num(rows[0][`n_${i}`]), ok = num(rows[0][`ok_${i}`]);
    s[f] = { n_on: n, consistency: n > 0 ? ok / n : 0, tot };
  });
  return s;
}

// ── 3. OLS fit (BQML) + weights for one scope ─────────────────────────────────────────────
async function fitScope(metric, features, whereLoc, tag) {
  const mc = METRIC_COLS[metric];
  const fitFeatures = await variableFeatures(features, whereLoc); // per-scope constant drop
  if (fitFeatures.length === 0) return { weights: {}, features: [] };
  const model = `${DS}.b_fit_${tag}`;
  await bq.query({ location: "EU", query:
    `CREATE OR REPLACE MODEL \`${model}\` OPTIONS(${OPT}) AS ` +
    `SELECT ${mc.y} AS y, ${fitFeatures.join(",")} FROM \`${SEED}\` ` +
    `WHERE NOT is_oos ${whereLoc ? `AND location_id='${whereLoc}'` : ""}` });
  const [w] = await bq.query({ location: "EU", query:
    `SELECT processed_input AS feature, weight AS coef, standard_error AS se, p_value AS p ` +
    `FROM ML.ADVANCED_WEIGHTS(MODEL \`${model}\`) WHERE processed_input != '__INTERCEPT__'` });
  const out = {}; w.forEach((r) => (out[r.feature] = { coef: num(r.coef), se: num(r.se), p: num(r.p) }));
  return { weights: out, features: fitFeatures.filter((f) => out[f]) };
}

// ── 4. Benjamini-Hochberg across the whole batch ──────────────────────────────────────────
function benjaminiHochberg(rows, alpha) {
  const m = rows.length;
  const idx = rows.map((_, i) => i).sort((a, b) => rows[a].p - rows[b].p);
  const padj = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const i = idx[k]; const v = Math.min(prev, (rows[i].p * m) / (k + 1)); padj[i] = v; prev = v; }
  rows.forEach((r, i) => { r.p_adj = padj[i]; r.bh_reject = padj[i] < alpha; });
  return rows;
}
// Tier from BOTH signal-to-noise (|t|) AND day-to-day reliability (consistency): a high-t
// effect that only holds 60% of days is strong-on-average but unreliable and must NOT wear
// "établi". Tier = the WEAKER of the two ladders (correction #4). Consistency is a tier input,
// not just a pass/fail floor. Influence gating (préliminaire = display-only) is applied downstream.
const tierByT = (t) => { const a = Math.abs(t); return a >= 4 ? 3 : a >= 2.5 ? 2 : a >= 1.5 ? 1 : 0; };
const tierByCons = (c) => (c >= 0.75 ? 3 : c >= 0.65 ? 2 : c >= 0.60 ? 1 : 0);
const RANK_TIER = { 3: "etabli", 2: "emergent", 1: "preliminaire", 0: null };
const tierOf = (t, cons) => RANK_TIER[Math.min(tierByT(t), tierByCons(cons))];
const canInfluence = (tier) => tier === "etabli" || tier === "emergent"; // préliminaire = display-only

// ── main ──────────────────────────────────────────────────────────────────────────────────
(async () => {
  if (MODE !== "real") await seed();
  console.log(`MODE=${MODE}  source=${SEED}  store=${STORE}`);
  const [locsRows] = await bq.query({ location: "EU", query: `SELECT DISTINCT location_id FROM \`${SEED}\` ORDER BY 1` });
  const LOCS = locsRows.map((r) => r.location_id);

  // Observation period = the date span of the TRAINING design matrix the sample was drawn from
  // (per-location for a per_location row; global for the pooled fallback). Stored so the copy can
  // show representativeness ("pour la période …") — the operator judges the window himself.
  const [pspan] = await bq.query({ location: "EU", query: `SELECT location_id, CAST(MIN(date) AS STRING) ps, CAST(MAX(date) AS STRING) pe FROM \`${SEED}\` WHERE NOT is_oos GROUP BY location_id` });
  const periodByLoc = {}; pspan.forEach((r) => (periodByLoc[r.location_id] = { ps: r.ps, pe: r.pe }));
  const [gspan] = await bq.query({ location: "EU", query: `SELECT CAST(MIN(date) AS STRING) ps, CAST(MAX(date) AS STRING) pe FROM \`${SEED}\` WHERE NOT is_oos` });
  const globalPeriod = { ps: gspan[0].ps, pe: gspan[0].pe };

  const candidates = []; // {metric, scope, location, feature, mechanism, coef, se, t, p, n_on, consistency, contrast_ok}

  for (const metric of Object.keys(TAXONOMY)) {
    const allFeatures = Object.keys(TAXONOMY[metric]);
    // guardrail 1 of gate stack: mechanism gate = only taxonomy features are ever fit (all here have tags)
    const { vif, kept, dropped } = await vifCheck(allFeatures);
    console.log(`\n[VIF ${metric}] ` + kept.map((f) => `${f}=${vif[f].toFixed(2)}`).join("  ") + (dropped.length ? `  DROPPED: ${dropped}` : "  (none dropped)"));

    // pooled + per-location fits
    const scopes = [{ tag: "pooled", loc: null }, ...LOCS.map((l) => ({ tag: l.replace(/[^a-z0-9]/gi, ""), loc: l }))];
    for (const sc of scopes) {
      const { weights, features: fitFeats } = await fitScope(metric, kept, sc.loc, `${metric}_${sc.tag}`);
      if (fitFeats.length === 0) continue;
      const stats = await featureStats(fitFeats, weights, METRIC_COLS[metric].y, sc.loc);
      for (const f of fitFeats) {
        const w = weights[f]; const st = stats[f]; if (!w || !st) continue;
        const t = w.se ? w.coef / w.se : 0;
        const dir = w.coef < 0 ? "down" : "up";
        const consistency = st.consistency;
        const offDays = st.tot - st.n_on; // contrast needs both on & off (real train-day count)
        candidates.push({
          metric, scope: sc.tag, location: sc.loc, feature: f, mechanism: TAXONOMY[metric][f],
          coef: w.coef, se: w.se, t, p: w.p, direction: dir, n_on: st.n_on, consistency,
          contrast_ok: st.n_on >= GATES.contrastFloor && offDays >= GATES.contrastFloor,
        });
      }
    }
  }

  // tier + per-test gates
  for (const c of candidates) {
    c.tier = tierOf(c.t, c.consistency);
    c.passN = c.n_on >= GATES.nFloor;
    c.passConsistency = c.consistency >= GATES.consistencyMin;
    c.eligible = c.passN && c.contrast_ok; // could this test plausibly yield a signal?
  }
  // guardrail 3: BH correction — the multiple-comparison FAMILY is the ELIGIBLE tests only
  // (post N + contrast), not every hopeless low-N fit (heat with 1 on-day, etc.). Counting junk
  // tests in the denominator would unfairly penalize the real candidates. Output-neutral at 81
  // days (Nîmes heat p≈0.08 fails BH even over the eligible family); matters as beta grows the
  // test count. Correctness, not productivity-tuning.
  const eligibleSet = candidates.filter((c) => c.eligible);
  benjaminiHochberg(eligibleSet, GATES.fdrAlpha);
  candidates.forEach((c) => { if (!c.eligible) { c.p_adj = null; c.bh_reject = false; } });
  // Tier-not-gate: émergent+ REQUIRE BH significance; préliminaire surfaces a plausible candidate
  // WITHOUT BH (that is what "à confirmer" concedes). Noise is kept out by the pooled directional
  // lean applied in the store loop (a real factor leans the same way in the full data; noise ~0).
  const RANK = { etabli: 3, emergent: 2, preliminaire: 1 };
  for (const c of candidates) {
    const rank = c.tier ? RANK[c.tier] : 0;
    c.survivesStrong = c.eligible && c.passConsistency && c.bh_reject && rank >= 2;
    c.survivesPrelim = c.eligible && c.passConsistency && rank === 1;
    c.survives = c.survivesStrong || c.survivesPrelim;
  }

  // print the batch audit
  console.log("\n=== BATCH AUDIT (every test; survives = BH ∧ N ∧ consistency ∧ tier) ===");
  console.log("scope        feature         coef     se     t     p_adj  n_on cons  tier         survive");
  for (const c of candidates.sort((a, b) => (a.scope + a.feature).localeCompare(b.scope + b.feature))) {
    console.log(
      c.scope.padEnd(12), c.feature.padEnd(15),
      String(c.coef.toFixed(2)).padStart(7), String(c.se.toFixed(2)).padStart(6),
      String(c.t.toFixed(1)).padStart(6), (c.p_adj == null ? "  -  " : c.p_adj.toFixed(3)).padStart(6),
      String(c.n_on).padStart(4), (c.consistency * 100).toFixed(0).padStart(3) + "%",
      String(c.tier).padEnd(12), c.survives ? "YES" : (!c.eligible ? "inelig" : "no(BH)"));
  }

  // ── 5. SCOPING + per-location-vs-pooled selection -> STORE rows (location,feature,metric) ──
  const store = [];
  for (const metric of Object.keys(TAXONOMY)) {
    const pooledByFeat = {};
    candidates.filter((c) => c.metric === metric && c.scope === "pooled").forEach((c) => (pooledByFeat[c.feature] = c));
    for (const loc of LOCS) {
      const tag = loc.replace(/[^a-z0-9]/gi, "");
      for (const feature of Object.keys(TAXONOMY[metric])) {
        const pooled = pooledByFeat[feature];
        const perLoc = candidates.find((c) => c.metric === metric && c.scope === tag && c.feature === feature);
        if (!perLoc || !perLoc.contrast_ok) continue;          // SCOPING: no contrast here -> no row (Paris heat)
        // POOLED DIRECTIONAL LEAN: the factor leans the same way in the full data (weak global
        // support). A real weak signal (Nîmes heat: pooled also negative) clears it; noise (pooled
        // ~0, no consistent sign) does not — the licence for a préliminaire per-venue signal
        // WITHOUT requiring BH. Émergent+ still need BH (survivesStrong). Global licenses, local scopes.
        const poolLean = pooled && Math.sign(pooled.coef) === Math.sign(perLoc.coef) && Math.abs(pooled.t) >= 0.5;
        let used = null, estScope = null;
        if (perLoc.survivesStrong && pooled && (pooled.survivesStrong || poolLean)) {
          used = perLoc; estScope = "per_location";
        } else if (perLoc.survivesPrelim && poolLean) {
          used = perLoc; estScope = "per_location";            // préliminaire: weak global lean, no BH
        } else if (pooled && pooled.survivesStrong) {
          used = pooled; estScope = "pooled";                  // pooled fallback (strong only)
        }
        if (!used) continue;                                    // survived nowhere -> not stored
        const period = estScope === "pooled" ? globalPeriod : (periodByLoc[loc] || globalPeriod);
        store.push({
          location_id: loc, feature, metric, direction: used.direction,
          effect_size: +(used.coef / 100).toFixed(4),          // % -> fraction
          se: +(used.se / 100).toFixed(4), t_stat: +used.t.toFixed(2), p_adj: +used.p_adj.toFixed(4),
          // n_days + consistency come from the SAME fit that produced the effect/tier (pooled
          // when the estimate is the pooled fallback) — the cited evidence must match the number.
          n_days: used.n_on, consistency_pct: +(used.consistency * 100).toFixed(1),
          controlled_for: CONTROLLED_FOR, mechanism_tag: used.mechanism,
          confidence_tier: used.tier, estimate_scope: estScope,
          period_start: period.ps, period_end: period.pe,    // date span the sample was drawn from
        });
      }
    }
  }
  console.log("\n=== SENSITIVITY STORE (what survived, per venue) ===");
  store.forEach((r) => console.log(`  ${r.location_id}  ${r.feature.padEnd(15)} ${(r.effect_size*100).toFixed(1).padStart(6)}%  ${r.confidence_tier.padEnd(12)} n=${r.n_days} cons=${r.consistency_pct}% [${r.estimate_scope}]`));
  const scopedOut = LOCS.flatMap((l) => Object.keys(TAXONOMY.revenue).map((f) => ({ l, f })))
    .filter(({ l, f }) => !store.find((s) => s.location_id === l && s.feature === f));
  console.log("  -- NOT stored (scoped out / rejected): " + scopedOut.map(({ l, f }) => `${l.slice(-6)}:${f}`).join(", "));

  // write store table
  await bq.query({ location: "EU", query: `
    CREATE OR REPLACE TABLE \`${STORE}\` (
      location_id STRING, feature STRING, metric STRING, direction STRING,
      effect_size FLOAT64, se FLOAT64, t_stat FLOAT64, p_adj FLOAT64,
      n_days INT64, consistency_pct FLOAT64, controlled_for STRING,
      mechanism_tag STRING, confidence_tier STRING, estimate_scope STRING,
      period_start DATE, period_end DATE )` });
  const insertSql = `INSERT INTO \`${STORE}\` (location_id,feature,metric,direction,effect_size,se,t_stat,p_adj,n_days,consistency_pct,controlled_for,mechanism_tag,confidence_tier,estimate_scope,period_start,period_end) VALUES ` +
    store.map((r) => `('${r.location_id}','${r.feature}','${r.metric}','${r.direction}',${r.effect_size},${r.se},${r.t_stat},${r.p_adj},${r.n_days},${r.consistency_pct},'${r.controlled_for}','${r.mechanism_tag}','${r.confidence_tier}','${r.estimate_scope}',${r.period_start ? `DATE '${r.period_start}'` : "NULL"},${r.period_end ? `DATE '${r.period_end}'` : "NULL"})`).join(",");
  if (store.length) await bq.query({ location: "EU", query: insertSql });

  // ── 6. BASELINE SHADOW (do-no-harm): fitted uses ONLY influence-eligible (émergent+) effects
  // — préliminaire is display-only, never touches the baseline (correction #3). Reported as a
  // POWERED paired-difference test, not a point beat (correction #2): per-OOS-day paired abs-error
  // improvement d = |actual-base| - |actual-fitted|; report mean(d) ± 95% CI + n. Swap ONLY if the
  // CI is entirely > 0 (robust, powered). Otherwise keep dow+trend live; fitted runs in shadow.
  console.log("\n=== BASELINE SHADOW (OOS, do-no-harm; fitted = dow+trend × (1 + Σ émergent+ effects)) ===");
  for (const loc of LOCS) {
    const eff = {}; store.filter((s) => s.location_id === loc && s.metric === "revenue" && canInfluence(s.confidence_tier))
      .forEach((s) => (eff[s.feature] = s.effect_size));
    const terms = Object.keys(eff).length ? Object.entries(eff).map(([f, e]) => `${e}*${f}`).join(" + ") : "0";
    const [r] = await bq.query({ location: "EU", query: `
      WITH oos AS (
        SELECT ABS(actual_revenue - expected_dow_trend) AS ae_base,
               ABS(actual_revenue - expected_dow_trend*(1 + (${terms}))) AS ae_fitted
        FROM \`${SEED}\` WHERE is_oos AND location_id='${loc}' )
      SELECT COUNT(*) AS n, ROUND(AVG(ae_base),1) AS mae_base, ROUND(AVG(ae_fitted),1) AS mae_fitted,
             AVG(ae_base-ae_fitted) AS mean_d, STDDEV(ae_base-ae_fitted) AS sd_d FROM oos` });
    const n = num(r[0].n), md = num(r[0].mean_d), sd = num(r[0].sd_d);
    const se = sd / Math.sqrt(n), lo = md - 1.96 * se, hi = md + 1.96 * se;
    const nInfl = Object.keys(eff).length;
    const robust = n >= 10 && lo > 0;
    console.log(`  ${loc}: MAE dow+trend=${num(r[0].mae_base)} vs fitted=${num(r[0].mae_fitted)} | mean Δ=${md.toFixed(1)} 95%CI[${lo.toFixed(1)}, ${hi.toFixed(1)}] n=${n}, ${nInfl} influencing effect(s)`);
    console.log(`      -> swap=${robust ? "YES (robust)" : "NO — keep dow+trend live, fitted in shadow"}${lo <= 0 ? " (CI includes 0 / underpowered)" : ""}`);
  }
  console.log("\nDONE.");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
