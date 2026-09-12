// src/pages/api/explorer/envois.ts — L'ENVOI À CADENCE d'un Modèle de rapport (docs/explorer-outil-spec.md § 6.4, incrément 5).
//
//   GET  ?location_id=…                 → les envois programmés du site (dernière version de chacun, arrêtés compris), leurs
//                                          derniers envois (report_sends), et les destinataires que Muse Square connaît :
//                                          l'utilisateur (son email Clerk) et les membres de l'équipe qui ont un email
//                                          (analytics.team_members.channels_contact — le même annuaire que les consignes).
//   POST { location_id, modele_id, cadence, jour?, heure?, canal, destinataires }  → « Envoyer chaque … » : un envoi
//        programmé (version 1). `schedule_id` + `actif: false` → « Arrêter » (version suivante, actif = false).
//   POST { location_id, modele_id, canal, destinataires, maintenant: true }  → « Envoyer maintenant » : le Modèle composé
//        sur la période de la cadence donnée (défaut : la semaine dernière), envoyé tout de suite, tracé sans schedule_id.
// Auth, bypass dev et CORS : les mêmes que explorer/rapports.ts. Lib : src/lib/rapport/envois.ts.
import type { APIRoute } from "astro";
import { createClerkClient } from "@clerk/clerk-sdk-node";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationAccess } from "../../../lib/requireLocationOwnership";
import { rateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { cadenceFr, ensureTables, envoyerRapport, lireModele, listSchedules, listSends, newScheduleRow, periodeDeCadence, writeSchedule, type Cadence, type Canal } from "../../../lib/rapport/envois";

export const prerender = false;
const BQ_PROJECT = "muse-square-open-data";
const DEV_BYPASS = import.meta.env.DEV && process.env.MS_AUTH_BYPASS === "1";
const BASE_URL = process.env.APP_BASE_URL || "https://www.musesquare.com";

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

/** L'email de l'utilisateur, chez Clerk (le geste de profile/save.ts) ; null sous le bypass dev ou sans clé. */
async function emailClerk(user_id: string): Promise<string | null> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || !/^user_/.test(user_id)) return null;
  try {
    const u = await createClerkClient({ secretKey }).users.getUser(user_id);
    return (u.primaryEmailAddressId && u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress) || u.emailAddresses?.[0]?.emailAddress || null;
  } catch { return null; }
}

/** Les membres de l'équipe qui ont un email — le roster du compte, « site d'abord, sinon compte » (channels/team.ts). */
async function contactsEquipe(bq: any, user_id: string, location_id: string): Promise<Array<{ nom: string; email: string }>> {
  const [rows] = await bq.query({
    query: `SELECT first_name, last_name, channels_contact
            FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY (location_id = @location_id) DESC, updated_at DESC) AS rn
                  FROM \`${BQ_PROJECT}.analytics.team_members\` WHERE user_id = @user_id)
            WHERE rn = 1 AND COALESCE(status, 'active') = 'active' ORDER BY first_name`,
    params: { user_id, location_id }, location: "EU",
  }).catch(() => [[]]);
  const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
  const out: Array<{ nom: string; email: string }> = [];
  for (const r of rows as any[]) {
    let email = "";
    try { email = String(JSON.parse(String(flat(r.channels_contact) || "{}")).email || "").trim(); } catch { email = ""; }
    if (!email.includes("@")) continue;
    out.push({ nom: `${String(flat(r.first_name) || "")} ${String(flat(r.last_name) || "")}`.trim() || email, email: email.toLowerCase() });
  }
  return out;
}

export const OPTIONS: APIRoute = async () =>
  DEV_BYPASS ? new Response(null, { status: 204, headers: corsHeaders() }) : new Response(null, { status: 404 });

