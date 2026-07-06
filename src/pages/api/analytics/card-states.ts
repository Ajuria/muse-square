import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

// Per-card outcome state for the feed, read back from action_log. card_instance_id is not
// persisted, so the match key is (location_id, change_subtype, affected_date). Only the
// latest completed-outcome event per card is returned; the client shows "À traiter" for any
// card with no row. Draft generation is intentionally excluded — generating a draft is not a
// response. Event → state mapping is done here so the client stays a lookup.
const OUTCOME_EVENTS = [
  "card_not_done",
  "card_already_done",
  "card_done",
  "draft_published",
  "draft_copied",
];

function stateForEvent(event: string): string | null {
  switch (event) {
    case "card_not_done": return "ecarte";
    case "card_already_done":
    case "card_done": return "fait";
    case "draft_published":
    case "draft_copied": return "repondu";
    default: return null;
  }
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
    }
    const location_id = url.searchParams.get("location_id");
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    requireLocationOwnership(locals, location_id);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const [rows] = await bq.query({
      query: `
        SELECT change_subtype, affected_date, event
        FROM (
          SELECT change_subtype, affected_date, event,
                 ROW_NUMBER() OVER (PARTITION BY change_subtype, affected_date ORDER BY created_at DESC) AS rn
          FROM \`muse-square-open-data.analytics.action_log\`
          WHERE user_id = @userId
            AND location_id = @location_id
            AND event IN UNNEST(@events)
            AND affected_date IS NOT NULL
            AND affected_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
        )
        WHERE rn = 1
      `,
      params: { userId, location_id, events: OUTCOME_EVENTS },
      location: "EU",
    });

    const items = (rows || [])
      .map((r: any) => {
        const state = stateForEvent(String(r.event || ""));
        if (!state) return null;
        return {
          change_subtype: r.change_subtype,
          affected_date: r.affected_date?.value ?? String(r.affected_date ?? ""),
          state,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
