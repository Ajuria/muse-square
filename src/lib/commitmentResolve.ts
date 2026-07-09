// Resolution computation for Engagement commitments — the statistical core.
// Pure-ish: given a commitment snapshot + the residual/context marts, returns the
// patch readMergeWrite() should write. Kept separate from the cron HTTP handler
// so it can be unit-tested against live mart rows.
//
// Carries the FULL locked verdict logic:
//   - window metric = Σactual vs Σexpected (revenue-weighted pct), NOT mean of pcts
//   - window_residual_z = z_raw / √VIF, VIF from measured per-location ρ (floor 0.40);
//     z_raw, ρ, VIF stored as provenance
//   - asymmetric confound gate: material_holiday_share ≥ 0.5 flips a provisional
//     MET → confounded; a miss is never gated. ctx_material_confound is recorded
//     regardless of verdict (present-or-not, not outcome).
//   - pending (incomplete within grace) vs expired (incomplete past window_end+30d)
//   - context snapshot at WINDOW level: ANY-day holiday, worst-day weather (MIN),
//     MAX event/tourism — not a single same-date join
//   - day_of resolves against the mart's business day (Europe/Paris date of
//     created_at), NOT the UTC-anchored window_start. If no residual row exists for
//     that day, it goes pending — it NEVER resolves against an adjacent/wrong day.

import { GRACE_DAYS, MATERIAL_SHARE, RHO_FLOOR, WINDOW_FACTOR_SHARE } from "./commitmentConstants";
import type { CommitmentRow } from "./actionCommitments";
import featureRegistry from "./sensitivityFeatures.json";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const RESIDUAL = `${BQ_PROJECT}.mart.fct_client_day_residual`;
const CTX = `${BQ_PROJECT}.mart.fct_location_context_features_daily`;
// window_active_factors is computed against the registry's DECLARED context_table with the SAME
// single-source predicates the endpoint's ACTIVE_EXPR uses — so "ran under heat" (here) and "today is
// heat" (endpoint) are one definition against one mart (verified identical to context_features_daily).
const FACTOR_CTX = `${BQ_PROJECT}.${(featureRegistry as any).context_table}`;
const FIT_FACTORS = (featureRegistry.revenue as Array<{ key: string; fittable?: boolean; predicate?: string }>)
  .filter((f) => f.fittable && f.predicate);

