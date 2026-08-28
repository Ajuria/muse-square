// Route: /api/channels/members — vue équipe inc 9b. Gestion des ACCÈS app
// (analytics.location_members : email d'invitation, pôles, identité Slack) — le registre
// jumeau du roster team_members (contacts). Gestes OWNER. Journal latest-wins (patron
// location_members, lecture table entière puis filtre — même règle que profileContext).
//   GET    ?location_id=            → membres courants du site.
//   POST   {location_id, member_id?, member_email?, pole_dispositif_ids?, slack_user_id?}
//          → upsert par copy-forward (les champs absents sont CONSERVÉS, jamais effacés).
//   DELETE {location_id, member_id} → tombstone.
// L'ENVOI de l'email d'invitation est le lot 9d (copie owner à arbitrer) — ici on écrit.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";

export const prerender = false;
const PROJECT = "muse-square-open-data";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function uid(locals: any): string | null {
  return String(locals?.clerk_user_id || "").trim() || null;
}

async function latestMembers(bq: any, location_id: string): Promise<any[]> {
  const [rows] = await bq.query({
    query: `
      SELECT member_id, member_email, clerk_user_id, role, pole_dispositif_ids, slack_user_id
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY updated_at DESC) AS rn
        FROM \`${PROJECT}.analytics.location_members\`
      )
      WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE AND location_id = @l
      ORDER BY created_at
    `,
    params: { l: location_id }, location: "EU",
  });
  return (rows || []).map((r: any) => {
    let poles: string[] = [];
    try { poles = JSON.parse(r.pole_dispositif_ids || "[]"); } catch {}
    return {
      member_id: String(r.member_id),
      member_email: r.member_email || null,
      // Accès : « connecté » dès que la 1re connexion a résolu le clerk_user_id.
      connected: r.clerk_user_id != null && String(r.clerk_user_id) !== "",
      role: r.role || "member",
      pole_dispositif_ids: Array.isArray(poles) ? poles : [],
      slack_user_id: r.slack_user_id || null,
    };
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    if (!uid(locals)) return json({ ok: false }, 401);
    const locationId = String(url.searchParams.get("location_id") || "").trim();
    if (!locationId) return json({ ok: false, error: "Missing location_id" }, 400);
    requireLocationOwnership(locals, locationId);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    return json({ ok: true, items: await latestMembers(bq, locationId) });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, /FORBIDDEN/.test(String(err?.message)) ? 403 : 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    if (!uid(locals)) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.location_id) return json({ ok: false, error: "Missing location_id" }, 400);
    requireLocationOwnership(locals, body.location_id);
    const locationId = String(body.location_id).trim();
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);

    const current = await latestMembers(bq, locationId);
    const memberId = String(body.member_id || "").trim() || crypto.randomUUID();
    const prior = current.find((m) => m.member_id === memberId) || null;
    if (!prior && !String(body.member_email || "").trim()) {
      return json({ ok: false, error: "member_email requis pour un nouveau membre" }, 400);
    }
    // Copy-forward : champ fourni = nouvelle valeur ; absent = valeur conservée.
    const email = body.member_email !== undefined ? (String(body.member_email || "").trim() || null) : (prior?.member_email ?? null);
    const poles = body.pole_dispositif_ids !== undefined
      ? (Array.isArray(body.pole_dispositif_ids) ? body.pole_dispositif_ids.map(String).filter(Boolean) : [])
      : (prior?.pole_dispositif_ids ?? []);
    const slackId = body.slack_user_id !== undefined ? (String(body.slack_user_id || "").trim() || null) : (prior?.slack_user_id ?? null);

    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.analytics.location_members\`
          (member_id, location_id, member_email, clerk_user_id, role, pole_dispositif_ids, slack_user_id, deleted, created_at, updated_at)
        VALUES (@m, @l, @em,
          (SELECT clerk_user_id FROM (SELECT clerk_user_id, ROW_NUMBER() OVER (ORDER BY updated_at DESC) rn FROM \`${PROJECT}.analytics.location_members\` WHERE member_id = @m) WHERE rn = 1),
          'member', @poles, @sid, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      `,
      params: { m: memberId, l: locationId, em: email ?? "", poles: JSON.stringify(poles), sid: slackId ?? "" },
      location: "EU",
    });
    return json({ ok: true, member_id: memberId });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, /FORBIDDEN/.test(String(err?.message)) ? 403 : 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    if (!uid(locals)) return json({ ok: false }, 401);
    const body = await request.json().catch(() => null);
    if (!body || !body.location_id || !body.member_id) return json({ ok: false, error: "Champs requis : location_id, member_id" }, 400);
    requireLocationOwnership(locals, body.location_id);
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    await bq.query({
      query: `
        INSERT INTO \`${PROJECT}.analytics.location_members\`
          (member_id, location_id, deleted, created_at, updated_at)
        VALUES (@m, @l, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
      `,
      params: { m: String(body.member_id), l: String(body.location_id) },
      location: "EU",
    });
    return json({ ok: true });
  } catch (err: any) {
    return json({ ok: false, error: err?.message || "Unknown error" }, /FORBIDDEN/.test(String(err?.message)) ? 403 : 500);
  }
};
