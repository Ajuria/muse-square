// Registre UNIQUE des types de COMPOSANT d'un dispositif permanent (spec
// docs/dispositifs-typologie-spec.md § 3-4, owner 03/09 : D1 « on photographie un composant du
// dispositif ; un dispositif peut en avoir plusieurs »). Même forme que eventTypes.ts :
//   · liste FERMÉE — jamais de texte libre sur le type (clé de l'extraction photo et du crawl) ;
//   · une valeur ne se renomme JAMAIS une fois qu'un enregistrement la porte ;
//   · UNE source pour le formulaire, les rendus, la lecture des photos et le crawl ;
//   · une liste par métier finit toujours par « autre » ; extension = une ligne.
//
// Deux axes (owner 03/09) : le TYPE dit l'objet physique (vitrine, linéaire, gondole…), le RÔLE dit
// ce qu'il contient et comment le client le choisit (courant, expert, impulsion, promo). Les
// questions de la check-list dépendent des deux.
//
// Mots : docs/lexique.md fait loi. Les libellés marqués `provisoire: true` n'ont PAS de mot owner
// (lexique, lignes du 03/09) — ils se demandent avant tout rendu, ils ne s'inventent pas. Les
// `question_fr` sont la consigne d'extraction (une question à laquelle une photo répond oui / non /
// on ne voit pas) — pas une phrase de geste ; tout rendu à l'écran repasse par le lexique.

import type { Lever } from "./bestInClassStore";

export interface DispositifTypeOption {
  value: string;
  label_fr: string;
  provisoire?: boolean; // libellé sans mot owner — à demander avant tout rendu
}

export interface DispositifRoleOption {
  value: string;
  label_fr: string;
  provisoire?: boolean;
}

export type Reponse = "oui" | "non" | "non_visible";

export interface ChecklistQuestion {
  key: string;
  question_fr: string;
  // Rôles pour lesquels la question se pose ; "all" = tous les rôles du type (ou type sans rôle).
  roles: string[] | "all";
  lever: Lever | null;
  // Ce que la réponse prouve une fois croisée avec la mesure (ventes, fréquentation) — doc interne.
  proves_fr: string;
}

// ── Les types de composant ─────────────────────────────────────────────────────────────────────
export const DISPOSITIF_TYPES: DispositifTypeOption[] = [
  { value: "vitrine", label_fr: "Vitrine" },
  { value: "lineaire", label_fr: "Linéaire" },
  { value: "gondole", label_fr: "Gondole" },
  { value: "tete_de_gondole", label_fr: "Tête de gondole" },
  { value: "table_ilot", label_fr: "Table ou îlot", provisoire: true },
  { value: "point_assiste", label_fr: "Point service / vente avec une personne" },
  { value: "caisse", label_fr: "Caisse", provisoire: true },
  { value: "espace_experience", label_fr: "Espace dégustation / atelier", provisoire: true },
  { value: "mediation", label_fr: "Dispositif de médiation" },
  { value: "autre", label_fr: "Autre" },
];

// ── Les rôles, par type ────────────────────────────────────────────────────────────────────────
// Libre-service : ce que l'unité contient et comment le client le choisit (libellés provisoires).
const ROLES_LIBRE_SERVICE: DispositifRoleOption[] = [
  { value: "courant", label_fr: "Produits courants", provisoire: true },
  { value: "expert", label_fr: "Produits d'expert", provisoire: true },
  { value: "impulsion", label_fr: "Achats d'impulsion", provisoire: true },
  { value: "promo", label_fr: "Offre temporaire", provisoire: true },
];
const ROLES_POINT_ASSISTE: DispositifRoleOption[] = [
  { value: "comptoir_service", label_fr: "La personne sert le produit", provisoire: true },
  { value: "point_conseil", label_fr: "La personne conseille, le produit est ailleurs", provisoire: true },
  { value: "billetterie_accueil", label_fr: "Accueil / billetterie", provisoire: true },
];
const ROLES_MEDIATION: DispositifRoleOption[] = [
  { value: "cartel", label_fr: "Cartel" },
  { value: "panneau_de_salle", label_fr: "Panneau de salle", provisoire: true },
  { value: "multimedia", label_fr: "Dispositif multimédia" },
  { value: "signaletique", label_fr: "Signalétique", provisoire: true },
];

