// src/lib/fr/rapport.fr.ts — LES MOTS du Rapport (docs/explorer-outil-spec.md § 6.5) — LE fichier que l'owner édite.
//
// Une entrée par section : `cle`, `titre` (acté owner 12/09, lexique l. 126), `definition` (une ligne, reprise de la
// définition du lexique quand elle existe), `referentiel` (à quoi le chiffre se compare), `unite`, `alias[]` (les
// formulations par lesquelles un exploitant demande la section — `composer_rapport` choisit par alias, jamais par
// invention : une demande sans section rend un bloc `absence`). Patron : rapportCanaux.fr.ts.
// Comparaisons (owner 12/09) : « par rapport à la période précédente », « par rapport à la même période l'an dernier ».

export type SectionCle =
  | "synthese" | "chiffre_affaires" | "volume" | "panier" | "mix"
  | "marge_brute" | "resultat_net" | "seuil_rentabilite"
  | "poles" | "familles" | "espace" | "jours" | "contexte" | "actions" | "sources";

export interface SectionDef {
  cle: SectionCle;
  titre: string;
  definition: string;
  referentiel: string;
  unite: string;
  alias: string[];
}

export const COMPARAISON_FR = {
  precedente: "par rapport à la période précédente",
  an_dernier: "par rapport à la même période l'an dernier",
};

export const SECTIONS: SectionDef[] = [
  { cle: "synthese", titre: "Synthèse", definition: "Ce que la période dit, en quelques phrases vérifiées.", referentiel: "les sections du Rapport", unite: "—",
    alias: ["synthèse", "synthese", "résumé", "resume", "en bref", "l'essentiel"] },
  { cle: "chiffre_affaires", titre: "Chiffre d'affaires", definition: "Le chiffre d'affaires de la période, comparé à la période précédente et à la même période l'an dernier.", referentiel: "la période précédente, l'an dernier", unite: "€",
    alias: ["chiffre d'affaires", "chiffre d’affaires", "ca", "ventes en euros", "combien j'ai vendu", "recettes"] },
  { cle: "volume", titre: "Nombre de ventes", definition: "Le nombre de ventes de la période et son écart à la période précédente.", referentiel: "la période précédente", unite: "ventes",
    alias: ["volume", "volume de ventes", "nombre de ventes", "tickets", "transactions", "fréquentation en caisse"] },
  { cle: "panier", titre: "Panier moyen", definition: "Le chiffre d'affaires divisé par le nombre de ventes, et son écart à la période précédente.", referentiel: "la période précédente", unite: "€ par vente",
    alias: ["panier", "panier moyen", "ticket moyen", "dépense moyenne"] },
  { cle: "mix", titre: "Mix produits & services", definition: "La part de chaque famille dans le chiffre d'affaires de la période.", referentiel: "le chiffre d'affaires de la période", unite: "% du CA",
    alias: ["mix", "mix produits", "mix produits & services", "répartition par famille", "repartition par famille", "part des familles", "quelles familles"] },
  { cle: "marge_brute", titre: "Marge brute", definition: "Le CA net HT moins le prix d'achat des articles vendus, sur la part du CA dont le prix d'achat est renseigné.", referentiel: "les 30 derniers jours", unite: "€ et % du CA net HT",
    alias: ["marge", "marge brute", "taux de marge", "rentabilité des familles"] },
  { cle: "resultat_net", titre: "Résultat net", definition: "La marge brute du mois moins les charges fixes et la masse salariale du mois ; mois complets seulement.", referentiel: "le dernier mois complet", unite: "€",
    alias: ["résultat net", "resultat net", "résultat", "bénéfice", "ce qu'il reste"] },
  { cle: "seuil_rentabilite", titre: "Seuil de rentabilité", definition: "Le CA net HT qu'une journée doit générer pour couvrir sa part de charges fixes et de masse salariale.", referentiel: "le dernier jour de vente", unite: "€ de CA net HT",
    alias: ["seuil de rentabilité", "seuil de rentabilite", "seuil", "à partir de quelle heure je gagne", "point d'équilibre"] },
  { cle: "poles", titre: "Vos pôles · du plus au moins performant", definition: "Vos pôles classés sur l'indicateur demandé (CA, ventes, marge brute, CA par mètre ou par m²).", referentiel: "la période demandée ; les 30 jours des mesures pour le mètre et le m²", unite: "selon l'indicateur",
    alias: ["pôles", "poles", "mes pôles", "classement des pôles", "pôles les plus performants", "pôles les moins performants", "quel pôle"] },
  { cle: "familles", titre: "Vos familles · du plus au moins performant", definition: "Vos familles de produits & services classées par chiffre d'affaires sur la période.", referentiel: "le chiffre d'affaires de la période", unite: "€ et % du CA",
    alias: ["familles", "mes familles", "classement des familles", "familles les plus vendues", "meilleures familles", "familles de produits"] },
  { cle: "espace", titre: "Espace · linéaire, surface de vente, CA par mètre", definition: "Les mètres linéaires et la surface de vente de chaque pôle, et ce qu'ils génèrent par mètre et par m².", referentiel: "les 30 jours des mesures d'espace", unite: "m, m², € par mètre",
    alias: ["espace", "linéaire", "lineaire", "surface de vente", "au mètre", "au m²", "par mètre", "par m2", "par m²", "mètres linéaires"] },
  { cle: "jours", titre: "CA moyen par jour de la semaine", definition: "Le chiffre d'affaires moyen de chaque jour de la semaine sur la période (à partir de quatre semaines).", referentiel: "la période demandée", unite: "€ par jour",
    alias: ["jours", "jour de semaine", "jour de la semaine", "jours de la semaine", "par jour de la semaine", "ca moyen par jour", "profil par jour", "quel jour", "meilleur jour"] },
  { cle: "contexte", titre: "Contexte externe", definition: "La météo, le calendrier, le tourisme et l'activité autour du site sur la période.", referentiel: "la période demandée", unite: "jours",
    alias: ["contexte", "contexte externe", "météo", "meteo", "calendrier", "tourisme", "événements autour"] },
  { cle: "actions", titre: "Actions recommandées", definition: "Les actions issues de vos propres signaux de vente sur la période.", referentiel: "la période demandée", unite: "—",
    alias: ["actions", "actions recommandées", "que faire", "recommandations"] },
  { cle: "sources", titre: "Sources et fiabilité", definition: "D'où viennent les chiffres du Rapport et sur quelle fenêtre ils sont mesurés.", referentiel: "—", unite: "—",
    alias: ["sources", "fiabilité", "fiabilite", "d'où viennent les chiffres"] },
];

