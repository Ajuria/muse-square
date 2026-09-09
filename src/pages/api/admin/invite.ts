// src/pages/api/admin/invite.ts — P3.1-a (onboarding sur invitation, GO owner 18/08).
// L'écriteau « Accès sur invitation » de sign-up.astro devient un MÉCANISME : l'owner (garde
// isAdmin, même motif que admin-dashboard) crée une invitation Clerk — Clerk envoie l'email et,
// l'instance passée en Restricted (GESTE OWNER au Dashboard), seul l'invité peut s'inscrire.
// Les métadonnées (activité pressentie, caisse pressentie) suivent l'invité : le profil les
// pré-remplira (P3.1-b) et le routage d'import s'en servira (P3.1-c).
// ── PRÉPARER n'est pas INVITER (owner 09/09, dit deux fois) ────────────────────────────────────
// « Je ne ferai l'invitation que quand tout est prêt » — vaut pour TOUS les premiers clients. Le
// pré-provisionnement était soudé à l'invitation : un clic créait la ligne profil ET envoyait deux
// emails au client (invitation Clerk `notify: true` + demande d'export). Les deux gestes sont
// SÉPARÉS depuis le 09/09 :
//   POST { provision_only: true, … }        → prépare TOUT, ne contacte PERSONNE. Rend la clé
//                                             d'attente `invite:<uuid>` et le location_id.
//   POST { email, provision_key?, … }       → invite. Avec une clé préparée, elle est REPRISE
//                                             (aucune seconde ligne profil) ; sans elle, geste
//                                             historique inchangé (prépare + invite d'un coup).
//   GET ?prepared=1                         → les comptes préparés et pas encore invités, avec
//                                             leur clé — la préparation survit au rechargement.
// POST { revoke_id } → révoque ; GET → invitations Clerk en attente.
import type { APIRoute } from "astro";
// Client backend EXPLICITE (clé secrète) : indépendant du runtime Astro — le même code
// tourne en prod et sous le harnais d'invocation directe (clerkClient(context) exigeait
// l'env Astro et mourait hors runtime).
import { createClerkClient } from "@clerk/backend";

const clerk = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY || "" });
import { isAdmin } from "../../../lib/admins";
import { INDUSTRY_LABEL } from "../../../lib/competitive/constants";
import { PROFILE_AUDIENCE_OPTIONS } from "../../../lib/profile/profileLabels";
// P3.1-c : la demande de fichier part À L'INVITATION (le goulot mesuré est humain — J+9 chez
// Les Olivades pour obtenir le fichier ; on le demande donc au plus tôt). Rail Resend interne,
// réponses routées vers l'inviteur (reply_to). Consigne d'export par caisse pressentie
// (analytics.pos_systems, repli « autre »). Échec d'envoi = non bloquant, dit dans la réponse.
import { sendEmail } from "../../../lib/channels/internalSend";
import { makeBQClient } from "../../../lib/bq";
// C3 : pré-provisionnement — la ligne profil est créée À L'INVITATION via le VRAI save.ts
// (couture provision_identity : identité injectée, clerk_user_id = clé en attente
// « invite:<uuid> »). Géocodage, sync dim_client_location et chaîne dbt partent à J0 ;
// l'invité réclame la ligne au premier login (lib onboardingClaim, appelée par profile.astro).
import { randomUUID } from "crypto";
import { POST as saveProfilePOST } from "../profile/save";

async function fileRequestNote(pos_hint: string | null): Promise<{ pos_key: string | null; label: string | null; note: string }> {
  const FALLBACK = "Tout export CSV des ventes convient — une ligne par article vendu, 12 mois si possible.";
  try {
    const bq = makeBQClient("muse-square-open-data");
    const hint = (pos_hint || "").trim().toLowerCase();
    const [rows] = await bq.query({
      query: `SELECT pos_key, label_fr, export_note_fr FROM \`muse-square-open-data.analytics.pos_systems\` WHERE active`,
      location: "EU",
    });
    const list: any[] = Array.isArray(rows) ? rows : [];
    const hit = hint
      ? list.find((r) => String(r.pos_key).toLowerCase() === hint || String(r.label_fr).toLowerCase() === hint)
      : null;
    if (hit && hit.export_note_fr) return { pos_key: String(hit.pos_key), label: String(hit.label_fr), note: String(hit.export_note_fr) };
    const autre = list.find((r) => String(r.pos_key) === "autre");
    return { pos_key: null, label: null, note: autre && autre.export_note_fr ? String(autre.export_note_fr) : FALLBACK };
  } catch (_) {
    return { pos_key: null, label: null, note: FALLBACK };
  }
}

