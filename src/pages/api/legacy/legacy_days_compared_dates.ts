import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { MS_ASTER_CONTRACT, MS_ASTER_CONTRACT_VERSION } from "../../../lib/ai/msAsterContract";
import { makeBQClient } from "../../../lib/bq";

const bq = makeBQClient(process.env.BQ_PROJECT_ID || "");

function requireString(v: string | undefined, name: string) {
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

// --- Selected Days packager prompt (Frozen) ---
// NOTE: This is the exact prompt text you provided, with one correction:
// - removed weekday_weekend_label from allowed inputs (it is not present in vw_insight_event_selected_days_surface)
const PACKAGER_PROMPT_COMPANY_CENTERED_MODE = `
Instruction Prompt (Frozen)

SYSTEM
You are an AI presentation layer operating in SELECTED DAYS — DECISION SUPPORT MODE.
You translate pre-computed semantic facts into operator-readable comparison of selected date(s).
You never recommend, advise, rank, conclude, or invent facts.

LANGUAGE CONTRACT (NON-NEGOTIABLE)
French only.
Concrete, situational, operator-native language.
No academic wording.
No abstract nouns without action.

GLOBAL HARD FAIL CONDITIONS
If any rule below cannot be respected, return no output.

SCOPE LOCK
Operate only if ai_analysis_scope_guard = "justification". Else return no output.

ALLOWED INPUTS (EXHAUSTIVE)
You may use only the fields below, exactly as provided.

1) Verdict & framing
date, display_label, opportunity_medal, opportunity_regime, opportunity_score_final_local

2) Primary driver (optional to mention; never invent)
primary_score_driver_label_fr, primary_driver_confidence_fr

3) Signals
daily_signal_summary_fr, evidence_completeness_flag, competition_presence_flag

4) Competition
events_within_500m_count, events_within_5km_count, events_within_10km_count, events_within_50km_count

5) Weather
alert_level_max, weather_label_fr, temperature_2m_min, temperature_2m_max, precipitation_probability_max_pct, wind_speed_10m_max, snowfall_sum

6) Calendar
holiday_name, vacation_name, commercial_events

7) Context lens (use only if present; never assume)
location_type, company_activity_type, company_industry, event_time_profile, capacity_sensitivity
primary_audience_1, primary_audience_2
geographic_catchment, city_name, region_name
nearest_transit_stop_name, nearest_transit_stop_distance_m

TRACEABILITY (MANDATORY)
Every condition stated in the summary must be traceable to at least one explicit input field.
If you cannot point to an input field, do not write it.

OPERATING MODE (CONTEXT)
COMPANY-ANCHORED MODE is active if any of these are present: location_type, company_activity_type, event_time_profile, capacity_sensitivity
SIGNAL-ONLY MODE otherwise. In SIGNAL-ONLY MODE, do not mention venue/company/audience.

AUDIENCE ANCHORING (LENS ONLY)
If in COMPANY-ANCHORED MODE and an audience field exists, you may anchor to one audience only.
Audience precedence: use explicit audience constraint if provided upstream; else use primary_audience_1; else do not mention audience.
Audience is a lens only. No targeting, no positioning, no “attirer/séduire/cible”.

FORBIDDEN MARKETING LANGUAGE (HARD FAIL)
cible, attirer, séduire, maximiser, conversion, audience clé, positionnement, marketing, communiquer pour, message, campagne

NUMERIC EMPHASIS CONTROL
1) Summary MUST NOT contain numbers.
2) Numbers belong only in key_facts.
3) A given numeric field may appear at most once across headline + summary + key_facts + caveat.
4) opportunity_score_final_local may appear only in key_facts, at most once, as a raw value (no “meilleur”, no threshold).

HEADLINE / SUMMARY ROLE SEPARATION
headline is orientation only. summary is the only meaning-bearing sentence.
No situational meaning may appear outside summary.

OUTPUT STRUCTURE

headline
Format strictly: opportunity_medal + " · " + display_label
No other content.

summary
One short paragraph (2–3 sentences max).
Must include at least one allowed operator verb (list below).
Describe only what is concretely to handle on that day, in plain operator French.
No numbers.
No “why/how”: no “parce que”, “car”, “donc”, “ce qui”.
No outcome inference (no “favorable”, “idéal”, “adapté”, “meilleur”).
Stakes tags are OPTIONAL: omit them if they do not add clarity; if present, they must only reflect what is already written (never carry meaning by themselves).

key_facts
Exactly 2 or 3 facts.
Each fact maps directly to exactly one numeric field or one boolean flag.
No explanation. No interpretation. No advice.

caveat
Populate only if evidence_completeness_flag = false OR alert_level_max > 0.
Exactly one sentence from CLOSED LIST only.
Caveat must not reframe or qualify the summary.

SUMMARY CORE RULE
The summary is exactly one sentence. If more than one sentence is needed, return no output.

OPERATOR VERB RULE (MANDATORY)
The summary sentence MUST contain at least one verb from this closed list:
gérer, faire face à, composer avec, absorber, subir, maintenir, fonctionner avec, opérer avec, tenir compte de
If no allowed verb can be used, return no output.

FORBIDDEN SUMMARY WORDING (HARD FAIL)
agit comme contexte
pression de fond
cadre opérationnel
environnement
situation globale
enjeu
tension
dynamique
facteur

NO EXPLANATION RULE
No “why/how”. No “parce que”, “car”, “donc”, “ce qui”.
State only what is concretely different to handle.

NO OUTCOME RULE
No attendance/success/performance/desirability inference.
No “favorable”, “idéal”, “adapté”, “meilleur”.
No recommendation or conclusion.

WEATHER ENTITLEMENT
If location_type = indoor: weather may only be expressed as access/displacement friction.
If location_type = outdoor: weather may be expressed as direct operational constraint.
Never claim “no impact”. Never “good/bad”. Never mitigation.

COMPETITION ENTITLEMENT
You may express proximity vs regional density using operator wording (à proximité / à l’échelle régionale).
Never infer cannibalization. Never “bad/good”. Never winner logic.

MOBILITY ELIGIBILITY (TERRITORIAL ONLY)
Mobility/flows/tourism wording is allowed only if at least one is present:
geographic_catchment OR company_industry in {tourism, culture, leisure} OR (city_name/region_name is a known touristic destination)
If not eligible, all inbound/outbound/tourism/mobility statements are forbidden.

CALENDAR ENTITLEMENT
If holiday_name or vacation_name or commercial_events is referenced:
State only what it changes to handle on the day.
Choose one framing only: rigidité de planning OR disponibilité dispersée OR densité territoriale (or régime de mobilité only if eligible).
Do not explain why it applies. Do not infer behavior.

EVIDENCE RULE (ASYMMETRY)
Evidence incompleteness must not appear in summary.
Evidence incompleteness may appear only as caveat.
Evidence incompleteness must not be used in trade-offs.

COMPARISON RULE (2+ DATES)
If 2+ dates are selected, the one summary sentence must include explicit contrast wording:
tandis que, alors que, à l’inverse
Contrast must be about what is different to handle between selected dates only.
Never compare to non-selected dates, other venues, market benchmarks, or “the region in general”.

SIGNAL COEXISTENCE
If two conditions are expressed for the same date, frame as simultaneous: en même temps, cumulé avec, à gérer conjointement.
Do not claim dominance unless explicitly encoded upstream (assume it is not).
If coexistence cannot be expressed clearly in one sentence, reduce to one condition; do not fail solely for that.

STAKES TAGS
Tags anchor what is explicitly stated in the summary; they must not carry implicit meaning.
Maximum two tags total.
Use dictionary only.

TAG DICTIONARY (EXHAUSTIVE, plain and tangible)
Rule: A tag names ONE concrete situation the operator recognizes immediately.
Tags never explain. Tags never overlap.

Weather (choose max 1)
friction d’accès = déplacements plus compliqués ce jour-là
contrainte météo = la météo complique le déroulé sur place

Competition (choose max 1)
pression de proximité = concurrence directe très proche le même jour
congestion concurrentielle = concurrence élevée dans votre périmètre

Calendar (choose max 1)
rigidité de planning = peu de dates alternatives avec un score d’opportunité A ou A+
disponibilité dispersée = le public n’est pas disponible de manière homogène
densité territoriale = beaucoup d’événements et d’activités concurrentes sur la période
régime de mobilité = beaucoup de départs et d’arrivées pendant la période (seulement si éligible)

Evidence (choose max 1)
incertitude de décision = certaines informations manquent pour lire la situation

CAVEAT CLOSED LIST (EXHAUSTIVE)
Données incomplètes sur certains signaux.
Présence d’une alerte météo ce jour-là.
Données incomplètes sur certains signaux et présence d’une alerte météo ce jour-là.

FINAL FAIL-SAFE
If the sentence sounds smart but not usable by an operator, return no output.
Usable beats complete. Concrete beats exhaustive.

END OF COMPANY-CENTERED INTELLIGENCE MODE
`.trim();

const ALLOWED_DAY_FIELDS = new Set([
  // Verdict & framing
  "date",
  "display_label",
  "opportunity_medal",
  "opportunity_regime",
  "opportunity_score_final_local",

  // Primary driver
  "primary_score_driver_label_fr",
  "primary_driver_confidence_fr",

  // Signals
  "daily_signal_summary_fr",
  "evidence_completeness_flag",
  "competition_presence_flag",

  // Competition
  "events_within_500m_count",
  "events_within_5km_count",
  "events_within_10km_count",
  "events_within_50km_count",

  // Weather
  "alert_level_max",
  "weather_label_fr",
  "temperature_2m_min",
  "temperature_2m_max",
  "precipitation_probability_max_pct",
  "wind_speed_10m_max",
  "snowfall_sum",

  // Calendar
  "holiday_name",
  "vacation_name",
  "commercial_events",

  // Scope lock field required by prompt
  "ai_analysis_scope_guard",
]);

const ALLOWED_LOCATION_FIELDS = new Set([
  "location_type",
  "company_activity_type",
  "company_industry",
  "event_time_profile",
  "capacity_sensitivity",
  "primary_audience_1",
  "primary_audience_2",
  "geographic_catchment",
  "city_name",
  "region_name",
  "nearest_transit_stop_name",
  "nearest_transit_stop_distance_m",
]);

function pickFields(obj: any, allowed: Set<string>) {
  const out: any = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) out[k] = obj[k];
  }
  return out;
}

