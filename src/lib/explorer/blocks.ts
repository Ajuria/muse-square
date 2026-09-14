// src/lib/explorer/blocks.ts — LES BLOCS de réponse d'Explorer (docs/explorer-outil-spec.md § 5).
//
// Une réponse est une suite de blocs typés, rendus par renderAnswerBlocks (public/js/card-kit.js) : les types
// existants du kit (`register`, `prose`, `facts`, `table`, `card`, `sources`) et `absence` (12/09). Un outil rend
// des blocs ET des faits ; la boucle ne rend jamais un chiffre qui n'est pas dans les faits d'un outil du tour
// — c'est `groundAgentText` qui le vérifie (la porte, pas une promesse). Tout ici est PUR et testé sans réseau.
import type { FamilyResult } from "../insightFamilies/types";
import { extractNumbers } from "../ai/contracts/groundingChecks";
import type { PropositionBlock } from "./proposition";
import type { PlanBlock } from "../dispositifs/planColore";

// « note » (12/09) : un texte écrit par l'exploitant lui-même — la Synthèse qu'il a reprise ; pastille « Votre note », jamais vérifié.
export type Register = "vetted" | "web" | "model" | "note";

export type AnswerBlock =
  | { type: "register"; register: Register; facts_cited?: number }
  | { type: "prose"; md: string }
  | { type: "facts"; items: string[] }
  // 13/09 (§ 7, couche 6) — DEUX blocs que le kit rend DÉJÀ (vocabulaire Phase 3 de `renderAnswerBlocks`)
  // et que ce type ne déclarait pas : le titre d'une section et une rangée de cartes construites SERVEUR
  // (les pôles et les opérations datées du journal, proto v2 owner 27/08). Rien de neuf côté rendu : jusqu'ici
  // c'est `ie-prompt.js` qui fabriquait ces deux blocs depuis le payload de la couche déterministe ; ils se
  // déclarent ici pour que l'outil les rende lui-même.
  | { type: "headline"; text: string }
  | { type: "datecards"; items: Array<Record<string, unknown>> }
  // Le format de msTable (card-kit.js) : rows[].cells[] — jamais un second rendu de table.
  // `id` (14/09) : la CLÉ de la ligne — jamais rendue (msTable ne lit que `cells`). Elle existe pour qu'une
  // surface qui réutilise un classement retrouve SA ligne par son identifiant, jamais par son libellé
  // (CLAUDE.md § Diagnosis : « Identité par la CLÉ, jamais par un nom »).
  | { type: "table"; cols: Array<{ label: string; align?: "left" | "right" }>; rows: Array<{ id?: string; cells: Array<{ v: string; bold?: boolean; color?: string; sub?: string; tip?: string }> }> }
  | { type: "card"; render: string; data: Record<string, unknown> }
  // `ouvert` (13/09) : dans un Rapport, les sources se lisent sans clic — dans le chat, elles restent repliées.
  | { type: "sources"; items: string[]; ouvert?: boolean }
  // 12/09 — l'absence est un résultat : ce qui manque, et le geste qui le débloque (le mot de Piloter).
  | { type: "absence"; manque: string; geste?: { label_fr: string; url: string } | null }
  // 13/09 (§ 7, couche 2) — le geste du kit (`cta`) : un lien (`url`) ou une action de la surface (`action` : « upload » =
  // le sélecteur de fichiers du chat, câblé par ie-prompt.js) — l'absence de ventes le porte.
  | { type: "cta"; label: string; action?: string; url?: string; prefill?: Record<string, unknown>; origin?: Record<string, unknown> | null }
  // 13/09 (§ 7, couche 4) — un segment d'un autre registre au milieu d'une réponse vérifiée (les références web du plan) :
  // le kit le rend en ambre « Web — non vérifié » ; ses nombres ne sont pas des faits pour la porte.
  | { type: "segment"; register: "web" | "model"; md: string }
  // 13/09 (§ 7, couche 6) — LA CLARIFICATION : un outil à qui il manque une entrée (l'opération, la période) rend les choix
  // réels du site en puces (label_fr, send) — le client renvoie `send` comme une question ; jamais une devinette.
  | { type: "clarification"; chips: Array<{ label_fr: string; send: string }> }
  // 13/09 (incrément 8, spec § 5) — LE PLAN COLORÉ : les contours des pôles, une teinte par valeur (lib/dispositifs/planColore.ts).
  | PlanBlock
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
/**
 * PUR — LES NOMBRES QU'UN OUTIL A RENDUS DANS SES BLOCS. Un tableau produit par un outil est de la SORTIE
 * D'OUTIL, au même titre qu'un fait : ses cellules ne sont pas des inventions du modèle.
 *
 * POURQUOI ÇA MANQUAIT, ET CE QUE ÇA COÛTAIT (owner 14/09, capture à l'appui). La porte n'autorisait que
 * les nombres des `facts`. Un outil qui rend un tableau de trente journées et deux phrases de faits rendait
 * donc INFONDABLE tout commentaire sur ce tableau : « Non vérifié » s'affichait sur une réponse dont chaque
 * chiffre venait pourtant de la caisse. Verdict de l'owner : « je ne comprends pas la pilule Non vérifié !
 * C'est donc inutilisable ? » — il avait raison, la pastille mentait. C'est aussi ce qui faisait tomber la
 * batterie par intermittence sur les réponses LONGUES (51, 45, 120, 3.13, 5, 6 en une journée : des nombres
 * lus dans des tableaux).
 *
 * CE N'EST PAS UN ASSOUPLISSEMENT : on n'autorise rien que les outils n'aient rendu. Le modèle qui invente
 * un nombre absent des faits ET des blocs est toujours pris.
 */
