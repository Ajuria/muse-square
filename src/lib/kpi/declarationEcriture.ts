// src/lib/kpi/declarationEcriture.ts — CE QUE L'EXPLOITANT DÉCLARE, pour l'agent (docs/explorer-outil-spec.md § 7, couche 5,
// 13/09) : ce que la sortie anticipée `_declared_capture_v1` de insight/prompt.ts faisait — une marge moyenne (%), une
// clientèle (nombre de clients), une surface de vente (m²) — écrite par LES foyers existants (le journal des
// corrections pour la marge et la clientèle, analytics.declared_parameters à date d'effet pour la surface), et
// confirmée par le mot approuvé (contextCopy.declaredCaptureFr). PUR ici : les types, les bornes (celles du registre
// declaredMetrics.ts), la confirmation ; l'écriture est l'adaptateur de agentTurn.ts. Le seul outil d'écriture de
// plus que la spec accorde (§ 7, 5) — jamais une opération, jamais un pôle.
import { DECLARED_METRICS, type DeclaredMetricSpec } from "../ai/declaredMetrics";
import { declaredCaptureFr } from "../context/contextCopy";
import type { AnswerBlock } from "../explorer/blocks";

export type DeclarationType = "marge_pct" | "clientele" | "surface_vente_m2";
export const DECLARATION_TYPES: DeclarationType[] = ["marge_pct", "clientele", "surface_vente_m2"];

/** Le type de l'outil → la fiche du registre (la même que le chat : parseurs, bornes, libellé, magasin). */
export function specDe(type: DeclarationType): DeclaredMetricSpec {
  const spec = type === "marge_pct" ? DECLARED_METRICS.find((s) => s.correction_type === "declared_margin_pct")
    : type === "clientele" ? DECLARED_METRICS.find((s) => s.correction_type === "declared_client_count")
    : DECLARED_METRICS.find((s) => s.param_key === "sales_area_m2");
  if (!spec) throw new Error(`déclaration : type inconnu ${type}`);
  return spec;
}

/** Les bornes du registre (les mêmes que ses parseurs) ; hors bornes = refus, dit. */
export function valeurValide(type: DeclarationType, valeur: unknown): { ok: true; valeur: number } | { ok: false; erreur: string } {
  const n = typeof valeur === "number" ? valeur : Number(String(valeur ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, erreur: "La valeur doit être un nombre." };
  if (type === "marge_pct") return n >= 1 && n <= 95 ? { ok: true, valeur: Math.round(n * 100) / 100 } : { ok: false, erreur: "La marge moyenne s'écrit en % entre 1 et 95." };
  if (type === "clientele") return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? { ok: true, valeur: n } : { ok: false, erreur: "La clientèle est un nombre entier de clients, entre 1 et 1 000 000." };
  return n >= 1 && n <= 100_000 ? { ok: true, valeur: Math.round(n * 100) / 100 } : { ok: false, erreur: "La surface de vente s'écrit en m², entre 1 et 100 000." };
}

export interface DeclarationEcrite { type: DeclarationType; valeur: number; valeur_fr: string; prior_fr: string | null; declarant_name: string | null }

/** PUR — la confirmation approuvée (« Marge notée : 62 % »), en faits et en blocs. */
export function composeConfirmation(d: DeclarationEcrite): { facts: string[]; blocks: AnswerBlock[]; texte: string } {
  const spec = specDe(d.type);
  const c = declaredCaptureFr({ label_fr: spec.label_fr, value_fr: d.valeur_fr, prior_value_fr: d.prior_fr, declarant_name: d.declarant_name });
  const facts = [c.headline, c.answer];
  return { facts, blocks: [{ type: "prose", md: `**${c.headline}**` }, { type: "facts", items: [c.answer] }], texte: `${c.headline}\n${c.answer}` };
}

/** PUR — la valeur affichée par la fiche du registre (« 62 % », « 300 clients », « 120 m² »). */
export function valeurFr(type: DeclarationType, valeur: number): string {
  return specDe(type).formatValue(String(valeur));
}
