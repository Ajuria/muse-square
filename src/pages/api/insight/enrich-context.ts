// src/pages/api/insight/enrich-context.ts
// Environment crawl for the movement-card dossier ("Consulter la source"). ÉTAPE 5 (08/08) : le
// cœur (cache 30 j + Claude web_search + écriture cache) vit désormais dans lib/ai/webContext.ts,
// PARTAGÉ avec le chat Explorer (sections « Web — non vérifié »). Ce endpoint reste le wrapper
// HTTP du dossier de carte — contrat de réponse INCHANGÉ pour insight.astro ({ok, data:{takeaway,
// key_factors, sources, cached}}), ownership vérifié, 400 sur entrée invalide.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { getWebDayContext } from "../../../lib/ai/webContext";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  const {
    location_id, date, city_name, driver, is_vacation, is_holiday,
    commercial_event, events_5km, business_short_description,
  } = body ?? {};

  if (!location_id || !ISO_DATE_RE.test(String(date || ""))) {
    return new Response(JSON.stringify({ ok: false, error: "location_id + date (YYYY-MM-DD) requis" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  try { requireLocationOwnership(locals, String(location_id)); }
  catch { return new Response(JSON.stringify({ ok: false, error: "FORBIDDEN" }), { status: 403, headers: { "content-type": "application/json" } }); }

  const bq = makeBQClient(process.env.BQ_PROJECT_ID || BQ_PROJECT);
  const ctx = await getWebDayContext(bq, {
    location_id: String(location_id), date: String(date),
    city_name, business_short_description, driver, is_vacation, is_holiday, commercial_event, events_5km,
  });
  const data = ctx ?? { takeaway: null, key_factors: [], sources: [], cached: false };
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
};
