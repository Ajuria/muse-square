// src/lib/dispositifs/photoRetrait.ts
// =====================================================
// RETIRER UNE PHOTO — LA RÈGLE, PURE (owner 14/09 : « fais du retrait une action de la page du pôle »).
//
// Jusqu'ici le seul retrait était un script d'outillage que je lançais moi-même. Le geste appartient à
// l'exploitant : il photographie, il se trompe, il retire. Ce module dit CE QUI TOMBE, et rien d'autre
// ne le décide — la route exécute le plan, elle ne le recalcule pas.
//
// UNE PHOTO VIT DANS QUATRE ENDROITS, et un retrait qui en oublie un laisse une trace :
//   1. `analytics.dispositif_photos`  — la ligne
//   2. le bucket, image entière       — <location_id>/<dispositif_id>/<photo_id>.jpg
//   3. le bucket, variante bande      — …band.webp   (la bande des cartes)
//   4. le bucket, variante carrée     — …square.webp (la vignette de 96 px)
// Une ligne retirée sans ses objets laisse un orphelin facturé ; un objet retiré sans sa ligne laisse
// une vignette morte sur la page. Les quatre, toujours.
//
// LA VERSION, ET C'EST LÀ QUE SE JOUE LA JUSTESSE. Une photo qui montre un changement franc crée la
// version suivante du pôle, ET Y EST ÉCRITE (photos.ts § 6 : `row.version_no = suivante.version_no`).
// La photo qui a fait naître la version N est donc la PLUS ANCIENNE photo du dispositif dans N.
// Retirer cette photo-là sans sa version laisserait une version dont la cause a disparu — un pôle
// versionné par rien. La version tombe donc AVEC elle, à deux conditions non négociables :
//   · N > 1 — la version 1 est le pôle lui-même, jamais un déchet ; elle n'est jamais touchée ;
//   · aucune AUTRE photo ne vit dans N — sinon les retirer serait un dégât collatéral que personne
//     n'a demandé : la version reste, et la surface DIT pourquoi.
// Le plan porte donc toujours la raison de ce qu'il ne fait pas : une absence muette se lit comme un
// défaut, et l'exploitant a besoin de savoir dans quel état son pôle se retrouve.
// =====================================================
import type { PhotoRow } from "./dispositifPhotoRows";

/** Ce que le plan a besoin de savoir d'une version du dispositif. */
export interface VersionDuDispositif {
  commitment_id: string;
  version_no: number;
}

export type VersionGardee = "version_1" | "autres_photos" | "version_inconnue";

export interface PlanDeRetrait {
  photo_id: string;
  dispositif_id: string;
  location_id: string;
  component_key: string;
  version_no: number;
  /** Les trois objets du bucket, dans l'ordre entière → bande → carrée. */
  variantes: Array<"full" | "band" | "square">;
  /** La version née de cette photo, quand elle tombe avec elle. */
  version: VersionDuDispositif | null;
  /** Pourquoi la version NE tombe pas — jamais null quand `version` est null. */
  version_gardee: VersionGardee | null;
  /** La photo qui redevient courante pour ce composant, ou null s'il n'en reste aucune. */
  redevient_courante: string | null;
}

const parDate = (a: PhotoRow, b: PhotoRow): number =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;

/**
 * PUR. `photos` = TOUTES les photos du dispositif (toutes versions, toutes clés de composant) ;
 * `versions` = les versions connues du dispositif. La photo visée doit être dans `photos`.
 */
export function planDeRetrait(inp: {
  photo_id: string;
  photos: PhotoRow[];
  versions: VersionDuDispositif[];
}): PlanDeRetrait | null {
  const cible = inp.photos.find((p) => p.photo_id === inp.photo_id);
  if (!cible) return null;

  const dansLaVersion = inp.photos
    .filter((p) => p.version_no === cible.version_no)
    .sort(parDate);
  const laPlusAncienne = dansLaVersion.length ? dansLaVersion[0].photo_id === cible.photo_id : false;
  const autresDansLaVersion = dansLaVersion.filter((p) => p.photo_id !== cible.photo_id).length;

  let version: VersionDuDispositif | null = null;
  let version_gardee: VersionGardee | null = null;
  if (cible.version_no <= 1) {
    version_gardee = "version_1";
  } else if (autresDansLaVersion > 0) {
    version_gardee = "autres_photos";
  } else if (!laPlusAncienne) {
    // Seule photo de la version et pourtant pas la plus ancienne : impossible sur des données saines.
    version_gardee = "autres_photos";
  } else {
    const v = inp.versions.find((x) => x.version_no === cible.version_no) || null;
    if (v) version = v;
    else version_gardee = "version_inconnue";
  }

  // Ce que la page affichera ensuite pour ce composant : la plus récente des photos qui restent, dans
  // la version où le pôle se retrouve (celle de la photo, ou la précédente quand la version tombe).
  const versionApres = version ? cible.version_no - 1 : cible.version_no;
  const restantes = inp.photos
    .filter((p) => p.photo_id !== cible.photo_id
      && p.component_key === cible.component_key
      && p.version_no === versionApres)
    .sort(parDate);
  const redevient_courante = restantes.length ? restantes[restantes.length - 1].photo_id : null;

  return {
    photo_id: cible.photo_id,
    dispositif_id: cible.dispositif_id,
    location_id: cible.location_id,
    component_key: cible.component_key,
    version_no: cible.version_no,
    variantes: ["full", "band", "square"],
    version,
    version_gardee,
    redevient_courante,
  };
}
