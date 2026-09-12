// src/pages/api/explorer/modeles.ts — LES MODÈLES DE RAPPORT d'un site (docs/explorer-outil-spec.md § 6.3, incrément 4).
//
//   GET  ?location_id=…                        → la liste (dernière version de chaque Modèle), plus le modèle par défaut
//                                                  « ventes » (MODELE_VENTES), qui n'est pas une ligne.
//   POST { location_id, document_id, nom }     → « Enregistrer comme modèle » : le Rapport enregistré, sans ses chiffres
//                                                  (templateFromDocument), écrit en version 1 ; `template_id` + `nom` pour
//                                                  renommer un modèle (version suivante).
// Auth, bypass dev et CORS : les mêmes que explorer/rapports.ts. Lib : src/lib/rapport/modeles.ts.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { readReportDocument } from "../../../lib/rapport/documents";
import { listReportTemplates, newReportTemplateRow, templateFromDocument, writeReportTemplate } from "../../../lib/rapport/modeles";
import { MODELE_VENTES, SECTION_BY_CLE } from "../../../lib/fr/rapport.fr";

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

/** Le modèle par défaut « ventes » tel que la page le liste — pas une ligne, les sections de MODELE_VENTES. */
export const MODELE_VENTES_DEFAUT = {
  template_id: "ventes", version: 0, nom: "Rapport de ventes", periode_relative: "30_derniers_jours", indicateur: "ca", par_defaut: true,
  sections: MODELE_VENTES.filter((c) => c !== "synthese" && c !== "sources").map((c) => ({ cle: c, params: {} })),
  sections_fr: MODELE_VENTES.map((c) => SECTION_BY_CLE[c].titre),
};

export const OPTIONS: APIRoute = async () =>
  DEV_BYPASS ? new Response(null, { status: 204, headers: corsHeaders() }) : new Response(null, { status: 404 });

export const GET: APIRoute = async ({ url, locals }) => {
  // Sans location_id (la page ouverte depuis le menu), le site actif de la session — comme insight/sales-report.
  const location_id = String(url.searchParams.get("location_id") || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, url.searchParams.get("dev_user_id"));
  if (w instanceof Response) return w;
  try {
    const modeles = await listReportTemplates(makeBQClient(BQ_PROJECT), location_id);
    return json({ ok: true, location_id, modeles: [MODELE_VENTES_DEFAUT, ...modeles.map((t) => ({ ...t, par_defaut: false, sections_fr: t.sections.map((s) => SECTION_BY_CLE[s.cle].titre) }))] });
  } catch (e: any) {
    console.error("[explorer/modeles] GET :", e?.message || e);
    return json({ ok: false, error: "Lecture des Modèles impossible" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
  const location_id = String(body.location_id || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, body.dev_user_id);
  if (w instanceof Response) return w;
  if (!rateLimit(w.user_id, "explorer-modeles", 30, 60_000)) return rateLimitResponse();
  const document_id = String(body.document_id || "").trim();
  if (!document_id) return json({ ok: false, error: "document_id requis" }, 400);
  const bq = makeBQClient(BQ_PROJECT);
  try {
    const doc = await readReportDocument(bq, location_id, document_id);
    if (!doc) return json({ ok: false, error: "Rapport introuvable sur ce site" }, 404);
    const t = templateFromDocument(doc.rapport, body.nom);
    if ("erreur" in t) return json({ ok: false, error: `modèle : ${t.erreur}` }, 400);
    let version = 1; const template_id = typeof body.template_id === "string" && body.template_id.trim() ? body.template_id.trim() : null;
    if (template_id) {
      const prev = (await listReportTemplates(bq, location_id)).find((x) => x.template_id === template_id);
      if (!prev) return json({ ok: false, error: "Modèle introuvable sur ce site" }, 404);
      version = prev.version + 1;
    }
    const row = newReportTemplateRow({ location_id, author: w, nom: body.nom, sections: t.sections, periode_relative: t.periode_relative, indicateur: t.indicateur, source_document_id: document_id, template_id, version });
    await writeReportTemplate(bq, row);
    return json({ ok: true, template_id: row.template_id, version: row.version, nom: row.nom, periode_relative: row.periode_relative, periode_par_defaut: t.periode_par_defaut, sections_fr: t.sections.map((s) => SECTION_BY_CLE[s.cle].titre) });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/^modèle : /.test(msg)) return json({ ok: false, error: msg }, 400);
    console.error("[explorer/modeles] POST :", msg);
    return json({ ok: false, error: "Enregistrement du Modèle impossible" }, 500);
  }
};
