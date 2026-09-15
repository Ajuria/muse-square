// src/lib/dispositifs/spacePlans.ts
// =====================================================
// LE PLAN DU MAGASIN, DÉPOSÉ PAR L'EXPLOITANT (owner 15/09, « voie b »).
//
// LE CHOIX, ET SON ALTERNATIVE ÉCARTÉE. Pour déplacer une photo, l'exploitant a besoin de retrouver
// les numéros de ses composants. Les contours qu'on a en base sont au grain PÔLE — 11 polygones pour
// 7 pôles, aucune position par composant : on ne peut donc PAS dessiner un plan numéroté. Deux voies
// existaient : relever les 52 positions une par une (le même travail que les 52 mesures, une seconde
// fois), ou afficher LE plan de l'exploitant, qui porte déjà ses numéros imprimés. Owner : voie b.
//
// CE QUE CE MODULE FAIT, ET RIEN D'AUTRE : il dit quels fichiers sont acceptés, où l'objet se range,
// et quelle ligne fait foi. La route EXÉCUTE ; la page rend.
//
// APPEND-ONLY, LA DERNIÈRE FAIT FOI. Un plan remplacé ne s'efface pas : les photos prises AVANT ont
// été numérotées d'après le plan d'alors, et effacer ce plan-là rendrait leurs numéros inexplicables.
// Le même patron que `space_measures` et `space_zones`.
//
// LE STOCKAGE EST CELUI DES PHOTOS (bucket `ms-dispositif-photo`), sous un préfixe `plan/`. Un second
// bucket aurait demandé ses droits, sa configuration et sa surveillance pour ranger un fichier par
// site : le préfixe suffit, et il hérite des accès déjà éprouvés.
import { randomUUID } from "node:crypto";
import { PHOTO_BUCKET, type makeStorageClient } from "./dispositifPhotos";

const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
export const PLAN_TABLE = `${BQ_PROJECT}.analytics.space_plans`;

// 4,5 Mo est la limite d'une requête Vercel ; le base64 pèse 4/3 de l'octet source. On plafonne donc
// la SOURCE à 3 Mo — un plan de magasin scanné tient largement dedans, et le refus se dit.
export const PLAN_MAX_BYTES = 3_000_000;

/** Ce qu'un plan de magasin peut être. Le PDF est le cas normal : c'est ce que rend un architecte. */
export const PLAN_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface SpacePlanRow {
  plan_id: string;
  location_id: string;
  gcs_uri: string;
  content_type: string;
  bytes: number;
  original_name: string | null;
  created_by: string | null;
  created_at: string;
}

/** PUR : le chemin de l'objet. Déterministe, et jamais dérivé du nom de fichier de l'exploitant
 *  (un nom d'utilisateur dans un chemin de bucket, c'est une injection qui attend son tour). */
export function planObjectPath(location_id: string, plan_id: string, content_type: string): string {
  const ext = PLAN_TYPES[content_type] || "bin";
  return `${location_id}/plan/${plan_id}.${ext}`;
}

/** PUR : l'adresse par laquelle la page demande le plan — proxy authentifié, comme les photos.
 *  Le `v` porte l'identifiant du plan EN VIGUEUR : un plan remplacé change d'adresse, donc le
 *  navigateur ne sert pas l'ancien depuis son cache. */
export const planApiUrl = (location_id: string, plan_id: string): string =>
  `/api/dispositifs/plan?location_id=${encodeURIComponent(location_id)}&file=${encodeURIComponent(plan_id)}`;

/** PUR : ce qui empêche un dépôt, ou null quand il passe. */
export function refusDeDepot(e: { content_type: unknown; bytes: number }): "type_refuse" | "trop_lourd" | "vide" | null {
  const ct = String(e.content_type || "").toLowerCase().split(";")[0].trim();
  if (!PLAN_TYPES[ct]) return "type_refuse";
  if (!(e.bytes > 0)) return "vide";
  if (e.bytes > PLAN_MAX_BYTES) return "trop_lourd";
  return null;
}

/** PUR : le plan EN VIGUEUR — le dernier déposé. Rien d'autre ne fait foi. */
export function planEnVigueur(rows: SpacePlanRow[]): SpacePlanRow | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))[0];
}

const flat = (v: any): any => (v && typeof v === "object" && "value" in v ? v.value : v);

