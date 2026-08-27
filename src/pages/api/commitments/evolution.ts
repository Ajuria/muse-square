// Route: /api/commitments/evolution?commitment_id=  — read-only day-grain series
// for "Consulter l'évolution". Clerk-gated + requireLocationOwnership. Lifts the
// resolution cron's mart queries (BETWEEN + bq.date, the DATE/STRING-safe pattern).
//
// z-HIDDEN AT THE BOUNDARY: the curated snapshot below intentionally omits every z
// field (window_residual_z, _raw, applied_rho/vif, threshold_value, creation_residual_z)
// and the per-day series returns residual_pct only — so the render cannot leak z.
import type { APIRoute } from "astro";
import { KPI_LABEL_FR } from "../../../lib/kpiRegistry";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { readLatestSnapshot } from "../../../lib/actionCommitments";
import { buildPoleReading } from "../../../lib/poleReading";
import { commitmentEffect } from "../../../lib/commitmentEffect";
import { assembleEvolutionExtras } from "../../../lib/commitmentContext";
import { getBestInClassPlays, leverForActionType } from "../../../lib/bestInClassStore";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const RESIDUAL = `${BQ_PROJECT}.semantic.vw_insight_event_day_residual`;
const CTX = `${BQ_PROJECT}.mart.fct_location_context_features_daily`;

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
function parisDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
function dateArray(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z"); const e = new Date(end + "T00:00:00Z");
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}


// ── KPI déclaré : série jour + pairs + objectif, dans l'unité de measured_metric ─────────
// Aligné sur le harnais du proto validé (scripts/engagement-kpi-proto-harness.ts). K1 lit les
// lignes residual déjà chargées (zéro requête en plus) ; K2-K6 lisent la colonne du registre
// dans fct_client_daily_performance ; K8 (famille) rejoint saved_items.kpi_family.
const PERF_TABLE = `${BQ_PROJECT}.mart.fct_client_daily_performance`;
const KPI_DAY_COL: Record<string, string> = {
  footfall: "daily_visitors", conversion: "daily_conversion_rate", basket: "daily_avg_basket",
  transactions: "daily_transactions", discount: "daily_discount_total",
};
// 23/08 : un seul vocabulaire KPI — celui du registre (owner). Plus de copie locale.
const KPI_LABEL: Record<string, string> = KPI_LABEL_FR;
const kpiRound = (v: number): number => (Math.abs(v) < 10 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10);

