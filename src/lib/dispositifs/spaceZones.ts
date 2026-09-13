// src/lib/dispositifs/spaceZones.ts — LES CONTOURS DES PÔLES SUR LE PLAN (docs/explorer-outil-spec.md § 9 incrément 8,
// § 10 décision 2 : « grain site × pôle, polygone en points du plan », 13/09).
//
// Un pôle a une ou plusieurs zones (Cuisine : deux polygones sur le plan d'Épices et Tout) : le grain est donc site ×
// pôle × polygone, chaque ligne portant les points du polygone (unités du plan, 1:100, `scale_pt_per_m`) et son aire.
// Table app-write `analytics.space_zones`, append-only (le patron de space_measures) : un relevé nouveau réécrit tous
// les polygones d'un pôle ; en vigueur = le dernier relevé (measured_at, puis created_at) par pôle. La table naît à la
// première écriture (le geste de report_documents). Côté PRODUCTEUR : écrire, et relire ce qu'on a écrit (le lecteur
// du plan coloré) ; la vue dbt `semantic.vw_insight_event_space_zones` (stg_space_zones) est livrée par PR pour les
// lecteurs autres que l'app.
import { randomUUID } from "node:crypto";

const PROJECT = "muse-square-open-data";
const DATASET = "analytics";
const TABLE = "space_zones";
export const ZONE_SOURCES = ["plan"] as const;
export type Point = [number, number];

export interface SpaceZoneRow {
  zone_id: string;
  location_id: string;
  dispositif_id: string;
  pole_label: string;
  polygon_index: number;
  area_m2: number;
  points_pt: string;          // JSON [[x, y], …] — unités du plan
  scale_pt_per_m: number;
  page_w_pt: number | null;
  page_h_pt: number | null;
  source: string;
  measured_at: string;        // AAAA-MM-JJ
  declarant_user_id: string | null;
  created_at: string;
}
export interface SpaceZone extends Omit<SpaceZoneRow, "points_pt"> { points: Point[] }

export const SCHEMA_FIELDS = [
  { name: "zone_id", type: "STRING", mode: "REQUIRED" },
  { name: "location_id", type: "STRING", mode: "REQUIRED" },
  { name: "dispositif_id", type: "STRING", mode: "REQUIRED" },
  { name: "pole_label", type: "STRING", mode: "REQUIRED" },
  { name: "polygon_index", type: "INT64", mode: "REQUIRED" },
  { name: "area_m2", type: "FLOAT64", mode: "REQUIRED" },
  { name: "points_pt", type: "STRING", mode: "REQUIRED" },
  { name: "scale_pt_per_m", type: "FLOAT64", mode: "REQUIRED" },
  { name: "page_w_pt", type: "FLOAT64", mode: "NULLABLE" },
  { name: "page_h_pt", type: "FLOAT64", mode: "NULLABLE" },
  { name: "source", type: "STRING", mode: "REQUIRED" },
  { name: "measured_at", type: "DATE", mode: "REQUIRED" },
  { name: "declarant_user_id", type: "STRING", mode: "NULLABLE" },
  { name: "created_at", type: "TIMESTAMP", mode: "REQUIRED" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isPoint = (p: unknown): p is Point => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v));

/** PUR : les lignes d'un relevé pour un pôle (tous ses polygones, dans l'ordre). */
export function newZoneRows(input: {
  location_id: string; dispositif_id: string; pole_label: string;
  polygons: Array<{ area_m2: number; points: Point[] }>;
  scale_pt_per_m: number; page_pt?: [number, number] | null; source?: string; measured_at: string; declarant_user_id?: string | null; now?: Date;
}): SpaceZoneRow[] {
  if (!input.location_id || !input.dispositif_id) throw new Error("zones : site et pôle requis");
  if (!ISO.test(input.measured_at)) throw new Error("zones : measured_at AAAA-MM-JJ");
  if (!(input.scale_pt_per_m > 0)) throw new Error("zones : échelle requise (points du plan par mètre)");
  if (!input.polygons.length) throw new Error("zones : au moins un polygone");
  const source = input.source ?? "plan";
  if (!(ZONE_SOURCES as readonly string[]).includes(source)) throw new Error("zones : source inconnue");
  const created_at = (input.now ?? new Date()).toISOString();
  return input.polygons.map((pg, i) => {
    if (!(pg.area_m2 > 0)) throw new Error(`zones : aire du polygone ${i} invalide`);
    if (!Array.isArray(pg.points) || pg.points.length < 3 || !pg.points.every(isPoint)) throw new Error(`zones : polygone ${i} — au moins trois points [x, y]`);
    return {
      zone_id: randomUUID(), location_id: input.location_id, dispositif_id: input.dispositif_id, pole_label: String(input.pole_label).trim().slice(0, 120),
      polygon_index: i, area_m2: Math.round(pg.area_m2 * 100) / 100, points_pt: JSON.stringify(pg.points.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])),
      scale_pt_per_m: input.scale_pt_per_m, page_w_pt: input.page_pt?.[0] ?? null, page_h_pt: input.page_pt?.[1] ?? null,
      source, measured_at: input.measured_at, declarant_user_id: input.declarant_user_id ?? null, created_at,
    };
  });
}

