// Porte de la lecture des photos (spec dispositifs-typologie § 5.3) : la réponse du modèle ne
// passe que si TOUTE clé de check-list est du registre et TOUT code d'article est de la liste du
// site — une invention est rejetée, jamais corrigée. Une personne visible n'est pas une erreur du
// modèle : c'est un signal que l'appelant traduit en effacement de l'image, sans aucune ligne.
export interface PhotoGateResult { ok: boolean; errors: string[]; rejected_person: boolean }

const ANSWERS = new Set(["oui", "non", "non_visible"]);
const CONF = new Set(["haute", "moyenne", "faible"]);
const COVER = new Set(["entier", "partiel", "non_visible"]);

export function validatePhotoExtraction(out: any, allowedKeys: readonly string[], allowedCodes: readonly string[]): PhotoGateResult {
  const errors: string[] = [];
  if (!out || typeof out !== "object") return { ok: false, errors: ["réponse absente"], rejected_person: false };
  const keys = new Set(allowedKeys), codes = new Set(allowedCodes);
  if (typeof out.person_visible !== "boolean") errors.push("person_visible manquant");
  if (!COVER.has(String(out.coverage))) errors.push(`coverage inconnu « ${out.coverage} »`);
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
  return { ok: errors.length === 0, errors, rejected_person: out.person_visible === true };
}
