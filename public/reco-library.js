// ── Sales action reco library — OWNER-EDITABLE CONTENT (your voice pass) ──
//
// This is the source of the 3 recommended actions the "M'engager" form proposes
// (and the sales report's "Actions recommandées"). Edit the STRINGS here — this is
// your business voice, not LLM 101.
//
// MECHANISM: action-cards.js is a static /public asset that can't import TS, so this
// is a browser global (loaded via <script src="/reco-library.js?v=N"> BEFORE
// action-cards.js on every surface that shows recos — currently pulse + rapport).
// action-cards.js reads window.MS_SALES_RECO_LIB and attaches spec.recos (the 3) +
// spec.reco (the top one). If this file is missing, recos degrade to empty (the
// "Mon action" field is blank, never wrong) — but a surface that shows commitments
// MUST load it.
//
// QUALITY BAR — every line must clear it (see CLAUDE.md "Card Quality Bar"):
//   • specific & controllable (a manager can DO it this week)
//   • €-relevant (moves the lever the card flagged)
//   • vertical-correct (tune wording to your client verticals in your pass)
//   • non-obvious (no "communiquez plus" 101 filler)
//
// SHAPE: each entry is a list of PLAN OBJECTS { title, description, why, tag } — three plans for the
// CARD'S driver (a conversion card gets three conversion plans, NOT one per driver). The insight
// "Plan à essayer" renders them premium (title · description · "Pourquoi …" · tag chip). A legacy
// bare string is still accepted (renders title-only) — but new content should be the object form.
//   title       — the action, imperative noun-phrase (becomes the M'engager text lead)
//   description — how, one line
//   why         — the rationale ("Pourquoi …"), non-obvious, no 101 filler
//   tag         — the lever chip (e.g. "Conversion", "Panier", "Yield / anticipation")
//   steps       — OPTIONAL string[] : 2-4 concrete "how to execute" steps (rendered as the insight
//                 "Comment faire ?" expand). Owner-editable here; the best-in-class crawl fills its own.
//   source      — OPTIONAL string : citation for the bottom "Références" footer (null for reco plans;
//                 populated for crawled case studies).
//
// COVERAGE INVARIANT: every card type in COMMITMENT_ORIGIN_ACTION_TYPES
// (src/lib/commitmentOrigins.ts) MUST have an entry here. v1 allowlist =
// sales_surge, sales_revenue_down_wow, sales_traffic_not_converting,
// sales_discount_no_lift, footfall_vs_basket_decomposition. When the allowlist
// grows (opportunity/threat/weather/tourism families), add recos here in lockstep.
//
// Keys: <card_type> → { <driver>: [plan, plan, plan], _default: [plan, plan, plan] }.
// Driver = item.primary_revenue_driver | dominant_factor, lowercased
// (transactions folds into footfall). _default is used when no driver matches.

