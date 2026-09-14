// src/lib/dispositifs/composantsDescription.ts — REDÉCRIRE UN COMPOSANT SANS CRÉER DE VERSION
// (owner 14/09, option 3 : « typer sans versionner »).
//
// LA RÈGLE, et la raison qui la tient : DÉCRIRE UN MEUBLE N'EST PAS LE CHANGER. Dire qu'un meuble
// est un linéaire plutôt qu'« Autre » ne modifie pas le magasin — c'est une correction de notre
// connaissance, pas un fait nouveau du terrain. Le versionnement reste réservé à ce qui change
// PHYSIQUEMENT, et son déclencheur est la photo (`photoChangement.ts`, owner 13/09).
//
// Ce qui se redécrit EN PLACE, sur la version courante : le TYPE, le RÔLE, le LIBELLÉ.
// Ce qui exige une version NOUVELLE, et que cette fonction REFUSE :
//   · ajouter un composant      — un meuble de plus, c'est le pôle qui a changé
//   · retirer un composant      — idem
//   · changer une clé           — la clé est l'identité : les photos, les mesures d'espace et le
//                                 rang du relevé s'y accrochent. La déplacer les détacherait en
//                                 silence (`analytics.dispositif_photos.component_key`,
//                                 `analytics.space_measures.component_key`).
//   · changer l'ORDRE           — l'ordre est celui de la marche dans le magasin, et le relevé
//                                 attribue ses photos par RANG (`prochainComposant`). Le permuter
//                                 réécrirait après coup à quel meuble appartient chaque photo.
//
// Fonction PURE : elle ne lit ni n'écrit rien. La route `commitments/edit.ts` l'appelle, et le
// foyer d'écriture reste `readMergeWrite(transitionType: "edited")` — jamais `createPermanentPole`.
import { DISPOSITIF_TYPES, ROLES_BY_TYPE, type DispositifComponent } from "./dispositifTypes";

export interface ChangementDeComposant {
  key: string;
  champ: "type" | "role" | "label";
  avant: string | null;
  apres: string | null;
}

export type PlanDeRedescription =
  | { ok: true; components: DispositifComponent[]; changements: ChangementDeComposant[] }
  | { ok: false; error: string };

const TYPES = new Set(DISPOSITIF_TYPES.map((o) => o.value));
const LABEL_MAX = 120;

function texte(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/**
 * `actuels` = les composants de la version courante (déjà validés à leur écriture).
 * `proposes` = ce que la surface renvoie : une liste d'objets {key, type, role?, label?}.
 *
 * Rend la liste FUSIONNÉE, dans l'ordre des `actuels`, plus la liste de ce qui bouge — pour que la
 * réponse puisse dire à l'exploitant ce qui a été enregistré, sans qu'on le recalcule à l'affichage.
 */
export function planDeRedescription(input: {
  actuels: DispositifComponent[];
  proposes: unknown;
}): PlanDeRedescription {
  const actuels = Array.isArray(input.actuels) ? input.actuels : [];
  if (!actuels.length) return { ok: false, error: "Ce pôle n'a aucun composant à décrire" };
  if (!Array.isArray(input.proposes)) return { ok: false, error: "components doit être une liste" };

  const parKey = new Map<string, Record<string, unknown>>();
  for (const raw of input.proposes) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "components : un composant est un objet {key, type, role, label}" };
    }
    const r = raw as Record<string, unknown>;
    const key = texte(r.key);
    if (!key) return { ok: false, error: "components : chaque composant porte sa clé" };
    if (parKey.has(key)) return { ok: false, error: `components : la clé « ${key} » revient deux fois` };
    parKey.set(key, r);
  }

  // L'ENSEMBLE des clés est le même, ou c'est une version — jamais une redescription.
  const connues = new Set(actuels.map((c) => c.key));
  for (const key of parKey.keys()) {
    if (!connues.has(key)) {
      return { ok: false, error: "Ajouter un meuble change le pôle : cela demande une version nouvelle" };
    }
  }
  if (parKey.size !== actuels.length) {
    return { ok: false, error: "Retirer un meuble change le pôle : cela demande une version nouvelle" };
  }

  const out: DispositifComponent[] = [];
  const changements: ChangementDeComposant[] = [];
  for (const avant of actuels) {
    const r = parKey.get(avant.key) as Record<string, unknown>;
    const type = texte(r.type) || avant.type;
    if (!TYPES.has(type)) return { ok: false, error: `components : type inconnu « ${type} »` };

    // Le rôle appartient au TYPE retenu — un type qui change sans rôle valide perd son rôle plutôt
    // que d'en garder un qui n'existe pas chez lui.
    const roles = ROLES_BY_TYPE[type] ?? [];
    const propose = r.role !== undefined;                       // le rôle est-il DIT, ou hérité ?
    const roleRaw = !propose ? avant.role : r.role === null ? null : texte(r.role);
    let role: string | null = null;
    if (roleRaw) {
      if (!roles.some((o) => o.value === roleRaw)) {
        // Un rôle DIT et faux est une erreur : la surface a proposé quelque chose d'impossible.
        // Un rôle HÉRITÉ que le type nouveau ne connaît pas se PERD — sinon typer un meuble ferait
        // échouer la redescription sur un champ que l'exploitant n'a pas touché.
        if (propose) return { ok: false, error: `components : rôle « ${roleRaw} » inconnu pour le type ${type}` };
      } else {
        role = roleRaw;
      }
    }

    const labelRaw = r.label === undefined ? avant.label : r.label === null ? null : texte(r.label);
    const label = labelRaw ? String(labelRaw).slice(0, LABEL_MAX) : null;

    if (type !== avant.type) changements.push({ key: avant.key, champ: "type", avant: avant.type, apres: type });
    if (role !== avant.role) changements.push({ key: avant.key, champ: "role", avant: avant.role, apres: role });
    if (label !== avant.label) changements.push({ key: avant.key, champ: "label", avant: avant.label, apres: label });

    out.push({ key: avant.key, type, role, label });
  }

  if (!changements.length) return { ok: false, error: "Rien à modifier" };
  return { ok: true, components: out, changements };
}

/** Les composants d'une ligne d'engagement : le JSON tel qu'il est stocké, jamais supposé valide. */
export function lireComposants(json: string | null | undefined): DispositifComponent[] {
  const s = texte(json);
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (!Array.isArray(v)) return [];
    return v
      .filter((c) => c && typeof c === "object" && texte((c as any).key))
      .map((c: any) => ({
        key: texte(c.key),
        type: texte(c.type),
        role: c.role == null || texte(c.role) === "" ? null : texte(c.role),
        label: c.label == null || texte(c.label) === "" ? null : texte(c.label),
      }));
  } catch {
    return [];
  }
}
