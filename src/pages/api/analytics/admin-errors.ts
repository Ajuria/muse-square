import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const ADMIN_USER_ID = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const PROJECT = "muse-square-open-data";

export const GET: APIRoute = async ({ url, locals }) => {
  const userId = (locals as any)?.clerk_user_id;
  if (userId !== ADMIN_USER_ID) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "content-type": "application/json" },
    });
  }

  const targetUser = url.searchParams.get("user_id") || "";
  const targetLocation = url.searchParams.get("location_id") || "";

  if (!targetUser || !targetLocation) {
    return new Response(JSON.stringify({ ok: false, error: "user_id and location_id required" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const bq = makeBQClient(PROJECT);

  const [apiErrors] = await bq.query({
    query: `
      SELECT error_id, clerk_user_id, location_id, endpoint, error_type, error_message, http_status_code, created_at
      FROM \`${PROJECT}.analytics.api_error_log\`
      WHERE clerk_user_id = @user_id AND location_id = @location_id
      ORDER BY created_at DESC
      LIMIT 50
    `,
    location: "EU",
    params: { user_id: targetUser, location_id: targetLocation },
    types: { user_id: "STRING", location_id: "STRING" },
  });

  const [crawlErrors] = await bq.query({
    query: `
      SELECT crawl_id, clerk_user_id, location_id, website_url, status, error_message, http_status_code, duration_ms, created_at
      FROM \`${PROJECT}.analytics.crawl_log\`
      WHERE clerk_user_id = @user_id AND location_id = @location_id AND status != 'success'
      ORDER BY created_at DESC
      LIMIT 50
    `,
    location: "EU",
    params: { user_id: targetUser, location_id: targetLocation },
    types: { user_id: "STRING", location_id: "STRING" },
  });

  const combined = [
    ...(apiErrors || []).map((r: any) => ({ ...r, source: "api_error" })),
    ...(crawlErrors || []).map((r: any) => ({ ...r, source: "crawl", endpoint: "/api/profile/crawl-website", error_type: r.status })),
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const serialized = combined.map((r: any) => {
    const out: any = {};
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === 'object' && 'value' in v) {
        out[k] = v.value;
      } else if (v instanceof Date) {
        out[k] = v.toISOString();
      } else {
        out[k] = v;
      }
    }
    return out;
  });

  return new Response(JSON.stringify({ ok: true, data: serialized }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};