// Couverture événements au point géocodé — mesurée à l'invitation, montrée à l'owner :
// zéro = base pauvre (cas Houdan, mesuré), il saura pré-choisir des concurrents suivis (C4).
// 15 km / 30 j = la fenêtre de l'audit de couverture ; comptage DISTINCT event_uid.
async function eventCoverage(lat: number, lon: number): Promise<number | null> {
  try {
    const bq = makeBQClient("muse-square-open-data");
    const [rows] = await bq.query({
      query: `SELECT COUNT(DISTINCT event_uid) AS n
              FROM \`muse-square-open-data.intermediate.int_events_event_daily_enriched\`
              WHERE date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY)
                AND geo_point IS NOT NULL
                AND ST_DWITHIN(geo_point, ST_GEOGPOINT(@lon, @lat), 15000)`,
      params: { lat, lon },
      types: { lat: "FLOAT64", lon: "FLOAT64" },
      location: "EU",
    });
    const n: any = (rows as any[])[0]?.n;
    return Number(n && typeof n === "object" && "value" in n ? n.value : n);
  } catch (_) {
    return null;
  }
}

// Sortie douce du bloc email pendant une préparation — jamais une erreur remontée à l'admin.
class SkipEmail extends Error {}

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const gate = (locals: any): string | null => {
  const userId = locals?.real_clerk_user_id || locals?.clerk_user_id;
  return isAdmin(userId) ? String(userId) : null;
};

