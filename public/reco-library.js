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
                "Vérifiez ce que votre planning permet — un changement d'horaire suppose un délai de prévenance.",
                "Sinon, tenez le créneau avec un extra ou vous-même."] },
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
      { title: "Commandez moins, et occupez l'équipe autrement",
        description: "Ces jours-là, vous servez moins que d'habitude.",
        why: "Vos chiffres montrent que ces journées rapportent moins. Ce que vous maîtrisez à 2 jours, c'est ce que vous achetez et ce que vous faites faire — pas le planning, qui suppose un délai de prévenance.",
        tag: "Achats",
        steps: ["Réduisez vos commandes de frais pour ces jours.",
                "Ne prévoyez pas d'extra.",
                "Basculez l'équipe déjà planifiée sur l'inventaire, la mise en place ou la formation.",
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

    // AUCUNE mesure sur ce lieu (20 sites sur 24). Complété 1 -> 3 le 01/08 (directive owner).
    // LIMITE DURE de cette branche : aucun plan ne doit supposer le SIGNE (bons ou mauvais
    // jours) — tout geste opérationnel (stock, équipe, offre) suppose une direction et
    // appartient aux branches mesurées, jamais à celle-ci.
    _default: [
      { title: "Vérifiez si ces jours sont bons ou mauvais chez vous",
        description: "Fixez-vous un objectif de chiffre d'affaires sur la période. À la fin, vous saurez.",
        why: "Chez certains, les jours calmes rapportent plus ; chez d'autres, moins. Personne ne peut le deviner à votre place, et une seule période suffit à trancher.",
        tag: "Test",
        steps: ["Fixez un objectif de chiffre d'affaires sur ces jours.",
                "Ne changez rien d'autre pendant la période.",
                "Attendez le verdict à la fin.",
                "Recommencez une fois pour confirmer."] },
      { title: "Placez votre prochaine annonce dans cette fenêtre",
        description: "Ce que vous deviez annoncer ce mois-ci de toute façon — dites-le ces jours-là.",
        why: "Ces jours-là, moins d'événements autour de vous se disputent votre public : votre message a le champ plus libre, quel que soit le chiffre de la journée. Une annonce se place, elle ne coûte pas plus cher au bon moment.",
        tag: "Communication",
        steps: ["Prenez l'annonce déjà prévue ce mois-ci : nouveauté, horaires d'été, événement à venir.",
                "Publiez-la pendant la fenêtre plutôt qu'à une date au hasard.",
                "Ne dépensez rien de plus — seul le moment change.",
                "Notez si elle a fait mieux que vos annonces habituelles."] },
      { title: "Testez UNE chose pendant que le signal est propre",
        description: "Moins d'événements autour de vous : ce que vous observez ces jours-là vient de chez vous.",
        why: "Un test lancé un jour agité ne se lit pas — impossible de savoir si le résultat vient de vous ou du contexte. Une fenêtre calme est le moment le plus lisible pour trancher une question que vous vous posez déjà.",
        tag: "Test",
        steps: ["Choisissez UNE question en attente : un emplacement, une formule, le prix d'un produit.",
                "Changez cette seule chose pendant la fenêtre.",
                "Comparez à vos jours normaux — le calme rend l'écart lisible.",
                "Gardez ou annulez selon le résultat — et confirmez à la prochaine fenêtre avant d'en faire une habitude."] }
    ]
  },

  // Week-end de vacances, pression sous la normale du lieu — rédigé owner 01/08.
  // Même classe d'enjeu que low_competition_window (competition_low, dayClassRegistry.ts:598),
  // textes distincts : ici la fenêtre est un week-end de vacances, connue d'avance par le
  // calendrier scolaire. Repos dominical : jamais « samedi + dimanche », toujours « vos jours
  // d'ouverture du week-end ». Brief : docs/methodes-weekend-vacation-brief.md.
  weekend_vacation_low_comp: {

    // Le lieu gagne DÉJÀ plus ces jours-là (enjeu competition_low mesuré > 0).
    enjeu_positif: [
      { title: "Jouez le week-end en deux temps : le premier jour apprend, le suivant encaisse",
        description: "De samedi à dimanche si vous ouvrez le dimanche ; sinon d'un samedi de vacances au suivant.",
        why: "Ces journées vous rapportent déjà plus que la normale, et le public de vacances revient d'un jour ouvert à l'autre. Ce que le premier vous apprend, le suivant peut l'encaisser.",
        tag: "Pilotage",
        steps: ["À la fermeture du premier jour, notez ce qui est parti le mieux et à quelle heure.",
                "À l'ouverture suivante, mettez-le en avant — première place, visible de l'entrée.",
                "Confiez l'ajustement à l'équipe déjà en poste, rien d'autre ne change."] },
      { title: "Sécurisez ce qui se vend le mieux avant samedi",
        description: "Stock, consommables, capacité : le frein d'un bon week-end, c'est la rupture.",
        why: "Un week-end favorable perdu sur une rupture ne se rattrape pas. Vos achats se décident à 2-3 jours — c'est le levier que vous maîtrisez encore.",
        tag: "Achats",
        steps: ["Vérifiez jeudi le stock de vos 3 meilleures ventes.",
                "Recommandez vendredi si besoin.",
                "Ne lancez rien de nouveau : servez ce qui marche."] },
      { title: "Réservez les prochains week-ends de vacances sur votre calendrier",
        description: "Ces fenêtres se connaissent des mois à l'avance — le calendrier scolaire est public.",
        why: "Ce week-end favorable n'est pas un hasard isolé : chaque période de vacances en contient. Anticipé, vous préparez cette fois offre, communication et planning sans contrainte de délai.",
        tag: "Anticipation",
        steps: ["Listez les week-ends des prochaines vacances scolaires de votre zone.",
                "Bloquez-les dans votre agenda comme temps forts.",
                "Décidez pour chacun UNE chose à préparer en avance."] }
    ],

    // Le lieu gagne MOINS ces jours-là (enjeu mesuré < 0).
    enjeu_negatif: [
      { title: "Arrêtez d'accuser la concurrence ces jours-là",
        description: "Vous gagnez moins ces week-ends alors qu'il y a MOINS d'événements que d'habitude autour de vous.",
        why: "Si ces journées rapportent moins quand la concurrence est basse, le frein n'est pas la concurrence. Dépenser pour vous différencier ce week-end n'attaquerait pas la cause.",
        tag: "Diagnostic",
        steps: ["Ne mettez ni pub ni remise défensive sur ce week-end.",
                "Pendant vos heures d'ouverture, notez ce que fait le public : entre-t-il ailleurs, passe-t-il sans s'arrêter ?",
                "Changez UNE chose de votre côté (vitrine, entrée, offre visible) et comparez au prochain week-end de vacances."] },
      { title: "Une offre valable ce week-end uniquement",
        description: "Le public de vacances décide tard et se décide sur place.",
        why: "Un week-end creux le reste si rien ne pousse à choisir vous. Une date limite courte fait bouger sans vous engager plus loin.",
        tag: "Offre",
        steps: ["Choisissez une offre simple à tenir sur vos jours d'ouverture du week-end.",
                "Affichez « ce week-end uniquement » — pas de prolongation.",
                "Annoncez jeudi ou vendredi.",
                "Comptez les clients venus avec."] },
      { title: "Ajustez les achats, pas le planning",
        description: "Ce que vous maîtrisez à deux jours : ce que vous achetez et ce que fait l'équipe en poste.",
        why: "Vos chiffres disent que ces week-ends rapportent moins. Le planning du week-end est déjà fixé (délai de prévenance) — la marge se défend sur les achats et l'emploi du temps de l'équipe.",
        tag: "Achats",
        steps: ["Réduisez ce que vous achetez pour ce week-end (frais, consommables).",
                "N'appelez pas d'extra.",
                "Donnez à l'équipe en poste une tâche de fond : inventaire, mise en place, formation.",
                "Regardez si la marge du week-end s'améliore."] }
    ],

    // AUCUNE mesure sur ce lieu — gestes valables dans les deux sens.
    _default: [
      { title: "Comparez ce week-end à vos week-ends habituels",
        description: "Un week-end suffit pour savoir si ces fenêtres vous réussissent.",
        why: "Chez certains, un week-end de vacances peu concurrencé rapporte plus ; chez d'autres, la clientèle habituelle est partie et il rapporte moins. Personne ne peut le deviner à votre place.",
        tag: "Test",
        steps: ["Notez le chiffre de vos jours d'ouverture du week-end.",
                "Comparez aux mêmes jours de vos 3 ou 4 week-ends précédents.",
                "Ne changez rien d'autre pendant ce week-end.",
                "Gardez le verdict pour le prochain week-end de vacances."] },
      { title: "Mesurez une chose que vous ne mesurez jamais",
        description: "Profitez d'un week-end moins disputé pour regarder votre public.",
        why: "Vous ne saurez jamais mieux qu'un week-end de vacances qui passe devant chez vous sans entrer. Cette observation vaut pour tous les week-ends suivants.",
        tag: "Observation",
        steps: ["Choisissez UNE question : d'où viennent-ils, à quelle heure, que demandent-ils ?",
                "Notez les réponses pendant vos heures d'ouverture du week-end, sans rien changer.",
                "Décidez à la fermeture du week-end ce que ça change pour le prochain."] },
      { title: "Préparez le prochain week-end de vacances dès maintenant",
        description: "Le calendrier scolaire est public : ces fenêtres se voient venir.",
        why: "Ce week-end arrive trop vite pour tout changer ; le prochain, non. Anticipé de plusieurs semaines, vous retrouvez tous vos leviers — y compris le planning.",
        tag: "Anticipation",
        steps: ["Repérez le prochain week-end de vacances de votre zone.",
                "Choisissez UNE action à y tester, décidée à froid.",
                "Mettez une date de préparation dans votre agenda."] }
    ]
  },

  // Client à cadence établie sans commande (chantier C1, 06/08/2026 — grain CLIENT,
  // docs/client-patterns-spec.md). Pas de dimension driver : la carte constate une rupture
  // de rythme, jamais sa cause — les plans font ÉTABLIR la cause avant de pousser du volume.
  client_dormant: {
    _default: [
      { title: "Reprenez contact en direct — un appel, pas une relance écrite", description: "La personne qui connaît ce client l'appelle et pose la question ouvertement.", why: "Un compte régulier qui s'arrête a une raison — saisonnalité, friction, concurrent — et seul un échange direct la donne.", tag: "Relation", steps: ["Identifier qui, dans l'équipe, tient la relation avec ce client.", "L'appeler : demander simplement où il en est (pause saisonnière ? un souci ? un autre fournisseur ?).", "Noter la raison donnée — c'est elle qui décide de la suite."] },
      { title: "Donnez-lui une raison datée de recommander", description: "Nouveautés, réassort de ses références habituelles, fenêtre de livraison proche.", why: "Une relance sans objet s'ignore ; une raison concrète et datée remet le compte dans son rythme.", tag: "Réactivation", steps: ["Repérer ses références récurrentes dans vos dernières factures.", "Proposer un réassort ou la nouveauté la plus proche de ce qu'il achète.", "Donner une échéance concrète (prochaine tournée, fenêtre de livraison)."] },
      { title: "Si une friction sort de l'échange, traitez-la avant le volume", description: "Délais, transport, tarif, litige — régler d'abord, recommander ensuite.", why: "Relancer du volume sur une friction non traitée grille la relation ; la friction réglée, la commande revient d'elle-même.", tag: "Rétention", steps: ["Qualifier la friction exacte donnée par le client.", "La traiter ou proposer un geste — puis le dire explicitement au client.", "Reproposer ensuite une commande simple, sans pression."] },
    ],
  },

  // Semaine de canal très en retrait (chantier C2, 07/08/2026 — docs/weekly-sales-spec.md).
  // La carte constate un extrême (< 0,5× l'habitude), jamais sa cause — les plans font
  // d'abord RECONSTITUER la semaine, puis agir sur ce qui se pilote au terme d'une semaine.
  weekly_sales_hole: {
    _default: [
      { title: "Reconstituez la semaine avant d'agir", description: "Fermetures, absence, travaux, contexte local — poser les faits de la semaine.", why: "Un trou de moitié a presque toujours une cause concrète ; agir sans elle, c'est corriger au hasard.", tag: "Diagnostic", steps: ["Lister les jours ouverts/fermés de la semaine et qui était présent.", "Noter tout événement local ou contrainte (travaux, météo marquante, panne).", "Trancher : cause interne, externe, ou inexpliquée — c'est elle qui décide de la suite."] },
      { title: "Ajustez les achats au creux identifié", description: "Si le creux est saisonnier ou récurrent, caler les commandes dessus.", why: "Les achats sont le levier qu'un exploitant maîtrise à ce terme — pas l'affluence.", tag: "Achats" },
      { title: "Planifiez une animation sur le prochain creux du même type", description: "Mise en avant, offre datée, prise de parole locale — testée et mesurée.", why: "Un creux récurrent identifié devient une fenêtre d'action planifiable, pas une surprise.", tag: "Animation" },
    ],
  },

  // Semaine de canal exceptionnelle (chantier C2) — capturer ce qui a marché.
  weekly_sales_spike: {
    _default: [
      { title: "Identifiez ce qui a porté la semaine", description: "Grosse vente, client, opération, contexte — le nommer précisément.", why: "Un pic a une cause ; non identifiée, elle ne se rejouera que par hasard.", tag: "Diagnostic", steps: ["Regarder les plus grosses ventes de la semaine et qui les a faites.", "Noter ce qui différait : opération en cours, contexte, visite particulière.", "Écrire la cause en une phrase — c'est votre bonne pratique candidate."] },
      { title: "Sécurisez le réassort de ce qui s'est vendu", description: "Les références qui ont porté le pic ne doivent pas manquer ensuite.", why: "Une rupture après un pic transforme la demande captée en frustration.", tag: "Réassort" },
      { title: "Rejouez la cause sciemment — et mesurez", description: "Si c'est reproductible (opération, mise en avant), la reprogrammer avec un objectif.", why: "Ce qui a marché une fois est votre meilleur pari — encore faut-il le rejouer en le mesurant.", tag: "À reconduire" },
    ],
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

// ╔═══════════════════════════════════════════════════════════════════════════════════════════╗
// ║ ⚠ AVERTISSEMENT 31/07/2026 — L'ORDRE CI-DESSOUS EST CELUI DU VOLUME DE TIRS, ET IL EST    ║
// ║ TROMPEUR. Il a été établi sans consulter docs/card-truth-audit.md, qui juge la VÉRITÉ des ║
// ║ cartes. Vérifié depuis : sur les 4 premières, AUCUNE n'est jugée saine —                  ║
// ║   foreign_tourism_signal      RÉEXAMEN 31/07 : démotion ANNULÉE — donnée non branchée,   ║
// ║                               pas absente (fct_region_foreign_country_profile, 27/32     ║
// ║                               lieux couverts). Chantier = CÂBLER. Plans prématurés.      ║
// ║   audience_shift_opportunity  démise le 28/07 À TORT — la carte discrimine (94 payloads  ║
// ║                               distincts / 31 lieux) ; c'est sa COPIE qui n'affirme rien. ║
// ║                               À re-promouvoir AVEC la réécriture, pas avant.             ║
// ║   tourism_peak_window         « pas encore », pas « jamais » : tourism_high mesurée sur   ║
// ║                               3 lieux (+171 €/j) mais n≈2, sous le plancher n>=5.        ║
// ║   weekend_opportunity         « Durcir » — annonce une opportunité un jour à −131 €/j     ║
// ║ Une carte DÉMISE (DEMOTED_TO_FEED) ne paraît plus aux Actions du jour : elle n'a plus de  ║
// ║ menu « M'engager », donc écrire ses plans est du travail perdu.                           ║
// ║ Les deux seules cartes que l'audit certifie : low_competition_window (« GARDER TELLE      ║
// ║ QUELLE », +88 €/j t=2,4 — mais elle ne rend qu'1 plan sur 3) et weekend_vacation_low_comp ║
// ║ (« la plus saine du lot » — aucun plan). COMMENCER PAR CELLES-LÀ.                          ║
// ║ Et le volume de tirs n'est PAS un critère : 32 tirs/jour sur 32 sites sur 32 est le       ║
// ║ symptôme d'une règle qui ne discrimine pas.                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════════════════════╝

// ═══════════════════════════════════════════════════════════════════════════════════════════
// ÉCHAFAUDAGE À REMPLIR — 27 types qui TIRENT et n'ont aucun plan (31/07/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// POURQUOI CE BLOC. Le 26/07 l'allowlist des engagements a été complétée au registre SPECS
// entier (83 types, commitmentOrigins.ts). La bibliothèque, elle, n'a jamais couvert que les
// cartes de vente : 7 types. L'invariant de docs/features/commitments.md §5 est donc violé 76
// fois sur 83, et « Mon action » s'ouvre vide sur presque toutes les cartes.
//
// MESURE (90 jours, tous lieux, semantic.vw_insight_event_action_candidates) :
//   33 types tirent · 6 ont des plans · 27 n'en ont pas — les voici, du plus fréquent au moins.
//
// COMMENT REMPLIR. Décommentez l'entrée, écrivez les phrases. Rien d'autre à faire : depuis le
// 31/07 action-cards.js DÉRIVE son câblage des clés de ce fichier (vérifié : une entrée ajoutée
// ici suffit à faire apparaître les plans dans « M'engager »).
//
// ORDRE DE RÉSOLUTION (_recosFor, action-cards.js) : driver → signe d'enjeu → _default.
//   · clés driver  — 'footfall' | 'basket' | 'conversion'. N'existent que si la carte porte
//     primary_revenue_driver / dominant_factor. Sur ces 27 types, SEUL sales_underperformance
//     porte un champ 'driver' dans son payload — pour tous les autres, écrivez _default.
//   · clés de signe — 'enjeu_positif' / 'enjeu_negatif', quand le geste doit suivre le SENS de
//     l'écart mesuré sur CE lieu (cas low_competition_window : +88 €/j ici, −49 €/j là).
//   · _default — toujours servi en dernier. Son geste doit rester valable sans mesure.
//
// BARÈME (CLAUDE.md « Card Quality Bar ») : spécifique et pilotable cette semaine · pertinent
// en € · vertical-correct · non-évident. Et applicable en DROIT FRANÇAIS — pas de modification
// d'horaires à 2 jours (délai de prévenance), pas de revente à perte, pas de soldes hors dates.
//
// LES CHIFFRES NE S'ÉCRIVENT PAS À LA MAIN : chaque entrée liste les variables réellement
// présentes dans le payload de CETTE carte, relevées sur 90 jours. Écrivez les phrases,
// le pipeline fournit les nombres.
//
// CONSTAT À VÉRIFIER AVANT D'ÉCRIRE, pas un verdict : ces groupes partagent un jeu de clés
// STRICTEMENT identique, de forme « concurrent » (competitor_name, distance_m, google_rating…),
// y compris pour des cartes météo. À confirmer sur le modèle avant d'écrire leurs plans —
// un plan écrit sur un payload mal compris serait faux :
//     competition_pressure_spike · competitor_event_ending · competitor_event_launch ·
//     event_new · weather_hazard_onset · weather_improved · weather_worsened
//
// ✅ CORRIGÉ le 01/08 : le _default de low_competition_window rend désormais 3 plans.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ── foreign_tourism_signal ── 128 tirs · 32 lieux (90 j)
//    Variables disponibles dans le payload :
//      countries_named, countries_on_public_holiday, countries_on_school_holiday,
//      country_iso_code, country_name_en, has_foreign_public_holiday_signal,
//      has_foreign_school_holiday_signal, has_nationwide_holiday,
//      has_nationwide_public_holiday, location_access_pattern, n_countries,
//      pct_subdivisions_on_holiday, public_holiday_names, school_holiday_names,
//      share_total_pct
// window.MS_SALES_RECO_LIB.foreign_tourism_signal = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── audience_shift_opportunity ── 124 tirs · 31 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_availability_label, commercial_event_code, commercial_event_name,
//      delta_att_calendar_pct, events_5km, holiday_name, is_commercial, is_holiday,
//      is_vacation, pressure_ratio, score, vacation_name
// window.MS_SALES_RECO_LIB.audience_shift_opportunity = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── tourism_peak_window ── 80 tirs · 20 lieux (90 j)
//    Variables disponibles dans le payload :
//      is_peak, score, tourism_index, tourism_status
// window.MS_SALES_RECO_LIB.tourism_peak_window = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── weekend_opportunity ── 60 tirs · 30 lieux (90 j)
//    Variables disponibles dans le payload :
//      events_5km, is_holiday, regime, score, weather_alert
// window.MS_SALES_RECO_LIB.weekend_opportunity = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competition_proximity ── 36 tirs · 9 lieux (90 j)
//    Variables disponibles dans le payload :
//      catchment_label, events_1km, events_1km_same_sector, events_500m,
//      events_500m_same_sector, events_5km, events_catchment, events_catchment_same_sector,
//      top_competitor, top_competitor_distance_km, top_competitor_overlap_pct,
//      top_threat_level, top_threat_score
// window.MS_SALES_RECO_LIB.competition_proximity = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── review_solicitation ── 31 tirs · 31 lieux (90 j)
//    Variables disponibles dans le payload :
//      favorable_days_next_5, peak_window
// window.MS_SALES_RECO_LIB.review_solicitation = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── extended_bad_weather_3d ── 31 tirs · 31 lieux (90 j)
//    Variables disponibles dans le payload :
//      alert_level, site_sensitivity
// window.MS_SALES_RECO_LIB.extended_bad_weather_3d = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── same_bucket_saturation ── 28 tirs · 7 lieux (90 j)
//    Variables disponibles dans le payload :
//      events_5km, pct_same_sector, pressure_ratio
// window.MS_SALES_RECO_LIB.same_bucket_saturation = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── saturated_bad_weather ── 28 tirs · 7 lieux (90 j)
//    Variables disponibles dans le payload :
//      events_5km, pct_same_sector, pressure_ratio, weather_alert
// window.MS_SALES_RECO_LIB.saturated_bad_weather = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_reputation_strength ── 23 tirs · 7 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_id, competitor_name, entity_threat_distance_km,
//      entity_threat_level, google_rating, google_rating_count
// window.MS_SALES_RECO_LIB.competitor_reputation_strength = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── weather_hazard_onset ── 17 tirs · 14 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.weather_hazard_onset = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── weather_worsened ── 15 tirs · 13 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.weather_worsened = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── tourism_comp_squeeze ── 12 tirs · 3 lieux (90 j)
//    Variables disponibles dans le payload :
//      events_5km, pressure_ratio, tourism_index, tourism_status
// window.MS_SALES_RECO_LIB.tourism_comp_squeeze = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── tourist_high_season ── 12 tirs · 4 lieux (90 j)
//    Variables disponibles dans le payload :
//      events_5km, is_peak, score, tourism_index, tourism_status
// window.MS_SALES_RECO_LIB.tourist_high_season = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── tourist_surge_vacation ── 12 tirs · 4 lieux (90 j)
//    Variables disponibles dans le payload :
//      is_vacation, score, tourism_index, tourism_status
// window.MS_SALES_RECO_LIB.tourist_surge_vacation = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_event_ending ── 7 tirs · 2 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.competitor_event_ending = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_threat_direct ── 7 tirs · 1 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap, audience_overlap_pct, audience_overlap_score,
//      competitor_enriched_description, competitor_id, competitor_name, conflict_score,
//      distance_m, entity_threat_industry_tier, entity_threat_level, event_label,
//      event_primary_audience, google_rating, google_rating_count, threat_distance_km,
//      threat_level, threat_score
// window.MS_SALES_RECO_LIB.competitor_threat_direct = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── ft_peak_bad_weather ── 6 tirs · 3 lieux (90 j)
//    Variables disponibles dans le payload :
//      ft_peak_busyness_pct, ft_peak_hour, ft_rank, score, weather_alert
// window.MS_SALES_RECO_LIB.ft_peak_bad_weather = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── high_competition_density ── 4 tirs · 1 lieux (90 j)
//    Variables disponibles dans le payload :
//      catchment_label, events_10km, events_500m, events_5km, events_5km_other_sector,
//      events_5km_same_sector, events_catchment, pct_same_sector, pressure_ratio,
//      score_driver
// window.MS_SALES_RECO_LIB.high_competition_density = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_event_launch ── 4 tirs · 1 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.competitor_event_launch = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── event_new ── 4 tirs · 1 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.event_new = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_positioning_brief ── 3 tirs · 3 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitive_analysis_json, competitor_enriched_description,
//      competitor_id, competitor_name, entity_threat_distance_km, entity_threat_level,
//      google_rating, google_rating_count
// window.MS_SALES_RECO_LIB.competitor_positioning_brief = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── sales_underperformance ── 2 tirs · 2 lieux (90 j)
//    Variables disponibles dans le payload :
//      avg_30d, daily_revenue, driver, events_5km, pressure_ratio, revenue_vs_avg_pct,
//      top_competitor, weather_alert
// window.MS_SALES_RECO_LIB.sales_underperformance = {
//   footfall: [ … ], basket: [ … ], conversion: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── weather_improved ── 2 tirs · 2 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.weather_improved = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── competitor_positioning_gap ── 2 tirs · 2 lieux (90 j)
//    Variables disponibles dans le payload :
//      client_product_count, enriched_competitor_count, location_id, top_item_description,
//      top_item_revenue_share, watched_competitor_count
// window.MS_SALES_RECO_LIB.competitor_positioning_gap = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };

// ── weekend_vacation_low_comp ── ✅ REMPLI le 01/08 (rédaction owner) — entrée vivante dans
//    MS_SALES_RECO_LIB ci-dessus, à côté de low_competition_window. Sorti de la dette du
//    garde-fou. Brief et décisions : docs/methodes-weekend-vacation-brief.md.

// ── competition_pressure_spike ── 1 tirs · 1 lieux (90 j)
//    Variables disponibles dans le payload :
//      audience_overlap_pct, competitor_enriched_description, competitor_id, competitor_name,
//      direction, distance_m, entity_threat_distance_km, entity_threat_industry_tier,
//      entity_threat_level, entity_threat_score, event_label, google_rating,
//      google_rating_count, industry_code, new_value, old_value, radius_bucket, score_delta,
//      score_driver_label, signal_type
// window.MS_SALES_RECO_LIB.competition_pressure_spike = {
//   _default: [
//     { title: '', description: '', why: '', tag: '', steps: [] },
//     { title: '', description: '', why: '', tag: '' },
//     { title: '', description: '', why: '', tag: '' },
//   ],
// };
