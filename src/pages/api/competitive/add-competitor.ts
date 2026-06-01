import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";
import { discoverAgendaUrl, isHomepagePath, isAgendaPath } from "../../../lib/competitive/url-discovery";
import { geocodeCompetitor } from "../../../lib/competitive/geocode";
import { VALID_INDUSTRY, BUCKET_MAP } from "../../../lib/competitive/constants";

export const prerender = false;

async function extractCompetitorWithClaude(pageText: string, websiteUrl: string, competitorName: string): Promise<Record<string, any> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const systemPrompt = `You extract structured business information from a competitor's website text content.
Return ONLY valid JSON, no markdown, no explanation.

CRITICAL RULES:
- Only extract information EXPLICITLY present on the page. Never infer, invent, or assume.
- If a field's information is not found on the page, set it to null.
- This must work for any type of physical venue: museum, hotel, restaurant, retail store, concert hall, corporate event space, sports venue, coworking, theme park, etc.
- Adapt vocabulary to the business type.
- Write all values in French.

The JSON must have exactly these fields:
{
  "business_description": "2-3 sentence description of what this business does, its positioning, and what makes it unique",
  "current_offering": "all products, services, experiences, and packages actively available: exhibitions, shows, menu items, rooms, collections, rental spaces, seasonal packages, workshops, guided tours, subscriptions, memberships, gift cards, etc. null if none found",
  "offering_items": [
    {
      "category": "product/service TYPE in French (e.g. Dégustation, Visite guidée, Hébergement, Privatisation, Restauration, Boutique, Atelier, Abonnement)",
      "item": "specific name of the product/service as written on the page",
      "price": "price exactly as written (e.g. '8 €', 'Gratuit', 'à partir de 95 €') or null if not shown",
      "unit": "pricing unit if any (e.g. 'par personne', '/nuit', 'par bouteille') or null"
    }
  ],
  "services_and_amenities": "services, experiences, facilities offered: guided tours, spa, delivery, private hire, catering, parking, etc. null if none found",
  "target_audience": "who this business targets based on content tone and offerings. null if not discernible",
  "tone_of_voice": "brand voice in 2-3 adjectives. null if not enough content",
  "opening_hours_mentioned": "any opening hours or seasonal schedules found. null if none",
  "key_differentiators": "what sets this business apart from competitors. null if not discernible",
  "pricing_info": "pricing model, specific price points, entry fees, menu prices, room rates, package prices, subscription costs, free/paid status. Be as specific as possible with numbers. null if none found",
  "event_examples": "specific past or upcoming events, exhibitions, concerts, promotions mentioned by name. null if none found",
  "brand_positioning": "luxury, accessible, heritage, innovative, family, premium, popular, etc. null if not discernible",
  "partnerships_mentioned": "sponsors, institutional partners, labels, affiliations. null if none found",
  "geographic_scope": "local, regional, national, or international reach. null if not discernible",
  "age_range_mentioned": "target age groups explicitly mentioned. null if none found",
  "accessibility_info": "PMR accessibility, family-friendly facilities. null if none found"
}
}
RULES on offering_items:
- One object per distinct named or priced product/service found on the page.
- "category" groups items by type so two businesses can be compared by category.
- If a product is named but no price is shown, include it with price=null.
- If no products/services are found at all, return offering_items as [].
All scalar values must be strings or null. offering_items must always be an array (possibly empty).`;

  const userPrompt = `Extract business information from this competitor website (${websiteUrl}, business name: ${competitorName}):\n\n${pageText.substring(0, 8000)}`;

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
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    const location_id   = String((locals as any)?.location_id   || "").trim();
    if (!clerk_user_id || !location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const body = await request.json().catch(() => null);

    const competitor_name     = String(body?.competitor_name     || "").trim();
    const city                = String(body?.city                || "").trim();

    let resolvedCity = city;
    if (!resolvedCity) {
      try {
        const bqTmp = makeBQClient(String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim());
        const [locRows] = await bqTmp.query({
          query: `
            SELECT company_address
            FROM \`${String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim()}.raw.insight_event_user_location_profile\`
            WHERE location_id = @location_id
            QUALIFY ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY updated_at DESC) = 1
          `,
          params: { location_id },
          types: { location_id: "STRING" },
          location: (process.env.BQ_LOCATION || "EU").trim(),
        });
        if (Array.isArray(locRows) && locRows.length > 0 && locRows[0].company_address) {
          const addr = String(locRows[0].company_address).trim();
          const cityMatch = addr.match(/\d{5}\s+(.+)$/);
          if (cityMatch) {
            resolvedCity = cityMatch[1].trim();
          } else {
            resolvedCity = addr.split(",").pop()?.trim() || "";
          }
          if (resolvedCity) console.info(`[add-competitor] city resolved from address: ${resolvedCity}`);
        }
      } catch (e: any) {
        console.warn("[add-competitor] city fallback query failed:", e?.message);
      }
    }

    if (!competitor_name || !resolvedCity) {
      console.warn("[add-competitor] 400 — received body:", JSON.stringify(body));
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields: competitor_name, city", received: { competitor_name: competitor_name || null, city: resolvedCity || null } }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const industry_code       = VALID_INDUSTRY.has(body?.industry_code) ? body.industry_code : null;
    const industry_bucket     = industry_code ? (BUCKET_MAP[industry_code] ?? null) : null;
    const primary_audience    = String(body?.primary_audience    || "").trim() || null;
    const secondary_audience  = String(body?.secondary_audience  || "").trim() || null;
    const address             = String(body?.address             || "").trim() || null;
    const source_url          = String(body?.source_url          || "").trim() || null;
    const description         = String(body?.description         || "").trim() || null;

    const VALID_ENTITY_TYPE = new Set(["competitor", "institution", "media", "aggregator"]);
    const entity_type         = VALID_ENTITY_TYPE.has(body?.entity_type) ? body.entity_type : "competitor";

    const google_place_id     = String(body?.google_place_id     || "").trim() || null;
    const photos              = String(body?.photos              || "").trim() || null;
    const google_rating       = typeof body?.google_rating === "number" ? body.google_rating : null;
    const google_review_count = typeof body?.google_review_count === "number" ? Math.round(body.google_review_count) : null;
    const google_review_summary = String(body?.google_review_summary || "").trim() || null;
    const lat                 = typeof body?.lat === "number" ? body.lat : null;
    const lon                 = typeof body?.lon === "number" ? body.lon : null;
    const source_system       = String(body?.source_system || "user_confirmed").trim();

    const confidence_score = (() => {
      const base = typeof body?.confidence_score === "number" ? body.confidence_score : null;
      if (base !== null) return Math.min(base + 0.1, 1.0); // boost on confirmation
      if (industry_code && source_url) return 0.8;
      if (industry_code) return 0.7;
      if (source_url) return 0.5;
      return 0.3;
    })();

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ── 1. Check if competitor_directory already has this entry ──
    const [existingDir] = await bq.query({
      query: `
        SELECT competitor_id, confidence_score
        FROM \`${projectId}.raw.competitor_directory\`
        WHERE LOWER(REPLACE(REPLACE(competitor_name, '\u2019', "'"), '\u2018', "'"))
            = LOWER(REPLACE(REPLACE(@competitor_name, '\u2019', "'"), '\u2018', "'"))
          AND (
            LOWER(city) = LOWER(@city)
            OR LOWER(@city) LIKE CONCAT(LOWER(city), '%')
            OR LOWER(city) LIKE CONCAT(LOWER(@city), '%')
          )
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      `,
      params: { competitor_name, city: resolvedCity },
      types:  { competitor_name: "STRING", city: "STRING" },
      location: BQ_LOCATION,
    });

    let competitor_id: string;

    if (Array.isArray(existingDir) && existingDir.length > 0) {
      // Entry exists — update confidence and vetting status
      competitor_id = String(existingDir[0].competitor_id);
      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.competitor_directory\`
          SET
            confidence_score = @confidence_score,
            is_user_vetted   = TRUE,
            vetted_at        = CURRENT_TIMESTAMP(),
            vetted_by        = @clerk_user_id,
            updated_at       = CURRENT_TIMESTAMP()
          WHERE competitor_id = @competitor_id
            AND deleted_at IS NULL
        `,
        params: { confidence_score, clerk_user_id, competitor_id },
        types:  { confidence_score: "FLOAT64", clerk_user_id: "STRING", competitor_id: "STRING" },
        location: BQ_LOCATION,
      });
    } else {
      // New entry — insert into competitor_directory
      competitor_id = randomUUID();
      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.competitor_directory\` (
            competitor_id, competitor_name, address, city,
            entity_type,
            industry_code, industry_bucket,
            primary_audience, secondary_audience,
            lat, lon,
            source_system, google_place_id, google_photos,
            google_rating, google_rating_count,
            description, source_url,
            confidence_score, is_user_vetted, vetted_at, vetted_by,
            created_at, updated_at, deleted_at
          ) VALUES (
            @competitor_id, @competitor_name, @address, @city,
            @entity_type,
            @industry_code, @industry_bucket,
            @primary_audience, @secondary_audience,
            @lat, @lon,
            @source_system, @google_place_id, @google_photos,
            @google_rating, @google_rating_count,
            @description, @source_url,
            @confidence_score, TRUE, CURRENT_TIMESTAMP(), @clerk_user_id,
            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), NULL
          )
        `,
        params: {
          competitor_id, competitor_name, city: resolvedCity,
          entity_type,
          address:              address              ?? null,
          industry_code:        industry_code        ?? null,
          industry_bucket:      industry_bucket      ?? null,
          primary_audience:     primary_audience     ?? null,
          secondary_audience:   secondary_audience   ?? null,
          lat:                  lat                  ?? null,
          lon:                  lon                  ?? null,
          source_system,
          google_place_id:      google_place_id      ?? null,
          google_photos:        photos               ?? null,
          google_rating:        google_rating        ?? null,
          google_rating_count:  google_review_count  ?? null,
          description:          description          ?? null,
          source_url:           source_url           ?? null,
          confidence_score,
          clerk_user_id,
        },
        types: {
          competitor_id: "STRING", competitor_name: "STRING", city: "STRING",
          entity_type: "STRING",
          address: "STRING", industry_code: "STRING", industry_bucket: "STRING",
          primary_audience: "STRING", secondary_audience: "STRING",
          lat: "FLOAT64", lon: "FLOAT64",
          source_system: "STRING", google_place_id: "STRING", google_photos: "STRING",
          google_rating: "FLOAT64", google_rating_count: "INT64",
          description: "STRING", source_url: "STRING",
          confidence_score: "FLOAT64", clerk_user_id: "STRING",
        },
        location: BQ_LOCATION,
      });
    }

    // ── 1b. Geocode if lat/lon missing ──
    if (lat === null || lon === null) {
      try {
        const geo = await geocodeCompetitor(competitor_name, resolvedCity, address);
        if (geo) {
          await bq.query({
            query: `
              UPDATE \`${projectId}.raw.competitor_directory\`
              SET lat = @lat, lon = @lon, updated_at = CURRENT_TIMESTAMP()
              WHERE competitor_id = @competitor_id AND deleted_at IS NULL
            `,
            params: { lat: geo.lat, lon: geo.lon, competitor_id },
            types: { lat: "FLOAT64", lon: "FLOAT64", competitor_id: "STRING" },
            location: BQ_LOCATION,
          });
        }
      } catch (geoErr: any) {
        console.error("[add-competitor] geocode failed:", geoErr?.message);
      }
    }

    // ── 2. Upsert watched_competitors ──
    const [existingWatched] = await bq.query({
      query: `
        SELECT watched_competitor_id
        FROM \`${projectId}.raw.watched_competitors\`
        WHERE clerk_user_id = @clerk_user_id
          AND LOWER(competitor_name) = LOWER(@competitor_name)
          AND (
            LOWER(city) = LOWER(@city)
            OR LOWER(@city) LIKE CONCAT(LOWER(city), '%')
            OR LOWER(city) LIKE CONCAT(LOWER(@city), '%')
          )
          AND deleted_at IS NULL
        LIMIT 1
      `,
      params: { clerk_user_id, competitor_name, city: resolvedCity },
      types: { clerk_user_id: "STRING", competitor_name: "STRING", city: "STRING" },
      location: BQ_LOCATION,
    });

    if (Array.isArray(existingWatched) && existingWatched.length > 0) {
      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.watched_competitors\`
          SET competitor_id = @competitor_id
          WHERE watched_competitor_id = @watched_competitor_id
            AND deleted_at IS NULL
        `,
        params: { competitor_id, watched_competitor_id: String(existingWatched[0].watched_competitor_id) },
        types: { competitor_id: "STRING", watched_competitor_id: "STRING" },
        location: BQ_LOCATION,
      });
    } else {
      const watched_competitor_id = randomUUID();
      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.watched_competitors\` (
            watched_competitor_id, clerk_user_id, location_id,
            competitor_id, competitor_name, industry_code, city,
            entity_type,
            source_url, confidence_score, created_at, deleted_at
          ) VALUES (
            @watched_competitor_id, @clerk_user_id, @location_id,
            @competitor_id, @competitor_name, @industry_code, @city,
            @entity_type,
            @source_url, @confidence_score, CURRENT_TIMESTAMP(), NULL
          )
        `,
        params: {
          watched_competitor_id, clerk_user_id, location_id,
          competitor_id, competitor_name,
          industry_code: industry_code ?? null,
          entity_type,
          city: resolvedCity,
          source_url: source_url ?? null,
          confidence_score,
        },
        types: {
          watched_competitor_id: "STRING", clerk_user_id: "STRING", location_id: "STRING",
          competitor_id: "STRING", competitor_name: "STRING",
          industry_code: "STRING", entity_type: "STRING", city: "STRING",
          source_url: "STRING", confidence_score: "FLOAT64",
        },
        location: BQ_LOCATION,
      });
    }

    // ── 3. Inline crawl attempt (Browserless) ──
    let crawl_status: "accessible" | "blocked" | "no_url" = "no_url";
    let fetch_http_status: number | null = null;
    let extracted_field_count = 0;
    let extraction_status = "no_url";
    let discovered_url: string | null = null;
    let discovery_status: "found" | "not_found" | "skipped" = "skipped";

    if (source_url) {
      const browserless_token = process.env.BROWSERLESS_TOKEN ?? "";

      // Initial check
      try {
        const bqlQuery = `mutation CheckPage {
          goto(url: "${source_url.replace(/"/g, '\\"')}", waitUntil: domContentLoaded) { status }
          verify(type: cloudflare) { found solved }
          text { text }
        }`;

        const scrapeRes = await fetch(
          `https://production-sfo.browserless.io/stealth/bql?token=${browserless_token}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query: bqlQuery }),
            signal: AbortSignal.timeout(15000),
          }
        );
        fetch_http_status = scrapeRes.status;
        if (scrapeRes.ok) {
          const bqlResult = await scrapeRes.json();
          const text = bqlResult?.data?.text?.text || "";
          const hasContent = text.length > 100;
          extraction_status = hasContent ? "partial" : "empty";
          extracted_field_count = hasContent ? 1 : 0;
          crawl_status = hasContent ? "accessible" : "blocked";
          // Claude enrichment — extract structured business data
          if (hasContent) {
            try {
              const enriched = await extractCompetitorWithClaude(text, source_url, competitor_name);
              if (enriched) {
                const enrichedJson = JSON.stringify(enriched);

                const VALID_AUD = new Set([
                  "families","professionals","students","seniors","tourists",
                  "locals","art_lovers","sports_fans","general_public",
                ]);
                const enrichedAudiences = (String(enriched.target_audience ?? ""))
                  .split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
                const mappedAud1 = enrichedAudiences.find((a: string) => VALID_AUD.has(a)) || null;
                const mappedAud2 = enrichedAudiences.filter((a: string) => VALID_AUD.has(a) && a !== mappedAud1)[0] || null;

                const positioningToIndustry: Record<string, string> = {
                  "culture": "culture", "patrimoine": "culture", "musée": "culture",
                  "restaurant": "food_nightlife", "bar": "food_nightlife", "café": "food_nightlife",
                  "hôtel": "hotel_lodging", "hébergement": "hotel_lodging",
                  "commerce": "commercial", "boutique": "commercial", "retail": "commercial",
                  "viticole": "wine_tourism", "domaine": "wine_tourism", "vignoble": "wine_tourism",
                  "camping": "camping_outdoor", "plein air": "camping_outdoor",
                  "galerie": "gallery", "atelier": "gallery",
                  "marché": "market_hall", "halle": "market_hall",
                  "parc": "theme_park", "attraction": "theme_park",
                  "congrès": "convention_center", "exposition": "convention_center",
                  "coworking": "coworking",
                  "sport": "sport", "wellness": "wellness", "spa": "wellness",
                  "spectacle": "live_event", "concert": "live_event", "festival": "live_event",
                  "conférence": "pro_event",
                };
                let derivedIndustry: string | null = null;
                const descLower = (String(enriched.business_description ?? "") + " " + String(enriched.brand_positioning ?? "")).toLowerCase();
                for (const [keyword, code] of Object.entries(positioningToIndustry)) {
                  if (descLower.includes(keyword)) { derivedIndustry = code; break; }
                }

                await bq.query({
                  query: `
                    UPDATE \`${projectId}.raw.competitor_directory\`
                    SET auto_enriched_description = @auto_enriched_description,
                        primary_audience = IF(primary_audience IS NULL OR primary_audience = '', @primary_audience, primary_audience),
                        secondary_audience = IF(secondary_audience IS NULL OR secondary_audience = '', @secondary_audience, secondary_audience),
                        industry_code = IF(industry_code IS NULL OR industry_code = '', @industry_code, industry_code),
                        industry_bucket = IF(industry_bucket IS NULL OR industry_bucket = '', @industry_bucket, industry_bucket),
                        updated_at = CURRENT_TIMESTAMP()
                    WHERE competitor_id = @competitor_id
                      AND deleted_at IS NULL
                  `,
                  params: {
                    auto_enriched_description: enrichedJson,
                    competitor_id,
                    primary_audience: mappedAud1,
                    secondary_audience: mappedAud2,
                    industry_code: derivedIndustry,
                    industry_bucket: derivedIndustry ? (BUCKET_MAP[derivedIndustry] ?? null) : null,
                  },
                  types: {
                    auto_enriched_description: "STRING",
                    competitor_id: "STRING",
                    primary_audience: "STRING",
                    secondary_audience: "STRING",
                    industry_code: "STRING",
                    industry_bucket: "STRING",
                  },
                  location: BQ_LOCATION,
                });
                extraction_status = "enriched";
                extracted_field_count = Object.values(enriched).filter(v => v != null).length;
              }
            } catch (enrichErr: any) {
              console.error("[add-competitor] Claude enrichment failed (non-fatal):", enrichErr?.message);
            }
          }
        } else {
          extraction_status = "fetch_error";
          crawl_status = "blocked";
        }
      } catch (crawlErr: any) {
        console.error("[add-competitor] crawl failed:", crawlErr?.message);
        extraction_status = "timeout";
        crawl_status = "blocked";
      }

      // URL discovery — find agenda/programme URL if source is a homepage
      if (isHomepagePath(source_url) && !isAgendaPath(source_url)) {
        const discovery = await discoverAgendaUrl(
          source_url,
          browserless_token,
          10_000
        );
        discovered_url = discovery.discovered_url;
        discovery_status = discovery.discovery_status === "found" ? "found" : "not_found";

        if (discovered_url) {
          await bq.query({
            query: `
              UPDATE \`${projectId}.raw.watched_competitors\`
              SET source_url = @discovered_url
              WHERE competitor_id = @competitor_id
                AND clerk_user_id = @clerk_user_id
                AND deleted_at IS NULL
            `,
            params: { discovered_url, competitor_id, clerk_user_id },
            types: { discovered_url: "STRING", competitor_id: "STRING", clerk_user_id: "STRING" },
            location: BQ_LOCATION,
          });
          await bq.query({
            query: `
              UPDATE \`${projectId}.raw.competitor_directory\`
              SET
                source_url = @discovered_url,
                updated_at = CURRENT_TIMESTAMP()
              WHERE competitor_id = @competitor_id
                AND deleted_at IS NULL
            `,
            params: { discovered_url, competitor_id },
            types: { discovered_url: "STRING", competitor_id: "STRING" },
            location: BQ_LOCATION,
          });
          crawl_status = "accessible";
          extraction_status = "partial";
          extracted_field_count = 1;
          fetch_http_status = 200;
        }
      }

      // Write crawl result to raw.competitor_events
      const competitor_event_id = randomUUID();
      const run_id = randomUUID();
      const final_url = discovered_url ?? source_url;
      const extraction_model = discovered_url ? "url_discovery_v1" : "inline_check_v1";

      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.competitor_events\` (
            competitor_event_id, competitor_id, location_id, source_url,
            vetted_by_clerk_user_id, crawled_at, run_id, crawl_version,
            extraction_status, fetch_http_status, extracted_field_count,
            extraction_model, is_user_confirmed, created_at
          ) VALUES (
            @competitor_event_id, @competitor_id, @location_id, @final_url,
            @clerk_user_id, CURRENT_TIMESTAMP(), @run_id, 1,
            @extraction_status, @fetch_http_status, @extracted_field_count,
            @extraction_model, FALSE, CURRENT_TIMESTAMP()
          )
        `,
        params: {
          competitor_event_id,
          competitor_id,
          location_id,
          final_url,
          clerk_user_id,
          run_id,
          extraction_status,
          fetch_http_status: fetch_http_status ?? null,
          extracted_field_count,
          extraction_model,
        },
        types: {
          competitor_event_id: "STRING", competitor_id: "STRING",
          location_id: "STRING", final_url: "STRING",
          clerk_user_id: "STRING", run_id: "STRING",
          extraction_status: "STRING",
          fetch_http_status: "INT64",
          extracted_field_count: "INT64",
          extraction_model: "STRING",
        },
        location: BQ_LOCATION,
      });
    }

    // ── 4. Check if tracking record already exists ──
    const [existingTracking] = await bq.query({
      query: `
        SELECT tracking_id
        FROM \`${projectId}.raw.competitor_tracking\`
        WHERE competitor_id  = @competitor_id
          AND clerk_user_id  = @clerk_user_id
          AND location_id    = @location_id
          AND deleted_at IS NULL
        LIMIT 1
      `,
      params: { competitor_id, clerk_user_id, location_id },
      types:  { competitor_id: "STRING", clerk_user_id: "STRING", location_id: "STRING" },
      location: BQ_LOCATION,
    });

    let action: string;

    if (Array.isArray(existingTracking) && existingTracking.length > 0) {
      action = "already_tracked";
    } else {
      const tracking_id = randomUUID();
      await bq.query({
        query: `
          INSERT INTO \`${projectId}.raw.competitor_tracking\` (
            tracking_id, competitor_id, clerk_user_id, location_id,
            created_at, deleted_at
          ) VALUES (
            @tracking_id, @competitor_id, @clerk_user_id, @location_id,
            CURRENT_TIMESTAMP(), NULL
          )
        `,
        params: { tracking_id, competitor_id, clerk_user_id, location_id },
        types:  {
          tracking_id: "STRING", competitor_id: "STRING",
          clerk_user_id: "STRING", location_id: "STRING",
        },
        location: BQ_LOCATION,
      });
      action = "created";
    }

    return new Response(JSON.stringify({
      ok: true,
      action,
      competitor_id,
      confidence_score,
      crawl_status,
      extraction_status,
      discovered_url,
      discovery_status,
    }), { status: 200, headers: { "content-type": "application/json" } });

  } catch (err: any) {
    console.error("[add-competitor]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};