async function buildKpiBlock(bq: any, snap: any, dates: string[], rrows: any[], today: string) {
  const metric = String(snap.measured_metric || "revenue_residual");
  const loc = String(snap.location_id);
  // FENÊTRE STOCKÉE, jamais la convention legacy « jour de création » du bloc series : un
  // day_of ancré sur un événement (window_start = jour de l'événement, ex. 22/08 créé le 15/08)
  // se mesure SUR ce jour — le harnais a attrapé le bloc en train de « mesurer » la création.
  const wsSnap = String(flat(snap.window_start) || "").slice(0, 10);
  const weSnap = String(flat(snap.window_end) || "").slice(0, 10);
  const ws = wsSnap || dates[0], we = weSnap || dates[dates.length - 1];
  const dayOf = snap.window_kind === "day_of";
  let baseline = snap.kpi_baseline != null ? Number(flat(snap.kpi_baseline)) : null;
  let realized = snap.kpi_window_value != null ? Number(flat(snap.kpi_window_value)) : null;
  let family: string | null = null;
  let daily: { date: string; v: number }[] = [];
  let peers: { date: string; v: number }[] = [];

  if (metric === "family_revenue") {
    if (snap.saved_item_id) {
      const [f] = await bq.query({ query: `SELECT kpi_family FROM \`${BQ_PROJECT}.raw.saved_items\` WHERE saved_item_id = @s LIMIT 1`, params: { s: String(snap.saved_item_id) }, location: "EU" });
      family = f[0] ? String(flat((f[0] as any).kpi_family) || "") || null : null;
    }
    if (!family) return null; // pas de famille rattachée -> pas de bloc (jamais un chiffre d'une autre famille)
    const [dr] = await bq.query({ query: `SELECT CAST(transaction_date AS STRING) d, SUM(revenue) v FROM \`${BQ_PROJECT}.raw.client_transactions\` WHERE location_id=@l AND item_category=@f AND transaction_date BETWEEN @a AND @b GROUP BY 1 ORDER BY 1`,
      params: { l: loc, f: family, a: bq.date(ws), b: bq.date(we) }, location: "EU" });
    daily = (dr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) }));
    if (dayOf) {
      const [pr] = await bq.query({ query: `SELECT CAST(transaction_date AS STRING) d, SUM(revenue) v FROM \`${BQ_PROJECT}.raw.client_transactions\` WHERE location_id=@l AND item_category=@f AND transaction_date < @a AND transaction_date <= @t AND EXTRACT(DAYOFWEEK FROM transaction_date) = EXTRACT(DAYOFWEEK FROM @a) GROUP BY 1 ORDER BY 1 DESC LIMIT 8`,
        params: { l: loc, f: family, a: bq.date(ws), t: bq.date(today) }, location: "EU" });
      peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
    }
  } else if (KPI_DAY_COL[metric]) {
    const col = KPI_DAY_COL[metric];
    const [dr] = await bq.query({ query: `SELECT CAST(transaction_date AS STRING) d, ${col} v FROM \`${PERF_TABLE}\` WHERE location_id=@l AND transaction_date BETWEEN @a AND @b AND ${col} IS NOT NULL ORDER BY 1`,
      params: { l: loc, a: bq.date(ws), b: bq.date(we) }, location: "EU" });
    daily = (dr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) }));
    if (dayOf) {
      const [pr] = await bq.query({ query: `SELECT CAST(transaction_date AS STRING) d, ${col} v FROM \`${PERF_TABLE}\` WHERE location_id=@l AND transaction_date < @a AND transaction_date <= @t AND ${col} IS NOT NULL AND EXTRACT(DAYOFWEEK FROM transaction_date) = EXTRACT(DAYOFWEEK FROM @a) ORDER BY 1 DESC LIMIT 8`,
        params: { l: loc, a: bq.date(ws), t: bq.date(today) }, location: "EU" });
      peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
    }
  } else {
    // K1 : CA/j réalisé + habituel depuis les lignes residual DÉJÀ chargées.
    const dd = rrows.map((x) => ({ date: String(flat(x.date)), v: Number(flat(x.daily_revenue)), e: Number(flat(x.expected_revenue)) }));
    daily = dd.map(({ date, v }) => ({ date, v }));
    const past = dd.filter((x) => x.date <= today);
    if (past.length) {
      if (realized == null) realized = kpiRound(past.reduce((s, x) => s + x.v, 0) / past.length);
      if (baseline == null) baseline = kpiRound(past.reduce((s, x) => s + x.e, 0) / past.length);
    }
    if (baseline == null && snap.window_expected_revenue != null && snap.window_days_expected) {
      baseline = kpiRound(Number(flat(snap.window_expected_revenue)) / Number(snap.window_days_expected));
    }
    if (dayOf) {
      const [pr] = await bq.query({ query: `SELECT CAST(date AS STRING) d, daily_revenue v FROM \`${RESIDUAL}\` WHERE location_id=@l AND date < @a AND date <= @t AND EXTRACT(DAYOFWEEK FROM date) = EXTRACT(DAYOFWEEK FROM @a) ORDER BY 1 DESC LIMIT 8`,
        params: { l: loc, a: bq.date(ws), t: bq.date(today) }, location: "EU" });
      peers = (pr as any[]).map((x) => ({ date: String(flat(x.d)), v: Number(flat(x.v)) })).reverse();
    }
  }

  daily = daily.filter((x) => x.date <= today); // jours futurs jamais mesur\u00e9s
  if (ws > today) realized = null;
  if (realized == null && ws <= today && daily.length) realized = kpiRound(daily.reduce((s, x) => s + x.v, 0) / daily.length);

  const basis = String(snap.threshold_basis || "");
  const thr = snap.threshold_value != null ? Number(flat(snap.threshold_value)) : null;
  const days = Number(snap.window_days_expected) || (dayOf ? 1 : 7);
  let goal: number | null = null, goal_pct: number | null = null;
  if (basis === "pct" && thr != null && baseline != null) { goal_pct = thr; goal = kpiRound(baseline * (1 + thr / 100)); }
  else if (basis === "residual_z" && thr != null && baseline != null) { goal_pct = Math.max(1, Math.round(thr * 0.19 / Math.sqrt(days) * 100)); goal = kpiRound(baseline * (1 + goal_pct / 100)); }

  return { metric, label_fr: KPI_LABEL[metric] || metric, family, day_of: dayOf, baseline, realized, goal, goal_pct, daily, peers };
}

