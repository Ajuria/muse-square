import type { ImpactRuleAssetV1_5 } from "./impact_rule_asset.v1_5";

export const SEASONALITY_RULES_V1_5: ImpactRuleAssetV1_5[] = [
  // A) Règles globales (s’appliquent à tous les publics)
  {
    id: "G1",
    dimension: "seasonality_and_calendar",
    regime: "A) Règles globales (s’appliquent à tous les publics)",
    if: "IF la date tombe dans une période de pointe saisonnière (ex. été, fin d’année)",
    then:
      "THEN traiter la demande comme structurellement plus concentrée (pression sur accès, files, service, espaces) et dimensionner l’exploitation pour congestion, pas pour un flux moyen.",
  },
  {
    id: "G2",
    dimension: "seasonality_and_calendar",
    regime: "A) Règles globales (s’appliquent à tous les publics)",
    if: "IF la date tombe en période creuse",
    then:
      "THEN traiter la fréquentation comme structurellement plus faible et concentrer l’effort sur qualité d’expérience + valeur par visiteur (plutôt que volume), avec exploitation calibrée pour éviter la sous-utilisation.",
  },
  {
    id: "G3",
    dimension: "seasonality_and_calendar",
    regime: "A) Règles globales (s’appliquent à tous les publics)",
    if: "IF la période est marquée par un calendrier externe fort (vacances scolaires / promotions retail)",
    then:
      "THEN considérer que le comportement de sortie est d’abord gouverné par disponibilité et arbitrages de dépenses, avant l’attractivité intrinsèque de ton offre.",
  },

  // B) Profils de publics — 1) Familles (enfants scolarisés)
  {
    id: "F1",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 1) Familles (enfants scolarisés)",
    if: "IF le public cible inclut des familles avec enfants scolarisés",
    then:
      "THEN considérer les vacances scolaires comme la contrainte dominante de disponibilité (la sortie se planifie et se consomme dans cette fenêtre).",
  },
  {
    id: "F2_NOEL",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 1) Familles (enfants scolarisés)",
    if: "IF la période = vacances de Noël / fin d’année",
    then:
      "THEN traiter le budget disponible comme prioritairement capté par les achats de fin d’année (cadeaux, retail, déplacements), et positionner l’offre sur faible friction (durée courte, simplicité, “activité bonus”).",
  },
  {
    id: "F2_HORS_NOEL",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 1) Familles (enfants scolarisés)",
    if: "IF la période = vacances scolaires hors Noël",
    then:
      "THEN traiter la dépense comme davantage orientée “sorties/expériences” (activité planifiée), et positionner l’offre sur programme (créneaux dédiés, formats famille, valeur perçue de l’expérience).",
  },

  // B) Profils de publics — 2) Touristes / non-locaux
  {
    id: "T1",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 2) Touristes / non-locaux",
    if: "IF période = haute saison touristique",
    then:
      "THEN traiter le public non-local comme moteur de fréquentation : prioriser lisibilité (horaires, accès, langue), capacité d’accueil, et “parcours simple”.",
  },
  {
    id: "T2",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 2) Touristes / non-locaux",
    if: "IF période = hors saison",
    then:
      "THEN traiter le public non-local comme plus rare : la performance dépend davantage de la conversion locale et de la pertinence du moment (agenda, partenariats, relais).",
  },

  // B) Profils de publics — 3) Locaux
  {
    id: "L1",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 3) Locaux",
    if: "IF période = vacances scolaires (hors Noël)",
    then:
      "THEN traiter les locaux comme plus disponibles (sorties possibles en semaine) et adapter programmation/horaires à des usages “journée” plutôt que strictement “soir/week-end”.",
  },
  {
    id: "L2",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 3) Locaux",
    if: "IF période = fin d’année / Noël",
    then:
      "THEN traiter les locaux comme sur-sollicités (achats, obligations, logistique) et réduire les attentes sur les sorties “optionnelles” : privilégier formats “décision facile” et communication axée sur la simplicité.",
  },

  // B) Profils de publics — 4) Seniors
  {
    id: "S1",
    dimension: "seasonality_and_calendar",
    regime: "B) Profils de publics — 4) Seniors",
    if: "IF le public cible inclut des seniors",
    then:
      "THEN privilégier les périodes d’“entre-saisons” (quand les autres publics sont moins contraints/moins denses) et calibrer l’expérience sur confort + accessibilité.",
  },

  // C) Événements commerciaux (Black Friday / Cyber Monday, promos d’octobre, etc.)
  {
    id: "C1",
    dimension: "seasonality_and_calendar",
    regime: "C) Événements commerciaux (Black Friday / Cyber Monday, promos d’octobre, etc.)",
    if: "IF la date tombe sur une fenêtre de promotions retail majeure (ex. BFCM)",
    then:
      "THEN traiter l’attention du public comme déjà captée par la recherche de bonnes affaires et l’activité d’achat (en ligne et en magasin), et ajuster le positionnement :\n\nproposer une valeur immédiatement lisible (raison unique de venir)\n\nréduire la dépendance à une décision “longue” (formats courts, réservation simple)",
  },
  {
    id: "C2",
    dimension: "seasonality_and_calendar",
    regime: "C) Événements commerciaux (Black Friday / Cyber Monday, promos d’octobre, etc.)",
    if: "IF la période est proche d’un événement promo majeur",
    then:
      "THEN traiter la décision comme pré-arbitrée : la sortie concurrence un plan d’achat déjà préparé ; la communication doit s’aligner sur “ce que je gagne maintenant” (temps, facilité, complément).",
  },
  {
    id: "C3",
    dimension: "seasonality_and_calendar",
    regime: "C) Événements commerciaux (Black Friday / Cyber Monday, promos d’octobre, etc.)",
    if: "IF fenêtre = promotions d’octobre",
    then:
      "THEN traiter cette période comme début de saison d’achats (et pas comme un substitut complet du BFCM) : l’attention est déjà orientée “shopping”, mais la dynamique n’éteint pas la fin d’année.\n→ stratégie : soit éviter la confrontation frontale, soit se greffer (offre complémentaire, timing décalé).",
  },
  {
    id: "C4",
    dimension: "seasonality_and_calendar",
    regime: "C) Événements commerciaux (Black Friday / Cyber Monday, promos d’octobre, etc.)",
    if: "IF signaux marché indiquent un usage accru des mécanismes de financement pour “tenir le budget” pendant les promos",
    then:
      "THEN traiter la sensibilité prix comme élevée : clarifier prix total, supprimer les coûts surprises, et préférer des packs simples plutôt qu’une tarification éclatée.",
  },

  // D) Règles d’arbitrage (quand plusieurs profils coexistent)
  {
    id: "X1",
    dimension: "seasonality_and_calendar",
    regime: "D) Règles d’arbitrage (quand plusieurs profils coexistent)",
    if: "IF familles + période vacances scolaires",
    then: "THEN familles dominent la dynamique de planning/horaires.",
  },
  {
    id: "X1_ELSEIF_TOURISME",
    dimension: "seasonality_and_calendar",
    regime: "D) Règles d’arbitrage (quand plusieurs profils coexistent)",
    if: "ELSE IF haute saison touristique",
    then: "THEN touristes dominent la dynamique (accueil/flux).",
  },
  {
    id: "X1_ELSEIF_PROMO",
    dimension: "seasonality_and_calendar",
    regime: "D) Règles d’arbitrage (quand plusieurs profils coexistent)",
    if: "ELSE IF période promo majeure (BFCM / fin d’année retail)",
    then: "THEN shopping domine l’attention et la dépense discrétionnaire.",
  },
  {
    id: "X2",
    dimension: "seasonality_and_calendar",
    regime: "D) Règles d’arbitrage (quand plusieurs profils coexistent)",
    if: "IF période = fin d’année ET présence d’événements commerciaux majeurs",
    then:
      "THEN considérer que les sorties “expérience” passent derrière achats + logistique + obligations : tu gagnes par simplicité, pas par complexité (programme léger, friction minimale, décision rapide).",
  },
];

export const SEASONALITY_RULES_BY_ID_V1_5: Record<string, ImpactRuleAssetV1_5> =
  Object.fromEntries(SEASONALITY_RULES_V1_5.map((r) => [r.id, r]));
