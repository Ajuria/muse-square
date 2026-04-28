import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { randomUUID } from "crypto";
import { discoverAgendaUrl, isHomepagePath, isAgendaPath } from "../../../lib/competitive/url-discovery";
import { geocodeCompetitor } from "../../../lib/competitive/geocode";

export const prerender = false;

const VALID_INDUSTRY = new Set([
  "non_profit","wellness","cinema_theatre","commercial","institutional",
  "culture","family","live_event","hotel_lodging","food_nightlife",
  "science_innovation","pro_event","sport","transport_mobility",
  "outdoor_leisure","nightlife","unknown"
]);

const INDUSTRY_BUCKET: Record<string, string> = {
  non_profit:"institutional_activity", wellness:"leisure_activity",
  cinema_theatre:"culture_event", commercial:"commercial_activity",
  institutional:"institutional_activity", culture:"culture_event",
  family:"institutional_activity", live_event:"culture_event",
  hotel_lodging:"commercial_activity", food_nightlife:"commercial_activity",
  science_innovation:"institutional_activity", pro_event:"commercial_activity",
  sport:"leisure_activity", transport_mobility:"institutional_activity",
  outdoor_leisure:"leisure_activity", nightlife:"culture_event",
  unknown:"unknown",
};

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

    if (!competitor_name || !city) {
      console.warn("[add-competitor] 400 — received body:", JSON.stringify(body));
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields: competitor_name, city", received: { competitor_name: competitor_name || null, city: city || null } }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const industry_code       = VALID_INDUSTRY.has(body?.industry_code) ? body.industry_code : null;
    const industry_bucket     = industry_code ? (INDUSTRY_BUCKET[industry_code] ?? null) : null;
    const primary_audience    = String(body?.primary_audience    || "").trim() || null;
    const secondary_audience  = String(body?.secondary_audience  || "").trim() || null;
    const address             = String(body?.address             || "").trim() || null;
    const source_url          = String(body?.source_url          || "").trim() || null;
    const description         = String(body?.description         || "").trim() || null;
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
        WHERE LOWER(competitor_name) = LOWER(@competitor_name)
          AND (
            LOWER(city) = LOWER(@city)
            OR LOWER(@city) LIKE CONCAT(LOWER(city), '%')
            OR LOWER(city) LIKE CONCAT(LOWER(@city), '%')
          )
          AND deleted_at IS NULL
        LIMIT 1
      `,
      params: { competitor_name, city },
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
          competitor_id, competitor_name, city,
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
        const geo = await geocodeCompetitor(competitor_name, city, address);
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
      params: { clerk_user_id, competitor_name, city },
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
            source_url, confidence_score, created_at, deleted_at
          ) VALUES (
            @watched_competitor_id, @clerk_user_id, @location_id,
            @competitor_id, @competitor_name, @industry_code, @city,
            @source_url, @confidence_score, CURRENT_TIMESTAMP(), NULL
          )
        `,
        params: {
          watched_competitor_id, clerk_user_id, location_id,
          competitor_id, competitor_name,
          industry_code: industry_code ?? null,
          city,
          source_url: source_url ?? null,
          confidence_score,
        },
        types: {
          watched_competitor_id: "STRING", clerk_user_id: "STRING", location_id: "STRING",
          competitor_id: "STRING", competitor_name: "STRING",
          industry_code: "STRING", city: "STRING",
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