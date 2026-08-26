// src/lib/ai/facts/buildPracticeFacts.ts
// =====================================================
// Dispositifs documentés → citable facts du chat Consulter (incrément 2 du 03/08).
// Le Consulter savait citer les ISSUES mesurées d'engagements (track-record, mart
// d'apprentissage) mais pas la couche DÉCLARATIVE : la fiche (analytics.best_practices),
// l'engagement de test lié et leur liaison. « Qu'est-ce que j'avais prévu pour les jours
// chauds ? » n'avait pas de réponse alors que la base la connaît.
//
// Même patron que buildIdentityFacts : le builder crée son client, ne jette jamais (l'appelant
// .catch vers []), et rend des fact_fr prêts pour la liste blanche — le modèle les surface
// verbatim, donc le tier (déclaré/prouvé) et l'état du test voyagent DANS la phrase.
// claim_type "observed" : c'est une déclaration de l'exploitant présente en base, pas une
// mesure — le registre causal étagé ne s'y déverrouille pas.
// Borné à 5 fiches (les plus récentes, tests en cours d'abord) pour ne pas gonfler le prompt.
// =====================================================
import { makeBQClient } from "../../bq";
import { listClassDispositifs, type ClassDispositif } from "../../bestPractices";
import { classNounFr } from "../../insightFamilies/dispositif";

const PROJECT = "muse-square-open-data";

export type PracticeFact = { fact_fr: string; claim_type: "observed" };

const frFullDate = (iso: string) => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

// L'ÉTAT d'un dispositif en toutes lettres — axe d'EFFET séparé de l'axe CIBLE (arbitrages
// owner 27/08, tableau lexique 8-13 montré avant implémentation). Pure, testée sur fixture.
// Chaque % porte son référentiel (règle 2) ; « prouvé », « manqué », « non concluant » sont
// les mots actés du lexique ; le signal de la contre-indication est nommé par classNounFr
// (les MÊMES noun_fr que l'atelier — zéro copie).
export function practiceStateFr(p: Pick<ClassDispositif, "tier" | "effect_direction" | "effect_residual_pct" | "commitment_verdict" | "replay_threshold_value" | "replay_threshold_basis" | "day_class_key">): string {
  const pct = p.effect_residual_pct != null
    ? `${p.effect_residual_pct >= 0 ? "+" : "-"}${String(Math.round(Math.abs(p.effect_residual_pct) * 10) / 10).replace(".", ",")} %`
    : "";
  if (p.effect_direction === "negative") {
    const noun = classNounFr(p.day_class_key);
    return `${noun ? `face à vos ${noun}, ` : ""}il a prouvé ne pas être adapté (${pct} vs votre résultat habituel, 1 test manqué)`;
  }
  if (p.effect_direction === "positive" && p.commitment_verdict === "missed") {
    const cible = p.replay_threshold_basis === "pct" && p.replay_threshold_value != null
      ? ` : votre cible (+${String(p.replay_threshold_value).replace(".", ",")} %) était peut-être surestimée`
      : "";
    return `effet positif mesuré (${pct} vs votre résultat habituel), objectif manqué${cible}`;
  }
  if (p.tier === "prouvee") {
    return `prouvé au rejeu${pct ? ` (${pct} vs votre résultat habituel)` : ""}`;
  }
  if (p.effect_direction === "inconclusive") {
    return "testé, non concluant (effet dans le bruit du lieu)";
  }
  return "déclaré, pas encore prouvé";
}

export async function buildPracticeFacts(location_id: string): Promise<{ facts: PracticeFact[] }> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const rows = await listClassDispositifs(bq, location_id, null, 5);
  return {
    facts: rows.map((p) => ({
      fact_fr: `Dispositif documenté par vous le ${frFullDate(p.created_date)} : « ${p.practice_text} » — ${practiceStateFr(p)}${p.confirmation_test ? ` ; test prévu : « ${p.confirmation_test} »` : ""}${p.commitment_status === "open" ? " ; engagement de test en cours (suivi sur Pulse)" : ""}.`,
      claim_type: "observed" as const,
    })),
  };
}
