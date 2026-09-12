// src/lib/rapport/ventes.ts — LE CŒUR du rapport de ventes (docs/explorer-outil-spec.md § 4, `lire_ventes`).
//
// 12/09 : le corps de POST /api/insight/sales-report vit ici, tel quel — mêmes requêtes, mêmes dérivations,
// même objet rendu (la route n'est plus qu'un habillage : auth, corps, JSON). Le rapport imprimable
// (rapport.astro), le chat et désormais l'outil `lire_ventes` de l'agent lisent LA MÊME lecture ; rien n'est
// recalculé ailleurs. Deux parties :
//   · computeSalesReport(bq, args) — la lecture (BigQuery) : rend `{ body, prev_revenue }`, `body` étant
//     l'objet que la route renvoie à l'octet près (channel_report, NO_DATA, ou le rapport complet) ;
//   · resolvePeriode / composeVentesFacts — PURS : la période demandée en dates, et le rapport en faits
//     (une ligne par fait, les mots déjà rendus par rapport.astro et le chat) + blocs `table` du kit.
import { margeFamily } from '../insightFamilies/marge';
// Named-context assembly is shared with reactions-today via dayContext (one source, no fork).
import { namedEventsRange, foreignVisitorsRange } from '../context/dayContext';
// Section « Vos canaux » (R1, docs/rapport-canaux-spec.md) — même cœur que le provider channels.
import { channelsData } from '../insightFamilies/channels';
import type { AnswerBlock } from '../explorer/blocks';

const PROJECT = 'muse-square-open-data';

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function shift(iso: string, opts: { days?: number; years?: number; months?: number }): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (opts.days) d.setUTCDate(d.getUTCDate() + opts.days);
  if (opts.months) d.setUTCMonth(d.getUTCMonth() + opts.months);
  if (opts.years) d.setUTCFullYear(d.getUTCFullYear() + opts.years);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface SalesReportArgs {
  location_id: string;
  /** Les sites du compte (scope 'group') — vide quand l'appelant n'en connaît qu'un. */
  owned: string[];
  start: string;
  end: string;
  /** 'group' = tous les sites du compte (section canaux) ; autre chose = le site du rapport. */
  scope?: unknown;
  /** Un channel_key → RAPPORT SPÉCIFIQUE mono-canal (R2). */
  channel?: unknown;
}

export interface SalesReportResult {
  /** L'objet rendu par la route, inchangé : `{ ok: true, … }`, `{ ok: true, channel_report: true, … }` ou `{ ok: false, error: 'NO_DATA' }`. */
  body: Record<string, unknown>;
  /** Le CA de la période précédente (la route ne le rend qu'en %) — pour le tableau de l'outil. */
  prev_revenue: number | null;
}

