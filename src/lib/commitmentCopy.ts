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
  subtitle: "Objectif {level} · {window}",
  owner_line: "Engagé par {name} · le {date}",
  done_suffix: " · action menée le {date}",

  // ── ① Au-dessus / en-dessous de l'objectif ? ──
  q1_title: "Situation par rapport à l'objectif ?",
  q1_agg_pos: "+{pct} % au-dessus du CA habituel",
  q1_agg_neg: "{pct} % en-dessous du CA habituel",
  q1_window: "sur toute la fenêtre ({days} jours)",
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
  q1_window_started: "La fenêtre a démarré — le suivi jour par jour apparaîtra ici au fil des ventes.",

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
  // vs objectif — position of the effect against the owner's COMMITTED goal (not just vs habituel).
  // Resolved → the authoritative verdict; open → the % target the owner set + current position.
  q1_objectif_line: "Objectif : +{pct} % vs habituel",
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
  q2_caveat: "Signaux observés sur la fenêtre — corrélations, pas des causes établies.",
  ctx_impact_weather: "Jours frais ou pluvieux — {cool} € en moyenne, vs {mild} € par temps doux (90 j).",
  ctx_calendar_holiday: "Vacances scolaires — {n} jours sur la fenêtre.",
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
  advice_track_reconduire: "Menée {done} fois — le CA a battu l'attendu {beat} fois. À reconduire.",
  advice_track_mitige: "Menée {done} fois — le CA a battu l'attendu {beat} fois. Résultats mitigés, à confirmer.",
  advice_track_ne_pas: "Menée {done} fois — le CA a battu l'attendu {beat} fois seulement. À ne pas reconduire tel quel.",
  // §2c — missed & done: descriptive honest statement, no "revoir l'approche" filler
  advice_missed_descriptive: "Aucun effet visible sur le CA.",
  advice_replay_retest: "À retenter pour confirmer.",

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
  src_track_record: "Vos données — CA au-dessus de l'attendu {beat} fois sur {done} pour cette action",
  // Type A empty state — gated on commitment COUNT (not data ingestion). Honest + encourages use.
  src_track_pending: "Bilan de vos actions — se construit au fil de vos engagements menés à terme",
};

export type EvolCopy = typeof EVOL_COPY;
