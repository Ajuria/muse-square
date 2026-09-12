// src/lib/explorer/blocks.ts — LES BLOCS de réponse d'Explorer (docs/explorer-outil-spec.md § 5).
//
// Une réponse est une suite de blocs typés, rendus par renderAnswerBlocks (public/js/card-kit.js) : les types
// existants du kit (`register`, `prose`, `facts`, `table`, `card`, `sources`) et `absence` (12/09). Un outil rend
// des blocs ET des faits ; la boucle ne rend jamais un chiffre qui n'est pas dans les faits d'un outil du tour
// — c'est `groundAgentText` qui le vérifie (la porte, pas une promesse). Tout ici est PUR et testé sans réseau.
import type { FamilyResult } from "../insightFamilies/types";
import { extractNumbers } from "../ai/contracts/groundingChecks";
import type { PropositionBlock } from "./proposition";

// « note » (12/09) : un texte écrit par l'exploitant lui-même — la Synthèse qu'il a reprise ; pastille « Votre note », jamais vérifié.
export type Register = "vetted" | "web" | "model" | "note";

export type AnswerBlock =
  | { type: "register"; register: Register; facts_cited?: number }
  | { type: "prose"; md: string }
  | { type: "facts"; items: string[] }
  // Le format de msTable (card-kit.js) : rows[].cells[] — jamais un second rendu de table.
  | { type: "table"; cols: Array<{ label: string; align?: "left" | "right" }>; rows: Array<{ cells: Array<{ v: string; bold?: boolean; color?: string; sub?: string; tip?: string }> }> }
  | { type: "card"; render: string; data: Record<string, unknown> }
  | { type: "sources"; items: string[] }
  // 12/09 — l'absence est un résultat : ce qui manque, et le geste qui le débloque (le mot de Piloter).
  | { type: "absence"; manque: string; geste?: { label_fr: string; url: string } | null }
  // 12/09 — « Votre note » (spec § 6.2, lexique l. 123) : un texte écrit par l'exploitant sous un bloc, jamais vérifié par
  // le validateur, dit par sa pastille — jamais mêlé à un texte vérifié.
  | { type: "note"; text: string; auteur: string | null; date: string }
  // 12/09 (owner : « ease reading — add tables and graphs ») — trois graphiques du kit, dessinés depuis des valeurs
  // d'outil (jamais recalculées) : barres verticales (jours), barres horizontales (pôles, familles), parts (mix).
  | { type: "barres"; items: Array<{ label: string; value: number; value_fr: string }>; unite?: string }
  | { type: "barres_h"; items: Array<{ label: string; value: number; value_fr: string; part_fr?: string }>; unite?: string }
  | { type: "parts"; items: Array<{ label: string; value: number; value_fr: string; part_fr: string }> }
  // 12/09 — LE RAPPORT (spec § 6) : un document de sections, chacune faite de blocs, avec sa Synthèse (le texte vérifié
  // du tour, posé par la route) et la provenance de chaque section (l'outil, ses paramètres, la période, la date).
  | RapportBlock
  // 12/09 (incrément 6, spec § 5) — LA PROPOSITION D'OPÉRATION : préparée par proposer_operation à partir de faits lus
  // dans le tour, jamais créée ; « Préparer l'opération → » ouvre le formulaire pré-rempli (lib/explorer/proposition.ts).
  | PropositionBlock;

export interface RapportProvenance { outil: string; params: Record<string, unknown>; periode: { du: string; au: string }; calcule_le: string }
export interface RapportSection { cle: string; titre: string; definition?: string; blocs: AnswerBlock[]; provenance: RapportProvenance | null }
export interface RapportBlock {
  type: "rapport";
  titre: string;
  periode: { du: string; au: string; relative: string | null; libelle_fr: string };
  sections: RapportSection[];
  synthese: { text: string; register: Register; auteur?: string | null } | null;
  /** Les morceaux de la demande qu'aucune section ne couvre — dits, jamais inventés. */
  non_reconnu: string[];
}

