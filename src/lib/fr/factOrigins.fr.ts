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
