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

export const GET: APIRoute = async ({ locals }) => {
  try {
    const clerk_user_id = requireUserIdFromLocals(locals);

    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const table = `\`${projectId}.raw.notification_preferences\``;

    const [rows] = await bigquery.query({
      query: `
        SELECT
          alerts_critical,
          digest_weekly,
          digest_weekly_day,
          daily_j7,
          daily_j7_hour
        FROM ${table}
        WHERE clerk_user_id = @clerk_user_id
        LIMIT 1
      `,
      location: BQ_LOCATION,
      params: { clerk_user_id },
      types: { clerk_user_id: "STRING" },
    });

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    const prefs = {
      alerts_critical:   row?.alerts_critical   ?? true,
      digest_weekly:     row?.digest_weekly      ?? false,
      digest_weekly_day: row?.digest_weekly_day  ?? 1,
      daily_j7:          row?.daily_j7           ?? false,
      daily_j7_hour:     row?.daily_j7_hour      ?? 7,
    };

    return new Response(JSON.stringify({ ok: true, prefs }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    const message =
      status >= 500 && !import.meta.env.DEV ? "Server error" : (err?.message ?? "Unknown error");

    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
};