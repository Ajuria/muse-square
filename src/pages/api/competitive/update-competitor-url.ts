// src/pages/api/competitive/update-competitor-url.ts
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    if (!clerk_user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body                    = await request.json().catch(() => null);
    const watched_competitor_id   = String(body?.watched_competitor_id || "").trim();
    const source_url              = String(body?.source_url || "").trim();

    if (!watched_competitor_id || !source_url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing watched_competitor_id or source_url" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    // Basic URL validation
    try { new URL(source_url); } catch {
      return new Response(JSON.stringify({ ok: false, error: "URL invalide" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Fetch current row to compute confidence
    const [rows] = await bq.query({
      query: `
        SELECT
          wc.watched_competitor_id,
          wc.competitor_id,
          wc.industry_code,
          wc.confidence_score
        FROM \`${projectId}.raw.watched_competitors\` wc
        WHERE wc.watched_competitor_id = @watched_competitor_id
          AND wc.clerk_user_id = @clerk_user_id
          AND wc.deleted_at IS NULL
        LIMIT 1
      `,
      params: { watched_competitor_id, clerk_user_id },
      types: { watched_competitor_id: "STRING", clerk_user_id: "STRING" },
      location: BQ_LOCATION,
    });

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: "Concurrent introuvable" }), {
        status: 404, headers: { "content-type": "application/json" },
      });
    }

    const industry_code    = row.industry_code ?? null;
    const competitor_id    = row.competitor_id ?? null;

    // Confidence scoring — same logic as add-competitor.ts + URL boost
    const base = industry_code ? 0.8 : 0.5;
    const new_confidence = Math.min(base + 0.1, 1.0);

    // ── 1. Update watched_competitors ──
    await bq.query({
      query: `
        UPDATE \`${projectId}.raw.watched_competitors\`
        SET
          source_url       = @source_url,
          confidence_score = @confidence_score
        WHERE watched_competitor_id = @watched_competitor_id
          AND clerk_user_id = @clerk_user_id
          AND deleted_at IS NULL
      `,
      params: {
        source_url,
        confidence_score: new_confidence,
        watched_competitor_id,
        clerk_user_id,
      },
      types: {
        source_url: "STRING", confidence_score: "FLOAT64",
        watched_competitor_id: "STRING", clerk_user_id: "STRING",
      },
      location: BQ_LOCATION,
    });

    // ── 2. Update competitor_directory if FK exists ──
    if (competitor_id) {
      await bq.query({
        query: `
          UPDATE \`${projectId}.raw.competitor_directory\`
          SET
            source_url       = @source_url,
            confidence_score = @confidence_score,
            is_user_vetted   = TRUE,
            vetted_at        = CURRENT_TIMESTAMP(),
            vetted_by        = @clerk_user_id,
            updated_at       = CURRENT_TIMESTAMP()
          WHERE competitor_id = @competitor_id
            AND deleted_at IS NULL
        `,
        params: {
          source_url,
          confidence_score: new_confidence,
          clerk_user_id,
          competitor_id,
        },
        types: {
          source_url: "STRING", confidence_score: "FLOAT64",
          clerk_user_id: "STRING", competitor_id: "STRING",
        },
        location: BQ_LOCATION,
      });
    }

    // ── 3. Inline crawl check ──
    let crawl_status: "accessible" | "blocked" | "no_url" = "no_url";
    let fetch_http_status: number | null = null;
    let extraction_status = "no_url";

    try {
      const { randomUUID } = await import("crypto");
      const browserless_token = process.env.BROWSERLESS_TOKEN ?? "";
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
        crawl_status = hasContent ? "accessible" : "blocked";
      } else {
        extraction_status = "fetch_error";
        crawl_status = "blocked";
      }

      if (competitor_id) {
        const competitor_event_id = randomUUID();
        const run_id = randomUUID();
        await bq.query({
          query: `
            INSERT INTO \`${projectId}.raw.competitor_events\` (
              competitor_event_id, competitor_id, location_id, source_url,
              vetted_by_clerk_user_id, crawled_at, run_id, crawl_version,
              extraction_status, fetch_http_status, extracted_field_count,
              extraction_model, is_user_confirmed, created_at
            ) VALUES (
              @competitor_event_id, @competitor_id, @location_id, @source_url,
              @clerk_user_id, CURRENT_TIMESTAMP(), @run_id, 1,
              @extraction_status, @fetch_http_status, 0,
              'inline_check_v1', FALSE, CURRENT_TIMESTAMP()
            )
          `,
          params: {
            competitor_event_id,
            competitor_id,
            location_id: String((locals as any)?.location_id || "").trim(),
            source_url,
            clerk_user_id,
            run_id,
            extraction_status,
            fetch_http_status: fetch_http_status ?? null,
          },
          types: {
            competitor_event_id: "STRING", competitor_id: "STRING",
            location_id: "STRING", source_url: "STRING",
            clerk_user_id: "STRING", run_id: "STRING",
            extraction_status: "STRING", fetch_http_status: "INT64",
          },
          location: BQ_LOCATION,
        });
      }
    } catch {
      // crawl check failed silently — do not block the response
    }

    return new Response(JSON.stringify({
      ok: true,
      confidence_score: new_confidence,
      is_user_vetted: true,
      crawl_status,
      extraction_status,
    }), { status: 200, headers: { "content-type": "application/json" } });

  } catch (err: any) {
    console.error("[update-competitor-url]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};