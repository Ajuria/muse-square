// /api/build — QUELLE VERSION LE SERVEUR SERT, en un objet minuscule (owner 14/09).
//
// POURQUOI. Quatre essais de l'owner ont eu lieu sur un écran PÉRIMÉ : son téléphone rejouait une
// page d'avant (restauration d'onglet, application ajoutée à l'écran d'accueil, cache HTTP posé
// avant que `no-store` existe). Impossible à distinguer d'un défaut de code — j'ai cherché dans du
// code qu'il n'exécutait pas, il a perdu son temps quatre fois. `no-store` empêche les prochaines
// mises en cache ; il n'efface pas celles déjà posées. Cet endpoint permet à une page de SE
// comparer au serveur et de se recharger elle-même.
//
// Pas d'authentification : il ne rend qu'un identifiant de version publique, celui que la page
// affiche déjà à l'écran.
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const build = String(process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7);
  return new Response(JSON.stringify({ ok: true, build }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, must-revalidate" },
  });
};
