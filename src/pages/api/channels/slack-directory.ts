// Route: /api/channels/slack-directory — vue équipe inc 9b.
// GET ?location_id= (geste OWNER) : l'annuaire RÉEL du workspace Slack connecté — les
// canaux où le bot est membre (destinations possibles d'un pôle/dispositif) et les
// humains (pour poser l'identité Slack d'un membre). Nourrit LES DEUX sélecteurs de
// l'onglet Pôles et de Destinataires — plus aucun identifiant à copier à la main.
// Lecture seule ; scopes requis : channels:read (déjà là) + users:read (posé le 28/08).
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { loadChannelConfig } from "../../../lib/channels/internalSend";

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const userId = String((locals as any)?.clerk_user_id || "").trim();
    if (!userId) return json({ ok: false }, 401);
    const locationId = String(url.searchParams.get("location_id") || "").trim();
    if (!locationId) return json({ ok: false, error: "Missing location_id" }, 400);
    requireLocationOwnership(locals, locationId);

    const bq = makeBQClient(process.env.BQ_PROJECT_ID || "muse-square-open-data");
    const cfg: any = await loadChannelConfig(bq, userId, locationId, "slack");
    const token = String(cfg?.bot_token || "");
    if (!token.startsWith("xoxb-")) {
      return json({ ok: false, error: "Slack non connecté — connectez le workspace dans Communication." }, 400);
    }
    const call = async (method: string) => {
      const r = await fetch("https://slack.com/api/" + method, { headers: { authorization: "Bearer " + token } });
      return r.json().catch(() => null) as any;
    };
    // channels:read couvre les canaux PUBLICS ; les PRIVÉS (où vivront les pôles —
    // arbitrage 28/08) exigent groups:read : tentative gracieuse, l'erreur est remontée
    // telle quelle pour que la surface dise « ajoutez groups:read » au lieu de se taire.
    const [chansPub, chansPriv, users] = await Promise.all([
      call("conversations.list?types=public_channel&exclude_archived=true&limit=500"),
      call("conversations.list?types=private_channel&exclude_archived=true&limit=500"),
      call("users.list?limit=500"),
    ]);
    const toChan = (c: any) => ({ id: String(c.id), name: String(c.name || ""), is_private: c.is_private === true });
    const channels = [
      ...(chansPub?.ok ? chansPub.channels || [] : []),
      ...(chansPriv?.ok ? chansPriv.channels || [] : []),
    ].filter((c: any) => c.is_member === true).map(toChan);
    const chans = chansPub; // erreur publique = l'erreur principale
    const humans = (users?.ok ? users.members || [] : [])
      .filter((u: any) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT")
      .map((u: any) => ({
        id: String(u.id),
        name: String(u.profile?.display_name || u.real_name || u.name || ""),
        email: String(u.profile?.email || "") || null,
      }));
    return json({
      ok: true, channels, users: humans,
      // Erreurs de scope dites telles quelles (missing_scope = le repli email est éteint).
      channels_error: chans?.ok ? null : String(chans?.error || "erreur"),
      private_channels_error: chansPriv?.ok ? null : String(chansPriv?.error || "erreur"),
      users_error: users?.ok ? null : String(users?.error || "erreur"),
    });
  } catch (err: any) {
    const forbidden = /FORBIDDEN/.test(String(err?.message || ""));
    return json({ ok: false, error: err?.message || "Unknown error" }, forbidden ? 403 : 500);
  }
};
