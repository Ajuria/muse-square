import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  return new Response(
    JSON.stringify({
      ok: true,
      locals_type: typeof locals,
      locals_keys: locals ? Object.keys(locals as any) : null,
      locals: locals ?? null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};