export const ROLES_BY_TYPE: Record<string, DispositifRoleOption[]> = {
  vitrine: [],
  lineaire: ROLES_LIBRE_SERVICE,
  gondole: ROLES_LIBRE_SERVICE,
  tete_de_gondole: ROLES_LIBRE_SERVICE,
  table_ilot: [],
  point_assiste: ROLES_POINT_ASSISTE,
  caisse: [],
  espace_experience: [],
  mediation: ROLES_MEDIATION,
  autre: [],
};

// ── Les check-lists : ce qu'une photo peut prouver ─────────────────────────────────────────────
const CL_VITRINE: ChecklistQuestion[] = [
  { key: "vt_lisible_rue", question_fr: "Peut-on lire le contenu depuis le trottoir, à hauteur d'œil ?", roles: "all", lever: "frequentation", proves_fr: "entrées comparées au passage estimé des jours de même classe" },
  { key: "vt_prix_visible", question_fr: "Au moins un prix est-il affiché ?", roles: "all", lever: "conversion", proves_fr: "conformité (affichage des prix obligatoire en France) — pas de carte" },
  { key: "vt_offre_datee", question_fr: "Le message porte-t-il une date ou une échéance ?", roles: "all", lever: "frequentation", proves_fr: "l'opération correspondante existe-t-elle dans le journal ?" },
  { key: "vt_article_apparie", question_fr: "Quels articles de la liste vendue reconnaît-on ?", roles: "all", lever: "panier", proves_fr: "ventes de l'article pendant les jours d'exposition" },
  { key: "vt_change_depuis", question_fr: "Le contenu a-t-il changé depuis la photo précédente ?", roles: "all", lever: null, proves_fr: "alimente la version ; jamais une carte seule" },
  { key: "vt_eclairee", question_fr: "La vitrine est-elle éclairée et dégagée ?", roles: "all", lever: "frequentation", proves_fr: "—" },
];

// Partagée par linéaire, gondole, tête de gondole.
const CL_LIBRE_SERVICE: ChecklistQuestion[] = [
  { key: "ls_moyen_essai", question_fr: "Y a-t-il un moyen d'essayer : sentir, goûter, toucher, un échantillon ?", roles: ["expert"], lever: "conversion", proves_fr: "famille ou articles sous leur habituel + non = cause candidate (cas des poivres)" },
  { key: "ls_usage_explique", question_fr: "Un support dit-il à quoi sert le produit ou comment le choisir, et pas seulement d'où il vient ?", roles: ["expert"], lever: "conversion", proves_fr: "idem" },
  { key: "ls_prix_par_article", question_fr: "Chaque article porte-t-il son prix ?", roles: "all", lever: "conversion", proves_fr: "conformité ; article sans prix comparé à ses ventes" },
  { key: "ls_entree_gamme_oeil", question_fr: "Y a-t-il un article d'entrée de gamme à hauteur d'œil ?", roles: ["expert"], lever: "panier", proves_fr: "ventes des articles selon leur hauteur" },
  { key: "ls_groupement", question_fr: "Les produits sont-ils groupés par usage (cuisine, moment) ou par origine ?", roles: "all", lever: "panier", proves_fr: "paires d'achats (nécessite des paniers)" },
  { key: "ls_facing_vide", question_fr: "Un emplacement est-il vide au moment de la photo ?", roles: "all", lever: null, proves_fr: "jours sans vente de l'article à la date de la photo" },
  { key: "ls_article_apparie", question_fr: "Quels articles de la liste vendue reconnaît-on ?", roles: "all", lever: null, proves_fr: "la base de toute lecture par article" },
  { key: "ls_meilleure_vente_visible", question_fr: "Le meilleur vendeur de l'unité est-il visible et accessible ?", roles: "all", lever: "panier", proves_fr: "—" },
  { key: "ls_offre_datee", question_fr: "L'offre affichée porte-t-elle une date de fin ?", roles: ["promo"], lever: "conversion", proves_fr: "l'opération existe-t-elle dans le journal ?" },
];
const CL_GONDOLE: ChecklistQuestion[] = [
  ...CL_LIBRE_SERVICE,
  { key: "gd_double_face_coherente", question_fr: "Les deux faces de la gondole se répondent-elles (même univers) ?", roles: "all", lever: "panier", proves_fr: "paires d'achats entre les deux faces (nécessite des paniers)" },
];