export const GET: APIRoute = async (context) => {
  try {
    if (!gate(context.locals)) return json(403, { ok: false, error: "Forbidden" });
    // Comptes PRÉPARÉS et pas encore invités : la clé d'attente est la marque (`invite:<uuid>` ne
    // peut pas être un id Clerk réel — même garde que claimProvisionedProfile). Sans cette liste,
    // une préparation perdue au rechargement de page obligerait à tout refaire.
    if (new URL(context.request.url).searchParams.get("prepared") === "1") {
      const bq = makeBQClient("muse-square-open-data");
      const [rows] = await bq.query({
        query: `SELECT clerk_user_id AS provision_key, location_id, site_name, company_name, email,
                       pos_system, company_address, created_at
                FROM \`muse-square-open-data.raw.insight_event_user_location_profile\`
                WHERE STARTS_WITH(clerk_user_id, 'invite:')
                ORDER BY created_at DESC LIMIT 50`,
        location: "EU",
      });
      const flat = (v: any) => (v && typeof v === "object" && "value" in v ? v.value : v);
      return json(200, {
        ok: true,
        prepared: (rows as any[]).map((r) => ({
          provision_key: String(flat(r.provision_key)),
          location_id: String(flat(r.location_id)),
          name: String(flat(r.site_name) || flat(r.company_name) || ""),
          email: r.email != null ? String(flat(r.email)) : null,
          pos_system: r.pos_system != null ? String(flat(r.pos_system)) : null,
          created_at: r.created_at != null ? String(flat(r.created_at)) : null,
        })),
      });
    }
    const list = await clerk().invitations.getInvitationList({ status: "pending" });
    return json(200, {
      ok: true,
      invitations: (list.data || []).map((i: any) => ({
        id: i.id, email: i.emailAddress, status: i.status,
        created_at: i.createdAt, metadata: i.publicMetadata || {},
      })),
    });
  } catch (err: any) {
    return json(500, { ok: false, error: err?.errors?.[0]?.message || err?.message || "Erreur Clerk" });
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const adminId = gate(context.locals);
    if (!adminId) return json(403, { ok: false, error: "Forbidden" });
    const body = await context.request.json().catch(() => ({}));

    // Révocation (l'invitation en attente s'annule — l'email déjà parti devient inerte).
    if (body?.revoke_id) {
      await clerk().invitations.revokeInvitation(String(body.revoke_id));
      return json(200, { ok: true, revoked: String(body.revoke_id) });
    }

    const email = String(body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { ok: false, error: "Email invalide" });
    const activity_hint = body?.activity_hint ? String(body.activity_hint).trim().slice(0, 80) : null;
    const pos_hint = body?.pos_hint ? String(body.pos_hint).trim().slice(0, 80) : null;

    // ── C2 : champs structurés du profil, posés par l'owner qui CONNAÎT l'invité. ──
    // Enums validés contre les SST du formulaire profil (INDUSTRY_LABEL, PROFILE_AUDIENCE_OPTIONS)
    // — un enum inconnu est une ERREUR lisible, jamais stocké tel quel. Tout est facultatif.
    const site_name = body?.site_name ? String(body.site_name).trim().slice(0, 120) : null;
    const company_address = body?.company_address ? String(body.company_address).trim().slice(0, 240) : null;
    const activity = body?.activity ? String(body.activity).trim() : null;
    if (activity && !INDUSTRY_LABEL[activity]) {
      return json(400, { ok: false, error: `Secteur inconnu : ${activity}` });
    }
    const audienceKeys = PROFILE_AUDIENCE_OPTIONS.map((o) => o.value);
    const audience_1 = body?.audience_1 ? String(body.audience_1).trim() : null;
    const audience_2 = body?.audience_2 ? String(body.audience_2).trim() : null;
    for (const a of [audience_1, audience_2]) {
      if (a && !audienceKeys.includes(a)) return json(400, { ok: false, error: `Public inconnu : ${a}` });
    }
    let website_url: string | null = null;
    if (body?.website_url) {
      const raw = String(body.website_url).trim().slice(0, 240);
      try {
        const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("proto");
        website_url = u.toString();
      } catch {
        return json(400, { ok: false, error: "Site web invalide" });
      }
    }

    // C3 : la clé en attente n'existe que si on peut provisionner (adresse fournie).
    // Générée AVANT l'invitation pour voyager dans ses métadonnées (Clerk les recopie sur
    // l'utilisateur à l'inscription — c'est le fil que la réclamation suivra).
    // 09/09 : une clé DÉJÀ PRÉPARÉE est reprise telle quelle — c'est ce qui permet d'inviter des
    // jours après avoir préparé, sans créer une seconde ligne profil orpheline.
    const reused_key = typeof body?.provision_key === "string" && /^invite:[0-9a-f-]{36}$/.test(body.provision_key.trim())
      ? body.provision_key.trim() : null;
    const provision_only = body?.provision_only === true;
    if (provision_only && !company_address) {
      return json(400, { ok: false, error: "Préparer un compte demande l'adresse professionnelle — c'est elle qui géocode le site." });
    }
    if (provision_only && reused_key) {
      return json(400, { ok: false, error: "Ce compte est déjà préparé — invitez-le, ou préparez-en un autre." });
    }
    const provision_key = reused_key || (company_address ? `invite:${randomUUID()}` : null);

    // PRÉPARATION : rien ne part. Le provisionnement tourne plus bas comme d'habitude ; ni
    // invitation Clerk, ni demande d'export. C'est le geste par défaut d'un premier client.
    const inv: { id: string | null; emailAddress: string; status: string } = provision_only
      ? { id: null, emailAddress: email, status: "prepared" }
      : await clerk().invitations.createInvitation({
      emailAddress: email,
      publicMetadata: {
        invited_by: adminId,
        ...(activity_hint ? { activity_hint } : {}),
        ...(pos_hint ? { pos_hint } : {}),
        ...(site_name ? { site_name } : {}),
        ...(company_address ? { company_address } : {}),
        ...(activity ? { activity } : {}),
        ...(website_url ? { website_url } : {}),
        ...(audience_1 ? { audience_1 } : {}),
        ...(audience_2 ? { audience_2 } : {}),
        ...(provision_key ? { provision_key } : {}),
      },
      // L'invité atterrit sur le sign-up de l'app (le lien Clerk porte son ticket).
      redirectUrl: `${process.env.APP_BASE_URL || "https://www.musesquare.com"}/sign-up`,
      notify: true,
    });

    // ── C3 : pré-provisionnement du profil (non bloquant — l'invitation est déjà partie). ──
    // Le VRAI save.ts en mode create : géocodage BAN, MERGE profil, sync dim_client_location,
    // chaîne dbt J0 (isNewAccount) — exactement le chemin d'une inscription, identité injectée.
    // Une seule résolution de caisse — partagée entre le provisionnement et l'email de demande.
    const posInfo = await fileRequestNote(pos_hint);
    // Une clé REPRISE = la ligne profil existe déjà : la re-provisionner écraserait le travail
    // fait entre la préparation et l'invitation (concurrents suivis, pôles, photos).
    let provision: any = reused_key ? { reused: true, provision_key: reused_key } : null;
    if (provision_key && company_address && !reused_key) {
      try {
        const pos_key = posInfo.pos_key;
        const req = new Request("http://internal/api/profile/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "create",
            company_address,
            ...(site_name ? { site_name, company_name: site_name } : {}),
            ...(activity ? { company_activity_type: activity } : {}),
            ...(website_url ? { website_url } : {}),
            ...(pos_key ? { pos_system: pos_key } : {}),
            primary_audience_1: [audience_1, audience_2].filter(Boolean),
          }),
        });
        const res = await (saveProfilePOST as any)({
          request: req,
          locals: { clerk_user_id: provision_key, provision_identity: { email, firstName: null, lastName: null } },
        });
        const out = await res.json().catch(() => null);
        if (res.status === 200 && out?.ok) {
          const lat = out.saved?.company_lat ?? null;
          const lon = out.saved?.company_lon ?? null;
          provision = {
            location_id: out.location_id,
            geocode_status: out.saved?.company_geocode_status ?? null,
            events_within_15km_30d: lat != null && lon != null ? await eventCoverage(Number(lat), Number(lon)) : null,
          };
        } else {
          provision = { error: out?.error || `save.ts a répondu ${res.status}` };
        }
      } catch (e: any) {
        provision = { error: e?.message || "provisionnement impossible" };
      }
    }

    // Demande de fichier de ventes, envoyée dans la foulée de l'invitation — et JAMAIS pendant une
    // préparation : préparer ne contacte personne (owner 09/09).
    let file_request_email = provision_only ? "not_sent: préparation" : "not_sent";
    try {
      if (provision_only) throw new SkipEmail();
      const { label, note } = posInfo;
      const inviter = await clerk().users.getUser(adminId).catch(() => null);
      const inviterEmail =
        (inviter && (inviter.emailAddresses?.find((e: any) => e.id === inviter.primaryEmailAddressId)?.emailAddress
          || inviter.emailAddresses?.[0]?.emailAddress)) || null;
      const body = [
        "Bonjour,",
        "",
        "Votre invitation Muse Square vient de partir (email séparé).",
        "",
        "Pour que vos premières analyses tombent dès votre inscription, préparez dès maintenant votre export de ventes" + (label ? ` (${label})` : "") + " :",
        note,
        "",
        "Répondez à cet email avec le fichier, ou déposez-le dans l'app (page Explorer) une fois connecté.",
        "",
        "— Muse Square",
      ].join("\n");
      const sent = await sendEmail({}, {
        title: "Muse Square — préparez votre fichier de ventes",
        body,
        recipient: email,
        ...(inviterEmail ? { reply_to: inviterEmail } : {}),
      });
      file_request_email = sent.ok ? "sent" : `not_sent: ${sent.error || "erreur"}`;
    } catch (e: any) {
      if (!(e instanceof SkipEmail)) file_request_email = `not_sent: ${e?.message || "erreur"}`;
    }

    return json(200, {
      ok: true,
      mode: provision_only ? "prepared" : "invited",
      invitation: { id: inv.id, email: inv.emailAddress, status: inv.status },
      provision_key,
      file_request_email,
      provision,
    });
  } catch (err: any) {
    // Clerk renvoie des erreurs typées (déjà invité, déjà inscrit…) — les remonter lisibles.
    return json(400, { ok: false, error: err?.errors?.[0]?.message || err?.message || "Erreur Clerk" });
  }
};