export async function computeSalesReport(bq: any, args: SalesReportArgs): Promise<SalesReportResult> {
  const { location_id: loc, owned, start, end } = args;
  const body = { scope: args.scope, channel: args.channel };

  // comparison windows
  const len = daysBetween(start, end); // inclusive-length - 1
  const prevEnd = shift(start, { days: -1 });
  const prevStart = shift(prevEnd, { days: -len });
  const yoyStart = shift(start, { years: -1 });
  const yoyEnd = shift(end, { years: -1 });

  const q = (query: string, params: Record<string, unknown>) =>
    bq.query({ query, params, location: 'EU' }).then(([rows]: [any[]]) => rows as any[]);

  // R2 — RAPPORT SPÉCIFIQUE mono-canal (« Boutique seule ») : un document autonome fait des
  // seuls blocs du canal — le reste du rapport (séries site entières) MENTIRAIT sur ce
  // périmètre, donc on ne le calcule même pas. Le canal vient du sélecteur de la page.
  const reqChannel = typeof body?.channel === 'string' && body.channel.trim() ? body.channel.trim() : null;
  if (reqChannel) {
    const scopeC = body?.scope === 'group' && owned.length > 1 ? 'group' : 'site';
    const { data } = await channelsData(bq, scopeC === 'group' ? owned : [loc], start, end, { channel_key: reqChannel });
    if (!data.found) return { body: { ok: false, error: 'NO_DATA' }, prev_revenue: null };
    const labelRowsC = await q(
      `SELECT location_label FROM \`${PROJECT}.dims.dim_client_location\` WHERE location_id = @loc`,
      { loc }
    );
    return {
      body: {
        ok: true,
        channel_report: true,
        channels: data,
        channels_scope: scopeC,
        location_id: loc,
        location_label: labelRowsC[0]?.location_label ?? 'Votre établissement',
        period: { start, end },
      },
      prev_revenue: null,
    };
  }

  // « Vos canaux » — AMORCÉE ici (jamais un aller-retour séquentiel de plus), attendue après
  // le lot principal. scope 'group' = tous les sites du compte ; défaut = le site du rapport.
  // Échec soft LOGGÉ (la section est un ajout : le rapport existant ne doit jamais en mourir —
  // mais un échec silencieux non loggé est le piège dateResolutionQuery, donc console.error).
  const scope = body?.scope === 'group' && owned.length > 1 ? 'group' : 'site';
  const channelsPromise = channelsData(bq, scope === 'group' ? owned : [loc], start, end)
    .catch((e: any) => { console.error('sales-report channels section failed:', e?.message); return null; });
  // « Marge brute » (11/09, docs/catalogue-de-couts-et-marge.md, audit § 6 A8) — AMORCÉE ici, attendue avec les
  // canaux : LE provider marge (même lecture qu'Explorer et que le chat), fenêtre = les 30 jours qui finissent
  // à la fin du rapport ; null sans couverture suffisante (la section n'existe simplement pas).
  const margePromise = margeFamily(bq, loc, end)
    .catch((e: any) => { console.error('sales-report marge section failed:', e?.message); return null; });
  const [series, prior, sig, cats, ctx, namedEvents, foreign, actions, radius, labelRows, assoc, compRows] = await Promise.all([
    // daily series (revenue + transactions) — totals/weekday/best-worst derived in JS
    q(`SELECT transaction_date AS d, SUM(daily_revenue) AS rev, SUM(daily_transactions) AS txns
       FROM \`${PROJECT}.mart.fct_client_daily_performance\`
       WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e GROUP BY 1 ORDER BY 1`,
      { loc, s: start, e: end }),
    // prior-period + prior-year revenue (yoy_days=0 => no history yet)
    q(`SELECT
         SUM(IF(transaction_date BETWEEN @ps AND @pe, daily_revenue, 0)) AS prev_rev,
         SUM(IF(transaction_date BETWEEN @ps AND @pe, daily_transactions, 0)) AS prev_txns,
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
    // 09/09 (owner : « le mix produits ») — la période précédente dans la même requête : part de CA
    // de chaque famille avant / après, pour dire quelle famille a pris ou perdu de la place.
    q(`SELECT item_category AS cat,
              ROUND(SUM(IF(transaction_date BETWEEN @s AND @e, revenue, 0)),0) AS rev,
              ROUND(SUM(IF(transaction_date BETWEEN @ps AND @pe, revenue, 0)),0) AS prev_rev
       FROM \`${PROJECT}.semantic.vw_insight_event_client_offering_daily\`
       WHERE location_id=@loc AND transaction_date BETWEEN @ps AND @e AND item_category IS NOT NULL
       GROUP BY 1 HAVING rev > 0 ORDER BY rev DESC LIMIT 6`,
      { loc, s: start, e: end, ps: prevStart, pe: prevEnd }),
    // context scalars: weather type, tourism, holidays, event density
    q(`SELECT
         COUNTIF(lvl_heat>=2) AS hot_days, MAX(lvl_heat) AS max_heat,
         COUNTIF(lvl_rain>=2) AS rain_days, COUNTIF(lvl_cold>=2) AS cold_days,
         COUNTIF(is_school_holiday_flag) AS school_days, COUNTIF(is_public_holiday_flag) AS public_days,
         COUNTIF(mobility_disruption_flag_region) AS mobility_days,
         COUNTIF(tourism_peak_flag_region) AS tourism_peak_days,
         APPROX_TOP_COUNT(tourism_status_region,1)[OFFSET(0)].value AS tourism_status
       FROM \`${PROJECT}.semantic.vw_insight_event_location_context\`
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
         ANY_VALUE(card_instance_id HAVING MAX action_priority) AS card_instance_id,
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
         LEFT JOIN \`${PROJECT}.semantic.vw_insight_event_location_context\` c ON c.location_id=@loc AND c.date=day.d
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
       FROM \`${PROJECT}.semantic.vw_insight_event_client_offering_daily\`
       WHERE location_id=@loc AND transaction_date BETWEEN @s AND @e AND item_category IS NOT NULL
       GROUP BY 1, 2`,
      { loc, s: start, e: end }),
  ]);

  if (series.length === 0) return { body: { ok: false, error: 'NO_DATA' }, prev_revenue: null };

  // ── derive totals / weekday / best-worst from the series (no extra queries) ──
  // BigQuery returns DATE as a { value: 'YYYY-MM-DD' } object, not a string.
  const dstr = (v: any): string => (typeof v === 'string' ? v : v && v.value != null ? String(v.value) : String(v));
  const rows = series.map((r: any) => ({ d: dstr(r.d).slice(0, 10), rev: Number(r.rev) || 0, txns: Number(r.txns) || 0 }));
  const totalRev = rows.reduce((s: number, r: any) => s + r.rev, 0);
  const totalTxns = rows.reduce((s: number, r: any) => s + r.txns, 0);
  const basket = totalTxns ? totalRev / totalTxns : 0;
  const best = rows.reduce((a: any, r: any) => (r.rev > a.rev ? r : a), rows[0]);
  const worst = rows.reduce((a: any, r: any) => (r.rev < a.rev ? r : a), rows[0]);

  // Lexique règle 6 : jours en toutes lettres — jamais d'abréviation.
  const dowNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
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
  const prevTxns = Number(prior[0]?.prev_txns) || 0;
  const prevBasket = prevTxns > 0 ? prevRev / prevTxns : 0;
  // 09/09 (owner : « No distinction between le volume de transactions, le panier moyen ou le mix produits »)
  // — les TROIS couches d'un écart de CA, chacune dans son unité (loi owner 06/09) : volume = nombre de
  // ventes, panier = € par vente, mix = part de CA par famille. volume_term = Δventes × panier précédent ;
  // basket_term = Δpanier × ventes de la période ; les deux termes somment à l'écart de CA.
  const catsTot = cats.reduce((a: number, c: any) => a + (Number(c.rev) || 0), 0);
  const catsPrevTot = cats.reduce((a: number, c: any) => a + (Number(c.prev_rev) || 0), 0);
  const mixMoves = cats.map((c: any) => {
    const share = catsTot > 0 ? (Number(c.rev) || 0) / catsTot * 100 : null;
    const prevShare = catsPrevTot > 0 ? (Number(c.prev_rev) || 0) / catsPrevTot * 100 : null;
    return { label: String(c.cat), share_pct: share == null ? null : Math.round(share * 10) / 10, prev_share_pct: prevShare == null ? null : Math.round(prevShare * 10) / 10,
             delta_pt: share != null && prevShare != null ? Math.round((share - prevShare) * 10) / 10 : null };
  });
  const layers = prevTxns > 0 && prevRev > 0 ? {
    volume_pct: Math.round(((totalTxns - prevTxns) / prevTxns) * 1000) / 10,
    basket_pct: prevBasket > 0 ? Math.round(((basket - prevBasket) / prevBasket) * 1000) / 10 : null,
    volume_term_eur: Math.round((totalTxns - prevTxns) * prevBasket),
    basket_term_eur: Math.round((basket - prevBasket) * totalTxns),
    prev_transactions: prevTxns,
    prev_avg_basket: Math.round(prevBasket * 100) / 100,
    mix: mixMoves.filter((m: any) => m.delta_pt != null).sort((a: any, b: any) => Math.abs(b.delta_pt!) - Math.abs(a.delta_pt!)).slice(0, 2),
  } : null;
  const yoyRev = Number(prior[0]?.yoy_rev) || 0;
  const yoyDays = Number(prior[0]?.yoy_days) || 0;
  const pct = (cur: number, base: number) => (base > 0 ? Math.round(((cur - base) / base) * 1000) / 10 : null);

  const channelsRes = await channelsPromise;
  const margeRes = await margePromise;

  return {
    prev_revenue: prevRev > 0 ? prevRev : null,
    body: {
      ok: true,
      // « Vos canaux » — null si < 2 flux réels (décision 12 : jamais de section à flux unique).
      channels: channelsRes && channelsRes.data.found ? channelsRes.data : null,
      channels_scope: scope,
      marge: margeRes && margeRes.found ? margeRes.data : null,
      location_id: loc,
      location_label: labelRows[0]?.location_label ?? 'Votre établissement',
      period: { start, end },
      summary: {
        revenue: Math.round(totalRev),
        transactions: totalTxns,
        avg_basket: Math.round(basket * 100) / 100,
        layers,
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
      categories: cats.map((c: any) => ({ label: c.cat, revenue: Number(c.rev) || 0 })),
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
      // motor as pulse/monitor (public/js/action-cards.js → window.ACTION_CARDS), no duplicate copy.
      actions: actions.map((a: any) => ({
        action_type: a.action_type,
        card_instance_id: a.card_instance_id ? String(a.card_instance_id) : null,
        data_payload: typeof a.data_payload === 'string' ? a.data_payload : JSON.stringify(a.data_payload ?? {}),
        affected_date: a.affected_date ? String(a.affected_date.value ?? a.affected_date) : null,
      })),
    },
  };
}

// ── La période demandée à l'outil → deux dates (PUR) ─────────────────────────────────────────────────
export type PeriodeMot = '30_derniers_jours' | 'semaine_derniere' | 'mois_dernier';

export interface PeriodeResolue { start: string; end: string; libelle_fr: string }

/**
 * « 30 derniers jours » = les 30 jours qui finissent hier ; « semaine dernière » = du lundi au dimanche de
 * la semaine civile précédente ; « mois dernier » = le mois civil précédent ; `du`/`au` explicites (AAAA-MM-JJ)
 * l'emportent. `today` = la date du jour à Paris (AAAA-MM-JJ). Rend null si les dates explicites sont invalides.
 */
export function resolvePeriode(args: { periode?: PeriodeMot | null; du?: string | null; au?: string | null }, today: string): PeriodeResolue | null {
  if (args.du || args.au) {
    const start = String(args.du || ''), end = String(args.au || start);
    if (!ISO.test(start) || !ISO.test(end) || start > end) return null;
    return { start, end, libelle_fr: `du ${frDateFr(start)} au ${frDateFr(end)}` };
  }
  const yesterday = shift(today, { days: -1 });
  if (args.periode === 'semaine_derniere') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = dimanche
    const lastSunday = shift(today, { days: -(dow === 0 ? 7 : dow) });
    const lastMonday = shift(lastSunday, { days: -6 });
    return { start: lastMonday, end: lastSunday, libelle_fr: `la semaine dernière, du ${frDateFr(lastMonday)} au ${frDateFr(lastSunday)}` };
  }
  if (args.periode === 'mois_dernier') {
    const firstOfThisMonth = today.slice(0, 8) + '01';
    const end = shift(firstOfThisMonth, { days: -1 });
    const start = end.slice(0, 8) + '01';
    return { start, end, libelle_fr: `le mois dernier, du ${frDateFr(start)} au ${frDateFr(end)}` };
  }
  const start = shift(yesterday, { days: -29 });
  return { start, end: yesterday, libelle_fr: `vos 30 derniers jours, du ${frDateFr(start)} au ${frDateFr(yesterday)}` };
}

