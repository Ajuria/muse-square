// src/lib/commitments/journalEngagements.ts — VOTRE JOURNAL, pour l'agent (docs/explorer-outil-spec.md § 7,
// couche 6, 13/09) : ce que les sorties anticipées `_engagements_v1` et `_engagements_elicit_v1` de
// insight/prompt.ts disaient — les engagements jugés, les pôles et les opérations datées en CARTES, les
// jours à venir où les conditions d'un dispositif prouvé se reforment, et le geste qui s'impose.
//
// PUR : la composition seule. Les deux lectures restent celles qui existent (`engagementsFamily` pour le
// journal, `journalPlan` pour les jours à venir) ; l'adaptateur d'une ligne vit dans `agentTurn.ts`.
// AUCUNE formulation nouvelle : les faits sont ceux du provider, la phrase d'absence est celle qui était
// en production depuis le 27/08, les titres de section sont ceux du proto v2 validé par l'owner.
//
// CE QUI NE RENTRE PAS ICI, et c'est voulu : les fiches documentées de l'atelier. La couche de prompt.ts
// les inlinait ; elles ont leur propre outil depuis ce matin (`lire_dispositifs_documentes`). Une capacité
// = un outil : c'est la boucle qui les enchaîne, pas une copie de plus.
import type { AnswerBlock } from "../explorer/blocks";

/** Une carte construite par le provider (pôle ou opération datée) — rendue verbatim par le kit. */
export type JournalCarte = Record<string, unknown>;

/** Ce que `engagementsFamily` rend, réduit à ce que la composition lit. */
export interface JournalSource {
  found: boolean;
  facts: Array<{ fact_fr: string }>;
  sources: string[];
  data: {
    advice?: string[];
    advice_texts?: string[];
    card_fact_texts?: string[];
    pole_cards?: JournalCarte[];
    dated_cards?: JournalCarte[];
    adjust_commitment_id?: string | null;
  };
}

/** Ce que `journalPlan` rend, réduit à ce que la composition lit. */
export interface JournalJour {
  date: string;
  direction: "negative" | "positive";
  say_fr: string;
  prefill?: Record<string, unknown> | null;
}

export interface JournalEngagements {
  found: boolean;
  /** « Vos dispositifs » quand des pôles répondent, « Vos engagements » sinon (proto v2, owner 27/08). */
  titre: string;
  facts: string[];
  blocks: AnswerBlock[];
  sources: string[];
}

// La phrase d'absence EN PRODUCTION depuis le 27/08 (prompt.ts `ENGAGEMENTS_ELICIT_FR`), reprise mot pour
// mot : elle dit ce qui manque ET par où ça se débloque. « dates de l'opération » — « fenêtre » est banni.
export const JOURNAL_ABSENCE_FR =
  "Vous n'avez pas encore d'engagement jugé sur ce site : je n'ai donc rien à vous dire sur ce qui a marché. Depuis une carte, « M'engager » pose l'action, l'objectif et les dates de l'opération — le verdict tombe seul à la fin.";

export const JOURNAL_POLES_TITRE = "Vos pôles";
export const JOURNAL_DATEES_TITRE = "Vos opérations datées";
const JOURS_TITRE = "Vos jours à venir";
const JOURS_MAX = 3;

/**
 * PUR — le journal en blocs : les cartes d'abord (elles portent leurs chiffres), puis les faits qui ne
 * sont pas déjà dans une carte ni dans le conseil, puis les jours à venir, puis le conseil et son geste.
 *
 * Les deux gestes ne coexistent JAMAIS, et la contre-indication prime (règle J2.3, 27/08) : si un
 * dispositif prouvé négatif tourne encore, l'ajuster passe avant tout rejeu.
 */
export function composeJournalEngagements(inp: { source: JournalSource; jours: readonly JournalJour[] }): JournalEngagements {
  const { source, jours } = inp;
  if (!source.found) {
    return {
      found: false, titre: "Vos engagements", facts: [], sources: [],
      blocks: [{ type: "absence", manque: JOURNAL_ABSENCE_FR, geste: { label_fr: "Vos opérations", url: "/app/insightevent/evenement" } }],
    };
  }
  const d = source.data ?? {};
  const advice = d.advice ?? [];
  const adviceTexts = new Set(d.advice_texts ?? []);
  const cardTexts = new Set(d.card_fact_texts ?? []);
  const poles = d.pole_cards ?? [];
  const datees = d.dated_cards ?? [];

  // Les faits de prose : ceux que ni le conseil ni une carte ne disent déjà (sinon la réponse redit deux
  // fois les mêmes chiffres — la règle du proto v2).
  const facts = source.facts.map((f) => f.fact_fr).filter((t) => !adviceTexts.has(t) && !cardTexts.has(t));
  const joursDits = jours.slice(0, JOURS_MAX).map((j) => j.say_fr);
  const conseil = advice.length ? `Action conseillée : ${advice.join(" ; ")}.` : null;

  const blocks: AnswerBlock[] = [];
  if (poles.length) blocks.push({ type: "headline", text: JOURNAL_POLES_TITRE }, { type: "datecards", items: poles });
  if (datees.length) blocks.push({ type: "headline", text: JOURNAL_DATEES_TITRE }, { type: "datecards", items: datees });
  if (facts.length) blocks.push({ type: "facts", items: facts });
  if (joursDits.length) blocks.push({ type: "headline", text: JOURS_TITRE }, { type: "facts", items: joursDits });
  if (conseil) blocks.push({ type: "facts", items: [conseil] });

  // Le geste, pas seulement le conseil (J2.3). « Ajuster » est le mot du lexique pour un engagement ouvert.
  const adjustId = d.adjust_commitment_id ?? null;
  const rejeu = jours.find((j) => j.direction === "positive" && j.prefill) ?? null;
  if (adjustId) {
    blocks.push({ type: "cta", label: "Ajuster", url: `/app/insightevent/engagement?id=${encodeURIComponent(adjustId)}` });
  } else if (rejeu) {
    blocks.push({
      type: "cta", label: "M'engager", prefill: rejeu.prefill as Record<string, unknown>,
      origin: { origin_action_type: "chat_journal_replay", origin_affected_date: rejeu.date },
    });
  }

  const sources = source.sources.length ? source.sources : ["Vos engagements"];
  blocks.push({ type: "sources", items: sources });

  // Les faits que la PORTE doit pouvoir citer : la prose, les jours et le conseil. Les chiffres des cartes
  // sont rendus par le kit depuis les données du provider — ils ne passent pas par le texte du modèle.
  const tousFaits = [...facts, ...joursDits, ...(conseil ? [conseil] : [])];
  return { found: true, titre: poles.length ? "Vos dispositifs" : "Vos engagements", facts: tousFaits, blocks, sources };
}

/** Le texte rendu AU MODÈLE : une ligne par fait, ou l'absence. Les cartes ne s'y racontent pas. */
export function journalToText(j: JournalEngagements): string {
  if (!j.found) return JOURNAL_ABSENCE_FR;
  const lignes = j.facts.map((f) => `• ${f}`);
  return lignes.length ? lignes.join("\n") : "Aucun fait en prose : tout est dit par les cartes.";
}
