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
import { listClassDispositifs } from "../../bestPractices";

const PROJECT = "muse-square-open-data";

export type PracticeFact = { fact_fr: string; claim_type: "observed" };

const frFullDate = (iso: string) => {
  const d = String(iso || "").slice(0, 10);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
};

export async function buildPracticeFacts(location_id: string): Promise<{ facts: PracticeFact[] }> {
  const bq = makeBQClient(process.env.BQ_PROJECT_ID || PROJECT);
  const rows = await listClassDispositifs(bq, location_id, null, 5);
  return {
    facts: rows.map((p) => ({
      fact_fr: `Dispositif documenté par vous le ${frFullDate(p.created_date)} : « ${p.practice_text} » — ${p.tier === "prouvee" ? "prouvé au rejeu" : "déclaré, pas encore prouvé"}${p.confirmation_test ? ` ; test prévu : « ${p.confirmation_test} »` : ""}${p.commitment_status === "open" ? " ; engagement de test en cours (suivi sur Pulse)" : ""}.`,
      claim_type: "observed" as const,
    })),
  };
}
