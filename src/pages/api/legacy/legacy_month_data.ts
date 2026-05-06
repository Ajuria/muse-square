import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { makeBQClient } from "../../../lib/bq";

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
  params: Record<string, any>
) {
  const t0 = Date.now();
  try {
    const [rows] = await bigquery.query({
      query,
      location: "EU",
      params,
    });
    console.log(`[MONTH][BQ OK] ${stage} (${Date.now() - t0}ms)`);
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

    // ---- BIGQUERY CLIENT ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    requireString(process.env.BQ_DATASET, "BQ_DATASET");
    requireString(process.env.BQ_TABLE, "BQ_TABLE");

    const bigquery = makeBQClient(projectId);

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

    await runBQ(bigquery, "bq_health", "SELECT 1 AS ok", {});

    // 1) Resolve window_start_date (authoritative, keyed to window_surface)
    const sqlResolve = `
      WITH available_window_starts AS (
        SELECT DISTINCT window_start_date
        FROM ${T_WINDOW}
        WHERE location_id = @location_id
      ),
      parsed AS (
        SELECT
          SAFE.PARSE_DATE('%F', NULLIF(@anchor_date, ''))   AS anchor_d,
          SAFE.PARSE_DATE('%F', NULLIF(@selected_date, '')) AS selected_d,
          SAFE.PARSE_DATE('%F', @today_str) AS today_d
      ),
      base_day AS (
        SELECT
          COALESCE(anchor_d, selected_d, today_d) AS d
        FROM parsed
      ),
      candidate AS (
        SELECT
          DATE_SUB(
            d,
            INTERVAL MOD(EXTRACT(DAYOFWEEK FROM d) + 5, 7) DAY
          ) AS window_start_date
        FROM base_day
      ),
      resolved AS (
        SELECT
          CASE
            WHEN (SELECT window_start_date FROM candidate) IN (SELECT window_start_date FROM available_window_starts)
              THEN (SELECT window_start_date FROM candidate)

            WHEN EXISTS (
              SELECT 1 FROM available_window_starts
              WHERE window_start_date > (SELECT window_start_date FROM candidate)
            )
              THEN (
                SELECT MIN(window_start_date) FROM available_window_starts
                WHERE window_start_date > (SELECT window_start_date FROM candidate)
              )

            ELSE (SELECT MAX(window_start_date) FROM available_window_starts)
          END AS window_start_date
      )
      SELECT window_start_date FROM resolved
    `;

    const resolveRows = await runBQ(
        bigquery,
        "resolve_window_start_date",
        sqlResolve,
        { location_id, anchor_date, selected_date, today_str }
    );

    const window_start_date =
      resolveRows && resolveRows.length > 0
        ? bqDateToYmd((resolveRows as any)[0]?.window_start_date)
        : null;

    console.log("[MONTH] resolved window_start_date:", window_start_date, {
      raw: (resolveRows as any)?.[0]?.window_start_date,
    });

    if (!window_start_date) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Unable to resolve window_start_date",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

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
        AND window_start_date = @window_start_date
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

        ARRAY(
          SELECT AS STRUCT
            t.date,
            t.opportunity_regime,
            t.opportunity_score_final_local,
            t.opportunity_medal
          FROM UNNEST(top_days) AS t
        ) AS top_days,

        is_selected_day,
        available_next_views,
        relative_rank_bucket
      FROM ${T_DAYS}
      WHERE location_id = @location_id
        AND date BETWEEN @window_start_date
                    AND DATE_ADD(@window_start_date, INTERVAL 29 DAY)
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
        AND region_code_insee IS NOT NULL
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
        AND date BETWEEN @window_start_date
                    AND DATE_ADD(@window_start_date, INTERVAL 29 DAY)
      ORDER BY date ASC
    `;

    const [windowRows, daysRows, ctxRows] = await Promise.all([
      runBQ(bigquery, "fetch_window", sqlWindow, { location_id, window_start_date }),
      runBQ(bigquery, "fetch_days", sqlDays, { location_id, window_start_date }),
      runBQ(bigquery, "fetch_location_context", sqlCtx, { location_id }),
    ]);

    const window =
      Array.isArray(windowRows) && windowRows.length > 0 ? (windowRows[0] as any) : null;

    const warnTopDays = { fired: false };

    const days = (Array.isArray(daysRows) ? daysRows : []).map((d: any) =>
      normalizeTopDaysField(d, warnTopDays)
    );

    const location_context =
      Array.isArray(ctxRows) && ctxRows.length > 0 ? (ctxRows[0] as any) : null;

    // --- region_code_insee resolution (from location_context) ---
    const region_code_insee_raw = (location_context as any)?.region_code_insee ?? null;
    const region_code_insee =
      typeof region_code_insee_raw === "string" && region_code_insee_raw.trim()
        ? region_code_insee_raw.trim()
        : null;

    console.log("[MONTH][REGION] region_code_insee:", region_code_insee);

    // --- fetch region daily context (date × region_code_insee) ---
    const regionRows = region_code_insee
      ? await runBQ(bigquery, "fetch_region_ai_context_daily", sqlRegion, {
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

    // -----------------------------
    // POINTS CLÉS (DETERMINISTIC)
    // -----------------------------
    function computeOpportunityStats(days30: any[]) {
      const out = {
        days_count: Array.isArray(days30) ? days30.length : 0,
        days_a: 0,
        days_b: 0,
        days_c: 0,
        days_risk: 0,
        score_min: null as number | null,
        score_max: null as number | null,
      };

      for (const d of Array.isArray(days30) ? days30 : []) {
        const medal = String(d?.opportunity_medal ?? "").toUpperCase();
        if (medal === "A") out.days_a += 1;
        else if (medal === "B") out.days_b += 1;
        else if (medal === "C") out.days_c += 1;

        const bucket = String(d?.relative_rank_bucket ?? "");
        if (bucket === "risk") out.days_risk += 1;

        const s = Number(d?.opportunity_score_final_local);
        if (Number.isFinite(s)) {
          out.score_min = out.score_min === null ? s : Math.min(out.score_min, s);
          out.score_max = out.score_max === null ? s : Math.max(out.score_max, s);
        }
      }

      return out;
    }

    function formatRangeYmd(d1: string, d2: string) {
      return d1 === d2 ? d1 : `${d1} → ${d2}`;
    }

    function buildPointsClesText(args: {
      days: any[];
      special_days: Array<{ date: string; labels: string[] }>;
      window_start_date: string;
      window_end_date: string | null;
    }) {
      const { days, special_days, window_start_date, window_end_date } = args;

      const stats = computeOpportunityStats(days);
      const daysCount = stats.days_count;

      // ---------- Intro sentence (operational, human) ----------
      const ab = stats.days_a + stats.days_b;
      const abShare = daysCount ? ab / daysCount : 0;

      const opportunities =
        abShare >= 0.7 ? "beaucoup d’opportunités" :
        abShare >= 0.45 ? "des opportunités variables" :
        "peu d’opportunités";

      const constraints =
        stats.days_risk > 0 ? "quelques contraintes d’organisation" : "peu de contraintes d’organisation";

      const lines: string[] = [];
      lines.push(`La période présente ${opportunities} et ${constraints}, avec les particularités suivantes:`);

      // ---------- Alertes (weather + mobility) ----------
      // Weather alert criteria (tweak thresholds if needed)
      const weatherAlerts = (Array.isArray(days) ? days : [])
        .map((d) => {
          const ymd = bqDateToYmd(d?.date);
          if (!ymd) return null;

          const parts: string[] = [];

          const lvl = Number(d?.weather_alert_level);
          if (Number.isFinite(lvl) && lvl > 0) parts.push(`alerte météo niveau ${lvl}`);

          const pp = Number(d?.precip_probability_max_pct);
          if (Number.isFinite(pp) && pp >= 60) parts.push(`pluie probable (${pp}%)`);

          const wind = Number(d?.wind_speed_10m_max);
          if (Number.isFinite(wind) && wind >= 40) parts.push(`vent fort (${wind} km/h)`);

          // Mobility (optional: only if your day rows actually carry such fields)
          const mobLvl = Number((d as any)?.mobility_alert_level);
          if (Number.isFinite(mobLvl) && mobLvl > 0) parts.push(`mobilité: alerte niveau ${mobLvl}`);
          const mobFlag = Boolean((d as any)?.is_mobility_disruption_flag);
          if (mobFlag) parts.push(`mobilité: perturbations`);

          return parts.length ? `- ${ymd}: ${parts.join(", ")}` : null;
        })
        .filter(Boolean) as string[];

      lines.push(`\nAlertes (météo et mobilité)`);
      if (weatherAlerts.length === 0) {
        lines.push(`- Pas d'alerte météo ou mobilité sur la période`);
      } else {
        // keep it short
        lines.push(...weatherAlerts.slice(0, 6));
      }

      // ---------- Jours spéciaux ----------
      lines.push(`\nJours spéciaux`);
      if (!Array.isArray(special_days) || special_days.length === 0) {
        lines.push(`- Pas de vacances, jours fériés ou événements commerciaux sur la période`);
      } else {
        // Simple (date: labels). If later you want ranges, we can group consecutive dates.
        for (const sd of special_days.slice(0, 12)) {
          const d = typeof sd?.date === "string" ? sd.date : "";
          const labels = Array.isArray(sd?.labels)
            ? sd.labels.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
            : [];
          if (d && labels.length) lines.push(`- ${d}: ${labels.join(", ")}`);
        }
      }

      // ---------- Score d'opportunité (NO top days here) ----------
      lines.push(`\nScore d'opportunité sur la période`);
      lines.push(`- Fenêtre 30 jours: ${formatRangeYmd(window_start_date, window_end_date ?? "")}`.trim());
      lines.push(`- Répartition: ${stats.days_a} jours A, ${stats.days_b} jours B, ${stats.days_c} jours C${stats.days_risk ? `, ${stats.days_risk} jours “risk”` : ""}.`);
      if (stats.score_min !== null && stats.score_max !== null) {
        lines.push(`- Amplitude des scores: ${stats.score_min} → ${stats.score_max}.`);
      }

      return lines.join("\n").trim();
    }

    const points_cles_text = buildPointsClesText({
      days: days_deduped,
      special_days,
      window_start_date,
      window_end_date: bqDateToYmd((window as any)?.window_end_date),
    });

    return new Response(
      JSON.stringify({
        ok: true,
        window_start_date_resolved: window_start_date,
        window,
        days: days_deduped,
        special_days,
        location_context,
        points_cles_text,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

    } catch (err: any) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err?.message ?? "Unknown error",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    };
