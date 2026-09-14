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
import sharp from "sharp";
const BQ_PROJECT = process.env.BQ_PROJECT_ID || "muse-square-open-data";
export const PHOTO_BUCKET = process.env.DISPOSITIF_PHOTO_BUCKET || "ms-dispositif-photo";
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

// Les VARIANTES servies aux surfaces (11/09) — l'image entière (1 600 px, JPEG) reste la preuve,
// servie à Explorer et au document du pôle ; les cartes reçoivent une variante à leur taille :
//   · band   — l'emplacement photo des cartes de Pulse (.ab-media.photo, pulse.astro) : 16:7, largeur
//              plafonnée à 58ch (~430 px CSS), écrite à ×2 pour les écrans denses ;
//   · square — la vignette 96 px du composant (card-kit.js, renderComponentPhoto), à ×2.
// Recadrage au CENTRE, déterministe : mesuré le 11/09 sur 8 photos d'Épices et Tout, le recadrage
// « saillance » de sharp choisit la verrière sur une vue d'ensemble ; le centre tient partout. Aucune
// retouche (la photo est une preuve) ; les métadonnées (EXIF, GPS) ne sont pas recopiées.
// Poids mesurés le 11/09 sur ces 8 photos : entière 391-605 Ko, band 60-117 Ko, square 8-12 Ko.
export const PHOTO_VARIANTS = {
  band: { width: 960, height: 420, quality: 78 },
  square: { width: 192, height: 192, quality: 78 },
} as const;
export type PhotoVariantKey = keyof typeof PHOTO_VARIANTS;
export type PhotoVariant = "full" | PhotoVariantKey;
const VARIANT_KEYS = Object.keys(PHOTO_VARIANTS) as PhotoVariantKey[];

// PUR : le paramètre ?variant= — absent = l'image entière (les consommateurs existants) ; inconnu = null.
export function parsePhotoVariant(v: string | null | undefined): PhotoVariant | null {
  const s = String(v ?? "").trim();
  if (!s || s === "full") return "full";
  return (VARIANT_KEYS as string[]).includes(s) ? (s as PhotoVariantKey) : null;
}
// PUR : l'entière garde son chemin historique (photoObjectPath) ; une variante vit à côté.
export function photoVariantPath(location_id: string, dispositif_id: string, photo_id: string, variant: PhotoVariant): string {
  return variant === "full" ? photoObjectPath(location_id, dispositif_id, photo_id) : `${location_id}/${dispositif_id}/${photo_id}.${variant}.webp`;
}
export const photoVariantContentType = (variant: PhotoVariant): string => (variant === "full" ? "image/jpeg" : "image/webp");

export async function renderPhotoVariants(bytes: Buffer): Promise<Record<PhotoVariantKey, Buffer>> {
  const out = await Promise.all(VARIANT_KEYS.map((k) => {
    const v = PHOTO_VARIANTS[k];
    return sharp(bytes).rotate().resize(v.width, v.height, { fit: "cover", position: "centre" }).webp({ quality: v.quality }).toBuffer();
  }));
  return Object.fromEntries(VARIANT_KEYS.map((k, i) => [k, out[i]])) as Record<PhotoVariantKey, Buffer>;
}

// Écrit les variantes d'une photo GARDÉE (jamais avant la porte : une photo refusée n'a que son entière,
// que l'appelant efface). Un photo_id n'est jamais réécrit : les objets sont immuables.
export async function putPhotoVariants(storage: Storage, location_id: string, dispositif_id: string, photo_id: string, bytes: Buffer): Promise<PhotoVariantKey[]> {
  const rendered = await renderPhotoVariants(bytes);
  await Promise.all(VARIANT_KEYS.map((k) =>
    storage.bucket(PHOTO_BUCKET).file(photoVariantPath(location_id, dispositif_id, photo_id, k))
      .save(rendered[k], { contentType: photoVariantContentType(k), resumable: false, metadata: { cacheControl: "private, max-age=31536000, immutable" } })));
  return VARIANT_KEYS;
}

// Lit la variante demandée ; si elle manque (photo antérieure aux variantes, écriture échouée), rend
// l'image ENTIÈRE et le dit (variant = "full") — l'appelant ne la met alors pas en cache long.
export async function getPhotoVariant(storage: Storage, location_id: string, dispositif_id: string, photo_id: string, variant: PhotoVariant): Promise<{ bytes: Buffer; contentType: string; variant: PhotoVariant }> {
  if (variant !== "full") {
    try {
      const [buf] = await storage.bucket(PHOTO_BUCKET).file(photoVariantPath(location_id, dispositif_id, photo_id, variant)).download();
      return { bytes: buf, contentType: photoVariantContentType(variant), variant };
    } catch (e: any) {
      if (Number(e?.code) !== 404) throw e;
    }
  }
  const full = await getPhotoObject(storage, photoObjectPath(location_id, dispositif_id, photo_id));
  return { bytes: full, contentType: photoVariantContentType("full"), variant: "full" };
}

// ── La LIGNE de la photo (table, lectures, compositions pures) vit dans dispositifPhotoRows.ts depuis
// le 13/09 — pour que l'historique du dispositif la lise sans charger sharp ni Storage. Réexportée ici :
// les appelants de ce foyer (route photos, tests, harnais) ne changent pas d'adresse. ──
export {
  PHOTO_TABLE, insertPhotoRow, listPhotoRows, latestPerComponent, listSiteItems, withConfirmedItems,
  photoApiUrl, photosParVersion, photosDuComposant,
} from "./dispositifPhotoRows";
export type { PhotoRow, LineagePhoto } from "./dispositifPhotoRows";
