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
  if (typeof v !== "string" || v.trim() === "") throw new HttpError(400, `Missing or invalid field: ${name}`);
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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    const clerk_user_id = requireUserIdFromLocals(locals);
    const location_id = requireLocationIdFromLocals(locals);

    const body = await request.json().catch(() => null);
    const saved_item_id = requireString(body?.saved_item_id, "saved_item_id");

    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const hasKeyfile = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const useAdc = (process.env.BQ_USE_ADC || "").trim().toLowerCase() === "true";

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

    const savedItemsTable = `\`${projectId}.raw.saved_items\``;
    const savedItemDatesTable = `\`${projectId}.raw.saved_item_dates\``;

    const script = `
      BEGIN TRANSACTION;

      DELETE FROM ${savedItemDatesTable}
      WHERE saved_item_id = @saved_item_id
        AND clerk_user_id = @clerk_user_id
        AND location_id = @location_id;

      DELETE FROM ${savedItemsTable}
      WHERE saved_item_id = @saved_item_id
        AND clerk_user_id = @clerk_user_id
        AND location_id = @location_id;

      COMMIT TRANSACTION;
    `;

    await bigquery.query({
      query: script,
      location: BQ_LOCATION,
      params: { saved_item_id, clerk_user_id, location_id },
      types: {
        saved_item_id: "STRING",
        clerk_user_id: "STRING",
        location_id: "STRING",
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
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