// ── Le rapport → faits et blocs (PUR) ─────────────────────────────────────────────────────────────
const frInt = (n: number): string => Math.round(Number(n) || 0).toLocaleString('fr-FR');
const eur = (n: number): string => `${frInt(n)} €`;
const eur2 = (n: number): string => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
const pct1 = (n: number): string => `${String(Math.round(Number(n) * 10) / 10).replace('.', ',')} %`;
// Le signe de rapport.astro ; les entiers (montants) portent le séparateur de milliers français (frInt), le
// dixième (pourcentages) la virgule décimale.
const sgn = (n: number, dec: boolean): string => { const v = Number(n); return (v >= 0 ? '+' : '−') + (dec ? String(Math.abs(Math.round(v * 10) / 10)).replace('.', ',') : frInt(Math.abs(v))); };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function frDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}
const jourFr = (iso: string): string => `le ${JOURS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${frDateFr(iso)}`;

/** Les faits NOMMÉS (12/09, composer_rapport les range par section) — les mêmes chaînes que `facts`, jamais d'autres. */
export interface VentesParts { ca?: string; an_dernier?: string; volume_panier?: string; couches?: string; journees?: string; jours?: string; repartition?: string; signaux?: string; par_jour?: string[] }
/** Les tableaux NOMMÉS — `couches` (les trois couches), `mix` (par famille), `jours` (profil par jour de semaine). */
export interface VentesTables { couches?: AnswerBlock; mix?: AnswerBlock; jours?: AnswerBlock; par_jour?: AnswerBlock; jours_graphique?: AnswerBlock; mix_graphique?: AnswerBlock }
/** Le grain « jour » se lit jusqu'à 31 jours : au-delà, une ligne par jour n'est plus une lecture. */
export const GRAIN_JOUR_MAX = 31;
export interface VentesLecture { facts: string[]; blocks: AnswerBlock[]; found: boolean; parts: VentesParts; tables: VentesTables }

