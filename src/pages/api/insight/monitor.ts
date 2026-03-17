// src/pages/api/insight/monitor.ts
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

const bq = makeBQClient(process.env.BQ_PROJECT_ID || "");

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requireString(v: string | null, name: string): string {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing required query param: ${name}`);
  return s;
}

function normalizeYmd(v: string): string {
  const s = String(v || "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`Invalid date format: ${v}`);
  return m[1];
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    const selected_dates_raw = requireString(url.searchParams.get("selected_dates"), "selected_dates");

    const selected_dates = selected_dates_raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeYmd);

    if (!selected_dates.length) {
      throw new Error("No valid dates provided.");
    }

    // ----------------------------------------------------------------
    // 1. Profile query — vw_insight_event_ai_location_context
    // ----------------------------------------------------------------
    const profileQuery = `
      SELECT
        location_id,
        location_type,
        client_industry_code,
        location_access_pattern,
        origin_city_ids,
        company_activity_type,
        event_time_profile,
        primary_audience_1,
        primary_audience_2,
        capacity_sensitivity,
        geographic_catchment,
        company_industry,
        business_short_description,
        latitude,
        longitude,
        city_name,
        region_name,
        nearest_transit_stop_name,
        nearest_transit_line_name,
        nearest_transit_stop_distance_m
      FROM \`muse-square-open-data.semantic.vw_insight_event_ai_location_context\`
      WHERE location_id = @location_id
      LIMIT 1
    `;

    // ----------------------------------------------------------------
    // 2. Signals query — vw_insight_event_day_surface
    // ----------------------------------------------------------------
    const signalsQuery = `
      SELECT
        date,
        location_id,

        -- Verdict
        opportunity_regime,
        opportunity_score_final_local,
        opportunity_medal,
        is_major_realization_risk_flag,
        major_realization_risk_driver,
        is_forced_regime_c_flag,

        -- Component scores
        events_score,
        mobility_score,
        calendar_score,
        weather_score,

        -- Weather alerts
        alert_level_max,
        lvl_wind,
        lvl_rain,
        lvl_snow,
        lvl_heat,
        lvl_cold,
        impact_wind_pct,
        impact_rain_pct,
        impact_snow_pct,
        impact_heat_pct,
        impact_cold_pct,
        impact_weather_pct,

        -- Weather detail
        weather_code,
        weather_label_fr,
        temperature_2m_min,
        temperature_2m_max,
        precipitation_probability_max_pct,
        precipitation_sum_mm,
        wind_speed_10m_max,
        wind_gusts_10m_max,

        -- Competition
        competition_presence_flag,
        events_within_500m_count,
        events_within_5km_count,
        events_within_10km_count,
        events_within_50km_count,
        top_competitors,

        -- Context
        holiday_name,
        vacation_name,
        commercial_events,

        -- Signals summary
        daily_signal_summary,
        daily_signal_summary_fr,

        -- Primary driver
        primary_score_driver_label,
        primary_driver_confidence,

        -- Delta fields for context section
        delta_att_events_pct,
        delta_att_mobility_pct,
        delta_ops_mobility_car_pct

      FROM \`muse-square-open-data.semantic.vw_insight_event_day_surface\`
      WHERE location_id = @location_id
        AND date IN UNNEST(ARRAY(SELECT CAST(d AS DATE) FROM UNNEST(@selected_dates) AS d))
      ORDER BY date ASC
    `;

    // ----------------------------------------------------------------
    // 3. Change feed query
    // ----------------------------------------------------------------
    const feedQuery = `
      SELECT
        feed_date,
        affected_date,
        change_category,
        change_subtype,
        direction,
        alert_level,
        score_delta,
        old_value,
        new_value,
        distance_m,
        event_label,
        city_name,
        summary
      FROM \`muse-square-open-data.semantic.vw_insight_event_change_feed\`
      WHERE location_id = @location_id
        AND affected_date IN UNNEST(ARRAY(SELECT CAST(d AS DATE) FROM UNNEST(@selected_dates) AS d))
      ORDER BY alert_level DESC, feed_date DESC
    `;

    // Run all queries in parallel
    const [[profileRows], [signalRows], [feedRows]] = await Promise.all([
      bq.query({
        query: profileQuery,
        params: { location_id },
        location: "EU",
      }),
      bq.query({
        query: signalsQuery,
        params: { location_id, selected_dates },
        location: "EU",
      }),
      bq.query({
        query: feedQuery,
        params: { location_id, selected_dates },
        types: { selected_dates: ["STRING"] },
        location: "EU",
      }),
    ]);

    const profile = profileRows?.[0] ?? null;

    const changeFeed = (Array.isArray(feedRows) ? feedRows : []).map((r: any) => ({
      feed_date:       r?.feed_date?.value   ?? r?.feed_date   ?? null,
      affected_date:   r?.affected_date?.value ?? r?.affected_date ?? null,
      change_category: r?.change_category  ?? null,
      change_subtype:  r?.change_subtype   ?? null,
      direction:       r?.direction        ?? null,
      alert_level:     r?.alert_level      ?? null,
      score_delta:     r?.score_delta      ?? null,
      old_value:       r?.old_value        ?? null,
      new_value:       r?.new_value        ?? null,
      distance_m:      r?.distance_m       ?? null,
      event_label:     r?.event_label      ?? null,
      city_name:       r?.city_name        ?? null,
      summary:         r?.summary          ?? null,
    }));

    // ----------------------------------------------------------------
    // 3. Build risk matrix per day
    // ----------------------------------------------------------------
    const isOutdoor = String(profile?.location_type || "").toLowerCase() === "outdoor";

    const days = (signalRows || []).map((r: any) => {
      const risks: {
        block: "attendance" | "operations" | "installation" | "context";
        severity: "A" | "B" | "C" | "D";
        sentence: string;
      }[] = [];

      // Helper: alert_level integer → severity letter
      function levelToSeverity(lvl: number): "A" | "B" | "C" | "D" {
        if (lvl >= 3) return "D";
        if (lvl === 2) return "C";
        if (lvl === 1) return "B";
        return "A";
      }

      // ---- WEATHER RISKS ----
      const alertMax = Number(r.alert_level_max ?? 0);
      const lvlWind = Number(r.lvl_wind ?? 0);
      const lvlRain = Number(r.lvl_rain ?? 0);
      const lvlSnow = Number(r.lvl_snow ?? 0);
      const lvlHeat = Number(r.lvl_heat ?? 0);
      const lvlCold = Number(r.lvl_cold ?? 0);

      if (lvlRain > 0) {
        risks.push({
          block: "attendance",
          severity: levelToSeverity(lvlRain),
          sentence: lvlRain >= 2
            ? "Fortes pluies prévues — impact probable sur la venue des visiteurs"
            : "Pluie possible — peut réduire la venue des visiteurs",
        });
      }

      if (lvlWind > 0) {
        // Wind → installation for outdoor, operations for indoor
        risks.push({
          block: isOutdoor ? "installation" : "operations",
          severity: levelToSeverity(lvlWind),
          sentence: isOutdoor
            ? (lvlWind >= 2
                ? "Vent fort prévu — peut fragiliser les structures légères"
                : "Vent modéré à surveiller — vérifier les installations")
            : "Vent fort possible — impact sur les conditions d'exploitation",
        });
      }

      if (lvlSnow > 0) {
        risks.push({
          block: isOutdoor ? "installation" : "attendance",
          severity: levelToSeverity(lvlSnow),
          sentence: isOutdoor
            ? "Neige prévue — risque pour les installations et l'accès au site"
            : "Neige possible — peut réduire significativement la fréquentation",
        });
      }

      if (lvlHeat > 0) {
        risks.push({
          block: isOutdoor ? "installation" : "attendance",
          severity: levelToSeverity(lvlHeat),
          sentence: isOutdoor
            ? "Chaleur intense prévue — prévoir des zones de repos et d'hydratation"
            : "Forte chaleur possible — peut décourager les déplacements",
        });
      }

      if (lvlCold > 0) {
        risks.push({
          block: isOutdoor ? "installation" : "attendance",
          severity: levelToSeverity(lvlCold),
          sentence: isOutdoor
            ? "Grand froid prévu — impact sur le confort et la durée de visite"
            : "Froid intense possible — peut réduire la fréquentation",
        });
      }

      // ---- MOBILITY RISKS ----
      const deltaMobility = Number(r.delta_att_mobility_pct ?? 0);
      if (deltaMobility < -4) {
        const mobSeverity: "A" | "B" | "C" | "D" =
          deltaMobility < -10 ? "D" : deltaMobility < -7 ? "C" : "B";
        risks.push({
          block: "operations",
          severity: mobSeverity,
          sentence: deltaMobility < -10
            ? "Perturbations majeures de mobilité — accès au site fortement impacté"
            : deltaMobility < -7
            ? "Perturbations de mobilité importantes — prévoir des alternatives d'accès"
            : "Perturbations de mobilité possibles — impact potentiel sur l'accès au site",
        });
      }

      // ---- COMPETITION RISKS ----
      const deltaEvents = Number(r.delta_att_events_pct ?? 0);
      if (deltaEvents > 3) {
        const compSeverity: "A" | "B" | "C" | "D" =
          deltaEvents > 8 ? "C" : "B";

        const topComp = Array.isArray(r.top_competitors) ? r.top_competitors[0] : null;
        const compName = topComp?.event_label || topComp?.event_name || null;
        const compDist = topComp?.distance_m != null
          ? `${(Number(topComp.distance_m) / 1000).toFixed(1)} km`
          : null;

        const sentence = compName && compDist
          ? `Concurrent principal : ${compName} (${compDist})`
          : compName
          ? `Concurrent principal : ${compName}`
          : "Pression concurrentielle élevée sur cette date";

        risks.push({
          block: "attendance",
          severity: compSeverity,
          sentence,
        });
      }

      // ---- CONTEXT RISKS ----
      const isHoliday = Boolean(r.holiday_name);
      const isVacation = Boolean(r.vacation_name);
      const isMajorRisk = Boolean(r.is_major_realization_risk_flag);

      if (isMajorRisk) {
        risks.push({
          block: "context",
          severity: "D",
          sentence: String(r.major_realization_risk_driver || "Risque majeur de réalisation détecté"),
        });
      }

      // Context items (A severity — informational)
      if (isHoliday) {
        risks.push({
          block: "context",
          severity: "A",
          sentence: `Jour férié — ${r.holiday_name}`,
        });
      }

      if (isVacation) {
        risks.push({
          block: "context",
          severity: "A",
          sentence: `Vacances scolaires — ${r.vacation_name}`,
        });
      }

      // ---- STATUS: max severity across all risks ----
      const severityOrder = ["A", "B", "C", "D"];
      const dayStatus = risks.reduce(
        (max, risk) =>
          severityOrder.indexOf(risk.severity) > severityOrder.indexOf(max)
            ? risk.severity
            : max,
        "A" as "A" | "B" | "C" | "D"
      );

      const topRisk = risks
        .filter((r) => r.severity === dayStatus)
        .sort((a, b) => {
          // Prioritize attendance > installation > operations > context
          const blockOrder = { attendance: 0, installation: 1, operations: 2, context: 3 };
          return blockOrder[a.block] - blockOrder[b.block];
        })[0] ?? null;

      // Cap each block to max 3 risks
      const attendance = risks.filter((r) => r.block === "attendance").slice(0, 3);
      const operations = risks.filter((r) => r.block === "operations").slice(0, 3);
      const installation = risks.filter((r) => r.block === "installation").slice(0, 3);
      const context = risks.filter((r) => r.block === "context").slice(0, 3);

      // Audience likelihood
      const audienceLikelihood = (() => {
        const signals = Array.isArray(r.daily_signal_summary) ? r.daily_signal_summary : [];
        const hasVacation = signals.includes("school_vacation_present");
        const hasHoliday = signals.includes("public_holiday_present");
        if (hasVacation || hasHoliday) {
          return {
            label: "Visiteurs favorisés",
            reason: hasVacation ? "Contexte vacances scolaires" : "Jour férié",
          };
        }
        return {
          label: "Locaux favorisés",
          reason: "Hors vacances et hors temps fort touristique",
        };
      })();

      return {
        date: String(r.date?.value ?? r.date ?? ""),
        status: dayStatus,
        top_risk_sentence: topRisk?.sentence ?? null,

        // Scores
        opportunity_score: r.opportunity_score_final_local ?? null,
        opportunity_regime: r.opportunity_regime ?? null,
        events_score: r.events_score ?? null,
        mobility_score: r.mobility_score ?? null,
        calendar_score: r.calendar_score ?? null,
        weather_score: r.weather_score ?? null,

        // Weather detail (for UI)
        weather_code: r.weather_code ?? null,
        weather_label_fr: r.weather_label_fr ?? null,
        temperature_2m_min: r.temperature_2m_min ?? null,
        temperature_2m_max: r.temperature_2m_max ?? null,
        precipitation_probability_max_pct: r.precipitation_probability_max_pct ?? null,
        wind_speed_10m_max: r.wind_speed_10m_max ?? null,

        // Risk blocks
        attendance,
        operations,
        installation,
        context,

        // Audience likelihood
        audience_likelihood: audienceLikelihood,

        // Top competitors (pass through)
        top_competitors: Array.isArray(r.top_competitors) ? r.top_competitors.slice(0, 3) : [],

        // Context
        holiday_name: r.holiday_name ?? null,
        vacation_name: r.vacation_name ?? null,
        daily_signal_summary: r.daily_signal_summary ?? [],
        daily_signal_summary_fr: r.daily_signal_summary_fr ?? [],

        // Raw scores for context section
        events_within_500m_count: r.events_within_500m_count ?? 0,
        events_within_5km_count:  r.events_within_5km_count  ?? 0,
        alert_level_max:          r.alert_level_max           ?? 0,
        is_major_realization_risk_flag: r.is_major_realization_risk_flag ?? false,

        // Delta fields
        delta_att_events_pct:       r.delta_att_events_pct       ?? 0,
        delta_att_mobility_pct:     r.delta_att_mobility_pct     ?? 0,
        delta_ops_mobility_car_pct: r.delta_ops_mobility_car_pct ?? 0,
        lvl_wind:                   r.lvl_wind                   ?? 0,
        lvl_rain:                   r.lvl_rain                   ?? 0,
        lvl_snow:                   r.lvl_snow                   ?? 0,
        primary_audience_1:         r.primary_audience_1         ?? null,
        primary_audience_2:         r.primary_audience_2         ?? null,

        // Change feed filtered to this date
        change_feed: changeFeed.filter(
          (f) => (f.affected_date ?? "").slice(0, 10) === String(r.date?.value ?? r.date ?? "").slice(0, 10)
        ),
        
      };
    });
       
    // ----------------------------------------------------------------
    // 4. Event-level status = worst day
    // ----------------------------------------------------------------
    const severityOrder = ["A", "B", "C", "D"];
    const eventStatus = days.reduce(
      (max, day) =>
        severityOrder.indexOf(day.status) > severityOrder.indexOf(max)
          ? day.status
          : max,
      "A" as string
    );

    const worstDayCount = days.filter((d) => d.status === eventStatus).length;

    return json(200, {
      ok: true,
      profile: profile
        ? {
            location_type: profile.location_type ?? null,
            client_industry_code: profile.client_industry_code ?? null,
            location_access_pattern: profile.location_access_pattern ?? null,
            origin_city_ids: profile.origin_city_ids ?? null,
            company_activity_type: profile.company_activity_type ?? null,
            event_time_profile: profile.event_time_profile ?? null,
            primary_audience_1: profile.primary_audience_1 ?? null,
            primary_audience_2: profile.primary_audience_2 ?? null,
            capacity_sensitivity: profile.capacity_sensitivity ?? null,
            geographic_catchment: profile.geographic_catchment ?? null,
            business_short_description: profile.business_short_description ?? null,
            city_name: profile.city_name ?? null,
            region_name: profile.region_name ?? null,
            latitude: profile.latitude ?? null,
            longitude: profile.longitude ?? null,
            nearest_transit_stop_name: profile.nearest_transit_stop_name ?? null,
            nearest_transit_line_name: profile.nearest_transit_line_name ?? null,
            nearest_transit_stop_distance_m: profile.nearest_transit_stop_distance_m ?? null,
            is_outdoor: String(profile.location_type || "").toLowerCase() === "outdoor",
          }
        : null,
      event_status: eventStatus,
      worst_day_count: worstDayCount,
      total_day_count: days.length,
      days,
    });
  } catch (err: any) {
    return json(400, {
      ok: false,
      error: err?.message || "Unknown error",
      profile: null,
      event_status: "A",
      days: [],
    });
  }
};