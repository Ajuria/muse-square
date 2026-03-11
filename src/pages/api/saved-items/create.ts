import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";
import crypto from "node:crypto";
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

function normalizeDateOptional(s: unknown, name: string): string | null {
  if (s == null || s === "") return null;
  if (typeof s !== "string") throw new HttpError(400, `Invalid field: ${name}`);
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date format for ${name}: ${v}`);
  return v;
}

function normalizeDateYMD(s: string): string {
  // Strict YYYY-MM-DD; BigQuery DATE accepts this format safely.
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date: ${v}`);
  return v;
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function uuid(): string {
  // Node 18+ has crypto.randomUUID()
  return crypto.randomUUID();
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
    const title = requireString(body?.title, "title");
    const description =
      typeof body?.description === "string" && body.description.trim().length
        ? body.description.trim().slice(0, 240)
        : null;
    
    const decision_date = normalizeDateOptional(body?.decision_date, "decision_date");
    const event_date = normalizeDateOptional(body?.event_date, "event_date");

    const rawDates = Array.isArray(body?.dates) ? body.dates : null;
    if (!rawDates || rawDates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
    if (rawDates.length > 7) throw new HttpError(400, "Too many dates (max 7)");

    const dates = dedupe(
      rawDates
        .map((d: any) => (typeof d === "string" ? normalizeDateYMD(d) : ""))
        .filter((d: string) => d.length > 0)
    );

    if (dates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
    if (dates.length > 7) throw new HttpError(400, "Too many dates (max 7)");

    const number_of_dates = dates.length;

    // No stage rules needed

    // ---- BigQuery wiring (reuse your pattern) ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);

    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- IMPORTANT: fixed tables in raw ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    const saved_item_id = uuid();

    const script = `
    BEGIN TRANSACTION;

    INSERT INTO ${savedItemsTable} (
        saved_item_id,
        location_id,
        clerk_user_id,
        number_of_dates,
        title,
        description,
        stage,
        decision_date,
        event_date,
        created_at,
        updated_at
    )
    VALUES (
        @saved_item_id,
        @location_id,
        @clerk_user_id,
        @number_of_dates,
        @title,
        @description,
        'option',
        IF(@decision_date = '', NULL, PARSE_DATE('%F', @decision_date)),
        IF(@event_date = '', NULL, PARSE_DATE('%F', @event_date)),
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
    );

    INSERT INTO ${savedItemDatesTable} (
        saved_item_id,
        location_id,
        clerk_user_id,
        date,
        created_at
    )
    SELECT
        @saved_item_id,
        @location_id,
        @clerk_user_id,
        PARSE_DATE('%F', d),
        CURRENT_TIMESTAMP()
    FROM UNNEST(@dates) AS d;

    COMMIT TRANSACTION;
    `;

    await bigquery.query({
        query: script,
        location: BQ_LOCATION,
        params: {
            saved_item_id,
            location_id,
            clerk_user_id,
            number_of_dates,
            title,
            description,
            decision_date: decision_date ?? "",
            event_date: event_date ?? "",
            dates,
        },
        types: {
            saved_item_id: "STRING",
            location_id: "STRING",
            clerk_user_id: "STRING",
            number_of_dates: "INT64",
            title: "STRING",
            description: "STRING",
            decision_date: "STRING",
            event_date: "STRING",
            dates: ["STRING"],
        },
    });await bigquery.query({
        query: script,
        location: BQ_LOCATION,
        params: {
            saved_item_id,
            location_id,
            clerk_user_id,
            number_of_dates,
            title,
            description,
            decision_date: decision_date ?? "",
            event_date: event_date ?? "",
            dates,
        },
        types: {
            saved_item_id: "STRING",
            location_id: "STRING",
            clerk_user_id: "STRING",
            number_of_dates: "INT64",
            title: "STRING",
            description: "STRING",
            decision_date: "STRING",
            event_date: "STRING",
            dates: ["STRING"],
        },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        saved_item_id,
        location_id,
        number_of_dates,
        decision_date,
        event_date,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 400;
    const message =
      status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};