/** La table naît à la PREMIÈRE ÉCRITURE — le patron de `bestPractices.ts` (`CREATE TABLE IF NOT
 *  EXISTS`, idempotent et sans course à ce volume). Une table app-write se crée par l'app ; il n'y a
 *  ni migration ni passation dbt pour ce côté producteur. */
export async function ensurePlanTable(bq: any): Promise<void> {
  await bq.query({
    query: `CREATE TABLE IF NOT EXISTS \`${PLAN_TABLE}\` (
              plan_id STRING NOT NULL, location_id STRING NOT NULL, gcs_uri STRING NOT NULL,
              content_type STRING NOT NULL, bytes INT64, original_name STRING,
              created_by STRING, created_at TIMESTAMP NOT NULL)
            CLUSTER BY location_id`,
    location: "EU",
  });
}

/** La table naît à la première écriture — même patron que `space_zones`. */
export async function appendPlan(bq: any, row: Omit<SpacePlanRow, "plan_id" | "created_at"> & { plan_id?: string }): Promise<SpacePlanRow> {
  await ensurePlanTable(bq);
  const complet: SpacePlanRow = {
    plan_id: row.plan_id || randomUUID(),
    location_id: row.location_id, gcs_uri: row.gcs_uri, content_type: row.content_type,
    bytes: row.bytes, original_name: row.original_name ?? null, created_by: row.created_by ?? null,
    created_at: new Date().toISOString(),
  };
  const [job] = await bq.createQueryJob({
    query: `INSERT INTO \`${PLAN_TABLE}\` (plan_id, location_id, gcs_uri, content_type, bytes, original_name, created_by, created_at)
            VALUES (@plan_id, @location_id, @gcs_uri, @content_type, @bytes, @original_name, @created_by, @created_at)`,
    params: { ...complet, created_at: new Date(complet.created_at) },
    types: { plan_id: "STRING", location_id: "STRING", gcs_uri: "STRING", content_type: "STRING",
             bytes: "INT64", original_name: "STRING", created_by: "STRING", created_at: "TIMESTAMP" },
    location: "EU",
  });
  await job.getQueryResults();
  return complet;
}

export async function listPlans(bq: any, location_id: string): Promise<SpacePlanRow[]> {
  // Avant tout dépôt, la table n'existe pas : la lecture rend une liste vide (le `.catch` ci-dessous),
  // et la page affiche l'écran de dépôt. Une absence de table n'est pas une erreur, c'est un état.
  const rows = await bq.query({
    query: `SELECT plan_id, location_id, gcs_uri, content_type, bytes, original_name, created_by,
                   CAST(created_at AS STRING) AS created_at
            FROM \`${PLAN_TABLE}\` WHERE location_id = @l ORDER BY created_at DESC LIMIT 50`,
    params: { l: location_id }, types: { l: "STRING" }, location: "EU",
  }).then((r: any) => (Array.isArray(r?.[0]) ? r[0] : [])).catch(() => []);
  return (rows as any[]).map((r) => ({
    plan_id: String(flat(r.plan_id)), location_id: String(flat(r.location_id)), gcs_uri: String(flat(r.gcs_uri)),
    content_type: String(flat(r.content_type)), bytes: Number(flat(r.bytes) ?? 0),
    original_name: r.original_name != null ? String(flat(r.original_name)) : null,
    created_by: r.created_by != null ? String(flat(r.created_by)) : null,
    created_at: String(flat(r.created_at)),
  }));
}

export type StorageClient = ReturnType<typeof makeStorageClient>;
export async function putPlanObject(storage: StorageClient, path: string, bytes: Buffer, contentType: string): Promise<void> {
  await storage.bucket(PHOTO_BUCKET).file(path).save(bytes, { contentType, resumable: false, metadata: { cacheControl: "private, max-age=0" } });
}
export async function getPlanObject(storage: StorageClient, path: string): Promise<Buffer> {
  const [buf] = await storage.bucket(PHOTO_BUCKET).file(path).download();
  return buf;
}
export const planGcsUri = (path: string) => `gs://${PHOTO_BUCKET}/${path}`;
export const cheminDepuisUri = (uri: string) => String(uri || "").replace(`gs://${PHOTO_BUCKET}/`, "");
