import "dotenv/config";
import type { APIRoute } from "astro";
import { VALID_INDUSTRY, VALID_AUDIENCE, VALID_CONFIDENCE, BUCKET_MAP, classifySource, JUNK_URL_PATTERNS } from "../../../lib/competitive/constants";
import { modelFor } from "../../../lib/ai/models";

export const prerender = false;

const SYSTEM_PROMPT = `Tu es un agent d'extraction de données concurrentielles pour Muse Square Insight, une plateforme de veille concurrentielle pour professionnels de l'événementiel en France.

Ta mission : identifier et extraire des informations structurées sur une organisation concurrente (marque, enseigne, organisateur, lieu) à partir d'une recherche web.

RÈGLES ABSOLUES :
1. Recherche UNIQUEMENT l'organisation décrite dans la requête. Ne t'écarte pas du sujet.
2. Extrais UNIQUEMENT ce qui est explicitement écrit sur les pages trouvées. Jamais d'inférence, jamais d'invention.
3. Si un champ est absent ou ambigu → retourne null. Jamais de valeur inventée.
4. Si plusieurs organisations correspondent → retourne les 2 à 4 plus pertinentes, triées par pertinence décroissante.
5. Retourne UNIQUEMENT du JSON valide. Aucun texte avant ou après.

SCHEMA DE SORTIE (tableau de 1 à 4 résultats) :
[
  {
    "competitor_name": string | null,
    "address": string | null,
    "city": string | null,
    "industry_code": string | null,
    "primary_audience": string | null,
    "secondary_audience": string | null,
    "description": string | null,
    "source_url": string | null,
    "source_sentence": string | null,
    "confidence": "high" | "medium" | "low"
  }
]

RÈGLES DE CONFIANCE :
- high : nom + ville + secteur explicitement confirmés sur source officielle (site officiel, LinkedIn, Eventbrite, Openagenda)
- medium : nom + ville confirmés, secteur inféré — ou source secondaire (presse, annuaire)
- low : champ manquant ou source non officielle

CODES INDUSTRIE (utilise exactement ces valeurs) :
non_profit, wellness, camping_outdoor, convention_center, cinema_theatre, commercial,
institutional, coworking, culture, family, live_event, gallery, hotel_lodging, market_hall,
wine_tourism, theme_park, food_nightlife, science_innovation, pro_event, sport,
transport_mobility, nightlife, unknown

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
    const competitor_name = String(body?.competitor_name || "").trim();
    const competitor_city = String(body?.competitor_city || "").trim();
    const industry_code   = String(body?.industry_code   || "").trim();
    const venue_name      = String(body?.venue_name      || "").trim();
    const source_url      = String(body?.source_url      || "").trim();

    if (!competitor_name || !competitor_city) {
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

    const queryParts = [competitor_name, competitor_city, "France"];
    if (industry_code) queryParts.push(industry_code);
    if (venue_name)    queryParts.push(venue_name);

    const userPrompt = `Recherche et extrait les informations structurées pour l'organisation concurrente suivante :

Nom : ${competitor_name}
Ville : ${competitor_city}${industry_code ? `\nSecteur : ${industry_code}` : ""}${venue_name ? `\nLieu connu : ${venue_name}` : ""}${source_url ? `\nLien fourni : ${source_url}` : ""}

Recherche sur le web et retourne les ${source_url ? "informations de ce lien en priorité, puis complète avec d'autres sources" : "2 à 4 résultats les plus pertinents"}.
Priorité des sources : site officiel > LinkedIn > Eventbrite > Openagenda > presse locale > autres.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta":    "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model:      modelFor("enrichment"),
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
      const errBody = await aiRes.text().catch(() => "");
      console.error("[search-competitor] Claude API error:", aiRes.status, errBody);
      throw new Error(`Claude API error: ${aiRes.status} — ${errBody.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json().catch(() => null);

    const textBlocks = (aiJson?.content || [])
      .filter((b: any) => b.type === "text" && b.text?.trim())
      .map((b: any) => b.text.trim());

    const raw = textBlocks.pop() || "";

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

    const sanitized = candidates.slice(0, 4).map((c: any) => {
      const ic = VALID_INDUSTRY.has(c.industry_code) ? c.industry_code : null;
      return {
        competitor_name:    typeof c.competitor_name === "string"    ? c.competitor_name.trim()    : null,
        address:            typeof c.address === "string"            ? c.address.trim()            : null,
        city:               typeof c.city === "string"               ? c.city.trim()               : competitor_city,
        industry_code:      ic,
        industry_bucket:    ic ? (BUCKET_MAP[ic] ?? null) : null,
        primary_audience:   VALID_AUDIENCE.has(c.primary_audience)   ? c.primary_audience          : null,
        secondary_audience: VALID_AUDIENCE.has(c.secondary_audience) ? c.secondary_audience        : null,
        description:        typeof c.description === "string"        ? c.description.trim().slice(0, 500) : null,
        source_url:         typeof c.source_url === "string"         ? c.source_url.trim()         : null,
        source_type:        classifySource(typeof c.source_url === "string" ? c.source_url.trim() : null),
        source_sentence:    typeof c.source_sentence === "string"    ? c.source_sentence.trim().slice(0, 300) : null,
        confidence:         VALID_CONFIDENCE.has(c.confidence)       ? c.confidence                : "low",
        confidence_score:
          c.confidence === "high"   ? 0.9 :
          c.confidence === "medium" ? 0.7 : 0.5,
      };
    });

    const filtered = sanitized.filter(c =>
      c.competitor_name &&
      c.confidence_score >= 0.5 &&
      !(c.source_url && JUNK_URL_PATTERNS.some(p => p.test(c.source_url)))
    );

    // If user provided a source_url, inject it into the top candidate
    if (source_url && filtered.length > 0) {
      filtered[0].source_url = source_url;
      filtered[0].source_type = classifySource(source_url);
    }

    return new Response(JSON.stringify({
      ok:         true,
      candidates: filtered,
      raw_query:  queryParts.join(" "),
      fallback:   filtered.length === 0,
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[search-competitor]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};