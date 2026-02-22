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
function normalizeStageOrNull(s) {
  if (s == null) return null;
  const v = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (!v) return null;
  if (v === "option") return "option";
  if (v === "exploration") return "exploration";
  if (v === "prevalidation" || v === "pré-validation" || v === "pre-validation") return "prevalidation";
  if (v === "retenue" || v === "retendue" || v === "date retenue") return "retenue";
  throw new HttpError(400, "Invalid stage");
}
function normalizeLimit(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, Math.floor(n)));
}
function normalizeOffset(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
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
    const stage = normalizeStageOrNull(body?.stage);
    const limit = normalizeLimit(body?.limit);
    const offset = normalizeOffset(body?.offset);
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
        AND (@stage IS NULL OR i.stage = @stage)
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
      ORDER BY i.created_at DESC
      LIMIT @limit OFFSET @offset
    `;
    const [rows] = await bigquery.query({
      query,
      location: BQ_LOCATION,
      params: {
        clerk_user_id,
        location_id,
        stage,
        // can be null
        limit,
        offset
      },
      // Explicit typing prevents BigQuery parameter edge cases (esp. @stage null).
      types: {
        clerk_user_id: "STRING",
        location_id: "STRING",
        stage: "STRING",
        // BigQuery accepts null param; type still STRING
        limit: "INT64",
        offset: "INT64"
      }
    });
    const items = (Array.isArray(rows) ? rows : []).map((r) => {
      const raw = r?.dates;
      const dates = Array.isArray(raw) ? raw.map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x.value === "string") return x.value;
        return String(x ?? "");
      }).map((s) => s.trim()).filter(Boolean) : [];
      return { ...r, dates };
    });
    return new Response(
      JSON.stringify({
        ok: true,
        items,
        limit,
        offset
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
