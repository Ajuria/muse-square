// src/lib/fr/tournures.fr.ts — LES TOURNURES QUI TRAHISSENT UNE MACHINE.
//
// Pourquoi ce fichier existe (owner 28/08, verdict : « le langage est toujours celui d'une
// llm qui parle mal le français… ce problème est récurrent ! C'est sans fin »).
// `MOTS_BANNIS` attrape des MOTS ; les fautes reprochées ici ne sont pas des mots, ce sont
// des CONSTRUCTIONS — et elles ont toutes la même racine : **la phrase parle de la page ou
// du calcul, au lieu de parler du commerce.** « le niveau se lit en haut », « les écarts se
// compensent », « c'est ce qui tient l'écart » : trois façons d'expliquer MA mécanique à
// quelqu'un qui veut savoir ce qui s'est passé dans SON magasin.
//
// Le lexique dit (règles 8-13) que ces règles « se vérifient à la relecture, sinon elles ne
// se vérifient pas ». C'est vrai pour la nuance ; c'est FAUX pour mes tics, qui reviennent à
// l'identique. Chaque tournure ci-dessous a été refusée par l'owner sur une vraie chaîne :
// elle devient donc mécanique, et le test échoue au lieu d'arriver jusqu'à lui.
//
// Ajouter une ligne ici est le geste normal quand une phrase est refusée. En retirer une
// demande l'accord de l'owner — c'est une phrase qu'il a rejetée.

export interface TournureBannie {
  /** Le motif, sur la chaîne VISIBLE en minuscules. */
  motif: RegExp;
  /** Ce qui cloche, en une ligne. */
  faute: string;
  /** La chaîne réelle qui a valu le refus (traçabilité : jamais une règle inventée). */
  refusee: string;
}

export const TOURNURES_LLM: TournureBannie[] = [
  {
    motif: /\bici se li[ts]\b|\bse li[ts] (en haut|en bas|à droite|à gauche|plus haut|plus bas)\b/,
    faute: "la page explique sa propre mise en page — l'exploitant veut un fait, pas un mode d'emploi",
    refusee: "le niveau se lit en haut, ici se lit ce qui a bougé dans la journée",
  },
  {
    motif: /\bse compensent?\b|\bs['’]annulent\b/,
    faute: "narration de calcul : ce qui se compense est ma mécanique, pas son commerce",
    refusee: "Les écarts se compensent : c'est la part de chaque famille qui bouge",
  },
  {
    motif: /\bc['’]est ce qui (tient|explique|fait|donne)\b/,
    faute: "connecteur de démonstration mathématique — dire le fait, pas le raisonnement",
    refusee: "Les deux se compensent : c'est ce qui tient l'écart du jour à +39 €",
  },
  {
    motif: /\bprend (plus|moins) de place\b/,
    faute: "euphémisme : nommer ce qui se passe (le créneau qui porte la journée)",
    refusee: "La tranche 9 h–10 h prend plus de place",
  },
  {
    motif: /\bmêmes jours de semaine\b/,
    faute: "tournure qui n'existe pas en français — dire « vos quatre derniers jeudis »",
    refusee: "Comparaison à vos 4 mêmes jours de semaine précédents",
  },
  {
    motif: /\bpour ce résultat habituel\b/,
    faute: "référentiel collé au mauvais endroit — la phrase ne se lit plus",
    refusee: "403 achats, contre 467 pour ce résultat habituel",
  },
  {
    motif: /^comparaison à /,
    faute: "phrase nominale d'étiquette : commencer par ce qui s'est passé",
    refusee: "Comparaison à vos 4 mêmes jours de semaine précédents.",
  },
  // Tics génériques de rédaction machine — jamais employés par l'owner dans reco-library.
  {
    motif: /\bil s['’]agit d/,
    faute: "formule d'exposé — l'app ne présente pas, elle dit",
    refusee: "(tic générique, absent du corpus owner)",
  },
  {
    motif: /\bpermet de\b|\bpermettent de\b/,
    faute: "verbe de notice technique — dire l'effet concret",
    refusee: "(tic générique, absent du corpus owner)",
  },
  {
    motif: /\ben résumé\b|\bà retenir\s*:|\bnotons\b|\bon constate\b/,
    faute: "voix de rapport scolaire",
    refusee: "(tic générique, absent du corpus owner)",
  },
];