export interface ResolveResult {
  patch: Partial<CommitmentRow>;
  note: string;
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// Europe/Paris calendar date ('YYYY-MM-DD') of an instant — the mart's grain.
function parisDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}
function dateArray(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
// Variance-inflation factor for a sum of n AR(1)-ish terms with lag-1 corr rho.
function vif(rho: number, n: number): number {
  if (n <= 1) return 1;
  let s = 0;
  for (let k = 1; k <= n - 1; k++) s += (1 - k / n) * Math.pow(rho, k);
  return 1 + 2 * s;
}

export async function resolveCommitment(
  bq: any,
  snap: CommitmentRow,
  nowIso: string,
): Promise<ResolveResult> {
  const nowDate = parisDate(nowIso);
  const expectedCount = Number(snap.window_days_expected);

  // Resolution dates. day_of -> the Paris business day of creation (grain-safe);
  // 7d/14d -> the stored window range (UTC-anchored; boundary dilutes into the sum).
  const dates = snap.window_kind === "day_of"
    ? [parisDate(snap.created_at)]
    : dateArray(String(snap.window_start), String(snap.window_end));
  const minDate = dates[0], maxDate = dates[dates.length - 1];

  // 1. Residual rows over the window. Contiguous window -> BETWEEN with bq.date()
  //    bounds (NOT a string array + IN UNNEST — that hits the silent DATE/STRING
  //    0-rows trap). minDate==maxDate for day_of.
  const [rrows] = await bq.query({
    query:
      `SELECT CAST(date AS STRING) AS date, daily_revenue, expected_revenue, residual_z ` +
      `FROM \`${RESIDUAL}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
    params: { loc: snap.location_id, minD: bq.date(minDate), maxD: bq.date(maxDate) },
    location: "EU",
  });

  const coverage = rrows.length;

  // 2. Incomplete → pending (within grace) or expired (past window_end + grace).
  if (coverage < expectedCount) {
    const past = daysBetween(String(snap.window_end), nowDate);
    const status = past > GRACE_DAYS ? "expired" : "pending";
    return {
      patch: {
        status,
        window_days_resolved: coverage,
        resolved_at: status === "expired" ? nowIso : null,
      },
      note: `${status} — coverage ${coverage}/${expectedCount}, ${past}d past window_end`,
    };
  }

  // 3. Complete → window metric (revenue-weighted).
  let sumAct = 0, sumExp = 0;
  const expByDate: Record<string, number> = {};
  const perDay = rrows.map((r: any) => {
    const rev = Number(flat(r.daily_revenue));
    const exp = Number(flat(r.expected_revenue));
    const z = Number(flat(r.residual_z));
    sumAct += rev; sumExp += exp; expByDate[String(flat(r.date))] = exp;
    return { resid: rev - exp, z };
  });
  const residAbs = sumAct - sumExp;
  const windowResidualPct = sumExp !== 0 ? (residAbs / sumExp) * 100 : 0;

  // Per-day sigma = |resid|/|z| (recoverable); impute median for near-zero-z days.
  const computable = perDay
    .filter((d: any) => Math.abs(d.z) >= 0.05)
    .map((d: any) => Math.abs(d.resid) / Math.abs(d.z))
    .sort((a: number, b: number) => a - b);
  const medSigma = computable.length ? computable[Math.floor(computable.length / 2)] : 0;
  let varIndep = 0;
  for (const d of perDay) {
    const s = Math.abs(d.z) >= 0.05 ? Math.abs(d.resid) / Math.abs(d.z) : medSigma;
    varIndep += s * s;
  }
  const zRaw = varIndep > 0 ? residAbs / Math.sqrt(varIndep) : 0;

  // 4. Autocorrelation correction — measured per-location ρ, floored.
  const [rhoRows] = await bq.query({
    query:
      `WITH s AS (SELECT residual_z, LAG(residual_z) OVER (PARTITION BY location_id ORDER BY date) prev ` +
      `FROM \`${RESIDUAL}\` WHERE location_id=@loc) ` +
      `SELECT CORR(residual_z, prev) AS rho FROM s WHERE prev IS NOT NULL`,
    params: { loc: snap.location_id },
    location: "EU",
  });
  let rho = rhoRows[0] && rhoRows[0].rho != null ? Number(flat(rhoRows[0].rho)) : RHO_FLOOR;
  if (!(rho >= RHO_FLOOR)) rho = RHO_FLOOR; // also catches NaN
  const vifVal = vif(rho, expectedCount);
  const zCorr = zRaw / Math.sqrt(vifVal);

  // 5. Window-level context snapshot.
  const [crows] = await bq.query({
    query:
      `SELECT CAST(date AS STRING) AS date, is_school_holiday_flag, impact_weather_pct, ` +
      `event_count_region, tourism_index_region ` +
      `FROM \`${CTX}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
    params: { loc: snap.location_id, minD: bq.date(minDate), maxD: bq.date(maxDate) },
    location: "EU",
  });
  let anyHol = false, holidayDays = 0, holidayExp = 0;
  let worstWeather: number | null = null, maxEvent: number | null = null, maxTour: number | null = null;
  for (const c of crows) {
    const d = String(flat(c.date));
    if (flat(c.is_school_holiday_flag)) { anyHol = true; holidayDays++; holidayExp += expByDate[d] ?? 0; }
    const w = flat(c.impact_weather_pct);
    if (w != null) worstWeather = worstWeather == null ? Number(w) : Math.min(worstWeather, Number(w));
    const e = flat(c.event_count_region);
    if (e != null) maxEvent = maxEvent == null ? Number(e) : Math.max(maxEvent, Number(e));
    const t = flat(c.tourism_index_region);
    if (t != null) maxTour = maxTour == null ? Number(t) : Math.max(maxTour, Number(t));
  }
  const materialShare = sumExp !== 0 ? holidayExp / sumExp : 0;
  const ctxMaterialConfound = materialShare >= MATERIAL_SHARE;

  // 5b. window_active_factors — the registry factors the action ACTUALLY ran under (what conditions,
  // not why the card fired). Reuse the single-source registry predicates against its declared
  // context_table; keep factors active on >= WINDOW_FACTOR_SHARE of the window's context days. Stored
  // CSV of comma-free registry keys (dbt SPLIT()s it to ARRAY<STRING>); null when none clear the bar.
  const factorSel = FIT_FACTORS.map((f, i) => `COUNTIF(${f.predicate}) AS on_${i}`).join(", ");
  const [frows] = await bq.query({
    query: `SELECT COUNT(*) AS tot, ${factorSel} FROM \`${FACTOR_CTX}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
    params: { loc: snap.location_id, minD: bq.date(minDate), maxD: bq.date(maxDate) },
    location: "EU",
  });
  const totFactorDays = Number(flat(frows[0]?.tot)) || 0;
  const activeFactors = totFactorDays
    ? FIT_FACTORS.filter((f, i) => (Number(flat(frows[0][`on_${i}`])) || 0) / totFactorDays >= WINDOW_FACTOR_SHARE).map((f) => f.key)
    : [];
  const windowActiveFactors = activeFactors.length ? activeFactors.join(",") : null;

  // 6. Provisional verdict + asymmetric gate (mets only).
  const provisional = zCorr >= Number(snap.threshold_value) ? "met" : "missed";
  const verdict = provisional === "met" && materialShare >= MATERIAL_SHARE ? "confounded" : provisional;

  return {
    patch: {
      status: "resolved",
      verdict,
      resolved_at: nowIso,
      window_actual_revenue: round2(sumAct),
      window_expected_revenue: round2(sumExp),
      window_residual_pct: round2(windowResidualPct),
      window_residual_z: round3(zCorr),
      window_residual_z_raw: round3(zRaw),
      applied_rho: round3(rho),
      applied_vif: round3(vifVal),
      window_days_resolved: coverage,
      ctx_any_school_holiday: anyHol,
      ctx_school_holiday_days: holidayDays,
      material_holiday_share: round3(materialShare),
      ctx_worst_weather_impact_pct: worstWeather != null ? round2(worstWeather) : null,
      ctx_max_event_count: maxEvent != null ? Math.round(maxEvent) : null,
      ctx_max_tourism_index: maxTour != null ? round3(maxTour) : null,
      ctx_material_confound: ctxMaterialConfound,
      window_active_factors: windowActiveFactors,
    },
    note: `${verdict} — z=${zCorr.toFixed(2)} (raw ${zRaw.toFixed(2)}, ρ=${rho.toFixed(2)}, vif=${vifVal.toFixed(2)}), share=${materialShare.toFixed(2)}`,
  };
}
