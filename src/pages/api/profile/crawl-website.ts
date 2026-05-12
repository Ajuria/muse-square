// src/pages/api/profile/crawl-website.ts
/**
 * Background endpoint: crawl a user's website_url via Browserless,
 * extract structured business context via Claude, store in BQ.
 *
 * Called fire-and-forget from save.ts when website_url changes.
 * Also callable manually: POST { location_id, website_url }
 */
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { logCrawl, logApiError } from "../../../lib/error-logger";

export const prerender = false;

function getUserIdFromLocals(locals: any): string {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") throw new Error("Unauthorized");
  return v.trim();
}

async function fetchPageText(url: string): Promise<string | null> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://production-sfo.browserless.io/content?token=${token}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          url,
          waitForTimeout: 3000,
          rejectResourceTypes: ["image", "media", "font"],
        }),
      }
    );
    if (!res.ok) return null;
    let html = await res.text();

    // Strip tags, collapse whitespace, limit to 15k chars
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
    html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ");
    html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ");
    html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ");
    html = html.replace(/<[^>]+>/g, " ");
    html = html.replace(/\s+/g, " ").trim().slice(0, 15_000);

    return html.length > 50 ? html : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractWithClaude(pageText: string, websiteUrl: string): Promise<Record<string, any> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You extract structured business information from a website's text content.
Return ONLY valid JSON, no markdown, no explanation.

CRITICAL RULES:
- Only extract information EXPLICITLY present on the page. Never infer, invent, or assume.
- If a field's information is not found on the page, set it to null.
- This must work for any type of physical venue: museum, hotel, restaurant, retail store, concert hall, corporate event space, sports venue, coworking, theme park, etc.
- Adapt vocabulary to the business: "programmation" for a cultural venue, "carte/menu" for a restaurant, "offres/chambres" for a hotel, "collections/catalogue" for retail, "espaces/salles" for corporate venues, etc.
- Write all values in French.

The JSON must have exactly these fields:
{
  "business_description": "2-3 sentence description of what this business does, its positioning, and what makes it unique",
  "current_offering": "what is actively available right now: exhibitions, shows, menu, rooms, collections, rental spaces, seasonal packages, etc. Adapt to the business type. null if none found",
  "services_and_amenities": "services, experiences, facilities, or amenities offered: guided tours, spa, delivery, private hire, catering, parking, Wi-Fi, concierge, click-and-collect, etc. null if none found",
  "target_audience": "who this business targets based on content tone and offerings. null if not discernible",
  "tone_of_voice": "brand voice in 2-3 adjectives (e.g. 'professionnel, chaleureux, accessible'). null if not enough content",
  "opening_hours_mentioned": "any opening hours or seasonal schedules found on the page. null if none",
  "key_differentiators": "what sets this business apart from competitors based on the content. null if not discernible",
  "pricing_info": "pricing model, price ranges, or free/paid status mentioned on the site. null if none found",
  "event_examples": "specific past or upcoming events, exhibitions, concerts, promotions, or seasonal offerings mentioned by name. null if none found",
  "brand_positioning": "how the business positions itself: luxury, accessible, heritage, innovative, family, premium, popular, etc. null if not discernible",
  "partnerships_mentioned": "sponsors, institutional partners, labels, affiliations, or networks mentioned. null if none found",
  "geographic_scope": "local, regional, national, or international reach as stated or implied by the content. null if not discernible",
  "age_range_mentioned": "any target age groups or generational segments explicitly mentioned. null if none found",
  "accessibility_info": "PMR accessibility, family-friendly facilities, disabled access, or similar mentions. null if none found"
}
All values must be strings or null.`;

  const userPrompt = `Extract business information from this website (${websiteUrl}):\n\n${pageText}`;

  try {
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

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = getUserIdFromLocals(locals);
    const body = await request.json();
    const location_id = String(body?.location_id || "").trim();
    const website_url = String(body?.website_url || "").trim();

    if (!location_id || !website_url) {
      return new Response(JSON.stringify({ ok: false, error: "location_id and website_url required" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    // 1. Crawl
    const crawlStart = Date.now();
    const pageText = await fetchPageText(website_url);
    const crawlDuration = Date.now() - crawlStart;

    if (!pageText) {
      logCrawl({
        clerk_user_id, location_id, website_url,
        status: "crawl_failed", duration_ms: crawlDuration,
        error_message: "Could not extract text from website",
      });
      return new Response(JSON.stringify({ ok: false, error: "crawl_failed", detail: "Could not extract text from website" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // 2. Extract with Claude
    const extracted = await extractWithClaude(pageText, website_url);
    if (!extracted) {
      logCrawl({
        clerk_user_id, location_id, website_url,
        status: "extraction_failed", duration_ms: Date.now() - crawlStart,
        error_message: "Claude extraction returned null",
        extraction_model: "claude-sonnet-4-20250514",
      });
      return new Response(JSON.stringify({ ok: false, error: "extraction_failed", detail: "Claude extraction returned null" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // 3. Store in BQ
    const projectId = (process.env.BQ_PROJECT_ID || "").trim();
    const dataset = (process.env.BQ_DATASET || "").trim();
    const table = (process.env.BQ_TABLE || "").trim();
    const bigquery = makeBQClient(projectId);
    const fullTable = `\`${projectId}.${dataset}.${table}\``;
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const enrichedJson = JSON.stringify({
      ...extracted,
      crawled_at: new Date().toISOString(),
      source_url: website_url,
    });

    await bigquery.query({
      query: `
        UPDATE ${fullTable}
        SET auto_enriched_description = @auto_enriched_description,
            updated_at = CURRENT_TIMESTAMP()
        WHERE clerk_user_id = @clerk_user_id
          AND location_id = @location_id
      `,
      location: BQ_LOCATION,
      params: { clerk_user_id, location_id, auto_enriched_description: enrichedJson },
      types: { clerk_user_id: "STRING", location_id: "STRING", auto_enriched_description: "STRING" },
    });

    logCrawl({
      clerk_user_id, location_id, website_url,
      status: "success", duration_ms: Date.now() - crawlStart,
      pages_extracted: 1, extraction_model: "claude-sonnet-4-20250514",
    });

    return new Response(JSON.stringify({ ok: true, enriched: extracted }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[crawl-website]", err?.message);
    logApiError({
      clerk_user_id: null, location_id: null,
      endpoint: "/api/profile/crawl-website",
      error_type: "unhandled_exception",
      error_message: err?.message || "Unknown error",
      http_status_code: 500,
    });
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};