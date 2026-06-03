import "dotenv/config";
import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  try {
    const clerk_user_id = (locals as any)?.clerk_user_id;
    if (typeof clerk_user_id !== "string" || !clerk_user_id.trim()) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }

    let body: any = {};
    try { body = await request.json(); } catch {}
    const location_id = typeof body?.location_id === "string" ? body.location_id.trim() : "";
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "Missing location_id" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }

    // Ownership : validé contre le set déjà chargé par le middleware
    // (même source que getProfileContext). Fail-closed si vide.
    const owned = Array.isArray((locals as any)?.all_location_ids)
      ? (locals as any).all_location_ids
      : [];
    if (!owned.includes(location_id)) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }

    cookies.set("ms_active_location", location_id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: import.meta.env.PROD,
      maxAge: 60 * 60 * 24 * 365,
    });

    return new Response(JSON.stringify({ ok: true, location_id }), {
      status: 200, headers: { "content-type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
};