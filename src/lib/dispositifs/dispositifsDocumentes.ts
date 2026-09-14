// src/lib/dispositifs/dispositifsDocumentes.ts — VOS DISPOSITIFS DOCUMENTÉS, pour l'agent (docs/explorer-outil-spec.md § 7,
// couche 3, 13/09) : ce que la sortie anticipée `_dispositifs_v1` de insight/prompt.ts disait — les fiches de l'atelier
// (lib/dispositifs/bestPractices.ts listClassDispositifs), chacune sur UNE ligne, la même formulation que le journal
// (« Documenté le JJ/MM/AAAA : « … » — état ; test : « … » »). PUR : la composition ; la lecture reste celle de
// bestPractices.ts (l'adaptateur d'une ligne vit dans agentTurn.ts). Aucune formulation nouvelle : la ligne est celle
// que prompt.ts rendait (déplacée ici, importée par lui — jamais deux formulations).
import type { AnswerBlock } from "../explorer/blocks";
import type { ClassDispositif } from "./bestPractices";
import { practiceStateFr } from "../ai/facts/buildPracticeFacts";

const frD = (iso: string): string => { const d = String(iso || "").slice(0, 10); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ""; };

/** La ligne d'une fiche — la formulation du journal et de l'ex-branche « fiches » (prompt.ts, 03/08 → 13/09). */
export const dispositifLigneFr = (p: Pick<ClassDispositif, "created_date" | "practice_text" | "confirmation_test" | "commitment_status" | "tier" | "effect_direction" | "effect_residual_pct" | "commitment_verdict" | "replay_threshold_value" | "replay_threshold_basis" | "day_class_key">): string =>
  `Documenté le ${frD(p.created_date)} : « ${p.practice_text} » — ${practiceStateFr(p)}${p.confirmation_test ? ` ; test : « ${p.confirmation_test} »` : ""}${p.commitment_status === "open" ? " ; test en cours" : ""}`;

export const DISPOSITIFS_ABSENCE_FR = "Aucun dispositif documenté pour l’instant — une fiche naît d'une opération dont le bilan est écrit.";

export interface DispositifsDocumentes { found: boolean; facts: string[]; blocks: AnswerBlock[]; sources: string[] }

/** PUR — les fiches → un fait par fiche (la ligne), un bloc facts, la source ; l'absence sinon. */
export function composeDispositifsDocumentes(rows: ClassDispositif[]): DispositifsDocumentes {
  if (!rows.length) return { found: false, facts: [], blocks: [{ type: "absence", manque: DISPOSITIFS_ABSENCE_FR, geste: { label_fr: "Vos opérations", url: "/app/insightevent/evenement" } }], sources: [] };
  const facts = rows.map(dispositifLigneFr);
  const sources = ["Vos fiches de dispositif (l'atelier : bilan, test de confirmation, effet mesuré sur vos ventes)"];
  return { found: true, facts, blocks: [{ type: "facts", items: facts }, { type: "sources", items: sources }], sources };
}

export function dispositifsToText(d: DispositifsDocumentes): string {
  return d.found ? d.facts.map((f) => `• ${f}`).join("\n") : DISPOSITIFS_ABSENCE_FR;
}
