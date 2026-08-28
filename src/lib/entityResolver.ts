// src/lib/entityResolver.ts
// LE résolveur d'entités du site (horizons libres × entités, 27/08) — reconnaît dans une
// question les entités RÉELLES du compte : pôles, familles produits, opérations/séries,
// personnes. Zéro invention : les listes viennent des foyers existants (poleReading.listPoles,
// kpiRegistry.listSiteFamilies, evenement.listUserEvenements, owner_person_name distincts) —
// jamais une seconde requête du même concept. Le matching est PUR (testé + mutation) :
// normalisation accents/casse, nom le plus long d'abord, jamais un match dans un mot.

import { listPoles, type PoleListRow } from "./poleReading";
import { listSiteFamilies } from "./kpiRegistry";
import { listUserEvenements } from "./insightFamilies/evenement";

const PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

export type EntityKind = "pole" | "famille" | "operation" | "personne";

export interface SiteEntity {
  kind: EntityKind;
  /** dispositif_id (pole) · saved_item_id (operation) · null (famille, personne). */
  id: string | null;
  /** Le nom tel que porté par la donnée (affichable tel quel). */
  name: string;
  /** Périmètre familles (pole) — vide sinon. */
  families: string[];
}

export interface SiteEntities { entities: SiteEntity[] }

const norm = (s: string): string =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// « Pôle périssables » doit matcher « mon pôle périssables » ET « périssables » nu : on indexe
// le nom entier ET sa forme sans le préfixe « pôle » (même règle pour « · rôle » des personnes).
function aliasesFor(e: SiteEntity): string[] {
  const out = [norm(e.name)];
  const noPole = norm(e.name).replace(/^pole\s+/, "");
  if (noPole && noPole !== out[0]) out.push(noPole);
  if (e.kind === "personne") {
    const short = norm(e.name).split("·")[0].trim();
    if (short && short !== out[0]) out.push(short);
    const first = short.split(" ")[0];
    if (first && first.length >= 3) out.push(first);
  }
  return out.filter((a) => a.length >= 3);
}

export async function loadSiteEntities(
  bq: any,
  location_id: string,
  clerk_user_id: string,
): Promise<SiteEntities> {
  const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
  const [poles, familles, evenements, owners] = await Promise.all([
    listPoles(bq, location_id).catch(() => [] as PoleListRow[]),
    listSiteFamilies(bq, location_id, 30).catch(() => []),
    // Le SITE entier (loi owner : un suivi appartient à un site) — user null exprès.
    listUserEvenements(bq, location_id, null, 30).catch(() => []),
    bq.query({
      query: `SELECT DISTINCT owner_person_name FROM \`${PROJECT}.analytics.action_commitments\`
              WHERE location_id = @location_id AND owner_person_name IS NOT NULL
                AND owner_person_name NOT IN ('—', 'probe') LIMIT 30`,
      params: { location_id }, location: "EU",
    }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []),
  ]);
  const entities: SiteEntity[] = [
    ...poles.map((p): SiteEntity => ({ kind: "pole", id: p.dispositif_id, name: p.name, families: p.families })),
    ...(familles as any[]).map((f): SiteEntity => ({ kind: "famille", id: null, name: String(f.category), families: [String(f.category)] })),
    ...(evenements as any[]).map((e): SiteEntity => ({ kind: "operation", id: String(e.saved_item_id), name: String(e.title), families: [] })),
    ...(owners as any[]).map((o): SiteEntity => ({ kind: "personne", id: null, name: String(flat(o.owner_person_name)), families: [] })),
  ].filter((e) => e.name && e.name.trim());
  return { entities };
}

// Matching pur : les alias les plus LONGS d'abord (« pôle périssables » avant « périssables »),
// bornés par des non-lettres (jamais un match au milieu d'un mot), une entité au plus une fois,
// les zones déjà consommées ne rematchent pas (« famille Coffee » ne redonne pas « Coffee » seul).
export function matchEntities(qRaw: string, site: SiteEntities): SiteEntity[] {
  const q = " " + norm(qRaw) + " ";
  const candidates: Array<{ alias: string; e: SiteEntity }> = [];
  for (const e of site.entities) for (const alias of aliasesFor(e)) candidates.push({ alias, e });
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  const taken: Array<[number, number]> = [];
  const out: SiteEntity[] = [];
  const seen = new Set<string>();
  for (const { alias, e } of candidates) {
    const key = e.kind + ":" + (e.id ?? e.name);
    if (seen.has(key)) continue;
    let idx = -1, from = 0;
    while ((idx = q.indexOf(alias, from)) >= 0) {
      const before = q.charAt(idx - 1), after = q.charAt(idx + alias.length);
      const bounded = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      const overlaps = taken.some(([s2, e2]) => idx < e2 && idx + alias.length > s2);
      if (bounded && !overlaps) {
        taken.push([idx, idx + alias.length]);
        out.push(e);
        seen.add(key);
        break;
      }
      from = idx + 1;
    }
  }
  return out;
}
