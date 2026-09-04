# Corpus de chaînes réelles — la voix de l'app

Extrait automatiquement du code le 20/08/2026. Ce sont des textes VUS PAR L'UTILISATEUR aujourd'hui.
Sert de référence de STYLE : imiter cette voix, ne pas en inventer une autre.

## src/lib/fr/evenement.fr.ts
```
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
//    Ajouter une entrée ici SUFFIT à interdire le mot dans les surfaces couvertes (SURFACES du
//    fichier de garde). Recherche insensible à la casse, sous-chaîne.
//
//    PORTÉE (décisions owner 10/08) :
//    · « attendu » n'est banni QUE dans son sens de RÉFÉRENCE (« vs attendu », « l'attendu »,
//      « attendu du jour ») — le sens PRÉVISION reste correct et autorisé (« affluence
//      attendue demain », « effet attendu sur la fréquentation », « clientèle attendue ») ;
//    · « cible » et « objectif » sont tous deux acceptés — aucun des deux n'est banni ;
//    · « rejeu » est banni PARTOUT, y compris comme clé interne (owner : « ça ne veut rien
//      dire, c'est une traduction de l'anglais ») — l'échelle est déclaré → en test → prouvé.
export const MOTS_BANNIS: Record<string, string> = {
  "vs attendu": "vs votre résultat habituel",
  "vs l’attendu": "vs votre résultat habituel",
  "vs l'attendu": "vs votre résultat habituel",
  "l’attendu": "votre habituel",
  "l'attendu": "votre habituel",
  "attendu du jour": "habituel du jour",
  "sur la série": "un libellé qui dit ce que la section EST",
  rejeu: "test",
  "non-mesurable": "non mesurable",
  // Registre technique du CRAWL (owner 14/08, 3e rechute) : l'exploitant lit des TROUVAILLES
  // (« rien n'a bougé chez vos 4 suivis ») — le technique ne s'affiche que CASSÉ
  // (« échappe à votre veille »), jamais en inventaire sain.
  "lieux visités": "des trouvailles — le technique seulement s’il est cassé",
  "jamais visité": "échappe à votre veille",
  "visités cette nuit": "veille active sur tous vos suivis",
  "à chaque passage": "sous surveillance",
  "dernier passage": "sous surveillance",
  // Rechutes du 17/08 (owner : « WE HAVE A LANGUAGE IN PLACE ») — le concept s'appelle
  // DISPOSITIF ; « Armer » meurt (la condition vit DANS Automatiser) ; les teasers
  // abstraits meurent (on NOMME le concurrent et le fait, ou on ne dit rien).
  "Vos recettes": "Mes dispositifs",
  "Armer sur signal": "Automatiser (le signal est une condition du flux)",
  "Armer →": "Automatiser →",
  "lecture de positionnement": "les faits nommés (concurrent, chiffres) — jamais un teaser",
  "écart de positionnement": "nommer le concurrent et l'écart concret",
  "fenêtres de la semaine": "vos prochaines occasions",
  "Ma couverture": "Ma veille concurrentielle",
  // Balayage 17/08 (lexique owner) : la période mesurée = les DATES de l'opération ; le moment
  // favorable = une OCCASION ; l'état programmé = Dispositif actif ; « déclaré » (statut de
  // dispositif) fusionné dans « en test » ; le CTA de capture nomme les résultats.
  "Documentez la recette": "Documentez vos résultats",
  "Fenêtre close": "Dates passées",
  "fenêtre favorable": "occasion favorable",
  "Fenêtre favorable": "Occasion favorable",
  "Fenêtre rare": "Occasion rare",
  "fenêtre rare": "occasion rare",
  "meilleure fenêtre": "meilleure occasion",
  "Meilleure fenêtre": "Meilleure occasion",
  "sur toute la fenêtre": "sur les jours de l'opération",
  "Armée ·": "Dispositif actif ·",
  "(armée)": "(dispositif actif)",
  // Owner 17/08 (correctif Autour de vous) : ce qui est prouvé se RÉUTILISE — jamais « rejouable ».
  rejouable: "réutilisable",
  "se rejoue seule": "se relance seul",
  // Owner 17/08 soir : zéro label neuf — lire une page externe = « Consulter → » (label déjà
  // en prod, Consulter la source) ; sections à la première personne (« Mes dispositifs »).
  "leur page →": "Consulter →",
  "Sa page →": "Consulter →",
  "Vos dispositifs": "Mes dispositifs",
  // Fiche concurrent enrichie (owner 17/08 soir) : les labels tranchés.
  "Ce qu’il met en avant": "Actualité commerciale",
  "Ce qu'il met en avant": "Actualité commerciale",
  "Son offre poussée": "Autres offres et produits",
  "Sa proposition :": "Proposition de valeur :",
  "Son public :": "Publics/Clients visés :",
  // Owner 18/08 (bandeau) : « vs votre résultat habituel » NU est interdit — la référence porte son nom entier.
  "vs habituel": "vs votre résultat habituel",
  "vs votre habituel": "vs votre résultat habituel",
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
  serie_ligne_ca: "CA {ecart} vs votre résultat habituel",
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
```

