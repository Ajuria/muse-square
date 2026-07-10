// Évolution endpoint extras: §2d holiday-norm, named context (②), learning
// provenance, rule-based advice (③). z-FREE and FRENCH-FREE — advice returns
// KEYS into commitmentCopy.ts; the page renders the words.
//
// Context queries are LIFTED from sales-report.ts (range-based, BETWEEN @s AND @e)
// so named context stays consistent with the report — Météo-France/OpenAgenda/INSEE.

import { getActionRollup } from "./dayContext";
import { frCountry } from "./contextCopy";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// Same curated tourist-origin whitelist the report uses.
const TOURIST_COUNTRIES = [
  "Germany", "United Kingdom", "Netherlands", "Belgium", "Spain", "Italy",
  "Switzerland", "Portugal", "United States", "Ireland", "Denmark", "Sweden",
  "Luxembourg", "Austria", "Norway",
];

export interface EvolutionExtras {
  holiday_norm: { pct: number; days: number } | null; // §2d — null when no holiday history
  context: {
    school_days: number; mobility_days: number; tourism_status: string | null;
    named_events: { label: string; days: number }[];
    foreign_visitors: string[];
    weather_assoc: { cool_avg: number | null; cool_n: number; mild_avg: number | null; mild_n: number; corr_rain: number | null } | null;
  };
  // Type A track record for this action_type (fct_location_commitment_learning, source='commitment').
  // null unless has_sufficient_sample (>=5 done). Operator track record — "N fois sur M", never a rate.
  provenance: { history_days: number; track_record: { beat: number; done: number } | null };
  advice: { key: string; arg?: number; track?: { beat: number; done: number }; prefill?: { committed_action_text: string | null; origin_action_type: string | null; window_kind: string } }[];
}

