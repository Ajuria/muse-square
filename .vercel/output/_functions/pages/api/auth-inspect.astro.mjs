import { renderers } from "../../renderers.mjs";
const prerender = false;
const GET = async ({ locals }) => {
  return new Response(
    JSON.stringify(
      {
        locals_keys: locals ? Object.keys(locals) : [],
        auth: locals?.auth ?? null,
        clerk: locals?.clerk ?? null,
        userId: locals?.auth?.userId ?? locals?.clerk?.userId ?? null
      },
      null,
      2
    ),
    { headers: { "content-type": "application/json" } }
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