const CL_TABLE_ILOT: ChecklistQuestion[] = [
  { key: "il_theme_lisible", question_fr: "Le regroupement raconte-t-il un usage ou une saison ?", roles: "all", lever: "panier", proves_fr: "—" },
  { key: "il_prix_visible", question_fr: "Les prix sont-ils visibles ?", roles: "all", lever: "conversion", proves_fr: "conformité" },
  { key: "il_article_apparie", question_fr: "Quels articles de la liste vendue reconnaît-on ?", roles: "all", lever: null, proves_fr: "la base de toute lecture par article" },
  { key: "il_change_depuis", question_fr: "A-t-il changé depuis la dernière photo ?", roles: "all", lever: null, proves_fr: "alimente la version" },
];

const CL_POINT_ASSISTE: ChecklistQuestion[] = [
  { key: "pa_produit_visible_client", question_fr: "Le client voit-il les produits depuis son côté du comptoir ?", roles: ["comptoir_service"], lever: "conversion", proves_fr: "—" },
  { key: "pa_prix_visible", question_fr: "Les prix sont-ils affichés côté client ?", roles: "all", lever: "conversion", proves_fr: "conformité" },
  { key: "pa_degustation", question_fr: "Une dégustation ou un essai est-il proposé ?", roles: ["comptoir_service", "point_conseil"], lever: "conversion", proves_fr: "—" },
  { key: "pa_file_lisible", question_fr: "Sait-on où se mettre pour attendre ?", roles: "all", lever: "conversion", proves_fr: "—" },
  // Une photo ne le montre pas : le planning n'existe pas dans la pile (on connaît l'équipe, pas
  // ses heures). Gardée dans la liste pour que l'extraction réponde « non visible », jamais « oui ».
  { key: "pa_heures_tenues", question_fr: "À quelles heures le point est-il tenu ?", roles: "all", lever: null, proves_fr: "non visible sur une photo — nécessite le planning (absent)" },
];

const CL_CAISSE: ChecklistQuestion[] = [
  { key: "cs_impulsion_presente", question_fr: "Y a-t-il des articles d'impulsion à la caisse ?", roles: "all", lever: "panier", proves_fr: "—" },
  { key: "cs_fidelite_visible", question_fr: "Le programme de fidélité est-il visible ?", roles: "all", lever: "fidelisation", proves_fr: "—" },
  { key: "cs_paiement_affiche", question_fr: "Les moyens de paiement sont-ils affichés ?", roles: "all", lever: "conversion", proves_fr: "—" },
];

const CL_ESPACE_EXPERIENCE: ChecklistQuestion[] = [
  { key: "ex_visible_depuis_entree", question_fr: "Le voit-on depuis l'entrée ?", roles: "all", lever: "conversion", proves_fr: "—" },
  { key: "ex_lie_a_articles", question_fr: "Les articles concernés sont-ils à portée ?", roles: "all", lever: "panier", proves_fr: "—" },
  { key: "ex_horaire_affiche", question_fr: "L'horaire est-il affiché ?", roles: "all", lever: "fidelisation", proves_fr: "—" },
];

// Ne vend rien : le résultat se lit sur la fréquentation et le temps passé, jamais sur des articles.
const CL_MEDIATION: ChecklistQuestion[] = [
  { key: "md_lisible_hauteur", question_fr: "Le texte se lit-il à hauteur d'œil, avec une taille de caractère suffisante ?", roles: "all", lever: null, proves_fr: "—" },
  { key: "md_eclaire", question_fr: "Le support est-il éclairé sans reflet ?", roles: "all", lever: null, proves_fr: "—" },
  { key: "md_langues", question_fr: "Quelles langues le support propose-t-il ?", roles: "all", lever: "frequentation", proves_fr: "à croiser avec les classes de jours de tourisme étranger mesurées sur le lieu" },
  { key: "md_pres_de_l_oeuvre", question_fr: "Le support est-il placé à côté de ce qu'il explique ?", roles: ["cartel", "panneau_de_salle"], lever: null, proves_fr: "—" },
  { key: "md_en_marche", question_fr: "Le dispositif est-il allumé et en état de marche au moment de la photo ?", roles: ["multimedia"], lever: null, proves_fr: "jours de panne comparés à l'affluence" },
  { key: "md_change_depuis", question_fr: "Le support a-t-il changé depuis la photo précédente ?", roles: "all", lever: null, proves_fr: "alimente la version" },
];

