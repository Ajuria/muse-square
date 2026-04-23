import { makeBQClient } from "../../bq";

export interface FindDatesParams {
  location_id: string;
  date_start: string;        // YYYY-MM-DD
  date_end: string;          // YYYY-MM-DD
  allow_weekday: boolean;
  allow_weekend: boolean;
  exclude_school_holidays: boolean;
  exclude_public_holidays: boolean;
  // narrative context (Claude only, not SQL)
  event_type?: string | null;
  primary_audience_1?: string | null;
  primary_audience_2?: string | null;
  business_short_description?: string | null;
}

export interface FindDatesRow {
  date: string;
  opportunity_score_final_local: number;
  opportunity_regime: string;
  opportunity_medal: string | null;
  is_weekend_flag: boolean;
  is_school_holiday_flag: boolean;
  is_public_holiday_flag: boolean;
  alert_level_max: number;
  competition_index_local: number;
  impact_weather_pct: number;
  finder_rank: number;
}

export interface FindDatesResult {
  dates: FindDatesRow[];
  narrative: string;
  is_least_worst: boolean;
}

const QUALITY_FLOOR_REGIME = ["A", "B"];

export async function findDates(params: FindDatesParams): Promise<FindDatesResult> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

  // ----------------------------------------------------------------
  // 1. BQ query — constrained pool
  // ----------------------------------------------------------------
  const query = `
    WITH pool AS (
      SELECT
        date,
        location_id,
        opportunity_score_final_local,
        opportunity_regime,
        opportunity_medal,
        is_weekend_flag,
        is_public_holiday_flag,
        is_school_holiday_flag,
        alert_level_max,
        competition_index_local,
        impact_weather_pct,
        has_valid_baseline_flag
      FROM \`muse-square-open-data.mart.fct_location_context_features_daily\`
      WHERE
        location_id = @location_id
        AND date >= @date_start
        AND date <= @date_end
        AND has_valid_baseline_flag = true
        AND (
          (@allow_weekday = true AND is_weekend_flag = false)
          OR (@allow_weekend = true AND is_weekend_flag = true)
        )
        AND (@exclude_school_holidays = false OR is_school_holiday_flag = false)
        AND (@exclude_public_holidays = false OR is_public_holiday_flag = false)
    ),
    ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (ORDER BY opportunity_score_final_local DESC) AS finder_rank
      FROM pool
    )
    SELECT *
    FROM ranked
    ORDER BY finder_rank
    LIMIT 7
  `;

  console.log("[find-dates] params:", JSON.stringify({ location_id: params.location_id, date_start: params.date_start, date_end: params.date_end, allow_weekday: params.allow_weekday, allow_weekend: params.allow_weekend }));

  let rows: any[];
  try {
    [rows] = await bq.query({
    query,
    params: {
      location_id: params.location_id,
      date_start: params.date_start,
      date_end: params.date_end,
      allow_weekday: params.allow_weekday,
      allow_weekend: params.allow_weekend,
      exclude_school_holidays: params.exclude_school_holidays,
      exclude_public_holidays: params.exclude_public_holidays,
    },
    types: {
      allow_weekday: "BOOL",
      allow_weekend: "BOOL",
      exclude_school_holidays: "BOOL",
      exclude_public_holidays: "BOOL",
    },
    location: "EU",
  });

    console.log("[find-dates] rows count:", rows?.length);
  } catch (bqErr: any) {
    console.error("[find-dates] BQ ERROR:", bqErr?.message);
    return { dates: [], narrative: "Erreur lors de la recherche de dates.", is_least_worst: false };
  }

  // ----------------------------------------------------------------
  // 2. Quality floor — fallback if all rows are regime C
  // ----------------------------------------------------------------
  let finalRows: FindDatesRow[] = rows as FindDatesRow[];
  let is_least_worst = false;

  if (finalRows.length === 0) {
    return { dates: [], narrative: "Aucune date disponible pour les critères sélectionnés.", is_least_worst: false };
  }

  const allRegimeC = finalRows.every(r => !QUALITY_FLOOR_REGIME.includes(r.opportunity_regime));
  if (allRegimeC) {
    is_least_worst = true;
    // keep top 3 only for least-worst
    finalRows = finalRows.slice(0, 3);
  }

  // ----------------------------------------------------------------
  // 2b. Competitor events for selected dates (narrative context only)
  // ----------------------------------------------------------------
  const selectedDateStrings = finalRows.map(r =>
    typeof r.date === "object" && (r.date as any).value
      ? (r.date as any).value
      : String(r.date)
  );

  const competitorQuery = `
    SELECT
      date,
      e.event_label,
      e.distance_m
    FROM \`muse-square-open-data.mart.fct_location_events_topn_daily\`,
    UNNEST(top_events_5km) AS e
    WHERE
      location_id = @location_id
      AND date IN UNNEST(@dates)
    ORDER BY date, e.distance_m ASC
  `;

  const competitorsByDate: Record<string, { event_label: string; distance_m: number }[]> = {};

  try {
    const [compRows] = await bq.query({
      query: competitorQuery,
      params: {
        location_id: params.location_id,
        dates: selectedDateStrings,
      },
      types: {
        dates: { type: "ARRAY", arrayType: "DATE" },
      },
      location: "EU",
    });

    for (const row of compRows as any[]) {
      const d = typeof row.date === "object" && row.date?.value ? row.date.value : String(row.date);
      if (!competitorsByDate[d]) competitorsByDate[d] = [];
      if (competitorsByDate[d].length < 2) {
        competitorsByDate[d].push({
          event_label: row.event_label ?? "",
          distance_m: Number(row.distance_m) ?? 0,
        });
      }
    }
  } catch (compErr) {
    console.warn("[find-dates] competitor query failed:", compErr);
  }

  // ----------------------------------------------------------------
  // 3. Pool stats for narrative context
  // ----------------------------------------------------------------
  const scores = finalRows.map(r => Number(r.opportunity_score_final_local));
  const scoreMin = Math.min(...scores);
  const scoreMax = Math.max(...scores);
  const scoreAvg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // ----------------------------------------------------------------
  // 4. Claude narrative
  // ----------------------------------------------------------------
  const constraintsSummary = [
    params.allow_weekday && params.allow_weekend ? "en semaine et le week-end"
      : params.allow_weekday ? "en semaine uniquement"
      : "le week-end uniquement",
    params.exclude_school_holidays ? "hors vacances scolaires" : null,
    params.exclude_public_holidays ? "hors jours fériés" : null,
  ].filter(Boolean).join(", ");

  const systemPrompt = `Tu es un assistant d'aide à la décision pour des professionnels de l'événementiel en France. Tu analyses des données de scoring de dates et tu produis une synthèse factuelle, opérationnelle, sans conseil ni marketing. Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans texte avant ou après.`;

  const userPayload = {
    constraints: {
      summary: constraintsSummary,
      allow_weekday: params.allow_weekday,
      allow_weekend: params.allow_weekend,
      exclude_school_holidays: params.exclude_school_holidays,
      exclude_public_holidays: params.exclude_public_holidays,
      event_type: params.event_type ?? null,
      primary_audience_1: params.primary_audience_1 ?? null,
      primary_audience_2: params.primary_audience_2 ?? null,
      business_short_description: params.business_short_description ?? null,
    },
    selected_dates: finalRows.map(r => {
      const dateStr = typeof r.date === "object" && (r.date as any).value
        ? (r.date as any).value
        : String(r.date);
      return {
        date: dateStr,
        opportunity_score_final_local: r.opportunity_score_final_local,
        opportunity_regime: r.opportunity_regime,
        opportunity_medal: r.opportunity_medal ?? null,
        alert_level_max: r.alert_level_max,
        competition_index_local: r.competition_index_local,
        impact_weather_pct: r.impact_weather_pct,
        is_weekend: r.is_weekend_flag,
        is_school_holiday: r.is_school_holiday_flag,
        is_public_holiday: r.is_public_holiday_flag,
        finder_rank: r.finder_rank,
        top_competitors_5km: competitorsByDate[dateStr] ?? [],
      };
    }),
    pool_stats: {
      total_dates_evaluated: finalRows.length,
      score_min: scoreMin,
      score_max: scoreMax,
      score_avg: scoreAvg,
    },
    is_least_worst,
    expected_output: {
      narrative: is_least_worst
        ? "2-3 phrases en français. Rappelle les critères. Explique que ces dates sont les moins défavorables parmi les options disponibles. Ne cache pas la situation."
        : "2-3 phrases en français. Rappelle les critères. Explique pourquoi ces dates ressortent parmi les options disponibles en te basant uniquement sur les champs fournis. Ne pas évaluer la pression concurrentielle globale du jour.",
    },
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL_ENRICHMENT ?? "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
  });

  const aiData = await response.json();
  const textBlock = aiData.content?.filter((b: any) => b.type === "text").pop();
  const raw = textBlock?.text ?? "";

  let narrative = "Sélection basée sur vos critères.";
  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    const clean = jsonMatch ? jsonMatch[1].trim() : raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (typeof parsed.narrative === "string" && parsed.narrative.trim()) {
      narrative = parsed.narrative.trim();
    }
  } catch {
    narrative = "Sélection basée sur vos critères.";
  }

  // ----------------------------------------------------------------
  // 5. Return
  // ----------------------------------------------------------------
  return {
    dates: finalRows,
    narrative,
    is_least_worst,
  };
}