async function callClaudeJSON(prompt_text: string) {
  if (!prompt_text || !prompt_text.trim()) return null;

  // Claude is OPTIONAL: if not configured, do not fail the route.
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) return null;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      temperature: 0.3,
      system:
        "You are a decision-grade narrator for Insight Event. Follow all instructions exactly. Return valid JSON only.",
      messages: [{ role: "user", content: prompt_text }],
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error("[api/insight/days] Claude API error", res.status, text);
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    const modelText = parsed?.content?.[0]?.text;
    if (!modelText || typeof modelText !== "string") return null;
    return JSON.parse(modelText);
  } catch (e) {
    console.error("[api/insight/days] Failed to parse Claude response as JSON", e, text);
    return null;
  }
}

function isComparisonShapeValid(obj: any) {
  if (!obj || typeof obj !== "object") return false;

  const has = (k: string) => Object.prototype.hasOwnProperty.call(obj, k);

  // Contract: { headline, summary, key_facts, caveat, evidence_fields_used }
  if (!has("headline") || typeof obj.headline !== "string") return false;
  if (!has("summary") || typeof obj.summary !== "string") return false;
  if (!has("key_facts") || !Array.isArray(obj.key_facts)) return false;
  if (!(obj.key_facts.length === 2 || obj.key_facts.length === 3)) return false;

  if (!has("caveat")) return false;
  if (!(obj.caveat === null || typeof obj.caveat === "string")) return false;

  if (!has("evidence_fields_used") || !Array.isArray(obj.evidence_fields_used)) return false;
  if (!obj.evidence_fields_used.every((x: any) => typeof x === "string")) return false;

  return true;
}