export const CHECKLIST_BY_TYPE: Record<string, ChecklistQuestion[]> = {
  vitrine: CL_VITRINE,
  lineaire: CL_LIBRE_SERVICE,
  gondole: CL_GONDOLE,
  tete_de_gondole: CL_LIBRE_SERVICE,
  table_ilot: CL_TABLE_ILOT,
  point_assiste: CL_POINT_ASSISTE,
  caisse: CL_CAISSE,
  espace_experience: CL_ESPACE_EXPERIENCE,
  mediation: CL_MEDIATION,
  autre: [],
};

// ── Curation par famille de métier (codes INDUSTRY_LABEL, competitive/constants.ts) ───────────
const T = (value: string): DispositifTypeOption => {
  const hit = DISPOSITIF_TYPES.find((o) => o.value === value);
  if (!hit) throw new Error(`dispositifTypes: valeur inconnue ${value}`);
  return hit;
};

const COMMERCE: DispositifTypeOption[] = [
  T("vitrine"), T("lineaire"), T("gondole"), T("tete_de_gondole"), T("table_ilot"),
  T("point_assiste"), T("caisse"), T("espace_experience"), T("autre"),
];
const BOUCHE: DispositifTypeOption[] = [
  T("vitrine"), T("lineaire"), T("point_assiste"), T("espace_experience"), T("caisse"), T("autre"),
];
const CULTURE: DispositifTypeOption[] = [
  T("mediation"), T("point_assiste"), T("vitrine"), T("lineaire"), T("caisse"), T("autre"),
];
const ACCUEIL_LOISIRS: DispositifTypeOption[] = [
  T("point_assiste"), T("vitrine"), T("lineaire"), T("autre"),
];
const PRO_EVENEMENTIEL: DispositifTypeOption[] = [
  T("point_assiste"), T("vitrine"), T("autre"),
];

const BY_INDUSTRY: Record<string, DispositifTypeOption[]> = {
  commercial: COMMERCE,
  food_nightlife: BOUCHE, market_hall: BOUCHE, wine_tourism: BOUCHE,
  culture: CULTURE, gallery: CULTURE, cinema_theatre: CULTURE, science_innovation: CULTURE,
  hotel_lodging: ACCUEIL_LOISIRS, camping_outdoor: ACCUEIL_LOISIRS, theme_park: ACCUEIL_LOISIRS,
  sport: ACCUEIL_LOISIRS, wellness: ACCUEIL_LOISIRS,
  pro_event: PRO_EVENEMENTIEL, convention_center: PRO_EVENEMENTIEL, coworking: PRO_EVENEMENTIEL,
  live_event: PRO_EVENEMENTIEL,
};

// ── API ────────────────────────────────────────────────────────────────────────────────────────

// La liste servie au formulaire : curatée si le métier est connu, complète sinon.
export function dispositifTypesFor(industryCode: string | null | undefined): DispositifTypeOption[] {
  const key = String(industryCode ?? "").trim();
  return (key && BY_INDUSTRY[key]) || DISPOSITIF_TYPES;
}

// Les rôles d'un type ; liste vide = le type n'a pas de rôle.
export function dispositifRolesFor(typeValue: string | null | undefined): DispositifRoleOption[] {
  return ROLES_BY_TYPE[String(typeValue ?? "").trim()] ?? [];
}

// Les questions à poser à une photo d'un composant de ce type et de ce rôle.
export function checklistFor(typeValue: string, roleValue?: string | null): ChecklistQuestion[] {
  const all = CHECKLIST_BY_TYPE[typeValue] ?? [];
  const role = String(roleValue ?? "").trim();
  return all.filter((q) => q.roles === "all" || (role !== "" && q.roles.includes(role)));
}