## src/lib/fr/rapportCanaux.fr.ts
```
// Copie du rapport par canal — LE fichier que l'owner édite (spec docs/rapport-canaux-spec.md § 2).
// Voix : les 4 questions de l'exploitant, jamais la voix comptable (« compensé par ») ni le
// jargon d'app. Référence de ton : le proto v5 validé (tools/proto/rapport-canaux-proto.html).
// Règle absolue (décision 10) : ces gabarits n'ORNENT jamais un chiffre et n'inventent jamais
// une cause — ils assemblent des faits mesurés qui leur sont passés.

export const CHANNEL_DEFAULT_LABELS: Record<string, string> = {
  comptoir: "Boutique",
  direct: "Professionnels",
  // __site__ (tenant sans rattachement canal) : le nom du site remplace le libellé.
};

// Seuils d'état d'un canal sur la période (évolution vs période précédente, en %).
export const ETAT = {
  down_max: -15, // ≤ −15 % → à traiter
  up_min: 15, // ≥ +15 % → en forme
  exceptional_min: 100, // ≥ +100 % → exceptionnel
  labels: {
    down: "▼ à traiter",
    up: "▲ en forme",
    exceptional: "▲ exceptionnel",
    stable: "● stable",
  } as Record<string, string>,
};

export type EtatKey = "down" | "up" | "exceptional" | "stable";

export function etatFor(evolPct: number | null): EtatKey {
  if (evolPct == null) return "stable";
  if (evolPct <= ETAT.down_max) return "down";
  if (evolPct >= ETAT.exceptional_min) return "exceptional";
  if (evolPct >= ETAT.up_min) return "up";
  return "stable";
}

export const PIED_DOCUMENT = "Document interne — les comptes clients y sont nommés.";

const frInt = (n: number) => Math.round(n).toLocaleString("fr-FR");
const eur = (n: number) => `${frInt(n)} €`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))} %`;

// Part en mots — uniquement des fourchettes larges ; hors fourchette, le % nu.
function partEnMots(sharePct: number): string {
  if (sharePct >= 85) return "la quasi-totalité du chiffre";
  if (sharePct >= 50) return "plus de la moitié du chiffre";
  if (sharePct >= 44) return "environ la moitié du chiffre";
  if (sharePct >= 28) return "environ un tiers";
  if (sharePct >= 20) return "environ un quart";
  return `${Math.round(sharePct)} % du chiffre`;
}

// ── Les entrées des gabarits : des FAITS déjà mesurés, jamais recalculés ici. ──
export type FlowLine = { label: string; ca: number; share_pct: number; evol_pct: number | null; etat: EtatKey };
export type QQInput = {
  flows: FlowLine[]; // tous les flux (canaux + sites mono-flux), tri CA desc
  new_top: { label: string; ca: number }[]; // plus gros nouveaux comptes de la période
  missing_top: { label: string; prev_ca: number; channel_label: string } | null; // plus gros compte de la période précédente absent de celle-ci
  dormants: { label: string }[]; // comptes réguliers sans commande (mêmes que les cartes)
};

