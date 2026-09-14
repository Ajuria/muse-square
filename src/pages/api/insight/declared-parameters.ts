// src/pages/api/insight/declared-parameters.ts
// Paramètres déclarés à date d'effet (charges fixes, masse salariale, surface de vente, base du CA) —
// docs/catalogue-de-couts-et-marge.md M5, docs/espace-et-pole.md E4. Owner seulement.
//
// GET  ?location_id=…                                   -> { ok, current: {key: {value_num|value_text, unit, effective_from}}, history: [...] }
// POST { location_id, key, value, effective_from }      -> une ligne de plus dans analytics.declared_parameters (append-only)
//   value : nombre français (« 8 500,50 ») ou « HT » / « TTC » ; effective_from : JJ/MM/AAAA (ou AAAA-MM-JJ),
//   défaut = aujourd'hui. Réponse : { ok, parameter_id, key, value, effective_from }.
// Tout passe par lib/kpi/declaredParameters.ts (le seul foyer). La lecture métier (valeur par jour de vente)
// est la vue semantic.vw_insight_event_declared_parameters ; ici le producteur relit son propre journal.
import type { APIRoute } from "astro";
import { requireLocationOwnership } from "../../../lib/requireLocationOwnership";
import { PARAMETERS, parameterSpec, validateValue, parseEffectiveFrom, appendDeclaredParameter, listDeclaredParameters, currentByKey } from "../../../lib/kpi/declaredParameters";

export const prerender = false;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
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
    const history = await listDeclaredParameters(location_id);
    const cur = currentByKey(history);
    const current: Record<string, unknown> = {};
    for (const p of PARAMETERS) {
      const r = cur[p.key];
      current[p.key] = r ? { value_num: r.value_num, value_text: r.value_text, unit: r.unit, effective_from: r.effective_from, label_fr: p.label_fr } : null;
    }
    return json(200, { ok: true, current, history });
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
    const spec = parameterSpec(requireString(body?.key, "key"));
    if (!spec) return json(400, { ok: false, error: "Paramètre inconnu" });
    let value;
    try { value = validateValue(spec, body?.value); } catch (e: any) { return json(400, { ok: false, error: e?.message || "Valeur invalide" }); }
    const effective_from = body?.effective_from ? parseEffectiveFrom(body.effective_from) : new Date().toISOString().slice(0, 10);
    if (!effective_from) return json(400, { ok: false, error: "Date d'effet attendue au format JJ/MM/AAAA" });
    const parameter_id = await appendDeclaredParameter({
      location_id, key: spec.key, value, effective_from,
      declarant_user_id: (locals as any)?.clerk_user_id ?? null,
      source: typeof body?.source === "string" && body.source.trim() ? body.source.trim().slice(0, 40) : "piloter_inline",
    });
    return json(200, { ok: true, parameter_id, key: spec.key, value: value.value_num ?? value.value_text, effective_from });
  } catch (err: any) {
    const forbidden = String(err?.message || "").startsWith("FORBIDDEN");
    return json(forbidden ? 403 : 400, { ok: false, error: err?.message || "Erreur" });
  }
};
