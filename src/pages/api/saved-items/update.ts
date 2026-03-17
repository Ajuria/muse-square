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

function optionalString(v: unknown, name: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  return v.trim() || null;
}

function normalizeDateOptional(s: unknown, name: string): string | null {
  if (s == null || s === "") return null;
  if (typeof s !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date format for ${name}: ${v}`);
  return v;
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
    // ---- Content-Type guard ----
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- AUTH + CONTEXT ----
    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);

    // ---- Body ----
    const body = await request.json().catch(() => null);
    const saved_item_id = requireString(body?.saved_item_id, "saved_item_id");

    // All mutable fields are optional — only provided ones are updated
    const title = optionalString(body?.title, "title");
    const description = optionalString(body?.description, "description");
    const decision_date = normalizeDateOptional(body?.decision_date, "decision_date");
    const event_end_date = normalizeDateOptional(body?.event_end_date, "event_end_date");

    // dates: if provided, replaces the full set in saved_item_dates
    const rawDates = body?.dates;
    const dates: string[] | null = rawDates === undefined ? null : normalizeDatesArray(rawDates);
  const selected_date = body?.selected_date === null ? "NULL" : normalizeDateOptional(body?.selected_date, "selected_date");
  
    // dates must not be emptied to zero (breaks JOIN-based reads)
    if (dates !== null && dates.length === 0) {
      throw new HttpError(400, "dates must contain at least one date");
    }

    // At least one field must be provided
    if (title === null && description === null && decision_date === null && event_end_date === null && dates === null && selected_date === undefined) {
      throw new HttpError(400, "No fields to update");
    }

    // ---- BigQuery wiring ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);

    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- Tables ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    // ---- Ownership check ----
    const [checkRows] = await bigquery.query({
      query: `
        SELECT saved_item_id
        FROM ${savedItemsTable}
        WHERE saved_item_id = @saved_item_id
          AND clerk_user_id = @clerk_user_id
          AND location_id = @location_id
        LIMIT 1
      `,
      location: BQ_LOCATION,
      params: { saved_item_id, clerk_user_id, location_id },
      types: { saved_item_id: "STRING", clerk_user_id: "STRING", location_id: "STRING" },
    });

    if (!Array.isArray(checkRows) || checkRows.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // ---- Build UPDATE SET clauses ----
    const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
    const updateParams: Record<string, any> = {};
    const updateTypes: Record<string, any> = {};

    if (title !== null) {
      setClauses.push("title = @title");
      updateParams.title = title;
      updateTypes.title = "STRING";
    }
    if (description !== null) {
      setClauses.push("description = @description");
      updateParams.description = description;
      updateTypes.description = "STRING";
    }
    if (decision_date !== null) {
      setClauses.push("decision_date = PARSE_DATE('%F', @decision_date)");
      updateParams.decision_date = decision_date;
      updateTypes.decision_date = "STRING";
    }
    if (event_end_date !== null) {
      setClauses.push("event_end_date = PARSE_DATE('%F', @event_end_date)");
      updateParams.event_end_date = event_end_date;
      updateTypes.event_end_date = "STRING";
    }
    if (selected_date !== undefined) {
      if (selected_date === "NULL") {
        setClauses.push("selected_date = NULL");
      } else {
        setClauses.push("selected_date = PARSE_DATE('%F', @selected_date)");
        updateParams.selected_date = selected_date;
        updateTypes.selected_date = "STRING";
      }
    }
    if (dates !== null) {
      setClauses.push("number_of_dates = @number_of_dates");
      updateParams.number_of_dates = dates.length;
      updateTypes.number_of_dates = "INT64";
    }

    // ---- Transaction: UPDATE saved_items + replace dates if needed ----
    // BigQuery multi-statement scripts do not support named params —
    // inline the three identity values (already validated + ownership-checked above).
    const sid = saved_item_id.replace(/'/g, "");
    const uid = clerk_user_id.replace(/'/g, "");
    const lid = location_id.replace(/'/g, "");

    const deleteDatesClause = dates !== null
      ? `DELETE FROM ${savedItemDatesTable}
         WHERE saved_item_id = '${sid}'
           AND clerk_user_id = '${uid}'
           AND location_id = '${lid}';`
      : "";

    const insertDatesClause = dates !== null && dates.length > 0
  ? `INSERT INTO ${savedItemDatesTable} (saved_item_id, location_id, clerk_user_id, date, created_at)
     SELECT saved_item_id, location_id, clerk_user_id, date, created_at FROM UNNEST([
       ${dates.map((d) =>
         `STRUCT('${sid}' AS saved_item_id, '${lid}' AS location_id, '${uid}' AS clerk_user_id, DATE '${d}' AS date, CURRENT_TIMESTAMP() AS created_at)`
       ).join(",\n       ")}
     ]);`
  : "";
    
    // UPDATE still uses params safely (single statement, not a script)
    const updateQuery = `
      UPDATE ${savedItemsTable}
      SET ${setClauses.join(", ")}
      WHERE saved_item_id = '${sid}'
        AND clerk_user_id = '${uid}'
        AND location_id = '${lid}'
    `;

    const script = `
      BEGIN TRANSACTION;
      ${updateQuery};
      ${deleteDatesClause}
      ${insertDatesClause}
      COMMIT TRANSACTION;
    `;

    await bigquery.query({
      query: script,
      location: BQ_LOCATION,
      params: updateParams,
      types: updateTypes,
    });

    const responseHeaders: Record<string, string> = { "content-type": "application/json" };
    if (selected_date && selected_date !== "NULL") {
      responseHeaders["Set-Cookie"] = `ms_piloter=${encodeURIComponent(saved_item_id)}|${encodeURIComponent(selected_date)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    } else if (selected_date === "NULL") {
      responseHeaders["Set-Cookie"] = `ms_piloter=; Path=/; SameSite=Lax; Max-Age=0`;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved_item_id,
        updated: {
          ...(title !== null && { title }),
          ...(description !== null && { description }),
          ...(decision_date !== null && { decision_date }),
          ...(event_end_date !== null && { event_end_date }),
          ...(dates !== null && { dates, number_of_dates: dates.length }),
        },
      }),
      { status: 200, headers: responseHeaders }
    );

  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};