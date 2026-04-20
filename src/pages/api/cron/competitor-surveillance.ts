// src/pages/api/cron/competitor-surveillance.ts
/*
  CRON JOB — Web Surveillance Pipeline

  Schedule: nightly 03:00 UTC (vercel.json)

  Steps:
  1. Read all vetted competitor URLs from raw.competitor_directory,
     joined to raw.competitor_tracking and location lat/lon
  2. Fetch each URL (raw HTML)
  3. Extract JSON-LD structured data + strip HTML text
  4. Pass to Claude Sonnet — extract event fields, null over hallucination
  5. Apply auto-confirmation quality gate
  6. Write structured results to raw.competitor_events

  v2 items (deferred):
  - Multi-event extraction per page (currently: next upcoming event only)
  - dbt Job trigger after cron completes
*/

import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";

export const prerender = false;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CompetitorSource {
  competitor_id: string;
  location_id: string;
  source_url: string;
  vetted_by: string | null;
  competitor_industry_code: string | null;
  location_lat: number | null;
  location_lon: number | null;
}

interface ExtractionResult {
  signal_type: "event" | "launch" | "opening" | "campaign" | "press" | "partnership" | "unknown" | null;
  event_name: string | null;
  event_date: string | null;
  event_date_end: string | null;
  event_date_raw: string | null;
  event_type: string | null;
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  event_city: string | null;
  event_lat: number | null;
  event_lon: number | null;
  capacity: number | null;
  estimated_attendance: number | null;
  venue_exposure: "indoor" | "outdoor" | "unknown" | null;
  primary_audience: string | null;
  secondary_audience: string | null;
  audience_description: string | null;
  industry_code: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_INDUSTRY = new Set([
  "non_profit", "wellness", "cinema_theatre", "commercial", "institutional",
  "culture", "family", "live_event", "hotel_lodging", "food_nightlife",
  "science_innovation", "pro_event", "sport", "transport_mobility",
  "outdoor_leisure", "nightlife", "unknown",
]);

const VALID_AUDIENCE = new Set([
  "families", "professionals", "students", "seniors", "tourists",
  "locals", "art_lovers", "sports_fans", "general_public",
]);

const EXTRACTION_MODEL = "claude-sonnet-4-20250514";

// 55s — safe margin for Vercel Pro 60s limit
const TIMEOUT_MS = 55_000;

const EXTRACTION_PROMPT = `You are a strict business signal extractor. You read content from a competitor's website and extract structured information about their next upcoming business event or signal.

A "business signal" is any of the following:
- A scheduled public or professional event (exhibition, salon, conference, concert, festival, workshop)
- A product or service launch
- A store, showroom, or point-of-sale opening
- A marketing campaign or promotional period
- A press release or major announcement
- A partnership, acquisition, or expansion announcement

The content will contain two sections:
1. JSON-LD STRUCTURED DATA — machine-readable schema.org markup. Prioritize this over page text.
2. PAGE TEXT — stripped HTML text. Use as fallback or to supplement JSON-LD.

RULES — non-negotiable:
- Return ONLY valid JSON. No preamble, no markdown, no explanation.
- If a field is not explicitly stated in the content, return null. Never infer, never guess.
- Dates must be in YYYY-MM-DD format. If you cannot determine the exact date, return null.
- signal_type must be exactly one of: "event", "launch", "opening", "campaign", "press", "partnership", "unknown" — nothing else.
- venue_exposure must be exactly "indoor", "outdoor", or "unknown" — nothing else.
- industry_code must be one of: non_profit, wellness, cinema_theatre, commercial, institutional, culture, family, live_event, hotel_lodging, food_nightlife, science_innovation, pro_event, sport, transport_mobility, outdoor_leisure, nightlife, unknown — or null.
- primary_audience and secondary_audience must be one of: families, professionals, students, seniors, tourists, locals, art_lovers, sports_fans, general_public — or null.
- capacity and estimated_attendance must be integers or null. Never compute or estimate them.
- If the page contains multiple signals, extract ALL of them as an array.
- If no signal is found at all, return an empty array [].

Return this exact JSON structure — an array of objects:
[
  {
    "signal_type": null,
    "event_name": null,
    "event_date": null,
    "event_date_end": null,
    "event_date_raw": null,
    "event_type": null,
    "description": null,
    "venue_name": null,
    "venue_address": null,
    "event_city": null,
    "event_lat": null,
    "event_lon": null,
    "capacity": null,
    "estimated_attendance": null,
    "venue_exposure": null,
    "primary_audience": null,
    "secondary_audience": null,
    "audience_description": null,
    "industry_code": null
  }
}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function countExtractedFields(result: ExtractionResult): number {
  return Object.values(result).filter((v) => v !== null).length;
}

function extractJsonLd(html: string): string {
  const matches = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];
  return matches.map((m) => m[1]).join("\n");
}

function prepareContent(html: string): string {
  const jsonLd = extractJsonLd(html);

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/\s+/g, " ").trim().slice(0, 12_000);

  return jsonLd
    ? `JSON-LD STRUCTURED DATA:\n${jsonLd}\n\nPAGE TEXT:\n${text}`
    : text;
}

function validateExtraction(raw: unknown): ExtractionResult {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Extraction result is not an object");
  }
  const r = raw as Record<string, unknown>;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  return {
    signal_type: ["event","launch","opening","campaign","press","partnership","unknown"].includes(r.signal_type as string)
      ? (r.signal_type as ExtractionResult["signal_type"])
      : null,
    event_name:
      typeof r.event_name === "string" ? r.event_name.trim() || null : null,
    event_date:
      typeof r.event_date === "string" && dateRegex.test(r.event_date)
        ? r.event_date
        : null,
    event_date_end:
      typeof r.event_date_end === "string" && dateRegex.test(r.event_date_end)
        ? r.event_date_end
        : null,
    event_date_raw:
      typeof r.event_date_raw === "string" ? r.event_date_raw.trim() || null : null,
    event_type:
      typeof r.event_type === "string" ? r.event_type.trim() || null : null,
    description:
      typeof r.description === "string" ? r.description.trim() || null : null,
    venue_name:
      typeof r.venue_name === "string" ? r.venue_name.trim() || null : null,
    venue_address:
      typeof r.venue_address === "string" ? r.venue_address.trim() || null : null,
    event_city:
      typeof r.event_city === "string" ? r.event_city.trim() || null : null,
    event_lat:
      typeof r.event_lat === "number" ? r.event_lat : null,
    event_lon:
      typeof r.event_lon === "number" ? r.event_lon : null,
    capacity:
      typeof r.capacity === "number" ? Math.round(r.capacity) : null,
    estimated_attendance:
      typeof r.estimated_attendance === "number"
        ? Math.round(r.estimated_attendance)
        : null,
    venue_exposure: ["indoor", "outdoor", "unknown"].includes(
      r.venue_exposure as string
    )
      ? (r.venue_exposure as "indoor" | "outdoor" | "unknown")
      : null,
    primary_audience:
      typeof r.primary_audience === "string" && VALID_AUDIENCE.has(r.primary_audience)
        ? r.primary_audience
        : null,
    secondary_audience:
      typeof r.secondary_audience === "string" &&
      VALID_AUDIENCE.has(r.secondary_audience)
        ? r.secondary_audience
        : null,
    audience_description:
      typeof r.audience_description === "string"
        ? r.audience_description.trim() || null
        : null,
    industry_code:
      typeof r.industry_code === "string" && VALID_INDUSTRY.has(r.industry_code)
        ? r.industry_code
        : null,
  };
}

async function fetchHtml(url: string): Promise<{ html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(
      `https://production-sfo.browserless.io/content?token=${process.env.BROWSERLESS_TOKEN}`,
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
    const html = await res.text();
    return { html, status: res.status };
  } finally {
    clearTimeout(timeout);
  }
}

