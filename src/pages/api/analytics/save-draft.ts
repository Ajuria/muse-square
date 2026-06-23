import type { APIRoute } from "astro";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.body) {
      return new Response(JSON.stringify({ ok: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    requireLocationOwnership(locals, body.location_id);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const draftId = crypto.randomUUID();

    await bq.query({
      query: `
        INSERT INTO \`muse-square-open-data.analytics.saved_drafts\` (
          draft_id, user_id, location_id, signal_type, channel,
          card_what, card_sowhat, affected_date, severity,
          title, body, hashtags, recipient,
          original_ai_text, user_instruction,
          status, artifact_mode,
          created_at, updated_at
        ) VALUES (
          @draft_id, @user_id, @location_id, @signal_type, @channel,
          @card_what, @card_sowhat, SAFE.PARSE_DATE('%Y-%m-%d', NULLIF(@affected_date, '')), @severity,
          @title, @body, @hashtags, @recipient,
          @original_ai_text, @user_instruction,
          'active', @artifact_mode,
          CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        )
      `,
      params: {
        draft_id: draftId,
        user_id: userId,
        location_id: String(body.location_id),
        signal_type: String(body.signal_type || ""),
        channel: String(body.channel || ""),
        card_what: String(body.card_what || ""),
        card_sowhat: String(body.card_sowhat || ""),
        affected_date: String(body.affected_date || ""),
        severity: String(body.severity || ""),
        title: String(body.title || ""),
        body: String(body.body || ""),
        hashtags: String(body.hashtags || ""),
        recipient: String(body.recipient || ""),
        original_ai_text: String(body.original_ai_text || ""),
        user_instruction: String(body.user_instruction || ""),
        artifact_mode: String(body.artifact_mode || "post"),
      },
      location: "EU",
    });

    return new Response(JSON.stringify({ ok: true, draft_id: draftId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};