export const QUATRE_QUESTIONS = {
  argent(i: QQInput): string {
    if (!i.flows.length) return "";
    const parts = i.flows.map((f, ix) => {
      if (ix === 0) return `${f.label.toLowerCase() === f.label ? f.label : f.label} : ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
      if (ix === i.flows.length - 1 && i.flows.length >= 3) return `${f.label} le reste (${eur(f.ca)})`;
      return `${f.label} ${partEnMots(f.share_pct)} (${eur(f.ca)})`;
    });
    return `${parts.join(", ")}.`;
  },

  marche(i: QQInput): string {
    const up = i.flows.filter((f) => f.etat === "up" || f.etat === "exceptional");
    const bits: string[] = up.map((f) =>
      f.etat === "exceptional"
        ? `${f.label} signe une période exceptionnelle (${pct(f.evol_pct ?? 0)})`
        : `${f.label} progresse (${pct(f.evol_pct ?? 0)})`
    );
    if (i.new_top.length) {
      const names = i.new_top.slice(0, 2).map((n) => `${n.label} ${eur(n.ca)}`).join(", ");
      bits.push(`de nouveaux comptes ont signé (${names})`);
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Rien ne se détache à la hausse sur la période.";
  },

  marchePas(i: QQInput): string {
    const down = i.flows.filter((f) => f.etat === "down");
    const bits: string[] = down.map((f) => `${f.label} a moins vendu (${pct(f.evol_pct ?? 0)})`);
    if (i.missing_top) {
      bits.push(
        `la période précédente avait été portée par ${i.missing_top.label} (${eur(i.missing_top.prev_ca)}, rien depuis)`
      );
    }
    if (i.dormants.length) {
      bits.push(
        i.dormants.length === 1
          ? `un habitué n'a rien pris sur la période`
          : `${i.dormants.length} habitués n'ont rien pris sur la période`
      );
    }
    return bits.length ? `${bits.join(" ; ")}.` : "Aucun flux en retrait marqué sur la période.";
  },

  aFaire(i: QQInput): string {
    const bits: string[] = [];
    if (i.dormants.length) bits.push(`rappeler ${i.dormants.slice(0, 3).map((d) => d.label).join(", ")}`);
    if (i.missing_top) bits.push(`demander à ${i.missing_top.label} si une prochaine commande arrive`);
    return bits.length ? `${bits.join(" ; ")}.` : "Rien d'urgent — garder le rythme.";
  },
};
```

## src/lib/fr/factOrigins.fr.ts
```
// Libellés d'origine des faits cités — Explorer, attribution par section (docs/explorer-attribution-spec.md).
// OWNER-EDITABLE : ce fichier est LA source des libellés de chips affichés sous chaque section de réponse.
// Approuvés owner 07/08. Règles : jamais un nom de table, jamais un ID ; « Affluence estimée » garde le mot
// « estimée » (l'estimation externe ne doit jamais sonner aussi autoritaire que « Vos ventes »).
// « Web (source) » n'arrive qu'à l'étape 5 du chantier — ne pas l'ajouter ici avant.

export type FactOrigin =
  | "ventes"
  | "declarations"
  | "engagements"
  | "evenements_user"
  | "meteo"
  | "calendrier"
  | "concurrence"
  | "evenements_proximite"
  | "tourisme"
  | "transports"
  | "affluence_estimee"
  | "bonnes_pratiques";

export const FACT_ORIGIN_FR: Record<FactOrigin, string> = {
  ventes: "Vos ventes",
  declarations: "Vos déclarations",
  engagements: "Vos engagements",
  evenements_user: "Vos événements",
  meteo: "Météo du jour",
  calendrier: "Calendrier",
  concurrence: "Veille concurrence",
  evenements_proximite: "Événements à proximité",
  tourisme: "Tourisme régional",
  transports: "Transports",
  affluence_estimee: "Affluence estimée",
  bonnes_pratiques: "Bonnes pratiques",
};
```

## src/lib/commitments/commitmentCopy.ts (engagements)
```
// ── Engagement / "Consulter l'évolution" — ALL user-facing French copy ──
//
// OWNER: this is your voice pass. Edit the words here; no French is hardcoded
// anywhere else (page, endpoint, advice). Rules we agreed:
//   • terse noun-phrases — "CA réalisé", "CA habituel" (NOT "votre habituel")
//   • no robotic/abstract possessives, no hedge-sentences (a label, not a paragraph)
//   • drafted from the app's own voice (rapport.astro, action cards) — refine freely
//
// MECHANISM (why these are strings, not functions): the évolution page runs an
// `is:inline` script that cannot import TS, so this map is injected verbatim through
// `define:vars`. Interpolated values use {tokens} the page fills in (numbers are
// French-formatted — comma decimal — before substitution). Your WORDS are unchanged;
// only function-values became {token} templates. Keys are stable; the only splits are
// by sign (…_pos / …_neg) where the wording differs above vs below.

