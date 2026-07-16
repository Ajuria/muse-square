// src/pages/api/insight/corrections.ts
// Phase 2.3 increment 3 — "what I remember about you": list the venue's ACTIVE identity corrections
// and let the owner clear one. The user owns their memory: always viewable, always clearable.
//
// GET  ?location_id=…                      -> { ok, corrections: [{correction_type, correction_text}] }
// POST { location_id, correction_type }    -> appends a 'clear' EVENT (never a delete) -> { ok }
//
// Reads/writes go through lib/ai/corrections.ts (the one owner of the append-only event log). No
// re-derivation, no direct table access here.
import type { APIRoute } from "astro";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { getActiveCorrections, appendCorrectionEvent, type CorrectionType } from "../../../lib/ai/corrections";

export const prerender = false;

const VALID_TYPES: CorrectionType[] = ["activity", "zone", "nouveau_meaning", "other", "declared_margin_pct"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function requireString(v: unknown, name: string): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error(`Missing required param: ${name}`);
  return s;
}

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const location_id = requireString(url.searchParams.get("location_id"), "location_id");
    requireLocationOwnership(locals, location_id);
    const corrections = await getActiveCorrections(location_id);
    return json(200, { ok: true, corrections });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json(forbidden ? 403 : 400, { ok: false, error: err?.message || "Erreur" });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const location_id = requireString(body?.location_id, "location_id");
    requireLocationOwnership(locals, location_id);
    const correction_type = requireString(body?.correction_type, "correction_type") as CorrectionType;
    if (!VALID_TYPES.includes(correction_type)) return json(400, { ok: false, error: "correction_type invalide" });

    // Clearing is an EVENT, not a delete — the history (the learning corpus) stays intact.
    const existing = (await getActiveCorrections(location_id)).find((c) => c.correction_type === correction_type);
    if (!existing) return json(200, { ok: true, cleared: false });   // already inactive; nothing to do
    await appendCorrectionEvent({
      location_id,
      event_action: "clear",
      correction_type,
      prior_value: existing.correction_text,
      source: "explicit",
    });
    return json(200, { ok: true, cleared: true });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json(forbidden ? 403 : 400, { ok: false, error: err?.message || "Erreur" });
  }
};