export const GET: APIRoute = async ({ url }) => {
  const location_id = url.searchParams.get("location_id");
  const selected_dates_raw = url.searchParams.get("selected_dates");

  if (!location_id || !selected_dates_raw) {
    return new Response(
      JSON.stringify({ error: "Missing location_id or selected_dates" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const selected_dates = selected_dates_raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!selected_dates.every((d) => ISO_DATE_RE.test(d))) {
    return new Response(JSON.stringify({ error: "selected_dates must be YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (selected_dates.length === 0) {
    return new Response(
      JSON.stringify({ error: "selected_dates empty after normalization" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  if (selected_dates.length > 7) {
    return new Response(
      JSON.stringify({ error: "selected_dates must contain at most 7 dates" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const daysQuery = `
    SELECT
      sd.*
    FROM \`muse-square-open-data.semantic.vw_insight_event_selected_days_surface\` sd
    WHERE sd.location_id = @location_id
      AND sd.date IN UNNEST(ARRAY(
        SELECT PARSE_DATE('%Y-%m-%d', d)
        FROM UNNEST(@selected_dates) AS d
      ))
    ORDER BY sd.date ASC
  `;

  const locationContextQuery = `
    SELECT
      *
    FROM \`muse-square-open-data.semantic.vw_insight_event_ai_location_context\`
    WHERE location_id = @location_id
    LIMIT 1
  `;

  try {
    const [daysRows] = await bq.query({
      query: daysQuery,
      params: {
        location_id,
        selected_dates,
      },
    });

    const [locationContextRows] = await bq.query({
      query: locationContextQuery,
      params: { location_id },
    });

    const location_context = locationContextRows?.[0] ?? null;

    // --- Comparison generation (Points clés) ---
    // Claude is OPTIONAL. Never fail the API if Claude is unavailable.
    // If rows are missing or mixed scope, do not generate comparison.
    let comparison: any = null;

    const rawDays = Array.isArray(daysRows) ? daysRows : [];

    const days = rawDays.map((r: any) => ({
      ...r,
      // Normalize BigQuery DATE to "YYYY-MM-DD"
      date: r?.date?.value ?? r?.date ?? null,
      window_centered_date_7d: r?.window_centered_date_7d?.value ?? r?.window_centered_date_7d ?? null,
    }));

    const allJustification =
      days.length >= 1 &&
      days.every((r: any) => String(r?.ai_analysis_scope_guard ?? "").trim() === "justification");

    if (allJustification) {
      try {
        const llmDaysPayload = days.map((r: any) => pickFields(r, ALLOWED_DAY_FIELDS));
        const llmLocationPayload = location_context ? pickFields(location_context, ALLOWED_LOCATION_FIELDS) : {};

        const prompt =
          MS_ASTER_CONTRACT +
          "\n\n" +
          PACKAGER_PROMPT_COMPANY_CENTERED_MODE +
          "\n\nINPUTS (JSON):\n" +
          JSON.stringify(
            {
              aster_contract_version: MS_ASTER_CONTRACT_VERSION,
              location_id,
              selected_dates,
              ai_analysis_scope_guard: "justification",
              location_context: llmLocationPayload,
            },
            null,
            2
          ) +
          "\n\nPAYLOAD (JSON records):\n" +
          JSON.stringify(llmDaysPayload, null, 2) +
          "\n\nRespond with valid JSON only. No markdown. No extra keys.";

        const candidate = await callClaudeJSON(prompt);
        comparison = isComparisonShapeValid(candidate) ? candidate : null;
      } catch (e) {
        console.error("[api/insight/days] Comparison generation failed (non-fatal)", e);
        comparison = null;
      }
    }

    return new Response(
      JSON.stringify({
        location_id,
        selected_dates,
        days,
        points_cles: {
          location_context,
          comparison,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (err) {
    console.error("[api/insight/days] Error", err);
    return new Response(
      JSON.stringify({ error: "Internal error querying semantic surfaces" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
};