/** Le mot d'absence de chaque lecteur — les chaînes déjà rendues par le kit, jamais réécrites. */
export const ABSENCE_FR: Record<string, { manque: string; geste?: { label_fr: string; url: string } }> = {
  marge: { manque: "Aucune marge brute mesurée pour l’instant — vos prix d’achat couvrent trop peu de votre CA.", geste: { label_fr: "Importer vos prix d'achat", url: "/app/insightevent/tableau" } },
  espace: { manque: "Aucune mesure d’espace pour l’instant — les mètres se saisissent sur le formulaire de pôle.", geste: { label_fr: "Vos pôles", url: "/profile?tab=poles" } },
  signaux: { manque: "Aucune réponse famille × jours mesurable pour l’instant — moins de 5 jours par classe, ou un écart sous le bruit." },
  // 12/09 — le geste est celui de Piloter (tableau.astro : « Déclarer vos charges fixes et votre masse salariale — débloque le résultat net et le seuil de rentabilité »).
  resultat: { manque: "Aucun résultat net pour l’instant — vos charges fixes et votre masse salariale ne sont pas déclarées.", geste: { label_fr: "Déclarer vos charges fixes et votre masse salariale", url: "/app/insightevent/tableau" } },
  resultat_couverture: { manque: "Aucun résultat net pour l’instant — vos prix d’achat couvrent moins de 90 % de votre CA sur ce mois.", geste: { label_fr: "Importer vos prix d'achat", url: "/app/insightevent/tableau" } },
};

/** Un résultat de provider → ses blocs : la carte du kit quand il y a matière, l'absence sinon. */
export function blocksFromFamilyResult(key: string, render: string, r: FamilyResult): AnswerBlock[] {
  if (!r.found) {
    const a = ABSENCE_FR[key] ?? { manque: "Aucune donnée pour l’instant." };
    return [{ type: "absence", manque: a.manque, geste: a.geste ?? null }];
  }
  const out: AnswerBlock[] = [{ type: "card", render, data: r.data }];
  if (r.sources.length) out.push({ type: "sources", items: r.sources });
  return out;
}

/** Le texte rendu AU MODÈLE par un outil : ses faits, un par ligne — jamais autre chose que ce que le bloc porte. */
export function factsToText(r: FamilyResult, absence: string): string {
  if (!r.found || !r.facts.length) return absence;
  return r.facts.map((f) => `• ${f.fact_fr}`).join("\n");
}

export interface Grounding { register: Register; ungrounded_numbers: string[]; facts_cited: number }

/**
 * LA porte sur le texte de l'agent : chaque nombre qu'il écrit doit exister dans les faits des outils du tour
 * (mêmes règles d'extraction que le validateur du chat : groundingChecks.extractNumbers). Un nombre sans
 * fait → registre « model » (pastille « Non vérifié »), les nombres fautifs listés ; sinon « vetted ».
 * Les nombres qui ne sont pas des faits (dates JJ/MM/AAAA, heures « 10 h », années) sont ignorés comme
 * dans le validateur ; un texte sans nombre est vérifié par construction.
 */
export function groundAgentText(text: string, facts: string[]): Grounding {
  const allowed = new Set<string>();
  for (const f of facts) for (const n of extractNumbers(f)) allowed.add(n);
  const stated = extractNumbers(stripDatesAndHours(text));
  const ungrounded = [...stated].filter((n) => !allowed.has(n));
  return { register: ungrounded.length ? "model" : "vetted", ungrounded_numbers: ungrounded, facts_cited: facts.length };
}

function stripDatesAndHours(s: string): string {
  return s
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")     // JJ/MM/AAAA
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")               // AAAA-MM-JJ
    .replace(/\b\d{1,2}\s?h(?:\s?\d{2})?\b/g, " ")        // 10 h, 10h30
    .replace(/\b(19|20)\d{2}\b/g, " ")                    // années
    // 12/09 (mesuré sur la batterie) : les numéros d'une liste (« 1. Cuisine… », « 2) Maison… ») ne sont pas des faits.
    .replace(/^\s*\d{1,2}[.)]\s/gm, " ");
}

/** Les blocs d'une réponse d'agent : la pastille de registre d'abord, puis les blocs des outils dans l'ordre d'appel. */
export function assembleAnswerBlocks(toolBlocks: AnswerBlock[][], grounding: Grounding): AnswerBlock[] {
  return [{ type: "register", register: grounding.register, facts_cited: grounding.facts_cited }, ...toolBlocks.flat()];
}
