// src/lib/ai/impact_narrations/impact_assertion_asset.v1.ts
//
// WEATHER — ASSETIFIED per audit (updated):
// - Weather narratable “assets”: W2, W3, W5.
// - All other weather items remain RULES (guardrails) and MUST NOT be turned into assertions here.
//
// Important: `impact_level / risk_level / confidence` are *classification tags* for narration routing.
// The verbatim “truth” content is only in `drivers[]` + `implications[]`.

export type ImpactLevel = "structurant" | "secondaire";
export type RiskLevel = "faible" | "moyen" | "élevé";
export type Confidence = "faible" | "moyenne" | "élevée";

export type ImpactAssertionAssetV1 = {
  id: string; // stable: e.g. "W2", "W3"
  dimension:
    | "météo"
    | "proximité d’offres concurrentes"
    | "vacances, saisonnalité et événements commerciaux";
  impact_level: ImpactLevel;
  risk_level: RiskLevel;
  confidence: Confidence;

  // VERBATIM from reports / audited rule text
  drivers: string[]; // 1–3
  implications: string[]; // 1–3
};

export const IMPACT_ASSERTION_ASSETS_V1: ImpactAssertionAssetV1[] = [
  
  // ----------------------------
  // MÉTÉO (from weather.rules.v1_5.ts) — ASSETS (per updated requirement: 3 items)
  // ----------------------------

  {
    id: "W2",
    dimension: "météo",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI une météo défavorable est annoncée avant l’événement"],
    implications: [
      "ALORS considérer que les décisions de venue peuvent déjà être affectées, et ajuster les attentes avant les observations sur place.",
    ],
  },

  {
    id: "W3",
    dimension: "météo",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: ["SI le public inclut une part importante de non-locaux"],
    implications: [
      "ALORS ne pas supposer que les annulations liées à la météo reflètent exactement le comportement des publics locaux.",
    ],
  },

  {
    id: "W5",
    dimension: "météo",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI l’événement est en extérieur et la météo se dégrade sans être extrême"],
    implications: [
      "ALORS considérer la fréquentation comme incertaine et garder modulables le staffing, les accès et les engagements fournisseurs.",
    ],
  },

  
  // ----------------------------
  // SEASONALITY / CALENDAR (from seasonality.rules.v1_5.ts)
  // Truth-only ASSET candidates (audit): G3, F1, F2_NOEL, F2_HORS_NOEL, T1, T2, L1, L2, S1, C1, C2, C3, C4, X2
  // NOTE: IDs are namespaced to avoid collision with COMPETITION ids (e.g. "C1").
  // ----------------------------

  {
    id: "CAL_G3",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF la période est marquée par un calendrier externe fort (vacances scolaires / promotions retail)",
    ],
    implications: [
      "THEN considérer que le comportement de sortie est d’abord gouverné par disponibilité et arbitrages de dépenses, avant l’attractivité intrinsèque de ton offre.",
    ],
  },

  // --- Familles (enfants scolarisés)
  {
    id: "CAL_F1",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF le public cible inclut des familles avec enfants scolarisés",
    ],
    implications: [
      "THEN considérer les vacances scolaires comme la contrainte dominante de disponibilité (la sortie se planifie et se consomme dans cette fenêtre).",
    ],
  },
  {
    id: "CAL_F2_NOEL",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF la période = vacances de Noël / fin d’année",
    ],
    implications: [
      "THEN traiter le budget disponible comme prioritairement capté par les achats de fin d’année (cadeaux, retail, déplacements), et positionner l’offre sur faible friction (durée courte, simplicité, “activité bonus”).",
    ],
  },
  {
    id: "CAL_F2_HORS_NOEL",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF la période = vacances scolaires hors Noël",
    ],
    implications: [
      "THEN traiter la dépense comme davantage orientée “sorties/expériences” (activité planifiée), et positionner l’offre sur programme (créneaux dédiés, formats famille, valeur perçue de l’expérience).",
    ],
  },

  // --- Touristes / non-locaux
  {
    id: "CAL_T1",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF période = haute saison touristique",
    ],
    implications: [
      "THEN traiter le public non-local comme moteur de fréquentation : prioriser lisibilité (horaires, accès, langue), capacité d’accueil, et “parcours simple”.",
    ],
  },
  {
    id: "CAL_T2",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF période = hors saison",
    ],
    implications: [
      "THEN traiter le public non-local comme plus rare : la performance dépend davantage de la conversion locale et de la pertinence du moment (agenda, partenariats, relais).",
    ],
  },

  // --- Locaux
  {
    id: "CAL_L1",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF période = vacances scolaires (hors Noël)",
    ],
    implications: [
      "THEN traiter les locaux comme plus disponibles (sorties possibles en semaine) et adapter programmation/horaires à des usages “journée” plutôt que strictement “soir/week-end”.",
    ],
  },
  {
    id: "CAL_L2",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF période = fin d’année / Noël",
    ],
    implications: [
      "THEN traiter les locaux comme sur-sollicités (achats, obligations, logistique) et réduire les attentes sur les sorties “optionnelles” : privilégier formats “décision facile” et communication axée sur la simplicité.",
    ],
  },

  // --- Seniors
  {
    id: "CAL_S1",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF le public cible inclut des seniors",
    ],
    implications: [
      "THEN privilégier les périodes d’“entre-saisons” (quand les autres publics sont moins contraints/moins denses) et calibrer l’expérience sur confort + accessibilité.",
    ],
  },

  // --- Événements commerciaux
  {
    id: "CAL_C1",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF la date tombe sur une fenêtre de promotions retail majeure (ex. BFCM)",
    ],
    implications: [
      "THEN traiter l’attention du public comme déjà captée par la recherche de bonnes affaires et l’activité d’achat (en ligne et en magasin), et ajuster le positionnement :\n\nproposer une valeur immédiatement lisible (raison unique de venir)\n\nréduire la dépendance à une décision “longue” (formats courts, réservation simple)",
    ],
  },
  {
    id: "CAL_C2",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF la période est proche d’un événement promo majeur",
    ],
    implications: [
      "THEN traiter la décision comme pré-arbitrée : la sortie concurrence un plan d’achat déjà préparé ; la communication doit s’aligner sur “ce que je gagne maintenant” (temps, facilité, complément).",
    ],
  },
  {
    id: "CAL_C3",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF fenêtre = promotions d’octobre",
    ],
    implications: [
      "THEN traiter cette période comme début de saison d’achats (et pas comme un substitut complet du BFCM) : l’attention est déjà orientée “shopping”, mais la dynamique n’éteint pas la fin d’année.\n→ stratégie : soit éviter la confrontation frontale, soit se greffer (offre complémentaire, timing décalé).",
    ],
  },
  {
    id: "CAL_C4",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: [
      "IF signaux marché indiquent un usage accru des mécanismes de financement pour “tenir le budget” pendant les promos",
    ],
    implications: [
      "THEN traiter la sensibilité prix comme élevée : clarifier prix total, supprimer les coûts surprises, et préférer des packs simples plutôt qu’une tarification éclatée.",
    ],
  },

  // --- Synthèse fin d'année + promos
  {
    id: "CAL_X2",
    dimension: "vacances, saisonnalité et événements commerciaux",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: [
      "IF période = fin d’année ET présence d’événements commerciaux majeurs",
    ],
    implications: [
      "THEN considérer que les sorties “expérience” passent derrière achats + logistique + obligations : tu gagnes par simplicité, pas par complexité (programme léger, friction minimale, décision rapide).",
    ],
  },

  // ----------------------------
  // COMPETITION / PROXIMITÉ (from competition.rules.v1_5.ts)
  // Truth-only ASSET candidates (audit): C1, C3, C4, C8, C10, C11, C13, C14
  // ID convention: CP_<SOURCE_RULE_ID>
  // ----------------------------

  {
    id: "CP_C1",
    dimension: "proximité d’offres concurrentes",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI un événement de nature similaire se tient tout près"],
    implications: [
      "ALORS le considérer comme un substitut direct (et non comme une demande additionnelle).",
    ],
  },

  {
    id: "CP_C3",
    dimension: "proximité d’offres concurrentes",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI une nouvelle offre concurrente ouvre à proximité"],
    implications: [
      "ALORS supposer une redistribution de la demande existante plutôt qu’une création nette de demande.",
    ],
  },

  {
    id: "CP_C4",
    dimension: "proximité d’offres concurrentes",
    impact_level: "secondaire",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI des offres concurrentes sont géographiquement proches"],
    implications: [
      "ALORS ne pas compter sur des différenciateurs secondaires pour neutraliser la concurrence.",
    ],
  },

  {
    id: "CP_C8",
    dimension: "proximité d’offres concurrentes",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: ["SI le nombre d’offres proches augmente mais que le chevauchement géographique n’augmente pas"],
    implications: [
      "ALORS ne pas supposer que l’intensité concurrentielle augmente proportionnellement.",
    ],
  },

  {
    id: "CP_C10",
    dimension: "proximité d’offres concurrentes",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: ["SI les offres sont de nature différente et peuvent s’enchaîner dans un même déplacement"],
    implications: [
      "ALORS les traiter comme potentiellement complémentaires, pas substitutives.",
    ],
  },

  {
    id: "CP_C11",
    dimension: "proximité d’offres concurrentes",
    impact_level: "secondaire",
    risk_level: "faible",
    confidence: "moyenne",
    drivers: ["SI des offres complémentaires sont co-localisées"],
    implications: [
      "ALORS ne pas supposer une hausse automatique de fréquentation pour chaque offre individuellement.",
    ],
  },

  {
    id: "CP_C13",
    dimension: "proximité d’offres concurrentes",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI l’événement se situe dans un écosystème d’offres dense"],
    implications: [
      "ALORS s’attendre à une redistribution plus rapide de la fréquentation entre offres.",
    ],
  },

  {
    id: "CP_C14",
    dimension: "proximité d’offres concurrentes",
    impact_level: "structurant",
    risk_level: "moyen",
    confidence: "moyenne",
    drivers: ["SI plusieurs offres coexistent dans un périmètre très resserré"],
    implications: [
      "ALORS traiter les résultats de fréquentation comme dépendants de l’écosystème plutôt que de l’événement seul.",
    ],
  },
];
