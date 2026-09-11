// src/lib/dispositifs/poleCreate.ts
// =====================================================
// CRÉER UN PÔLE (dispositif permanent) — LE chemin d'écriture, unique (11/09). Extrait VERBATIM de la
// branche `dispositif_nature === 'permanent'` de POST /api/commitments pour être partagé par la route
// (formulaire de pôle, page de l'engagement) et par un one-off (déclaration des pôles d'un site depuis
// son plan) : deux entrées, une seule règle — famille dans un seul pôle, composants du registre,
// mesures d'espace à part (analytics.space_measures), périmètre « ce que le pôle vend ».
// Le contrôle d'accès (requireLocationOwnership) reste à la route : ici, l'utilisateur est connu.
// Rend { status, body } — la route sérialise, le one-off lit.
// =====================================================
import { readMergeWrite, readLatestSnapshot, lineageFor } from "../commitments/actionCommitments";
import { normalizeScope, serializeScope } from "../commitments/measuredScope";
import { parseComponents } from "./dispositifTypes";
import { listPoles, familyTakenByAnotherPole, familyClashMessageFr } from "./poleReading";
import { parseSpaceMeasuresBody, appendSpaceMeasures, parseMeasureSource } from "./spaceMeasures";

export interface PoleCreateResult { status: number; body: Record<string, unknown> }