export const EVOL_COPY = {
  back: "Retour aux engagements",

  // subtitle under the title (goal terms recap; owner + date get their own line)
  subtitle: "Objectif : +{pct} % de CA vs votre résultat habituel · sous {window}",
  // Variante KPI-vrai (owner 15/08) : le sous-titre nomme le KPI DÉCLARÉ, jamais « CA » en dur.
  subtitle_kpi: "Objectif : +{pct} % de {kpi} vs votre résultat habituel · sous {window}",
  owner_line: "Engagé par {name} · le {date}",
  done_suffix: " · action menée le {date}",

  // ── ① Au-dessus / en-dessous de l'objectif ? ──
  q1_title: "Situation par rapport à l'objectif ?",
  q1_agg_pos: "+{pct} % au-dessus du CA habituel",
  q1_agg_neg: "{pct} % en-dessous du CA habituel",
  q1_window: "sur les {days} jours de l'opération",
  q1_days: "{up} jours sur {total} au-dessus du CA habituel",
  q1_best_worst: "meilleur : {bDate} (+{bPct} %) · moins bon : {wDate} ({wPct} %)",
  // open state (mid-window)
  q1_today_pos: "Aujourd'hui : +{pct} % au-dessus du CA habituel",
  q1_today_neg: "Aujourd'hui : {pct} % en-dessous",
  q1_running: "{up} / {received} jours reçus au-dessus",
  day_awaiting: "en attente de données",
  // shown before any window day has data — the measurable goal as a DAILY uplift (easy to read)
  q1_objective_eur: "Augmenter le CA de +{uplift} €/jour (+{pct} % vs CA habituel)",
  q1_objective_pct: "Augmenter le CA de +{pct} % vs votre CA habituel",
  q1_window_started: "L'opération a démarré — le suivi jour par jour apparaîtra ici au fil des ventes.",

  // ── ① LEAD = THE DECISION (Engine-1/2 contrast, not "situation"). NEW — OWNER: voice-pass these.
  // Causal-safe: the effect ABOVE what the context explains, never "votre action a généré". {pct}
  // arrives PRE-SIGNED. Honest on N: the verdict hedges to "à confirmer" while the sample is thin.
  q1_title_decision: "Votre action paie-t-elle ?",
  q1_lead_holiday: "{pct} % au-dessus de ce que les vacances seules expliquent",
  q1_lead_plain: "{pct} % au-dessus du CA habituel",
  q1_days_measured: "{up}/{n} jours mesurés",
  q1_split_inputs: "Situation {sit} % · dont vacances {hol} % sans action",
  q1_verdict_pays: "à ce stade, ça paie",
  q1_verdict_confirm: "à confirmer sur plus de jours",
  q1_verdict_flat: "l'effet de l'action n'est pas encore visible",
  q1_verdict_down: "à ce stade, l'action ne paie pas",
  // vs objectif — position of the effect against the owner's COMMITTED goal (not just vs votre résultat habituel).
  // Resolved → the authoritative verdict; open → the % target the owner set + current position.
  q1_objectif_line: "Objectif : +{pct} % vs votre résultat habituel",
  q1_objectif_above: "au-dessus à ce stade",
  q1_objectif_below: "en-dessous à ce stade",
  q1_objectif_met: "Objectif atteint",
  q1_objectif_missed: "Objectif non atteint",
  q1_objectif_confounded: "Objectif non mesurable (vacances)",
  // Lead hierarchy (goal-first): primary status + progress-to-goal bar + attribution.
  q1_ontrack: "Sur la bonne voie",
  q1_below: "En-dessous de l'objectif",
  q1_bar_goal: "objectif +{pct} %",
  q1_attrib_split: "Dont {action} % attribuable à votre action, hors effet vacances ({ctx} %).",
  q1_attrib_solo: "Votre action : {action} % au-dessus du CA habituel.",

  chart_realized: "CA réalisé",
  chart_habituel: "CA habituel",
  chart_note: "CA réalisé vs CA habituel (journée comparable). Au-dessus = mieux que d'habitude.",

  // §2d — holiday-adjusted honesty. NO "norme/écart" jargon; the number stays, terse.
  holiday_effect: "En vacances, le CA monte déjà de +{pct} % sans action.",
  // Decomposition line: situation − effet vacances = effet net attribuable à l'action.
  // {pct} arrives PRE-SIGNED (+/−). OWNER: voice-pass this wording if you'd phrase it differently.
  q1_decomp_action: "Effet de votre action, hors vacances : {pct} %",
  to_confirm_label: "À confirmer",
  to_confirm_holiday: "Résultat mesuré pendant les vacances scolaires. L'effet de l'action n'est pas isolable. À réessayer hors période de vacances pour trancher définitivement.",

  // ── ② Qu'est-ce qui a influencé ? ──
  // Two kinds of rows: (1) MEASURED impact (a €/% figure over history) — the weather assoc
  // when it passes the confidence gate; (2) NAMED observational context present on the
  // window (holidays, tourism, foreign visitors, nearby events) — NOT a fabricated cause,
  // just "what's happening / expected on the window", which is the useful signal on a
  // forward window. The per-driver measured engine stays queued.
  q2_title: "Qu'est-ce qui a influencé ?",
  q2_caveat: "Signaux observés sur les dates de l'opération — corrélations, pas des causes établies.",
  ctx_impact_weather: "Jours frais ou pluvieux — {cool} € en moyenne, vs {mild} € par temps doux (90 j).",
  ctx_calendar_holiday: "Vacances scolaires — {n} jours sur les dates de l'opération.",
  ctx_tourism_high: "Affluence touristique {status} sur la période.",
  ctx_tourism_foreign: "Clientèle internationale attendue : {list}.",
  ctx_events_named: "À proximité : {list}.",
  ctx_none: "Rien de notable observé sur la période.",

  // ── ③ Comment améliorer ? ──
  q3_title: "Comment m'améliorer ?",
  advice_cta: "M'engager sur cette action",
  advice_replay_offseason: "Réessayer hors vacances pour isoler l'effet.",
  advice_aim_higher: "En vacances, viser plus de +{pct} %.",
  advice_met_hold: "Objectif tenu — à reconduire.",
  // Type A track record (fct_location_commitment_learning). "N fois sur M" only — NEVER "prouvé"
  // ni "marche à X %" (self-selected operator track record, not an effectiveness rate).
  advice_track_reconduire: "Menée {done} fois — le CA a battu votre habituel {beat} fois. À reconduire.",
  advice_track_mitige: "Menée {done} fois — le CA a battu votre habituel {beat} fois. Résultats mitigés, à confirmer.",
  advice_track_ne_pas: "Menée {done} fois — le CA a battu votre habituel {beat} fois seulement. À ne pas reconduire tel quel.",
  // §2c — missed & done: descriptive honest statement, no "revoir l'approche" filler
  advice_missed_descriptive: "Aucun effet visible sur le CA.",
  advice_replay_retest: "À retenter pour confirmer.",

  // ── Diagnostic + advice (shown when under-performing: below goal open, or resolved missed) ──
  diag_title: "Pourquoi en-dessous ?",
  diag_intro: "Votre action ajoute {action} %, l'objectif est +{goal} %. Trois pistes, de la plus probable à la moins :",
  diag_ext_title: "Contexte externe",
  diag_ext_chip_obs: "observé",
  diag_ext_chip_meas: "mesuré",
  diag_ext_none: "Rien de notable observé sur les dates de l'opération.",
  diag_ext_weather: "{n} j de temps perturbé",
  diag_ext_events: "{n} événement(s) à proximité",
  diag_ext_holiday: "{n} j de vacances",
  diag_ext_calm: "Le contexte était plutôt calme — il n'explique pas l'écart.",
  diag_ext_partial: "Le contexte a pu jouer — à garder en tête avant d'ajuster.",
  diag_ext_weather_meas: "Vos jours frais : {cool} € en moyenne vs {mild} € par temps doux.",
  diag_exec_title: "Exécution",
  diag_exec_q: "L'action a-t-elle été menée comme prévu, chaque jour concerné ?",
  diag_exec_yes: "Oui",
  diag_exec_partial: "En partie",
  diag_exec_no: "Non",
  diag_lever_title: "Le levier",
  diag_lever_body: "Si le contexte était neutre et l'exécution complète, c'est le plan lui-même à ajuster.",
  diag_lever_exec: "Exécution incomplète repérée — commencez par là avant de changer de levier.",
  diag_todo_title: "Quoi faire",
  move_title: "Votre prochain mouvement",
  diag_move_intro: "Choisissez votre prochain move :",
  move_intro_ontrack: "Ça marche. À vous de décider la suite — poussez l'avantage ou sécurisez le résultat :",
  move_poursuivre: "Poursuivre",
  move_poursuivre_d: "Garder le plan, mieux le tenir.",
  move_doubler: "Doubler la mise",
  move_doubler_d: "Plus de ce qui marche.",
  move_pivoter: "Pivoter",
  move_pivoter_d: "Changer l'approche, puis remesurer sur de nouvelles dates.",
  move_stop: "Arrêter",
  move_stop_d: "Abandonner cette action — clôture, la carte revient à piloter.",
  diag_move_note_q: "Qu'avez-vous changé ?",
  diag_move_note_stop_q: "Pourquoi arrêter ?",
  diag_move_hint_caption: "Les exemples s'adaptent au type d'action.",
  diag_move_cta: "Engager →",
  diag_recommended: "recommandé",
  move_track: "ici : {hits}/{attempts} fois → objectif atteint",
  diag_bestinclass: "Comment des lieux comparables s'y prennent",
  diag_soon: "bientôt",
  diag_bic_caption: "Un cas comparable à tester — pas un résultat promis.",
  // One title (reuses the app's "dispositif" vocabulary — cf. "Votre dispositif"); the verdict→intent
  // nuance lives in the subline: pivot (en-dessous) · reinforce (aligné) · scale (au-dessus).
  diag_bic_title: "Dispositifs qui ont fonctionné ailleurs",
  diag_bic_caption_pivot: "Une autre approche à tester — pas un résultat promis.",
  diag_bic_caption_reinforce: "Comment des lieux comparables ont amplifié ce type d'action.",
  diag_bic_caption_scale: "Comment d'autres ont pérennisé ce type de résultat.",
  diag_bic_result: "Résultat",
  diag_bic_howto: "Comment faire ?",
  diag_bic_source: "Source",
  diag_bic_conf_eleve: "source fiable",
  diag_bic_conf_moyen: "à confirmer",
  diag_bic_conf_faible: "indicatif",
  diag_capitalise_title: "Capitaliser",
  diag_capitalise_body: "Ce que vous ajustez — et son résultat — rejoint votre Bilan. La mémoire du lieu, réutilisable la prochaine fois.",

  // ── ④ Action menée & retour ──
  q4_title: "Action menée & retour",
  done_question: "Action menée ?",
  done_yes: "Fait",
  done_no: "Pas encore",
  done_confirmed: "Action menée · confirmé par {name}",
  dispositif_label: "Votre dispositif",
  dispositif_ph: "Offre, canal, timing…",
  retro_question: "Qu'est-ce qui a marché, ou pas ?",
  retro_ph: "Ce que vous garderiez, ce que vous changeriez",
  // ── Documenter (Spec 2) — structured retro = the reusable knowledge-base entry.
  q4_title_doc: "Documenter",
  doc_hint: "Ce retour reste attaché à l'action — repère pour la prochaine fois et pour l'équipe.",
  edit: "Éditer",
  cancel: "Annuler",
  not_documented: "Pas encore documenté.",
  not_dispositioned: "Pas encore renseigné.",
  retro_worked_q: "Qu'est-ce qui a marché ?",
  retro_worked_ph: "Ce qui a porté le résultat",
  retro_change_q: "Qu'est-ce que je changerais ?",
  retro_change_ph: "Ce que vous ajusteriez la prochaine fois",
  retro_repeat_q: "À reproduire ?",
  repeat_yes: "Oui",
  repeat_no: "Non",
  save: "Enregistrer",
  saved: "Enregistré",

  // ── Sources & fiabilité ── (named providers = value + confidence)
  sources_title: "Sources & fiabilité",
  src_caisse: "Votre caisse — CA quotidien",
  src_weather: "Météo-France — météo & alertes vigilance",
  src_events: "OpenAgenda & Agendas régionaux — événements à proximité",
  src_tourism: "INSEE & OpenHolidays — tourisme & vacances scolaires",
  src_learning: "Vos données — CA habituel appris sur vos {days} derniers jours",
  // shown only when the action has a sufficient commitment track record (never a placeholder).
  // "N fois sur M" — never "prouvé" / "marche à X %".
  src_track_record: "Vos données — CA au-dessus de votre habituel {beat} fois sur {done} pour cette action",
  // Type A empty state — gated on commitment COUNT (not data ingestion). Honest + encourages use.
  src_track_pending: "Bilan de vos actions — se construit au fil de vos engagements menés à terme",
  // Case studies surfaced in "Dispositifs qui ont fonctionné ailleurs" — cited in the provenance list.
  src_bestinclass: "Études de cas — {list}",
};

