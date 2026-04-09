import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

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
    const event_name   = String(body?.event_name   || "").trim();
    const event_city   = String(body?.event_city   || "").trim();
    const date_start   = String(body?.date_start   || "").trim();

    if (!event_name || !event_city) {
      return new Response(JSON.stringify({ ok: false, error: "Missing fields" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // Check for existing event within ±3 days of date_start in same city
    const hasDate = date_start && /^\d{4}-\d{2}-\d{2}$/.test(date_start);

    const [rows] = await bq.query({
      query: `
        SELECT
          calendar_item_uid,
          event_name,
          event_start_date,
          event_end_date,
          city_name,
          region_insee,
          industry_code,
          source_system,
          description,
          keywords,
          theme
        FROM \`${projectId}.semantic.vw_insight_eventcalendar_event_lookup\`
        WHERE (
          LOWER(event_name) LIKE CONCAT('%', LOWER(@event_name_partial), '%')
        )
        AND (
          @has_city = FALSE
          OR city_name IS NULL
          OR LOWER(city_name) LIKE CONCAT('%', LOWER(@event_city), '%')
        )
        AND (
          @has_date = FALSE
          OR event_start_date IS NULL
          OR (
            event_start_date <= DATE_ADD(DATE(@date_start), INTERVAL 3 DAY)
            AND (
              event_end_date IS NULL
              OR event_end_date >= DATE_SUB(DATE(@date_start), INTERVAL 3 DAY)
            )
          )
          OR (
            -- Wider fallback: same year, name+city matched strongly enough
            EXTRACT(YEAR FROM event_start_date) = EXTRACT(YEAR FROM DATE(@date_start))
          )
        )
        GROUP BY calendar_item_uid, event_name, event_start_date, event_end_date, city_name, region_insee, industry_code, source_system, description, keywords, theme
        ORDER BY
          -- Exact name match first
          CASE WHEN LOWER(event_name) LIKE CONCAT('%', LOWER(@event_name_exact), '%') THEN 0 ELSE 1 END,
          event_start_date ASC
        LIMIT 10
      `,
      params: {
        event_name_partial: event_name.split(' ')[0] ?? event_name,
        event_name_exact: event_name,
        has_city: Boolean(event_city),
        event_city: event_city || "",
        has_date: hasDate,
        date_start: hasDate ? date_start : "2000-01-01",
      },
      types: {
        event_name_partial: "STRING",
        event_name_exact:   "STRING",
        has_city:           "BOOL",
        event_city:         "STRING",
        has_date:           "BOOL",
        date_start:         "STRING",
      },
      location: BQ_LOCATION,
    });

    // Deduplicate by event_name + event_start_date (view has one row per city/arrondissement)
    const seen = new Set<string>();
    const dedupedRows = (Array.isArray(rows) ? rows : []).filter((r: any) => {
      const key = `${r.event_name}__${r.event_start_date?.value ?? r.event_start_date ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const exists = dedupedRows.length > 0;

    // Distinguish: found with matching dates vs found but wrong dates
    // matchingDates: rows where requested date falls within event window (±3 days)
    // If none match strictly, treat all rows as "known editions" (found_wrong_dates path)
    const matchingDates = exists && hasDate
      ? dedupedRows.filter((r: any) => {
          const start = r.event_start_date?.value ?? r.event_start_date ?? null;
          const end   = r.event_end_date?.value   ?? r.event_end_date   ?? null;
          if (!start) return true;
          const qs = new Date(date_start);
          const es = new Date(start);
          const ee = end ? new Date(end) : es;
          return qs >= new Date(es.getTime() - 3 * 86400000)
              && qs <= new Date(ee.getTime() + 3 * 86400000);
        })
      : rows;

    const found_wrong_dates = exists && hasDate && matchingDates.length === 0;

    return new Response(JSON.stringify({
      ok: true,
      exists,
      found_wrong_dates,
      known_editions: found_wrong_dates ? dedupedRows.map((r: any) => ({
        event_name:       r.event_name,
        event_start_date: r.event_start_date?.value ?? r.event_start_date ?? null,
        event_end_date:   r.event_end_date?.value   ?? r.event_end_date   ?? null,
        city_name:        r.city_name ?? null,
      })) : [],
      matches: matchingDates.map((r: any) => ({
        event_id:         r.calendar_item_uid,
        event_name:       r.event_name,
        event_date_start: r.event_start_date?.value ?? r.event_start_date ?? null,
        event_date_end:   r.event_end_date?.value   ?? r.event_end_date   ?? null,
        event_city:       r.city_name ?? event_city,
        industry_code:    r.industry_code ?? null,
        description:      r.description ?? null,
        source_system:    r.source_system ?? null,
        confidence_score: r.source_system === 'mega_event' ? 0.95 : 0.75,
        community_confirmations: 0,
      })),
    }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[check-event]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};