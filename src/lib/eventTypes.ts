// Registre UNIQUE des types d'événement (spec docs/evenement-dossier-spec.md § 4, owner 03/08 :
// « la liste doit dépendre du métier du lieu »). Une seule source pour le formulaire de création
// ET les rendus — remplace la liste en dur de days.astro et EVT_TYPE_LABELS de monitor (legacy).
//
// Clés métier = les codes industrie du profil (INDUSTRY_LABEL, competitive/constants.ts).
// Les 12 valeurs HISTORIQUES restent labellisables (des événements existants les portent) et
// forment la liste de repli quand le métier est inconnu. Une liste par métier finit toujours
// par « autre » — jamais d'impasse.

export interface EventTypeOption { value: string; label_fr: string }

// Les 12 valeurs historiques (days.astro) — NE PAS renommer : des lignes raw.saved_items les portent.
export const EVENT_TYPES_GENERIC: EventTypeOption[] = [
  { value: "conference_de_presse", label_fr: "Conférence de presse" },
  { value: "evenement_corporate", label_fr: "Événement corporate" },
  { value: "happening_exterieur", label_fr: "Happening extérieur" },
  { value: "inauguration", label_fr: "Inauguration" },
  { value: "journee_portes_ouvertes", label_fr: "Journée portes ouvertes" },
  { value: "lancement_de_produit", label_fr: "Lancement de produit" },
  { value: "ouverture_point_de_vente", label_fr: "Ouverture d'un point de vente" },
  { value: "promotion_magasin", label_fr: "Promotion en magasin / soldes" },
  { value: "soiree_de_lancement", label_fr: "Soirée de lancement" },
  { value: "vernissage_exposition", label_fr: "Vernissage / Exposition" },
  { value: "autre", label_fr: "Autre" },
];

// Types additionnels (nouveaux métiers couverts) — labellisables partout.
const EXTRA_TYPES: EventTypeOption[] = [
  { value: "venue_producteurs", label_fr: "Venue de producteurs / fournisseurs" },
  { value: "degustation", label_fr: "Dégustation" },
  { value: "animation_boutique", label_fr: "Animation en boutique" },
  { value: "menu_offre_speciale", label_fr: "Menu / offre spéciale" },
  { value: "vente_privee", label_fr: "Vente privée" },
  { value: "soiree_theme", label_fr: "Soirée à thème" },
  { value: "marche_stand_exterieur", label_fr: "Marché / stand extérieur" },
  { value: "nocturne", label_fr: "Nocturne" },
  { value: "visite_atelier", label_fr: "Visite guidée / atelier" },
  { value: "conference_rencontre", label_fr: "Conférence / rencontre" },
  { value: "lancement_saison", label_fr: "Lancement de saison" },
  { value: "salon_exposition", label_fr: "Salon / exposition professionnelle" },
];

const T = (value: string): EventTypeOption => {
  const all = [...EVENT_TYPES_GENERIC, ...EXTRA_TYPES];
  const hit = all.find((o) => o.value === value);
  if (!hit) throw new Error(`eventTypes: valeur inconnue ${value}`);
  return hit;
};

// Listes CURATÉES par famille de métier (codes INDUSTRY_LABEL). Toujours « autre » en fin.
const BOUCHE: EventTypeOption[] = [
  T("venue_producteurs"), T("degustation"), T("menu_offre_speciale"), T("lancement_de_produit"),
  T("animation_boutique"), T("soiree_theme"), T("marche_stand_exterieur"), T("promotion_magasin"),
  T("journee_portes_ouvertes"), T("autre"),
];
const RETAIL: EventTypeOption[] = [
  T("venue_producteurs"), T("lancement_de_produit"), T("promotion_magasin"), T("animation_boutique"),
  T("vente_privee"), T("ouverture_point_de_vente"), T("marche_stand_exterieur"),
  T("journee_portes_ouvertes"), T("autre"),
];
const CULTURE: EventTypeOption[] = [
  T("vernissage_exposition"), T("nocturne"), T("visite_atelier"), T("conference_rencontre"),
  T("lancement_de_produit"), T("inauguration"), T("journee_portes_ouvertes"), T("autre"),
];
const ACCUEIL_LOISIRS: EventTypeOption[] = [
  T("animation_boutique"), T("visite_atelier"), T("journee_portes_ouvertes"), T("menu_offre_speciale"),
  T("evenement_corporate"), T("happening_exterieur"), T("lancement_saison"), T("autre"),
];
const PRO_EVENEMENTIEL: EventTypeOption[] = [
  T("salon_exposition"), T("conference_de_presse"), T("evenement_corporate"), T("soiree_de_lancement"),
  T("inauguration"), T("journee_portes_ouvertes"), T("autre"),
];

const BY_INDUSTRY: Record<string, EventTypeOption[]> = {
  food_nightlife: BOUCHE, market_hall: BOUCHE, wine_tourism: BOUCHE,
  commercial: RETAIL,
  culture: CULTURE, gallery: CULTURE, cinema_theatre: CULTURE, science_innovation: CULTURE,
  hotel_lodging: ACCUEIL_LOISIRS, camping_outdoor: ACCUEIL_LOISIRS, theme_park: ACCUEIL_LOISIRS,
  sport: ACCUEIL_LOISIRS, wellness: ACCUEIL_LOISIRS,
  pro_event: PRO_EVENEMENTIEL, convention_center: PRO_EVENEMENTIEL, coworking: PRO_EVENEMENTIEL,
  live_event: PRO_EVENEMENTIEL,
};

// La liste servie au formulaire : curatée si le métier est connu, générique sinon.
export function eventTypesFor(industryCode: string | null | undefined): EventTypeOption[] {
  const key = String(industryCode ?? "").trim();
  return (key && BY_INDUSTRY[key]) || EVENT_TYPES_GENERIC;
}

// Le libellé d'UNE valeur, pour tous les rendus (dossier, cartes, feed) — union historique +
// nouveaux. Valeur inconnue → passthrough lisible, jamais un libellé inventé.
const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  [...EVENT_TYPES_GENERIC, ...EXTRA_TYPES].map((o) => [o.value, o.label_fr]),
);
export function eventTypeLabelFr(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return v ? (LABEL_BY_VALUE[v] ?? v.replace(/_/g, " ")) : "";
}
