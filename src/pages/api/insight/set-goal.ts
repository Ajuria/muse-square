// src/pages/api/insight/set-goal.ts
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
export const prerender = false;

// Closed list — must match dim_client_goal. goal_bucket is derived server-side
// (never trusted from the client).
const GOAL_BUCKET: Record<string, string> = {
  faire_venir: "acquisition",
  augmenter_panier: "revenue",
  plus_avis: "reputation",
  surveiller_marche: "veille",
};
const VALID_SCOPES = ["intake_default", "weekly"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) return json(401, { ok: false });

    const body = await request.json().catch(() => null);
    if (!body || !body.location_id) return json(400, { ok: false, error: "Missing location_id" });

    const location_id = String(body.location_id).trim();
    requireLocationOwnership(locals, location_id);

    const scope = String(body.scope || "").trim();
    if (!VALID_SCOPES.includes(scope)) return json(400, { ok: false, error: "Invalid scope" });

    const isClear = body.clear === true;
    const goal = isClear ? null : String(body.goal || "").trim();
    if (!isClear && !GOAL_BUCKET[goal as string]) return json(400, { ok: false, error: "Invalid goal" });

    const projectId = String(process.env.BQ_PROJECT_ID || "muse-square-open-data").trim();
    const bq = makeBQClient(projectId);

    // Close the currently-open row of this scope (DML, not streaming — so it's
    // immediately updatable; a streaming insert can't be UPDATEd for ~30min).
    await bq.query({
      query: `
        UPDATE \`${projectId}.analytics.goal_state\`
        SET effective_to = CURRENT_TIMESTAMP()
        WHERE user_id = @user_id
          AND location_id = @location_id
          AND goal_scope = @scope
          AND effective_to IS NULL
      `,
      params: { user_id: userId, location_id, scope },
      location: "EU",
    });

    // Insert the new active row (skip on clear — deselection just closes the scope,
    // letting the lower-priority scope resurface via int_user_active_goal).
    if (!isClear) {
      await bq.query({
        query: `
          INSERT INTO \`${projectId}.analytics.goal_state\`
            (goal_state_id, user_id, location_id, goal, goal_bucket, goal_scope, effective_from, effective_to, created_at)
          VALUES
            (@id, @user_id, @location_id, @goal, @goal_bucket, @scope, CURRENT_TIMESTAMP(), NULL, CURRENT_TIMESTAMP())
        `,
        params: {
          id: crypto.randomUUID(),
          user_id: userId,
          location_id,
          goal,
          goal_bucket: GOAL_BUCKET[goal as string],
          scope,
        },
        location: "EU",
      });
    }

    return json(200, { ok: true, goal: isClear ? null : goal, scope });
  } catch (err: any) {
    return json(500, { ok: false, error: err?.message || "Unknown error" });
  }
};