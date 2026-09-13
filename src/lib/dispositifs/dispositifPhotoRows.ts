// src/lib/dispositifs/dispositifPhotoRows.ts — LA LIGNE d'une photo de composant : la table
// analytics.dispositif_photos, ses lectures et ses compositions PURES. Module séparé de
// dispositifPhotos.ts (même raison que familyPhotos.ts, 11/09) : l'historique du dispositif
// (/api/commitments/evolution) lit les photos SANS charger sharp ni le client Storage — l'objet et
// ses variantes restent l'affaire de dispositifPhotos.ts, qui réexporte tout ceci pour ses appelants.
// Le stockage, les variantes et les règles d'écriture sont documentés là-bas.

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
export const PHOTO_TABLE = `${BQ_PROJECT}.analytics.dispositif_photos`;

export interface PhotoRow {
  photo_id: string; location_id: string; dispositif_id: string; version_no: number; component_key: string;
  walk_id: string | null; seq: number | null; t_offset_s: number | null;
  gcs_uri: string; dispositif_type: string | null; dispositif_role: string | null;
  status: "read" | "error";
  checklist: Record<string, string> | null;
  items_matched: Array<{ item_code: string; confidence: string }> | null;
  items_confirmed: Array<{ item_code: string }> | null;
  prices_seen: Array<{ label: string; price_eur: number; item_code: string | null }> | null;
  coverage_flag: string | null; model: string | null; prompt_version: string | null;
  created_by: string | null; created_at: string;
  // v2 (owner 11/09) : ce que TOUTE photo dit du composant — l'exposition (cinq mots owner, registre
  // EXPOSITION_KINDS), les niveaux (seulement rayonnage, null sinon), les familles présentes
  // (parmi les familles vendues du site, [] si aucune), et le numéro du composant sur le plan, donné
  // par le CLIENT de l'API (jamais lu sur l'image).
  exposition: string | null; levels: number | null; families_present: string[] | null; fixture_no: number | null;
}

// INSERT DML typé (jamais streaming insert : une ligne doit être lisible — et effaçable — tout de suite).
export async function insertPhotoRow(bq: any, row: PhotoRow): Promise<void> {
  const params = {
    photo_id: row.photo_id, location_id: row.location_id, dispositif_id: row.dispositif_id, version_no: row.version_no,
    component_key: row.component_key, walk_id: row.walk_id, seq: row.seq, t_offset_s: row.t_offset_s, gcs_uri: row.gcs_uri,
    dispositif_type: row.dispositif_type, dispositif_role: row.dispositif_role, status: row.status,
    checklist: row.checklist ? JSON.stringify(row.checklist) : null,
    items_matched: row.items_matched ? JSON.stringify(row.items_matched) : null,
    items_confirmed: row.items_confirmed ? JSON.stringify(row.items_confirmed) : null,
    prices_seen: row.prices_seen ? JSON.stringify(row.prices_seen) : null,
    coverage_flag: row.coverage_flag, model: row.model, prompt_version: row.prompt_version, created_by: row.created_by,
    // created_at = celui de la LIGNE (03/09) : la valeur stockée est celle que l'API rend à la page,
    // et l'ordre append-only (la dernière gagne) est celui que l'app a décidé — jamais l'heure
    // d'insertion, qui avait fait gagner une vieille photo réinsérée en dernier (sonde lot 2).
    created_at: new Date(row.created_at),
    exposition: row.exposition, levels: row.levels, fixture_no: row.fixture_no,
    // ARRAY<STRING> : jamais NULL en BigQuery — une absence s'écrit [] (le type est donné pour un tableau vide).
    families_present: Array.isArray(row.families_present) ? row.families_present.map((f) => String(f)) : [],
  };
  const types: Record<string, string | string[]> = {
    walk_id: "STRING", seq: "INT64", t_offset_s: "FLOAT64", dispositif_type: "STRING", dispositif_role: "STRING",
    checklist: "STRING", items_matched: "STRING", items_confirmed: "STRING", prices_seen: "STRING",
    coverage_flag: "STRING", model: "STRING", prompt_version: "STRING", created_by: "STRING", created_at: "TIMESTAMP",
    exposition: "STRING", levels: "INT64", fixture_no: "INT64", families_present: ["STRING"],
  };
  const cols = Object.keys(params);
  const [job] = await bq.createQueryJob({
    query: `INSERT INTO \`${PHOTO_TABLE}\` (${cols.join(", ")}) VALUES (${cols.map((c) => "@" + c).join(", ")})`,
    params, types, location: "EU",
  });
  await job.getQueryResults();
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);
const parseJson = <T,>(v: any): T | null => { try { const s = flat(v); return s == null || s === "" ? null : (JSON.parse(String(s)) as T); } catch { return null; } };

