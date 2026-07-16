// src/pages/api/insight/family-report.ts
// GENERALIZED insight report — the "sales-report but for every card family" seed. Given a location,
// date, and optional family list, it runs the registered family PROVIDERS (the same ones the deep
// pages + the grounded prompt Q&A reuse) and returns, per family:
//   - data:    render via MSCardKit.<render>(data) on the client (harness-verified renderers)
//   - sources: the "Sources & fiabilité" block
// plus a pooled `facts` array (claim-typed) for an optional grounded exec-summary. NO re-derivation.
// Iterates ALL registered FAMILIES (footfall, offering, …) — a new family appears here automatically
// once registered + its render exists in card-kit.js. No change needed per family.
import type { APIRoute } from "astro";
import { makeBQClient } from "../../../lib/bq";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { FAMILIES, type FamilyFact } from "../../../lib/insightFamilies";
import { assembleDayContext } from "../../../lib/dayContext";
import { toGroundedDayPayload } from "../../../lib/ai/groundedPayload";
import { runAIPackagerClaude } from "../../../lib/ai/runtime/runPackager";
import { sinkTelemetry } from "../../../lib/telemetrySink";

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

    // ── Section D (16/07) — grounded EXECUTIVE SUMMARY over the pooled family facts ─────────────
    // The seam this endpoint was built for: the pooled claim-typed facts become the whitelist and
    // the SAME grounded packager + validator the chat uses composes the summary (D4: one gate, no
    // fork). D1/D3: reports are customer-facing — on reject the summary is simply ABSENT and the
    // deterministic sections ship unchanged; a report never carries ungated prose. D2: the summary
    // block wears register "vetted" (it passed the gate); web content never enters this whitelist.
    let exec_summary:
      | { headline: string; answer: string; register: "vetted"; facts_cited: number | null }
      | null = null;
    if (facts.length >= 3) {   // a "summary" over 1-2 facts is padding, not synthesis
      try {
        // brief slice: the day frame + forbidden rules from the ONE brain; day facts are BLANKED —
        // the report summarizes its own sections, so the whitelist is exactly the pooled facts.
        const dc = await assembleDayContext(bq, location_id, date, { slice: "brief" });
        const payload = toGroundedDayPayload(
          { ...dc, llm: { ...(dc.llm ?? {}), citable_facts: [] } } as any,
          {
            question: "Résumé exécutif : que faut-il retenir de cette journée pour l'exploitant ?",
            date,
            extraFacts: facts,
          },
        );
        const call = (rejectFeedback?: string[]) => runAIPackagerClaude({
          mode: "grounded_day",
          row: {
            ...payload,
            ...(rejectFeedback && rejectFeedback.length
              ? { validation_feedback: [
                  "Ta réponse précédente a été REJETÉE par le validateur. Corrige exactement ces points, sans rien inventer et sans rien ajouter d'autre :",
                  ...rejectFeedback,
                ] }
              : {}),
          },
        });
        let rejectedFirst = false;
        let ai = await call();
        if (!ai.ok) { rejectedFirst = true; ai = await call(ai.errors); }
        sinkTelemetry(location_id, "report-exec-summary", {
          rejected_first: rejectedFirst, recovered: rejectedFirst && ai.ok, floored: !ai.ok,
          facts_pooled: facts.length, families: sections.length,
        });
        if (ai.ok && ai.output && typeof (ai.output as any).headline === "string") {
          const out: any = ai.output;
          exec_summary = {
            headline: out.headline,
            answer: typeof out.answer === "string" ? out.answer : "",
            register: "vetted",
            facts_cited: Array.isArray(out.cited_fact_ids) ? out.cited_fact_ids.length : null,
          };
        }
      } catch (e: any) {
        console.warn("[family-report] exec-summary skipped:", e?.message);   // D3: absent, never broken
      }
    }

    return json(200, { ok: true, date, sections, facts, exec_summary });
  } catch (err: any) {
    console.error("[api/insight/family-report] Error", err);
    return json(500, { ok: false, error: err?.message ?? "Erreur interne" });
  }
};
