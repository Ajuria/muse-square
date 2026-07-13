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
// SHAPE: three tactics for the CARD'S driver — e.g. a conversion card gets three
// conversion tactics, NOT one tactic for three different drivers.
//
// COVERAGE INVARIANT: every card type in COMMITMENT_ORIGIN_ACTION_TYPES
// (src/lib/commitmentOrigins.ts) MUST have an entry here. v1 allowlist =
// sales_surge, sales_revenue_down_wow, sales_traffic_not_converting,
// sales_discount_no_lift, footfall_vs_basket_decomposition. When the allowlist
// grows (opportunity/threat/weather/tourism families), add recos here in lockstep.
//
// Keys: <card_type> → { <driver>: [a1,a2,a3], _default: [a1,a2,a3] }.
// Driver = item.primary_revenue_driver | dominant_factor, lowercased
// (transactions folds into footfall). _default is used when no driver matches.

window.MS_SALES_RECO_LIB = {

  // CA en baisse semaine/semaine — actions selon le levier qui décroche.
  sales_revenue_down_wow: {
    conversion: [
      "Offre d'appel sur vos créneaux creux (formule ou menu du jour) pour convertir le passage sans casser vos prix.",
      "Reprenez le parcours d'achat aux heures creuses : mise en avant produit, signalétique claire, encaissement fluide.",
      "Briefez l'équipe sur la proposition active à faible affluence : accueil, conseil, relance en caisse.",
    ],
    basket: [
      "Systématisez la montée en gamme : proposez l'option supérieure ou l'accompagnement à chaque vente.",
      "Mettez en avant 2-3 formules à panier plus élevé, visibles à l'encaissement.",
      "Formez l'équipe à la vente additionnelle ciblée : le bon complément, au bon moment.",
    ],
    footfall: [
      "Communication ciblée sur vos créneaux faibles : SMS clients fidèles, réseaux, fiche Google.",
      "Offre d'appel limitée dans le temps pour ramener du flux sur les jours creux.",
      "Vérifiez votre visibilité locale (fiche Google à jour, horaires, photos) pour capter la recherche de proximité.",
    ],
    _default: [
      "Offre d'appel sur vos créneaux creux pour ramener du flux et convertir le passage.",
      "Mise en avant produit et montée en gamme à l'encaissement pour relever le panier.",
      "Communication ciblée (clients fidèles, fiche Google) sur les jours faibles.",
    ],
  },

  // CA en hausse — capitaliser et sécuriser ce qui a marché.
  sales_surge: {
    basket: [
      "Reconduisez ce qui a fait monter le panier (mise en avant, formule) et mesurez l'effet la semaine suivante.",
      "Sécurisez le réassort des produits à forte marge qui ont porté la hausse.",
      "Poussez la montée en gamme tant que la demande est là.",
    ],
    footfall: [
      "Transformez ce flux en retours : incitation à la prochaine visite (fidélité, offre datée).",
      "Ajustez le staffing pour tenir l'accueil sur le pic sans dégrader l'expérience.",
      "Sollicitez les avis clients maintenant, pendant que l'affluence et la satisfaction sont hautes.",
    ],
    _default: [
      "Reconduisez le levier qui a porté la hausse et mesurez-le sur la semaine suivante.",
      "Sécurisez staffing et réassort pour tenir le pic sans dégrader l'expérience.",
      "Capitalisez sur la satisfaction : avis clients et incitation au retour.",
    ],
  },

  // Du passage mais peu de conversion — trois leviers de conversion.
  sales_traffic_not_converting: {
    _default: [
      "Offre d'appel sur le créneau concerné pour transformer le passage en vente.",
      "Rendez visible et facile à acheter ce qui attire : mise en avant, prix lisibles, parcours court.",
      "Briefez l'équipe sur la proposition active : accueil, conseil, relance en caisse.",
    ],
  },

  // Remises sans effet mesuré — discipline promotionnelle.
  sales_discount_no_lift: {
    _default: [
      "Réservez les remises à vos clients fidèles et à forte valeur ; stoppez les promos sans lift mesuré.",
      "Remplacez la remise large par une offre ciblée (créneau creux, panier seuil) et mesurez le lift.",
      "Jouez la valeur perçue (formule, service, expérience) plutôt qu'une baisse de prix.",
    ],
  },

  // Décomposition fréquentation vs panier — actions selon le levier qui pèse.
  footfall_vs_basket_decomposition: {
    footfall: [
      "Communication ciblée sur vos créneaux faibles : SMS clients fidèles, réseaux, fiche Google.",
      "Offre d'appel limitée dans le temps pour ramener du flux sur les jours creux.",
      "Vérifiez votre visibilité locale (fiche Google, horaires, photos) pour capter la proximité.",
    ],
    basket: [
      "Systématisez la montée en gamme : option supérieure ou accompagnement à chaque vente.",
      "Mettez en avant 2-3 formules à panier plus élevé, visibles à l'encaissement.",
      "Formez l'équipe à la vente additionnelle ciblée.",
    ],
    _default: [
      "Communication ciblée sur les jours faibles pour la fréquentation.",
      "Montée en gamme et formules mises en avant pour le panier.",
      "Mesurez lequel des deux leviers répond avant d'investir davantage.",
    ],
  },

  // (Report-only — pas un origin d'engagement v1, mais lu par le rapport.)
  sales_competition_cannibalization: {
    _default: [
      "Renforcez une différenciation que le concurrent proche n'a pas : offre signature ou expérience.",
      "Gagnez en visibilité locale sur les créneaux où la concurrence capte (Google, réseaux).",
      "Fidélisez pour réduire la sensibilité à l'offre concurrente (programme, relation client).",
    ],
  },

};