export async function listPhotoRows(bq: any, dispositif_id: string, version_no?: number | null): Promise<PhotoRow[]> {
  const rows = await bq.query({
    query: `SELECT photo_id, location_id, dispositif_id, version_no, component_key, walk_id, seq, t_offset_s, gcs_uri,
                   dispositif_type, dispositif_role, status, checklist, items_matched, items_confirmed, prices_seen,
                   coverage_flag, model, prompt_version, created_by, CAST(created_at AS STRING) AS created_at,
                   exposition, levels, families_present, fixture_no
            FROM \`${PHOTO_TABLE}\`
            WHERE dispositif_id = @d ${version_no != null ? "AND version_no = @v" : ""}
            ORDER BY created_at DESC LIMIT 500`,
    params: version_no != null ? { d: dispositif_id, v: Number(version_no) } : { d: dispositif_id },
    location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    photo_id: String(flat(r.photo_id)), location_id: String(flat(r.location_id)), dispositif_id: String(flat(r.dispositif_id)),
    version_no: Number(flat(r.version_no)), component_key: String(flat(r.component_key)),
    walk_id: r.walk_id != null ? String(flat(r.walk_id)) : null, seq: r.seq != null ? Number(flat(r.seq)) : null,
    t_offset_s: r.t_offset_s != null ? Number(flat(r.t_offset_s)) : null, gcs_uri: String(flat(r.gcs_uri)),
    dispositif_type: r.dispositif_type != null ? String(flat(r.dispositif_type)) : null,
    dispositif_role: r.dispositif_role != null ? String(flat(r.dispositif_role)) : null,
    status: String(flat(r.status)) === "error" ? "error" : "read",
    checklist: parseJson(r.checklist), items_matched: parseJson(r.items_matched), items_confirmed: parseJson(r.items_confirmed),
    prices_seen: parseJson(r.prices_seen), coverage_flag: r.coverage_flag != null ? String(flat(r.coverage_flag)) : null,
    model: r.model != null ? String(flat(r.model)) : null, prompt_version: r.prompt_version != null ? String(flat(r.prompt_version)) : null,
    created_by: r.created_by != null ? String(flat(r.created_by)) : null, created_at: String(flat(r.created_at)),
    exposition: r.exposition != null ? String(flat(r.exposition)) : null,
    levels: r.levels != null ? Number(flat(r.levels)) : null,
    families_present: Array.isArray(r.families_present) ? r.families_present.map((f: any) => String(flat(f))) : [],
    fixture_no: r.fixture_no != null ? Number(flat(r.fixture_no)) : null,
  }));
}

// L'adresse de l'image servie par l'API (proxy authentifié — le bucket est privé). UN seul foyer :
// la route la rend dans ses réponses, l'historique du dispositif la rend dans ses vignettes.
export const photoApiUrl = (dispositif_id: string, photo_id: string): string =>
  `/api/dispositifs/photos?dispositif_id=${encodeURIComponent(dispositif_id)}&file=${encodeURIComponent(photo_id)}`;

// ── 13/09 — LA MÉMOIRE VISUELLE DU DISPOSITIF (owner : « la valeur ajoutée est de garder la mémoire
// visuelle des dispositifs qui ont fonctionné ou non au niveau de l'agencement — quels produits à côté
// de quels autres, selon quelle logique »). L'historique montre déjà chaque version avec SON verdict ;
// il lui manquait l'image. Ici, la composition PURE : par version, la dernière photo de chaque composant.
export interface LineagePhoto {
  photo_id: string; component_key: string;
  /** Le nom COMPLET : « Vitrine — Couteaux » (type + famille reconnue), ou le type seul. */
  label_fr: string;
  /** Le nom COURT, pour les 72 px de la vignette : « Couteaux ». Dans l'historique d'UN pôle, le type se
   *  répète d'un composant à l'autre — ce qui les distingue est la famille. Le complet reste au survol. */
  label_court: string;
  fixture_no: number | null;   // le N° sur le plan, quand l'exploitant l'a saisi
  auteur: string | null;       // le nom affichable de qui a pris la photo (resolveMemberNames), jamais un identifiant
  url: string; created_at: string;
}

