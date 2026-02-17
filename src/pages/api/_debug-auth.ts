import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const keys = locals ? Object.keys(locals as any) : [];
  const auth = (locals as any)?.auth;

  return new Response(
    JSON.stringify(
      {
        ok: true,
        locals_keys: keys,
        auth_present: !!auth,
        auth_type: auth ? typeof auth : null,
        auth_keys: auth ? Object.keys(auth) : null,
        auth_userId: auth?.userId ?? null,
      },
      null,
      2
    ),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};
