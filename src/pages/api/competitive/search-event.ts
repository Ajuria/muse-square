import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const SYSTEM_PROMPT = `Tu es un agent d'extraction de données événementielles pour Muse Square Insight, une plateforme de veille concurrentielle pour professionnels de l'événementiel en France.

Ta mission : identifier et extraire des informations structurées sur un événement professionnel spécifique à partir d'une recherche web.

RÈGLES ABSOLUES :
1. Recherche UNIQUEMENT l'événement décrit dans la requête. Ne t'écarte pas du sujet.
2. Extrais UNIQUEMENT ce qui est explicitement écrit sur les pages trouvées. Jamais d'inférence, jamais d'invention.
3. Pour chaque champ, cite la source exacte (URL + phrase source).
4. Si un champ est absent ou ambigu → retourne null. Jamais de valeur inventée.
5. Les dates doivent être au format YYYY-MM-DD. Si seul le mois/année est disponible → null pour le jour.
6. Si plusieurs événements correspondent → retourne les 2 à 4 plus pertinents, triés par pertinence décroissante.
7. Retourne UNIQUEMENT du JSON valide. Aucun texte avant ou après.

SCHEMA DE SORTIE (tableau de 1 à 4 résultats) :
[
  {
    "event_name": string | null,
    "event_date_start": "YYYY-MM-DD" | null,
    "event_date_end": "YYYY-MM-DD" | null,
    "event_city": string | null,
    "event_address": string | null,
    "organizer_name": string | null,
    "venue_name": string | null,
    "estimated_attendance": number | null,
    "industry_code": string | null,
    "primary_audience": string | null,
    "description": string | null,
    "source_url": string | null,
    "source_sentence": string | null,
    "confidence": "high" | "medium" | "low"
  }
]

RÈGLES DE CONFIANCE :
- high : date + ville explicitement confirmées sur source officielle (site événement, Eventbrite, Openagenda)
- medium : date ou ville confirmée, l'autre inférée — ou source secondaire (presse, agenda généraliste)
- low : champ manquant ou source non officielle

CODES INDUSTRIE (utilise exactement ces valeurs) :
non_profit, wellness, cinema_theatre, commercial, institutional, culture, family, live_event,
hotel_lodging, food_nightlife, science_innovation, pro_event, sport, transport_mobility,
outdoor_leisure, nightlife, unknown

AUDIENCES (utilise exactement ces valeurs) :
local, tourists, mixed, professionals, students, families, seniors`;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const body            = await request.json().catch(() => null);
    const event_name      = String(body?.event_name      || "").trim();
    const event_city      = String(body?.event_city      || "").trim();
    const date_start      = String(body?.date_start      || "").trim();
    const date_end        = String(body?.date_end        || "").trim();
    const organizer_name  = String(body?.organizer_name  || "").trim();
    const venue_name      = String(body?.venue_name      || "").trim();
    const source_url      = String(body?.source_url      || "").trim();

    if (!event_name || !event_city) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500, headers: { "content-type": "application/json" }
      });
    }

    // Build search query — richer context = better results
    const queryParts = [event_name, event_city];
    if (organizer_name) queryParts.push(organizer_name);
    if (venue_name)     queryParts.push(venue_name);
    if (date_start)     queryParts.push(date_start.slice(0, 7)); // YYYY-MM only

    const userPrompt = `Recherche et extrait les informations structurées pour l'événement suivant :

Nom : ${event_name}
Ville : ${event_city}${date_start ? `\nDate début : ${date_start}` : ""}${date_end ? `\nDate fin : ${date_end}` : ""}${organizer_name ? `\nOrganisateur : ${organizer_name}` : ""}${venue_name ? `\nLieu connu : ${venue_name}` : ""}${source_url ? `\nLien fourni : ${source_url}` : ""}

Recherche sur le web et retourne les ${source_url ? "informations de ce lien en priorité, puis complète avec d'autres sources" : "2 à 4 résultats les plus pertinents"}.
Priorité des sources : site officiel de l'événement > Eventbrite > Openagenda > presse locale > autres.`;

    // Call Claude with web_search tool
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type":    "application/json",
        "x-api-key":       anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system:     SYSTEM_PROMPT,
        tools: [{
          type: "web_search_20250305",
          name: "web_search",
        }],
        messages: [{
          role:    "user",
          content: userPrompt,
        }],
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`Claude API error: ${aiRes.status}`);
    }

    const aiJson = await aiRes.json().catch(() => null);

    // Extract last text block — Claude may produce tool_use blocks before final text
    const textBlocks = (aiJson?.content || [])
      .filter((b: any) => b.type === "text" && b.text?.trim())
      .map((b: any) => b.text.trim());

    const raw = textBlocks.pop() || "";

    // Extract JSON from response
    let candidates: any[] = [];
    try {
      const jsonMatch =
        raw.match(/```json\s*([\s\S]*?)```/) ||
        raw.match(/```\s*([\s\S]*?)```/)     ||
        raw.match(/(\[[\s\S]*\])/);

      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : raw;
      const parsed  = JSON.parse(jsonStr.trim());
      candidates    = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // If JSON extraction fails return empty — frontend falls back to manual entry
      candidates = [];
    }

    // Validate and sanitize each candidate
    const validDates = (s: any): string | null => {
      if (!s || typeof s !== "string") return null;
      return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
    };

    const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);
    const VALID_INDUSTRY   = new Set([
      "non_profit","wellness","cinema_theatre","commercial","institutional",
      "culture","family","live_event","hotel_lodging","food_nightlife",
      "science_innovation","pro_event","sport","transport_mobility",
      "outdoor_leisure","nightlife","unknown"
    ]);
    const VALID_AUDIENCE   = new Set([
      "local","tourists","mixed","professionals","students","families","seniors"
    ]);

    const BUCKET_MAP: Record<string, string> = {
      non_profit:         "institutional_activity",
      wellness:           "leisure_activity",
      cinema_theatre:     "culture_event",
      commercial:         "commercial_activity",
      institutional:      "institutional_activity",
      culture:            "culture_event",
      family:             "institutional_activity",
      live_event:         "culture_event",
      hotel_lodging:      "commercial_activity",
      food_nightlife:     "commercial_activity",
      science_innovation: "institutional_activity",
      pro_event:          "commercial_activity",
      sport:              "leisure_activity",
      transport_mobility: "institutional_activity",
      outdoor_leisure:    "leisure_activity",
      nightlife:          "culture_event",
      unknown:            "commercial_activity",
    };

    const sanitized = candidates.slice(0, 4).map((c: any) => {
      const industry_code = VALID_INDUSTRY.has(c.industry_code) ? c.industry_code : null;
      return {
        event_name:           typeof c.event_name === "string"  ? c.event_name.trim()  : null,
        event_date_start:     validDates(c.event_date_start),
        event_date_end:       validDates(c.event_date_end),
        event_city:           typeof c.event_city === "string"  ? c.event_city.trim()  : event_city,
        event_address:        typeof c.event_address === "string" ? c.event_address.trim() : null,
        organizer_name:       typeof c.organizer_name === "string" ? c.organizer_name.trim() : null,
        venue_name:           typeof c.venue_name === "string"  ? c.venue_name.trim()  : null,
        estimated_attendance: typeof c.estimated_attendance === "number" ? Math.round(c.estimated_attendance) : null,
        industry_code,
        industry_bucket:      industry_code ? (BUCKET_MAP[industry_code] ?? null) : null,
        primary_audience:     VALID_AUDIENCE.has(c.primary_audience) ? c.primary_audience : null,
        description:          typeof c.description === "string" ? c.description.trim().slice(0, 500) : null,
        source_url:           typeof c.source_url === "string"  ? c.source_url.trim()  : null,
        source_sentence:      typeof c.source_sentence === "string" ? c.source_sentence.trim().slice(0, 300) : null,
        confidence:           VALID_CONFIDENCE.has(c.confidence) ? c.confidence : "low",
        // Confidence → score mapping
        confidence_score:
          c.confidence === "high"   ? 0.9 :
          c.confidence === "medium" ? 0.7 : 0.5,
      };
    });

    // Filter: only return confidence ≥ low (0.5) — discard junk
    const filtered = sanitized.filter(c => c.event_name && c.confidence_score >= 0.5);

    return new Response(JSON.stringify({
      ok:         true,
      candidates: filtered,
      raw_query:  queryParts.join(" "),
      fallback:   filtered.length === 0,
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[search-event]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};