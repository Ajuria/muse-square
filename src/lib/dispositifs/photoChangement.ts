// src/lib/dispositifs/photoChangement.ts
// =====================================================
// « SI PHOTO CHANGE, VERSIONNING CHANGE » (owner 13/09) — LE DÉCLENCHEUR, PUR.
//
// CE QUI NE PEUT PAS SERVIR DE DÉCLENCHEUR, et pourquoi. Le registre porte trois questions de
// changement (`vt_change_depuis` « Le contenu a-t-il changé depuis la photo précédente ? »,
// `il_change_depuis`, `md_change_depuis`, src/lib/dispositifs/dispositifTypes.ts). Elles sont posées
// au modèle qui ne reçoit QU'UNE image (`photoExtractionSystem` — une seule entrée `image`, jamais la
// photo précédente) : il lui est demandé de comparer à quelque chose qu'il ne voit pas, et sa propre
// règle 1 lui dit « dans le doute : non_visible ». Une réponse à ces clés n'est donc PAS une preuve de
// changement, et personne ne la lit aujourd'hui. Elles restent au registre (rien n'est retiré) ; le
// déclencheur, lui, se CALCULE ici, sur deux lignes que l'app possède déjà.
//
// CE QUI FAIT UN CHANGEMENT — trois écarts FRANCS entre la nouvelle photo et la dernière photo du
// MÊME composant DANS LA MÊME VERSION :
//   · les FAMILLES présentes (liste fermée des familles vendues du site — grossière, donc lisible) ;
//   · l'EXPOSITION (comptoir, vitrine, rayonnage, caisses au sol, îlot — cinq mots owner) ;
//   · le nombre d'ÉTAGÈRES.
// Les ARTICLES reconnus n'en font PAS partie : la reconnaissance varie d'une photo à l'autre pour un
// meuble identique, et une version créée sur ce bruit serait une version fausse. Quand l'exploitant
// CONFIRME les articles des deux photos, sa parole tranche — c'est l'incrément suivant, pas celui-ci.
//
// LE PLANCHER : les trois écarts ne comptent que si les DEUX photos couvrent le composant entier
// (`coverage_flag === "entier"`). Une famille absente d'un cadrage partiel n'a pas disparu du meuble.
//
// PREMIÈRE PHOTO DU COMPOSANT DANS CETTE VERSION ⇒ AUCUN CHANGEMENT : elle documente la version en
// cours, elle ne la remplace pas. C'est ce qui évite la cascade quand l'exploitant photographie six
// composants à la suite après avoir versionné à la main.
// =====================================================
import type { PhotoRow } from "./dispositifPhotoRows";

export type ChangementQuoi = "familles" | "exposition" | "etageres";

export interface Changement {
  quoi: ChangementQuoi;
  /** Pour les familles : ce que le composant ne porte plus / ce qu'il porte maintenant. */
  partis: string[];
  venus: string[];
  /** Pour l'exposition et les étagères : les deux valeurs. */
  avant: string | number | null;
  apres: string | number | null;
}

export interface LectureDuChangement {
  change: boolean;
  raisons: Changement[];
}

const AUCUN: LectureDuChangement = { change: false, raisons: [] };

const entier = (r: PhotoRow): boolean => r.coverage_flag === "entier";
const familles = (r: PhotoRow): string[] =>
  Array.from(new Set((r.families_present ?? []).map((f) => String(f).trim()).filter(Boolean))).sort();

/**
 * PUR — ce que la nouvelle photo change par rapport à la dernière photo du même composant de la même
 * version. `avant` null (aucune photo de ce composant dans cette version) ⇒ aucun changement.
 */
export function changementDePhoto(avant: PhotoRow | null, apres: PhotoRow): LectureDuChangement {
  if (!avant) return AUCUN;
  // Les gardes d'identité — une comparaison ne vaut que sur le MÊME composant de la MÊME version.
  if (avant.dispositif_id !== apres.dispositif_id) return AUCUN;
  if (avant.component_key !== apres.component_key) return AUCUN;
  if (avant.version_no !== apres.version_no) return AUCUN;
  if (avant.status !== "read" || apres.status !== "read") return AUCUN;
  // Le plancher de cadrage : sans les deux photos entières, aucun écart ne se lit.
  if (!entier(avant) || !entier(apres)) return AUCUN;

  const raisons: Changement[] = [];

  const fAvant = familles(avant), fApres = familles(apres);
  const partis = fAvant.filter((f) => !fApres.includes(f));
  const venus = fApres.filter((f) => !fAvant.includes(f));
  if (partis.length || venus.length) raisons.push({ quoi: "familles", partis, venus, avant: null, apres: null });

  if (avant.exposition && apres.exposition && avant.exposition !== apres.exposition) {
    raisons.push({ quoi: "exposition", partis: [], venus: [], avant: avant.exposition, apres: apres.exposition });
  }

  if (avant.levels != null && apres.levels != null && avant.levels !== apres.levels) {
    raisons.push({ quoi: "etageres", partis: [], venus: [], avant: avant.levels, apres: apres.levels });
  }

  return { change: raisons.length > 0, raisons };
}

/**
 * PUR — la dernière photo lue de CE composant dans CETTE version (la plus récente par `created_at`),
 * ou null. C'est l'unique terme de comparaison admis par `changementDePhoto`.
 */
export function dernierePhotoDuComposant(rows: readonly PhotoRow[], component_key: string, version_no: number): PhotoRow | null {
  const candidates = rows.filter(
    (r) => r.component_key === component_key && r.version_no === version_no && r.status === "read",
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (a.created_at >= b.created_at ? a : b));
}
