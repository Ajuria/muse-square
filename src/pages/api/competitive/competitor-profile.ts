import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const competitor_id = url.searchParams.get("id")?.trim() || "";
    if (!competitor_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing competitor id" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ── Parallel fetch: directory, threat profile, user profile, alerts, events ──
    const [dirRows, threatRows, userRows, alertRows, eventRows] = await Promise.all([
      // 1. Competitor directory (semantic layer)
      bq.query({
        query: `
          SELECT
            competitor_id, competitor_name, address, city,
            industry_code, industry_bucket,
            primary_audience, secondary_audience,
            lat, lon,
            google_place_id, google_photos,
            google_rating, google_rating_count,
            description, source_url,
            auto_enriched_description,
            competitive_analysis_json,
            confidence_score, is_user_vetted,
            created_at, updated_at
          FROM \`${projectId}.semantic.vw_insight_event_competitor_lookup\`
          WHERE competitor_id = @competitor_id
          LIMIT 1
        `,
        params: { competitor_id },
        types: { competitor_id: "STRING" },
        location: BQ_LOCATION,
      }),

      // 2. Threat profile
      bq.query({
        query: `
          SELECT
            threat_score, threat_level,
            audience_overlap_pct, industry_match_tier,
            seasonality_alignment, programming_rhythm_match,
            distance_km, is_followed,
            competitor_google_rating, competitor_google_rating_count,
            location_primary_audience_1, location_primary_audience_2,
            location_industry_code,
            competitor_primary_audience, competitor_secondary_audience,
            competitor_industry_code,
            competitor_seasonality, competitor_event_time_profile
          FROM \`${projectId}.mart.fct_competitor_threat_profile\`
          WHERE location_id = @location_id
            AND competitor_id = @competitor_id
          LIMIT 1
        `,
        params: { location_id, competitor_id },
        types: { location_id: "STRING", competitor_id: "STRING" },
        location: BQ_LOCATION,
      }),

      // 3. User profile (for side-by-side comparison)
      bq.query({
        query: `
          SELECT
            site_name, company_activity_type,
            primary_audience_1, primary_audience_2,
            auto_enriched_description
          FROM \`${projectId}.semantic.vw_insight_event_ai_location_context\`
          WHERE location_id = @location_id
          LIMIT 1
        `,
        params: { location_id },
        types: { location_id: "STRING" },
        location: BQ_LOCATION,
      }),

      // 4. Competitor alerts (most recent 20)
      bq.query({
        query: `
          SELECT
            competitor_alert_id, alert_level,
            change_category, change_subtype,
            event_label, affected_date,
            old_value, new_value,
            score_delta, direction,
            conflict_score,
            entity_threat_score, entity_threat_level,
            created_at
          FROM \`${projectId}.semantic.vw_insight_event_competitor_alerts\`
          WHERE competitor_id = @competitor_id
            AND location_id = @location_id
          ORDER BY created_at DESC
          LIMIT 20
        `,
        params: { competitor_id, location_id },
        types: { competitor_id: "STRING", location_id: "STRING" },
        location: BQ_LOCATION,
      }),

      // 5. Competitor events/signals (recent + upcoming)
      bq.query({
        query: `
          SELECT
            competitor_event_id, signal_type,
            event_name, event_type, description,
            event_date, event_date_end,
            venue_name, event_city,
            distance_from_location_m,
            conflict_score, date_conflict,
            industry_overlap, audience_overlap,
            is_launch, is_active, is_upcoming
          FROM \`${projectId}.semantic.vw_insight_event_competitor_signals\`
          WHERE location_id = @location_id
            AND competitor_id = @competitor_id
            AND event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
          ORDER BY event_date DESC
          LIMIT 30
        `,
        params: { location_id, competitor_id },
        types: { location_id: "STRING", competitor_id: "STRING" },
        location: BQ_LOCATION,
      }),
    ]);

    const directory = (dirRows[0] ?? [])[0] ?? null;
    if (!directory) {
      return new Response(JSON.stringify({ ok: false, error: "Competitor not found" }), {
        status: 404, headers: { "content-type": "application/json" },
      });
    }

    const threat  = (threatRows[0] ?? [])[0] ?? null;
    const user    = (userRows[0] ?? [])[0] ?? null;
    const alerts  = (alertRows[0] ?? []).map((r: any) => ({
      alert_id:            r.competitor_alert_id,
      alert_level:         r.alert_level,
      change_category:     r.change_category,
      change_subtype:      r.change_subtype,
      event_label:         r.event_label,
      affected_date:       r.affected_date?.value ?? r.affected_date ?? null,
      old_value:           r.old_value,
      new_value:           r.new_value,
      score_delta:         r.score_delta,
      direction:           r.direction,
      conflict_score:      r.conflict_score,
      entity_threat_score: r.entity_threat_score,
      entity_threat_level: r.entity_threat_level,
      created_at:          r.created_at?.value ?? r.created_at ?? null,
    }));
    const events = (eventRows[0] ?? []).map((r: any) => ({
      competitor_event_id: r.competitor_event_id,
      signal_type:         r.signal_type,
      event_name:          r.event_name,
      event_type:          r.event_type,
      description:         r.description,
      event_date:          r.event_date?.value ?? r.event_date ?? null,
      event_date_end:      r.event_date_end?.value ?? r.event_date_end ?? null,
      venue_name:          r.venue_name,
      event_city:          r.event_city,
      distance_m:          r.distance_from_location_m,
      conflict_score:      r.conflict_score,
      date_conflict:       r.date_conflict,
      industry_overlap:    r.industry_overlap,
      audience_overlap:    r.audience_overlap,
      is_launch:           r.is_launch,
      is_active:           r.is_active,
      is_upcoming:         r.is_upcoming,
    }));

    // Parse enriched descriptions
    let competitorEnriched: Record<string, any> | null = null;
    if (directory.auto_enriched_description) {
      try { competitorEnriched = JSON.parse(directory.auto_enriched_description); } catch {}
    }
    let userEnriched: Record<string, any> | null = null;
    if (user?.auto_enriched_description) {
      try { userEnriched = JSON.parse(user.auto_enriched_description); } catch {}
    }

    // Parse cached competitive analysis
    let competitiveAnalysis: Record<string, any> | null = null;
    if (directory.competitive_analysis_json) {
      try { competitiveAnalysis = JSON.parse(directory.competitive_analysis_json); } catch {}
    }

    // ── Generate competitive analysis if not cached ──
    if (!competitiveAnalysis && competitorEnriched) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        try {
          const competitorDesc = competitorEnriched.business_description || "";
          const competitorOffering = competitorEnriched.current_offering || "";
          const competitorAudience = competitorEnriched.target_audience || "";
          const competitorPositioning = competitorEnriched.brand_positioning || "";
          const competitorDiff = competitorEnriched.key_differentiators || "";
          const competitorPricing = competitorEnriched.pricing_info || "";
          const competitorAmenities = competitorEnriched.services_and_amenities || "";

          const userDesc = userEnriched?.business_description || "";
          const userOffering = userEnriched?.current_offering || "";
          const userAudience = user?.primary_audience_1
            ? [user.primary_audience_1, user.primary_audience_2].filter(Boolean).join(", ")
            : (userEnriched?.target_audience || "");
          const userPositioning = userEnriched?.brand_positioning || "";
          const userActivity = user?.company_activity_type || "";

          const systemPrompt = `You are a competitive intelligence analyst for French physical venues and event professionals.
Return ONLY valid JSON, no markdown, no explanation. All values in French.

Analyze the competitive relationship between the USER's venue and the COMPETITOR.

Return exactly this JSON structure:
{
  "verdict": "One-line summary of competitive relationship and recommended action",
  "segment_overlap": "Description of audience overlap and risk",
  "differentiation_theirs": ["Their key differentiators"],
  "differentiation_yours": ["Your key differentiators"],
  "parity_theirs": ["Table stakes they have"],
  "parity_gaps": ["Table stakes they have that you don't"],
  "value_prop_theirs": "Their value proposition in one sentence",
  "value_prop_yours": "Your value proposition in one sentence",
  "positioning_theirs": "Their brand positioning keywords",
  "positioning_yours": "Your brand positioning keywords",
  "product_gaps": ["Products/services they offer that you don't"],
  "product_complements": ["Products/services that are complementary, not competitive"],
  "is_direct_competitor": true or false,
  "relationship_type": "direct_competitor | indirect_competitor | complementary | substitute"
}

RULES:
- Only state what is supported by the provided data. Never invent.
- If information is insufficient for a field, use null.
- Be specific and actionable in the verdict.`;

          const userPrompt = `COMPETITOR: ${directory.competitor_name}
Description: ${competitorDesc}
Offering: ${competitorOffering}
Audience: ${competitorAudience}
Positioning: ${competitorPositioning}
Differentiators: ${competitorDiff}
Pricing: ${competitorPricing}
Amenities: ${competitorAmenities}
Distance: ${threat?.distance_km ?? "unknown"} km

USER VENUE: ${user?.site_name || "Unknown"}
Activity: ${userActivity}
Description: ${userDesc}
Offering: ${userOffering}
Audience: ${userAudience}
Positioning: ${userPositioning}
Threat score: ${threat?.threat_score ?? "unknown"}
Audience overlap: ${threat?.audience_overlap_pct ?? "unknown"}%`;

          const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 2000,
              messages: [{ role: "user", content: userPrompt }],
              system: systemPrompt,
            }),
            signal: AbortSignal.timeout(30_000),
          });

          if (res.ok) {
            const data = await res.json();
            const text = data?.content?.[0]?.text || "";
            const clean = text.replace(/```json|```/g, "").trim();
            const parsed = JSON.parse(clean);
            competitiveAnalysis = parsed;

            // Cache in BQ (fire-and-forget)
            bq.query({
              query: `
                UPDATE \`${projectId}.raw.competitor_directory\`
                SET competitive_analysis_json = @analysis_json,
                    updated_at = CURRENT_TIMESTAMP()
                WHERE competitor_id = @competitor_id
                  AND deleted_at IS NULL
              `,
              params: {
                analysis_json: JSON.stringify(parsed),
                competitor_id,
              },
              types: { analysis_json: "STRING", competitor_id: "STRING" },
              location: BQ_LOCATION,
            }).catch((e: any) => console.error("[competitor-profile] cache write failed:", e?.message));
          }
        } catch (aiErr: any) {
          console.error("[competitor-profile] Claude analysis failed (non-fatal):", aiErr?.message);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      directory: {
        competitor_id:     directory.competitor_id,
        competitor_name:   directory.competitor_name,
        address:           directory.address,
        city:              directory.city,
        industry_code:     directory.industry_code,
        industry_bucket:   directory.industry_bucket,
        entity_type:       directory.entity_type,
        primary_audience:  directory.primary_audience,
        secondary_audience: directory.secondary_audience,
        lat:               directory.lat,
        lon:               directory.lon,
        google_place_id:   directory.google_place_id,
        google_photos:     directory.google_photos,
        google_rating:     directory.google_rating,
        google_rating_count: directory.google_rating_count,
        description:       directory.description,
        source_url:        directory.source_url,
        confidence_score:  directory.confidence_score,
        is_user_vetted:    directory.is_user_vetted,
        enriched:          competitorEnriched,
      },
      threat: threat ? {
        threat_score:          threat.threat_score,
        threat_level:          threat.threat_level,
        audience_overlap_pct:  threat.audience_overlap_pct,
        industry_match_tier:   threat.industry_match_tier,
        seasonality_alignment: threat.seasonality_alignment,
        distance_km:           threat.distance_km,
        is_followed:           threat.is_followed,
      } : null,
      user: user ? {
        site_name:             user.site_name,
        company_activity_type: user.company_activity_type,
        primary_audience_1:    user.primary_audience_1,
        primary_audience_2:    user.primary_audience_2,
        enriched:              userEnriched,
      } : null,
      analysis: competitiveAnalysis,
      alerts,
      events,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[competitor-profile]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};