export const SECTION_BY_CLE: Record<SectionCle, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.cle, s])) as Record<SectionCle, SectionDef>;

/** Les sections du rapport de ventes d'aujourd'hui (rapport.astro), dans son ordre — le premier Modèle par défaut (§ 6.3). */
export const MODELE_VENTES: SectionCle[] = ["synthese", "chiffre_affaires", "volume", "panier", "mix", "jours", "marge_brute", "contexte", "actions", "sources"];

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

/**
 * Une demande (« volume, panier, mix, et les pôles… ») → les clés de section reconnues par alias, dans l'ordre de la
 * demande, sans doublon ; `inconnues` = les morceaux qu'aucun alias ne couvre (ils deviennent un bloc `absence`).
 * L'appariement se fait sur chaque morceau (séparé par virgule, « et », point-virgule) : un alias est reconnu s'il
 * présent dans le morceau en mot entier (accents et casse ignorés) ; un morceau peut nommer plusieurs sections.
 */
/** Position d'un alias dans le morceau, en MOT entier (« ca » ne se lit pas dans « vacances ») ; −1 sinon. */
function indexOfMot(texte: string, alias: string): number {
  const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`);
  const m = re.exec(texte);
  return m ? m.index + m[1].length : -1;
}

export function resolveSections(demande: string[] | string | null | undefined): { cles: SectionCle[]; inconnues: string[] } {
  const morceaux = (Array.isArray(demande) ? demande : String(demande ?? "").split(/[,;\n]| et | puis /i))
    .map((m) => String(m ?? "").trim()).filter(Boolean);
  const cles: SectionCle[] = [];
  const inconnues: string[] = [];
  for (const m of morceaux) {
    const n = norm(m);
    // Un morceau peut nommer plusieurs sections (« les pôles en nombre de ventes » : pôles, puis volume) : toutes sont
    // retenues, dans l'ordre où leurs alias apparaissent dans le morceau.
    const trouves: Array<{ cle: SectionCle; pos: number }> = [];
    for (const s of SECTIONS) {
      let pos = -1;
      if (n === s.cle) pos = 0;
      for (const a of [s.titre, ...s.alias]) { const i = indexOfMot(n, norm(a)); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
      if (pos >= 0) trouves.push({ cle: s.cle, pos });
    }
    trouves.sort((a, b) => a.pos - b.pos);
    if (trouves.length) { for (const t of trouves) if (!cles.includes(t.cle)) cles.push(t.cle); }
    else inconnues.push(m);
  }
  return { cles, inconnues };
}
