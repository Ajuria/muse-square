// Les photos des composants (spec docs/dispositifs-typologie-spec.md § 5.2, owner 03/09, D7 :
// les images sont chez nous). LE foyer du stockage et de la table analytics.dispositif_photos :
//   · l'objet vit dans le bucket privé ms-dispositif-photo (EU), chemin location/dispositif/photo ;
//     il est SERVI par l'API (proxy authentifié), jamais public, jamais signé — pas de CORS ;
//   · la ligne est append-only (INSERT DML, visible tout de suite) ; lecture = dernière ligne par
//     (dispositif_id, version_no, component_key) ;
//   · une image où une personne est visible n'est jamais stockée : l'appelant efface l'objet et
//     n'écrit AUCUNE ligne (déviation acceptée owner 03/09 : le contrôle est côté serveur).
// Identifiants : même résolution que bq.ts (clé JSON de prod, sinon fichier, sinon ADC).
import { Storage } from "@google-cloud/storage";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
export const PHOTO_BUCKET = process.env.DISPOSITIF_PHOTO_BUCKET || "ms-dispositif-photo";
export const PHOTO_TABLE = `${BQ_PROJECT}.analytics.dispositif_photos`;
export const PHOTO_MAX_BYTES = 1_500_000; // le navigateur réduit à 1600 px avant l'envoi (Vercel : 4,5 Mo par requête)

export function makeStorageClient(): Storage {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (raw) { try { return new Storage({ projectId: BQ_PROJECT, credentials: JSON.parse(raw) }); } catch { /* fall through */ } }
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFilename) return new Storage({ projectId: BQ_PROJECT, keyFilename });
  return new Storage({ projectId: BQ_PROJECT });
}

export function photoObjectPath(location_id: string, dispositif_id: string, photo_id: string): string {
  return `${location_id}/${dispositif_id}/${photo_id}.jpg`;
}
export const photoGcsUri = (path: string) => `gs://${PHOTO_BUCKET}/${path}`;

export async function putPhotoObject(storage: Storage, path: string, bytes: Buffer, contentType: string): Promise<void> {
  await storage.bucket(PHOTO_BUCKET).file(path).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
}
export async function getPhotoObject(storage: Storage, path: string): Promise<Buffer> {
  const [buf] = await storage.bucket(PHOTO_BUCKET).file(path).download();
  return buf;
}
export async function deletePhotoObject(storage: Storage, path: string): Promise<void> {
  await storage.bucket(PHOTO_BUCKET).file(path).delete({ ignoreNotFound: true });
}

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
  };
  const types: Record<string, string> = {
    walk_id: "STRING", seq: "INT64", t_offset_s: "FLOAT64", dispositif_type: "STRING", dispositif_role: "STRING",
    checklist: "STRING", items_matched: "STRING", items_confirmed: "STRING", prices_seen: "STRING",
    coverage_flag: "STRING", model: "STRING", prompt_version: "STRING", created_by: "STRING", created_at: "TIMESTAMP",
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
                   coverage_flag, model, prompt_version, created_by, CAST(created_at AS STRING) AS created_at
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
  }));
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
// reconnu par la lecture est accepté (l'exploitant voit mieux que le modèle).
export function withConfirmedItems(row: PhotoRow, codes: string[], allowedCodes: readonly string[], now: string): PhotoRow {
  const allowed = new Set(allowedCodes);
  const uniq = Array.from(new Set(codes.map((c) => String(c).trim()).filter((c) => c && allowed.has(c))));
  return { ...row, items_confirmed: uniq.map((item_code) => ({ item_code })), created_at: now };
}
