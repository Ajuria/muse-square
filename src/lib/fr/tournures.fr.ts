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
  {
    motif: /\bne s['’]apprend pas\b|\bs['’]apprend\b|\bne se m[ée]morise pas\b|\bse m[ée]morise\b/,
    faute: "verbe pronominal posé sur un objet du commerce : un dispositif ne « s'apprend » pas — dire ce qui manque à l'exploitant, avec un sujet nommé",
    refusee: "Sans lui, le dispositif ne s'apprend pas. (owner 07/09 : « llm crap again »)",
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
  {
    // 06/09 (owner) : un montant se GÉNÈRE, il ne se « fait » pas ; « il » ne tient pas lieu d'un créneau.
    motif: /\ba fait (un montant|\d)/,
    faute: "« X a fait N € » n'est pas du français — le sujet génère un montant, ou le CA est de N €",
    refusee: "Ce vendredi, il a fait 0 € (−100 %) contre 137 € votre vendredi habituel à cette heure",
  },
  {
    // 11/09 : la même faute au PLURIEL, sortie de l'agent Explorer sur f10c3e58 (« font à eux deux ») —
    // le motif du 06/09 ne voyait que « a fait ».
    motif: /\b(ont fait|font) (à (eux|elles) (deux|trois) )?(un montant|\d)/,
    faute: "« X font N € » n'est pas du français — les familles génèrent un montant, ou leur CA est de N €",
    refusee: "Coffee et Tea font à eux deux 1 154 € par jour",
  },
  // 09/09 (owner : « please write in French not in frenglish — it drives me mad ») : LE FRANGLAIS EST
  // INTERDIT. Un calque de l'anglais n'est pas du français même quand chaque mot existe en français.
  {
    motif: /\btrac(ez|er|é|ée|ons) (la|une|sa|votre) cause\b/,
    faute: "calque de « trace the cause » — en français on IDENTIFIE ou on RETROUVE une cause",
    refusee: "Aucun motif mesuré sur cette date, tracez la cause avant d'agir (owner 09/09 : « Not trace the cause ! Identifiez la cause avant d'agir »)",
  },
  {
    motif: /\bnot(ez|er) vo(tre|s) prix\b/,
    faute: "calque de « note your price » — on COMPARE ses prix à ceux du concurrent (on fait le benchmark)",
    refusee: "notez votre prix et votre marge sur Zaatar 40 g (owner 09/09 : « Comparez vos prix à celui de… ou Faites le benchmark »)",
  },
  {
    motif: /\badress(ez|er) (directement )?(votre|vos|le|la|les|ce|cette|un|une)\b/,
    faute: "calque de « address your audience » — on PARLE À ses clients, on s'adresse à eux",
    refusee: "Adressez directement votre public partagé avant l'échéance (relevé 09/09, même calque)",
  },
  // 09/09 (owner : « on a dit 500 fois que l'on ne se mêle pas des commandes ») : AUCUN geste sur les
  // commandes, les achats, le stock, le réassort. L'app ne connaît que ce qui s'est VENDU ; ce que
  // l'exploitant commande est SON affaire. Abroge « les achats = le levier à 2-3 jours » (28/07).
  {
    // « achat » au sens du CLIENT (nombre d'achats, déclencher l'achat) reste permis : c'est une mesure, pas un geste.
    motif: /\bcommandez\b|\bcommander\b|\brecommandez\b|\bvos commandes\b|\bcommandes? de (frais|la semaine)\b|\bla prochaine commande\b|\bgrosses commandes\b|\b(vos|les|ses|aux) achats\b|\bstocks?\b|\br[ée]assort|\bapprovisionn/,
    faute: "geste sur les commandes / achats / stock — interdit : l'app ne voit que les ventes, la commande est l'affaire de l'exploitant",
    refusee: "Commandez « Pâtisserie fine » sur ses jours de hausse, pas sur sa moyenne (owner 09/09 : « on a dit 500 fois que l'on ne se mêle pas des commandes »)",
  },
  {
    motif: /\b(boost(ez|er)|monitor(ez|er)|check(ez|er)|switch(ez|er)|challeng(ez|er)|focus(ez|er)|impact(ez|er)|support(ez|er)|d[ée]livr(ez|er)|perform(ez|er)|forward(ez|er)|updat(ez|er)|upgrad(ez|er))\b/,
    faute: "franglais — verbe anglais francisé",
    refusee: "(règle owner 09/09 : le franglais est interdit, aucune chaîne visible n'en porte)",
  },
];
