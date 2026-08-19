// src/pages/api/admin/invite.ts — P3.1-a (onboarding sur invitation, GO owner 18/08).
// L'écriteau « Accès sur invitation » de sign-up.astro devient un MÉCANISME : l'owner (garde
// isAdmin, même motif que admin-dashboard) crée une invitation Clerk — Clerk envoie l'email et,
// l'instance passée en Restricted (GESTE OWNER au Dashboard), seul l'invité peut s'inscrire.
// Les métadonnées (activité pressentie, caisse pressentie) suivent l'invité : le profil les
// pré-remplira (P3.1-b) et le routage d'import s'en servira (P3.1-c).
// POST { email, activity_hint?, pos_hint? } → crée ; POST { revoke_id } → révoque ;
// GET → liste des invitations en attente (l'UI admin s'en nourrit).
import type { APIRoute } from "astro";
// Client backend EXPLICITE (clé secrète) : indépendant du runtime Astro — le même code
// tourne en prod et sous le harnais d'invocation directe (clerkClient(context) exigeait
// l'env Astro et mourait hors runtime).
import { createClerkClient } from "@clerk/backend";

const clerk = () => createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY || "" });
import { isAdmin } from "../../../lib/admins";
import { INDUSTRY_LABEL } from "../../../lib/competitive/constants";
import { PROFILE_AUDIENCE_OPTIONS } from "../../../lib/profileLabels";
// P3.1-c : la demande de fichier part À L'INVITATION (le goulot mesuré est humain — J+9 chez
// Les Olivades pour obtenir le fichier ; on le demande donc au plus tôt). Rail Resend interne,
// réponses routées vers l'inviteur (reply_to). Consigne d'export par caisse pressentie
// (analytics.pos_systems, repli « autre »). Échec d'envoi = non bloquant, dit dans la réponse.
import { sendEmail } from "../../../lib/channels/internalSend";
import { makeBQClient } from "../../../lib/bq";

async function fileRequestNote(pos_hint: string | null): Promise<{ label: string | null; note: string }> {
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
    if (hit && hit.export_note_fr) return { label: String(hit.label_fr), note: String(hit.export_note_fr) };
    const autre = list.find((r) => String(r.pos_key) === "autre");
    return { label: null, note: autre && autre.export_note_fr ? String(autre.export_note_fr) : FALLBACK };
  } catch (_) {
    return { label: null, note: FALLBACK };
  }
}

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

    const inv = await clerk().invitations.createInvitation({
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
      },
      // L'invité atterrit sur le sign-up de l'app (le lien Clerk porte son ticket).
      redirectUrl: `${process.env.APP_BASE_URL || "https://www.musesquare.com"}/sign-up`,
      notify: true,
    });

    // Demande de fichier de ventes, envoyée dans la foulée de l'invitation.
    let file_request_email = "not_sent";
    try {
      const [{ label, note }, inviter] = await Promise.all([
        fileRequestNote(pos_hint),
        clerk().users.getUser(adminId).catch(() => null),
      ]);
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
      file_request_email = `not_sent: ${e?.message || "erreur"}`;
    }

    return json(200, { ok: true, invitation: { id: inv.id, email: inv.emailAddress, status: inv.status }, file_request_email });
  } catch (err: any) {
    // Clerk renvoie des erreurs typées (déjà invité, déjà inscrit…) — les remonter lisibles.
    return json(400, { ok: false, error: err?.errors?.[0]?.message || err?.message || "Erreur Clerk" });
  }
};
