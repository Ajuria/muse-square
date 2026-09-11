// La photo d'une carte FAMILLE (11/09) : le composant qui porte la famille, montré dans l'emplacement photo
// des cartes de Pulse (.ab-media.photo). La photo est une PREUVE de ce que la mesure juge, jamais une
// illustration : seule compte la photo courante d'un composant dont la lecture a reconnu la famille.
//   · Lecture : couche SEMANTIC seulement — vw_insight_event_dispositif_photos (familles reconnues,
//     families_present, depuis la PR ms_database#144), puis vw_insight_event_dispositif_components (version
//     COURANTE du dispositif) pour les seuls dispositifs de ces photos ; un pôle fermé (« cancelled ») ne prête plus ses photos.
//   · Appariement : égalité EXACTE du nom de famille. Les familles des cartes et celles de families_present
//     viennent du même item_category de la caisse (vérifié le 11/09 sur Muse Square : 3 familles de cartes sur
//     3 retrouvées telles quelles parmi les 9 de la caisse).
//   · Choix : la photo la plus SPÉCIFIQUE (le moins de familles reconnues), puis la plus récente, puis l'id.
// Module séparé de dispositifPhotos.ts : le monitor l'importe sans charger sharp ni le client Storage.
import type { PhotoVariant } from "./dispositifPhotos";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";

// Les cartes famille de Pulse (action-cards.js : item_category porte la famille) — SEULES elles reçoivent la
// photo : une carte concurrent qui porterait un item_category parle de l'offre d'un autre, pas de vos rayons.
export const FAMILY_PHOTO_CARD_TYPES: readonly string[] = Object.freeze([
  "offering_mix_shift", "family_space_underuse", "family_price_move", "family_discount_move",
]);

export interface FamilyPhotoRow {
  dispositif_id: string;
  photo_id: string;
  component_label: string | null;   // le nom donné par l'exploitant, sinon le libellé du type (registre)
  created_at: string;
  families_present: string[];
  fixture_no: number | null;
}

// L'URL du proxy de la route photos (src/pages/api/dispositifs/photos.ts : GET &file= [&variant=]).
export const photoProxyUrl = (dispositif_id: string, photo_id: string, variant: PhotoVariant = "full"): string =>
  `/api/dispositifs/photos?dispositif_id=${encodeURIComponent(dispositif_id)}&file=${encodeURIComponent(photo_id)}${variant === "full" ? "" : `&variant=${variant}`}`;

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

// Une photo lue qui porte au moins une famille, et un composant OUVERT de la version courante (couche semantic).
export interface FamilyPhotoCandidate { dispositif_id: string; version_no: number; component_key: string; photo_id: string; created_at: string; families_present: string[]; fixture_no: number | null; }
export interface OpenComponent { dispositif_id: string; version_no: number; component_key: string; label: string | null; }

// PUR : la jointure (dispositif, version, composant). Une photo d'une ancienne version, ou d'un composant d'un pôle
// fermé, n'a pas de composant ouvert en face : elle ne sort pas.
export function joinFamilyPhotos(photos: readonly FamilyPhotoCandidate[], comps: readonly OpenComponent[]): FamilyPhotoRow[] {
  const byKey = new Map(comps.map((c) => [`${c.dispositif_id}|${c.version_no}|${c.component_key}`, c]));
  const out: FamilyPhotoRow[] = [];
  for (const p of photos) {
    const c = byKey.get(`${p.dispositif_id}|${p.version_no}|${p.component_key}`);
    if (!c) continue;
    out.push({ dispositif_id: p.dispositif_id, photo_id: p.photo_id, component_label: c.label, created_at: p.created_at, families_present: p.families_present, fixture_no: p.fixture_no });
  }
  return out;
}

// Les photos courantes d'un site qui portent au moins une famille. DEUX temps (12/09, perf mesurée : la jointure
// SQL des deux vues coûtait 678-1 344 ms seule et 1 447-1 509 ms dans la vague du monitor, dont elle était la
// requête la plus lente) : (1) la vue des photos seule — un site sans photo de famille s'arrête là ; (2) les
// composants OUVERTS des seuls dispositifs de ces photos, jointure en code. Échec → [] et une ligne de log : la
// photo est un média de la carte, son absence ne retire rien d'autre.
export async function listFamilyPhotos(bq: any, location_id: string): Promise<FamilyPhotoRow[]> {
  const fail = (e: any) => { console.error("[familyPhotos] lecture en échec", String(e?.message || e)); return []; };
  const photoRows = await bq.query({
    query: `SELECT dispositif_id, version_no, component_key, photo_id, CAST(created_at AS STRING) AS created_at, families_present, fixture_no
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_photos\`
            WHERE location_id = @l AND ARRAY_LENGTH(families_present) > 0`,
    params: { l: location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(fail);
  if (!(photoRows as any[]).length) return [];
  const photos: FamilyPhotoCandidate[] = (photoRows as any[]).map((r) => ({
    dispositif_id: String(flat(r.dispositif_id)), version_no: Number(flat(r.version_no)), component_key: String(flat(r.component_key)),
    photo_id: String(flat(r.photo_id)), created_at: String(flat(r.created_at)),
    families_present: Array.isArray(r.families_present) ? r.families_present.map((f: any) => String(flat(f))) : [],
    fixture_no: r.fixture_no != null ? Number(flat(r.fixture_no)) : null,
  }));
  const compRows = await bq.query({
    query: `SELECT dispositif_id, version_no, component_key, COALESCE(NULLIF(TRIM(component_label), ''), component_type_label_fr) AS label
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_components\`
            WHERE location_id = @l AND status = 'open' AND dispositif_id IN UNNEST(@ids)`,
    params: { l: location_id, ids: [...new Set(photos.map((p) => p.dispositif_id))] }, types: { ids: ["STRING"] }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(fail);
  const comps: OpenComponent[] = (compRows as any[]).map((r) => ({
    dispositif_id: String(flat(r.dispositif_id)), version_no: Number(flat(r.version_no)), component_key: String(flat(r.component_key)),
    label: r.label != null && String(flat(r.label)).trim() ? String(flat(r.label)).trim() : null,
  }));
  return joinFamilyPhotos(photos, comps);
}

// PUR : la photo d'une famille — égalité exacte, la plus spécifique, puis la plus récente, puis l'id.
export function pickFamilyPhoto(rows: readonly FamilyPhotoRow[], family: string | null | undefined): FamilyPhotoRow | null {
  const f = String(family ?? "").trim();
  if (!f) return null;
  const hits = rows.filter((r) => r.families_present.includes(f));
  hits.sort((a, b) =>
    a.families_present.length - b.families_present.length
    || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
    || (a.photo_id < b.photo_id ? -1 : a.photo_id > b.photo_id ? 1 : 0));
  return hits[0] ?? null;
}

// PUR : les champs ajoutés au data_payload de la carte (lus par msTeaserMedia, pulse.astro).
export function familyPhotoPayload(row: FamilyPhotoRow): { family_photo: string; family_photo_label: string | null; family_photo_fixture_no: number | null; family_photo_date: string } {
  return {
    family_photo: photoProxyUrl(row.dispositif_id, row.photo_id, "band"),
    family_photo_label: row.component_label,
    family_photo_fixture_no: row.fixture_no != null && row.fixture_no > 0 ? row.fixture_no : null,
    family_photo_date: row.created_at.slice(0, 10),
  };
}
