// Copie du DOSSIER D'ÉVÉNEMENT — LE fichier que l'owner édite (même convention que
// `factOrigins.fr.ts` et `rapportCanaux.fr.ts` : un fichier par surface, voix d'exploitant).
//
// POURQUOI CE FICHIER (owner, 10/08) : le vocabulaire a dérivé trois fois de suite — « attendu »
// (mot de statisticien, et qui SONNE l'attente alors que l'exploitant AGIT), « sans cible
// chiffrée » (un état interne nommé à l'écran), « Sur la série » / « 0/3 à la cible » (un
// libellé qui ne dit rien est du bruit). Corriger à la main dans trois fichiers ne tient pas :
// les mots vivent ici, et `evenement.fr.guard.test.ts` échoue si un mot banni revient.
//
// VOIX (standard copy 27/07 + mémoire `french-copy-voice`) :
//  - noms courts d'exploitant : « CA réalisé », « CA habituel », « votre objectif » ;
//  - jamais un état interne comme libellé : on propose LE GESTE (« Fixer un objectif ») ;
//  - un libellé doit dire ce que la section EST (« Vos 3 derniers samedis testés »), jamais
//    un mot d'architecture (« Sur la série ») ;
//  - le jargon (verdict statistique, résiduel, fenêtre) vit en infobulle, jamais en libellé.

// ── Mots BANNIS → mot maison. Le garde-fou lit cette table (clé = interdit, valeur = à écrire).
//    Ajouter une entrée ici SUFFIT à interdire le mot dans les surfaces couvertes.
export const MOTS_BANNIS: Record<string, string> = {
  attendu: "habituel",
  attendue: "habituelle",
  "sur la série": "vos N derniers <jour> testés",
  "à la cible": "à votre objectif",
  "cible chiffrée": "objectif",
  rejeu: "test",
  "non-mesurable": "non mesurable",
};

// ── Les mots du dossier. {x} = variable interpolée par `t(key, vars)`.
export const EVT_FR = {
  // Onglets : le job + la date (une série est en permanence après l'une et avant la suivante,
  // « Avant/Après » ne dit donc jamais laquelle).
  tab_preparer: "Préparer {date}",
  tab_resultat: "Résultat {date}",
  tab_choisir: "Choisir la date",

  // Tête de dossier.
  head_dates_one: "Le {date}",
  head_dates_serie: "Série · {n} occurrences",
  objectif_chip: "Objectif : {kpi}{valeur}",
  objectif_absent_chip: "Objectif non fixé",
  objectif_absent_line: "Aucun objectif n’était fixé — sans objectif, pas de verdict. Fixez-en un à la prochaine occurrence.",
  objectif_hors_echelle: "Objectif {ratio}× l’ordinaire ({ref} €/j) — à recalibrer si l’écart se répète.",

  // Le résultat mesuré.
  resultat_titre: "Dernière occurrence mesurée : {date}",
  objectif_atteint: "Objectif atteint",
  objectif_manque: "Objectif manqué",
  verdict_met: "objectif atteint",
  verdict_missed: "objectif manqué",
  verdict_confounded: "non mesurable (facteur externe)",
  verdict_mesure: "verdict mesuré : {verdict}",
  verdict_attente: "verdict à la fin de la fenêtre",
  box_ca: "CA réalisé",
  box_ca_ref: "vs {v} € habituel ({ecart})",
  box_tickets: "Tickets de caisse",
  box_panier: "Panier moyen",
  box_ref_dow: "vs {v} vos {jour}s (90 j)",
  box_transformation: "Transformation · {registre}",
  lecture: "Lecture :",

  // La série : le libellé DIT ce que la section est.
  serie_titre_n: "Vos {n} derniers {jour}s testés",
  serie_titre_1: "Votre premier {jour} testé",
  serie_aucun_objectif: "aucun n’a atteint votre objectif",
  serie_n_objectif: "{met} sur {n} ont atteint votre objectif",
  serie_a_venir: "{n} à venir — une tendance se lit à partir de 3.",
  serie_ligne_objectif: "{kpi} · objectif {valeur}",
  serie_ligne_ca: "CA {ecart} vs habituel",
  serie_pas_de_mesure: "pas de mesure",

  // L'état vivant + la décision (le moteur vit sur la page Évolution — on y renvoie).
  en_cours: "Test en cours — {date}",
  en_cours_suite: " : le verdict tombe seul à la fin. Rien à déclarer avant.",
  prochaine_occurrence: "Prochaine occurrence le {date} — la mesure s’arme seule à J-7.",
  decision_cta: "Poursuivre, doubler, pivoter ou arrêter →",
  decision_aide: "diagnostic et move recommandé",
  partager_cta: "Prévenir l’équipe →",

  // Mémoire + bilan.
  memoire_titre: "Pour mémoire",
  memoire_dispositif: "Dispositif :",
  memoire_consigne: "Consigne :",
  memoire_bilan: "Votre bilan :",
  memoire_absente: "Aucune description enregistrée pour cet événement — la recette que vous écrirez ci-dessous en tiendra lieu.",
  bilan_titre: "Bilan déclaratif — votre vécu du {date}",
  bilan_intro: "{n} questions — ce que la mesure ne voit pas : vos conditions réelles{action}. Le CA, lui, est déjà mesuré ci-dessus.",
  bilan_deja: "Bilan du {date} déjà enregistré.",
  bilan_enregistre: "Bilan enregistré — il complète la mesure de cet événement.",
  visiteurs_question: "Combien de personnes sont venues ? (optionnel)",
  visiteurs_aide: "Vos {n} tickets comptent les acheteurs ; les visiteurs, seul vous les voyez — ensemble : votre taux de transformation.",
  visiteurs_conversion: "≈ {pct} % des visiteurs ont acheté ({tickets}/{visiteurs}).",
  visiteurs_incoherent: "Moins de visiteurs que de tickets ({n}) — vérifiez le nombre.",
} as const;

export type EvtCopyKey = keyof typeof EVT_FR;

/** Interpole {var} — même contrat que le `t()` de la page Évolution (commitmentCopy). */
export function tEvt(key: EvtCopyKey, vars?: Record<string, string | number>): string {
  let s: string = EVT_FR[key] ?? "";
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(String(vars[k]));
  return s;
}