// Chaîne de versions du dispositif (étape 2, 27/08) — partagée entre le flux daté et le rendu
// PÔLE (P3) : même requête canonique, jamais dupliquée. < 2 versions → [] (une racine seule
// n'a pas d'historique à raconter).
async function buildLineage(bq: any, snap: any): Promise<any[]> {
  let lineage: any[] = [];
  if ((snap as any).dispositif_id) {
    const [lrows] = await bq.query({

      query: `SELECT commitment_id, version_no, status, verdict, measured_metric,
                     window_residual_pct, window_residual_z,
                     kpi_baseline, kpi_window_value, kpi_delta_pct, kpi_noise_se,
                     CAST(window_start AS STRING) AS window_start, CAST(window_end AS STRING) AS window_end
              FROM (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY commitment_id ORDER BY updated_at DESC,
                  CASE WHEN status IN ('resolved','cancelled') THEN 1 ELSE 0 END DESC,
                  (verdict IS NOT NULL) DESC, created_at DESC) AS rn
                FROM \`${BQ_PROJECT}.analytics.action_commitments\`
                WHERE dispositif_id = @d AND location_id = @loc
              )
              WHERE rn = 1 AND status != 'cancelled'
              ORDER BY version_no`,
      params: { d: String((snap as any).dispositif_id), loc: String(snap.location_id) },
      types: { d: "STRING", loc: "STRING" },
      location: "EU",
    });
    const flatv = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
    lineage = (Array.isArray(lrows) ? lrows : []).map((r: any) => {
      const eff = commitmentEffect(r);
      return {
        commitment_id: String(flatv(r.commitment_id)),
        version_no: Number(flatv(r.version_no)) || 1,
        status: String(flatv(r.status)),
        verdict: r.verdict != null ? String(flatv(r.verdict)) : null,
        window_start: String(flatv(r.window_start) ?? ""),
        window_end: String(flatv(r.window_end) ?? ""),
        effect_pct: eff.pct,
        effect_proven: eff.z != null && Math.abs(eff.z) >= 1,
        kpi_mention_fr: eff.kpi_mention_fr,
        is_current: String(flatv(r.commitment_id)) === String(snap.commitment_id),
      };
    });
    if (lineage.length < 2) lineage = [];
    }
  return lineage;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return json({ ok: false }, 401);
    const commitmentId = url.searchParams.get("commitment_id");
    if (!commitmentId) return json({ ok: false, error: "Missing commitment_id" }, 400);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    const snap = await readLatestSnapshot(bq, commitmentId);
    if (!snap) return json({ ok: false, error: "Engagement introuvable" }, 404);
    requireLocationOwnership(locals, snap.location_id);

    // ── PÔLE / DISPOSITIF PERMANENT (spec pôles, 27/08) : ni fenêtre ni verdict — la page
    // rend la LECTURE CONTINUE (familles vs habituel) + les opérations rattachées + la chaîne
    // de versions. Toute la machinerie datée (série, KPI fenêtré, moves) est hors sujet ici.
    if ((snap as any).dispositif_nature === "permanent") {
      let _famList: string[] = [];
      try { _famList = JSON.parse(String((snap as any).pole_families || "[]")); } catch { /* périmètre illisible → lecture vide, jamais un crash */ }
      const asOfP = new Date().toISOString().slice(0, 10);
      const pole = await buildPoleReading(bq, String(snap.location_id), String((snap as any).dispositif_id || snap.commitment_id), _famList, asOfP);
      const commitment = {
        commitment_id: snap.commitment_id, location_id: snap.location_id, status: snap.status,
        dispositif_nature: "permanent",
        committed_action_text: snap.committed_action_text, owner_person_name: snap.owner_person_name,
        pole_families: (snap as any).pole_families ?? null,
        dispositif_plus: (snap as any).dispositif_plus ?? null,
        dispositif_why: (snap as any).dispositif_why ?? null,
        dispositif_resources: (snap as any).dispositif_resources ?? null,
        created_at: flat(snap.created_at),
        dispositif_id: (snap as any).dispositif_id ?? null, version_no: (snap as any).version_no ?? null,
      };
      const lineage = await buildLineage(bq, snap);
      return json({ ok: true, commitment, pole, lineage, site_name: null });
    }

    // Same window-date logic as the cron (day_of → Paris business day of creation).
    const dates = snap.window_kind === "day_of"
      ? [parisDate(String(snap.created_at))]
      : dateArray(String(snap.window_start), String(snap.window_end));
    const minD = dates[0], maxD = dates[dates.length - 1];

    const [rrows] = await bq.query({
      query: `SELECT CAST(date AS STRING) AS date, daily_revenue, expected_revenue, residual_pct ` +
             `FROM \`${RESIDUAL}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
      params: { loc: snap.location_id, minD: bq.date(minD), maxD: bq.date(maxD) }, location: "EU",
    });
    const [crows] = await bq.query({
      query: `SELECT CAST(date AS STRING) AS date, is_school_holiday_flag, impact_weather_pct, event_count_region, tourism_index_region ` +
             `FROM \`${CTX}\` WHERE location_id=@loc AND date BETWEEN @minD AND @maxD`,
      params: { loc: snap.location_id, minD: bq.date(minD), maxD: bq.date(maxD) }, location: "EU",
    });

    const rBy: Record<string, any> = {}, cBy: Record<string, any> = {};
    for (const r of rrows) rBy[String(flat(r.date))] = r;
    for (const c of crows) cBy[String(flat(c.date))] = c;

    // All window days — days without ingested sales are has_data=false ("en attente").
    const series = dates.map((d) => {
      const r = rBy[d], c = cBy[d];
      return {
        date: d,
        has_data: !!r,
        daily_revenue: r ? Number(flat(r.daily_revenue)) : null,
        expected_revenue: r ? Number(flat(r.expected_revenue)) : null,
        residual_pct: r ? Number(flat(r.residual_pct)) : null, // % ONLY — no per-day z
        is_school_holiday: c ? !!flat(c.is_school_holiday_flag) : false,
        impact_weather_pct: c && flat(c.impact_weather_pct) != null ? Number(flat(c.impact_weather_pct)) : null,
        event_count: c && flat(c.event_count_region) != null ? Number(flat(c.event_count_region)) : null,
        tourism_index: c && flat(c.tourism_index_region) != null ? Number(flat(c.tourism_index_region)) : null,
      };
    });

    // Curated, z-free snapshot for the header/verdict.
    const commitment = {
      commitment_id: snap.commitment_id, location_id: snap.location_id, status: snap.status, verdict: snap.verdict,
      committed_action_text: snap.committed_action_text, owner_person_name: snap.owner_person_name,
      origin_action_type: snap.origin_action_type,  // re-commit an adjustment on the same card type (diagnosis panel)
      origin_suppression_key: snap.origin_suppression_key,  // child copies it → keeps the system card suppressed
      window_kind: snap.window_kind, window_start: flat(snap.window_start), window_end: flat(snap.window_end),
      window_days_expected: snap.window_days_expected, window_days_resolved: snap.window_days_resolved,
      threshold_level: snap.threshold_level,
      // the measurable goal reference (window baseline €) — lets ① show the objective even
      // before any window day has data. z stays hidden; this is a plain € baseline.
      window_expected_revenue: snap.window_expected_revenue != null ? Number(flat(snap.window_expected_revenue)) : null,
      window_residual_pct: snap.window_residual_pct, material_holiday_share: snap.material_holiday_share,
      ctx_any_school_holiday: snap.ctx_any_school_holiday, ctx_material_confound: snap.ctx_material_confound,
      action_done_status: snap.action_done_status, dispositif_note: snap.dispositif_note, retro_note: snap.retro_note,
      // Documenter (Spec 2) structured retro — so the capture UI pre-fills saved answers.
      retro_worked: snap.retro_worked, retro_change: snap.retro_change, retro_repeat: snap.retro_repeat,
      resolved_at: flat(snap.resolved_at),
      // owner + when (header) and the goal reference for "vs objectif".
      created_at: flat(snap.created_at), action_done_at: flat(snap.action_done_at),
      threshold_value: snap.threshold_value, threshold_basis: snap.threshold_basis,
      // Verdict par KPI (15/08) : le référentiel qui a JUGÉ + la bande de bruit — la page le dit.
      verdict_basis: snap.verdict_basis ?? null,
      kpi_noise_se: snap.kpi_noise_se != null ? Number(flat(snap.kpi_noise_se)) : null,
      execution_quality: snap.execution_quality,  // self-reported run quality (routes the advice)
      // Enjeu d'origine gelé à la création (26/07) — rendu VERBATIM par le bloc Enjeu du doc
      // (tier_label_fr tel quel : pill et page alignées par construction). Null → pas de bloc.
      creation_enjeu_eur_year: snap.creation_enjeu_eur_year != null ? Number(flat(snap.creation_enjeu_eur_year)) : null,
      creation_enjeu_tier_label_fr: snap.creation_enjeu_tier_label_fr ?? null,
      creation_enjeu_label_fr: snap.creation_enjeu_label_fr ?? null,
      creation_enjeu_class_key: snap.creation_enjeu_class_key ?? null,
      creation_enjeu_entangled: snap.creation_enjeu_entangled === true,
      creation_enjeu_inherited: snap.creation_enjeu_inherited === true,
      // Contexte de la version (étape 3, 27/08) — le sous-formulaire « La version suivante »
      // pré-remplit depuis la version courante ; measured_metric dérive l'étape de la vente.
      measured_metric: snap.measured_metric ?? null,
      dispositif_plus: (snap as any).dispositif_plus ?? null,
      dispositif_why: (snap as any).dispositif_why ?? null,
      dispositif_resources: (snap as any).dispositif_resources ?? null,
    };

    // §2d holiday-norm + ② named context + provenance + ③ advice (z-free, keys only)
    const asOf = parisDate(new Date().toISOString());
    const extras = await assembleEvolutionExtras(bq, snap, asOf);

    // ── Bloc KPI-vrai (owner 15/08, proto engagement-kpi-proto validé) : la mesure dans le KPI
    // DÉCLARÉ (measured_metric) — jauge tricolore + points pairs + courbe en unité KPI. Jours
    // FUTURS toujours exclus (le seed démo porte des ventes au-delà d'aujourd'hui : un jour
    // futur n'est jamais « mesuré »). Échec de mesure → champs null, jamais un chiffre inventé.
    const kpi = await buildKpiBlock(bq, snap, dates, rrows as any[], asOf).catch(() => null);

    // Move "how" hit-rates for this action type (fct_location_action_moves) — feeds the diagnosis advice.
    let move_stats: { move: string; attempts: number; hits: number }[] = [];
    if (snap.origin_action_type) {
      const [mrows] = await bq.query({
        query: `SELECT move, attempts, hits FROM \`muse-square-open-data.mart.fct_location_action_moves\`
                WHERE location_id = @loc AND action_type = @at`,
        params: { loc: snap.location_id, at: snap.origin_action_type },
        types: { loc: "STRING", at: "STRING" }, location: "EU",
      });
      move_stats = (mrows as any[]).map((r) => ({
        move: String(flat(r.move)), attempts: Number(flat(r.attempts)) || 0, hits: Number(flat(r.hits)) || 0,
      }));
    }

    // "Lieux comparables" — an analog to try when under-performing. Resolve the venue's vertical,
    // map the card's action_type → lever, read the vetted plays (never a promised result).
    let best_in_class: any[] = [];
    let site_name: string | null = null;
    try {
      // site_name sur la MÊME requête contexte (owner 19/07) : la page évolution doit dire
      // à quel établissement l'engagement se rapporte — aucun appel supplémentaire.
      const [irows] = await bq.query({
        query: `SELECT client_industry_code, site_name FROM \`${BQ_PROJECT}.semantic.vw_insight_event_ai_location_context\` WHERE location_id=@loc LIMIT 1`,
        params: { loc: snap.location_id }, location: "EU",
      });
      site_name = irows.length ? String(flat(irows[0].site_name) || "") || null : null;
      const industry = irows.length ? String(flat(irows[0].client_industry_code) || "") : "";
      if (industry) {
        // All intents (pivot/reinforce/scale) — card-kit filters to the one that fits the verdict.
        best_in_class = await getBestInClassPlays(bq, industry, leverForActionType(snap.origin_action_type, snap.origin_driver), { limit: 9 });
      }
    } catch (e) { /* store/profile absent → slot keeps its placeholder */ }

    // LA CHAÎNE LUE (27/08, chantier versionning) — l'historique du dispositif, du premier test à
    // celui-ci : chaque version avec SON verdict et SON effet sur SON KPI (commitmentEffect, le
    // foyer — jamais le résidu de CA d'office). Rendu par renderEvolution seulement quand la
    // chaîne compte plus d'une version : une V1 seule n'a pas d'historique à raconter.
    const lineage = await buildLineage(bq, snap);

    return json({ ok: true, commitment, series, kpi, move_stats, best_in_class, site_name, lineage, ...extras });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
