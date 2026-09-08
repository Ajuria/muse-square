// src/lib/commitments/measuredScope.ts — LE PÉRIMÈTRE DE MESURE D'UN DISPOSITIF : ce que le corner vend,
// et rien d'autre (docs/dispositif-perimetre-mesure-spec.md, sept décisions owner 07/09). Pur.
//
// Colonne `measured_scope` (STRING JSON) sur analytics.action_commitments et raw.saved_items :
//   { kind: "familles" | "pole" | "articles",
//     familles?: [{ nom, nouvelle?: true }],   // familles réelles des tickets ; « nouvelle » = pas encore vendue (D7)
//     pole_id?, pole_nom?,                    // kind pole : ses familles AU MOMENT de l'engagement, figées dans `familles`
//     item_codes?: string[] }                 // kind articles : les articles confirmés depuis la photo
// Un périmètre se résout en un filtre sur raw.client_transactions (familles → item_category, articles →
// item_code) ; le CA du périmètre se mesure avec la MÊME méthode que family_revenue (kpiRegistry).
// Le NOM du périmètre dans une phrase (owner 07/09, prolongement de la règle du 27/08) :
//   « CA de la famille « Branded » » · « CA des familles « A » et « B » » (jusqu'à trois) ·
//   « CA des 4 familles du dispositif » · « CA du pôle « Épicerie fine » » · « CA de « <titre> » » (articles).
// « périmètre » est un mot pris au lexique (zone autour du site) : il ne s'affiche jamais.

export interface ScopeFamille { nom: string; nouvelle?: boolean }
export interface MeasuredScope {
  kind: "familles" | "pole" | "articles";
  familles?: ScopeFamille[];
  pole_id?: string | null;
  pole_nom?: string | null;
  item_codes?: string[];
}

const clean = (s: any): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** JSON → périmètre valide, ou null (jamais une exception sur une colonne libre). */
export function parseScope(json: string | null | undefined): MeasuredScope | null {
  if (!json) return null;
  let o: any;
  try { o = typeof json === "string" ? JSON.parse(json) : json; } catch { return null; }
  return normalizeScope(o);
}

/** Objet libre (body d'API) → périmètre valide, ou null si vide / invalide. */
export function normalizeScope(o: any): MeasuredScope | null {
  if (!o || typeof o !== "object") return null;
  const kind = String(o.kind ?? "");
  const familles: ScopeFamille[] = Array.isArray(o.familles)
    ? o.familles.map((f: any) => (typeof f === "string" ? { nom: clean(f) } : { nom: clean(f?.nom), ...(f?.nouvelle === true ? { nouvelle: true } : {}) })).filter((f: ScopeFamille) => f.nom)
    : [];
  const items: string[] = Array.isArray(o.item_codes) ? o.item_codes.map(clean).filter(Boolean) : [];
  const seen = new Set<string>();
  const uniq = familles.filter((f) => (seen.has(f.nom) ? false : (seen.add(f.nom), true)));
  if (kind === "familles" && uniq.length) return { kind, familles: uniq };
  if (kind === "pole" && uniq.length) return { kind, familles: uniq, pole_id: clean(o.pole_id) || null, pole_nom: clean(o.pole_nom) || null };
  if (kind === "articles" && items.length) return { kind, item_codes: Array.from(new Set(items)) };
  return null;
}

/** Décision 5 : l'ancienne famille unique (saved_items.kpi_family) devient un périmètre d'une famille. */
export function scopeFromFamily(nom: string | null | undefined): MeasuredScope | null {
  const n = clean(nom);
  return n ? { kind: "familles", familles: [{ nom: n }] } : null;
}

export const serializeScope = (s: MeasuredScope | null): string | null => (s ? JSON.stringify(s) : null);

/** Les familles NOUVELLES (D7) : pas encore dans les tickets — pas d'habituel, verdict sur l'objectif en €. */
export const scopeNewFamilies = (s: MeasuredScope | null): string[] => (s?.familles ?? []).filter((f) => f.nouvelle === true).map((f) => f.nom);

/** Le filtre SQL du périmètre sur raw.client_transactions (colonnes vérifiées 07/09 : item_category, item_code). */
export function scopeFilter(s: MeasuredScope): { sql: string; params: Record<string, any>; types: Record<string, any> } {
  if (s.kind === "articles") {
    return { sql: "item_code IN UNNEST(@scope_items)", params: { scope_items: s.item_codes ?? [] }, types: { scope_items: ["STRING"] } };
  }
  return { sql: "item_category IN UNNEST(@scope_familles)", params: { scope_familles: (s.familles ?? []).map((f) => f.nom) }, types: { scope_familles: ["STRING"] } };
}

/** P4 (D3, owner 07/09) : une photo confirmée = un périmètre sans rien saisir. L'union des articles
 *  confirmés des DERNIÈRES photos par composant de la version devient le périmètre `articles` — sauf
 *  si l'exploitant a choisi des familles ou un pôle à la main (un choix explicite prime, D6). Sans
 *  article confirmé, rien ne change (jamais un périmètre vide). Pur. */
export function scopeFromConfirmedPhotos(
  photos: Array<{ component_key: string; created_at: string; items_confirmed: Array<{ item_code: string }> | null }>,
  current: MeasuredScope | null,
): { scope: MeasuredScope | null; changed: boolean } {
  const latest = new Map<string, { created_at: string; items_confirmed: Array<{ item_code: string }> | null }>();
  for (const p of photos) {
    const prev = latest.get(p.component_key);
    if (!prev || p.created_at > prev.created_at) latest.set(p.component_key, p);
  }
  const codes = Array.from(new Set([...latest.values()].flatMap((p) => (p.items_confirmed ?? []).map((it) => clean(it.item_code)).filter(Boolean))));
  if (!codes.length) return { scope: current, changed: false };
  if (current && current.kind !== "articles") return { scope: current, changed: false };   // familles / pôle choisis à la main : on ne les écrase pas
  const same = current?.kind === "articles" && current.item_codes && current.item_codes.length === codes.length && current.item_codes.every((c) => codes.includes(c));
  return same ? { scope: current, changed: false } : { scope: { kind: "articles", item_codes: codes }, changed: true };
}

const guill = (n: string): string => `« ${n} »`;

/** Le nom du CA du périmètre dans une phrase (mots owner 07/09). `titre` = le titre du dispositif (articles). */
export function scopeLabelFr(s: MeasuredScope | null, titre?: string | null): string {
  if (!s) return "CA";
  if (s.kind === "articles") return titre && titre.trim() ? `CA de ${guill(titre.trim())}` : "CA des articles du dispositif";
  if (s.kind === "pole" && s.pole_nom) return `CA du pôle ${guill(s.pole_nom)}`;
  const noms = (s.familles ?? []).map((f) => f.nom);
  if (noms.length === 1) return `CA de la famille ${guill(noms[0])}`;
  if (noms.length === 2) return `CA des familles ${guill(noms[0])} et ${guill(noms[1])}`;
  if (noms.length === 3) return `CA des familles ${guill(noms[0])}, ${guill(noms[1])} et ${guill(noms[2])}`;
  return `CA des ${noms.length} familles du dispositif`;
}
