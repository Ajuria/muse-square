// src/lib/dispositifs/photoDeplacement.ts
// =====================================================
// DÉPLACER UNE PHOTO POSÉE SUR LE MAUVAIS MEUBLE — LA RÈGLE, PURE (owner 15/09 : « déplacer la photo »).
//
// LE GESTE, DANS SES MOTS. L'exploitant voit une photo sous un meuble qui n'est pas le bon. Il tape le
// NUMÉRO du meuble tel qu'il est écrit sur son plan, et la photo s'en va là-bas. Rien d'autre : il ne
// re-déclare pas la mesure du meuble (arbitrage owner 15/09 — c'était l'autre lecture possible du même
// champ, et elle aurait changé le linéaire, la Part de linéaire et le CA/m du pôle entier).
//
// CE QUE CE MODULE DÉCIDE, ET RIEN D'AUTRE NE LE DÉCIDE : quelle photo part, vers quel composant, ce
// que ça déplace d'autre, et ce qui l'empêche. La route EXÉCUTE le plan, elle ne le recalcule pas —
// même contrat que `photoRetrait.ts`.
//
// POURQUOI LE NUMÉRO SUFFIT À DÉSIGNER LA CIBLE. Mesuré sur le compte : 52 composants, 52 numéros,
// tous distincts, de 1 à 52. La résolution numéro → composant est donc une bijection. Si un jour deux
// meubles portaient le même numéro, ce module REFUSE plutôt que de choisir : deux photos rangées au
// hasard coûtent plus cher qu'un geste qui ne part pas.
//
// LES DEUX ÉCRITURES, ET POURQUOI IL EN FAUT DEUX. La lecture d'une page garde LA DERNIÈRE LIGNE PAR
// (version, composant) (`latestPerComponent`). Écrire seulement la photo à sa nouvelle place la ferait
// apparaître là-bas SANS disparaître d'ici : l'ancienne ligne resterait la dernière de son composant.
// Il faut donc une MARQUE à l'ancienne place — une ligne de statut « déplacée » qui dit où la photo est
// partie. C'est elle qui porte la phrase de la page et le geste d'annulation.
//
// LE STATUT S'ÉCRIT EN BON FRANÇAIS (owner 15/09 : « status = "deplacee" → déplacée → écris en bon
// français »). La valeur stockée est `"déplacée"`, accentuée : c'est une chaîne qu'un humain lit.
// Les deux valeurs héritées, `"read"` et `"error"`, restent en anglais — une dette que je signale
// plutôt que de la corriger en douce, parce que la renommer réécrirait des lignes déjà en base.
import type { PhotoRow } from "./dispositifPhotoRows";

/** Un meuble tel que la page le connaît : son numéro sur le plan, sa clé, son NOM lu en base. */
export interface MeublePourDeplacement {
  component_key: string;
  fixture_no: number | null;
  /** `component_label` — « N° 2 — Vin & Spiritueux ». JAMAIS un nom recomposé (CLAUDE.md, 15/09). */
  nom: string;
  pole_label: string;
  dispositif_id: string;
}

export interface PlanDeDeplacement {
  photo_id: string;
  location_id: string;
  dispositif_id: string;
  version_no: number;
  /** Là d'où la photo part. */
  depuis: { component_key: string; nom: string; pole_label: string; fixture_no: number | null };
  /** Là où elle va. */
  vers: { component_key: string; nom: string; pole_label: string; fixture_no: number | null; dispositif_id: string };
  /** Le pôle change : ce que la photo a fait lire change de pôle avec elle. La page le DIT avant. */
  change_de_pole: boolean;
  /** Le nombre d'articles reconnus qui suivent la photo — 0 quand elle n'a rien fait lire. */
  articles_suivis: number;
}

export type RefusDeDeplacement =
  | "photo_introuvable"
  | "numero_absent"
  | "numero_inconnu"
  | "numero_ambigu"
  | "deja_la";

export type ResultatDeDeplacement =
  | { ok: true; plan: PlanDeDeplacement }
  | { ok: false; refus: RefusDeDeplacement };

/** Le statut d'une ligne qui n'est plus une photo, mais la trace d'un départ. */
export const STATUT_DEPLACEE = "déplacée";

/**
 * PUR. Rend le plan du déplacement, ou le refus qui l'empêche — jamais une exception.
 * `meubles` porte TOUS les meubles mesurés du site, pas seulement ceux du pôle courant : un numéro
 * peut désigner un meuble d'un autre pôle, et c'est précisément le cas qu'il faut savoir annoncer.
 */
export function planDeDeplacement(e: {
  photo_id: string;
  vers_fixture_no: unknown;
  photos: PhotoRow[];
  meubles: MeublePourDeplacement[];
}): ResultatDeDeplacement {
  const photo = e.photos.find((p) => p.photo_id === e.photo_id) || null;
  if (!photo) return { ok: false, refus: "photo_introuvable" };

  const brut = typeof e.vers_fixture_no === "string" ? e.vers_fixture_no.trim() : e.vers_fixture_no;
  const n = Number(brut);
  if (brut === "" || brut == null || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { ok: false, refus: "numero_absent" };
  }

  const candidats = e.meubles.filter((m) => m.fixture_no === n);
  if (!candidats.length) return { ok: false, refus: "numero_inconnu" };
  // Deux meubles sous le même numéro : on ne choisit pas à sa place.
  if (candidats.length > 1) return { ok: false, refus: "numero_ambigu" };
  const cible = candidats[0];
  if (cible.component_key === photo.component_key) return { ok: false, refus: "deja_la" };

  const source = e.meubles.find((m) => m.component_key === photo.component_key) || null;
  return {
    ok: true,
    plan: {
      photo_id: photo.photo_id,
      location_id: photo.location_id,
      dispositif_id: photo.dispositif_id,
      version_no: photo.version_no,
      depuis: {
        component_key: photo.component_key,
        nom: source?.nom || "",
        pole_label: source?.pole_label || "",
        fixture_no: source?.fixture_no ?? photo.fixture_no ?? null,
      },
      vers: {
        component_key: cible.component_key, nom: cible.nom, pole_label: cible.pole_label,
        fixture_no: cible.fixture_no, dispositif_id: cible.dispositif_id,
      },
      // Comparé par le LIBELLÉ du pôle seulement quand les deux sont connus : un pôle inconnu ne se
      // déclare pas « différent », il ne se déclare pas du tout.
      change_de_pole: !!(source?.pole_label && cible.pole_label && source.pole_label !== cible.pole_label),
      articles_suivis: Array.isArray(photo.items_matched) ? photo.items_matched.length : 0,
    },
  };
}
