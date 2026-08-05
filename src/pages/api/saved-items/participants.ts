// Participants d'une occurrence d'événement — destinataires de la consigne d'opération
// (docs/automatisation-spec.md § décisions 4 et 7). Contacts EXTERNES possibles (producteur,
// exposant…) : jamais d'accès app — ils ne servent qu'à l'envoi de la consigne.
// Journal append-only streaming (le buffer BQ interdit UPDATE/DELETE) : dernier état par
// participant_id gagne, suppression = ligne deleted=true (patron analytics.automation_rules).
import "dotenv/config";
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";

export const prerender = false;

const BQ_PROJECT = "muse-square-open-data";
const TABLE_FQN = () => `\`${(process.env.BQ_PROJECT_ID || BQ_PROJECT).trim()}.raw.saved_item_participants\``;
const ITEMS_FQN = () => `\`${(process.env.BQ_PROJECT_ID || BQ_PROJECT).trim()}.raw.saved_items\``;

function jsonResponse(status: number, body: Record<string, any>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function authContext(locals: any): { clerk_user_id: string; location_id: string } | null {
  const u = typeof locals?.clerk_user_id === "string" ? locals.clerk_user_id.trim() : "";
  const l = typeof locals?.location_id === "string" ? locals.location_id.trim() : "";
  return u && l ? { clerk_user_id: u, location_id: l } : null;
}

// Propriété : l'événement doit appartenir à l'utilisateur ET au lieu du contexte —
// même contrat que saved-items/update.
async function ownsItem(bq: any, saved_item_id: string, clerk_user_id: string, location_id: string): Promise<boolean> {
  const [rows] = await bq.query({
    query: `SELECT saved_item_id FROM ${ITEMS_FQN()}
            WHERE saved_item_id = @saved_item_id AND clerk_user_id = @clerk_user_id AND location_id = @location_id
            LIMIT 1`,
    location: "EU",
    params: { saved_item_id, clerk_user_id, location_id },
  });
  return Array.isArray(rows) && rows.length > 0;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const ctx = authContext(locals);
    if (!ctx) return jsonResponse(401, { ok: false, error: "Unauthorized" });
    const saved_item_id = (url.searchParams.get("saved_item_id") || "").trim();
    if (!saved_item_id) return jsonResponse(400, { ok: false, error: "saved_item_id requis" });
    const date = (url.searchParams.get("date") || "").trim() || null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse(400, { ok: false, error: "date invalide (Y-m-d)" });

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    if (!(await ownsItem(bq, saved_item_id, ctx.clerk_user_id, ctx.location_id))) {
      return jsonResponse(404, { ok: false, error: "Not found" });
    }
    // ?date= renvoie les participants de CETTE occurrence + ceux de TOUTE la série (date NULL,
    // inc. 6) — le cron fait la même union à l'envoi. `serie: true` distingue les deux à l'écran.
    const [rows] = await bq.query({
      query: `
        SELECT participant_id, CAST(date AS STRING) AS date, participant_name, contact,
               (date IS NULL) AS serie
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY updated_at DESC) AS rn
          FROM ${TABLE_FQN()}
          WHERE saved_item_id = @saved_item_id AND clerk_user_id = @clerk_user_id
        )
        WHERE rn = 1 AND COALESCE(deleted, FALSE) = FALSE
          ${date ? "AND (date = DATE(@date) OR date IS NULL)" : ""}
        ORDER BY (date IS NULL) DESC, date, created_at
      `,
      location: "EU",
      params: date ? { saved_item_id, clerk_user_id: ctx.clerk_user_id, date } : { saved_item_id, clerk_user_id: ctx.clerk_user_id },
    });
    return jsonResponse(200, { ok: true, participants: rows || [] });
  } catch (err: any) {
    return jsonResponse(500, { ok: false, error: err?.message || "Unknown error" });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const ctx = authContext(locals);
    if (!ctx) return jsonResponse(401, { ok: false, error: "Unauthorized" });
    const body = await request.json().catch(() => null);
    const saved_item_id = typeof body?.saved_item_id === "string" ? body.saved_item_id.trim() : "";
    const date = typeof body?.date === "string" ? body.date.trim() : "";
    const serie = body?.serie === true; // inc. 6 : participant de TOUTE la série (date NULL)
    const participant_name = typeof body?.participant_name === "string" ? body.participant_name.trim().slice(0, 120) : "";
    const contact = typeof body?.contact === "string" ? body.contact.trim().slice(0, 200) : "";
    if (!saved_item_id || !participant_name) return jsonResponse(400, { ok: false, error: "saved_item_id et participant_name requis" });
    if (!serie && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse(400, { ok: false, error: "date requise (Y-m-d) — ou serie: true pour toute la série" });

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    if (!(await ownsItem(bq, saved_item_id, ctx.clerk_user_id, ctx.location_id))) {
      return jsonResponse(404, { ok: false, error: "Not found" });
    }
    const now = new Date().toISOString();
    const participant_id = crypto.randomUUID();
    await bq.dataset("raw").table("saved_item_participants").insert([{
      participant_id,
      saved_item_id,
      location_id: ctx.location_id,
      clerk_user_id: ctx.clerk_user_id,
      date: serie ? null : date,
      participant_name,
      contact: contact || null,
      deleted: false,
      created_at: now,
      updated_at: now,
    }]);
    return jsonResponse(200, { ok: true, participant_id });
  } catch (err: any) {
    return jsonResponse(500, { ok: false, error: err?.message || "Unknown error" });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const ctx = authContext(locals);
    if (!ctx) return jsonResponse(401, { ok: false, error: "Unauthorized" });
    const body = await request.json().catch(() => null);
    const saved_item_id = typeof body?.saved_item_id === "string" ? body.saved_item_id.trim() : "";
    const participant_id = typeof body?.participant_id === "string" ? body.participant_id.trim() : "";
    if (!saved_item_id || !participant_id) return jsonResponse(400, { ok: false, error: "saved_item_id et participant_id requis" });

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
    if (!(await ownsItem(bq, saved_item_id, ctx.clerk_user_id, ctx.location_id))) {
      return jsonResponse(404, { ok: false, error: "Not found" });
    }
    const now = new Date().toISOString();
    await bq.dataset("raw").table("saved_item_participants").insert([{
      participant_id,
      saved_item_id,
      location_id: ctx.location_id,
      clerk_user_id: ctx.clerk_user_id,
      date: null,
      participant_name: "",
      contact: null,
      deleted: true,
      created_at: now,
      updated_at: now,
    }]);
    return jsonResponse(200, { ok: true });
  } catch (err: any) {
    return jsonResponse(500, { ok: false, error: err?.message || "Unknown error" });
  }
};
