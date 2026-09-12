// src/pages/api/explorer/rapports.ts — LES RAPPORTS ENREGISTRÉS d'un site (docs/explorer-outil-spec.md § 6.1, incrément 2).
//
//   GET  ?location_id=…[&document_id=…]  → la liste (dernière version de chaque Rapport) ou un Rapport.
//   POST { location_id, rapport, document_id? }   → « Enregistrer » : une version de plus (append-only), la première
//        pour un document nouveau. Le corps est le bloc `rapport` tel que /api/explorer/agent l'a rendu (Synthèse comprise).
// Auth : Clerk, requireLocationAccess (owner ou membre du site) ; en `astro dev` avec MS_AUTH_BYPASS=1, le proto
// (4173) l'appelle — CORS ouvert en dev seulement, le geste d'agent.ts. Lib : src/lib/rapport/documents.ts.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { isRapportBlock, listReportDocuments, newReportDocumentRow, readReportDocument, writeReportDocument } from "../../../lib/rapport/documents";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const DEV_BYPASS = import.meta.env.DEV && process.env.MS_AUTH_BYPASS === "1";

const corsHeaders = (): Record<string, string> =>
  DEV_BYPASS ? { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST, OPTIONS" } : {};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...corsHeaders() } });
}

function who(locals: any, location_id: string, dev_user_id?: unknown): { user_id: string; role: "owner" | "member" } | Response {
  if (DEV_BYPASS && !locals?.clerk_user_id) return { user_id: String(dev_user_id || "dev-bypass").slice(0, 80), role: "owner" };
  const user_id = String(locals?.clerk_user_id || "").trim();
  if (!user_id) return json({ ok: false, error: "UNAUTHENTICATED" }, 401);
  try { requireLocationAccess(locals, location_id); } catch { return json({ ok: false, error: "FORBIDDEN" }, 403); }
  const owned: string[] = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids.map(String) : [];
  return { user_id, role: owned.includes(location_id) ? "owner" : "member" };
}

export const OPTIONS: APIRoute = async () =>
  DEV_BYPASS ? new Response(null, { status: 204, headers: corsHeaders() }) : new Response(null, { status: 404 });

export const GET: APIRoute = async ({ url, locals }) => {
  const location_id = String(url.searchParams.get("location_id") || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, url.searchParams.get("dev_user_id"));
  if (w instanceof Response) return w;
  const bq = makeBQClient(BQ_PROJECT);
  try {
    const document_id = String(url.searchParams.get("document_id") || "").trim();
    if (document_id) {
      const doc = await readReportDocument(bq, location_id, document_id);
      return doc ? json({ ok: true, document: doc }) : json({ ok: false, error: "Rapport introuvable" }, 404);
    }
    const documents = await listReportDocuments(bq, location_id);
    // La liste ne porte pas les blocs (légère) : le titre, la période, la version, la date — le document se lit par id.
    return json({ ok: true, documents: documents.map(({ rapport, ...d }) => ({ ...d, n_sections: rapport.sections.length })) });
  } catch (e: any) {
    console.error("[explorer/rapports] GET :", e?.message || e);
    return json({ ok: false, error: "Lecture des Rapports impossible" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
  const location_id = String(body.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, body.dev_user_id);
  if (w instanceof Response) return w;
  if (!rateLimit(w.user_id, "explorer-rapports", 30, 60_000)) return rateLimitResponse();
  if (!isRapportBlock(body.rapport)) return json({ ok: false, error: "rapport : le document n'a pas la forme d'un Rapport" }, 400);
  const bq = makeBQClient(BQ_PROJECT);
  try {
    const document_id = typeof body.document_id === "string" && body.document_id.trim() ? body.document_id.trim() : null;
    let version = 1;
    if (document_id) {
      const prev = await readReportDocument(bq, location_id, document_id);
      if (!prev) return json({ ok: false, error: "Rapport introuvable sur ce site" }, 404);
      version = prev.version + 1;
    }
    const row = newReportDocumentRow({ location_id, author: w, rapport: body.rapport, document_id, version, modele_id: typeof body.modele_id === "string" ? body.modele_id : null });
    await writeReportDocument(bq, row);
    return json({ ok: true, document_id: row.document_id, version: row.version, titre: row.titre, created_at: row.created_at });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/^rapport : /.test(msg)) return json({ ok: false, error: msg }, 400);
    console.error("[explorer/rapports] POST :", msg);
    return json({ ok: false, error: "Enregistrement impossible" }, 500);
  }
};
