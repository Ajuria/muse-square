import type { APIRoute } from "astro";
import { clerkClient } from "@clerk/astro/server";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const clerk_user_id = (context.locals as any)?.clerk_user_id;

  if (!clerk_user_id) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), { status: 401 });
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corps de requête invalide." }), { status: 400 });
  }

  const { current_password, new_password } = body;

  if (!current_password || !new_password) {
    return new Response(JSON.stringify({ error: "Champs manquants." }), { status: 400 });
  }

  if (new_password.length < 8) {
    return new Response(JSON.stringify({ error: "Le mot de passe doit contenir au moins 8 caractères." }), { status: 400 });
  }

  try {
    await clerkClient(context).users.updateUser(clerk_user_id, {
      password: new_password,
      currentPassword: current_password,
    } as any);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    const msg = e?.errors?.[0]?.longMessage || e?.message || "Erreur lors du changement de mot de passe.";
    return new Response(JSON.stringify({ error: msg }), { status: 400 });
  }
};