// La photo d'une carte FAMILLE (11/09) : le composant qui porte la famille, montré dans l'emplacement photo
// des cartes de Pulse (.ab-media.photo). La photo est une PREUVE de ce que la mesure juge, jamais une
// illustration : seule compte la photo courante d'un composant dont la lecture a reconnu la famille.
//   · Lecture : couche SEMANTIC seulement — vw_insight_event_dispositif_photos (familles reconnues,
//     families_present, depuis la PR ms_database#144) jointe à vw_insight_event_dispositif_components (version
//     COURANTE du dispositif) ; un pôle fermé (status « cancelled ») ne prête plus ses photos.
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

// Les photos courantes d'un site qui portent au moins une famille. Échec → [] et une ligne de log : la photo
// est un média de la carte, son absence ne retire rien d'autre (rien d'autre ne dépend de cette requête).
export async function listFamilyPhotos(bq: any, location_id: string): Promise<FamilyPhotoRow[]> {
  const rows = await bq.query({
    query: `SELECT p.dispositif_id, p.photo_id, CAST(p.created_at AS STRING) AS created_at, p.families_present, p.fixture_no,
                   COALESCE(NULLIF(TRIM(c.component_label), ''), c.component_type_label_fr) AS component_label
            FROM \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_photos\` p
            JOIN \`${BQ_PROJECT}.semantic.vw_insight_event_dispositif_components\` c
              ON c.dispositif_id = p.dispositif_id AND c.version_no = p.version_no AND c.component_key = p.component_key
            WHERE p.location_id = @l AND c.status = 'open' AND ARRAY_LENGTH(p.families_present) > 0`,
    params: { l: location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : []))
    .catch((e: any) => { console.error("[familyPhotos] lecture en échec", String(e?.message || e)); return []; });
  return (rows as any[]).map((r) => ({
    dispositif_id: String(flat(r.dispositif_id)),
    photo_id: String(flat(r.photo_id)),
    component_label: r.component_label != null && String(flat(r.component_label)).trim() ? String(flat(r.component_label)).trim() : null,
    created_at: String(flat(r.created_at)),
    families_present: Array.isArray(r.families_present) ? r.families_present.map((f: any) => String(flat(f))) : [],
    fixture_no: r.fixture_no != null ? Number(flat(r.fixture_no)) : null,
  }));
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
