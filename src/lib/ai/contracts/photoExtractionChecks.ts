// Porte de la lecture des photos (spec dispositifs-typologie § 5.3) : la réponse du modèle ne
// passe que si TOUTE clé de check-list est du registre et TOUT code d'article est de la liste du
// site — une invention est rejetée, jamais corrigée. Une personne visible n'est pas une erreur du
// modèle : c'est un signal que l'appelant traduit en effacement de l'image, sans aucune ligne.
// v2 (owner 11/09) : l'exposition hors des cinq mots owner est rejetée ; des niveaux posés sur
// autre chose qu'un rayonnage sont NORMALISÉS à null (le champ n'a pas de sens ailleurs —
// ce n'est pas une invention, c'est un champ hors sujet) ; une famille hors de la liste du site est
// rejetée comme un code d'article hors liste. Les valeurs normalisées sont rendues dans le résultat :
// l'appelant écrit CELLES-LÀ, jamais `out` tel quel.
import { EXPOSITION_VALUES, EXPOSITION_WITH_LEVELS } from "../../dispositifs/dispositifTypes";

export interface PhotoGateResult {
  ok: boolean; errors: string[]; rejected_person: boolean;
  exposition: string | null; levels: number | null; families_present: string[];
}

const ANSWERS = new Set(["oui", "non", "non_visible"]);
const CONF = new Set(["haute", "moyenne", "faible"]);
const COVER = new Set(["entier", "partiel", "non_visible"]);
const LEVELS_MAX = 20;

export function validatePhotoExtraction(
  out: any, allowedKeys: readonly string[], allowedCodes: readonly string[], allowedFamilies: readonly string[] = [],
): PhotoGateResult {
  const errors: string[] = [];
  const empty = { exposition: null, levels: null, families_present: [] as string[] };
  if (!out || typeof out !== "object") return { ok: false, errors: ["réponse absente"], rejected_person: false, ...empty };
  const keys = new Set(allowedKeys), codes = new Set(allowedCodes), fams = new Set(allowedFamilies);
  if (typeof out.person_visible !== "boolean") errors.push("person_visible manquant");
  if (!COVER.has(String(out.coverage))) errors.push(`coverage inconnu « ${out.coverage} »`);
  // L'exposition : un des cinq mots owner, ou rien (rejet).
  let exposition: string | null = null;
  if (!EXPOSITION_VALUES.includes(String(out.exposition))) errors.push(`exposition inconnue « ${out.exposition} »`);
  else exposition = String(out.exposition);
  // Les niveaux : un entier > 0 seulement sur un rayonnage ; null partout ailleurs (normalisé).
  let levels: number | null = null;
  if (exposition === EXPOSITION_WITH_LEVELS && out.levels != null) {
    const n = Number(out.levels);
    if (!Number.isInteger(n) || n < 1 || n > LEVELS_MAX) errors.push(`niveaux invalides « ${out.levels} »`);
    else levels = n;
  }
  // Les familles : parmi la liste du site seulement ; liste vide → rien n'est accepté, rien n'est inventé.
  const families_present: string[] = [];
  if (out.families_present != null) {
    if (!Array.isArray(out.families_present)) errors.push("families_present : pas une liste");
    else if (out.families_present.length > 60) errors.push("families_present : plus de 60 familles");
    else for (const f of out.families_present) {
      const name = String(f ?? "").trim();
      if (!name || !fams.has(name)) errors.push(`famille hors liste « ${f} »`);
      else if (!families_present.includes(name)) families_present.push(name);
    }
  }
  const cl = out.checklist && typeof out.checklist === "object" ? out.checklist : null;
  if (!cl) errors.push("checklist manquante");
  else {
    for (const k of Object.keys(cl)) {
      if (!keys.has(k)) errors.push(`clé hors registre « ${k} »`);
      else if (!ANSWERS.has(String(cl[k]))) errors.push(`réponse invalide pour ${k} : « ${cl[k]} »`);
    }
    for (const k of allowedKeys) if (!(k in cl)) errors.push(`question sans réponse « ${k} »`);
  }
  if (!Array.isArray(out.items)) errors.push("items manquants");
  else if (out.items.length > 60) errors.push("items : plus de 60 articles");
  else for (const it of out.items) {
    if (!it || !codes.has(String(it.item_code))) errors.push(`article hors liste « ${it?.item_code} »`);
    if (!CONF.has(String(it?.confidence))) errors.push(`confiance invalide « ${it?.confidence} »`);
  }
  if (!Array.isArray(out.prices)) errors.push("prices manquants");
  else if (out.prices.length > 60) errors.push("prices : plus de 60 prix");
  else for (const p of out.prices) {
    if (!p || typeof p.label !== "string" || !Number.isFinite(Number(p.price_eur)) || Number(p.price_eur) < 0) errors.push("prix illisible");
    else if (p.item_code != null && !codes.has(String(p.item_code))) errors.push(`prix rattaché à un article hors liste « ${p.item_code} »`);
  }
  return { ok: errors.length === 0, errors, rejected_person: out.person_visible === true, exposition, levels, families_present };
}
