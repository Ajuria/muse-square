// src/lib/explorer/explorerSlotsCopy.fr.ts — les MOTS de l'état vide d'Explorer (spec
// docs/explorer-etat-vide-spec.md, proto validé owner 07/09). Un seul foyer, balayé par
// evenement.fr.guard.test.ts. Aucune chaîne visible de l'état vide ne vit ailleurs.
//
// Ce qui est de l'owner : « Bilan → » (lexique), « objectif atteint / manqué / non concluant »
// (lexique, verdict), « Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes. » (page Évaluer,
// evenement.astro, reprise telle quelle), la forme du titre (proto validé 07/09). La carte
// « fait / pas fait » du proto est RETIRÉE : doctrine owner 05/08, le silence vaut « action menée »
// (voir explorerSlots.ts). E3 : le titre de la carte note reprend le fait du jour tel que le chat le
// rend (buildDayPerformanceFacts : « N € — +X % vs votre CA habituel »), la question est la forme owner
// « Un souvenir ? Notez-le · sinon, laissez » (CLAUDE.md, règle 4 de la copie), le bouton est
// « Enregistrer » (commitmentCopy, page de l'engagement).
// E2/E4 (owner 07/09 : « don't you have all you need in lexique + in agir page? ») — oui, tout vient
// de là : « Ajuster » (lexique), « Choisissez votre prochaine action : » + Poursuivre · Doubler la mise ·
// Pivoter (commitmentCopy, page de l'engagement), « Garder ce qui a marché — et le reconduire » et
// « Répliquer » (pulse.astro, bouton de la bande engagements), « Préparer — <titre> » (evenement.astro,
// en-tête de l'étape avant), « sans action » (lexique, jour non couvert), « Préparer → » et « Consulter → »
// (lexique), la ligne « <Concurrent> — <événement>, à <distance>. » et « Menace : <sous-type> »
// (action-cards.js et pulse.astro feedLine4, le fil Agir).

// pulse.astro feedLine4 — les libellés des sous-types d'alerte, repris tels quels.
const ALERTE_SOUS_TYPES: Record<string, string> = {
  event_new: "Proximité géographique", proximity: "Proximité géographique", industry_overlap: "Même secteur",
  audience_overlap: "Même audience", industry_audience_overlap: "Secteur & audience", date_conflict: "Même date",
};

export const SLOTS_FR = {
  // Nature 1 — engagement résolu, sans bilan.
  bilan_titre: (titre: string, verdictFr: string, ecartFr: string, jours: number) =>
    `${titre} : ${verdictFr}, ${ecartFr} sur ${jours} jour${jours > 1 ? "s" : ""}`,
  bilan_sub: "Votre bilan ajoute ce que la mesure ne voit pas — 2 minutes.",
  bilan_cta: "Bilan →",
  // Nature 1 — jour inexpliqué (|residual_z| ≥ 2) sans note.
  note_titre: (jourCap: string, dateFr: string, caFr: string, pctFr: string) => `${jourCap} ${dateFr} : ${caFr} €, ${pctFr} vs votre CA habituel`,
  note_sub: "Un souvenir ? Notez-le · sinon, laissez",
  note_cta: "Enregistrer",
  // Nature 2 — verdict manqué, ni geste ni version suivante (≤ 14 j).
  ajuster_sub: "Choisissez votre prochaine action : Poursuivre · Doubler la mise · Pivoter",
  ajuster_cta: "Ajuster",
  // Nature 2 — verdict atteint, jamais reconduit.
  reconduire_sub: "Garder ce qui a marché — et le reconduire",
  reconduire_cta: "Répliquer",
  // Nature 2 — occurrence sous 7 jours, sans consigne ni engagement lié.
  preparer_titre: (titre: string) => `Préparer — ${titre}`,
  preparer_sub: (jourCap: string, dateFr: string) => `${jourCap} ${dateFr} — sans action`,
  preparer_cta: "Préparer →",
  // Nature 2 — alerte concurrent non traitée (la ligne du fil Agir, mot pour mot).
  alerte_titre: (nom: string, evenement: string, distance: string) => `${nom}${evenement ? ` — ${evenement}` : ""}${distance ? `, à ${distance}` : ""}.`,
  alerte_sub: (sousType: string) => `Menace : ${ALERTE_SOUS_TYPES[sousType] ?? "Signal concurrent"}`,
  alerte_cta: "Consulter →",
  // Les verdicts, mots du lexique (« Le jugement automatique sur la cible »). Owner 07/09 : le verdict
  // dit l'objectif quand il en a un (« Objectif : +20 % de CA vs votre résultat habituel », page de
  // l'engagement) — « objectif de +20 % manqué » ; et une action déclarée non menée (Pulse : « Action
  // non menée ») remplace le verdict, inattribuable.
  verdict: { met: "objectif atteint", missed: "objectif manqué", inconclusive: "non concluant" } as Record<string, string>,
  // L'objectif nomme son KPI : le CA (revenue_residual) va sans le dire ; une famille se dit
  // « CA de la famille « Coffee » » (owner 27/08, lexique) ; les autres KPI attendent leur mot
  // (lexique § À arbitrer) — le verdict reste nu.
  verdict_avec_objectif: (pctFr: string, etat: "met" | "missed", famille?: string | null) =>
    `objectif de ${pctFr}${famille ? ` de CA de la famille « ${famille} »` : ""} ${etat === "met" ? "atteint" : "manqué"}`,
  action_non_menee: "action non menée",
} as const;
