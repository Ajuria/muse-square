import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const ADMIN_USER_ID = "user_38OwkmwUq0Ldj5FwB9AJ8HmziWo";
const PROJECT = "muse-square-open-data";

export const GET: APIRoute = async ({ locals }) => {
  const userId = (locals as any)?.clerk_user_id;
  if (userId !== ADMIN_USER_ID) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "content-type": "application/json" },
    });
  }

  const bq = makeBQClient(PROJECT);
  const [rows] = await bq.query({
    query: `SELECT * FROM \`${PROJECT}.mart.fct_admin_dashboard\` ORDER BY last_action_at DESC`,
    location: "EU",
  });

  // Serialize BigQuery timestamp/date objects to ISO strings
  const serialized = (rows || []).map((r: any) => {
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