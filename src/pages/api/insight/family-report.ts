// src/pages/api/insight/family-report.ts
// GENERALIZED insight report — the "sales-report but for every card family" seed. Given a location,
// date, and optional family list, it runs the registered family PROVIDERS (the same ones the deep
// pages + the grounded prompt Q&A reuse) and returns, per family:
//   - data:    render via MSCardKit.<render>(data) on the client (harness-verified renderers)
//   - sources: the "Sources & fiabilité" block
// plus a pooled `facts` array (claim-typed) for an optional grounded exec-summary. NO re-derivation.
// Vertical slice: FOOTFALL is the only registered family today; the rest roll onto FAMILIES mechanically.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { FAMILIES, type FamilyFact } from "../../../lib/insightFamilies";

const PROJECT = "muse-square-open-data";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function requireString(v: string | null | undefined, name: string): string {
  const s = String(v || "").trim();
  if (!s) throw new Error(`Missing required param: ${name}`);
  return s;
}
function normalizeYmd(v: string): string {
  const m = String(v || "").trim().match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`Invalid date format: ${v}`);
  return m[1];
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { /* empty body ok */ }
    const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
    const location_id = requireString(body.location_id, "location_id");
    requireLocationOwnership(locals, location_id);
    const date = normalizeYmd(requireString(body.date, "date"));

    // Which families to include — default to all registered; validate any requested keys.
    const requested: string[] = Array.isArray(body.families) && body.families.length
      ? body.families.map(String) : Object.keys(FAMILIES);
    const keys = requested.filter((k) => FAMILIES[k]);
    if (!keys.length) return json(400, { ok: false, error: "Aucune famille valide demandée." });

    const results = await Promise.all(keys.map(async (k) => {
      const fam = FAMILIES[k];
      try {
        const r = await fam.run(bq, location_id, date);
        return { family: fam.key, title: fam.title, render: fam.render, found: r.found, data: r.data, sources: r.sources, facts: r.facts };
      } catch (e: any) {
        console.error(`[family-report] ${fam.key} failed`, e);
        return { family: fam.key, title: fam.title, render: fam.render, found: false, data: { found: false, date }, sources: [], facts: [] };
      }
    }));

    const sections = results.filter((s) => s.found);
    const facts: FamilyFact[] = sections.flatMap((s) => s.facts as FamilyFact[]);
    return json(200, { ok: true, date, sections, facts });
  } catch (err: any) {
    console.error("[api/insight/family-report] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
