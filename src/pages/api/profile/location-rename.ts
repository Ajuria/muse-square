import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();
    const location_id = String(body.location_id || "").trim();
    const company_name = String(body.company_name || "").trim();

    if (!location_id || !company_name) {
      return new Response(JSON.stringify({ ok: false, error: "location_id and company_name required" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    const projectId = process.env.BQ_PROJECT_ID!;
    const bigquery = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    await bigquery.query({
      query: `
        UPDATE \`${projectId}.raw.insight_event_user_location_profile\`
        SET company_name = @company_name, updated_at = CURRENT_TIMESTAMP()
        WHERE clerk_user_id = @clerk_user_id
          AND location_id = @location_id
          AND is_primary = FALSE
      `,
      params: { clerk_user_id, location_id, company_name },
      types: { clerk_user_id: "STRING", location_id: "STRING", company_name: "STRING" },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    console.error("[location-rename]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};