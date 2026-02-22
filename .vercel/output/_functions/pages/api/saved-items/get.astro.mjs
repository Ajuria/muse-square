import "dotenv/config";
import { BigQuery } from "@google-cloud/bigquery";
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
function normalizeDatesArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    if (typeof x === "string") return x;
    if (x && typeof x.value === "string") return x.value;
    return String(x ?? "");
  }).map((s) => s.trim()).filter(Boolean);
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
    const saved_item_id = requireString(body?.saved_item_id, "saved_item_id");
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
        saved_item_id
      },
      types: {
        clerk_user_id: "STRING",
        location_id: "STRING",
        saved_item_id: "STRING"
      }
    });
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) {
      return new Response(JSON.stringify({ ok: false, error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }
    const item = { ...row, dates: normalizeDatesArray(row?.dates) };
    return new Response(JSON.stringify({ ok: true, item }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
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
