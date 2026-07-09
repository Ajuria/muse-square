import type { APIRoute } from 'astro';
import { makeBQClient } from '../../../lib/bq';
// Named-context assembly is shared with reactions-today via dayContext (one source, no fork).
import { namedEventsRange, foreignVisitorsRange } from '../../../lib/dayContext';

export const prerender = false;

const PROJECT = 'muse-square-open-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function shift(iso: string, opts: { days?: number; years?: number }): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (opts.days) d.setUTCDate(d.getUTCDate() + opts.days);
  if (opts.years) d.setUTCFullYear(d.getUTCFullYear() + opts.years);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = (locals as any).clerk_user_id as string | undefined;
  if (!userId) return json({ ok: false, error: 'UNAUTHORIZED' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'INVALID_JSON' }, 400); }

  const start = String(body?.date_start ?? '');
  const end = String(body?.date_end ?? '');
  if (!ISO.test(start) || !ISO.test(end) || start > end) return json({ ok: false, error: 'INVALID_RANGE' }, 400);

  // authorize the establishment against the user's owned set (fallback: active site)
  const owned: string[] = Array.isArray((locals as any).all_location_ids) ? (locals as any).all_location_ids : [];
  const activeLoc = ((locals as any).location_id as string | undefined) ?? null;
  const reqLoc = body?.location_id ? String(body.location_id) : null;
  let loc: string;
  if (reqLoc) {
    if (reqLoc !== activeLoc && !owned.includes(reqLoc)) return json({ ok: false, error: 'LOCATION_FORBIDDEN' }, 403);
    loc = reqLoc;
  } else if (activeLoc) { loc = activeLoc; } else { return json({ ok: false, error: 'NO_LOCATION' }, 400); }

  // comparison windows
  const len = daysBetween(start, end); // inclusive-length - 1
  const prevEnd = shift(start, { days: -1 });
  const prevStart = shift(prevEnd, { days: -len });
  const yoyStart = shift(start, { years: -1 });
  const yoyEnd = shift(end, { years: -1 });

  const bq = makeBQClient(PROJECT);
  const q = (query: string, params: Record<string, unknown>) =>
    bq.query({ query, params, location: 'EU' }).then(([rows]) => rows as any[]);

  try {
    const [series, prior, sig, cats, ctx, namedEvents, foreign, actions, radius, labelRows, assoc, compRows] = await Promise.all([
      // daily series (revenue + transactions) — totals/weekday/best-worst derived in JS
      q(`SELECT transaction_date AS d, SUM(daily_revenue) AS rev, SUM(daily_transactions) AS txns
         FROM \`${PROJECT}.mart.fct_client_daily_performance\`
         WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e GROUP BY 1 ORDER BY 1`,
        { loc, s: start, e: end }),
      // prior-period + prior-year revenue (yoy_days=0 => no history yet)
      q(`SELECT
           SUM(IF(transaction_date BETWEEN @ps AND @pe, daily_revenue, 0)) AS prev_rev,
           SUM(IF(transaction_date BETWEEN @ys AND @ye, daily_revenue, 0)) AS yoy_rev,
           COUNT(DISTINCT IF(transaction_date BETWEEN @ys AND @ye, transaction_date, NULL)) AS yoy_days
         FROM \`${PROJECT}.mart.fct_client_daily_performance\`
         WHERE location_id=@loc AND transaction_date BETWEEN @ys AND @pe`,
        { loc, ps: prevStart, pe: prevEnd, ys: yoyStart, ye: yoyEnd }),
      // sales signals: anomaly counts + dominant driver
      q(`SELECT COUNTIF(is_revenue_down_anomaly) AS down_days, COUNTIF(is_revenue_surge_anomaly) AS surge_days,
                APPROX_TOP_COUNT(primary_revenue_driver,1)[OFFSET(0)].value AS driver
         FROM \`${PROJECT}.mart.fct_client_sales_signals_daily\`
         WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e`,
        { loc, s: start, e: end }),
      // category mix (offering)
      q(`SELECT item_category AS cat, ROUND(SUM(revenue),0) AS rev
         FROM \`${PROJECT}.mart.fct_client_offering_daily\`
         WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e AND item_category IS NOT NULL
         GROUP BY 1 ORDER BY rev DESC LIMIT 6`,
        { loc, s: start, e: end }),
      // context scalars: weather type, tourism, holidays, event density
      q(`SELECT
           COUNTIF(lvl_heat>=2) AS hot_days, MAX(lvl_heat) AS max_heat,
           COUNTIF(lvl_rain>=2) AS rain_days, COUNTIF(lvl_cold>=2) AS cold_days,
           COUNTIF(is_school_holiday_flag) AS school_days, COUNTIF(is_public_holiday_flag) AS public_days,
           COUNTIF(mobility_disruption_flag_region) AS mobility_days,
           COUNTIF(tourism_peak_flag_region) AS tourism_peak_days,
           APPROX_TOP_COUNT(tourism_status_region,1)[OFFSET(0)].value AS tourism_status
         FROM \`${PROJECT}.mart.fct_location_context_daily\`
         WHERE location_id=@loc AND date BETWEEN @s AND @e`,
        { loc, s: start, e: end }),
      // named nearby events (5km) + foreign visitors — shared with reactions-today via dayContext
      namedEventsRange(bq, loc, start, end),
      foreignVisitorsRange(bq, loc, start, end),
      // pre-written French action candidates for the window
      // Real actions = the client's own sales signals (category 'performance'), each
      // carrying a CTA in detail_fr. Exclude competition-density observations (context,
      // shown in the Contexte section) and the positive 'sales_surge' (no action needed).
      // Dedup by action_type, keeping each type's highest-priority instance.
      q(`SELECT
           action_type,
           ANY_VALUE(data_payload HAVING MAX action_priority) AS data_payload,
           ANY_VALUE(date HAVING MAX action_priority) AS affected_date,
           MAX(action_priority) AS action_priority
         FROM \`${PROJECT}.mart.fct_location_daily_action_candidates\`
         WHERE location_id=@loc AND date BETWEEN @s AND @e
           AND action_category = 'performance' AND action_type != 'sales_surge'
           AND headline_fr IS NOT NULL AND action_type IS NOT NULL
         GROUP BY action_type ORDER BY action_priority DESC LIMIT 3`,
        { loc, s: start, e: end }),
      // nearby-event density (5km band)
      q(`SELECT ROUND(AVG(events_within_5km_count),1) AS avg5, MAX(events_within_5km_count) AS peak5
         FROM \`${PROJECT}.mart.fct_location_events_radius_daily\`
         WHERE location_id=@loc AND date BETWEEN @s AND @e`,
        { loc, s: start, e: end }),
      // establishment label for the header (raw id is never displayed)
      q(`SELECT location_label FROM \`${PROJECT}.dims.dim_client_location\` WHERE location_id=@loc`, { loc }),
      // per-factor association with daily revenue over ALL days: group means + counts + correlation.
      // Descriptive (observed co-movement), not causal — the page frames it as such.
      q(`WITH day AS (
           SELECT transaction_date d, SUM(daily_revenue) rev
           FROM \`${PROJECT}.mart.fct_client_daily_performance\`
           WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e GROUP BY 1),
         j AS (
           SELECT day.rev AS rev, c.lvl_heat AS heat, e.events_within_5km_count AS ev5
           FROM day
           LEFT JOIN \`${PROJECT}.mart.fct_location_context_daily\` c ON c.location_id=@loc AND c.date=day.d
           LEFT JOIN \`${PROJECT}.mart.fct_location_events_radius_daily\` e ON e.location_id=@loc AND e.date=day.d),
         m AS (SELECT AVG(ev5) AS ev_avg FROM j)
         SELECT
           ROUND(AVG(IF(heat>=2, rev, NULL)),0) AS hot_avg, COUNTIF(heat>=2) AS hot_n,
           ROUND(AVG(IF(NOT COALESCE(heat>=2,false), rev, NULL)),0) AS mild_avg, COUNTIF(NOT COALESCE(heat>=2,false)) AS mild_n,
           ROUND(CORR(CAST(heat AS FLOAT64), rev),2) AS corr_heat,
           ROUND(AVG(IF(ev5 >= (SELECT ev_avg FROM m), rev, NULL)),0) AS evhi_avg, COUNTIF(ev5 >= (SELECT ev_avg FROM m)) AS evhi_n,
           ROUND(AVG(IF(ev5 < (SELECT ev_avg FROM m), rev, NULL)),0) AS evlo_avg, COUNTIF(ev5 < (SELECT ev_avg FROM m)) AS evlo_n,
           ROUND(CORR(ev5, rev),2) AS corr_events
         FROM j`,
        { loc, s: start, e: end }),
      // per-day category revenue for the stacked composition chart
      q(`SELECT transaction_date AS d, item_category AS cat, ROUND(SUM(revenue),0) AS rev
         FROM \`${PROJECT}.mart.fct_client_offering_daily\`
         WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e AND item_category IS NOT NULL
         GROUP BY 1, 2`,
        { loc, s: start, e: end }),
    ]);

    if (series.length === 0) return json({ ok: false, error: 'NO_DATA' }, 200);

    // ── derive totals / weekday / best-worst from the series (no extra queries) ──
    // BigQuery returns DATE as a { value: 'YYYY-MM-DD' } object, not a string.
    const dstr = (v: any): string => (typeof v === 'string' ? v : v && v.value != null ? String(v.value) : String(v));
    const rows = series.map((r) => ({ d: dstr(r.d).slice(0, 10), rev: Number(r.rev) || 0, txns: Number(r.txns) || 0 }));
    const totalRev = rows.reduce((s, r) => s + r.rev, 0);
    const totalTxns = rows.reduce((s, r) => s + r.txns, 0);
    const basket = totalTxns ? totalRev / totalTxns : 0;
    const best = rows.reduce((a, r) => (r.rev > a.rev ? r : a), rows[0]);
    const worst = rows.reduce((a, r) => (r.rev < a.rev ? r : a), rows[0]);

    const dowNames = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const dowSum: Record<number, { sum: number; n: number }> = {};
    for (const r of rows) {
      const k = new Date(`${r.d}T00:00:00Z`).getUTCDay();
      (dowSum[k] ??= { sum: 0, n: 0 }); dowSum[k].sum += r.rev; dowSum[k].n += 1;
    }
    // Weekday profile is only meaningful over ≥ ~4 weeks (else 1 day per weekday = noise).
    const showWeekday = len >= 27;
    const weekday = showWeekday
      ? [1, 2, 3, 4, 5, 6, 0].map((k) => ({ label: dowNames[k], avg: dowSum[k] ? Math.round(dowSum[k].sum / dowSum[k].n) : 0 }))
      : [];

    // ── composition: buckets × categories (top 5 + Autres); day grain, month for long windows ──
    const monthly = len > 62;
    const bKey = (d: string) => (monthly ? d.slice(0, 7) : d);
    const catTotals = new Map<string, number>();
    for (const r of compRows) catTotals.set(String(r.cat), (catTotals.get(String(r.cat)) || 0) + (Number(r.rev) || 0));
    const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]);
    const hasAutres = catTotals.size > topCats.length;
    const catList = topCats.length ? (hasAutres ? [...topCats, 'Autres'] : topCats) : [];
    const catIdx = new Map(catList.map((c, i) => [c, i]));
    const bMap = new Map<string, number[]>();
    for (const r of compRows) {
      const k = bKey(dstr(r.d).slice(0, 10));
      if (!bMap.has(k)) bMap.set(k, new Array(catList.length).fill(0));
      const ci = catIdx.has(String(r.cat)) ? catIdx.get(String(r.cat))! : hasAutres ? catIdx.get('Autres')! : 0;
      bMap.get(k)![ci] += Number(r.rev) || 0;
    }
    const composition = {
      categories: catList,
      granularity: monthly ? 'month' : 'day',
      buckets: [...bMap.keys()].sort().map((k) => ({ label: k, values: bMap.get(k)! })),
    };
    // ranked category totals (top 5 + Autres) for the readable horizontal-bar mix
    const topSet = new Set(topCats);
    const category_mix = catList.map((c) => ({
      label: c,
      revenue: c === 'Autres'
        ? [...catTotals.entries()].filter(([k]) => !topSet.has(k)).reduce((s, [, v]) => s + v, 0)
        : catTotals.get(c) || 0,
    }));

    const prevRev = Number(prior[0]?.prev_rev) || 0;
    const yoyRev = Number(prior[0]?.yoy_rev) || 0;
    const yoyDays = Number(prior[0]?.yoy_days) || 0;
    const pct = (cur: number, base: number) => (base > 0 ? Math.round(((cur - base) / base) * 1000) / 10 : null);

    return json({
      ok: true,
      location_id: loc,
      location_label: labelRows[0]?.location_label ?? 'Votre établissement',
      period: { start, end },
      summary: {
        revenue: Math.round(totalRev),
        transactions: totalTxns,
        avg_basket: Math.round(basket * 100) / 100,
        vs_prev_pct: pct(totalRev, prevRev),
        vs_yoy_pct: yoyDays > 0 ? pct(totalRev, yoyRev) : null,
        yoy_available: yoyDays > 0,
      },
      daily: rows,
      composition,
      category_mix,
      weekday,
      best_day: { date: best.d, revenue: Math.round(best.rev) },
      worst_day: { date: worst.d, revenue: Math.round(worst.rev) },
      signals: {
        down_days: Number(sig[0]?.down_days) || 0,
        surge_days: Number(sig[0]?.surge_days) || 0,
        driver: sig[0]?.driver ?? null,
      },
      categories: cats.map((c) => ({ label: c.cat, revenue: Number(c.rev) || 0 })),
      context: {
        hot_days: Number(ctx[0]?.hot_days) || 0,
        max_heat: Number(ctx[0]?.max_heat) || 0,
        rain_days: Number(ctx[0]?.rain_days) || 0,
        cold_days: Number(ctx[0]?.cold_days) || 0,
        school_days: Number(ctx[0]?.school_days) || 0,
        public_days: Number(ctx[0]?.public_days) || 0,
        mobility_days: Number(ctx[0]?.mobility_days) || 0,
        tourism_peak_days: Number(ctx[0]?.tourism_peak_days) || 0,
        tourism_status: ctx[0]?.tourism_status ?? null,
        events_avg_5km: Number(radius[0]?.avg5) || 0,
        events_peak_5km: Number(radius[0]?.peak5) || 0,
        named_events: namedEvents.map((e: { label: string; days: number }) => ({ label: e.label, days: Number(e.days) || 0 })),
        foreign_visitors: foreign,
        assoc: {
          heat: {
            with_avg: Number(assoc[0]?.hot_avg) || 0, with_n: Number(assoc[0]?.hot_n) || 0,
            without_avg: Number(assoc[0]?.mild_avg) || 0, without_n: Number(assoc[0]?.mild_n) || 0,
            corr: assoc[0]?.corr_heat == null ? null : Number(assoc[0].corr_heat),
          },
          events: {
            with_avg: Number(assoc[0]?.evhi_avg) || 0, with_n: Number(assoc[0]?.evhi_n) || 0,
            without_avg: Number(assoc[0]?.evlo_avg) || 0, without_n: Number(assoc[0]?.evlo_n) || 0,
            corr: assoc[0]?.corr_events == null ? null : Number(assoc[0].corr_events),
          },
        },
      },
      // Raw signal + payload only — the report page renders these through the SAME
      // motor as pulse/monitor (public/action-cards.js → window.ACTION_CARDS), no duplicate copy.
      actions: actions.map((a) => ({
        action_type: a.action_type,
        data_payload: typeof a.data_payload === 'string' ? a.data_payload : JSON.stringify(a.data_payload ?? {}),
        affected_date: a.affected_date ? String(a.affected_date.value ?? a.affected_date) : null,
      })),
    });
  } catch (err: any) {
    console.error('sales-report error:', err?.message || err);
    return json({ ok: false, error: err?.message || 'REPORT_FAILED' }, 500);
  }
};
