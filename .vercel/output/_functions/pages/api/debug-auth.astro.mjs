import { renderers } from "../../renderers.mjs";
const prerender = false;
const GET = async ({ locals }) => {
  return new Response(
    JSON.stringify({
      ok: true,
      locals_type: typeof locals,
      locals_keys: locals ? Object.keys(locals) : null,
      locals: locals ?? null
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};
const _page = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  GET,
  prerender
}, Symbol.toStringTag, { value: "Module" }));
const page = () => _page;
export {
  page,
  renderers
};