export type EvolCopy = typeof EVOL_COPY;
```

## src/lib/sensitivity/sensitivityCopy.ts
```
// Type B — French copy for citing sensitivities. OWNER: your voice pass lives here; no
// French is hardcoded in consumers. Rules (see memory french-copy-voice): terse noun-phrases,
// mirror the app's real strings, no robotic LLM French, no hedge-paragraphs.
//
// THE LINE STATES THE OBSERVED HISTORY AS FACT — it happened, so no hedging ("pourrait",
// "à confirmer", "signal préliminaire"). Honesty lives in the SAMPLE shown, not weasel-words:
// always the count behind the rate ("19 jours sur 27, soit 70 % des fois") + the period it was
// drawn from, so the operator judges representativeness himself. The TIER gates INFLUENCE
// (canInfluence — whether it may drive a move/baseline), NOT the wording.
// [PERIOD: "pour la période …" is pending — needs a period field wired store→accessor→type.]

import type { Sensitivity, Tier } from "./sensitivityStore";

// feature key -> French label (extends with the taxonomy; owner refines wording)
export const FEATURE_FR: Record<string, string> = {
  heat: "Forte chaleur",
  cold: "Grand froid",
  rain: "Pluie",
  wind: "Vent fort",
  snow: "Neige",
  tourism_peak: "Affluence touristique",
  school_holiday: "Vacances scolaires",
  public_holiday: "Jour férié",
};