// Toutes les clés de question connues — la porte d'extraction rejette toute clé hors de cette liste.
export const ALL_CHECKLIST_KEYS: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(CHECKLIST_BY_TYPE).flat().map((q) => q.key))),
);

// Le libellé d'UNE valeur, pour tous les rendus. Valeur inconnue → passthrough lisible, jamais un
// libellé inventé.
const TYPE_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(DISPOSITIF_TYPES.map((o) => [o.value, o.label_fr]));
export function dispositifTypeLabelFr(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return v ? (TYPE_LABEL_BY_VALUE[v] ?? v.replace(/_/g, " ")) : "";
}
const ROLE_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  Object.values(ROLES_BY_TYPE).flat().map((o) => [o.value, o.label_fr]),
);
export function dispositifRoleLabelFr(value: string | null | undefined): string {
  const v = String(value ?? "").trim();
  return v ? (ROLE_LABEL_BY_VALUE[v] ?? v.replace(/_/g, " ")) : "";
}

// ── Les composants d'un dispositif (spec § 3, owner 03/09 D1) ───────────────────────────────
// Un dispositif permanent liste ses composants DANS sa ligne (colonne `components`, JSON) : une
// clé stable par composant (la photo s'y rattache), un type du registre, un rôle du type quand
// il en a un, un libellé libre (« Linéaire poivres »). Le TYPE et le RÔLE ne sont jamais du
// texte libre — le registre ci-dessus fait loi ; le libellé l'est.

export interface DispositifComponent {
  key: string;         // stable dans la chaîne de versions — jamais régénérée si fournie
  type: string;        // valeur de DISPOSITIF_TYPES
  role: string | null; // valeur de ROLES_BY_TYPE[type], ou null si le type n'a pas de rôle
  label: string | null;
}

export type ParsedComponents =
  | { ok: true; components: DispositifComponent[] }
  | { ok: false; error: string };

const KEY_RE = /^[a-z0-9_-]{1,40}$/i;

// Valide une liste de composants venue d'un client (formulaire) ou d'un parent (héritage).
// `newKey` fabrique la clé d'un composant qui n'en a pas encore (crypto.randomUUID côté serveur).
// Une liste vide est valide : un dispositif peut n'avoir aucun composant déclaré.
export function parseComponents(input: unknown, newKey: () => string): ParsedComponents {
  if (input == null) return { ok: true, components: [] };
  if (!Array.isArray(input)) return { ok: false, error: "components doit être une liste" };
  if (input.length > 50) return { ok: false, error: "components : 50 composants au plus" };
  const out: DispositifComponent[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "components : un composant est un objet {type, role, label, key}" };
    const r = raw as Record<string, unknown>;
    const type = String(r.type ?? "").trim();
    if (!type || !DISPOSITIF_TYPES.some((o) => o.value === type)) {
      return { ok: false, error: `components : type inconnu « ${type || "(vide)"} »` };
    }
    const roles = ROLES_BY_TYPE[type] ?? [];
    const roleRaw = r.role == null ? "" : String(r.role).trim();
    let role: string | null = null;
    if (roleRaw) {
      if (!roles.some((o) => o.value === roleRaw)) return { ok: false, error: `components : rôle « ${roleRaw} » inconnu pour le type ${type}` };
      role = roleRaw;
    }
    const keyRaw = r.key == null ? "" : String(r.key).trim();
    if (keyRaw && !KEY_RE.test(keyRaw)) return { ok: false, error: `components : clé invalide « ${keyRaw} »` };
    const key = keyRaw || newKey();
    if (seen.has(key)) return { ok: false, error: `components : clé dupliquée « ${key} »` };
    seen.add(key);
    const labelRaw = r.label == null ? "" : String(r.label).trim().slice(0, 120);
    out.push({ key, type, role, label: labelRaw || null });
  }
  return { ok: true, components: out };
}

// Lecture tolérante de la colonne `components` (JSON texte) : une colonne illisible rend une
// liste vide, jamais un crash — même règle que pole_families dans evolution.ts.
export function readComponents(raw: unknown): DispositifComponent[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const res = parseComponents(parsed, () => "");
    return res.ok ? res.components.filter((c) => c.key !== "") : [];
  } catch { return []; }
}