/** PUR — le nom d'un composant vu par une photo : « <Type> — <famille> » quand UNE SEULE famille est
 *  reconnue (deux familles ne font pas un nom), le type seul sinon ; et sa forme courte pour la vignette. */
export function nomsDuComposant(typeLabel: string, familles: readonly string[]): { complet: string; court: string } {
  const type = String(typeLabel || "").trim() || "Composant";
  const fams = familles.map((f) => String(f || "").trim()).filter(Boolean);
  const fam = fams.length === 1 ? fams[0] : "";
  return fam ? { complet: `${type} — ${fam}`, court: fam } : { complet: type, court: type };
}
/**
 * PUR — par numéro de version, ses photos (la dernière par composant, la plus récente d'abord),
 * plafonnées à `max` vignettes ; `autres` compte celles qui ne tiennent pas dans la rangée.
 * Le libellé est celui du TYPE du composant (« Vitrine », « Linéaire ») — jamais la clé technique.
 */
export function photosParVersion(
  rows: PhotoRow[],
  labelFr: (type: string | null) => string,
  max = 4,
  auteurs: Record<string, string> = {},
): Record<number, { photos: LineagePhoto[]; autres: number }> {
  const out: Record<number, { photos: LineagePhoto[]; autres: number }> = {};
  for (const r of latestPerComponent(rows.filter((r) => r.status === "read"))) {
    const v = out[r.version_no] ?? (out[r.version_no] = { photos: [], autres: 0 });
    if (v.photos.length >= max) { v.autres++; continue; }
    const noms = nomsDuComposant(labelFr(r.dispositif_type), r.families_present ?? []);
    v.photos.push({
      photo_id: r.photo_id, component_key: r.component_key,
      label_fr: noms.complet, label_court: noms.court,
      fixture_no: r.fixture_no ?? null,
      auteur: (r.created_by && auteurs[r.created_by]) || null,
      url: photoApiUrl(r.dispositif_id, r.photo_id), created_at: r.created_at,
    });
  }
  return out;
}

// PUR : la dernière photo lue par composant (les lignes arrivent triées created_at DESC ; on
// re-trie ici pour ne pas dépendre de l'ordre de la requête).
export function latestPerComponent(rows: PhotoRow[]): PhotoRow[] {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const seen = new Set<string>(); const out: PhotoRow[] = [];
  for (const r of sorted) {
    const k = `${r.version_no}:${r.component_key}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

// La liste des articles DU site pour la consigne (semantic, jamais raw) — code + désignation.
export async function listSiteItems(bq: any, location_id: string, limit = 500): Promise<Array<{ item_code: string; item_description: string }>> {
  const rows = await bq.query({
    query: `SELECT item_code, item_description FROM \`${BQ_PROJECT}.semantic.vw_insight_event_client_offering\`
            WHERE location_id = @l AND item_code IS NOT NULL ORDER BY revenue_rank LIMIT ${Math.max(1, Math.min(2000, limit))}`,
    params: { l: location_id }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({ item_code: String(flat(r.item_code)), item_description: String(flat(r.item_description) ?? "") }));
}

// PUR : la ligne de CONFIRMATION d'une photo — même photo_id, items_confirmed posé, created_at
// maintenant. Append-only : on n'édite jamais une ligne, la dernière gagne (latestPerComponent).
// Les codes hors liste du site sont écartés, jamais corrigés ; un code confirmé qui n'était pas
// reconnu par la lecture est accepté (l'exploitant voit mieux que le modèle). Tout le reste de
// la ligne — exposition, niveaux, familles, numéro sur le plan (v2) — est PORTÉ tel quel.
export function withConfirmedItems(row: PhotoRow, codes: string[], allowedCodes: readonly string[], now: string): PhotoRow {
  const allowed = new Set(allowedCodes);
  const uniq = Array.from(new Set(codes.map((c) => String(c).trim()).filter((c) => c && allowed.has(c))));
  return { ...row, items_confirmed: uniq.map((item_code) => ({ item_code })), created_at: now };
}
