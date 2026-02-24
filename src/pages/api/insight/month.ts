import { performance } from "node:perf_hooks";
import { runAIPackagerClaude } from "../../../lib/ai/runtime/runPackager";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";

import { makeBQClient } from "../../../lib/bq";

let BQ_CLIENT: BigQuery | null = null;
function getBigQueryClient(projectId: string): BigQuery {
  if (!BQ_CLIENT) BQ_CLIENT = makeBQClient(projectId);
  return BQ_CLIENT;
}

export const prerender = false;

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing or invalid field: ${name}`);
  }
  return v.trim();
}

function ymdUtcToday(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function bqDateToYmd(v: any): string | null {
  if (!v) return null;

  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : v.slice(0, 10);

  if (v instanceof Date) return v.toISOString().slice(0, 10);

  if (typeof v === "object") {
    // common BigQuery wrappers
    if (typeof v.value === "string") return v.value;
    if (v.value instanceof Date) return v.value.toISOString().slice(0, 10);

    if (typeof v.toJSON === "function") {
      const j = v.toJSON();
      if (typeof j === "string") return j.slice(0, 10);
    }
  }

  return null;
}

function normalizeTopDaysField(day: any, warnOnce: { fired: boolean }): any {
  // top_days sometimes arrives as a JSON string at runtime; normalize to an array of structs.
  if (typeof day?.top_days !== "string") return day;

  try {
    const parsed = JSON.parse(day.top_days);

    // It may be either { top_days: [...] } or [...] directly
    const arr = Array.isArray(parsed) ? parsed : parsed?.top_days;

    return {
      ...day,
      top_days: Array.isArray(arr) ? arr : [],
    };
  } catch (e) {
    if (!warnOnce.fired) {
      warnOnce.fired = true;
      console.warn("[MONTH] Failed to parse top_days JSON string; defaulting to [].", {
        sample: String(day.top_days).slice(0, 200),
      });
    }
    return { ...day, top_days: [] };
  }
}
async function runBQ(
  bigquery: BigQuery,
  stage: string,
  query: string,
  params: Record<string, any>,
  rid: string | null
) {
  const t0 = Date.now();
  try {
    const [rows] = await bigquery.query({
      query,
      location: "EU",
      params,
    });
    console.log(`[MONTH][BQ OK] ${stage} (${Date.now() - t0}ms)`, { rid });
    return rows;

  } catch (err: any) {
    console.error(`[MONTH][BQ FAIL] ${stage} (${Date.now() - t0}ms)`, {
      message: err?.message,
      code: err?.code,
      errors: err?.errors,
    });
    const e = new Error(`${stage}: ${err?.message ?? "Unknown BigQuery error"}`);
    (e as any).stage = stage;
    (e as any).bq = { code: err?.code, errors: err?.errors };
    throw e;
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  const rid = request.headers.get("x-request-id") ?? null;
  console.log("[MONTH][REQ]", { rid, url: request.url });

  const h = request.headers;

  console.log("[MONTH][REQ META]", {
    rid,
    url: request.url,
    referer: h.get("referer"),
    ua: h.get("user-agent"),
    accept: h.get("accept"),
    purpose: h.get("purpose") ?? h.get("sec-purpose"),
    fetchMode: h.get("sec-fetch-mode"),
    fetchDest: h.get("sec-fetch-dest"),
    fetchSite: h.get("sec-fetch-site"),
  });

  // --------------------------------------
  // HARD ASSERT: window start param MUST exist
  // Accept both: window_start_date (legacy UI) and window_start_date (new contract)
  // --------------------------------------
  const urlCheck = new URL(request.url);

  const hasWindowStart =
    urlCheck.searchParams.has("window_start_date") ||
    urlCheck.searchParams.has("window_start_date");

  if (!hasWindowStart) {
    console.error("[MONTH][FATAL] Missing window start param (window_start_date or window_start_date)", {
      rid,
      full_url: request.url,
      search: urlCheck.search,
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: "window_start_date (or window_start_date) is required but missing",
        full_querystring: urlCheck.search,
      }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const t_req0 = performance.now();
  let bq_total_ms = 0;

  try {
    // ---- AUTH + CONTEXT (SOURCE OF TRUTH) ----
    requireString((locals as any).clerk_user_id, "locals.clerk_user_id");

    const location_id = requireString(
      (locals as any).location_id,
      "locals.location_id"
    );

    // ---- QUERY PARAMS ----
    const url = new URL(request.url);
    const anchor_date = url.searchParams.get("anchor_date") || "";
    const selected_date = url.searchParams.get("selected_date") || "";
    const today_str = ymdUtcToday();

    const window_start_date = requireString(
      url.searchParams.get("window_start_date") ??
        url.searchParams.get("window_start_date"),
      "window_start_date"
    );

    // ---- BIGQUERY CLIENT ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    requireString(process.env.BQ_DATASET, "BQ_DATASET");
    requireString(process.env.BQ_TABLE, "BQ_TABLE");

    const bigquery = getBigQueryClient(projectId);

    async function runBQ_timed(stage: string, query: string, params: Record<string, any>) {
      const t0 = performance.now();
      const rows = await runBQ(bigquery, stage, query, params, rid);
      const t1 = performance.now();
      bq_total_ms += (t1 - t0);
      return rows;
    }

    // --------------------
    // Canonical semantic surfaces (BigQuery dataset = "semantic")
    // --------------------
    const PROJECT_ID = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");

    // HARD LOCK — these views live in the BigQuery DATASET named "semantic"
    const DATASET_SEMANTIC = "semantic";

    const T_WINDOW = `\`${PROJECT_ID}.${DATASET_SEMANTIC}.vw_insight_event_30d_window_surface\``;
    const T_DAYS   = `\`${PROJECT_ID}.${DATASET_SEMANTIC}.vw_insight_event_30d_surface\``;
    const T_LOCCTX = `\`${PROJECT_ID}.${DATASET_SEMANTIC}.vw_insight_event_ai_location_context\``;
    const T_REGCTX = `\`${PROJECT_ID}.${DATASET_SEMANTIC}.vw_insight_event_ai_region_context\``;

    console.log("[MONTH][BQ TABLES]", { T_WINDOW, T_DAYS, T_LOCCTX, T_REGCTX });

    // 1) Resolve window_start_date (authoritative, keyed to window_surface)
    function asYmd(v: any): string | null {
      return bqDateToYmd(v);
    }

    function weatherSeverityFromWmo(code: any): number {
      const c = Number(code);
      if (!Number.isFinite(c)) return -1; // unknown = ignore
      // heuristic severity (truthy mapping; adjust if you have a better internal scale)
      if (c >= 95 && c <= 99) return 5; // thunderstorm
      if (c >= 80 && c <= 82) return 4; // heavy rain showers
      if (c >= 71 && c <= 77) return 3; // snow
      if ((c >= 61 && c <= 67) || (c >= 51 && c <= 57)) return 2; // rain/drizzle
      if (c === 45 || c === 48) return 1; // fog
      return 0; // clear/mostly clear/cloudy
    }

    function topNByScore(days: any[], n: number, dir: "asc" | "desc") {
      const xs = days
        .map((d) => ({ ...d, date_ymd: asYmd(d?.date) }))
        .filter((d) => d.date_ymd && Number.isFinite(Number(d?.opportunity_score_final_local)));

      xs.sort((a, b) => {
        const sa = Number(a.opportunity_score_final_local);
        const sb = Number(b.opportunity_score_final_local);
        return dir === "asc" ? sa - sb : sb - sa;
      });

      return xs.slice(0, n);
    }

    function worstNByWeather(days: any[], n: number) {
      const xs = days
        .map((d) => ({
          ...d,
          date_ymd: asYmd(d?.date),
          _sev_code: weatherSeverityFromWmo(d?.weather_code),
          _alert: Number(d?.weather_alert_level ?? -1),
          _pp: Number(d?.precip_probability_max_pct ?? -1),
          _wind: Number(d?.wind_speed_10m_max ?? -1),
        }))
        .filter((d) => d.date_ymd);

      xs.sort((a, b) => {
        if (Number.isFinite(b._alert) && Number.isFinite(a._alert) && b._alert !== a._alert) return b._alert - a._alert;
        if (Number.isFinite(b._pp) && Number.isFinite(a._pp) && b._pp !== a._pp) return b._pp - a._pp;
        if (Number.isFinite(b._wind) && Number.isFinite(a._wind) && b._wind !== a._wind) return b._wind - a._wind;
        if (b._sev_code !== a._sev_code) return b._sev_code - a._sev_code;
        return Number(a?.opportunity_score_final_local ?? 0) - Number(b?.opportunity_score_final_local ?? 0);
      });

      return xs.slice(0, n);
    }

    function topNByCompetition(days: any[], n: number) {
      const xs = days
        .map((d) => ({ ...d, date_ymd: asYmd(d?.date) }))
        .filter((d) => d.date_ymd && Number.isFinite(Number(d?.events_within_10km_count)));

      xs.sort((a, b) => Number(b.events_within_10km_count) - Number(a.events_within_10km_count));
      return xs.slice(0, n);
    }

    function topNByRiskBucket(days: any[], n: number) {
      const xs = days
        .map((d) => ({ ...d, date_ymd: asYmd(d?.date) }))
        .filter((d) => d.date_ymd && String(d?.relative_rank_bucket ?? "") === "risk")
        .filter((d) => Number.isFinite(Number(d?.opportunity_score_final_local)));

      xs.sort((a, b) => Number(a.opportunity_score_final_local) - Number(b.opportunity_score_final_local));
      return xs.slice(0, n);
    }

    // 2) Fetch window-level semantics (authoritative)
    const sqlWindow = `
      SELECT
        semantic_contract_version,
        display_horizon,
        display_label,
        ai_analysis_scope_guard,
        key_takeaway,

        location_id,
        window_start_date,
        window_end_date,

        ARRAY(
          SELECT AS STRUCT
            t.date,
            t.opportunity_regime,
            t.opportunity_score_final_local,
            t.opportunity_medal,
            t.weather_code
          FROM UNNEST(top_days) AS t
        ) AS top_days,

        days_count,
        days_a,
        days_b,
        days_c,
        days_risk,
        days_top_bucket,

        score_min,
        score_max,

        days_missing_weather
      FROM ${T_WINDOW}
      WHERE location_id = @location_id
        AND window_start_date = DATE(@window_start_date)
      LIMIT 1
    `;

    // 3) Fetch 30-day grid semantics (authoritative for the calendar grid)
    const sqlDays = `
      SELECT
        semantic_contract_version,
        display_horizon,
        display_label,
        window_summary_label,
        ai_analysis_scope_guard,
        key_takeaway,

        date,
        location_id,

        opportunity_regime,
        opportunity_score_final_local,
        opportunity_medal,

        weather_code,
        weather_alert_level,
        precip_probability_max_pct,
        wind_speed_10m_max,

        events_within_10km_count,

        is_public_holiday_fr_flag,
        is_school_holiday_flag,
        is_weekend,
        is_selected_day,
        available_next_views,
        relative_rank_bucket
      FROM ${T_DAYS}
      WHERE location_id = @location_id
        AND date BETWEEN DATE(@window_start_date)
            AND DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY)
      ORDER BY date ASC
    `;

    // 4) Fetch AI Location context (company + client location + admin + geo)
    const sqlCtx = `
      SELECT
        location_id,

        -- Company profile (AI context)
        company_activity_type,
        location_type,
        event_time_profile,
        primary_audience_1,
        primary_audience_2,
        capacity_sensitivity,
        geographic_catchment,
        company_industry,

        -- Client location (admin + geo)
        location_label,
        cl_location_type,
        active_flag,
        city_id,
        city_name,
        region_code_insee,
        region_code_nuts2,
        region_name,
        latitude,
        longitude,
        geo_point,
        client_industry_code,
        location_access_pattern,
        origin_city_ids

      FROM ${T_LOCCTX}
      WHERE location_id = @location_id
      ORDER BY active_flag DESC
      LIMIT 1
    `;

    // 4b) Fetch Region daily AI context for this location's region (date × region)
    const sqlRegion = `
      SELECT
        date,
        region_code_insee,
        event_count_region,
        is_public_holiday_flag,
        public_holiday_name_fr,
        is_school_holiday_flag,
        school_holiday_name,
        is_commercial_event_flag_region,
        commercial_event_names_region
      FROM ${T_REGCTX}
      WHERE region_code_insee = @region_code_insee
        AND date BETWEEN DATE(@window_start_date)
            AND DATE_ADD(DATE(@window_start_date), INTERVAL 29 DAY)
      ORDER BY date ASC
    `;

    const [windowRows, daysRows, ctxRows] = await Promise.all([
      runBQ_timed("fetch_window", sqlWindow, { location_id, window_start_date }),
      runBQ_timed("fetch_days", sqlDays, { location_id, window_start_date }),
      runBQ_timed("fetch_location_context", sqlCtx, { location_id, window_start_date })
    ]);

    const window =
      Array.isArray(windowRows) && windowRows.length > 0 ? (windowRows[0] as any) : null;

    const days = Array.isArray(daysRows) ? daysRows : [];

    const ctxList = Array.isArray(ctxRows) ? (ctxRows as any[]) : [];
    const location_context = ctxList.length > 0 ? ctxList[0] : null;

    console.log("[MONTH][CTX RAW]", {
      ctxRows_len: ctxList.length,
      sample0: ctxList[0] ?? null,
    });

    console.log("[MONTH][CTX RAW]", {
      ctxRows_len: Array.isArray(ctxRows) ? ctxRows.length : null,
      keys: location_context && typeof location_context === "object" ? Object.keys(location_context) : null,
      region_code_insee: (location_context as any)?.region_code_insee ?? "__missing__",
      city_id: (location_context as any)?.city_id ?? "__missing__",
      city_name: (location_context as any)?.city_name ?? "__missing__",
    });
    
    function bqScalarToString(v: any): string | null {
      if (v == null) return null;

      if (typeof v === "string") {
        const s = v.trim();
        return s ? s : null;
      }

      if (typeof v === "number") {
        return Number.isFinite(v) ? String(v) : null;
      }

      // common BigQuery wrappers: { value: "..." } or { value: 123 }
      if (typeof v === "object") {
        if (typeof v.value === "string") {
          const s = v.value.trim();
          return s ? s : null;
        }
        if (typeof v.value === "number") {
          return Number.isFinite(v.value) ? String(v.value) : null;
        }
        if (typeof v.toString === "function") {
          const s = String(v).trim();
          return s ? s : null;
        }
      }

      return null;
    }

    // --- region_code_insee resolution (from location_context ONLY; no fallback) ---
    const region_code_insee_raw = (location_context as any)?.region_code_insee ?? null;
    const region_code_insee = bqScalarToString(region_code_insee_raw);

    console.log("[MONTH][REGION] region_code_insee:", region_code_insee, {
      from_ctx: region_code_insee,
      raw_type: typeof region_code_insee_raw,
      raw_value: region_code_insee_raw,
    });

    // --- fetch region daily context (date × region_code_insee) ---
    const regionRows = region_code_insee
      ? await runBQ_timed("fetch_region_ai_context_daily", sqlRegion, {
          region_code_insee,
          window_start_date,
        })
      : [];

    // --- enrich days with region context (same date) ---
    const regionByDate = new Map<string, any>();

    for (const r of Array.isArray(regionRows) ? regionRows : []) {
      const k = bqDateToYmd((r as any)?.date);
      if (!k) continue;
      // deterministic: keep first row for the date
      if (!regionByDate.has(k)) regionByDate.set(k, r);
    }

    const days_enriched = days.map((day: any) => {
      const k = bqDateToYmd((day as any)?.date);
      const r = k ? regionByDate.get(k) : null;
      if (!r) return day;

      return {
        ...day,

        // Names come from region context
        public_holiday_name_fr: (r as any).public_holiday_name_fr ?? null,
        school_holiday_name: (r as any).school_holiday_name ?? null,

        // Commercial events
        is_commercial_event_flag_region: (r as any).is_commercial_event_flag_region ?? false,
        commercial_event_names_region: Array.isArray((r as any).commercial_event_names_region)
          ? (r as any).commercial_event_names_region
          : [],
      };
    });

    // Dedupe AFTER enrichment (grain-safe: 1 row per date)
    const days_deduped = dedupeDaysByDate(days_enriched);

    if (process.env.NODE_ENV !== "production") {
      console.log("[MONTH][DEDUP DAYS]", {
        before: Array.isArray(days_enriched) ? days_enriched.length : null,
        after: Array.isArray(days_deduped) ? days_deduped.length : null,
      });
    }

    function nonEmptyString(v: any): string | null {
      const s = typeof v === "string" ? v.trim() : "";
      return s ? s : null;
    }

    function normalizeStringArray(v: any): string[] {
      if (!Array.isArray(v)) return [];
      // strict: keep only non-empty strings
      const out = v
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter(Boolean);

      // stable + deterministic dedupe
      return Array.from(new Set(out));
    }

    function dedupeDaysByDate(days: any[]) {
      const byDate = new Map<string, any>();

      for (const d of Array.isArray(days) ? days : []) {
        const k = bqDateToYmd(d?.date);
        if (!k) continue;

        // Deterministic “keep first” (after SQL ORDER BY date ASC this is stable)
        if (!byDate.has(k)) byDate.set(k, d);
      }

      const out = Array.from(byDate.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([, v]) => v);

      return out;
    }

    function extractSpecialDays(days: any[]) {
      const out: Array<{
        date: string; // YYYY-MM-DD
        labels: string[]; // human-readable labels (incl. Black Friday, etc.)
        types: Array<"public_holiday" | "school_holiday" | "commercial_event">;
        commercial_event_names_region: string[]; // explicit
      }> = [];

      for (const d of Array.isArray(days) ? days : []) {
        const date = bqDateToYmd(d?.date);
        if (!date) continue;

        const labels: string[] = [];
        const types: Array<"public_holiday" | "school_holiday" | "commercial_event"> = [];

        const ph = nonEmptyString(d?.public_holiday_name_fr);
        if (ph) {
          labels.push(ph);
          types.push("public_holiday");
        }

        const sh = nonEmptyString(d?.school_holiday_name);
        if (sh) {
          labels.push(sh);
          types.push("school_holiday");
        }

        const ce = normalizeStringArray(d?.commercial_event_names_region);
        if (ce.length > 0) {
          // this is where Black Friday etc come from
          labels.push(...ce);
          types.push("commercial_event");
        }

        if (labels.length === 0) continue;

        out.push({
          date,
          labels: Array.from(new Set(labels)), // deterministic dedupe
          types: Array.from(new Set(types)) as any,
          commercial_event_names_region: ce,
        });
      }

      // deterministic ordering: chronological
      out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

      return out;
    }

    const special_days = extractSpecialDays(days_deduped);

    // --------------------------------------------
    // Translate known commercial event labels to FR (fast server-side fix)
    // --------------------------------------------
    function translateEventLabelFr(s: any): any {
      const v = typeof s === "string" ? s.trim() : "";
      if (!v) return s;

      const dict: Record<string, string> = {
        "French Winter Sales": "Soldes d’hiver",
        "French Summer Sales": "Soldes d’été",
        "Valentine's Day": "Saint-Valentin",
      };

      return dict[v] ?? v;
    }

    // translate special_days labels
    for (const sd of Array.isArray(special_days) ? special_days : []) {
      if (Array.isArray(sd.labels)) {
        sd.labels = sd.labels.map(translateEventLabelFr);
      }
      if (Array.isArray(sd.commercial_event_names_region)) {
        sd.commercial_event_names_region = sd.commercial_event_names_region.map(translateEventLabelFr);
      }
    }

    // also translate the enriched days (so UI day cells can reuse later if needed)
    for (const d of Array.isArray(days_deduped) ? days_deduped : []) {
      if (Array.isArray((d as any).commercial_event_names_region)) {
        (d as any).commercial_event_names_region = (d as any).commercial_event_names_region.map(translateEventLabelFr);
      }
    }

    console.log("[MONTH][SPECIAL DAYS]", {
      count: special_days.length,
      sample: special_days[0] ?? null,
    });


    // --- sanity check log (right after days_enriched) ---
    console.log("[MONTH][REGION ENRICH]", {
      region_rows: Array.isArray(regionRows) ? regionRows.length : null,
      days_rows: Array.isArray(days) ? days.length : null,
      matched_dates: regionByDate.size,
      sample_enriched: days_enriched?.[0]
        ? {
            date: bqDateToYmd(days_enriched[0]?.date),
            public_holiday_name_fr: (days_enriched[0] as any)?.public_holiday_name_fr ?? null,
            is_commercial_event_flag_region: (days_enriched[0] as any)?.is_commercial_event_flag_region ?? null,
            commercial_event_names_region_len: Array.isArray((days_enriched[0] as any)?.commercial_event_names_region)
              ? (days_enriched[0] as any).commercial_event_names_region.length
              : null,
          }
        : null,
    });

    const worst_score_days = topNByScore(days_deduped, 3, "asc");
    const best_score_days  = topNByScore(days_deduped, 3, "desc");
    const worst_weather_days = worstNByWeather(days_deduped, 3);
    const worst_competition_days = topNByCompetition(days_deduped, 3);
    const risk_bucket_days = topNByRiskBucket(days_deduped, 3);

    // computed window metrics used BOTH for AI input and for UI text rendering
    const computed_window = (() => {
      const out = {
        days_count: Array.isArray(days_deduped) ? days_deduped.length : 0,
        days_a: 0,
        days_b: 0,
        days_c: 0,
        days_risk: 0,
        days_top_bucket: 0,
        score_min: null as number | null,
        score_max: null as number | null,
      };

      for (const d of Array.isArray(days_deduped) ? days_deduped : []) {
        const s = Number(d?.opportunity_score_final_local);
        if (Number.isFinite(s)) {
          out.score_min = out.score_min === null ? s : Math.min(out.score_min, s);
          out.score_max = out.score_max === null ? s : Math.max(out.score_max, s);
        }

        const medal = String(d?.opportunity_medal ?? "").toUpperCase();
        if (medal === "A") out.days_a += 1;
        else if (medal === "B") out.days_b += 1;
        else if (medal === "C") out.days_c += 1;

        const bucket = String(d?.relative_rank_bucket ?? "");
        if (bucket === "risk") out.days_risk += 1;
        if (bucket === "top") out.days_top_bucket += 1;
      }

      return out;
    })();

    function hasMeaningfulMeteoSignal(days: any[]): boolean {
      const xs = Array.isArray(days) ? days : [];
      for (const d of xs) {
        const alert = Number(d?.weather_alert_level ?? 0);
        const pp = Number(d?.precip_probability_max_pct ?? -1);
        const wind = Number(d?.wind_speed_10m_max ?? -1);
        if (alert > 0) return true;
        if (Number.isFinite(pp) && pp >= 60) return true;
        if (Number.isFinite(wind) && wind >= 40) return true;
      }
      return false;
    }

    // --------------------------------------------
    // STEP 2 — HARD AI SHORT-CIRCUIT (LATENCY KILLER)
    // --------------------------------------------
    let shouldRunAI =
      computed_window.days_count === 30 &&
      (
        computed_window.days_risk > 0 ||
        hasMeaningfulMeteoSignal(days_deduped) ||
        worst_competition_days.some(d => Number(d?.events_within_10km_count ?? 0) > 0)
      );

    // HARD GUARD — if BQ is already slow, skip AI to protect UX
    if (bq_total_ms > 800) shouldRunAI = false;

    // DEV ONLY — trace AI decision
    if (process.env.NODE_ENV !== "production") {
      console.log("[MONTH][AI DECISION]", {
        shouldRunAI,
        days_count: computed_window.days_count,
        days_risk: computed_window.days_risk,
        special_days: special_days.length,
      });
    }

    // 4.5) AI packager (month window -> narration JSON)
    let ai: any = null;

    const include_debug = process.env.NODE_ENV !== "production";

    if (!window) {
      ai = {
        ok: false,
        mode: "month",
        output: null,
        errors: ["month_window is null (no window row found)"],
        warnings: [],
        raw_text: "",
      };

    } else if (!location_context) {
      ai = {
        ok: false,
        mode: "month",
        output: null,
        errors: ["location_context is null (no location context row found)"],
        warnings: [],
        raw_text: "",
      };

    } else if (!shouldRunAI) {
      // --------------------------------------------
      // STEP 2 — HARD AI SHORT-CIRCUIT (FINAL)
      // --------------------------------------------
      ai = {
        ok: false,
        mode: "month",
        output: null,
        errors: ["deterministic_window"],
        warnings: [],
        raw_text: "",
      };

      if (process.env.NODE_ENV !== "production") {
        console.log("[MONTH][AI SKIPPED]", {
          reason: "deterministic_window",
          days_count: computed_window.days_count,
          days_risk: computed_window.days_risk,
          worst_weather_days: worst_weather_days.length,
          worst_competition_days: worst_competition_days.length,
          special_days: special_days.length,
        });
      }

    } else {
      try {
          // --------------------------------------------
          // Canonical AI input for MONTH prompts
          // - NEVER leak raw window counts (they can be inconsistent vs deduped days)
          // - NEVER leak kitchen fields (availability, guards)
          // --------------------------------------------

          // Strip kitchen fields from window BEFORE feeding AI
          const {
            ai_analysis_scope_guard: _drop_guard,
            days_missing_weather: _drop_missing,
            key_takeaway: _drop_key_takeaway, // optional: keep if you want, I drop to avoid kitchen-like phrasing
            ...window_no_kitchen
          } = (window ?? {}) as any;

          // Canonical AI row
          const month_ai_row = {
            ...window_no_kitchen,

            // canonical window metrics computed from the 30 deduped days
            ...computed_window,

            window_start_date_resolved: window_start_date,

            // canonical 30 days ONLY
            days: days_deduped,

            // extracted special days
            special_days,

            // computed rankings (already derived from days_deduped)
            best_score_days,
            worst_score_days,
            worst_weather_days,
            worst_competition_days,
            risk_bucket_days,
          };

          const ai_orch = await runAIPackagerClaude({
            mode: "month",
            submode: "orchestrator",
            row: month_ai_row,
            aiLocationContextRow: location_context,
          });

          let ai_window_summary: any = null;
          let ai_special_days: any = null;

          if (ai_orch.ok && ai_orch.output?.run_month_window_summary === true) {
            ai_window_summary = await runAIPackagerClaude({
              mode: "month",
              submode: "window_summary",
              row: month_ai_row,
              aiLocationContextRow: location_context,
            });
          }

          if (ai_orch.ok && ai_orch.output?.run_month_special_days === true) {
            ai_special_days = await runAIPackagerClaude({
              mode: "month",
              submode: "special_days",
              row: month_ai_row,
              aiLocationContextRow: location_context,
            });
          }

          // Keep "ai" for backward compatibility (existing logs / trace)
          ai = {
            ok: true,
            mode: "month",
            output: {
              orchestrator: ai_orch?.ok ? ai_orch.output : null,
              window_summary: ai_window_summary?.ok ? ai_window_summary.output : null,
              special_days: ai_special_days?.ok ? ai_special_days.output : null,
            },
            errors: [],
            warnings: [],
            raw_text: "",
          };

          console.log("[MONTH][AI SUBCALLS]", {
            attempted: true,

            orch_ok: ai_orch?.ok ?? null,
            orch_raw_text_len: typeof ai_orch?.raw_text === "string" ? ai_orch.raw_text.length : null,

            ws_ok: ai_window_summary?.ok ?? null,
            ws_raw_text_len:
              typeof ai_window_summary?.raw_text === "string"
                ? ai_window_summary.raw_text.length
                : null,

            sd_ok: ai_special_days?.ok ?? null,
            sd_raw_text_len:
              typeof ai_special_days?.raw_text === "string"
                ? ai_special_days.raw_text.length
                : null,
          });

        } catch (e: any) {
          ai = {
            ok: false,
            mode: "company_centered",
            output: null,
            errors: [`runAIPackagerClaude threw: ${e?.message ?? String(e)}`],
            warnings: [],
            raw_text: "",
          };
        }
      }

        // 5) Output assembly (no semantic transformation)

        const ai_input =
          window && location_context
            ? {
                ...(window ?? {}),
                special_days,
                best_score_days,
                worst_score_days,
                worst_weather_days,
                worst_competition_days,
                user_question: "month_takeaway",
              }
            : null;

        return new Response(
          JSON.stringify({
            ok: true,
            debug_month: include_debug
              ? {
                  days_raw: Array.isArray(days) ? days.length : null,
                  days_enriched: Array.isArray(days_enriched) ? days_enriched.length : null,
                  days_deduped: Array.isArray(days_deduped) ? days_deduped.length : null,
                  special_days: Array.isArray(special_days) ? special_days.length : null,
                  ai_mode: ai?.mode ?? null,
                  ai_ok: ai?.ok ?? null,
                  ai_has_output: Boolean(ai?.output),
                  ai_output_keys:
                    ai?.output && typeof ai.output === "object" ? Object.keys(ai.output) : null,
                }
              : null,

            // ---- PROOF / TRACEABILITY ----
            trace: {
              location_id_from_locals: location_id,
              location_id_from_query: new URL(request.url).searchParams.get("location_id"),
              full_querystring: new URL(request.url).search,

              ai_trace: {
                attempted: Boolean(window && location_context),
                ai_is_null: ai === null,
                ai_ok: ai?.ok ?? null,
                ai_has_output: Boolean(ai?.output),
                ai_errors: Array.isArray(ai?.errors) ? ai.errors : null,
                ai_raw_text_len: typeof ai?.raw_text === "string" ? ai.raw_text.length : null,
              },
            },

            // ---- ACTUAL PAYLOAD ----
            window_start_date_resolved: window_start_date,
            window,
            days: days_deduped,
            special_days,
            location_context,
            ai_month: {
              window_summary: ai?.output?.window_summary ?? null,
              special_days: ai?.output?.special_days ?? null,
            },

            ...(include_debug ? { ai_input } : {}),

            ai_points_cles_text: (() => {
              const ws = ai?.output?.window_summary;
              const sd = ai?.output?.special_days;

              // -----------------------------
              // Minimal AI safety gates
              // If ANY unsafe/mismatch is detected, we bypass AI completely
              // and render deterministic strict sections.
              // -----------------------------
              // Ban only known useless boilerplate lines (exact match),
              // NOT normal French words that can appear in valid summaries.
              const banned: RegExp[] = [
                /^données météo disponibles(\s+sur\s+la\s+fenêtre)?\.?$/i,
                /^repères calendrier(\s*\(.*\))?\.?$/i,
              ];

              function norm(s: string): string {
                return s.replace(/\s+/g, " ").trim();
              }

              function dropReason(raw: any): string | null {
                if (typeof raw !== "string") return null;
                const s = norm(raw);
                if (!s) return null;

                if (banned.some((re) => re.test(s))) return "banned";

                if (/sans\s+jours\s+A,\s*B\s+ou\s+C/i.test(s)) return "false_pattern";
                if (/0\s+jours\s+solides\s*\(A\/B\)\s+sur\s+30/i.test(s)) return "false_pattern";

                // Validate explicit A/B/C counts against computed_window (single source of truth)
                const ma = s.match(/(\d+)\s+jours?\s+A\b/i);
                const mb = s.match(/(\d+)\s+jours?\s+B\b/i);
                const mc = s.match(/(\d+)\s+jours?\s+C\b/i);

                if (ma && Number(ma[1]) !== computed_window.days_a) return "count_mismatch";
                if (mb && Number(mb[1]) !== computed_window.days_b) return "count_mismatch";
                if (mc && Number(mc[1]) !== computed_window.days_c) return "count_mismatch";

                return null;
              }

              // -----------------------------
              // Deterministic strict formatter (FR)
              // -----------------------------
              function ymdToFrShort(ymd: string): string {
                // expects YYYY-MM-DD
                const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (!m) return ymd;
                const mm = Number(m[2]);
                const dd = Number(m[3]);
                const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
                const mon = months[mm - 1] ?? "";
                return mon ? `${dd} ${mon}` : `${dd}`;
              }

              function ymdPlusOne(ymd: string): string | null {
                const d = new Date(`${ymd}T00:00:00Z`);
                if (!Number.isFinite(d.getTime())) return null;
                d.setUTCDate(d.getUTCDate() + 1);
                return d.toISOString().slice(0, 10);
              }

              function renderSpecialDaysRanges(): string[] {
                // group consecutive dates that share the exact same labels (order-insensitive)
                const items = Array.isArray(special_days) ? special_days : [];
                const rows = items
                  .map((sd0: any) => {
                    const date = typeof sd0?.date === "string" ? sd0.date.trim() : "";
                    const labels = Array.isArray(sd0?.labels)
                      ? sd0.labels.filter((x: any) => typeof x === "string" && x.trim()).map((x: string) => x.trim())
                      : [];
                    const key = labels.slice().sort().join(" | ");
                    return date && labels.length ? { date, labels, key } : null;
                  })
                  .filter(Boolean) as Array<{ date: string; labels: string[]; key: string }>;

                // already chronological, but ensure stable
                rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

                const out: string[] = [];
                let i = 0;
                while (i < rows.length) {
                  const start = rows[i];
                  let end = start;
                  let j = i;

                  while (j + 1 < rows.length) {
                    const next = rows[j + 1];
                    const expectedNextDate = ymdPlusOne(end.date);
                    if (!expectedNextDate) break;
                    if (next.key === start.key && next.date === expectedNextDate) {
                      end = next;
                      j += 1;
                    } else {
                      break;
                    }
                  }

                  const labelText = start.labels.join(", ");
                  if (start.date === end.date) {
                    out.push(`- ${ymdToFrShort(start.date)} : ${labelText}`);
                  } else {
                    out.push(`- ${ymdToFrShort(start.date)}–${ymdToFrShort(end.date)} : ${labelText}`);
                  }

                  i = j + 1;
                }

                return out;
              }

              function renderMeteoBullets(): string[] {
                const out: string[] = [];
                const xs = Array.isArray(worst_weather_days) ? worst_weather_days : [];
                for (const d of xs.slice(0, 3)) {
                  const dd = bqDateToYmd(d?.date) ?? d?.date_ymd ?? null;
                  if (!dd) continue;

                  const alert = Number(d?.weather_alert_level ?? 0);
                  const pp = Number(d?.precip_probability_max_pct ?? -1);
                  const wind = Number(d?.wind_speed_10m_max ?? -1);

                  const bits: string[] = [];
                  if (alert > 0) bits.push(`alerte ${alert}`);
                  if (Number.isFinite(pp) && pp >= 60) bits.push(`${pp}% pluie`);
                  if (Number.isFinite(wind) && wind >= 40) bits.push(`${wind} km/h vent`);

                  if (bits.length) out.push(`- ${ymdToFrShort(dd)} : ${bits.join(", ")}`);
                }
                return out;
              }

              function deterministicText(): string | null {
                // Enforce the single-source-of-truth counts (computed_window)
                if (!computed_window || computed_window.days_count !== 30) {
                  console.warn("[MONTH][TEXT] computed_window invalid; refusing to render");
                  return null;
                }

                const lines: string[] = [];

                // Intro (operational, FR)
                lines.push(
                  "La période présente beaucoup d’opportunités et peu de contraintes d’organisation, avec les particularités suivantes :"
                );

                // Jours spéciaux (only if exists)
                const sdBullets = renderSpecialDaysRanges();
                if (sdBullets.length) {
                  lines.push("");
                  lines.push("Jours spéciaux");
                  lines.push(...sdBullets);
                }

                // Score d’opportunité (always)
                lines.push("");
                lines.push("Score d’opportunité");
                lines.push(`- Répartition sur 30 jours : ${computed_window.days_a} jour(s) A, ${computed_window.days_b} jour(s) B, ${computed_window.days_c} jour(s) C`);
                lines.push(`- ${computed_window.days_risk} jour(s) à risque`);

                if (typeof computed_window.score_min === "number" && typeof computed_window.score_max === "number") {
                  lines.push(`- Scores observés entre ${computed_window.score_min} et ${computed_window.score_max}`);
                }

                if (Array.isArray(best_score_days) && best_score_days.length > 0) {
                  const topDates = best_score_days
                    .map((d: any) => bqDateToYmd(d?.date) ?? d?.date_ymd ?? null)
                    .filter((x: any) => typeof x === "string" && x.trim())
                    .slice(0, 3) as string[];
                  if (topDates.length) lines.push(`- Top 3 dates : ${topDates.map(ymdToFrShort).join(", ")}`);
                }

                // Météo (ONLY if meaningful)
                if (hasMeaningfulMeteoSignal(days_deduped)) {
                  const meteo = renderMeteoBullets();
                  if (meteo.length) {
                    lines.push("");
                    lines.push("Météo");
                    lines.push(...meteo);
                  }
                }

                return lines.join("\n");
              }

              // -----------------------------
              // Decide: keep AI phrasing ONLY if fully safe;
              // otherwise deterministic strict output.
              // -----------------------------
              let aiUnsafe = false;

              // Check the specific fields you were using
              const candidates: Array<{ label: string; value: any }> = [
                { label: "ws.headline", value: ws?.headline },
                ...(Array.isArray(ws?.key_facts)
                  ? ws.key_facts.map((v: any, i: number) => ({ label: `ws.key_facts[${i}]`, value: v }))
                  : []),
                { label: "sd.headline", value: sd?.headline },
                ...(Array.isArray(sd?.special_days)
                  ? sd.special_days.map((v: any, i: number) => ({ label: `sd.special_days[${i}]`, value: JSON.stringify(v) }))
                  : []),
              ];

              for (const c of candidates) {
                const r = dropReason(c.value);
                if (r) {
                  aiUnsafe = true;
                  console.warn("[MONTH][AI UNSAFE -> deterministic]", { label: c.label, reason: r });
                  break;
                }
              }

              // If AI unsafe OR AI missing, we do deterministic strict output (always correct + formatted)
              if (aiUnsafe || !ws || typeof ws !== "object") {
                return deterministicText();
              }

              // Use AI phrasing *only* for a short intro (headline + safe key facts),
              // but keep all factual sections deterministic.
              //
              // IMPORTANT: we do NOT include ws.summary (too likely to contain numeric claims).
              const introBits: string[] = [];

              if (typeof ws.headline === "string" && ws.headline.trim()) {
                introBits.push(ws.headline.trim());
              }

              // Optional: include safe key facts (already gated by dropReason)
              if (Array.isArray(ws.key_facts)) {
                for (const raw of ws.key_facts) {
                  const r = dropReason(raw);
                  if (r) continue;

                  const s = typeof raw === "string" ? norm(raw) : "";
                  if (!s) continue;

                  // Avoid double-listing if headline already contains it
                  introBits.push(`- ${s}`);
                }
              }

              const strict = deterministicText();

              // If strict cannot render, fall back to whatever safe intro we have.
              if (!strict) return introBits.join("\n");

              // If we have an intro, prepend it; otherwise return strict only.
              return introBits.length ? `${introBits.join("\n")}\n\n${strict}` : strict;
            })(),
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "private, max-age=300",
            },
          }
          );
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: err?.message ?? "Unknown error",
            stage: err?.stage ?? null,
            bq: err?.bq ?? null,
          }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
    };