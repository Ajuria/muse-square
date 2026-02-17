import "dotenv/config";
import type { APIRoute } from "astro";
import { BigQuery } from "@google-cloud/bigquery";

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

type Stage = "option" | "exploration" | "prevalidation" | "retenue";

function normalizeStageOrNull(s: unknown): Stage | null {
  if (s == null) return null;
  const v = typeof s === "string" ? s.trim().toLowerCase() : "";
  if (!v) return null;
  if (v === "option") return "option";
  if (v === "exploration") return "exploration";
  if (v === "prevalidation" || v === "pré-validation" || v === "pre-validation") return "prevalidation";
  if (v === "retenue" || v === "retendue" || v === "date retenue") return "retenue";
  throw new HttpError(400, "Invalid stage");
}

function normalizeLimit(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function normalizeOffset(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
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
    const stage = normalizeStageOrNull(body?.stage);
    const limit = normalizeLimit(body?.limit);
    const offset = normalizeOffset(body?.offset);

    // ---- BigQuery wiring ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";

    // In DEV, allow running without explicit env-based auth if your machine has ADC.
    // Still safe because the BigQuery client will throw if it truly can't auth.
    if (!import.meta.env.DEV && !hasKeyfile && !useAdc) {
      throw new HttpError(
        500,
        "BigQuery auth misconfigured: set GOOGLE_APPLICATION_CREDENTIALS or set BQ_USE_ADC=true when running with ADC."
      );
    }

    const bigquery = new BigQuery(
      hasKeyfile ? { projectId, keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS } : { projectId }
    );

    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    // ---- Tables (fixed in raw) ----
    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    // ---- Query ----
    // Join dates and aggregate them into a DATE[] array.
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
        stage,  // can be null
        limit,
        offset,
      },
      // Explicit typing prevents BigQuery parameter edge cases (esp. @stage null).
      types: {
        clerk_user_id: "STRING",
        location_id: "STRING",
        stage: "STRING", // BigQuery accepts null param; type still STRING
        limit: "INT64",
        offset: "INT64",
      },
    });

    // Defensive normalization: ensure dates is always string[]
    const items = (Array.isArray(rows) ? rows : []).map((r: any) => {
        const raw = r?.dates;

        const dates: string[] = Array.isArray(raw)
            ? raw
                .map((x: any) => {
                    if (typeof x === "string") return x;
                    if (x && typeof x.value === "string") return x.value;
                    // last resort: stringify anything else (keeps system from breaking)
                    return String(x ?? "");
                })
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [];

        return { ...r, dates };
    });

    return new Response(
        JSON.stringify({
            ok: true,
            items,
            limit,
            offset,
        }),
        { status: 200, headers: { "content-type": "application/json" } }
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
