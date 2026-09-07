// POST /api/insight/day-notes — LA NOTE-CAUSE D'UN JOUR (owner 07/09, docs/explorer-etat-vide-spec.md
// § 6.3) : ce que la mesure ne voit pas, écrit par l'exploitant sur un jour daté. Append-only dans
// `analytics.day_notes` (note_id, location_id, clerk_user_id, date, note_text, created_at) — la dernière
// note d'un jour fait foi. Lue par l'état vide d'Explorer (explorer-slots : un jour noté ne redemande
// plus) et par les faits du jour (buildDayPerformanceFacts : « Note du JJ/MM/AAAA : « … » », fait
// observé, jamais causal). Exposée à dbt par stg_day_notes → semantic.vw_insight_event_day_notes.
// Body : { location_id, date: 'YYYY-MM-DD', note_text }. Un suivi appartient à un SITE : location_id
// obligatoire, accès requireLocationAccess (membre inclus — une note de jour n'a pas de périmètre de pôle).

import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";

export const prerender = false;
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
const MAX_NOTE = 500;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim();
    if (!userId) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
    const body = await request.json().catch(() => null);
    const locationId = String(body?.location_id || "").trim();
    const date = String(body?.date || "").trim();
    const noteText = String(body?.note_text || "").replace(/\s+/g, " ").trim();
    if (!locationId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !noteText) {
      return json({ ok: false, error: "Champs requis : location_id, date (YYYY-MM-DD), note_text" }, 400);
    }
    if (noteText.length > MAX_NOTE) return json({ ok: false, error: `note_text : ${MAX_NOTE} caractères au plus` }, 400);
    requireLocationAccess(locals, locationId);

    const bq = makeBQClient(BQ_PROJECT);
    const table = bq.dataset("analytics").table("day_notes");
    const row = { note_id: randomUUID(), location_id: locationId, clerk_user_id: userId, date, note_text: noteText, created_at: new Date().toISOString() };
    await table.insert([row]).catch(async (err: any) => {
      if (err?.code === 404 || String(err?.message || "").includes("Not found")) {
        // Même geste que action-log.ts : la table naît à la première écriture (DDL identique à celui
        // créé en base le 07/09 — six colonnes REQUIRED).
        await bq.dataset("analytics").createTable("day_notes", { schema: { fields: [
          { name: "note_id", type: "STRING", mode: "REQUIRED" },
          { name: "location_id", type: "STRING", mode: "REQUIRED" },
          { name: "clerk_user_id", type: "STRING", mode: "REQUIRED" },
          { name: "date", type: "DATE", mode: "REQUIRED" },
          { name: "note_text", type: "STRING", mode: "REQUIRED" },
          { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
        ] } });
        await table.insert([row]);
      } else {
        throw err;
      }
    });
    return json({ ok: true, note_id: row.note_id, date });
  } catch (err: any) {
    const status = /FORBIDDEN|UNAUTH/.test(String(err?.message)) ? 403 : 500;
    return json({ ok: false, error: err?.message || "Unknown error" }, status);
  }
};