window.MS_SALES_RECO_LIB = {

  // CA en baisse semaine/semaine — actions selon le levier qui décroche.
  sales_revenue_down_wow: {
    conversion: [
      { title: "Offre d'appel sur vos créneaux creux", description: "Formule ou menu du jour, pour convertir le passage sans casser vos prix.", why: "Un prix d'entrée déclenche l'achat au moment où le passage est là mais n'achète pas.", tag: "Conversion", steps: ["Choisir une formule ou un menu du jour à prix d'appel.", "L'afficher clairement sur vos créneaux creux (ardoise, caisse, réseaux).", "Briefer l'équipe pour la proposer systématiquement à faible affluence."] },
      { title: "Reprenez le parcours d'achat aux heures creuses", description: "Mise en avant produit, signalétique claire, encaissement fluide.", why: "Aux heures creuses, un parcours sans friction transforme le passant hésitant en client.", tag: "Conversion", steps: ["Rendre le produit phare visible dès l'entrée.", "Vérifier la signalétique et des prix lisibles.", "Fluidifier l'encaissement — moins d'attente, plus de conversions."] },
      { title: "Briefez l'équipe sur la proposition active", description: "Accueil, conseil, relance en caisse quand l'affluence est faible.", why: "À faible affluence, l'équipe a le temps de conseiller — c'est là que se gagne la vente.", tag: "Équipe", steps: ["Définir la proposition du jour en une phrase.", "La partager à l'équipe en début de service.", "Relancer en caisse (« vous avez vu notre… ? »)."] },
    ],
    basket: [
      { title: "Systématisez la montée en gamme", description: "Option supérieure ou accompagnement proposé à chaque vente.", why: "Le panier monte sans trafic supplémentaire — la marge la plus rapide à récupérer.", tag: "Panier" },
      { title: "Formules à panier plus élevé, visibles en caisse", description: "2-3 formules mises en avant à l'encaissement.", why: "Rendre l'option premium visible au bon moment suffit souvent à la déclencher.", tag: "Panier" },
      { title: "Vente additionnelle ciblée", description: "Formez l'équipe au bon complément, au bon moment.", why: "Un complément pertinent vaut mieux qu'un « et avec ceci ? » réflexe.", tag: "Équipe" },
    ],
    footfall: [
      { title: "Communication ciblée sur vos créneaux faibles", description: "SMS clients fidèles, réseaux, fiche Google.", why: "Ramener vos habitués sur les jours creux coûte moins que conquérir de nouveaux clients.", tag: "Trafic" },
      { title: "Offre d'appel limitée dans le temps", description: "Une raison de venir maintenant sur les jours creux.", why: "L'urgence datée transforme l'intention en visite avant qu'elle ne s'oublie.", tag: "Trafic" },
      { title: "Visibilité locale à jour", description: "Fiche Google, horaires, photos, pour capter la recherche de proximité.", why: "La plupart des visites de proximité passent par une recherche — soyez trouvable et à jour.", tag: "Visibilité" },
    ],
    _default: [
      { title: "Offre d'appel sur vos créneaux creux", description: "Ramener du flux et convertir le passage.", why: "Un prix d'entrée fait venir et déclenche l'achat sans éroder tous vos prix.", tag: "Trafic" },
      { title: "Montée en gamme à l'encaissement", description: "Mise en avant produit et option supérieure pour relever le panier.", why: "Le panier monte sans trafic supplémentaire — la marge la plus rapide à récupérer.", tag: "Panier" },
      { title: "Communication ciblée sur les jours faibles", description: "Clients fidèles, fiche Google.", why: "Ramener vos habitués sur les jours creux coûte moins que conquérir de nouveaux clients.", tag: "Trafic" },
    ],
  },

  // CA en hausse — capitaliser et sécuriser ce qui a marché.
  sales_surge: {
    basket: [
      { title: "Reconduisez le levier qui a fait monter le panier", description: "Mise en avant, formule — et mesurez l'effet la semaine suivante.", why: "Ce qui a marché une fois est votre meilleur pari — encore faut-il le rejouer sciemment.", tag: "Panier" },
      { title: "Sécurisez le réassort des produits à forte marge", description: "Ceux qui ont porté la hausse ne doivent pas manquer.", why: "Une rupture sur un produit qui tire la marge transforme une hausse en occasion manquée.", tag: "Marge" },
      { title: "Poussez la montée en gamme tant que la demande est là", description: "Option supérieure proposée pendant que le flux achète.", why: "La demande chaude accepte plus facilement le premium — la fenêtre est courte.", tag: "Panier" },
    ],
    footfall: [
      { title: "Transformez ce flux en retours", description: "Incitation à la prochaine visite : fidélité, offre datée.", why: "Un pic sans mécanique de retour ne laisse rien une fois passé.", tag: "Fidélisation" },
      { title: "Ajustez le staffing pour tenir le pic", description: "Assez de monde pour l'accueil sans dégrader l'expérience.", why: "Un pic mal tenu déçoit au pire moment — quand tout le monde regarde.", tag: "Équipe" },
      { title: "Sollicitez les avis clients maintenant", description: "Pendant que l'affluence et la satisfaction sont hautes.", why: "Les avis se récoltent quand le client est content — c'est-à-dire maintenant.", tag: "Réputation" },
    ],
    _default: [
      { title: "Reconduisez le levier qui a porté la hausse", description: "Et mesurez-le sur la semaine suivante.", why: "Ce qui a marché une fois est votre meilleur pari — encore faut-il le rejouer sciemment.", tag: "À reconduire" },
      { title: "Sécurisez staffing et réassort", description: "Tenir le pic sans dégrader l'expérience ni rompre les produits clés.", why: "Un pic mal servi ou en rupture transforme une hausse en occasion manquée.", tag: "Opérations" },
      { title: "Capitalisez sur la satisfaction", description: "Avis clients et incitation au retour.", why: "La satisfaction chaude est le meilleur moment pour récolter avis et prochaine visite.", tag: "Fidélisation" },
    ],
  },

  // Du passage mais peu de conversion — trois leviers de conversion.
  sales_traffic_not_converting: {
    _default: [
      { title: "Offre d'appel sur le créneau concerné", description: "Transformer le passage en vente.", why: "Du passage qui n'achète pas signale un déclencheur manquant, pas un problème de flux.", tag: "Conversion" },
      { title: "Rendez visible et facile à acheter ce qui attire", description: "Mise en avant, prix lisibles, parcours court.", why: "Le passant achète ce qu'il comprend vite — la friction tue la vente d'impulsion.", tag: "Conversion" },
      { title: "Briefez l'équipe sur la proposition active", description: "Accueil, conseil, relance en caisse.", why: "Un mot au bon moment convertit le curieux — encore faut-il que l'équipe sache lequel.", tag: "Équipe" },
    ],
  },

  // Remises sans effet mesuré — discipline promotionnelle.
  sales_discount_no_lift: {
    _default: [
      { title: "Réservez les remises à vos clients fidèles", description: "Clients à forte valeur ; stoppez les promos sans lift mesuré.", why: "Une remise sans lift est de la marge donnée — ciblez-la où elle fait revenir.", tag: "Discipline promo" },
      { title: "Remplacez la remise large par une offre ciblée", description: "Créneau creux, panier seuil — et mesurez le lift.", why: "Une offre conditionnée oriente le comportement ; une remise générale l'achète sans le changer.", tag: "Ciblage" },
      { title: "Jouez la valeur perçue plutôt que le prix", description: "Formule, service, expérience.", why: "Ajouter de la valeur préserve la marge là où baisser le prix la sacrifie.", tag: "Valeur perçue" },
    ],
  },

  // Décomposition fréquentation vs panier — actions selon le levier qui pèse.
  footfall_vs_basket_decomposition: {
    footfall: [
      { title: "Communication ciblée sur vos créneaux faibles", description: "SMS clients fidèles, réseaux, fiche Google.", why: "Ramener vos habitués sur les jours creux coûte moins que conquérir de nouveaux clients.", tag: "Trafic" },
      { title: "Offre d'appel limitée dans le temps", description: "Ramener du flux sur les jours creux.", why: "L'urgence datée transforme l'intention en visite avant qu'elle ne s'oublie.", tag: "Trafic" },
      { title: "Visibilité locale à jour", description: "Fiche Google, horaires, photos — pour capter la proximité.", why: "La plupart des visites de proximité passent par une recherche — soyez trouvable.", tag: "Visibilité" },
    ],
    basket: [
      { title: "Systématisez la montée en gamme", description: "Option supérieure ou accompagnement à chaque vente.", why: "Le panier monte sans trafic supplémentaire — la marge la plus rapide à récupérer.", tag: "Panier" },
      { title: "Formules à panier plus élevé, visibles en caisse", description: "2-3 formules mises en avant à l'encaissement.", why: "Rendre l'option premium visible au bon moment suffit souvent à la déclencher.", tag: "Panier" },
      { title: "Vente additionnelle ciblée", description: "Formez l'équipe au bon complément, au bon moment.", why: "Un complément pertinent vaut mieux qu'un « et avec ceci ? » réflexe.", tag: "Équipe" },
    ],
    _default: [
      { title: "Communication ciblée sur les jours faibles", description: "Pour agir sur la fréquentation.", why: "Si la fréquentation décroche, ramener le flux prime sur le panier.", tag: "Trafic" },
      { title: "Montée en gamme et formules mises en avant", description: "Pour agir sur le panier.", why: "Si le panier décroche, relever la valeur par visite prime sur le flux.", tag: "Panier" },
      { title: "Mesurez lequel des deux leviers répond", description: "Avant d'investir davantage sur l'un ou l'autre.", why: "Fréquentation et panier ne se corrigent pas pareil — trancher évite d'arroser à côté.", tag: "Diagnostic" },
    ],
  },

  // Peu d'activité dans le périmètre — CONDITIONNÉ AU SIGNE MESURÉ (28/07).
  // Vérifié sur données réelles : sur 24 sites qui reçoivent cette carte, 4 seulement ont une
  // mesure, et les signes DIVERGENT (+88 €/j sur un lieu, −49 €/j sur le café). Un plan
  // générique « ces jours vous réussissent » serait sans fondement pour 20 sites et FAUX pour
  // l'un des quatre. Sans mesure, le geste est de MESURER — jamais d'affirmer une direction.
  // Sélection : _recoSignKey(a) lit a.enjeu.eur_year (classe competition_low, dayClassRegistry).
  low_competition_window: {

    // Le lieu gagne PLUS ces jours-là.
    enjeu_positif: [
      { title: "Sortez votre meilleure offre ces jours-là",
        description: "Ce que vous gardiez pour plus tard, annoncez-le maintenant.",
        why: "Ces journées vous rapportent déjà plus que d'habitude. Autant y mettre ce que vous avez de plus fort.",
        tag: "Communication",
        steps: ["Choisissez l'offre ou la nouveauté que vous vouliez annoncer ce mois-ci.",
                "Annoncez-la 2 jours avant, par mail ou sur vos réseaux.",
                "N'envoyez rien d'autre la semaine qui suit."] },
      { title: "Ouvrez une heure de plus, ou un service en plus",
        description: "Sur le jour le plus rempli de la période.",
        why: "Ces journées marchent déjà : le frein n'est pas d'être connu, c'est ce que vous pouvez servir.",
        tag: "Ouverture",
        steps: ["Regardez vos réservations : quel jour est le plus rempli ?",
                "Ouvrez plus tôt, fermez plus tard, ou ajoutez un service.",
                "Prévenez l'équipe la veille."] },
      { title: "Si vous payez de la pub, payez-la ces jours-là",
        description: "Plutôt que d'étaler la dépense sur tout le mois.",
        why: "Mieux vaut pousser un jour qui marche déjà que d'essayer d'en sauver un mauvais.",
        tag: "Publicité",
        steps: ["Regardez ce que vous dépensez en pub sur un mois.",
                "Mettez-en la moitié sur ces seuls jours.",
                "Comparez le nombre de clients par euro dépensé."] }
    ],

    // Le lieu gagne MOINS ces jours-là.
    enjeu_negatif: [
      { title: "Prévoyez moins de monde et moins de stock",
        description: "Ces jours-là, vous servez moins que d'habitude.",
        why: "Vos chiffres montrent que ces journées rapportent moins. Le premier levier, c'est ce que vous engagez pour les faire tourner.",
        tag: "Effectif",
        steps: ["Comparez votre planning à celui d'un jour normal.",
                "Retirez une personne, ou décalez un horaire.",
                "Commandez moins de frais.",
                "Regardez si votre marge du jour s'améliore."] },
      { title: "Donnez une raison de venir ce jour précis",
        description: "Une offre valable uniquement ce jour-là.",
        why: "Un jour creux le reste tant que rien ne pousse à venir. Une date limite fait bouger.",
        tag: "Offre",
        steps: ["Choisissez une offre simple à tenir.",
                "Dites clairement : valable le [jour] uniquement.",
                "Annoncez-la 2 jours avant.",
                "Comptez combien de clients viennent avec."] },
      { title: "Ne lancez rien ce jour-là",
        description: "Reportez les nouveautés et les grosses commandes après la période.",
        why: "Lancer quelque chose le jour où vous faites le moins, c'est lui donner sa pire chance.",
        tag: "Report",
        steps: ["Regardez ce qui est prévu sur ces jours.",
                "Repoussez ce qui n'a pas de date obligatoire.",
                "Reprogrammez-le sur un jour qui marche mieux."] }
    ],

    // AUCUNE mesure sur ce lieu (20 sites sur 24) — un seul geste : trancher.
    _default: [
      { title: "Vérifiez si ces jours sont bons ou mauvais chez vous",
        description: "Fixez-vous un objectif de chiffre d'affaires sur la période. À la fin, vous saurez.",
        why: "Chez certains, les jours calmes rapportent plus ; chez d'autres, moins. Personne ne peut le deviner à votre place, et une seule période suffit à trancher.",
        tag: "Test",
        steps: ["Fixez un objectif de chiffre d'affaires sur ces jours.",
                "Ne changez rien d'autre pendant la période.",
                "Attendez le verdict à la fin.",
                "Recommencez une fois pour confirmer."] }
    ]
  },

  // (Report-only — pas un origin d'engagement v1, mais lu par le rapport.)
  sales_competition_cannibalization: {
    _default: [
      { title: "Renforcez une différenciation que le concurrent n'a pas", description: "Offre signature ou expérience propre.", why: "On ne gagne pas une guerre de proximité en imitant, mais en offrant ce que l'autre n'a pas.", tag: "Différenciation" },
      { title: "Gagnez en visibilité là où la concurrence capte", description: "Google, réseaux, sur les créneaux disputés.", why: "À offre comparable, c'est le plus visible au bon moment qui capte la visite.", tag: "Visibilité" },
      { title: "Fidélisez pour réduire la sensibilité à l'offre concurrente", description: "Programme, relation client.", why: "Un client fidélisé compare moins — la fidélité est la meilleure barrière à la cannibalisation.", tag: "Fidélisation" },
    ],
  },

};