// ── URL qualification ─────────────────────────────────────────────────────────

const EXCLUDED_DOMAINS = new Set([
  "linkedin.com", "www.linkedin.com",
  "facebook.com", "www.facebook.com",
  "instagram.com", "www.instagram.com",
  "twitter.com", "www.twitter.com", "x.com",
  "tiktok.com", "www.tiktok.com",
  "youtube.com", "www.youtube.com",
]);

const HIGH_VALUE_PATH_SEGMENTS = [
  "/agenda", "/evenements", "/événements",
  "/events", "/programme", "/calendar",
  "/calendrier", "/manifestations",
  "/billetweb", "/eventbrite", "/weezevent", "/helloasso",
];

const MARKETING_PATH_SEGMENTS = [
  "/actualites", "/actualités", "/news",
  "/blog", "/presse", "/press",
];

const TICKETING_DOMAINS = new Set([
  "billetweb.fr", "eventbrite.fr", "eventbrite.com",
  "weezevent.com", "helloasso.com", "shotgun.live",
  "digitick.com", "festik.net",
]);

function qualifyUrl(url: string): { qualified: boolean; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { qualified: false, reason: "invalid_url" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  // Hard exclusions — these domains cannot be scraped reliably
  if (EXCLUDED_DOMAINS.has(hostname)) {
    return { qualified: false, reason: `excluded_domain:${hostname}` };
  }

  // Ticketing platforms — high value, always qualify
  if (TICKETING_DOMAINS.has(hostname)) {
    return { qualified: true, reason: "ticketing_platform" };
  }

  // High-value path segments — qualify
  for (const segment of HIGH_VALUE_PATH_SEGMENTS) {
    if (pathname.includes(segment)) {
      return { qualified: true, reason: `high_value_path:${segment}` };
    }
  }

  // Marketing path segments — qualify (for future marketing signal use)
  for (const segment of MARKETING_PATH_SEGMENTS) {
    if (pathname.includes(segment)) {
      return { qualified: true, reason: `marketing_path:${segment}` };
    }
  }

  // Root domain or shallow path — qualify with lower confidence
  // (homepage may contain agenda section)
  const pathDepth = pathname.split("/").filter(Boolean).length;
  if (pathDepth <= 1) {
    return { qualified: true, reason: "root_or_shallow_path" };
  }

  // Deep unknown path — qualify but flag
  return { qualified: true, reason: "unknown_path" };
}

const DATE_PATTERN = /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|\d{1,2}[\/\-]\d{2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;

const EVENT_KEYWORDS = /\b(exposition|concert|conférence|conference|salon|festival|spectacle|atelier|séance|seance|représentation|representation|inauguration|vernissage|lancement|colloque|forum|rencontre|projection|performance|résidence|residence|masterclass|workshop|lancement|ouverture|inauguration|partenariat|partnership|campagne|campaign|offre|promotion|soldes|collection|nouveauté|nouveau|nouvelle|annonce|communiqué|presse|press|release|produit|product|service|store|magasin|boutique|pop.up|showroom|flagship|concept.store|déploiement|deployment|expansion|levée de fonds|fundraising|acquisition|fusion|merger|recrutement|hiring)\b/i;

const BUSINESS_SIGNALS = /\b(nous\s+ouvrons|we\s+are\s+opening|grand\s+ouverture|soft\s+launch|hard\s+launch|available\s+now|disponible\s+maintenant|à\s+partir\s+du|starting|dès\s+le|coming\s+soon|bientôt|prochainement|save\s+the\s+date|mark\s+your\s+calendar|rejoignez.nous|join\s+us|inscrivez.vous|register\s+now)\b/i;

function hasEventSignals(text: string): boolean {
  return DATE_PATTERN.test(text) && (EVENT_KEYWORDS.test(text) || BUSINESS_SIGNALS.test(text));
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
  const BQ_LOCATION = String(process.env.BQ_LOCATION || "EU").trim();
  const runId       = randomUUID();
  const crawledAt   = new Date().toISOString();
  const startTime   = Date.now();

  const results = {
    run_id:    runId,
    processed: 0,
    success:   0,
    partial:   0,
    failed:    0,
    errors:    [] as string[],
  };

  try {
    const bq        = makeBQClient(projectId);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── Step 1: Read vetted competitor URLs + location lat/lon ────────────────
    const [sources] = await bq.query({
      query: `
        SELECT
          cd.competitor_id,
          ct.location_id,
          cd.source_url,
          cd.vetted_by,
          cd.industry_code                    AS competitor_industry_code,
          lp.company_lat                      AS location_lat,
          lp.company_lon                      AS location_lon
        FROM \`${projectId}.raw.competitor_directory\` cd
        INNER JOIN \`${projectId}.raw.competitor_tracking\` ct
          ON cd.competitor_id = ct.competitor_id
        LEFT JOIN (
          SELECT location_id, company_lat, company_lon
          FROM \`${projectId}.raw.insight_event_user_location_profile\`
          WHERE company_geocode_status = 'geocoded_ok'
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY location_id ORDER BY updated_at DESC
          ) = 1
        ) lp ON ct.location_id = lp.location_id
        WHERE cd.source_url IS NOT NULL
          AND cd.is_user_vetted = TRUE
          AND cd.deleted_at IS NULL
      `,
      location: BQ_LOCATION,
    });

    const competitors = sources as CompetitorSource[];

    // ── Step 2-5: Fetch → Extract → Write per competitor ─────────────────────
    for (const comp of competitors) {
      // Timeout guard — break loop before Vercel kills the function
      if (Date.now() - startTime > TIMEOUT_MS) {
        results.errors.push("Timeout reached — remaining competitors deferred to next run");
        break;
      }

      results.processed++;

      let fetchStatus: number | null = null;
      let htmlByteLength: number | null = null;
      let extractionStatus: "success" | "partial" | "failed" | "fetch_error" = "failed";
      let extraction: ExtractionResult | null = null;
      let rawExtractionJson: string | null = null;

      // Get current max crawl_version for this competitor
      const [versionRows] = await bq.query({
        query: `
          SELECT COALESCE(MAX(crawl_version), 0) AS max_version
          FROM \`${projectId}.raw.competitor_events\`
          WHERE competitor_id = @competitor_id
        `,
        params: { competitor_id: comp.competitor_id },
        location: BQ_LOCATION,
      });
      const crawlVersion: number =
        (Number((versionRows as any[])[0]?.max_version) || 0) + 1;

      try {
        // Step 2a: URL qualification — skip excluded domains before fetching
        const qualification = qualifyUrl(comp.source_url);
        if (!qualification.qualified) {
          extractionStatus = "fetch_error";
          throw new Error(`url_not_qualified:${qualification.reason}`);
        }

        // Step 2b: Fetch HTML
        const { html, status } = await fetchHtml(comp.source_url);
        fetchStatus = status;

        if (status < 200 || status >= 400) {
          extractionStatus = "fetch_error";
          throw new Error(`HTTP ${status}`);
        }

        // Step 3: Prepare content (JSON-LD first, then stripped text)
        const content = prepareContent(html);
        htmlByteLength = Buffer.byteLength(content, "utf8");

        // Step 3b: Content-level gate — skip Claude call if no event signals
        // detected in page text. Saves cost, avoids hallucination on
        // irrelevant pages (contact pages, privacy policies, etc.)
        if (!hasEventSignals(content)) {
          extractionStatus = "partial";
          throw new Error("no_event_signals_detected");
        }

        // Step 4: Claude extraction
        const message = await anthropic.messages.create({
          model: EXTRACTION_MODEL,
          max_tokens: 8192,
          messages: [
            {
              role: "user",
              content: `${EXTRACTION_PROMPT}\n\nCONTENT:\n${content}`,
            },
          ],
        });

        const rawText = message.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        rawExtractionJson = rawText;

        const parsedRaw = JSON.parse(rawText.replace(/```json|```/g, "").trim());
        const extractionArray: ExtractionResult[] = Array.isArray(parsedRaw)
          ? parsedRaw.map(validateExtraction)
          : [validateExtraction(parsedRaw)];

        if (extractionArray.length === 0) {
          extractionStatus = "failed";
          throw new Error("no_events_extracted");
        }

        let anySuccess = false;
        let anyPartial = false;

        for (const extraction of extractionArray) {
          const fieldCount = countExtractedFields(extraction);

          const rowStatus: "success" | "partial" | "failed" =
            fieldCount === 0
              ? "failed"
              : extraction.event_date === null
              ? "partial"
              : "success";

          if (rowStatus === "success") anySuccess = true;
          else if (rowStatus === "partial") anyPartial = true;

          const distanceM =
            extraction.event_lat !== null &&
            extraction.event_lon !== null &&
            comp.location_lat !== null &&
            comp.location_lon !== null
              ? Math.round(
                  haversineDistance(
                    comp.location_lat,
                    comp.location_lon,
                    extraction.event_lat,
                    extraction.event_lon
                  )
                )
              : null;

          const isAutoConfirmed = rowStatus === "success" && fieldCount >= 4;
          const confirmationSource = isAutoConfirmed ? "auto_quality_gate" : null;

          const industryCodeSource = comp.competitor_industry_code
            ? "competitor_directory_inherited"
            : extraction.industry_code
            ? "claude_extracted"
            : null;
          const finalIndustryCode = comp.competitor_industry_code ?? extraction.industry_code;

          // Dedup: skip if same event already exists for this competitor
          if (extraction.event_name) {
            const [dupeRows] = await bq.query({
              query: `
                SELECT 1 FROM \`${projectId}.raw.competitor_events\`
                WHERE competitor_id = @competitor_id
                  AND event_name = @event_name
                  AND (event_date = @event_date OR (event_date IS NULL AND @event_date IS NULL))
                  AND extraction_status = 'success'
                LIMIT 1
              `,
              params: {
                competitor_id: comp.competitor_id,
                event_name: extraction.event_name,
                event_date: extraction.event_date ?? null,
              },
              types: {
                competitor_id: "STRING",
                event_name: "STRING",
                event_date: "STRING",
              },
              location: BQ_LOCATION,
            });
            if ((dupeRows as any[]).length > 0) continue;
          }

          await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_events\` (
              competitor_event_id, competitor_id, location_id, source_url,
              vetted_by_clerk_user_id, crawled_at, run_id, crawl_version,
              event_name, event_date, event_date_end, event_date_raw,
              event_type, description, venue_name, venue_address,
              event_city, event_lat, event_lon, distance_from_location_m,
              capacity, estimated_attendance, venue_exposure,
              primary_audience, secondary_audience, audience_description,
              industry_code, industry_code_source,
              extraction_status, fetch_http_status, extracted_field_count,
              extraction_model, html_byte_length, raw_extraction_json,
              is_user_confirmed, confirmation_source, user_confirmed_at,
              user_confirmed_by, created_at, signal_type
            ) VALUES (
              @competitor_event_id, @competitor_id, @location_id, @source_url,
              @vetted_by_clerk_user_id, @crawled_at, @run_id, @crawl_version,
              @event_name, @event_date, @event_date_end, @event_date_raw,
              @event_type, @description, @venue_name, @venue_address,
              @event_city, @event_lat, @event_lon, @distance_from_location_m,
              @capacity, @estimated_attendance, @venue_exposure,
              @primary_audience, @secondary_audience, @audience_description,
              @industry_code, @industry_code_source,
              @extraction_status, @fetch_http_status, @extracted_field_count,
              @extraction_model, @html_byte_length, @raw_extraction_json,
              @is_user_confirmed, @confirmation_source, @user_confirmed_at,
              NULL, @created_at, @signal_type
            )
          `,
          params: {
            competitor_event_id:     randomUUID(),
            competitor_id:           comp.competitor_id,
            location_id:             comp.location_id,
            source_url:              comp.source_url,
            vetted_by_clerk_user_id: comp.vetted_by ?? null,
            crawled_at:              crawledAt,
            run_id:                  runId,
            crawl_version:           crawlVersion,
            event_name:              extraction.event_name,
            event_date:              extraction.event_date,
            event_date_end:          extraction.event_date_end,
            event_date_raw:          extraction.event_date_raw,
            event_type:              extraction.event_type,
            description:             extraction.description,
            venue_name:              extraction.venue_name,
            venue_address:           extraction.venue_address,
            event_city:              extraction.event_city,
            event_lat:               extraction.event_lat,
            event_lon:               extraction.event_lon,
            distance_from_location_m: distanceM,
            capacity:                extraction.capacity,
            estimated_attendance:    extraction.estimated_attendance,
            venue_exposure:          extraction.venue_exposure,
            primary_audience:        extraction.primary_audience,
            secondary_audience:      extraction.secondary_audience,
            audience_description:    extraction.audience_description,
            industry_code:           finalIndustryCode ?? null,
            industry_code_source:    industryCodeSource,
            extraction_status:       rowStatus,
            fetch_http_status:       fetchStatus,
            extracted_field_count:   fieldCount,
            extraction_model:        EXTRACTION_MODEL,
            html_byte_length:        htmlByteLength,
            raw_extraction_json:     rawExtractionJson,
            is_user_confirmed:       isAutoConfirmed,
            confirmation_source:     confirmationSource,
            user_confirmed_at:       isAutoConfirmed ? crawledAt : null,
            created_at:              crawledAt,
            signal_type:             extraction.signal_type ?? null,
          },
          types: {
            competitor_event_id:      "STRING",
            competitor_id:            "STRING",
            location_id:              "STRING",
            source_url:               "STRING",
            vetted_by_clerk_user_id:  "STRING",
            crawled_at:               "STRING",
            run_id:                   "STRING",
            crawl_version:            "INT64",
            event_name:               "STRING",
            event_date:               "STRING",
            event_date_end:           "STRING",
            event_date_raw:           "STRING",
            event_type:               "STRING",
            description:              "STRING",
            venue_name:               "STRING",
            venue_address:            "STRING",
            event_city:               "STRING",
            event_lat:                "FLOAT64",
            event_lon:                "FLOAT64",
            distance_from_location_m: "INT64",
            capacity:                 "INT64",
            estimated_attendance:     "INT64",
            venue_exposure:           "STRING",
            primary_audience:         "STRING",
            secondary_audience:       "STRING",
            audience_description:     "STRING",
            industry_code:            "STRING",
            industry_code_source:     "STRING",
            extraction_status:        "STRING",
            fetch_http_status:        "INT64",
            extracted_field_count:    "INT64",
            extraction_model:         "STRING",
            html_byte_length:         "INT64",
            raw_extraction_json:      "STRING",
            is_user_confirmed:        "BOOL",
            confirmation_source:      "STRING",
            user_confirmed_at:        "STRING",
            created_at:               "STRING",
            signal_type:              "STRING",
          },
          location: BQ_LOCATION,
        });

        } // close for (const extraction of extractionArray)

        extractionStatus = anySuccess ? "success" : anyPartial ? "partial" : "failed";
        if (extractionStatus === "success") results.success++;
        else if (extractionStatus === "partial") results.partial++;
        else results.failed++;

      } catch (err: any) {
        if (extractionStatus !== "fetch_error") extractionStatus = "failed";
        results.failed++;
        results.errors.push(`${comp.competitor_id}: ${err?.message ?? String(err)}`);

        // Write failure row — every crawl attempt is auditable
        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_events\` (
              competitor_event_id, competitor_id, location_id, source_url,
              vetted_by_clerk_user_id, crawled_at, run_id, crawl_version,
              extraction_status, fetch_http_status, extracted_field_count,
              extraction_model, raw_extraction_json, is_user_confirmed, created_at
            ) VALUES (
              @competitor_event_id, @competitor_id, @location_id, @source_url,
              @vetted_by_clerk_user_id, @crawled_at, @run_id, @crawl_version,
              @extraction_status, @fetch_http_status, @extracted_field_count,
              @extraction_model, @raw_extraction_json, FALSE, @created_at
            )
          `,
          params: {
            competitor_event_id:     randomUUID(),
            competitor_id:           comp.competitor_id,
            location_id:             comp.location_id,
            source_url:              comp.source_url,
            vetted_by_clerk_user_id: comp.vetted_by ?? null,
            crawled_at:              crawledAt,
            run_id:                  runId,
            crawl_version:           crawlVersion,
            extraction_status:       extractionStatus,
            fetch_http_status:       fetchStatus,
            extracted_field_count:   0,
            extraction_model:        EXTRACTION_MODEL,
            raw_extraction_json:     rawExtractionJson,
            created_at:              crawledAt,
          },
          types: {
            competitor_event_id:     "STRING",
            competitor_id:           "STRING",
            location_id:             "STRING",
            source_url:              "STRING",
            vetted_by_clerk_user_id: "STRING",
            crawled_at:              "STRING",
            run_id:                  "STRING",
            crawl_version:           "INT64",
            extraction_status:       "STRING",
            fetch_http_status:       "INT64",
            extracted_field_count:   "INT64",
            extraction_model:        "STRING",
            raw_extraction_json:     "STRING",
            created_at:              "STRING",
          },
          location: BQ_LOCATION,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? String(err), ...results }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