export const GET: APIRoute = async ({ url, locals }) => {
  const location_id = String(url.searchParams.get("location_id") || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, url.searchParams.get("dev_user_id"));
  if (w instanceof Response) return w;
  const bq = makeBQClient(BQ_PROJECT);
  try {
    const [envois, derniers, moi, equipe] = await Promise.all([listSchedules(bq, location_id), listSends(bq, location_id), emailClerk(w.user_id), contactsEquipe(bq, w.user_id, location_id)]);
    return json({
      ok: true, location_id,
      envois: envois.map((s) => ({ ...s, cadence_fr: cadenceFr(s), derniers: derniers.filter((d) => d.schedule_id === s.schedule_id).slice(0, 5) })),
      ponctuels: derniers.filter((d) => d.schedule_id == null).slice(0, 5),
      contacts: { moi, equipe },
    });
  } catch (e: any) {
    console.error("[explorer/envois] GET :", e?.message || e);
    return json({ ok: false, error: "Lecture des envois impossible" }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "Champs requis manquants" }, 400);
  const location_id = String(body.location_id || (locals as any)?.location_id || "").trim();
  if (!location_id) return json({ ok: false, error: "location_id requis" }, 400);
  const w = who(locals, location_id, body.dev_user_id);
  if (w instanceof Response) return w;
  if (!rateLimit(w.user_id, "explorer-envois", 20, 60_000)) return rateLimitResponse();
  const bq = makeBQClient(BQ_PROJECT);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  try {
    // « Arrêter » : la version suivante, actif = false (append-only, rien ne s'efface).
    if (typeof body.schedule_id === "string" && body.actif === false) {
      const prev = (await listSchedules(bq, location_id)).find((s) => s.schedule_id === body.schedule_id);
      if (!prev) return json({ ok: false, error: "Envoi introuvable sur ce site" }, 404);
      const row = newScheduleRow({ location_id, author: w, modele_id: prev.modele_id, modele_nom: prev.modele_nom, cadence: prev.cadence, jour: prev.jour, heure: prev.heure, canal: prev.canal, destinataires: prev.destinataires, schedule_id: prev.schedule_id, version: prev.version + 1, actif: false });
      await writeSchedule(bq, row);
      return json({ ok: true, schedule_id: row.schedule_id, version: row.version, actif: false });
    }
    const modele_id = String(body.modele_id || "").trim();
    if (!modele_id) return json({ ok: false, error: "modele_id requis" }, 400);
    const modele = await lireModele(bq, location_id, modele_id);
    if (!modele) return json({ ok: false, error: "Modèle introuvable sur ce site" }, 404);
    const canal = (String(body.canal || "email") as Canal);
    // « Envoyer maintenant » : composé et envoyé tout de suite, sur la période de la cadence donnée (la semaine dernière par défaut).
    if (body.maintenant === true) {
      const probe = newScheduleRow({ location_id, author: w, modele_id, modele_nom: modele.nom, cadence: body.cadence || "hebdomadaire", jour: body.jour, heure: body.heure, canal, destinataires: body.destinataires });
      const periode = periodeDeCadence(probe.cadence as Cadence, today);
      const r = await envoyerRapport(bq, { location_id, author: w, modele_id, canal, destinataires: JSON.parse(probe.destinataires_json), periode, schedule_id: null, today, base_url: BASE_URL });
      return json({ ok: r.ok, document_id: r.document_id, envoyes: r.envoyes, echecs: r.echecs, raison: r.raison, periode_fr: periode.libelle_fr }, r.ok || r.raison.startsWith("sans matière") ? 200 : 502);
    }
    const row = newScheduleRow({ location_id, author: w, modele_id, modele_nom: modele.nom, cadence: body.cadence, jour: body.jour, heure: body.heure, canal, destinataires: body.destinataires });
    await ensureTables(bq);
    await writeSchedule(bq, row);
    return json({ ok: true, schedule_id: row.schedule_id, version: row.version, cadence_fr: cadenceFr(row), destinataires: JSON.parse(row.destinataires_json) });
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (/^envoi : /.test(msg)) return json({ ok: false, error: msg }, 400);
    console.error("[explorer/envois] POST :", msg);
    return json({ ok: false, error: "Enregistrement de l'envoi impossible" }, 500);
  }
};
