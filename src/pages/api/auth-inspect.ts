import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  return new Response(
    JSON.stringify(
      {
        locals_keys: locals ? Object.keys(locals as any) : [],
        auth: (locals as any)?.auth ?? null,
        clerk: (locals as any)?.clerk ?? null,
        userId:
          (locals as any)?.auth?.userId ??
          (locals as any)?.clerk?.userId ??
          null,
      },
      null,
      2
    ),
    { headers: { "content-type": "application/json" } }
  );
};