// section headings by register (a consumer groups rows under these)
export const TIER_SECTION: Record<Tier, { heading: string; caveat: string }> = {
  etabli: { heading: "Réactions établies", caveat: "Effets mesurés, toutes choses égales." },
  emergent: { heading: "Tendances en confirmation", caveat: "Se précisent au fil des données." },
  preliminaire: { heading: "Signaux préliminaires", caveat: "À confirmer — trop tôt pour trancher." },
};

// The ONE tier word, as a token that can appear INSIDE a sentence (TIER_SECTION's headings are for
// grouping rows; they don't fit mid-sentence). Used by the tiered causal register (Phase 1 #5): a causal
// sentence is legal only when it carries the tier token of the measured fact it cites, so the register is
// visible to the operator and checkable by the validator.
//
// This does NOT contradict the no-hedging rule above: a FACT line still states observed history flat, with
// the sample carrying the honesty. The token is required only when the model UPGRADES that fact into a
// causal claim — the upgrade is what must be labelled, not the fact.
export const TIER_TOKEN_FR: Record<Tier, string> = {
  etabli: "établi",
  emergent: "émergent",
  preliminaire: "préliminaire",
};


// ── Today-conditional operator phrasing (the A+B synthesis). LOCKED language rules:
// never "l'attendu"; "plus bas/haut que d'habitude / qu'une journée comparable"; consistency
// reads "N fois sur 10"; Type A track record reads "N fois sur M" / "ça a payé", never "prouvé".
export const ACTION_FR: Record<string, string> = {
  offre_appel: "une offre d'appel",
};
export interface TrackRecord { action_type: string; beat: number; done: number }

