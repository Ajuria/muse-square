import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { createClerkClient } from "@clerk/clerk-sdk-node";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ ok: false, error: "Unsupported content-type" }), {
        status: 415,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json();
    const first_name = typeof body.first_name === "string" && body.first_name.trim() ? body.first_name.trim() : null;
    const last_name = typeof body.last_name === "string" && body.last_name.trim() ? body.last_name.trim() : null;
    const position = typeof body.position === "string" && body.position.trim() ? body.position.trim() : null;
    const main_event_objective = typeof body.main_event_objective === "string" && body.main_event_objective.trim() ? body.main_event_objective.trim() : null;

    if (!first_name || !last_name) {
      return new Response(JSON.stringify({ ok: false, error: "Pr\u00e9nom et nom sont obligatoires." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // 1. Update Clerk user (always works, no BQ row needed)
    const secretKey = (process.env.CLERK_SECRET_KEY || "").trim();
    const clerk = createClerkClient({ secretKey });
    await clerk.users.updateUser(clerk_user_id.trim(), {
      firstName: first_name,
      lastName: last_name,
      publicMetadata: {
        position: position || undefined,
        main_event_objective: main_event_objective || undefined,
      },
    });

    // 2. Update BQ rows if any exist (propagate to all locations)
    try {
      const projectId = (process.env.BQ_PROJECT_ID || "").trim();
      const dataset = (process.env.BQ_DATASET || "").trim();
      const table = (process.env.BQ_TABLE || "").trim();
      const bigquery = makeBQClient(projectId);
      const fullTable = `\`${projectId}.${dataset}.${table}\``;
      const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

      await bigquery.query({
        query: `
          UPDATE ${fullTable}
          SET
            first_name = @first_name,
            last_name = @last_name,
            position = IF(@position IS NULL, position, @position),
            main_event_objective = IF(@main_event_objective IS NULL, main_event_objective, @main_event_objective),
            updated_at = CURRENT_TIMESTAMP()
          WHERE clerk_user_id = @clerk_user_id
        `,
        location: BQ_LOCATION,
        params: { clerk_user_id: clerk_user_id.trim(), first_name, last_name, position, main_event_objective },
        types: { clerk_user_id: "STRING", first_name: "STRING", last_name: "STRING", position: "STRING", main_event_objective: "STRING" },
      });
    } catch (e: any) {
      console.error("[save-user.ts] BQ update failed (non-fatal):", e?.message);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    console.error("[save-user.ts]", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message ?? "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};