/**
 * Les mots sont ceux que rapport.astro rend déjà (« Points clés », « Ce qui a bougé par rapport à la période
 * précédente », « Votre meilleur jour de la semaine ») et ceux du chat (« Votre meilleure journée a été le … ») ;
 * les titres de colonnes sont les sections du Rapport au lexique (Chiffre d'affaires, Nombre de ventes, Panier
 * moyen, Mix produits & services). Un montant a pour sujet celui qui le génère (« vous avez généré »).
 */
export function composeVentesFacts(res: SalesReportResult, opts: { grain?: 'jour' | null } = {}): VentesLecture {
  const b = res.body as any;
  if (!b || b.ok !== true || b.channel_report || !b.summary) return { found: false, facts: [], blocks: [], parts: {}, tables: {} };
  const s = b.summary;
  const start = String(b.period.start), end = String(b.period.end);
  const facts: string[] = [];
  const named: VentesParts = {};
  const tables: VentesTables = {};

  let f1 = `Du ${frDateFr(start)} au ${frDateFr(end)}, vous avez généré ${eur(s.revenue)} de chiffre d'affaires`;
  f1 += s.vs_prev_pct != null
    ? `, ${s.vs_prev_pct >= 0 ? 'en hausse de' : 'en baisse de'} ${pct1(Math.abs(s.vs_prev_pct))} par rapport à la période précédente` + (res.prev_revenue != null ? ` (${eur(res.prev_revenue)})` : '') + '.'
    : ' sur la période.';
  facts.push(named.ca = f1);
  if (s.yoy_available && s.vs_yoy_pct != null) {
    facts.push(named.an_dernier = `Par rapport à la même période l'an dernier, votre chiffre d'affaires est ${s.vs_yoy_pct >= 0 ? 'en hausse de' : 'en baisse de'} ${pct1(Math.abs(s.vs_yoy_pct))}.`);
  }
  facts.push(named.volume_panier = `Vous avez réalisé ${frInt(s.transactions)} ventes, pour un panier moyen de ${eur2(s.avg_basket)} par vente.`);

  const L = s.layers;
  if (L) {
    let lay = `Ce qui a bougé par rapport à la période précédente : le nombre de ventes ${sgn(L.volume_pct, true)} % (${frInt(s.transactions)} contre ${frInt(L.prev_transactions)}, soit ${sgn(L.volume_term_eur, false)} €)`;
    if (L.basket_pct != null) lay += ` ; le panier moyen ${sgn(L.basket_pct, true)} % (${eur2(s.avg_basket)} contre ${eur2(L.prev_avg_basket)} par vente, soit ${sgn(L.basket_term_eur, false)} €)`;
    const moves = (L.mix || []).filter((m: any) => Math.abs(Number(m.delta_pt)) >= 1);
    if (moves.length) {
      lay += ' ; le mix : ' + moves.map((m: any) => `${m.label} ${m.delta_pt >= 0 ? 'passe de ' : 'recule de '}${String(m.prev_share_pct).replace('.', ',')} % à ${String(m.share_pct).replace('.', ',')} % de votre CA`).join(', ');
    } else if (L.mix && L.mix.length) {
      lay += ' ; le mix par famille reste stable (aucune famille ne bouge de plus d’un point de part de CA)';
    }
    facts.push(named.couches = lay + '.');
  }

  if (b.best_day && b.worst_day) {
    facts.push(named.journees = `Votre meilleure journée a été ${jourFr(b.best_day.date)}, avec ${eur(b.best_day.revenue)} ; la plus faible, ${jourFr(b.worst_day.date)}, avec ${eur(b.worst_day.revenue)}.`);
  }
  if (Array.isArray(b.weekday) && b.weekday.length) {
    const wd = [...b.weekday].sort((a: any, c: any) => c.avg - a.avg);
    facts.push(named.jours = `Votre meilleur jour de la semaine : le ${wd[0].label} (${eur(wd[0].avg)} en moyenne) ; le plus calme, le ${wd[wd.length - 1].label} (${eur(wd[wd.length - 1].avg)} en moyenne).`);
    // Le profil, dans l'ordre de la semaine (lundi → dimanche, comme rapport.astro) — CA moyen par jour.
    tables.jours = { type: 'table', cols: [{ label: 'Jour' }, { label: 'CA moyen par jour' }], rows: (b.weekday as Array<{ label: string; avg: number }>).map((w) => ({ cells: [{ v: w.label, bold: true }, { v: eur(w.avg) }] })) };
    tables.jours_graphique = { type: 'barres', items: (b.weekday as Array<{ label: string; avg: number }>).map((w) => ({ label: w.label, value: Number(w.avg) || 0, value_fr: eur(w.avg) })), unite: 'CA moyen par jour de la semaine, sur la période' };
  }
  const mix: Array<{ label: string; revenue: number }> = Array.isArray(b.category_mix) ? b.category_mix : [];
  const mixTot = mix.reduce((a, m) => a + (Number(m.revenue) || 0), 0);
  if (mix.length && mixTot > 0) {
    facts.push(named.repartition = 'Répartition par famille : ' + mix.map((m) => `${m.label} ${eur(m.revenue)} (${pct1((Number(m.revenue) || 0) / mixTot * 100)} de votre CA)`).join(', ') + '.');
  }
  // Grain « jour » (12/09, le reste de l'incrément 1 ; Approfondir en a besoin : « quel jour a porté le volume ? ») —
  // une ligne par jour de vente : CA, ventes, panier moyen ; jours en toutes lettres (lexique règle 6).
  const daily: Array<{ d: string; rev: number; txns: number }> = Array.isArray(b.daily) ? b.daily : [];
  if (opts.grain === 'jour' && daily.length && daily.length <= GRAIN_JOUR_MAX) {
    named.par_jour = daily.map((r) => `${jourFr(r.d).charAt(0).toUpperCase()}${jourFr(r.d).slice(1)} : ${eur(r.rev)} de CA, ${frInt(r.txns)} ventes` + (r.txns > 0 ? `, panier moyen ${eur2(r.rev / r.txns)}` : '') + '.');
    facts.push(...named.par_jour);
    tables.par_jour = { type: 'table', cols: [{ label: 'Jour' }, { label: 'CA' }, { label: 'Ventes' }, { label: 'Panier moyen' }],
      rows: daily.map((r) => ({ cells: [{ v: jourFr(r.d).replace(/^le /, ''), bold: true }, { v: eur(r.rev) }, { v: frInt(r.txns) }, { v: r.txns > 0 ? eur2(r.rev / r.txns) : '—' }] })) };
  } else if (opts.grain === 'jour' && daily.length > GRAIN_JOUR_MAX) {
    facts.push(`Le détail par jour se lit jusqu'à ${GRAIN_JOUR_MAX} jours : la période en compte ${daily.length}.`);
  }
  const sig = b.signals || {};
  if ((Number(sig.surge_days) || 0) + (Number(sig.down_days) || 0) > 0) {
    const parts: string[] = [];
    if (sig.surge_days > 0) parts.push(`${sig.surge_days} journée${sig.surge_days > 1 ? 's' : ''} nettement au-dessus de votre résultat habituel`);
    if (sig.down_days > 0) parts.push(`${sig.down_days} en dessous`);
    facts.push(named.signaux = parts.join(', ') + '.');
  }

  // Bloc TABLE du kit (msTable : cols + rows[].cells) — les trois couches, chacune dans son unité.
  const cols = [{ label: '' }, { label: `Du ${frDateFr(start)} au ${frDateFr(end)}` }, { label: 'Période précédente' }, { label: 'Écart' }];
  const cell = (v: string, bold = false) => ({ v, ...(bold ? { bold: true } : {}) });
  const rows = [
    { cells: [cell('Chiffre d’affaires', true), cell(eur(s.revenue)), cell(res.prev_revenue != null ? eur(res.prev_revenue) : '—'), cell(s.vs_prev_pct != null ? `${sgn(s.vs_prev_pct, true)} %` : '—')] },
    { cells: [cell('Nombre de ventes', true), cell(frInt(s.transactions)), cell(L ? frInt(L.prev_transactions) : '—'), cell(L ? `${sgn(L.volume_pct, true)} %` : '—')] },
    { cells: [cell('Panier moyen', true), cell(eur2(s.avg_basket)), cell(L ? eur2(L.prev_avg_basket) : '—'), cell(L && L.basket_pct != null ? `${sgn(L.basket_pct, true)} %` : '—')] },
  ];
  tables.couches = { type: 'table', cols, rows };
  const blocks: AnswerBlock[] = [tables.couches];
  if (mix.length && mixTot > 0) {
    tables.mix = {
      type: 'table',
      cols: [{ label: 'Mix produits & services' }, { label: 'CA' }, { label: 'Part de votre CA' }],
      rows: mix.map((m) => ({ cells: [cell(m.label, true), cell(eur(m.revenue)), cell(pct1((Number(m.revenue) || 0) / mixTot * 100))] })),
    };
    blocks.push(tables.mix);
    tables.mix_graphique = { type: 'parts', items: mix.map((m) => ({ label: m.label, value: Number(m.revenue) || 0, value_fr: eur(m.revenue), part_fr: pct1((Number(m.revenue) || 0) / mixTot * 100) })) };
  }
  if (tables.par_jour) blocks.push(tables.par_jour);
  blocks.push({ type: 'sources', items: ['Vos ventes par jour et par famille (caisse), la période précédente de même longueur et la même période l’an dernier'] });
  return { found: true, facts, blocks, parts: named, tables };
}

/** Le texte rendu AU MODÈLE : un fait par ligne, ou l'absence. */
export const VENTES_ABSENCE_FR = 'Aucune vente sur cette période.';
export function ventesToText(l: VentesLecture): string {
  return l.found && l.facts.length ? l.facts.map((f) => `• ${f}`).join('\n') : VENTES_ABSENCE_FR;
}