const pctInt = (s: Sensitivity): number => Math.round(Math.abs(s.effect_size) * 100);
const higherLower = (s: Sensitivity): string => (s.direction === "down" ? "plus bas" : "plus haut");
const actionFr = (t: string): string => ACTION_FR[t] || t;
const de = (label: string): string => (/^[aàâeéèêiîoôu]/i.test(label) ? `d'${label}` : `de ${label}`);
const featOf = (s: Sensitivity): string => de((FEATURE_FR[s.feature] || s.feature).toLowerCase());
// count behind the rate: how many feature-on days the effect actually held.
const heldDays = (s: Sensitivity): number => Math.round((s.consistency_pct / 100) * s.n_days);
// the sample tail every env line shares: "19 jours sur 27, soit 70 % des fois".
// ISO "2026-04-18" -> "18/04/2026" (JJ/MM/AAAA — France).
const frDate = (iso: string): string => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
// "19 jours sur 27, soit 70 % des fois" + the window it was drawn from (representativeness).
const sampleFr = (s: Sensitivity): string => {
  const base = `${heldDays(s)} jours sur ${s.n_days}, soit ${Math.round(s.consistency_pct)} % des fois`;
  return (s.period_start && s.period_end)
    ? `${base} pour la période du ${frDate(s.period_start)} au ${frDate(s.period_end)}`
    : base;
};

