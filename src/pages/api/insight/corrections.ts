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
import { getActiveCorrections, appendCorrectionEvent, familySlug, MARGIN_FAMILY_PREFIX, type CorrectionType } from "../../../lib/ai/corrections";

export const prerender = false;

const VALID_TYPES: CorrectionType[] = ["activity", "zone", "nouveau_meaning", "other", "declared_margin_pct", "declared_client_count"];
// Marges par famille (owner 24/08) : un type par famille — `declared_margin_pct__<slug>`.
// Valide en écriture (body.family sur declared_margin_pct) comme en clear (le panneau mémoire
// renvoie le type complet). Le slug est TOUJOURS re-dérivé serveur, jamais accepté brut.
const isFamilyMarginType = (t: string): boolean =>
  t.startsWith(MARGIN_FAMILY_PREFIX) && /^[a-z0-9_]{1,40}$/.test(t.slice(MARGIN_FAMILY_PREFIX.length));

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
    const baseType = requireString(body?.correction_type, "correction_type") as CorrectionType;
    if (!VALID_TYPES.includes(baseType) && !isFamilyMarginType(String(baseType))) {
      return json(400, { ok: false, error: "correction_type invalide" });
    }
    // Marge par famille (owner 24/08) : body.family (libellé item_category exact) sur
    // declared_margin_pct → type dérivé `declared_margin_pct__<slug>` ; le libellé exact
    // voyage dans raw_turn (provenance — le slug seul ne le reconstitue pas).
    const familyLabel = baseType === "declared_margin_pct" && typeof body?.family === "string" && body.family.trim()
      ? body.family.trim().slice(0, 120) : null;
    const familyType = familyLabel ? (`${MARGIN_FAMILY_PREFIX}${familySlug(familyLabel)}` as CorrectionType) : null;
    if (familyLabel && !familySlug(familyLabel)) return json(400, { ok: false, error: "famille invalide" });
    const correction_type = familyType ?? baseType;

    // Déclaration DIRECTE (champ inline Piloter, 16/08) : body.value numérique → même
    // écriture que le chemin chat (assert/supersede + prior_value), bornes par métrique.
    if (body?.value != null) {
      if (baseType !== "declared_margin_pct" && baseType !== "declared_client_count") {
        return json(400, { ok: false, error: "value non supporté pour ce type" });
      }
      const v = Number(String(body.value).replace(",", "."));
      if (!Number.isFinite(v)) return json(400, { ok: false, error: "Valeur invalide" });
      if (baseType === "declared_margin_pct" && (v < 1 || v > 90)) return json(400, { ok: false, error: "Marge attendue entre 1 et 90 %" });
      if (baseType === "declared_client_count" && (v < 1 || v > 100000)) return json(400, { ok: false, error: "Valeur hors bornes" });
      const prior = (await getActiveCorrections(location_id)).find((c) => c.correction_type === correction_type);
      await appendCorrectionEvent({
        location_id,
        event_action: prior ? "supersede" : "assert",
        correction_type,
        correction_text: String(v),
        prior_value: prior ? prior.correction_text : null,
        raw_turn: familyLabel,
        source: "piloter_inline",
        declarant_name: typeof body?.declared_by === "string" && body.declared_by.trim() ? body.declared_by.trim().slice(0, 80) : null,
      });
      return json(200, { ok: true, declared: true, value: v, family: familyLabel });
    }

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
