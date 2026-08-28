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
  | "temps_fort"
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
  // 27/08 — SÉPARÉE de « Calendrier » sur décision owner. Deux natures se disaient sous la
  // même origine : le calendrier scolaire (un ÉTAT du monde) et une fenêtre commerciale (un
  // temps fort sur lequel on AGIT). Mesuré en Île-de-France : « Soldes d'été » 18 jours sur 28
  // et « Rentrée scolaire » 16 sur 32 tombent AUSSI en vacances scolaires — 34 jours par an où
  // le chat disait les deux côte à côte, sans rien pour les distinguer (retour owner : « je
  // croyais que c'était la rentrée ? »). Le mot est celui DÉJÀ rendu par la carte
  // (`action-cards.js` : « Temps fort commercial »), pas un mot neuf.
  temps_fort: "Temps fort commercial",
  concurrence: "Veille concurrence",
  evenements_proximite: "Événements à proximité",
  tourisme: "Tourisme régional",
  transports: "Transports",
  affluence_estimee: "Affluence estimée",
  bonnes_pratiques: "Bonnes pratiques",
};
