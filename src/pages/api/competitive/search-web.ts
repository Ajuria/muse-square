// src/pages/api/competitive/search-web.ts
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import crypto from "crypto";
import {
  VALID_CONFIDENCE,
  VALID_INDUSTRY,
  VALID_AUDIENCE,
  BUCKET_MAP,
  classifySource,
  confidenceToScore,
  validDateOrNull,
  JUNK_URL_PATTERNS,
} from "../../../lib/competitive/constants";

export const prerender = false;

const SYSTEM_PROMPT = `Tu es un agent de veille concurrentielle pour Muse Square Insight, une plateforme pour professionnels de l'événementiel en France.

Ta mission : rechercher sur le web des événements, lieux ou marques correspondant à la requête de l'utilisateur dans une zone géographique donnée.

RÈGLES ABSOLUES :
1. Recherche UNIQUEMENT ce qui correspond à la requête. Ne t'écarte pas du sujet.
2. Extrais UNIQUEMENT ce qui est explicitement écrit sur les pages trouvées. Jamais d'inférence, jamais d'invention.
3. Si un champ est absent ou ambigu → retourne null. Jamais de valeur inventée.
4. Retourne entre 2 et 6 résultats pertinents, triés par pertinence décroissante.
5. Retourne UNIQUEMENT du JSON valide. Aucun texte avant ou après.
6. Distingue les types : "event" pour un événement ponctuel (salon, festival, exposition, conférence), "competitor" pour un lieu ou une marque permanente (musée, enseigne, organisateur, salle).

SCHEMA DE SORTIE (tableau de 2 à 6 résultats) :
[
  {
    "type": "event" | "competitor",
    "name": string | null,
    "date_start": "YYYY-MM-DD" | null,
    "date_end": "YYYY-MM-DD" | null,
    "location": string | null,
    "address": string | null,
    "organizer": string | null,
    "industry_code": string | null,
    "primary_audience": string | null,
    "description": string | null,
    "source_url": string | null,
    "source_sentence": string | null,
    "confidence": "high" | "medium" | "low"
  }
]

RÈGLES DE CONFIANCE :
- high : informations confirmées sur source officielle (site de l'événement/lieu, Eventbrite, Openagenda)
- medium : informations partielles ou source secondaire (presse, agenda généraliste)
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
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body  = await request.json().catch(() => null);
    const query = String(body?.query || "").trim();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ ok: false, error: "Query too short" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    if (!anthropicKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ANTHROPIC_API_KEY" }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    }

    // Get user's city name for geographic context
    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const [locRows] = await bq.query({
      query: `
        SELECT city_name, region_name
        FROM \`${projectId}.semantic.vw_insight_event_ai_location_context\`
        WHERE location_id = @location_id
        LIMIT 1
      `,
      params: { location_id },
      location: BQ_LOCATION,
    });

    const userCity   = locRows?.[0]?.city_name   ?? "France";
    const userRegion = locRows?.[0]?.region_name  ?? "";

    const userPrompt = `Recherche sur le web les événements, lieux ou marques correspondant à cette requête :

"${query}"

Zone géographique : ${userCity}${userRegion ? `, ${userRegion}` : ""}, France

Retourne les 2 à 6 résultats les plus pertinents.
Priorité des sources : site officiel > Eventbrite > Openagenda > presse locale > autres.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 3000,
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
      const errBody = await aiRes.text().catch(() => "");
      console.error("[search-web] Claude API error:", aiRes.status, errBody.slice(0, 200));
      throw new Error(`Claude API error: ${aiRes.status}`);
    }

    const aiJson = await aiRes.json().catch(() => null);

    // Extract last text block
    const textBlocks = (aiJson?.content || [])
      .filter((b: any) => b.type === "text" && b.text?.trim())
      .map((b: any) => b.text.trim());

    const raw = textBlocks.pop() || "";

    // Parse JSON from response
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
      candidates = [];
    }

    // Sanitize each result
    const sanitized = candidates.slice(0, 6).map((c: any) => {
      const ic   = VALID_INDUSTRY.has(c.industry_code) ? c.industry_code : null;
      const type = (c.type === "event" || c.type === "competitor") ? c.type : "competitor";
      const conf = VALID_CONFIDENCE.has(c.confidence) ? c.confidence : "low";
      const srcUrl = typeof c.source_url === "string" ? c.source_url.trim() : null;

      return {
        type,
        name:               typeof c.name === "string"        ? c.name.trim()        : null,
        date_start:         validDateOrNull(c.date_start),
        date_end:           validDateOrNull(c.date_end),
        location:           typeof c.location === "string"    ? c.location.trim()    : null,
        address:            typeof c.address === "string"     ? c.address.trim()     : null,
        organizer:          typeof c.organizer === "string"   ? c.organizer.trim()   : null,
        industry_code:      ic,
        industry_bucket:    ic ? (BUCKET_MAP[ic] ?? null) : null,
        primary_audience:   VALID_AUDIENCE.has(c.primary_audience)  ? c.primary_audience  : null,
        description:        typeof c.description === "string" ? c.description.trim().slice(0, 500) : null,
        source_url:         srcUrl,
        source_type:        classifySource(srcUrl),
        source_sentence:    typeof c.source_sentence === "string" ? c.source_sentence.trim().slice(0, 300) : null,
        confidence:         conf,
        confidence_score:   confidenceToScore(conf),
      };
    });

    // Filter junk
    const filtered = sanitized.filter(c =>
      c.name &&
      c.confidence_score >= 0.5 &&
      !(c.source_url && JUNK_URL_PATTERNS.some(p => p.test(c.source_url!)))
    );

    // Cache high-confidence results (fire and forget)
    if (filtered.length > 0) {
      const rows = filtered
        .filter(c => c.confidence_score >= 0.7)
        .map(c => ({
          enrichment_id: crypto.randomUUID(),
          event_uid: null,
          event_label: c.name,
          city_id: null,
          source: 'competitive_search',
          enriched_at: new Date().toISOString(),
          confirmed_dates: c.date_start && c.date_end ? `${c.date_start} - ${c.date_end}` : c.date_start,
          venue_name: c.location,
          venue_address: c.address,
          venue_capacity: null,
          organizer: c.organizer,
          estimated_attendance: null,
          audience_profile: c.primary_audience,
          primary_audience: c.primary_audience,
          secondary_audience: null,
          source_url: c.source_url,
          business_takeaway: c.description,
        }));

      if (rows.length > 0) {
        bq.dataset("dims").table("dim_event_enrichment").insert(rows)
          .catch((err: any) => console.warn("[search-web] cache write failed:", err));
      }
    }

    return new Response(JSON.stringify({
      ok:       true,
      results:  filtered,
      query,
      fallback: filtered.length === 0,
    }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[search-web]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};