// Engine 2 — your environment, today-conditional (insight / prompt: "comme aujourd'hui").
// States the observed history as fact; the sample (count + rate) carries the honesty, not hedging.
export function envTodayLine(s: Sensitivity): string {
  return `Les jours ${featOf(s)} comme aujourd'hui, votre CA a été ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}
// Engine 2 — period framing (report: "vos journées de forte chaleur").
export function envPeriodLine(s: Sensitivity): string {
  return `Vos journées ${featOf(s)} : CA ~${pctInt(s)} % ${higherLower(s)} qu'une journée comparable — ${sampleFr(s)}.`;
}
// Engine 1 — your measured track record. "N fois sur M" / "ça a payé", never "prouvé"/rate.
export function actionLine(a: TrackRecord): string {
  return `Les fois où vous avez lancé ${actionFr(a.action_type)} ces jours-là, ça a payé — ${a.beat} fois sur ${a.done}.`;
}
// The move — soft, only when the Type A track record qualifies (reconduire gate; caller enforces).
export function moveLine(a: TrackRecord): string {
  return `Envisagez de relancer ${actionFr(a.action_type)} aujourd'hui.`;
}
// The reconduire gate (mirrors commitmentContext): a real, positive track record only.
export function trackRecordQualifies(a: TrackRecord): boolean {
  return a.done >= 5 && a.beat >= 4 && a.beat / a.done >= 0.70;
}

// One vetted sensitivity -> one cited line, in its tier's register. This is what every
// consumer renders / feeds the LLM verbatim; the LLM MUST NOT rephrase beyond this.
export function citeSensitivity(s: Sensitivity): string {
  return `${FEATURE_FR[s.feature] || s.feature} : les jours comme aujourd'hui, CA ~${pctInt(s)} % ${higherLower(s)} que d'habitude — ${sampleFr(s)}.`;
}

// Engine 1 × Engine 2 decomposition — an OBSERVED DIFFERENCE, never a proven cause. The line states
// the gap between action-days and no-action-days on this factor; it NEVER says "your action generated".
// `n` is the INDEPENDENT unit (number of engagements/commitment windows) — never the inflated day count,
// so the operator judges representativeness himself.
export interface DecompositionCite { factor: string; action_delta: number; n: number }
export function decompositionLine(d: DecompositionCite): string {
  const pts = Math.round(Math.abs(d.action_delta));
  const dir = d.action_delta >= 0 ? "au-dessus" : "en-dessous";
  const feat = de((FEATURE_FR[d.factor] || d.factor).toLowerCase());
  return `Les jours ${feat} où vous avez agi, vous étiez ${d.action_delta >= 0 ? "+" : "−"}${pts} pts ${dir} de vos journées ${feat} sans action — sur ${d.n} engagement${d.n > 1 ? "s" : ""}, à confirmer.`;
}
```

## Phrases d'action réelles (public/action-cards.js — ACTION_SENTENCES)
```
'À faire : reprendre contact en direct — comprendre si la pause est saisonnière, un point de friction, ou un départ chez un concurrent.'
'À faire : reconstituer la semaine (fermetures, absence, contexte local), puis ajuster ce qui se pilote à ce terme — achats et animation.'
'À faire : identifier ce qui a porté la semaine (client, opération, contexte) — et le noter pour le rejouer sciemment.'
'À faire : passer les comptes du mois en revue — qui n’a pas commandé, et pourquoi ? Le grain client (cartes clients) dit qui relancer.'
'À faire : comprendre chaque gros compte du mois (commande unique ou nouveau rythme ?) — et sécuriser le réassort de ce qu’ils achètent.'
'À adapter : repli intérieur ou dispositif abrité — décision la veille.'
'À faire : ouvrir la comparaison et choisir le jour.'
'À faire : briefer l’équipe ce soir — Communiquer pré-rempli.'
'À faire : documenter ce qui a marché — la fiche se pré-remplit depuis le dossier (30 secondes).'
'Communiquer : sollicitez des avis clients pour équilibrer.'
'Communiquer : capitalisez sur votre réputation.'
'Faire suivre : vérifiez si vos horaires restent compétitifs.'
'À capter : un concurrent affiche complet. Adressez-vous au public qui n'
'À défendre : un concurrent intensifie ses publications. Maintenez votre présence pour ne pas perdre en partage d'
'À capter : un concurrent est silencieux sur ses canaux. Prenez la parole maintenant pour occuper l'
'À capter : une campagne institutionnelle proche peut générer du passage. Préparez une offre ou un message pour capter ce flux.'
'À capter : une mention média dans votre zone peut générer de la visibilité. Relayez-la et préparez un message pour convertir ce passage.'
'Faire suivre : partagez le bilan avec votre équipe.'
```
