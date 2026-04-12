import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const clerk_user_id = String((locals as any)?.clerk_user_id || "").trim();
    if (!clerk_user_id) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" }
      });
    }

    const body = await request.json().catch(() => null);
    const id   = String(body?.id || "").trim();
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing id" }), {
        status: 400, headers: { "content-type": "application/json" }
      });
    }

    const projectId   = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq          = makeBQClient(projectId);
    const BQ_LOCATION = (process.env.BQ_LOCATION || "EU").trim();

    await bq.query({
      query: `
        UPDATE \`${projectId}.raw.watched_events\`
        SET deleted_at = CURRENT_TIMESTAMP()
        WHERE watched_event_id = @id
          AND clerk_user_id = @clerk_user_id
          AND deleted_at IS NULL
      `,
      params: { id, clerk_user_id },
      types: { id: "STRING", clerk_user_id: "STRING" },
      location: BQ_LOCATION,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json" }
    });

  } catch (err: any) {
    console.error("[unfollow-event]", err?.message);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" }
    });
  }
};