import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { ADMIN_USER_IDS } from "../../../lib/admins";

export const prerender = false;

const ADMIN_IDS = ADMIN_USER_IDS;
const PROJECT = "muse-square-open-data";

export const GET: APIRoute = async ({ locals }) => {
  const userId = (locals as any)?.real_clerk_user_id || (locals as any)?.clerk_user_id;
  if (!ADMIN_IDS.includes(userId)) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const bq = makeBQClient(PROJECT);
  const [rows] = await bq.query({
    query: `
      SELECT
        clerk_user_id,
        ARRAY_AGG(STRUCT(
          location_id,
          IFNULL(company_name, '') AS company_name,
          IFNULL(first_name, '') AS first_name,
          IFNULL(last_name, '') AS last_name,
          IFNULL(email, '') AS email
        ) ORDER BY is_primary DESC, updated_at DESC LIMIT 1)[OFFSET(0)] AS profile
      FROM \`${PROJECT}.raw.insight_event_user_location_profile\`
      GROUP BY clerk_user_id
      ORDER BY profile.first_name
    `,
    location: "EU",
  });

  const users = (rows || []).map((r: any) => ({
    clerk_user_id: r.clerk_user_id,
    first_name: r.profile?.first_name || "",
    last_name: r.profile?.last_name || "",
    company_name: r.profile?.company_name || "",
    email: r.profile?.email || "",
  }));

  return new Response(JSON.stringify({ ok: true, data: users }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};