import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function requireString(v: unknown, name: string): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(400, `Missing or invalid field: ${name}`);
  }
  return v.trim();
}

function requireUserIdFromLocals(locals: any): string {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(401, "Unauthorized");
  return v.trim();
}

function requireLocationIdFromLocals(locals: any): string {
  const v = locals?.location_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, "Missing location context");
  return v.trim();
}

function normalizeDatesArray(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => {
      if (typeof x === "string") return x;
      if (x && typeof x.value === "string") return x.value;
      return String(x ?? "");
    })
    .map((s: string) => s.trim())
    .filter(Boolean);
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // ---- Content-Type guard (JSON) ----
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- AUTH + CONTEXT (truth) ----
    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);

    // ---- Body ----
    const body = await request.json().catch(() => null);
    const saved_item_id = requireString(body?.saved_item_id, "saved_item_id");

    // ---- BigQuery wiring ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);
    
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- Tables (fixed in raw) ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    // ---- Query ----
    const query = `
      SELECT
        i.saved_item_id,
        i.location_id,
        i.clerk_user_id,
        i.number_of_dates,
        i.title,
        i.description,
        i.stage,
        i.created_at,
        i.updated_at,
        ARRAY_AGG(CAST(d.date AS STRING) ORDER BY d.date ASC) AS dates
      FROM ${savedItemsTable} i
      JOIN ${savedItemDatesTable} d
        ON d.saved_item_id = i.saved_item_id
       AND d.location_id = i.location_id
       AND d.clerk_user_id = i.clerk_user_id
      WHERE i.clerk_user_id = @clerk_user_id
        AND i.location_id = @location_id
        AND i.saved_item_id = @saved_item_id
      GROUP BY
        i.saved_item_id,
        i.location_id,
        i.clerk_user_id,
        i.number_of_dates,
        i.title,
        i.description,
        i.stage,
        i.created_at,
        i.updated_at
      LIMIT 1
    `;

    const [rows] = await bigquery.query({
      query,
      location: BQ_LOCATION,
      params: {
        clerk_user_id,
        location_id,
        saved_item_id,
      },
      types: {
        clerk_user_id: "STRING",
        location_id: "STRING",
        saved_item_id: "STRING",
      },
    });

    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : null;
    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const item = { ...row, dates: normalizeDatesArray(row?.dates) };

    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};
