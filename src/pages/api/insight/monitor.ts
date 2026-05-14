// src/pages/api/insight/monitor.ts
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

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

// ----------------------------------------------------------------
// BestTime foot traffic — direct API call (bypasses Airbyte)
// ----------------------------------------------------------------
async function fetchBestTimeWeek(venueId: string): Promise<any[] | null> {
  const apiKey = process.env.BESTTIME_API_KEY_PUBLIC;
  if (!apiKey || !venueId) return null;
  try {
    const res = await fetch(
      `https://besttime.app/api/v1/forecasts/week?api_key_public=${encodeURIComponent(apiKey)}&venue_id=${encodeURIComponent(venueId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const days = data?.analysis;
    if (!Array.isArray(days)) return null;
    return days.map((d: any) => {
      const raw = d?.day_raw ?? [];
      const info = d?.day_info ?? {};
      const dayInt = info.day_int ?? d?.day_int ?? null;
      const nonZero = raw.filter((v: number) => v > 0);
      const peakIdx = raw.indexOf(Math.max(...raw));
      const quietIdx = nonZero.length ? raw.indexOf(Math.min(...nonZero)) : 0;
      return {
        day_int: dayInt,
        ft_day_max: info.day_max ?? (raw.length ? Math.max(...raw) : null),
        ft_day_mean: info.day_mean ?? (nonZero.length ? Math.round(nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length) : null),
        ft_day_rank_max: info.day_rank_max ?? null,
        ft_day_rank_mean: info.day_rank_mean ?? null,
        ft_peak_hour: peakIdx >= 0 ? (peakIdx + 6) % 24 : null,
        ft_peak_busyness_pct: raw.length ? Math.max(...raw) : null,
        ft_quiet_hour: nonZero.length ? (quietIdx + 6) % 24 : null,
        ft_quiet_busyness_pct: nonZero.length ? Math.min(...nonZero) : null,
        ft_avg_busyness_pct: nonZero.length ? Math.round(nonZero.reduce((a: number, b: number) => a + b, 0) / nonZero.length) : null,
        ft_busy_hours_count: raw.filter((v: number) => v >= 70).length,
        ft_quiet_hours_count: raw.filter((v: number) => v > 0 && v < 30).length,
        ft_venue_open_hour: info.venue_open ?? null,
        ft_venue_closed_hour: info.venue_closed ?? null,
        ft_hourly_raw: raw,
      };
    });
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
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

    const clerk_user_id = (locals as any)?.clerk_user_id
      ? String((locals as any).clerk_user_id).trim()
      : null;

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
        nearest_transit_line_name[SAFE_OFFSET(0)] AS nearest_transit_line_name,
        nearest_transit_stop_distance_m,
        is_primary,
        site_name,
        venue_capacity,
        event_type_1,
        event_type_2,
        event_type_3,
        weather_sensitivity,
        seasonality,
        main_event_objective,
        operating_hours,
        besttime_venue_id,
        besttime_venue_type,
        besttime_rating,
        besttime_dwell_time_min,
        besttime_dwell_time_max
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
        is_forced_regime_c_flag,
        major_realization_risk_driver,

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

        -- Competition (total)
        competition_presence_flag,
        events_within_500m_count,
        events_within_1km_count,
        events_within_5km_count,
        events_within_10km_count,
        events_within_50km_count,
        top_competitors,
        -- Competition (same industry bucket)
        events_within_500m_same_bucket_count,
        events_within_5km_same_bucket_count,
        events_within_10km_same_bucket_count,
        events_within_50km_same_bucket_count,
        pct_same_bucket_5km,
        -- Competition context (relative pressure)
        competition_index_local,
        baseline_comp_avg,
        has_valid_baseline_flag,
        competition_pressure_ratio,

        tourism_index_region,
        tourism_peak_flag_region,
        tourism_status_region,
        has_tourism_signal_region,

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
        delta_ops_mobility_car_pct,

        -- Foot traffic
        ft_day_max,
        ft_day_mean,
        ft_day_rank_max,
        ft_day_rank_mean,
        ft_peak_hour,
        ft_peak_busyness_pct,
        ft_quiet_hour,
        ft_quiet_busyness_pct,
        ft_avg_busyness_pct,
        ft_busy_hours_count,
        ft_quiet_hours_count,
        ft_venue_open_hour,
        ft_venue_closed_hour

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
        entity_id,
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
        event_venue_name,
        event_venue_address,
        city_name,
        location_type,
        lvl_rain,
        lvl_wind,
        lvl_snow,
        lvl_heat,
        lvl_cold,
        mobility_status_region,
        mobility_disruption_flag_region,
        nearest_transit_line_name,
        transit_network,
        summary,
        score_driver_label
      FROM \`muse-square-open-data.semantic.vw_insight_event_change_feed\`
      WHERE location_id = @location_id
        AND feed_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
      ORDER BY alert_level DESC, feed_date DESC
    `;

    // Run all queries in parallel
    const [[profileRows], [signalRows], [feedRows], [savedItemRows], [competitorAlertRows], [followedCountRows]] = await Promise.all([
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
        maxResults: 5000,
      }),
      clerk_user_id ? bq.query({
        query: `
          SELECT
            saved_item_id,
            title,
            selected_date,
            event_end_date,
            event_type
          FROM \`muse-square-open-data.raw.saved_items\`
          WHERE location_id = @location_id
            AND clerk_user_id = @clerk_user_id
            AND selected_date IS NOT NULL
        `,
        params: { location_id, clerk_user_id },
        location: "EU",
        maxResults: 100,
      }) : Promise.resolve([[]]),
      bq.query({
        query: `
          SELECT
            competitor_alert_id,
            competitor_event_id,
            competitor_id,
            location_id,
            alert_level,
            change_category,
            change_subtype,
            affected_date,
            event_label,
            old_value,
            new_value,
            direction,
            distance_m,
            conflict_score,
            entity_threat_score,
            entity_threat_level,
            entity_threat_audience_pct,
            entity_threat_industry_tier,
            entity_threat_seasonality_flag,
            entity_threat_distance_km,
            watched_event_id,
            watched_event_name,
            created_at
          FROM \`muse-square-open-data.semantic.vw_insight_event_competitor_alerts\`
          WHERE location_id = @location_id
            AND affected_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
          ORDER BY alert_level DESC, created_at DESC
          LIMIT 200
        `,
        params: { location_id },
        location: "EU",
      }),
      clerk_user_id ? bq.query({
        query: `
          SELECT COUNT(*) AS cnt
          FROM \`muse-square-open-data.raw.watched_competitors\`
          WHERE clerk_user_id = @clerk_user_id
            AND deleted_at IS NULL
        `,
        params: { clerk_user_id },
        location: "EU",
      }) : Promise.resolve([[{ cnt: 0 }]]),
    ]);

    const profile = profileRows?.[0] ?? null;

    // Fetch BestTime foot traffic if venue is registered
    const btVenueId = profile?.besttime_venue_id ?? null;
    const btWeekData = btVenueId ? await fetchBestTimeWeek(btVenueId).catch(() => null) : null;
    const btByDayInt = new Map<number, any>();
    if (btWeekData) {
      for (const d of btWeekData) {
        if (d.day_int != null) btByDayInt.set(d.day_int, d);
      }
    }

    const competitorAlertFeed = (Array.isArray(competitorAlertRows) ? competitorAlertRows : []).map((r: any) => ({
      entity_id:                     r?.competitor_event_id                              ?? null,
      feed_date:                     r?.created_at?.value        ?? r?.created_at        ?? null,
      affected_date:                 r?.affected_date?.value     ?? r?.affected_date     ?? null,
      change_category:               r?.change_category                                  ?? "competition",
      change_subtype:                r?.change_subtype                                   ?? "event_new",
      direction:                     r?.direction                                        ?? "down",
      alert_level:                   r?.alert_level                                      ?? 2,
      score_delta:                   null,
      old_value:                     r?.old_value                                        ?? null,
      new_value:                     r?.new_value                                        ?? null,
      distance_m:                    r?.distance_m                                       ?? null,
      event_label:                   r?.event_label                                      ?? null,
      event_venue_name:              null,
      event_venue_address:           null,
      city_name:                     null,
      location_type:                 null,
      lvl_rain:                      null,
      lvl_wind:                      null,
      lvl_snow:                      null,
      lvl_heat:                      null,
      lvl_cold:                      null,
      mobility_status_region:        null,
      mobility_disruption_flag_region: null,
      nearest_transit_line_name:     null,
      transit_network:               r?.transit_network                                 ?? null,
      summary:                       null,
      active_event_title:            r?.watched_event_name                              ?? null,
      active_event_type:             null,
      has_active_event:              Boolean(r?.watched_event_id),
      primary_audience_1:            profile?.primary_audience_1                        ?? null,
      primary_audience_2:            profile?.primary_audience_2                        ?? null,
      operating_hours:               profile?.operating_hours                           ?? null,
      company_activity_type:         profile?.company_activity_type                     ?? null,
      event_time_profile:            profile?.event_time_profile                        ?? null,
      location_type_client:          profile?.location_type                             ?? null,
      client_industry_code:          profile?.client_industry_code                      ?? null,
      company_industry:              profile?.company_industry                          ?? null,
      main_event_objective:          profile?.main_event_objective                      ?? null,
      event_type_1:                  profile?.event_type_1                              ?? null,
      event_type_2:                  profile?.event_type_2                              ?? null,
      event_type_3:                  profile?.event_type_3                              ?? null,
      capacity_sensitivity:          profile?.capacity_sensitivity                      ?? null,
      geographic_catchment:          profile?.geographic_catchment                      ?? null,
      weather_sensitivity:           profile?.weather_sensitivity                       ?? null,
      venue_capacity:                profile?.venue_capacity                            ?? null,
      _source:                       "competitor_alerts",
    }));

    const changeFeed = (Array.isArray(feedRows) ? feedRows : []).map((r: any) => ({
      entity_id:                     r?.entity_id                     ?? null,
      feed_date:                     r?.feed_date?.value     ?? r?.feed_date     ?? null,
      affected_date:                 r?.affected_date?.value ?? r?.affected_date ?? null,
      change_category:               r?.change_category               ?? null,
      change_subtype:                r?.change_subtype                ?? null,
      direction:                     r?.direction                     ?? null,
      alert_level:                   r?.alert_level                   ?? null,
      score_delta:                   r?.score_delta                   ?? null,
      old_value:                     r?.old_value                     ?? null,
      new_value:                     r?.new_value                     ?? null,
      distance_m:                    r?.distance_m                    ?? null,
      event_label:                   r?.event_label                   ?? null,
      event_venue_name:              r?.event_venue_name              ?? null,
      event_venue_address:           r?.event_venue_address           ?? null,
      city_name:                     r?.city_name                     ?? null,
      location_type:                 r?.location_type                 ?? null,
      lvl_rain:                      r?.lvl_rain                      ?? null,
      lvl_wind:                      r?.lvl_wind                      ?? null,
      lvl_snow:                      r?.lvl_snow                      ?? null,
      lvl_heat:                      r?.lvl_heat                      ?? null,
      lvl_cold:                      r?.lvl_cold                      ?? null,
      mobility_status_region:        r?.mobility_status_region        ?? null,
      mobility_disruption_flag_region: r?.mobility_disruption_flag_region ?? null,
      nearest_transit_line_name:     r?.nearest_transit_line_name     ?? null,
      transit_network:               r?.transit_network               ?? null,
      summary:                       r?.summary                       ?? null,
      score_driver_label:            r?.score_driver_label            ?? null,
      active_event_title:            (() => {
        const affected = r?.affected_date?.value ?? r?.affected_date ?? null;
        if (!affected || !Array.isArray(savedItemRows)) return null;
        const match = savedItemRows.find((s: any) => {
          const sd = s?.selected_date?.value ?? s?.selected_date ?? null;
          return sd && String(sd).slice(0,10) === String(affected).slice(0,10);
        });
        return match?.title ?? null;
      })(),
      active_event_type:             (() => {
        const affected = r?.affected_date?.value ?? r?.affected_date ?? null;
        if (!affected || !Array.isArray(savedItemRows)) return null;
        const match = savedItemRows.find((s: any) => {
          const sd = s?.selected_date?.value ?? s?.selected_date ?? null;
          return sd && String(sd).slice(0,10) === String(affected).slice(0,10);
        });
        return match?.event_type ?? null;
      })(),
      has_active_event:              (() => {
        const affected = r?.affected_date?.value ?? r?.affected_date ?? null;
        if (!affected || !Array.isArray(savedItemRows)) return false;
        return savedItemRows.some((s: any) => {
          const sd = s?.selected_date?.value ?? s?.selected_date ?? null;
          return sd && String(sd).slice(0,10) === String(affected).slice(0,10);
        });
      })(),
      primary_audience_1:            profile?.primary_audience_1      ?? null,
      primary_audience_2:            profile?.primary_audience_2      ?? null,
      operating_hours:               profile?.operating_hours         ?? null,
      company_activity_type:         profile?.company_activity_type   ?? null,
      event_time_profile:            profile?.event_time_profile      ?? null,
      location_type_client:          profile?.location_type           ?? null,
      client_industry_code:          profile?.client_industry_code    ?? null,
      company_industry:              profile?.company_industry        ?? null,
      main_event_objective:          profile?.main_event_objective    ?? null,
      event_type_1:                  profile?.event_type_1            ?? null,
      event_type_2:                  profile?.event_type_2            ?? null,
      event_type_3:                  profile?.event_type_3            ?? null,
      capacity_sensitivity:          profile?.capacity_sensitivity    ?? null,
      geographic_catchment:          profile?.geographic_catchment    ?? null,
      weather_sensitivity:           profile?.weather_sensitivity     ?? null,
      venue_capacity:                profile?.venue_capacity          ?? null,
    }));

    const mergedFeed = [
      ...changeFeed,
      ...competitorAlertFeed,
    ].sort((a, b) => {
      const lvlDiff = (Number(b.alert_level) || 0) - (Number(a.alert_level) || 0);
      if (lvlDiff !== 0) return lvlDiff;
      return String(b.feed_date || "").localeCompare(String(a.feed_date || ""));
    });

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
        events_within_1km_count:  r.events_within_1km_count  ?? 0,
        events_within_5km_count:  r.events_within_5km_count  ?? 0,
        events_within_10km_count: r.events_within_10km_count ?? 0,
        events_within_50km_count: r.events_within_50km_count ?? 0,
        alert_level_max:          r.alert_level_max           ?? 0,
        is_major_realization_risk_flag: r.is_major_realization_risk_flag ?? false,
        is_forced_regime_c_flag: r.is_forced_regime_c_flag ?? false,

        // Competition (same industry bucket)
        events_within_500m_same_bucket_count: r.events_within_500m_same_bucket_count ?? null,
        events_within_5km_same_bucket_count:  r.events_within_5km_same_bucket_count  ?? null,
        events_within_10km_same_bucket_count: r.events_within_10km_same_bucket_count ?? null,
        events_within_50km_same_bucket_count: r.events_within_50km_same_bucket_count ?? null,
        pct_same_bucket_5km:                  r.pct_same_bucket_5km                  ?? null,

        // Competition context (relative pressure)
        competition_index_local:    r.competition_index_local    ?? null,
        baseline_comp_avg:          r.baseline_comp_avg          ?? null,
        has_valid_baseline_flag:    r.has_valid_baseline_flag    ?? null,
        competition_pressure_ratio: r.competition_pressure_ratio ?? null,

        tourism_index_region:      r.tourism_index_region      ?? null,
        tourism_peak_flag_region:  r.tourism_peak_flag_region  ?? false,
        tourism_status_region:     r.tourism_status_region     ?? null,
        has_tourism_signal_region:  r.has_tourism_signal_region  ?? false,

        // Delta fields
        delta_att_events_pct:       r.delta_att_events_pct       ?? 0,
        delta_att_mobility_pct:     r.delta_att_mobility_pct     ?? 0,
        delta_ops_mobility_car_pct: r.delta_ops_mobility_car_pct ?? 0,

        // Foot traffic (BestTime API → dbt fallback)
        ...(() => {
          const dateStr = String(r.date?.value ?? r.date ?? "");
          const d = dateStr ? new Date(dateStr) : null;
          const dayInt = d ? (d.getUTCDay() + 6) % 7 : null;
          const bt = dayInt != null ? btByDayInt.get(dayInt) : null;
          return {
            ft_day_max:           bt?.ft_day_max           ?? r.ft_day_max           ?? null,
            ft_day_mean:          bt?.ft_day_mean          ?? r.ft_day_mean          ?? null,
            ft_day_rank_max:      bt?.ft_day_rank_max      ?? r.ft_day_rank_max      ?? null,
            ft_day_rank_mean:     bt?.ft_day_rank_mean     ?? r.ft_day_rank_mean     ?? null,
            ft_peak_hour:         bt?.ft_peak_hour         ?? r.ft_peak_hour         ?? null,
            ft_peak_busyness_pct: bt?.ft_peak_busyness_pct ?? r.ft_peak_busyness_pct ?? null,
            ft_quiet_hour:        bt?.ft_quiet_hour        ?? r.ft_quiet_hour        ?? null,
            ft_quiet_busyness_pct:bt?.ft_quiet_busyness_pct?? r.ft_quiet_busyness_pct?? null,
            ft_avg_busyness_pct:  bt?.ft_avg_busyness_pct  ?? r.ft_avg_busyness_pct  ?? null,
            ft_busy_hours_count:  bt?.ft_busy_hours_count  ?? r.ft_busy_hours_count  ?? null,
            ft_quiet_hours_count: bt?.ft_quiet_hours_count ?? r.ft_quiet_hours_count ?? null,
            ft_venue_open_hour:   bt?.ft_venue_open_hour   ?? r.ft_venue_open_hour   ?? null,
            ft_venue_closed_hour: bt?.ft_venue_closed_hour ?? r.ft_venue_closed_hour ?? null,
            ft_hourly_raw:        bt?.ft_hourly_raw ??                                  null,
          };
        })(),

        // Primary driver
        primary_score_driver_label: r.primary_score_driver_label ?? null,
        primary_driver_confidence:  r.primary_driver_confidence  ?? null,
        lvl_wind:                   r.lvl_wind                   ?? 0,
        lvl_rain:                   r.lvl_rain                   ?? 0,
        lvl_snow:                   r.lvl_snow                   ?? 0,
        primary_audience_1:         r.primary_audience_1         ?? null,
        primary_audience_2:         r.primary_audience_2         ?? null,

        // Change feed filtered to this date
        change_feed: mergedFeed.filter(
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
            is_primary: profile.is_primary ?? null,
            site_name: profile.site_name ?? null,
            venue_capacity: profile.venue_capacity ?? null,
            event_type_1: profile.event_type_1 ?? null,
            event_type_2: profile.event_type_2 ?? null,
            event_type_3: profile.event_type_3 ?? null,
            weather_sensitivity: profile.weather_sensitivity ?? null,
            seasonality: profile.seasonality ?? null,
            main_event_objective: profile.main_event_objective ?? null,
            operating_hours: profile.operating_hours ?? null,
            besttime_venue_id:      profile.besttime_venue_id      ?? null,
            besttime_venue_type:    profile.besttime_venue_type    ?? null,
            besttime_rating:        profile.besttime_rating        ?? null,
            besttime_dwell_time_min: profile.besttime_dwell_time_min ?? null,
            besttime_dwell_time_max: profile.besttime_dwell_time_max ?? null,
            is_outdoor: String(profile.location_type || "").toLowerCase() === "outdoor",
          }
        : null,
      event_status: eventStatus,
      worst_day_count: worstDayCount,
      total_day_count: days.length,
      days,
      all_feed: mergedFeed,
      competitor_followed_count: Number((followedCountRows as any[])[0]?.cnt ?? 0),
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