// ── INDUSTRY OVERRIDES — same shape (card_type → driver → [3]), keyed by client_industry_code.
// _recosFor prefers MS_SALES_RECO_LIB_BY_INDUSTRY[industry][card_type] when present, else the default
// MS_SALES_RECO_LIB above. Add an entry ONLY where the vertical wording genuinely differs (the default
// stays café/retail-flavoured; here, event-venue voice). Owner-editable, one file, incremental.
window.MS_SALES_RECO_LIB_BY_INDUSTRY = {

  live_event: {
    // Remises sans effet — voix "lieu événementiel" (yield / valeur / comptes clés) plutôt que café.
    sales_discount_no_lift: {
      _default: [
        { title: "Passer de la remise générale à l'early-bird dégressif", description: "Plein tarif à l'approche de la date, remise réservée aux réservations anticipées (−15 % à J-60, −5 % à J-30, 0 % ensuite).", why: "La remise récompense l'engagement tôt (et sécurise votre calendrier) au lieu d'éroder la marge sur tout le monde.", tag: "Yield / anticipation", steps: ["Fixer un barème daté : -15 % à J-60, -5 % à J-30, plein tarif ensuite.", "L'annoncer clairement dès l'ouverture des réservations.", "Supprimer les remises de dernière minute."] },
        { title: "Packager de la valeur plutôt que baisser le prix", description: "Au même tarif, ajouter un service à forte valeur perçue et faible coût marginal (captation vidéo, espace networking, option traiteur).", why: "Le client perçoit plus sans que vous touchiez au prix — le panier tient, la marge aussi.", tag: "Valeur perçue / panier", steps: ["Choisir 1-2 services à forte valeur perçue et faible coût (captation, networking, option traiteur).", "Les inclure dans l'offre — au même tarif, pas en supplément.", "Le mettre en avant dès la réservation (« inclus : … ») et à l'accueil."] },
        { title: "Réserver la remise aux comptes clés récurrents", description: "Tarif négocié pour les clients corporate qui reviennent (volume annuel), stop aux promos de masse ponctuelles.", why: "Un tarif fidélité sur un compte qui revient vaut plus qu'un rabais général qui ne fait pas revenir.", tag: "Fidélisation / valeur client", steps: ["Identifier les comptes corporate récurrents.", "Négocier un tarif volume annuel réservé.", "Arrêter les promos de masse ponctuelles."] },
      ],
    },
  },

};
