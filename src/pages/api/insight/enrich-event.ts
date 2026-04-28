import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";

export async function POST({ request }: { request: Request }) {
  const body = await request.json().catch(() => null);
  const {
    event_label,
    description,
    city_name,
    event_venue_name,
    primary_score_driver_label,
    primary_driver_confidence,
    delta_att_events_pct,
    business_short_description,
    primary_audience_1,
    primary_audience_2,
    main_event_objective,
    company_activity_type,
    event_uid,
    city_id,
    distance_m,
    radius_bucket,
    industry_code,
  } = body ?? {};

  if (!event_label) {
    return new Response(
      JSON.stringify({ ok: false, error: "event_label required" }),
      { status: 400 }
    );
  }

  const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");

  // ----------------------------------------------------------------
  // 1. Cache read
  // ----------------------------------------------------------------
  try {
    const cacheQuery = event_uid
      ? `
        SELECT confirmed_dates, venue_name, venue_address, venue_capacity,
               organizer, estimated_attendance, audience_profile,
               primary_audience, secondary_audience, source_url,
               business_takeaway
        FROM \`muse-square-open-data.dims.dim_event_enrichment\`
        WHERE event_uid = @event_uid
          AND enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        ORDER BY enriched_at DESC
        LIMIT 1
      `
      : `
        SELECT confirmed_dates, venue_name, venue_address, venue_capacity,
               organizer, estimated_attendance, audience_profile,
               primary_audience, secondary_audience, source_url,
               business_takeaway
        FROM \`muse-square-open-data.dims.dim_event_enrichment\`
        WHERE event_label = @event_label
          AND city_id = @city_id
          AND enriched_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        ORDER BY enriched_at DESC
        LIMIT 1
      `;

    const [cacheRows] = await bq.query({
      query: cacheQuery,
      params: event_uid
        ? { event_uid }
        : { event_label, city_id: city_id ?? "" },
      location: "EU",
    });

    if (cacheRows?.length > 0) {
      const cached = cacheRows[0];
      const business_takeaway = cached.business_takeaway ||
        "Peu d'informations disponibles pour cet événement.";
      return new Response(
        JSON.stringify({ ok: true, data: { ...cached, business_takeaway }, cached: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (cacheErr) {
    console.warn("[enrich-event] cache read failed:", cacheErr);
  }

  // ----------------------------------------------------------------
  // 2. Claude call with web search
  // ----------------------------------------------------------------
  const system = `Tu es un assistant qui enrichit des fiches d'événements en France (culturels, sportifs, religieux, commerciaux, associatifs, etc.). Tu as accès à une description complète de l'événement. Tu utilises le web UNIQUEMENT pour trouver les champs manquants listés dans expected_output. Tu ne remplaces JAMAIS les informations déjà fournies dans competitor_event. Tu réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après, sans backticks, sans markdown. Si tu ne trouves pas une information, mets null.`;

  const userPayload = {
    competitor_event: {
      event_label,
      description: description ?? null,
      city_name: city_name ?? null,
      event_venue_name: event_venue_name ?? null,
      distance_m: distance_m ?? null,
      radius_bucket: radius_bucket ?? null,
      industry_code: industry_code ?? null,
    },
    day_context: {
      primary_score_driver_label: primary_score_driver_label ?? null,
      primary_driver_confidence: primary_driver_confidence ?? null,
      delta_att_events_pct: delta_att_events_pct ?? null,
    },
    location_context: {
      business_short_description: business_short_description ?? null,
      primary_audience_1: primary_audience_1 ?? null,
      primary_audience_2: primary_audience_2 ?? null,
      main_event_objective: main_event_objective ?? null,
      company_activity_type: company_activity_type ?? null,
    },
    expected_output: {
      confirmed_dates: "dates confirmées de cette édition ou null",
      venue_capacity: "capacité d'accueil du lieu ou null",
      organizer: "nom de l'organisateur ou null",
      estimated_attendance: "fréquentation estimée ou null",
      primary_audience: "public principal ciblé en 5 mots max ou null",
      secondary_audience: "public secondaire ciblé en 5 mots max ou null",
      source_url: "URL officielle de l'événement ou null",
      business_takeaway: `1 phrase maximum en français depuis le point de vue d'un opérateur de type '${company_activity_type ?? "événementiel"}' situé à ${distance_m ? Math.round(Number(distance_m)) + "m" : "proximité"}. Utilise la description fournie et ce que tu as trouvé en ligne. Ne pas évaluer la pression concurrentielle globale du jour. Si informations insuffisantes, retourne null.`,
    }
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL_ENRICHMENT ?? "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      system,
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    }),
  });

  const aiData = await response.json();
  const textBlock = aiData.content?.filter((b: any) => b.type === "text").pop();
  const raw = textBlock?.text ?? "";

  let parsed: Record<string, string | null> = {};
  try {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    const clean = jsonMatch ? jsonMatch[1].trim() : raw.replace(/```json|```/g, "").trim();
    const rawParsed = JSON.parse(clean);

    parsed = Object.fromEntries(
      Object.entries(rawParsed).map(([k, v]) => [
        k,
        typeof v === "string"
          ? (v.replace(/<cite[^>]*>|<\/cite>/g, "").trim() || null)
          : (v != null ? String(v) : null)
      ])
    ) as Record<string, string | null>;
  } catch {
    parsed = {};
  }

  // ----------------------------------------------------------------
  // 3. Cache write (fire and forget)
  // ----------------------------------------------------------------
  if (Object.keys(parsed).length > 0) {
    const row = {
      enrichment_id:        randomUUID(),
      event_uid:            event_uid ?? null,
      event_label:          event_label,
      city_id:              city_id ?? null,
      source:               event_uid ? "pipeline" : "user_defined",
      enriched_at:          new Date().toISOString(),
      confirmed_dates:      parsed.confirmed_dates ?? null,
      venue_name:           event_venue_name ?? null,
      venue_address:        null,
      venue_capacity:       parsed.venue_capacity ?? null,
      organizer:            parsed.organizer ?? null,
      estimated_attendance: parsed.estimated_attendance ?? null,
      primary_audience:     parsed.primary_audience ?? null,
      secondary_audience:   parsed.secondary_audience ?? null,
      source_url:           parsed.source_url ?? null,
      business_takeaway:    parsed.business_takeaway ?? null,
    };

    bq.dataset("dims").table("dim_event_enrichment").insert([row])
      .catch((err: any) => console.warn("[enrich-event] cache write failed:", err));
  }

  // ----------------------------------------------------------------
  // 4. Compute takeaway and return
  // ----------------------------------------------------------------
  // Database fields always take precedence over web search
  if (event_venue_name) parsed.venue_name = event_venue_name;
  
  const business_takeaway = parsed.business_takeaway ||
    "Peu d'informations disponibles pour cet événement.";

  return new Response(
    JSON.stringify({ ok: true, data: {
      ...parsed,
      venue_name: event_venue_name ?? parsed.venue_name ?? null,
      business_takeaway,
    }}),
    { headers: { "Content-Type": "application/json" } }
  );
}