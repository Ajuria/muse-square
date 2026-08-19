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

    const inv = await clerk().invitations.createInvitation({
      emailAddress: email,
      publicMetadata: { invited_by: adminId, ...(activity_hint ? { activity_hint } : {}), ...(pos_hint ? { pos_hint } : {}) },
      // L'invité atterrit sur le sign-up de l'app (le lien Clerk porte son ticket).
      redirectUrl: `${process.env.APP_BASE_URL || "https://www.musesquare.com"}/sign-up`,
      notify: true,
    });
    return json(200, { ok: true, invitation: { id: inv.id, email: inv.emailAddress, status: inv.status } });
  } catch (err: any) {
    // Clerk renvoie des erreurs typées (déjà invité, déjà inscrit…) — les remonter lisibles.
    return json(400, { ok: false, error: err?.errors?.[0]?.message || err?.message || "Erreur Clerk" });
  }
};