const isNotFound = (err: any): boolean => err?.code === 404 || String(err?.message || "").includes("Not found");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Insertion en flux ; la table naît à la première écriture, avec les reprises de report_documents (une table neuve refuse le flux > 30 s). */
export async function appendSpaceZones(bq: any, rows: SpaceZoneRow[], retries = 8, waitMs = 3000): Promise<void> {
  if (!rows.length) return;
  const table = bq.dataset(DATASET).table(TABLE);
  try { await table.insert(rows); return; } catch (err: any) { if (!isNotFound(err)) throw err; }
  await bq.dataset(DATASET).createTable(TABLE, { schema: { fields: SCHEMA_FIELDS } }).catch((e: any) => { if (!/Already Exists/i.test(String(e?.message || ""))) throw e; });
  for (let i = 0; ; i++) {
    try { await table.insert(rows); return; }
    catch (err: any) { if (!isNotFound(err) || i >= retries - 1) throw err; await sleep(waitMs * (i + 1)); }
  }
}

const flat = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);
function toZone(r: any): SpaceZone | null {
  let points: Point[];
  try { points = JSON.parse(String(flat(r.points_pt))); } catch { return null; }
  if (!Array.isArray(points) || points.length < 3 || !points.every(isPoint)) return null;
  return {
    zone_id: String(flat(r.zone_id)), location_id: String(flat(r.location_id)), dispositif_id: String(flat(r.dispositif_id)), pole_label: String(flat(r.pole_label)),
    polygon_index: Number(flat(r.polygon_index)), area_m2: Number(flat(r.area_m2)), points, scale_pt_per_m: Number(flat(r.scale_pt_per_m)),
    page_w_pt: flat(r.page_w_pt) == null ? null : Number(flat(r.page_w_pt)), page_h_pt: flat(r.page_h_pt) == null ? null : Number(flat(r.page_h_pt)),
    source: String(flat(r.source)), measured_at: String(flat(r.measured_at)), declarant_user_id: flat(r.declarant_user_id) == null ? null : String(flat(r.declarant_user_id)), created_at: String(flat(r.created_at)),
  };
}

/** Le journal d'un site — le producteur relit ce qu'il a écrit. Table absente = aucune zone. */
export async function listSpaceZones(bq: any, location_id: string): Promise<SpaceZone[]> {
  const [rows] = await bq.query({
    query: `SELECT zone_id, location_id, dispositif_id, pole_label, polygon_index, area_m2, points_pt, scale_pt_per_m, page_w_pt, page_h_pt, source,
                   CAST(measured_at AS STRING) AS measured_at, declarant_user_id, CAST(created_at AS STRING) AS created_at
            FROM \`${PROJECT}.${DATASET}.${TABLE}\` WHERE location_id = @location_id ORDER BY created_at, polygon_index`,
    params: { location_id }, location: "EU",
  }).catch((e: any) => { if (isNotFound(e)) return [[]]; throw e; });
  return (rows as any[]).map(toZone).filter((z): z is SpaceZone => !!z);
}

/** PUR — les zones EN VIGUEUR : par pôle, le dernier relevé (measured_at, puis created_at), tous ses polygones. */
export function currentZones(rows: SpaceZone[]): SpaceZone[] {
  const latest = new Map<string, string>();   // dispositif_id → clé du relevé en vigueur
  const key = (z: SpaceZone) => `${z.measured_at}|${z.created_at}`;
  for (const z of rows) { const k = latest.get(z.dispositif_id); if (!k || key(z) > k) latest.set(z.dispositif_id, key(z)); }
  return rows.filter((z) => latest.get(z.dispositif_id) === key(z)).sort((a, b) => a.pole_label.localeCompare(b.pole_label, "fr") || a.polygon_index - b.polygon_index);
}