export function nombresDesBlocs(blocks: AnswerBlock[]): string[] {
  const out: string[] = [];
  const walk = (b: any) => {
    if (!b) return;
    if (b.type === "table") for (const r of b.rows ?? []) for (const c of r.cells ?? []) { if (c?.v != null) out.push(String(c.v)); if (c?.sub != null) out.push(String(c.sub)); }
    else if (b.type === "facts") out.push(...(b.items ?? []).map(String));
    else if (b.type === "barres" || b.type === "barres_h" || b.type === "parts") for (const i of b.items ?? []) { if (i?.value_fr) out.push(String(i.value_fr)); if (i?.part_fr) out.push(String(i.part_fr)); }
    else if (b.type === "card") out.push(JSON.stringify(b.data ?? {}));
    else if (b.type === "rapport") for (const s of b.sections ?? []) for (const x of s.blocs ?? []) walk(x);
  };
  for (const b of blocks ?? []) walk(b);
  return out;
}

export function groundAgentText(text: string, facts: string[], blocsDesOutils: AnswerBlock[] = []): Grounding {
  const allowed = new Set<string>();
  for (const f of facts) for (const n of extractNumbers(f)) allowed.add(n);
  for (const v of nombresDesBlocs(blocsDesOutils)) for (const n of extractNumbers(v)) allowed.add(n);
  const stated = extractNumbers(stripDatesAndHours(text));
  const ungrounded = [...stated].filter((n) => !allowed.has(n));
  return { register: ungrounded.length ? "model" : "vetted", ungrounded_numbers: ungrounded, facts_cited: facts.length };
}

function stripDatesAndHours(s: string): string {
  return s
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, " ")     // JJ/MM/AAAA
    .replace(/\b\d{1,2}\/(?:0?[1-9]|1[0-2])\b(?!\/)/g, " ")  // JJ/MM sans année — « le 22/08 », « le 07/09 »
    .replace(/\b\d{1,2}(?:er)?\s+(?:et|au|\u00e0)\s+(?:le\s+)?\d{1,2}(?:er)?\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+\d{4})?\b/gi, " ")  // « le 5 et le 12 septembre », « du 5 au 12 septembre »
    .replace(/\b\d{1,2}(?:er)?\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+\d{4})?\b/gi, " ")  // « le 5 septembre », « 1er octobre 2026 »
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")               // AAAA-MM-JJ
    .replace(/\b\d{1,2}\s?h(?:\s?\d{2})?\b/g, " ")        // 10 h, 10h30
    .replace(/\b(19|20)\d{2}\b/g, " ")                    // années
    // 12/09 (mesuré sur la batterie) : les numéros d'une liste (« 1. Cuisine… », « 2) Maison… ») ne sont pas des faits.
    .replace(/^\s*\d{1,2}[.)]\s/gm, " ")
    // 13/09 (mesuré : « 1. Coffee — … 2. Tea — … 3. Bakery » sur une seule ligne) : un numéro d'un chiffre suivi d'un
    // point et d'une majuscule est un rang de liste, où qu'il soit dans la ligne.
    .replace(/(^|\s)\d[.)]\s(?=[*_]*\p{Lu})/gu, "$1");
}

/** Les blocs d'une réponse d'agent : la pastille de registre d'abord, puis les blocs des outils dans l'ordre d'appel. */
export function assembleAnswerBlocks(toolBlocks: AnswerBlock[][], grounding: Grounding): AnswerBlock[] {
  return [{ type: "register", register: grounding.register, facts_cited: grounding.facts_cited }, ...toolBlocks.flat()];
}
