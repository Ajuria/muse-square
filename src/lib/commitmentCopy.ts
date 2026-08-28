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
  // 22/08 — « mouvement » et « move » disaient la même chose de deux façons, dont une en
  // anglais. Retenu : « action ». Vérifié avant de le prendre — ce fichier appelle DÉJÀ
  // l'engagement « votre action » (q1_attrib_split, q1_decomp_action) : le mot ne
  // s'ajoute pas, il s'aligne. La collision redoutée avec « Actions du jour » (le fil de
  // cartes) n'existe pas sur cette surface, qui est la vue DÉTAILLÉE d'une seule carte.
  // « geste » écarté : 43 emplois en commentaire contre 7 en chaîne — mot de code, pas
  // mot d'écran.
  back: "Retour aux engagements",

  // subtitle under the title (goal terms recap; owner + date get their own line)
  subtitle: "Objectif : +{pct} % de CA vs votre résultat habituel · sous {window}",
  // Variante KPI-vrai (owner 15/08) : le sous-titre nomme le KPI DÉCLARÉ, jamais « CA » en dur.
  subtitle_kpi: "Objectif : +{pct} % de {kpi} vs votre résultat habituel · sous {window}",
  // L'INTRAPRENEUR SE VOIT (owner 28/08 : « tu invisibilises l'intrapreneur ») : son nom
  // porte l'opération, il n'est pas une mention de bas de page en gris.
  owner_line: "Engagé par {name} · le {date}",
  owner_badge: "Porté par",
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
  q1_objectif_confounded: "Objectif non concluant (vacances)",
  // Lead hierarchy (goal-first): primary status + progress-to-goal bar + attribution.
  // LE RÉSULTAT EN UNE LIGNE (owner 28/08) : le chiffre en gros, le verdict à sa droite,
  // le détail dans l'infobulle. « en-deçà de votre objectif » = mots owner.
  q1_result: "{pct} de ventes",
  q1_ontrack: "au-delà de votre objectif",
  q1_below: "en-deçà de votre objectif",
  q1_tip_split: "Situation {sit} % · dont vacances {hol} % sans action · effet de votre action {act} %. Mesuré sur {n} {jours}.",
  q1_tip_plain: "Écart à votre résultat habituel sur {n} {jours}. Objectif : {goal}.",
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
  advice_met_hold: "Objectif atteint — à reconduire.",
  // Type A track record (fct_location_commitment_learning). "N fois sur M" only — NEVER "prouvé"
  // ni "marche à X %" (self-selected operator track record, not an effectiveness rate).
  advice_track_reconduire: "Menée {done} fois — le CA a battu votre résultat habituel {beat} fois. À reconduire.",
  advice_track_mitige: "Menée {done} fois — le CA a battu votre résultat habituel {beat} fois. Résultats mitigés, à confirmer.",
  advice_track_ne_pas: "Menée {done} fois — le CA a battu votre résultat habituel {beat} fois seulement. À ne pas reconduire tel quel.",
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
  // Accord écrit, jamais « (s) » : une parenthèse de pluriel est une signature de machine.
  diag_ext_weather: "{n} journée de temps perturbé",
  diag_ext_weather_pl: "{n} journées de temps perturbé",
  diag_ext_events: "{n} événement à proximité",
  diag_ext_events_pl: "{n} événements à proximité",
  diag_ext_holiday: "{n} jour de vacances scolaires",
  diag_ext_holiday_pl: "{n} jours de vacances scolaires",
  diag_ext_calm: "Le contexte était plutôt calme — il n'explique pas l'écart.",
  diag_ext_partial: "Le contexte a pu jouer — à garder en tête avant d'ajuster.",
  // La météo mesurée ne se dit QUE si l'opération en a connu — sinon c'est une statistique
  // orpheline au milieu du résultat du jour (« énigme », owner 28/08).
  diag_ext_weather_meas: "Ces jours-là, vous faites {cool} € en moyenne, contre {mild} € par temps doux.",
  diag_exec_title: "Exécution",
  diag_exec_q: "L'action a-t-elle été menée comme prévu, chaque jour concerné ?",
  diag_exec_yes: "Oui",
  diag_exec_partial: "En partie",
  diag_exec_no: "Non",
  diag_lever_title: "Le levier",
  diag_lever_body: "Si le contexte était neutre et l'exécution complète, c'est le plan lui-même à ajuster.",
  diag_lever_exec: "Exécution incomplète repérée — commencez par là avant de changer de levier.",
  diag_todo_title: "Quoi faire",
  // C3 (owner 27/08) : « Ajuster » est le bouton amont (journal) — la section qui reçoit
  // porte le même mot : « Ajuster le dispositif » remplace « Votre prochaine action ».
  move_title: "Ajuster le dispositif",
  // Lecture du jour (étape 4, 27/08) — l'état daté de la version ouverte, sur le KPI choisi.
  // Les propositions n'apparaissent qu'après au moins 3 bilans jour ; la route négative
  // exige au moins 3 journées négatives (owner : jamais sur 1 signal).
  lecture_line: "Lecture du {date} — {n} {jours} : objectif {etat} à ce jour.",
  lecture_up: "Le résultat dépasse l'objectif et sort du bruit de votre lieu — relevez l'objectif de la version suivante.",
  lecture_down: "{n} journées sous votre résultat habituel — modifiez le dispositif ou l'opération sans attendre la fin.",
  diag_move_intro: "Choisissez votre prochaine action :",
  move_intro_ontrack: "Ça marche. À vous de décider la suite — poussez l'avantage ou sécurisez le résultat :",
  move_poursuivre: "Poursuivre",
  move_poursuivre_d: "Garder le plan, mieux le tenir.",
  move_doubler: "Doubler la mise",
  move_doubler_d: "Plus de ce qui marche.",
  move_pivoter: "Pivoter",
  move_pivoter_d: "Changer l'approche, puis remesurer sur de nouvelles dates.",
  // Contexte de la version (étape 3, 27/08) — le sous-formulaire de la version suivante.
  // Mots owner verbatim : Levier · Étape de la vente · Ressource(s) · Responsable(s) ·
  // Le plus du dispositif · Pourquoi ça va marcher.
  // Pôle / dispositif permanent (P3, 27/08) — la page d'un pôle : lecture continue, jamais
  // un mot de verdict (un permanent n'a pas de terme).
  // Mots owner 27/08 (proto v2) : « lecture continue » ne se dit pas à l'utilisateur —
  // « Dispositif en continu » (nature) et « Résultats » (la mesure) ; le détail « kitchen »
  // (comptes de jours) vit en infobulle, jamais dans la pill (« Données insuffisantes »).
  pole_chip: "Dispositif en continu",
  pole_resp: "Responsable(s)",
  pole_fams_title: "Familles du pôle",
  pole_reading_title: "Résultats — 30 derniers jours",
  pole_reading_caption: "€/j des jours vendus, comparé aux 90 jours précédents.",
  pole_reading_row: "{n30} j vendus · habituel {base} €/j",
  pole_reading_thin: "Données insuffisantes",
  pole_reading_thin_tip: "{n30} jours vendus sur les 30 derniers — la comparaison demande au moins 5 jours vendus de chaque côté.",
  pole_totals_row: "{rev} € sur 30 j · {share} % du CA",
  pole_ops_title: "Opérations sur ce pôle",
  pole_ops_none: "Aucune opération rattachée pour l'instant.",
  pole_op_open: "en cours",
  pole_op_done: "terminée",
  vform_title: "La version suivante",
  vform_stage: "Étape de la vente",
  vform_goal: "Objectif de cette version",
  vform_goal_calib: "La version {n} a mesuré {pct} — objectif proposé : {goal} %.",
  vform_lever: "Levier",
  vform_resp: "Responsable(s)",
  vform_res: "Ressource(s)",
  vform_plus: "Le plus du dispositif",
  vform_why: "Pourquoi ça va marcher",
  vform_cost: "Coût de l'opération (€) — optionnel",
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

  // ── Les DEUX états de la page (owner 28/08) — « Opération en cours » pilote, « Opération
  // terminée » conclut. Le feedback (Documenter) n'existe que dans le second : c'est déjà la
  // règle du rail (le rétro est refusé avant résolution), la page la reflète enfin.
  state_open: "En cours · verdict d’ici le {date}",
  state_done: "Terminée · {date}",
  state_dates: "Dates de l’opération : du {start} au {end}",
  dispo_title: "Votre dispositif",
  dispo_note_label: "Description du dispositif",
  dispo_note_ph: "Ce que l’opération fait au quotidien",
  dispo_none: "Pas encore renseigné.",

  // ── « Comprendre le résultat » (owner 28/08) — la lecture qui manquait : d'où vient
  // l'écart, pour pouvoir pivoter au lieu de subir le verdict. UN SEUL référentiel de niveau
  // (celui de l'en-tête) : heures et familles se lisent en PART de la journée, achats/panier
  // se décompose contre le résultat habituel et somme exactement à son écart.
  shape_title: "Comprendre le résultat",
  // LES DEUX TEMPS DE LA PAGE (owner 28/08) : on comprend, puis on décide. La coupure est
  // structurelle — même blocs, frontière lisible.
  part_comprendre: "Comprendre",
  part_decider: "Décider",
  part_conclure: "Conclure",
  shape_intro: "{n} jour mesuré sur {total}.",
  shape_intro_pl: "{n} jours mesurés sur {total}.",
  // Un seul jour mesuré : on NOMME le jour de semaine (« vos quatre derniers jeudis »),
  // comme l'exploitant le dit. Plusieurs jours : chaque journée a sa propre référence.
  shape_ref_jour: "",
  shape_ref_multi: "",
  shape_hours_title: "Quels moments",
  shape_hours_lead: "Votre meilleur créneau : {from} h–{to} h, {share} % du chiffre du jour contre {ref} % d’habitude.",
  // « autant en moins sur le reste » n'est plus vrai depuis que la référence est le
  // résultat habituel : les écarts ne s'annulent plus, ils somment à l'écart du jour.
  shape_hours_shift: "{eur} € de plus que d’habitude sur ce créneau.",
  shape_hours_note: "Barres : le CA par heure · trait : votre résultat habituel, réparti comme un jour ordinaire.",
  shape_fams_title: "Familles de produits",
  // Le sous-titre ne décrit plus l'ordre de tri (« blabla ») : il dit ce qu'on peut faire.
  shape_fams_note: "Ouvrez une famille pour voir les produits qui la font bouger.",
  shape_fams_ref: "{eur} € · sa part habituelle : {ref} €",
  // Le cran produit : une famille se déplie sur ses articles, même lecture en part.
  shape_prod_ref: "{eur} € · habituel {ref} €",
  shape_prod_rest: "{n} autres produits de la famille : {eur} € au total.",
  // « D'où vient la fluctuation » (mots owner 28/08) — trois facteurs, dont le produit est
  // la variation du CA. Chaque ligne porte son référentiel ; aucune n'est un calcul déguisé.
  shape_vol_title: "Décomposition des ventes",
  // LE mot du lexique pour ce référentiel (docs/lexique.md) : « vos jours comparables ».
  // « habituel » est réservé au résultat appris sur des mois — 4 occurrences n’en font pas un.
  shape_vol_caption: "vs vos jours comparables",
  shape_vol_caption_tip: "Vos {n} derniers {jour}s : {dates}. Les trois facteurs se multiplient : leur produit est la variation du chiffre.",
  shape_vol_l_tx: "Nombre d’achats",
  shape_vol_l_items: "Articles par achat",
  shape_vol_l_price: "Prix moyen d’un article",
  shape_vol_val: "{v} contre {ref}",
  shape_vol_total: "Chiffre du jour : {pct} vs vos jours comparables.",
  shape_vol_lead_1: "Ce qui bouge : {f}.",
  shape_vol_lead_2: "Ce qui bouge : {f1}, puis {f2}.",
  shape_vol_f_tx: "le nombre d’achats",
  shape_vol_f_items: "le nombre d’articles par achat",
  shape_vol_f_price: "le prix moyen des articles",
  shape_vol_types: "Quels articles : ouvrez une famille plus bas.",
  shape_vol_none: "Une seule journée mesurée ne suffit pas encore à décomposer la fluctuation.",
  shape_ctx_title: "Contexte externe",
  shape_none: "Pas encore de journée mesurée — la lecture s’ouvre dès la première.",

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
  src_track_record: "Vos données — CA au-dessus de votre résultat habituel {beat} fois sur {done} pour cette action",
  // Type A empty state — gated on commitment COUNT (not data ingestion). Honest + encourages use.
  src_track_pending: "Bilan de vos actions — se construit au fil de vos engagements menés à terme",
  // Case studies surfaced in "Dispositifs qui ont fonctionné ailleurs" — cited in the provenance list.
  src_bestinclass: "Études de cas — {list}",
};

export type EvolCopy = typeof EVOL_COPY;
