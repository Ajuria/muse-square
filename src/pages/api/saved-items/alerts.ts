import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireUserIdFromLocals(locals: any): string {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(401, "Unauthorized");
  return v.trim();
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, `Missing: ${name}`);
  return v.trim();
}

function normalizeYmd(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415, headers: { "content-type": "application/json" },
      });
    }

    requireUserIdFromLocals(locals);

    const body = await request.json().catch(() => null);

    // items: Array<{ saved_item_id: string, location_id: string, selected_date: string }>
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return new Response(JSON.stringify({ ok: true, alerts: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    // Validate + normalize
    const validItems = (items as any[])
      .map((it: any) => ({
        saved_item_id: String(it?.saved_item_id || "").trim(),
        location_id:   String(it?.location_id   || "").trim(),
        selected_date: normalizeYmd(it?.selected_date),
      }))
      .filter(it => it.saved_item_id && it.location_id && it.selected_date);

    if (!validItems.length) {
      return new Response(JSON.stringify({ ok: true, alerts: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }

    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bq = makeBQClient(projectId);

    // Build a single query using UNION ALL — one row per item
    // Returns max alert_level + dominant change_category per (saved_item_id, location_id, selected_date)
    const unionParts = validItems.map((it, i) => `
      SELECT
        '${it.saved_item_id}' AS saved_item_id,
        '${it.location_id}'   AS location_id,
        '${it.selected_date}' AS selected_date,
        MAX(alert_level)      AS max_alert_level,
        ARRAY_AGG(change_category ORDER BY alert_level DESC LIMIT 1)[OFFSET(0)] AS top_category,
        ARRAY_AGG(change_subtype  ORDER BY alert_level DESC LIMIT 1)[OFFSET(0)] AS top_subtype
      FROM \`${projectId}.semantic.vw_insight_event_change_feed\`
      WHERE location_id   = '${it.location_id}'
        AND affected_date = DATE('${it.selected_date}')
        AND alert_level   >= 2
        AND feed_date     >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
    `);

    const query = unionParts.map(p => `(${p})`).join("\nUNION ALL\n") +
      `\nGROUP BY saved_item_id, location_id, selected_date`;

    // Wrap in outer GROUP BY to collapse union duplicates
    const fullQuery = `
      SELECT
        saved_item_id,
        location_id,
        selected_date,
        MAX(max_alert_level) AS max_alert_level,
        ARRAY_AGG(top_category ORDER BY max_alert_level DESC LIMIT 1)[OFFSET(0)] AS top_category,
        ARRAY_AGG(top_subtype  ORDER BY max_alert_level DESC LIMIT 1)[OFFSET(0)] AS top_subtype
      FROM (
        ${unionParts.map(p => `(${p})`).join("\nUNION ALL\n")}
      )
      GROUP BY saved_item_id, location_id, selected_date
    `;

    const [rows] = await bq.query({ query: fullQuery, location: "EU" });

    const alerts = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      saved_item_id:   String(r.saved_item_id   ?? ""),
      location_id:     String(r.location_id     ?? ""),
      selected_date:   String(r.selected_date?.value ?? r.selected_date ?? ""),
      max_alert_level: Number(r.max_alert_level  ?? 0),
      top_category:    String(r.top_category  ?? ""),
      top_subtype:     String(r.top_subtype   ?? ""),
    }));

    return new Response(JSON.stringify({ ok: true, alerts }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status, headers: { "content-type": "application/json" },
    });
  }
};