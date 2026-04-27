import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    if (!clerk_user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const competitor_id = url.searchParams.get("competitor_id")?.trim() || "";
    if (!competitor_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing competitor_id" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const [rows] = await bq.query({
      query: `
        SELECT
          e.run_id,
          FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%SZ', MIN(e.crawled_at)) AS crawled_at,
          latest.extraction_status                                    AS extraction_status,
          COUNTIF(e.event_name IS NOT NULL)                          AS event_count,
          MAX(e.extracted_field_count)                               AS max_field_count,
          MAX(e.fetch_http_status)                                   AS fetch_http_status
        FROM \`${projectId}.raw.competitor_events\` e
        JOIN (
          SELECT run_id, extraction_status
          FROM \`${projectId}.raw.competitor_events\`
          WHERE competitor_id = @competitor_id
          QUALIFY ROW_NUMBER() OVER (
            PARTITION BY run_id
            ORDER BY crawled_at DESC
          ) = 1
        ) latest ON e.run_id = latest.run_id
        WHERE e.competitor_id = @competitor_id
        GROUP BY e.run_id, latest.extraction_status
        ORDER BY MIN(e.crawled_at) DESC
        LIMIT 30
      `,
      params: { competitor_id },
      types: { competitor_id: "STRING" },
      location: BQ_LOCATION,
    });

    const history = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      run_id:           r.run_id,
      crawled_at:       r.crawled_at ?? null,
      extraction_status: r.extraction_status ?? null,
      event_count:      Number(r.event_count ?? 0),
      max_field_count:  Number(r.max_field_count ?? 0),
      fetch_http_status: r.fetch_http_status ?? null,
    }));

    return new Response(JSON.stringify({ ok: true, history }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[competitor-crawl-history]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};