// snap = full CommitmentRow (has verdict, ctx_*, action_done_status, committed_action_text, origin_action_type)
export async function assembleEvolutionExtras(bq: any, snap: any, asOfDate: string): Promise<EvolutionExtras> {
  const loc = snap.location_id;
  const s = String(snap.window_start), e = String(snap.window_end);

  const [normRows, ctxRows, evRows, foreignRows, assocRows, histRows, learnRows] = await Promise.all([
    // §2d — holiday-norm: AVG residual_pct on this location's holiday days learned TO DATE.
    // Always computed (works for OPEN commitments too, whose ctx_any_school_holiday isn't set
    // yet); the PAGE surfaces it in ① only when the window overlaps holidays (school_days > 0).
    bq.query({
      query:
        `SELECT ROUND(AVG(r.residual_pct),1) AS pct, COUNT(*) AS days ` +
        `FROM \`${PROJECT}.mart.fct_client_day_residual\` r ` +
        `JOIN \`${PROJECT}.mart.fct_location_context_features_daily\` c ` +
        `ON r.location_id=c.location_id AND r.date=c.date ` +
        `WHERE r.location_id=@loc AND c.is_school_holiday_flag AND c.date <= @asof`,
      params: { loc, asof: bq.date(asOfDate) }, location: "EU",
    }),
    // context scalars over the window (lifted from sales-report)
    bq.query({
      query:
        `SELECT COUNTIF(is_school_holiday_flag) AS school_days, ` +
        `COUNTIF(mobility_disruption_flag_region) AS mobility_days, ` +
        `APPROX_TOP_COUNT(tourism_status_region,1)[OFFSET(0)].value AS tourism_status ` +
        `FROM \`${PROJECT}.mart.fct_location_context_daily\` WHERE location_id=@loc AND date BETWEEN @s AND @e`,
      params: { loc, s: bq.date(s), e: bq.date(e) }, location: "EU",
    }),
    // named nearby events (5km), most present first
    bq.query({
      query:
        `SELECT ev.event_label AS label, COUNT(DISTINCT t.date) AS days ` +
        `FROM \`${PROJECT}.mart.fct_location_events_topn_daily\` t, UNNEST(t.top_events_5km) ev ` +
        `WHERE t.location_id=@loc AND t.date BETWEEN @s AND @e GROUP BY 1 ORDER BY days DESC LIMIT 4`,
      params: { loc, s: bq.date(s), e: bq.date(e) }, location: "EU",
    }),
    // foreign visitors (whitelisted tourist origins)
    bq.query({
      query:
        `SELECT c.country_name_en AS country, COUNT(DISTINCT date) AS days ` +
        `FROM \`${PROJECT}.mart.fct_foreign_tourism_context_daily\` t, UNNEST(t.countries_on_school_holiday) c ` +
        `WHERE date BETWEEN @s AND @e AND c.country_name_en IN UNNEST(@tc) GROUP BY 1 ORDER BY days DESC LIMIT 4`,
      params: { loc, s: bq.date(s), e: bq.date(e), tc: TOURIST_COUNTRIES }, location: "EU",
    }),
    // weather association: cool/rainy vs mild days revenue + correlation. Scoped to
    // HISTORY (last 90 days ending asOf), NOT the short window — a robust measured
    // impact ("your rainy days vs mild days"), the same history-based logic as §2d.
    bq.query({
      query:
        `WITH day AS (SELECT transaction_date d, SUM(daily_revenue) rev FROM \`${PROJECT}.mart.fct_client_daily_performance\` ` +
        `WHERE location_id=@loc AND transaction_date <= @asof AND transaction_date > DATE_SUB(@asof, INTERVAL 90 DAY) GROUP BY 1), ` +
        `j AS (SELECT day.rev rev, c.lvl_rain rain, c.lvl_heat heat FROM day ` +
        `LEFT JOIN \`${PROJECT}.mart.fct_location_context_daily\` c ON c.location_id=@loc AND c.date=day.d) ` +
        `SELECT ROUND(AVG(IF(rain>=2, rev, NULL)),0) AS cool_avg, COUNTIF(rain>=2) AS cool_n, ` +
        `ROUND(AVG(IF(NOT COALESCE(rain>=2,false), rev, NULL)),0) AS mild_avg, COUNTIF(NOT COALESCE(rain>=2,false)) AS mild_n, ` +
        `ROUND(CORR(CAST(rain AS FLOAT64), rev),2) AS corr_rain FROM j`,
      params: { loc, asof: bq.date(asOfDate) }, location: "EU",
    }),
    // provenance: how many days of history the "habituel" was learned on
    bq.query({
      query: `SELECT COUNT(DISTINCT date) AS history_days FROM \`${PROJECT}.mart.fct_client_day_residual\` WHERE location_id=@loc AND date <= @asof`,
      params: { loc, asof: bq.date(asOfDate) }, location: "EU",
    }),
    // Type A action_type track record — via the brain's scoped sub-accessor (the ONE outcomes read,
    // pre-explode commitment-grain, no double-count). Not the full assemble — évolution ③ only needs
    // the rollup. Factor-less commitments still count (they only drop from the factor-level learning);
    // Tier-4 is the factor view. min-N gate below mirrors has_sufficient_sample.
    getActionRollup(bq, loc).catch(() => ({} as Record<string, { beat: number; done: number }>)),
  ]);

  const nr = (normRows?.[0] || [])[0];
  const holiday_norm = nr && nr.pct != null ? { pct: Number(flat(nr.pct)), days: Number(flat(nr.days)) } : null;

  const cx = (ctxRows[0] || [])[0] || {};
  const assoc = (assocRows[0] || [])[0] || {};
  const trMap = (learnRows || {}) as Record<string, { beat: number; done: number }>;
  const tr = trMap[snap.origin_action_type ?? ""] || { beat: 0, done: 0 };
  const trDone = Number(tr.done) || 0, trBeat = Number(tr.beat) || 0;
  // min-N gate (>=5 done) — mirrors fct_location_commitment_learning.has_sufficient_sample.
  const trackRecord = trDone >= 5 ? { beat: trBeat, done: trDone } : null;

  const context = {
    school_days: Number(flat(cx.school_days)) || 0,
    mobility_days: Number(flat(cx.mobility_days)) || 0,
    tourism_status: flat(cx.tourism_status) ?? null,
    named_events: (evRows[0] || []).map((r: any) => ({ label: flat(r.label), days: Number(flat(r.days)) || 0 })),
    foreign_visitors: (foreignRows[0] || []).map((r: any) => frCountry(flat(r.country))),
    weather_assoc: assoc && (assoc.cool_n != null || assoc.mild_n != null) ? {
      cool_avg: assoc.cool_avg != null ? Number(flat(assoc.cool_avg)) : null,
      cool_n: Number(flat(assoc.cool_n)) || 0,
      mild_avg: assoc.mild_avg != null ? Number(flat(assoc.mild_avg)) : null,
      mild_n: Number(flat(assoc.mild_n)) || 0,
      corr_rain: assoc.corr_rain != null ? Number(flat(assoc.corr_rain)) : null,
    } : null,
  };

  const provenance = {
    history_days: Number(flat((histRows[0] || [])[0]?.history_days)) || 0,
    track_record: trackRecord,
  };

  // ③ advice — rule-based, returns KEYS (French in commitmentCopy.ts). §2c honesty.
  const prefill = { committed_action_text: snap.committed_action_text ?? null, origin_action_type: snap.origin_action_type ?? null, window_kind: "7d" };
  const advice: EvolutionExtras["advice"] = [];
  // Type A track record is the strongest evidence-based signal for "reconduire?" — it LEADS when
  // present, and replaces the generic met_hold/aim_higher. Beat-ratio thresholds (see
  // docs/features/learning-engine.md): reconduire only on a clear majority AND enough N; a mixed
  // record reads "résultats mitigés", never an endorsement.
  if (trackRecord) {
    const ratio = trackRecord.done > 0 ? trackRecord.beat / trackRecord.done : 0;
    const key = (ratio >= 0.70 && trackRecord.beat >= 4) ? "advice_track_reconduire"
      : (ratio <= 0.30) ? "advice_track_ne_pas" : "advice_track_mitige";
    advice.push(key === "advice_track_reconduire" ? { key, track: trackRecord, prefill } : { key, track: trackRecord });
  }
  if (snap.ctx_material_confound) {
    advice.push({ key: "advice_replay_offseason", prefill });
  } else if (!trackRecord && snap.verdict === "met" && snap.ctx_any_school_holiday && holiday_norm) {
    advice.push({ key: "advice_aim_higher", arg: holiday_norm.pct, prefill });
  } else if (!trackRecord && snap.verdict === "met") {
    // clean win, no holiday confound → hold & reconduire (never an empty ③)
    advice.push({ key: "advice_met_hold", prefill });
  }
  if (snap.verdict === "missed" && snap.action_done_status === "fait") {
    advice.push({ key: "advice_missed_descriptive" });           // descriptive statement, no CTA
    advice.push({ key: "advice_replay_retest", prefill });        // at most the methodological re-test
  }

  return { holiday_norm, context, provenance, advice };
}