export async function createPermanentPole(bq: any, userId: string, body: any): Promise<PoleCreateResult> {
  if (!body?.location_id || !body?.committed_action_text) {
    return { status: 400, body: { ok: false, error: "Champs requis manquants (pôle) : location_id, committed_action_text" } };
  }
  const fams: string[] = Array.isArray(body.pole_families)
    ? body.pole_families.map((f: any) => String(f).trim()).filter(Boolean) : [];
  if (!fams.length && !body.parent_commitment_id) {
    return { status: 400, body: { ok: false, error: "pole_families requis : les familles réelles du pôle" } };
  }
  const poleId = crypto.randomUUID();
  const _pParentId = body.parent_commitment_id ? String(body.parent_commitment_id).trim() : null;
  let _pParent: Awaited<ReturnType<typeof readLatestSnapshot>> = null;
  if (_pParentId) {
    _pParent = await readLatestSnapshot(bq, _pParentId);
    if (!_pParent) return { status: 400, body: { ok: false, error: "parent_commitment_id introuvable" } };
    if (String(_pParent.location_id) !== String(body.location_id).trim()) {
      return { status: 403, body: { ok: false, error: "parent_commitment_id d'un autre site" } };
    }
    if ((_pParent as any).dispositif_nature !== "permanent") {
      return { status: 400, body: { ok: false, error: "le parent n'est pas un dispositif permanent" } };
    }
  }
  const _pLineage = lineageFor(_pParent, poleId);
  // « Une famille vit dans un seul pôle » (owner 27/08, RATIFIÉ 09/09) : la règle ne vivait que
  // dans le formulaire (`pole-form.js`) — donc contournable par l'API, et une règle écrite à un
  // seul endroit du chemin d'écriture n'est pas une règle. Le tri est PUR et testé
  // (`familyTakenByAnotherPole`) ; la lecture passe par LE foyer `listPoles`, à sa limite haute
  // EXPLICITE (défaut 12 : au-delà, un pôle non lu laisserait passer une famille déjà prise —
  // un trou silencieux, jamais une erreur). La chaîne de versions de CE dispositif est exclue.
  if (fams.length) {
    const _pOthers = await listPoles(bq, String(body.location_id).trim(), 50).catch(() => []);
    const _pClash = familyTakenByAnotherPole(_pOthers, fams, _pLineage.dispositif_id);
    if (_pClash) return { status: 400, body: { ok: false, error: familyClashMessageFr(_pClash) } };
  }
  // Composants (03/09, spec dispositifs-typologie § 3) : type/rôle du registre, clé stable,
  // libellé libre. Absents au POST → hérités du parent (même règle que le contexte de version).
  const _pComps = parseComponents(body.components, () => crypto.randomUUID().slice(0, 8));
  if (!_pComps.ok) return { status: 400, body: { ok: false, error: _pComps.error } };
  const _pComponents: string | null = body.components != null
    ? (_pComps.components.length ? JSON.stringify(_pComps.components) : null)
    : (((_pParent as any)?.components as string | null | undefined) ?? null);
  // Mesures d'espace (11/09, docs/espace-et-pole.md E3) : longueur, faces de préhension, N° sur le
  // plan, Part de linéaire par composant ; surface de vente au pôle. Elles vivent À PART
  // (analytics.space_measures, append-only) — jamais dans le JSON components. Validées AVANT
  // l'écriture du dispositif : une mesure sur un composant que la version ne porte pas est refusée,
  // et un corps invalide ne laisse pas un pôle sans ses mesures.
  const _pMeasures = parseSpaceMeasuresBody(body.space_measures);
  if (!_pMeasures.ok) return { status: 400, body: { ok: false, error: _pMeasures.error } };
  if (_pMeasures.value.components.length) {
    const _pKeys = new Set<string>();
    try { for (const c of JSON.parse(_pComponents || "[]")) if (c && c.key) _pKeys.add(String(c.key)); } catch { /* composants illisibles → aucune clé */ }
    const _pUnknown = _pMeasures.value.components.find((m) => !_pKeys.has(m.component_key));
    if (_pUnknown) return { status: 400, body: { ok: false, error: `space_measures : le composant « ${_pUnknown.component_key} » n'est pas dans cette version du pôle` } };
  }
  const row = await readMergeWrite(bq, {
    commitmentId: poleId, transitionType: "created", create: true,
    patch: {
      user_id: userId, location_id: String(body.location_id).trim(),
      status: "open", verdict: null, authorship: "user_authored",
      origin_kind: "pole", origin_action_type: "pole",
      dispositif_nature: "permanent",
      pole_families: fams.length ? JSON.stringify(fams) : ((_pParent as any)?.pole_families ?? null),
      components: _pComponents,
      // 07/09 — ce que le pôle vend = ses familles (périmètre de nature pole), hérité à la V2.
      measured_scope: body.measured_scope != null
        ? serializeScope(normalizeScope(body.measured_scope))
        : (fams.length ? serializeScope({ kind: "pole", familles: fams.map((n: string) => ({ nom: n })), pole_id: poleId, pole_nom: String(body.committed_action_text).trim() }) : ((_pParent as any)?.measured_scope ?? null)),
      committed_action_text: String(body.committed_action_text).trim(),
      owner_person_name: body.owner_person_name != null && String(body.owner_person_name).trim()
        ? String(body.owner_person_name).trim() : (_pParent?.owner_person_name ?? null),
      dispositif_plus: body.dispositif_plus != null && String(body.dispositif_plus).trim()
        ? String(body.dispositif_plus).trim() : ((_pParent as any)?.dispositif_plus ?? null),
      dispositif_why: body.dispositif_why != null && String(body.dispositif_why).trim()
        ? String(body.dispositif_why).trim() : ((_pParent as any)?.dispositif_why ?? null),
      dispositif_resources: body.dispositif_resources != null && String(body.dispositif_resources).trim()
        ? String(body.dispositif_resources).trim() : ((_pParent as any)?.dispositif_resources ?? null),
      adjustment_move: body.adjustment_move ? String(body.adjustment_move).trim() : null,
      adjustment_note: body.adjustment_note != null ? (String(body.adjustment_note).trim() || null) : null,
      parent_commitment_id: _pParentId,
      dispositif_id: _pLineage.dispositif_id,
      version_no: _pLineage.version_no,
      operation_cost_eur: body.operation_cost_eur != null && Number.isFinite(Number(body.operation_cost_eur)) && Number(body.operation_cost_eur) >= 0 && Number(body.operation_cost_eur) <= 1000000
        ? Math.round(Number(body.operation_cost_eur) * 100) / 100 : null,
    } as any,
  } as any);
  let _pWritten: string[] = [];
  if (_pMeasures.value.components.length || _pMeasures.value.pole) {
    _pWritten = await appendSpaceMeasures({
      location_id: String(body.location_id).trim(), dispositif_id: _pLineage.dispositif_id, version_no: _pLineage.version_no,
      components: _pMeasures.value.components, pole: _pMeasures.value.pole,
      source: parseMeasureSource(body.space_measures?.source, "saisie"),
      measured_at: typeof body.space_measures?.measured_at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.space_measures.measured_at) ? body.space_measures.measured_at : new Date().toISOString().slice(0, 10),
      declarant_user_id: userId,
    });
  }
  return { status: 200, body: { ok: true, commitment_id: row.commitment_id, dispositif_id: (row as any).dispositif_id, version_no: (row as any).version_no, space_measures_written: _pWritten.length } };
}
