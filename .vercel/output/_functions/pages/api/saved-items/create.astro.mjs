import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
import crypto from "node:crypto";
import { renderers } from "../../../renderers.mjs";
const prerender = false;
class HttpError extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function requireString(v, name) {
  if (typeof v !== "string" || v.trim() === "") {
    throw new HttpError(400, `Missing or invalid field: ${name}`);
  }
  return v.trim();
}
function requireUserIdFromLocals(locals) {
  const v = locals?.clerk_user_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(401, "Unauthorized");
  return v.trim();
}
function requireLocationIdFromLocals(locals) {
  const v = locals?.location_id;
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, "Missing location context");
  return v.trim();
}
function normalizeStage(s) {
  const v = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (v === "option") return "option";
  if (v === "exploration") return "exploration";
  if (v === "prevalidation" || v === "pré-validation" || v === "pre-validation") return "prevalidation";
  if (v === "retenue" || v === "retendue" || v === "date retenue") return "retenue";
  throw new HttpError(400, "Invalid stage");
}
function normalizeDateYMD(s) {
  const v = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, `Invalid date: ${v}`);
  return v;
}
function dedupe(arr) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}
function uuid() {
  return crypto.randomUUID();
}
const POST = async ({ request, locals }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" }
      });
    }
    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);
    const body = await request.json().catch(() => null);
    const title = requireString(body?.title, "title");
    const description = typeof body?.description === "string" && body.description.trim().length ? body.description.trim().slice(0, 240) : null;
    const stage = body?.stage == null || body.stage === "" ? "option" : normalizeStage(body.stage);
    const rawDates = Array.isArray(body?.dates) ? body.dates : null;
    if (!rawDates || rawDates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
    if (rawDates.length > 7) throw new HttpError(400, "Too many dates (max 7)");
    const dates = dedupe(
      rawDates.map((d) => typeof d === "string" ? normalizeDateYMD(d) : "").filter((d) => d.length > 0)
    );
    if (dates.length < 1) throw new HttpError(400, "Missing or invalid field: dates");
    if (dates.length > 7) throw new HttpError(400, "Too many dates (max 7)");
    const number_of_dates = dates.length;
    if (number_of_dates >= 2 && stage === "retenue") {
      throw new HttpError(400, "Stage 'retenue' is only allowed when exactly 1 date is saved.");
    }
    const allowedStagesForList = ["option", "exploration", "prevalidation"];
    const allowedStagesForSingle = ["option", "exploration", "prevalidation", "retenue"];
    if (number_of_dates >= 2 && !allowedStagesForList.includes(stage)) {
      throw new HttpError(400, "Invalid stage for a multi-date list.");
    }
    if (number_of_dates === 1 && !allowedStagesForSingle.includes(stage)) {
      throw new HttpError(400, "Invalid stage for a single date.");
    }
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";
    if (!hasKeyfile && !useAdc) {
      throw new HttpError(
        500,
        "BigQuery auth misconfigured: set GOOGLE_APPLICATION_CREDENTIALS or set BQ_USE_ADC=true when running with ADC."
      );
    }
    const bigquery = new BigQuery(
      hasKeyfile ? { projectId, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS } : { projectId }
    );
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();
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
        @stage,
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
        stage,
        dates
        // array of YYYY-MM-DD strings
      },
      types: {
        saved_item_id: "STRING",
        location_id: "STRING",
        clerk_user_id: "STRING",
        number_of_dates: "INT64",
        title: "STRING",
        description: "STRING",
        stage: "STRING",
        dates: ["STRING"]
        // ARRAY<STRING>
      }
    });
    return new Response(
      JSON.stringify({
        ok: true,
        saved_item_id,
        location_id,
        number_of_dates,
        stage
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    const message = status >= 500 && true ? "Server error" : err?.message ?? "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" }
    });
  }
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  POST,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
