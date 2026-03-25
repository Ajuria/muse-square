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

    // ---- Auth ----
    const clerk_user_id = requireUserIdFromLocals(locals);

    // ---- Body ----
    const body = await request.json().catch(() => null);
    if (!body) throw new HttpError(400, "Invalid JSON body");

    const alerts_critical  = body.alerts_critical  === true;
    const digest_weekly    = body.digest_weekly    === true;
    const digest_weekly_day =
      typeof body.digest_weekly_day === "number" && [1, 3, 5].includes(body.digest_weekly_day)
        ? body.digest_weekly_day
        : 1;
    const digest_weekly_hour =
    typeof body.digest_weekly_hour === "number" && [7, 8, 9].includes(body.digest_weekly_hour)
    ? body.digest_weekly_hour
    : 7;
    const daily_j7         = body.daily_j7         === true;
    const daily_j7_hour    =
      typeof body.daily_j7_hour === "number" && [7, 8, 9].includes(body.daily_j7_hour)
        ? body.daily_j7_hour
        : 7;

    const additional_emails: string[] =
      Array.isArray(body.additional_emails)
        ? body.additional_emails.filter((e: any) => typeof e === "string" && e.trim()).map((e: string) => e.trim())
        : [];

    // ---- BigQuery ----
    const projectId = requireString(process.env.BQ_PROJECT_ID, "BQ_PROJECT_ID");
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    const table = `\`${projectId}.raw.notification_preferences\``;

    const query = `
      MERGE ${table} T
      USING (SELECT @clerk_user_id AS clerk_user_id) S
      ON T.clerk_user_id = S.clerk_user_id
      WHEN MATCHED THEN UPDATE SET
        alerts_critical   = @alerts_critical,
        digest_weekly     = @digest_weekly,
        digest_weekly_day = @digest_weekly_day,
        digest_weekly_hour = @digest_weekly_hour,
        daily_j7          = @daily_j7,
        daily_j7_hour     = @daily_j7_hour,
        additional_emails = @additional_emails,
        updated_at        = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (
        clerk_user_id,
        alerts_critical,
        digest_weekly,
        digest_weekly_day,
        digest_weekly_hour,
        daily_j7,
        daily_j7_hour,
        additional_emails,
        created_at,
        updated_at
      ) VALUES (
        @clerk_user_id,
        @alerts_critical,
        @digest_weekly,
        @digest_weekly_day,
        @digest_weekly_hour,
        @daily_j7,
        @daily_j7_hour,
        @additional_emails,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      )
    `;

    await bigquery.query({
      query,
      location: BQ_LOCATION,
      params: {
        clerk_user_id,
        alerts_critical,
        digest_weekly,
        digest_weekly_day,
        digest_weekly_hour,
        daily_j7,
        daily_j7_hour,
        additional_emails,
      },
      types: {
        clerk_user_id:    "STRING",
        alerts_critical:  "BOOL",
        digest_weekly:    "BOOL",
        digest_weekly_day:"INT64",
        digest_weekly_hour:"INT64",
        daily_j7:         "BOOL",
        daily_j7_hour:    "INT64",
        additional_emails: ["STRING"],
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
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