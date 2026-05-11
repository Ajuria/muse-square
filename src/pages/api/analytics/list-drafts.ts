import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim() || null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const location_id = url.searchParams.get("location_id");
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const [rows] = await bq.query({
      query: `
        SELECT
          draft_id,
          signal_type,
          channel,
          card_what,
          card_sowhat,
          affected_date,
          severity,
          title,
          body,
          hashtags,
          recipient,
          tone,
          key_phrases,
          created_at,
          updated_at
        FROM \`muse-square-open-data.analytics.saved_drafts\`
        WHERE user_id = @userId
          AND location_id = @location_id
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 20
      `,
      params: { userId, location_id },
      location: "EU",
    });
    const items = (rows || []).map((r: any) => ({
      draft_id: r.draft_id,
      signal_type: r.signal_type,
      channel: r.channel,
      card_what: r.card_what,
      card_sowhat: r.card_sowhat,
      affected_date: r.affected_date?.value ?? String(r.affected_date ?? ""),
      severity: r.severity,
      title: r.title,
      body: r.body,
      hashtags: r.hashtags,
      recipient: r.recipient,
      tone: r.tone,
      key_phrases: r.key_phrases,
      created_at: r.created_at?.value ?? String(r.created_at ?? ""),
      updated_at: r.updated_at?.value ?? String(r.updated_at ?? ""),
    }));
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