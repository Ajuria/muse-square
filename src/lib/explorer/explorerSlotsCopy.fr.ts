// src/lib/explorer/explorerSlotsCopy.fr.ts — les MOTS de l'état vide d'Explorer (spec
// docs/explorer-etat-vide-spec.md, proto validé owner 07/09). Un seul foyer, balayé par
// evenement.fr.guard.test.ts. Aucune chaîne visible de l'état vide ne vit ailleurs.
//
// Ce qui est de l'owner : « Bilan → » (lexique), « objectif atteint / manqué / non concluant »
// (lexique, verdict), « Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes. » (page Évaluer,
// evenement.astro, reprise telle quelle), la forme du titre (proto validé 07/09). La carte
// « fait / pas fait » du proto est RETIRÉE : doctrine owner 05/08, le silence vaut « action menée »
// (voir explorerSlots.ts).

export const SLOTS_FR = {
  // Nature 1 — engagement résolu, sans bilan.
  bilan_titre: (titre: string, verdictFr: string, ecartFr: string, jours: number) =>
    `${titre} : ${verdictFr}, ${ecartFr} sur ${jours} jour${jours > 1 ? "s" : ""}`,
  bilan_sub: "Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.",
  bilan_cta: "Bilan →",
  // Les verdicts, mots du lexique (« Le jugement automatique sur la cible »).
  verdict: { met: "objectif atteint", missed: "objectif manqué", inconclusive: "non concluant" } as Record<string, string>,
} as const;
