// src/pages/api/explorer/rapports.ts — LES RAPPORTS ENREGISTRÉS d'un site (docs/explorer-outil-spec.md § 6.1, incrément 2).
//
//   GET  ?location_id=…[&document_id=…[&version=N | &versions=1]]  → la liste (dernière version de chaque Rapport), un
//        Rapport (dernière version ou version N), ou l'historique des versions d'un Rapport.
//   POST { location_id, rapport, document_id? }   → « Enregistrer » : une version de plus (append-only), la première
//        pour un document nouveau. Le corps est le bloc `rapport` tel que /api/explorer/agent l'a rendu (Synthèse comprise).
//   POST { location_id, document_id, geste, … }   → un GESTE sur le document (spec § 6.2, incrément 3) : `deplacer`
//        { section, vers } · `retirer` { section } · `dupliquer` { section } · `note` { section, texte } · `retirer_note`
//        { section, note } · `actualiser` {} — le document est relu, le geste appliqué (lib/rapport/gestes.ts, pur), la
//        version suivante écrite ; la réponse porte le document. Approfondir passe par /api/explorer/agent (la boucle).
// Auth : Clerk, requireLocationAccess (owner ou membre du site) ; en `astro dev` avec MS_AUTH_BYPASS=1, le proto
// (4173) l'appelle — CORS ouvert en dev seulement, le geste d'agent.ts. Lib : src/lib/rapport/documents.ts.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { isRapportBlock, listReportDocuments, listReportVersions, newReportDocumentRow, readReportDocument, writeReportDocument } from "../../../lib/rapport/documents";
import { actualiserDocument, ajouterNote, deplacerSection, dupliquerSection, modifierSynthese, retirerNote, retirerSection, sujetDeNote } from "../../../lib/rapport/gestes";
import { writeSiteMemory, newSiteMemoryRow, normalizeBody } from "../../../lib/explorer/siteMemory";
import type { RapportBlock } from "../../../lib/explorer/blocks";

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
  // Sans location_id (la page ouverte depuis le menu), le site actif de la session — comme insight/sales-report.
  const location_id = String(url.searchParams.get("location_id") || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, url.searchParams.get("dev_user_id"));
  if (w instanceof Response) return w;
  const bq = makeBQClient(BQ_PROJECT);
  try {
    const document_id = String(url.searchParams.get("document_id") || "").trim();
    if (document_id) {
      // 12/09 (owner : montrer l'historique) — `&versions=1` liste les versions ; `&version=N` lit une version précise.
      if (url.searchParams.get("versions") === "1") return json({ ok: true, versions: await listReportVersions(bq, location_id, document_id) });
      const version = Number(url.searchParams.get("version") || 0) || null;
      const doc = await readReportDocument(bq, location_id, document_id, version);
      return doc ? json({ ok: true, document: doc }) : json({ ok: false, error: "Rapport introuvable" }, 404);
    }
    const documents = await listReportDocuments(bq, location_id);
    // La liste ne porte pas les blocs (légère) : le titre, la période, la version, la date — le document se lit par id.
    return json({ ok: true, location_id, documents: documents.map(({ rapport, ...d }) => ({ ...d, n_sections: rapport.sections.length })) });
  } catch (e: any) {
    console.error("[explorer/rapports] GET :", e?.message || e);
    return json({ ok: false, error: "Lecture des Rapports impossible" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
  const location_id = String(body.location_id || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, body.dev_user_id);
  if (w instanceof Response) return w;
  if (!rateLimit(w.user_id, "explorer-rapports", 30, 60_000)) return rateLimitResponse();
  const bq = makeBQClient(BQ_PROJECT);
  if (typeof body.geste === "string") return geste(bq, locals, location_id, w, body);
  if (!isRapportBlock(body.rapport)) return json({ ok: false, error: "rapport : le document n'a pas la forme d'un Rapport" }, 400);
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

// ── Les gestes sur le document (spec § 6.2) ─────────────────────────────────────────────────────────
const GESTES = new Set(["deplacer", "retirer", "dupliquer", "note", "retirer_note", "synthese", "actualiser"]);

async function geste(bq: any, locals: any, location_id: string, w: { user_id: string; role: "owner" | "member" }, body: any): Promise<Response> {
  const document_id = String(body.document_id || "").trim();
  if (!document_id) return json({ ok: false, error: "document_id requis" }, 400);
  if (!GESTES.has(body.geste)) return json({ ok: false, error: "geste inconnu" }, 400);
  try {
    const prev = await readReportDocument(bq, location_id, document_id);
    if (!prev) return json({ ok: false, error: "Rapport introuvable sur ce site" }, 404);
    const i = Number(body.section);
    let out: RapportBlock | { erreur: string };
    switch (body.geste) {
      case "deplacer": out = deplacerSection(prev.rapport, i, Number(body.vers)); break;
      case "retirer": out = retirerSection(prev.rapport, i); break;
      case "dupliquer": out = dupliquerSection(prev.rapport, i); break;
      case "note": out = ajouterNote(prev.rapport, i, body.texte, typeof body.auteur === "string" ? body.auteur : null); break;
      case "retirer_note": out = retirerNote(prev.rapport, i, Number(body.note)); break;
      case "synthese": out = modifierSynthese(prev.rapport, body.texte, typeof body.auteur === "string" ? body.auteur : null); break;
      default: {
        const owned: string[] = Array.isArray(locals?.all_location_ids) ? locals.all_location_ids.map(String) : [location_id];
        out = await actualiserDocument(bq, location_id, owned, prev.rapport, new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
      }
    }
    if ("erreur" in out) return json({ ok: false, error: out.erreur }, 400);
    const row = newReportDocumentRow({ location_id, author: w, rapport: out, document_id, version: prev.version + 1, modele_id: prev.modele_id });
    await writeReportDocument(bq, row);

    // 14/09 (owner : « peut permettre à l'app d'apprendre beaucoup de choses sur le business du user » ;
    // spec § 4 n2, owner 12/09 : les notes sont des éléments de contexte). LA NOTE REJOINT LA MÉMOIRE DU
    // SITE. Mesuré le 14/09 avant ce commit : 4 versions de rapport portaient une note, et la mémoire du
    // site ne comptait que 2 lignes, toutes venues du chat — les deux rails ne se parlaient pas, et une
    // note écrite n'était relue par personne.
    //
    // ELLE N'EST PAS DÉPLACÉE, ELLE EST COPIÉE : la note appartient au Rapport (elle s'imprime avec lui,
    // elle se versionne avec lui) ET à la mémoire (l'agent l'y relira). Provenance « note_rapport » : ni
    // une déclaration chiffrée, ni un fait d'outil — un constat de terrain, que l'agent doit pondérer
    // pour ce qu'il est.
    //
    // L'ÉCHEC N'ANNULE JAMAIS LE GESTE : la note est déjà enregistrée dans le document ci-dessus. Perdre
    // le geste parce que la mémoire n'a pas pris serait pire que perdre la mémoire. Mais il se DIT — un
    // `memoire: false` dans la réponse, et une trace serveur ; une écriture qui échoue en silence est ce
    // qui laisse croire pendant des semaines que l'app apprend.
    let memoire: boolean | null = null;
    if (body.geste === "note") {
      memoire = false;
      try {
        const sujet = sujetDeNote(out.sections?.[i]?.titre, out.periode?.libelle_fr);
        const texte = normalizeBody(body.texte);
        if (sujet && texte) {
          await writeSiteMemory(bq, newSiteMemoryRow({
            location_id, subject: sujet, body: texte,
            author_user_id: w.user_id, author_role: w.role, source: "note_rapport",
          }));
          memoire = true;
        }
      } catch (e: any) {
        console.error("[explorer/rapports] note → mémoire :", String(e?.message || e));
      }
    }
    return json({ ok: true, document_id, version: row.version, ...(memoire === null ? {} : { memoire }), document: { ...prev, version: row.version, author_user_id: row.author_user_id, author_role: row.author_role, titre: row.titre, periode_du: row.periode_du, periode_au: row.periode_au, periode_relative: row.periode_relative, created_at: row.created_at, rapport: out } });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/^rapport : /.test(msg)) return json({ ok: false, error: msg }, 400);
    console.error("[explorer/rapports] geste :", msg);
    return json({ ok: false, error: "Geste impossible" }, 500);
  }
}
